const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// T-6796/T-6797/T-6798（ADR 0073）：每套皮肤的文字/底色组合必须过 WCAG AA。
// 从构建产物 dist/index.css 中解析皮肤作用域内的 --b3-* 变量，按 T-6697 的
// 分级口径断言：正文 ≥4.5:1；次要文字/强调色/徽章 ≥3:1。
// dist 不存在时跳过（与 release-quality 尺寸门禁同一策略：CI 先构建后测试）。

const ROOT = path.resolve(__dirname, "..");
const CSS_PATH = path.join(ROOT, "dist", "index.css");
const SKINS = ["apple", "midnight", "paper"];

function parseColor(raw) {
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    let match = value.match(/^#([0-9a-f]{6})$/i);
    if (match) {
        const int = parseInt(match[1], 16);
        return {r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255, a: 1};
    }
    match = value.match(/^#([0-9a-f]{3})$/i);
    if (match) {
        const chars = match[1].split("");
        return {r: parseInt(chars[0] + chars[0], 16), g: parseInt(chars[1] + chars[1], 16), b: parseInt(chars[2] + chars[2], 16), a: 1};
    }
    match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s]+([\d.]+))?\s*\)$/i);
    if (match) {
        return {r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4])};
    }
    return null;
}

function compositeOver(foreground, backdrop) {
    const alpha = foreground.a;
    if (alpha >= 1) return foreground;
    return {
        r: foreground.r * alpha + backdrop.r * (1 - alpha),
        g: foreground.g * alpha + backdrop.g * (1 - alpha),
        b: foreground.b * alpha + backdrop.b * (1 - alpha),
        a: 1,
    };
}

function luminance(color) {
    const channel = (value) => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrastRatio(backdropColor, foregroundColor) {
    const backdropLum = luminance(backdropColor);
    const foreLum = luminance(foregroundColor);
    const lighter = Math.max(backdropLum, foreLum);
    const darker = Math.min(backdropLum, foreLum);
    return (lighter + 0.05) / (darker + 0.05);
}

function extractSkinVars(css, skin) {
    // cssnano 会剥掉属性选择器的引号（data-sw-skin=apple）
    const marker = `data-sw-skin=${skin}`;
    const vars = {};
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let match = ruleRe.exec(css);
    while (match !== null) {
        if (match[1].includes(marker)) {
            const body = match[2];
            for (const decl of body.split(";")) {
                const pair = decl.split(":");
                if (pair.length === 2 && pair[0].trim().startsWith("--b3-theme-")) {
                    vars[pair[0].trim()] = pair[1].trim();
                }
            }
        }
        match = ruleRe.exec(css);
    }
    return vars;
}

for (const skin of SKINS) {
    test(`skin contrast (WCAG AA): ${skin} text and accent pairs meet their tiers`, () => {
        if (!fs.existsSync(CSS_PATH)) {
            t.skip("dist/index.css not built yet");
            return;
        }
        const css = fs.readFileSync(CSS_PATH, "utf8");
        const vars = extractSkinVars(css, skin);
        const required = ["background", "on-background", "surface", "on-surface", "primary", "on-primary", "on-surface-light"];
        for (const key of required) {
            assert.ok(parseColor(vars[`--b3-theme-${key}`]), `${skin}: --b3-theme-${key} must be a parseable color`);
        }
        const background = parseColor(vars["--b3-theme-background"]);
        const surface = compositeOver(parseColor(vars["--b3-theme-surface"]), background);
        const onBackground = parseColor(vars["--b3-theme-on-background"]);
        const onSurface = compositeOver(parseColor(vars["--b3-theme-on-surface"]), background);
        const onSurfaceLight = compositeOver(parseColor(vars["--b3-theme-on-surface-light"]), background);
        const primary = parseColor(vars["--b3-theme-primary"]);
        const onPrimary = compositeOver(parseColor(vars["--b3-theme-on-primary"]), primary);
        // 正文级 ≥4.5
        assert.ok(contrastRatio(background, onBackground) >= 4.5, `${skin}: body text contrast >= 4.5`);
        assert.ok(contrastRatio(surface, onSurface) >= 4.5, `${skin}: card text contrast >= 4.5`);
        // 次要文字/强调色/徽章 ≥3（T-6697 同款分级）
        assert.ok(contrastRatio(background, onSurfaceLight) >= 3, `${skin}: secondary text contrast >= 3`);
        assert.ok(contrastRatio(background, primary) >= 3, `${skin}: accent contrast >= 3`);
        assert.ok(contrastRatio(primary, onPrimary) >= 3, `${skin}: filled control label contrast >= 3`);
    });
}
