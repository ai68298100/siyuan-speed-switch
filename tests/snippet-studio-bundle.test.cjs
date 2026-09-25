const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {readSourceText} = require("./source-scan.cjs");
const webpackConfig = require("../webpack.config.js");
const {listZipEntryNames} = require("./host/lib/zip.cjs");

const root = path.resolve(__dirname, "..");

test("snippet studio lazy chunk has a stable published path and runtime base", () => {
    const config = webpackConfig({}, {mode: "production"});
    assert.equal(config.output.chunkFilename, "dist/snippet-studio.js");

    const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin.json"), "utf8"));
    assert.ok(manifest.publish?.resources?.includes("dist/snippet-studio.js"));

    const entrySource = readSourceText(path.join(root, "src", "index.ts"));
    assert.match(entrySource, /__webpack_public_path__/);
    assert.match(entrySource, /document\.currentScript/);
    const e2eInstaller = fs.readFileSync(path.join(root, "scripts", "e2e", "lib.mjs"), "utf8");
    assert.match(e2eInstaller, /lazyChunk/);
    assert.match(e2eInstaller, /path\.join\(lazyDir, "snippet-studio\.js"\)/);

    const bundle = path.join(root, "dist", "index.js");
    if (fs.existsSync(bundle)) {
        const source = fs.readFileSync(bundle, "utf8");
        assert.match(source, /dist\/snippet-studio\.js/);
        assert.match(source, /replace\(\/\[\^\/\]\*\$\//);
    }

    const zip = path.join(root, "package.zip");
    if (fs.existsSync(zip)) {
        assert.ok(listZipEntryNames(fs.readFileSync(zip)).includes("dist/snippet-studio.js"));
    }
});

test("E2E plugin installation mirrors the published lazy chunk layout", async () => {
    const distChunk = path.join(root, "dist", "snippet-studio.js");
    if (!fs.existsSync(distChunk)) return;
    const {installPlugin} = await import(pathToFileURL(path.join(root, "scripts", "e2e", "lib.mjs")).href);
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "swss-snippet-layout-"));
    try {
        const {target} = installPlugin(workspace, root);
        assert.ok(fs.existsSync(path.join(target, "index.js")));
        assert.ok(fs.existsSync(path.join(target, "dist", "snippet-studio.js")));
        assert.equal(fs.existsSync(path.join(target, "snippet-studio.js")), false);
    } finally {
        fs.rmSync(workspace, {recursive: true, force: true});
    }
});
