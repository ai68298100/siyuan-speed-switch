// T-7054：内置片段库扩充第二批契约——原 11+新增 6=17 个内置片段
const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceFile} = require("./source-scan.cjs");

const modelSource = readSourceFile("src/snippet-studio-model.js");

test("builtin snippets batch 2: six new snippets exist", () => {
    for (const id of ["swss-builtin-eyecare", "swss-builtin-lineheight", "swss-builtin-hicon",
        "swss-builtin-cardpara", "swss-builtin-code_theme"]) {
        assert.match(modelSource, new RegExp(id.replace(/-/g, "\\-")), `${id} 必须存在`);
    }
    assert.match(modelSource, /snippetBuiltinEyecareName/, "护眼模式 i18n key 必须存在");
    assert.match(modelSource, /snippetBuiltinLineheightName/, "行距增强 i18n key 必须存在");
    assert.match(modelSource, /snippetBuiltinHiconName/, "标题图标 i18n key 必须存在");
    assert.match(modelSource, /snippetBuiltinCardparaName/, "卡片段落 i18n key 必须存在");
    assert.match(modelSource, /snippetBuiltinCodeThemeName/, "代码主题 i18n key 必须存在");
});
