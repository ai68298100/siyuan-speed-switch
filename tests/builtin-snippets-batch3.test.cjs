// 片段批三（T-7065）：4 个自主设计内置 CSS 片段的锚定契约。
// 质量标准与批一/批二一致：--b3-theme-primary 变量 + color-mix 派生（暗色/皮肤自适应）、
// .protyle-wysiwyg 作用域、双语 i18n 键齐备、类别筛选下拉补全 8 个真实类别。
const test = require('node:test');
const assert = require('node:assert/strict');
const {BUILTIN_SNIPPETS} = require('../src/snippet-studio-model.js');

test("snippet batch 3: ships inline-code, link, task and zebra examples with themeable tokens (T-7065)", () => {
    const zh = require('../src/i18n/zh-CN.json');
    const en = require('../src/i18n/en.json');
    const expected = {
        "swss-builtin-inlinecode": {category: "code", nameKey: "snippetBuiltinInlinecodeName", descriptionKey: "snippetBuiltinInlinecodeDescription"},
        "swss-builtin-link": {category: "typography", nameKey: "snippetBuiltinLinkName", descriptionKey: "snippetBuiltinLinkDescription"},
        "swss-builtin-task": {category: "list", nameKey: "snippetBuiltinTaskName", descriptionKey: "snippetBuiltinTaskDescription"},
        "swss-builtin-zebra": {category: "table", nameKey: "snippetBuiltinZebraName", descriptionKey: "snippetBuiltinZebraDescription"},
    };
    for (const [id, meta] of Object.entries(expected)) {
        const entry = BUILTIN_SNIPPETS.find((item) => item.id === id);
        assert.ok(entry, `${id} 必须存在于内置片段目录`);
        assert.equal(entry.category, meta.category);
        assert.equal(entry.type, "css");
        assert.equal(entry.source, "builtin");
        assert.ok(entry.content.includes("--b3-theme-primary"), `${id} 必须使用主题主色变量`);
        assert.ok(entry.content.includes("color-mix("), `${id} 必须用 color-mix 派生以适配暗色`);
        assert.ok(entry.content.includes(".protyle-wysiwyg"), `${id} 必须锚定 protyle 作用域`);
        for (const key of [meta.nameKey, meta.descriptionKey]) {
            assert.ok(zh[key], `zh-CN 必须有 ${key}`);
            assert.ok(en[key], `en 必须有 ${key}`);
        }
    }
});

test("snippet batch 3: every builtin category is offered by the picker category filter (anti-drift, T-7065)", () => {
    const fs = require("node:fs");
    const ui = fs.readFileSync(require("node:path").join(__dirname, "../src/snippet-studio-ui.js"), "utf8");
    const selectLine = ui.split("\n").find((line) => line.includes('select("snippetCategory"'));
    assert.ok(selectLine, "类别筛选下拉必须存在");
    const categories = [...new Set(BUILTIN_SNIPPETS.map((entry) => entry.category))];
    for (const category of categories) {
        assert.ok(selectLine.includes(`["${category}", "snippetCategory`), `下拉必须提供类别选项 ${category}`);
    }
    const en = require('../src/i18n/en.json');
    const zh = require('../src/i18n/zh-CN.json');
    for (const category of categories) {
        const key = `snippetCategory${category[0].toUpperCase()}${category.slice(1)}`;
        assert.ok(zh[key] && en[key], `类别 ${category} 必须有双语标签 ${key}`);
    }
});
