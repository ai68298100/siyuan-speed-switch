// T-6967 S1：组件商店主从结构契约（定稿原型 store-redesign-2026-09-27）。
// 主从骨架 / 目录行化（列表行零按钮）/ chips 收敛六枚 / 详情窗格唯一主色 /
// Ctrl+B 批量底栏 / 移动端底部 sheet。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile, readStyleSource} = require('./source-scan.cjs');

const ui = readSourceFile('src/home-store-ui.ts');
const scss = readStyleSource('src/styles/_08-home-store-cards.scss');

test('layout: dialog skeleton carries catalog + detail panes', () => {
    assert.match(ui, /sw-home-store__layout"><div class="sw-home-store__catalog"><\/div><aside class="sw-home-store__detail/,
        '对话框内容必须装配主从骨架（左目录 + 右详情）');
    assert.match(ui, /const catalogPane = root\.querySelector<HTMLElement>\("\.sw-home-store__catalog"\)/);
    assert.match(ui, /const detailPane = root\.querySelector<HTMLElement>\("\.sw-home-store__detail"\)/);
    assert.match(ui, /catalogPane\.appendChild\(storeFragment\)/, '目录内容挂进左窗格');
});

test('catalog rows carry zero buttons: action zones are display:none in catalog scope', () => {
    assert.match(scss, /\.sw-home-store__catalog \.sw-home-store__card \.sw-home-store__select,[\s\S]*?\.sw-home-store__catalog \.sw-home-store__card \.sw-home-store__sizes \{\s*\n\s*display: none;/,
        '选择钮/支持面/来源 chips/预览/尺寸瓦片必须在目录窗格收起（G3 行内零按钮）');
    assert.match(scss, /\.sw-home-store__catalog \.sw-home-store__card \{\s*\n\s*cursor: pointer;/, '目录行可点击');
});

test('chips: exactly six source filters remain', () => {
    const block = ui.slice(ui.indexOf('const tabs: Array<'), ui.indexOf('tabs.forEach'));
    const keys = block.match(/key: "/g) || [];
    assert.equal(keys.length, 6, 'chips 恰为六枚（全部/内置/外部API/本机服务/需安装/已添加）');
    for (const required of ['"all"', '"builtin"', '"network"', '"local"', '"requires"', '"added"']) {
        assert.ok(block.includes(`key: ${required}`), `chips 必须含 ${required}`);
    }
    assert.ok(!block.includes('"recommended"'), '推荐/可配置等旧页签不再占筛选位');
});

test('detail pane: selected module renders a full card with suffixed ids', () => {
    assert.match(ui, /const buildReadyCard = \(moduleId: string, def: any, variant: "catalog" \| "detail" = "catalog"\) => \{/,
        '卡片构建必须支持目录/详情双变体');
    assert.match(ui, /const idSuffix = variant === "detail" \? "-detail" : "";/, '详情卡 id 必须加后缀避免 aria 引用冲突');
    assert.match(ui, /buildReadyCard\(storeSelectedModule, detailDef, "detail"\)/, '详情窗格以 detail 变体渲染选中组件');
    assert.match(ui, /storeSelectedModule = ready\[0\]\?\.moduleId \|\| "";/, '详情默认选中首个就绪组件');
    assert.match(ui, /sw-home-store__detail-note/, '详情窗格给「添加后」说明');
});

test('batch mode: Ctrl+B toggles a persistent bottom bar with add/cancel', () => {
    assert.match(ui, /const onStoreKeydown = \(event: KeyboardEvent\) => \{/, 'Ctrl+B 处理器必须注册');
    assert.match(ui, /event\.key !== "b" && event\.key !== "B"/, '快捷键为 Ctrl/Cmd+B');
    assert.match(ui, /sw-home-store__batch-bar/, '批量模式底栏');
    assert.match(ui, /sw-home-store__batch-add/, '批量添加动作');
    assert.match(ui, /root\.removeEventListener\("keydown", onStoreKeydown\);/, '销毁必须卸载快捷键监听');
    assert.match(ui, /addModuleWithPreferredSize\(moduleId, def\)/, '批量添加走默认档入面板');
    assert.match(scss, /\.sw-home-store\[data-batch-mode="true"\] \.sw-home-store__catalog \.sw-home-store__card \.sw-home-store__select \{\s*\n\s*display: inline-flex;/,
        '批量模式恢复行内选择钮（普通模式行内零按钮）');
});

test('mobile: detail becomes a bottom sheet gated by data-detail-open', () => {
    assert.match(scss, /\.sw-home-store\[data-device="mobile"\] \.sw-home-store__layout \{\s*\n\s*grid-template-columns: minmax\(0, 1fr\);/,
        '移动端单列列表');
    assert.match(scss, /\.sw-home-store\[data-device="mobile"\] \.sw-home-store__detail \{[\s\S]*?border-radius: 16px 16px 0 0;[\s\S]*?display: none;/s,
        '移动端详情默认收起为底部 sheet');
    assert.match(scss, /\.sw-home-store\[data-device="mobile"\]\[data-detail-open="true"\] \.sw-home-store__detail \{\s*\n\s*display: block;/,
        '行点击后 sheet 展开');
    assert.match(ui, /if \(device === "mobile"\) root\.dataset\.detailOpen = "true";/, '目录行点击带出 sheet');
    assert.match(ui, /sw-home-store__sheet-back/, 'sheet 必须有返回列表出口');
});

test('styles: master-detail grid with scroll containment per pane', () => {
    assert.match(scss, /\.sw-home-store__layout \{\s*\n\s*flex: 1 1 auto;\s*\n\s*min-height: 0;\s*\n\s*display: grid;\s*\n\s*grid-template-columns: minmax\(300px, 400px\) minmax\(0, 1fr\);/,
        '桌面双栏：左目录 300-400px + 右详情自适应');
    assert.match(scss, /\.sw-home-store__catalog \{\s*\n\s*min-height: 0;\s*\n\s*overflow: auto;/, '目录窗格独立滚动');
    assert.match(scss, /\.sw-home-store__catalog \.sw-home-store__card \.sw-home-store__status\.is-added::before \{\s*\n\s*content: "✓ ";/, '已添加行以 ✓ 表达');
});
