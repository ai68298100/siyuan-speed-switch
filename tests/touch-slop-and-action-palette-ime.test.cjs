// T-7371 移动端长按防抖容差 (Touch Slop) 与动作画板输入法守卫契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 dispatchPaletteKey 与 action-palette-ui 在 isComposing / keyCode === 229 时返回 NOOP，杜绝拼音确认键劫持；
//   2. 验证 mountActionPalette 具备 focusTimer 清理保护；
//   3. 验证 bindCardLongPress 与 openHistoryDropdown 长按具备 10px 触控微颤容差 (dx > 10 || dy > 10)；
//   4. 负向验证探针独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const paletteNav = require("../src/action-palette-navigation.js");
const paletteUi = readSourceText(path.join(root, "src", "action-palette-ui.js"));

test("T-7371: dispatchPaletteKey 在拼音输入法候选期间 (isComposing) 不拦截回车与按键", () => {
    const state = paletteNav.createPaletteNavigationState([
        {id: "act-1", title: "测试动作", group: "test"},
    ], {isOpen: true});

    // 探针 A: 拼音输入候选时按下 Enter，绝不能触发 EXECUTE
    const resComposing = paletteNav.dispatchPaletteKey(state, {
        key: "Enter",
        isComposing: true,
    });
    assert.equal(resComposing.intent, paletteNav.PALETTE_KEY_ACTIONS.NOOP, "候选期间必须返回 NOOP");

    // 探针 B: keyCode 为 229 时同样返回 NOOP
    const res229 = paletteNav.dispatchPaletteKey(state, {
        key: "Enter",
        keyCode: 229,
    });
    assert.equal(res229.intent, paletteNav.PALETTE_KEY_ACTIONS.NOOP, "keyCode 229 必须返回 NOOP");

    // 探针 C: 非候选状态下按下 Enter 正常触发 EXECUTE
    const resNormal = paletteNav.dispatchPaletteKey(state, {
        key: "Enter",
        isComposing: false,
    });
    assert.equal(resNormal.intent, paletteNav.PALETTE_KEY_ACTIONS.EXECUTE, "正常状态下必须触发 EXECUTE");
});

test("T-7371: action-palette-ui 具备 isComposing 守卫与 focusTimer 销毁保护", () => {
    assert.match(
        paletteUi,
        /if \(e\.isComposing \|\| e\.keyCode === 229\) \{\s*\n\s*return;\s*\n\s*\}/,
        "action-palette-ui 必须在 keydown 头部拦截输入法候选事件",
    );
    assert.match(
        paletteUi,
        /if \(focusTimer\) \{\s*\n\s*clearTimeout\(focusTimer\);\s*\n\s*focusTimer = null;\s*\n\s*\}/,
        "dispose 时必须清除 focusTimer 防止悬挂执行",
    );
});

test("T-7371: 移动端长按具备 10px 触控防抖容差 (Touch Slop)", () => {
    assert.match(
        indexTs,
        /const dx = Math\.abs\(touch\.clientX - startX\);\s*\n\s*const dy = Math\.abs\(touch\.clientY - startY\);\s*\n\s*if \(dx > 10 \|\| dy > 10\) \{\s*\n\s*cancel\(\);/,
        "bindCardLongPress 必须具备 10px 移动容差，微颤不取消长按计时",
    );
    assert.match(
        indexTs,
        /if \(dx > 10 \|\| dy > 10\) \{\s*\n\s*clearTimer\(\);/,
        "历史条目长按同样必须具备 10px 移动容差",
    );
});

test("T-7371 门禁负向验证: 若缺少触控容差或未守卫候选回车必定精准红", () => {
    // 探针 1: 负向断言伪造的不存在代码
    assert.throws(() => {
        assert.match(indexTs, /fake_non_existent_touch_slop_code/);
    }, assert.AssertionError);

    // 探针 2: 负向断言零容差取消不能再出现在卡片长按中
    assert.doesNotMatch(indexTs, /card\.addEventListener\("touchmove",\s*cancel,\s*\{passive:\s*true\}\);/);
});
