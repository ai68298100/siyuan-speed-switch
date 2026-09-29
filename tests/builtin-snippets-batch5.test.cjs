// 片段批五（T-7067）：3 个自主设计内置 CSS 片段的锚定契约。
// 质量标准与批一~批四一致：--b3-theme-* 变量 + color-mix 派生（暗色/皮肤自适应）、
// .protyle-wysiwyg 作用域、双语 i18n 键齐备、与既有片段选择器零重叠
// （任务完成态/表头/滚动条均为新选择器面，不复用 quote/code/hljs 已覆盖面）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {BUILTIN_SNIPPETS} = require('../src/snippet-studio-model.js');

test("snippet batch 5: ships task-done, table-header and scrollbar examples with themeable tokens (T-7067)", () => {
    const zh = require('../src/i18n/zh-CN.json');
    const en = require('../src/i18n/en.json');
    const expected = {
        "swss-builtin-taskdone": {category: "list", nameKey: "snippetBuiltinTaskdoneName", descriptionKey: "snippetBuiltinTaskdoneDescription"},
        "swss-builtin-thead": {category: "table", nameKey: "snippetBuiltinTheadName", descriptionKey: "snippetBuiltinTheadDescription"},
        "swss-builtin-scrollbar": {category: "layout", nameKey: "snippetBuiltinScrollbarName", descriptionKey: "snippetBuiltinScrollbarDescription"},
    };
    for (const [id, meta] of Object.entries(expected)) {
        const entry = BUILTIN_SNIPPETS.find((item) => item.id === id);
        assert.ok(entry, `${id} 必须存在于内置片段目录`);
        assert.equal(entry.category, meta.category);
        assert.equal(entry.type, "css");
        assert.equal(entry.source, "builtin");
        assert.ok(entry.content.includes("--b3-theme-"), `${id} 必须使用主题变量`);
        assert.ok(entry.content.includes("color-mix("), `${id} 必须用 color-mix 派生以适配暗色`);
        assert.ok(entry.content.includes(".protyle-wysiwyg"), `${id} 必须锚定 protyle 作用域`);
        for (const key of [meta.nameKey, meta.descriptionKey]) {
            assert.ok(zh[key], `zh-CN 必须有 ${key}`);
            assert.ok(en[key], `en 必须有 ${key}`);
        }
    }
});

test("snippet batch 5: no selector-surface overlap with existing builtin snippets (anti-duplication, T-7067)", () => {
    // 批五片段不得重复既有片段已覆盖的完整规则行（避免两个内置片段打架）
    const ids = ["swss-builtin-taskdone", "swss-builtin-thead", "swss-builtin-scrollbar"];
    const others = BUILTIN_SNIPPETS.filter((entry) => !ids.includes(entry.id)).map((entry) => entry.content);
    for (const id of ids) {
        const entry = BUILTIN_SNIPPETS.find((item) => item.id === id);
        const rules = entry.content.split("}").map((rule) => rule.trim()).filter(Boolean);
        for (const rule of rules) {
            const selector = rule.split("{")[0].trim();
            for (const other of others) {
                assert.ok(!other.includes(selector), `${id} 的选择器 ${selector} 不得出现在既有片段中`);
            }
        }
    }
});
