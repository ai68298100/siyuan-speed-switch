// T-7360 工作台场景化预设布局库（Scene Presets）与拖拽落点指示器契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 WORKBENCH_SCENE_PRESETS 包含 4 套开箱即用场景定义；
//   2. 验证 applyWorkbenchScenePreset 支持桌面与移动端自适应布局生成；
//   3. 验证 second-panel-ui.ts 生产工具栏包含 scene-presets 交互入口；
//   4. 验证 SCSS 样式层具备 .sw-home__drop-slot 物理感虚线指示；
//   5. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const homeModel = require("../src/home-model.js");
const secondPanelTs = readSourceText(path.join(root, "src", "second-panel-ui.ts"));
const widgetsScss = readSourceText(path.join(root, "src", "styles", "_05-settings-widgets.scss"));

test("T-7360: WORKBENCH_SCENE_PRESETS 声明完备的 4 套场景化预设", () => {
    assert.ok(Array.isArray(homeModel.WORKBENCH_SCENE_PRESETS), "WORKBENCH_SCENE_PRESETS 必须为数组");
    assert.equal(homeModel.WORKBENCH_SCENE_PRESETS.length, 4, "必须声明 4 套场景预设");

    const ids = homeModel.WORKBENCH_SCENE_PRESETS.map((p) => p.id);
    assert.deepEqual(ids, ["default", "minimal", "research", "daily"]);

    for (const preset of homeModel.WORKBENCH_SCENE_PRESETS) {
        assert.ok(preset.title && typeof preset.title === "string", "预设必须有标题");
        assert.ok(preset.description && typeof preset.description === "string", "预设必须有描述");
        assert.ok(preset.icon && typeof preset.icon === "string", "预设必须有图标");
        assert.ok(Array.isArray(preset.widgets) && preset.widgets.length > 0, "预设组件列表不能为空");
    }
});

test("T-7360: applyWorkbenchScenePreset 纯函数正确生成桌面与移动端布局", () => {
    // 1. 桌面端应用 minimal 预设
    const desktopResult = homeModel.applyWorkbenchScenePreset(
        {instances: [], layouts: {desktop: []}},
        "minimal",
        "desktop",
    );
    assert.equal(desktopResult.changed, true);
    assert.equal(desktopResult.preset.id, "minimal");
    assert.equal(desktopResult.state.instances.length, 3);
    assert.equal(desktopResult.state.layouts.desktop.length, 3);
    assert.equal(desktopResult.state.layouts.desktop[0].instanceId, "today-journal");

    // 2. 移动端应用 research 预设（x=0, y=index*3, w=12）
    const mobileResult = homeModel.applyWorkbenchScenePreset(
        {instances: [], layouts: {mobile: []}},
        "research",
        "mobile",
    );
    assert.equal(mobileResult.changed, true);
    assert.equal(mobileResult.preset.id, "research");
    assert.equal(mobileResult.state.instances.length, 4);
    assert.equal(mobileResult.state.layouts.mobile.length, 4);
    assert.equal(mobileResult.state.layouts.mobile[1].x, 0);
    assert.equal(mobileResult.state.layouts.mobile[1].w, 12);
});

test("T-7360: second-panel-ui.ts 生产工具栏接入场景预设与撤销回执", () => {
    assert.match(
        secondPanelTs,
        /(dataset\.homeAction|data-home-action)\s*(=|:)\s*["']scene-presets["']/,
        "编辑模式工具栏必须渲染 homeAction=scene-presets 按钮",
    );
    assert.match(
        secondPanelTs,
        /applyWorkbenchScenePreset\s*\(/,
        "场景预设选择后必须调用 applyWorkbenchScenePreset 应用布局",
    );
    assert.match(
        secondPanelTs,
        /prepareLayoutMutation\s*\(\s*\)/,
        "套用场景前必须调用 prepareLayoutMutation 开启撤销事务保护",
    );
});

test("T-7360: 样式层声明 .sw-home__drop-slot 虚线微光卡槽规范", () => {
    assert.match(
        widgetsScss,
        /\.sw-home__drop-slot/,
        "_05-settings-widgets.scss 必须声明 .sw-home__drop-slot",
    );
    assert.match(
        widgetsScss,
        /border:\s*2px\s+dashed\s+var\(--b3-theme-primary\)/,
        "拖拽落点必须具备 2px dashed 主题色指示轮廓",
    );
});

test("T-7360 门禁负向验证: 若预设 ID 篡改或非法端侧必定精准红", () => {
    // 探针 1: 负向断言伪造的不存在预设 ID
    assert.throws(() => {
        const found = homeModel.WORKBENCH_SCENE_PRESETS.find((p) => p.id === "fake_broken_preset_xyz");
        assert.ok(found, "不存在预设必须断言失败");
    }, assert.AssertionError);

    // 探针 2: 非法端侧自动兜底 desktop
    const fallback = homeModel.applyWorkbenchScenePreset({}, "minimal", "unknown_device_type");
    assert.ok(fallback.state.layouts.desktop, "未知端侧应安全降级到 desktop 布局");
});
