// T-6871 平台 UI 原语 DOM 构造助手（RZ-1，ADR 0079）：六态徽标 / kbd 芯片 /
// 分段控件 / 胶囊按钮的行为测试（jsdom，注入 document 的纯 DOM 模块）。
const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {
    PLATFORM_STATUS_STATES,
    normalizePlatformStatusState,
    createPlatformStatus,
    createPlatformKbd,
    createPlatformSegmented,
    createPlatformPillAction,
} = require("../src/platform-dom.js");

function withDom(fn) {
    const dom = new JSDOM("<!doctype html><body></body>");
    fn(dom.window.document, dom.window);
    dom.window.close();
}

test("platform status: six-state whitelist, invalid falls back to neutral (T-6871)", () => {
    assert.deepEqual([...PLATFORM_STATUS_STATES], ["ready", "loading", "stale", "dirty", "blocked", "error"]);
    assert.equal(normalizePlatformStatusState("stale"), "stale");
    assert.equal(normalizePlatformStatusState("hacked"), "", "非法状态必须回落中性，不得猜成 ready");
    withDom((doc) => {
        const stale = createPlatformStatus(doc, "stale", "缓存 · 3 分钟前");
        assert.equal(stale.tagName, "SPAN");
        assert.equal(stale.className, "sw-platform-status");
        assert.equal(stale.dataset.state, "stale");
        assert.equal(stale.textContent, "缓存 · 3 分钟前");
        const broken = createPlatformStatus(doc, "hacked", "?");
        assert.equal("state" in broken.dataset, false, "非法状态不得写出 data-state（样式按中性呈现）");
        assert.equal(broken.textContent, "?");
    });
});

test("platform kbd: renders bounded text content", () => {
    withDom((doc) => {
        const kbd = createPlatformKbd(doc, "1-9");
        assert.equal(kbd.className, "sw-platform-kbd");
        assert.equal(kbd.textContent, "1-9");
        assert.equal(createPlatformKbd(doc).textContent, "", "缺省文本产出空芯片不抛错");
    });
});

test("platform segmented: radiogroup semantics, active switching, single onChange", () => {
    withDom((doc) => {
        const changes = [];
        const seg = createPlatformSegmented(doc, {
            ariaLabel: "视图模式",
            active: "grid",
            items: [{value: "grid", label: "网格"}, {value: "", label: "无效项"}, {value: "list", label: "列表"}],
            onChange: (value) => changes.push(value),
        });
        assert.equal(seg.getAttribute("role"), "radiogroup");
        assert.equal(seg.getAttribute("aria-label"), "视图模式");
        const radios = seg.querySelectorAll("button");
        assert.equal(radios.length, 2, "空 value 项必须被剔除");
        const [grid, list] = radios;
        assert.equal(grid.dataset.value, "grid");
        assert.equal(grid.getAttribute("aria-checked"), "true");
        assert.equal(grid.classList.contains("is-active"), true);
        assert.equal(list.getAttribute("aria-checked"), "false");
        list.click();
        assert.equal(list.classList.contains("is-active"), true);
        assert.equal(list.getAttribute("aria-checked"), "true");
        assert.equal(grid.classList.contains("is-active"), false);
        assert.equal(grid.getAttribute("aria-checked"), "false");
        assert.deepEqual(changes, ["list"], "点击必须且只回调一次新值");
        list.click();
        assert.deepEqual(changes, ["list"], "同值重复点击不得重复回调");
    });
});

test("platform segmented: invalid active has no highlighted item (no guessing)", () => {
    withDom((doc) => {
        const seg = createPlatformSegmented(doc, {
            active: "bogus",
            items: [{value: "a", label: "A"}, {value: "b", label: "B"}],
        });
        seg.querySelectorAll("button").forEach((button) => {
            assert.equal(button.classList.contains("is-active"), false);
            assert.equal(button.getAttribute("aria-checked"), "false");
        });
    });
});

test("platform pill action: soft modifier, type=button, onClick wiring", () => {
    withDom((doc) => {
        let clicks = 0;
        const primary = createPlatformPillAction(doc, {label: "保存", onClick: () => { clicks += 1; }});
        assert.equal(primary.tagName, "BUTTON");
        assert.equal(primary.type, "button");
        assert.equal(primary.classList.contains("sw-platform-action--pill"), true);
        assert.equal(primary.classList.contains("sw-platform-action--soft"), false);
        primary.click();
        assert.equal(clicks, 1);
        const soft = createPlatformPillAction(doc, {label: "配置", soft: true});
        assert.equal(soft.classList.contains("sw-platform-action--soft"), true);
        const passive = createPlatformPillAction(doc, {label: "稍后"});
        assert.equal(passive.type, "button", "缺省 onClick 仍产出类型安全的按钮");
    });
});
