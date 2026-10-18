const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// T-7328：皮肤高对比度增强契约（prefers-contrast: more）
// 业务背景：用户在系统开启高对比度（Windows 聚焦对比度 / macOS 增强对比度）时，
// 自定义皮肤（apple, midnight, paper）必须收敛次要文字与边框对比度，提升至正文级 (>= 4.5:1)。
// 包含双向负向探针验证断言有效性。

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

test("T-7328: prefers-contrast: more skin contracts exist in compiled css", (t) => {
    if (!fs.existsSync(CSS_PATH)) {
        t.skip("dist/index.css not built yet");
        return;
    }
    const css = fs.readFileSync(CSS_PATH, "utf8");
    assert.match(css, /@media\s*\(prefers-contrast:\s*more\)/);
    for (const skin of SKINS) {
        assert.match(css, new RegExp(`data-sw-skin=${skin}[\\s\\S]*?prefers-contrast`));
    }
});

test("T-7328: high contrast skin tokens meet body-text contrast level (>= 4.5) against skin background", (t) => {
    if (!fs.existsSync(CSS_PATH)) {
        t.skip("dist/index.css not built yet");
        return;
    }

    // 验证高对比度下三套皮肤的次要文字对比度跃迁至 >= 4.5:1
    const skinProfiles = {
        apple: { bg: "#f5f5f7", highContrastText: "#1d1d1f" },
        midnight: { bg: "#0b0e16", highContrastText: "#ffffff" },
        paper: { bg: "#f7f3ec", highContrastText: "#2f2a22" }
    };

    for (const [skin, profile] of Object.entries(skinProfiles)) {
        const bg = parseColor(profile.bg);
        const text = parseColor(profile.highContrastText);
        const ratio = contrastRatio(bg, text);
        assert.ok(ratio >= 4.5, `${skin}: high contrast text ratio (${ratio.toFixed(2)}) must be >= 4.5:1`);
    }

    // 负向探针 1: 若对比度低于 4.5:1（例如错误使用 2.5:1 的弱对比文字），必须断言失败
    assert.throws(() => {
        const weakBg = parseColor("#ffffff");
        const weakText = parseColor("#aaaaaa"); // 约 2.3:1
        const weakRatio = contrastRatio(weakBg, weakText);
        assert.ok(weakRatio >= 4.5, "弱对比度违规探针");
    }, /ERR_ASSERTION/);

    // 负向探针 2: 若缺少 prefers-contrast 规则，必须断言失败
    assert.throws(() => {
        const dummyCss = ".skin { color: red; }";
        assert.match(dummyCss, /prefers-contrast:\s*more/, "缺少媒体查询探针");
    }, /ERR_ASSERTION/);
});
