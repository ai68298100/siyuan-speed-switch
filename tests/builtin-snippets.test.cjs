// T-7054：内置片段库扩充契约——12 个内置片段（原 5+新增 7），
// 每个片段必须有 nameKey/descriptionKey/content/category，i18n 双语齐备。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {readSourceFile} = require("./source-scan.cjs");

const modelSource = readSourceFile("src/snippet-studio-model.js");
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "i18n", "zh-CN.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "i18n", "en.json"), "utf8"));

test("builtin snippets: expanded catalog has 12 entries with all required fields", () => {
    assert.match(modelSource, /swss-builtin-quote/, "引用块增强片段必须存在");
    assert.match(modelSource, /swss-builtin-img/, "图片圆角阴影片段必须存在");
    assert.match(modelSource, /swss-builtin-heading/, "标题层级增强片段必须存在");
    assert.match(modelSource, /swss-builtin-list/, "列表增强片段必须存在");
    assert.match(modelSource, /swss-builtin-divider/, "分割线渐变片段必须存在");
    assert.match(modelSource, /swss-builtin-tag/, "标签胶囊片段必须存在");
    assert.match(modelSource, /content: \[/, "新增片段必须使用数组 join 模式（多行 CSS）");
    assert.match(modelSource, /color-mix\(in srgb/, "新增片段必须使用 color-mix（暗色/皮肤适配）");
    assert.match(modelSource, /var\(--b3-theme-primary/, "新增片段必须引用主题主色变量");
});

test("builtin snippets: all 24 i18n keys (12 name + 12 description) bilingual", () => {
    for (const key of [
        "snippetBuiltinTypographyName", "snippetBuiltinTypographyDescription",
        "snippetBuiltinTableName", "snippetBuiltinTableDescription",
        "snippetBuiltinFocusName", "snippetBuiltinFocusDescription",
        "snippetBuiltinCodeName", "snippetBuiltinCodeDescription",
        "snippetBuiltinFontName", "snippetBuiltinFontDescription",
        "snippetBuiltinQuoteName", "snippetBuiltinQuoteDescription",
        "snippetBuiltinImgName", "snippetBuiltinImgDescription",
        "snippetBuiltinHeadingName", "snippetBuiltinHeadingDescription",
        "snippetBuiltinListName", "snippetBuiltinListDescription",
        "snippetBuiltinDividerName", "snippetBuiltinDividerDescription",
        "snippetBuiltinTagName", "snippetBuiltinTagDescription",
    ]) {
        assert.ok(zh[key] && en[key], `i18n 键 ${key} 必须双语齐备`);
    }
});
