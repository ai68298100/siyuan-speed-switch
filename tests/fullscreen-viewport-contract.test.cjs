// T-7140：全屏表面必须跟随动态可视视口，避免移动浏览器工具栏/软键盘
// 出现时仍按布局视口（100vh）计算而遮住底部控件。保留 100vh 作为旧
// WebView 回退，动态单位必须排在回退之后。
const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceText} = require("./source-scan.cjs");
const {declaresIn} = require("./css-block-scan.cjs");

const indexSource = readSourceText("src/index.ts");
const settingsCss = readSourceText("src/styles/_05-settings-widgets.scss");
const storeCss = readSourceText("src/styles/_06-widgets-store.scss");
const studioCss = readSourceText("src/styles/_snippet-studio.scss");

test("switcher fullscreen toggle uses the dynamic viewport height", () => {
    assert.match(indexSource, /container\.style\.height = "100dvh"/);
});

test("fullscreen surface styles keep a 100vh fallback before 100dvh", () => {
    const rules = [
        [settingsCss, ".b3-dialog__container.sw-dialog--fullscreen"],
        [settingsCss, ".b3-dialog__container.sw-platform-dialog--workbench.sw-dialog--fullscreen"],
        [storeCss, ".b3-dialog__container.sw-home-store-dialog.sw-dialog--fullscreen"],
        [studioCss, ".b3-dialog__container.sw-dialog--snippet-studio.sw-dialog--fullscreen"],
    ];
    for (const [css, selector] of rules) {
        assert.ok(declaresIn(css, selector, /height:\s*100vh\s*!important/), `${selector} must retain the legacy fallback above inline sizing`);
        assert.ok(declaresIn(css, selector, /height:\s*100dvh\s*!important/), `${selector} must follow the dynamic viewport above inline sizing`);
    }
});
