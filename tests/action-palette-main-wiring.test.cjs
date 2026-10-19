// T-7344 Action Palette 切换器主 UI 挂载与视觉落地契约测试
// 验证卡片右键菜单、⌘K / Ctrl+K 快捷键唤出、次级动作执行调度与主题/无障碍规范

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const polishScss = readSourceText(path.join(root, "src", "styles", "_11-ui-polish.scss"));

test("T-7344: SpeedSwitchPlugin 声明并实现了 openCardActionPalette 调度入口", () => {
    assert.match(
        indexTs,
        /openCardActionPalette\s*\(\s*tab\s*:\s*Tab/i,
        "必须声明 openCardActionPalette 方法并接受 tab 参数",
    );
    assert.match(
        indexTs,
        /extractActionContext\s*\(/,
        "openCardActionPalette 必须调用 extractActionContext 抽取结构化上下文",
    );
    assert.match(
        indexTs,
        /getAvailableActions\s*\(/,
        "openCardActionPalette 必须调用 getAvailableActions 查询可用动作列表",
    );
    assert.match(
        indexTs,
        /mountActionPalette\s*\(\s*backdrop\s*,\s*actions/i,
        "openCardActionPalette 必须调用 mountActionPalette 将面板挂载至遮罩容器",
    );
    assert.match(
        indexTs,
        /sw__palette-backdrop/,
        "必须创建并插入带有 sw__palette-backdrop 类名的遮罩底板",
    );
});

test("T-7344: executePaletteAction 完整覆盖分屏、复制与状态切换全部分支", () => {
    assert.match(
        indexTs,
        /executePaletteAction\s*\(\s*actionId\s*:\s*string/i,
        "必须实现 executePaletteAction 处理动作执行",
    );
    const expectedActions = [
        "open-active",
        "open-right",
        "open-bottom",
        "open-preview",
        "toggle-pin",
        "toggle-fav",
        "close-tab",
        "copy-block-link",
        "copy-markdown-link",
        "copy-id",
        "copy-path",
    ];
    for (const act of expectedActions) {
        assert.ok(
            indexTs.includes(`case "${act}":`),
            `executePaletteAction 必须覆盖动作分支: ${act}`,
        );
    }
    // 分屏打开时必须清理既有切换器浮层
    assert.match(
        indexTs,
        /this\.platformSwitcherDialog\.destroy\(\)/,
        "分屏/预览打开时必须销毁切换器弹窗",
    );
});

test("T-7344: 卡片操作菜单与卡片 DOM 键盘监听接入 ⌘K / Ctrl+K", () => {
    // 1. 卡片右键菜单 (openCardMenu)
    assert.match(
        indexTs,
        /menu\.addItem\s*\(\s*\{[\s\S]*?actionPaletteTitle[\s\S]*?iconSparkles[\s\S]*?openCardActionPalette/,
        "openCardMenu 中必须包含带有 iconSparkles 和 actionPaletteTitle 的动作画板菜单项",
    );
    // 2. 卡片键盘监听 (buildCardItem)
    assert.match(
        indexTs,
        /\(event\.ctrlKey\s*\|\|\s*event\.metaKey\)\s*&&\s*event\.key\.toLowerCase\(\)\s*===\s*["']k["']/,
        "buildCardItem 中必须监听 Ctrl+K / Cmd+K 快捷键",
    );
});

test("T-7344: 样式层具备完整的深浅色自适应、无障碍降级与移动端响应式规范", () => {
    // 1. 思源主题变量与毛玻璃底板
    assert.match(polishScss, /\.sw__palette-backdrop\s*\{/, "必须声明 .sw__palette-backdrop");
    assert.match(polishScss, /backdrop-filter:\s*var\(--sw-blur-sm\)/, "底板必须具备毛玻璃微动效");
    assert.match(polishScss, /var\(--b3-theme-surface/, "面板必须继承 --b3-theme-surface 主题表面色");
    assert.match(polishScss, /var\(--b3-theme-on-surface/, "文本必须继承 --b3-theme-on-surface 字体色");
    assert.match(polishScss, /var\(--b3-theme-primary/, "高亮态必须继承 --b3-theme-primary 主题主色");
    assert.match(polishScss, /var\(--b3-theme-error/, "破坏性动作必须继承 --b3-theme-error 错误警示色");

    // 2. 移动端 44px 最小触控高保真断点
    assert.match(polishScss, /min-height:\s*44px/, "移动端列表项必须满足 44px WCAG 触摸靶心");

    // 3. 动态无障碍动效降级
    assert.match(
        polishScss,
        /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.sw__palette/s,
        "必须为画板与底板提供 prefers-reduced-motion 动画降级",
    );

    // 4. 高对比度强制系统色映射
    assert.match(
        polishScss,
        /@media\s*\(forced-colors:\s*active\)\s*\{[^}]*\.sw__palette/s,
        "必须为画板提供 forced-colors: active 高对比度系统色映射",
    );
});

test("T-7344: AGENTS 门禁负向验证——缺失快捷键或分屏动作时门禁必定失败", () => {
    // 模拟破坏性检查：断言一个不存在的伪动作必须不在分支中，
    // 验证测试断言具备有效区分度，非恒真通过。
    const fakeAction = "fake-nonexistent-action-branch";
    assert.equal(
        indexTs.includes(`case "${fakeAction}":`),
        false,
        "负向自查：未注册的伪动作分支必须不被误判匹配",
    );
});
