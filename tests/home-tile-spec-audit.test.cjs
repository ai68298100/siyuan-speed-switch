const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const home = require("../src/home-model.js");

const DESIGN_DIR = path.join(__dirname, "..", "docs", "design");
const SIZE_KEYS = ["xs", "small", "medium", "tall", "wide", "large", "full"];
const SIZE_ALIASES = {S: "small", M: "medium", T: "tall", W: "wide", L: "large", X: "full"};
const SPEC_FILES = fs.readdirSync(DESIGN_DIR)
    .filter((file) => file.startsWith("component-specs-") && file.endsWith(".html"))
    .sort();

function stripTags(value) {
    return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseSizes(value) {
    const sizes = [];
    for (const match of value.matchAll(/\b(xs|small|medium|tall|wide|large|full|S|M|T|W|L|X)\b/gi)) {
        const token = match[1];
        const size = SIZE_KEYS.includes(token.toLowerCase()) ? token.toLowerCase() : SIZE_ALIASES[token.toUpperCase()];
        if (size && !sizes.includes(size)) sizes.push(size);
    }
    return sizes;
}

function parseMaterial(value) {
    return value.split(/[（(]/, 1)[0].trim();
}

function parseSpecCards() {
    const specs = [];
    for (const file of SPEC_FILES) {
        const source = fs.readFileSync(path.join(DESIGN_DIR, file), "utf8");
        if (file === "component-specs-01-clocks.html" || file === "component-specs-08-navigation.html") {
            const rows = source.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
            for (const row of rows) {
                const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripTags(match[1]));
                const idMatch = cells[0]?.match(/[（(]([a-z][a-z0-9-]+)[）)]/i);
                if (!idMatch) continue;
                specs.push({file, moduleId: idMatch[1], material: parseMaterial(cells[1]), defaultSize: parseSizes(cells[2])[0] || "", supported: parseSizes(cells[3] || "")});
            }
            continue;
        }
        if (file === "component-specs-09-longtail.html") {
            const cards = [...source.matchAll(/<h4>[\s\S]*?<span class="tag">([^<]+)<\/span>[\s\S]*?<p><b>moduleId<\/b>：([^<]+)<\/p>/gi)];
            for (const card of cards) {
                const [material, defaultSize] = card[1].split("·").map((part) => part.trim());
                specs.push({file, moduleId: card[2].trim(), material: parseMaterial(material), defaultSize: parseSizes(defaultSize)[0] || "", supported: []});
            }
            continue;
        }
        const cards = source.match(/<section class="spec-card">[\s\S]*?<\/section>/gi) || [];
        for (const card of cards) {
            const tagMatch = card.match(/<h3>[\s\S]*?<span class="tag">([^<]+)<\/span>/i);
            const detailMatch = card.match(/<div class="k">moduleId[^<]*<\/div><div class="v">([^<]+)/i);
            if (!tagMatch || !detailMatch) continue;
            const idMatch = detailMatch[1].match(/^([a-z][a-z0-9-]+)/i);
            const sizeMatch = detailMatch[1].match(/sizes\s*=\s*\[([^\]]+)\]/i);
            if (!idMatch) continue;
            const [material, defaultSize] = tagMatch[1].split("·").map((part) => part.trim());
            specs.push({file, moduleId: idMatch[1], material: parseMaterial(material), defaultSize: parseSizes(defaultSize)[0] || "", supported: parseSizes(sizeMatch ? sizeMatch[1] : "")});
        }
    }
    return specs;
}

const specs = parseSpecCards();
const definitions = new Map(home.registerModules([]).map((definition) => [definition.moduleId, definition]));
const specsById = new Map(specs.map((spec) => [spec.moduleId, spec]));

test("component spec cards cover the production module catalog exactly", () => {
    assert.equal(SPEC_FILES.length, 9);
    assert.equal(specs.length, 58);
    assert.equal(specsById.size, specs.length, "spec card moduleIds must be unique");
    assert.deepEqual([...specsById.keys()].filter((moduleId) => !definitions.has(moduleId)), []);
    assert.deepEqual([...definitions.keys()].filter((moduleId) => !specsById.has(moduleId)), []);
});

test("component spec material and default size declarations resolve in production", () => {
    for (const spec of specs) {
        const definition = definitions.get(spec.moduleId);
        assert.ok(definition, `${spec.moduleId} must have a production definition`);
        assert.ok(["plain", "accent", "dark", "vibrant"].includes(spec.material), `${spec.moduleId} has a valid material`);
        assert.equal(home.resolveHomeTileMaterial(spec.moduleId), spec.material, `${spec.moduleId} material must match its spec card`);
        assert.ok(spec.defaultSize, `${spec.moduleId} must declare a default size`);
        assert.ok(definition.sizes.includes(spec.defaultSize), `${spec.moduleId} spec default must be supported by production`);
        assert.equal(home.resolveHomeTileDefaultSize(spec.moduleId, definition.sizes, "medium"), spec.defaultSize,
            `${spec.moduleId} production default must match its spec card`);
    }
});

test("component spec supported sizes are available in production", () => {
    for (const spec of specs) {
        const definition = definitions.get(spec.moduleId);
        for (const size of spec.supported) assert.ok(definition.sizes.includes(size), `${spec.moduleId} must support ${size}`);
    }
});

test("material and default size catalogs stay bounded to known modules", () => {
    assert.ok(Object.keys(home.HOME_TILE_MATERIALS).length > 0);
    assert.ok(Object.keys(home.HOME_TILE_DEFAULT_SIZES).length > 0);
    for (const [moduleId, material] of Object.entries(home.HOME_TILE_MATERIALS)) {
        assert.ok(definitions.has(moduleId), `${moduleId} material declaration must name a production module`);
        assert.ok(["dark", "accent", "vibrant"].includes(material), `${moduleId} material must use a non-fallback material`);
    }
    for (const [moduleId, defaultSize] of Object.entries(home.HOME_TILE_DEFAULT_SIZES)) {
        assert.ok(definitions.has(moduleId), `${moduleId} default size declaration must name a production module`);
        assert.ok(SIZE_KEYS.includes(defaultSize), `${moduleId} default size must use the seven-size vocabulary`);
        assert.ok(definitions.get(moduleId).sizes.includes(defaultSize), `${moduleId} default size must be supported`);
    }
});

test("layout normalization preserves every production size", () => {
    for (const size of SIZE_KEYS) assert.equal(home.normalizeLayout({size}).size, size, `${size} must survive persistence normalization`);
    assert.equal(home.normalizeLayout({size: "unknown"}).size, "");
});

