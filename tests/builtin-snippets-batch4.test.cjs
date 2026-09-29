// 片段批四（T-7066）：3 个自主设计内置 CSS 片段的锚定契约。
// 质量标准与批一~批三一致：--b3-theme-* 变量 + color-mix 派生（暗色/皮肤自适应）、
// .protyle-wysiwyg 作用域、双语 i18n 键齐备。批四全部为 protyle 内元素，
// 不触碰页签等宿主 chrome 选择器（契约边界留待 ADR，见续跑口令备忘）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {BUILTIN_SNIPPETS} = require('../src/snippet-studio-model.js');

test("snippet batch 4: ships mark, kbd and image-zoom examples with themeable tokens (T-7066)", () => {
    const zh = require('../src/i18n/zh-CN.json');
    const en = require('../src/i18n/en.json');
    const expected = {
        "swss-builtin-mark": {category: "typography", nameKey: "snippetBuiltinMarkName", descriptionKey: "snippetBuiltinMarkDescription"},
        "swss-builtin-kbd": {category: "code", nameKey: "snippetBuiltinKbdName", descriptionKey: "snippetBuiltinKbdDescription"},
        "swss-builtin-imgzoom": {category: "image", nameKey: "snippetBuiltinImgzoomName", descriptionKey: "snippetBuiltinImgzoomDescription"},
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
