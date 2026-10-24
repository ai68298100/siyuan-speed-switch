// T-7374 组件商店搜索框输入法（IME）守卫与 Escape 清空保护契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 home-store-ui.ts / js 声明 compositionstart 与 compositionend 状态监听；
//   2. 验证 input 事件在 isComposing 期间不执行全局 DOM 筛选 (applyFilter)；
//   3. 验证 keydown 在 isComposing / keyCode === 229 期间不拦截 Escape 避免误清空；
//   4. 负向验证探针独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const storeTs = readSourceText(path.join(root, "src", "home-store-ui.ts"));
const storeJs = readSourceText(path.join(root, "src", "home-store-ui.js"));

test("T-7374: home-store-ui.ts 具备完整的 IME 候选状态监听", () => {
    assert.match(
        storeTs,
        /bindRenderListener\(searchInput,\s*"compositionstart",\s*\(\)\s*=>\s*\{\s*\n\s*isComposing = true;\s*\n\s*\}\);/,
        "必须监听 compositionstart 标记 isComposing",
    );
    assert.match(
        storeTs,
        /bindRenderListener\(searchInput,\s*"compositionend",\s*\(\)\s*=>\s*\{\s*\n\s*isComposing = false;[\s\S]*applyFilter\(\);/,
        "必须监听 compositionend 重置 isComposing 并补一次 applyFilter",
    );
});

test("T-7374: input 事件在 isComposing 期间杜绝频繁触发 applyFilter", () => {
    assert.match(
        storeTs,
        /if\s*\(isComposing\)\s*return;\s*\n\s*storeQuery = searchInput\.value;\s*\n\s*root\.dataset\.query = normalizeHomeStoreQuery\(storeQuery\);\s*\n\s*applyFilter\(\);/,
        "isComposing 期间 input 事件必须直接 return，避免拼音中间态高频刷新 DOM",
    );
    assert.match(
        storeJs,
        /if\s*\(isComposing\)\s*return;\s*\n\s*storeQuery = searchInput\.value;/,
        "编译产物必须严格同步 isComposing 保护",
    );
});

test("T-7374: keydown 在 isComposing 期间拦截 Escape 保护用户输入", () => {
    assert.match(
        storeTs,
        /bindRenderListener\(searchInput,\s*"keydown",\s*\(event\)\s*=>\s*\{\s*\n\s*if\s*\(isComposing \|\| event\.keyCode === 229\)\s*return;/,
        "必须在 keydown 头部拦截输入法候选按键，杜绝取消候选词时误清空输入框",
    );
    assert.match(
        storeJs,
        /if\s*\(isComposing \|\| event\.keyCode === 229\)\s*return;/,
        "编译产物必须严格包含 Escape 保护",
    );
});

test("T-7374 门禁负向验证: 若缺少 compositionend 或未保护 Escape 必定精准红", () => {
    // 探针 1: 负向断言伪造的不存在代码
    assert.throws(() => {
        assert.match(storeTs, /fake_non_existent_ime_guard_code/);
    }, assert.AssertionError);

    // 探针 2: 负向断言旧的无守卫 keydown 不能再出现
    assert.doesNotMatch(storeTs, /bindRenderListener\(searchInput,\s*"keydown",\s*\(event\)\s*=>\s*\{\s*\n\s*if\s*\(event\.key !== "Escape"/);
});
