// T-7028：三面板及其嵌套浮层的关闭装配契约。
// 这些断言读取真实生产源码，锁住关闭入口、脏稿守卫和销毁/焦点收尾；
// 负向验证由本轮门禁审查按同一违规注入执行。
const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceFile} = require("./source-scan.cjs");

const indexSource = readSourceFile("src/index.ts");
const mobileSource = readSourceFile("src/mobile-switcher-ui.ts");
const secondPanelSource = readSourceFile("src/second-panel-ui.ts");
const storeSource = readSourceFile("src/home-store-ui.ts");
const studioSource = readSourceFile("src/snippet-studio-ui.js");

function mustInclude(source, fragment, message) {
    assert.ok(source.includes(fragment), message);
}

test("mobile surface chrome owns a visible close callback", () => {
    mustInclude(mobileSource,
        "this.mountPlatformChrome(mobileBody, {",
        "移动切换器必须装配平台表面头部");
    mustInclude(mobileSource,
        "onNavigate: navigatePlatformSurface,\n                onClose: () => dialog.destroy(),\n                closeLabel: this.i18n.close,",
        "移动切换器必须把统一关闭按钮接到当前 Dialog");
});

test("desktop switcher and workbench close through their owning dialogs", () => {
    mustInclude(indexSource, "surface: \"switcher\",", "桌面切换器必须装配平台表面头部");
    mustInclude(indexSource, "onClose: () => dialog.destroy(),", "桌面切换器关闭按钮必须销毁自身 Dialog");
    mustInclude(secondPanelSource, "surface: \"workbench\",", "工作台必须装配平台表面头部");
    mustInclude(secondPanelSource, "onClose: () => dialog.destroy(),", "工作台关闭按钮必须销毁自身 Dialog");
});

test("snippet studio protects host initiated close with the dirty draft guard", () => {
    mustInclude(indexSource,
        "onClose: (guarded = false) => {\n                        if (!guarded && holder.controller && !holder.controller.canClose()) return;\n                        dialog.destroy();\n                    },",
        "片段实验室宿主关闭必须先经过 controller.canClose");
    mustInclude(studioSource,
        "onClose: () => {\n                guardLeave(() => platform.onClose?.(true));\n            },",
        "片段实验室右上角关闭必须经过 guardLeave");
    mustInclude(studioSource, "canClose: () => {", "片段实验室必须暴露同步关闭判定");
    mustInclude(studioSource,
        "if (busy) return false;\n            if (!dirty()) return true;",
        "片段实验室必须同步阻止忙碌或脏稿关闭");
});

test("settings and store dialogs release resources and restore the opener", () => {
    mustInclude(indexSource,
        "destroyCallback: () => {\n                releaseSettingsDialog();\n                releaseSettingsFab();\n                releaseSettingsListeners();",
        "设置 Dialog 销毁必须释放监听和 FAB 挂起");
    mustInclude(storeSource, "destroyCallback: () => disposeStore(),", "商店 Dialog 销毁必须走统一释放入口");
    mustInclude(storeSource, "if (opener?.isConnected) opener.focus();", "商店关闭后必须把焦点还给打开它的控件");
});

test("nested mobile and studio overlays close locally before their owner", () => {
    mustInclude(mobileSource,
        "const closeSortOverlay = () => {\n            activeSortOverlay?.remove();\n            activeSortOverlay = null;\n        };",
        "移动排序 sheet 必须先局部关闭");
    mustInclude(mobileSource,
        "if (event.key !== \"Escape\" || !activeSortOverlay) return;",
        "移动排序 sheet 必须监听 Escape");
    mustInclude(mobileSource, "closeSortOverlay();", "移动排序 sheet 的 Escape 不得直接关闭宿主");
    mustInclude(studioSource,
        "function closePicker() {\n        pickerRelease();\n        pickerRelease = () => {};\n        pickerRefresh = null;\n        picker?.remove();",
        "片段目录浮层必须释放自身捕获监听再移除");
});
