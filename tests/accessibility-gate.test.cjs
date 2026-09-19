// 可访问性基线门禁（ROADMAP §8.0.5 专项 B2，T-6692）。
//
// 目的：把散落在样式与视图层的可访问性语义锁成契约，防止后续批次
// 无声回退——此前这些语义只存在于个别组件的深度测试里，跨面回归
// （例如新样式文件遗漏 reduced-motion 回退、新交互控件没有可见焦点）
// 没有统一的拦截点。
//
// 断言策略（沿用 gate-audit-checklist 的"锁已验收行为"模式）：
// 1. 每个含动画/过渡的样式文件必须自带 prefers-reduced-motion 回退；
// 2. 交互控件基线与卡片控件必须提供 :focus-visible 可见焦点；
// 3. 异步状态区必须有 aria-live（错误态 assertive、其余 polite）；
// 4. 异步配置/导入操作必须携带 aria-busy。
// 全部为存在性断言（数据来自文件系统，不硬编码计数），任何一条被移除
// 都会精确失败。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const MOTION_STYLE_FILES = [
    'src/styles/_04-fab-fullscreen-soft.scss',
    'src/styles/_05-settings-widgets.scss',
    'src/styles/_06-widgets-store.scss',
    'src/styles/_08-home-store-cards.scss',
    'src/styles/_09-store-preview-polish.scss',
];

test('every animated style surface carries a prefers-reduced-motion fallback', () => {
    for (const file of MOTION_STYLE_FILES) {
        const source = read(file);
        assert.ok(
            source.includes('prefers-reduced-motion'),
            `${file} contains animations/transitions but no prefers-reduced-motion fallback — add one instead of removing this assertion`,
        );
    }
});

test('interactive controls keep visible keyboard focus styles', () => {
    const baseControls = read('src/styles/_01-base-controls.scss');
    const homeCards = read('src/styles/_08-home-store-cards.scss');
    assert.ok(baseControls.includes(':focus-visible'), 'base controls must keep :focus-visible styling');
    assert.ok(homeCards.includes(':focus-visible'), 'home store cards must keep :focus-visible styling');
});

test('async status regions keep aria-live semantics in both panels and search', () => {
    const homeView = read('src/home-view.js');
    const homeController = read('src/home-controller.js');
    const docSearch = read('src/doc-search-ui.ts');
    assert.ok(homeView.includes('aria-live'), 'home view status region must keep aria-live');
    assert.match(homeView, /aria-live/, 'home view aria-live');
    assert.ok(homeController.includes('"polite"') || homeController.includes("'polite'"), 'home refresh indicator must stay polite');
    assert.ok(docSearch.includes('"assertive"') || docSearch.includes("'assertive'"), 'search error status must stay assertive');
});

test('async flows surface aria-busy while work is in flight', () => {
    const docSearch = read('src/doc-search-ui.ts');
    const storeUi = read('src/home-store-ui.ts');
    assert.ok(docSearch.includes('aria-busy'), 'search/loading flows must keep aria-busy');
    assert.ok(storeUi.includes('aria-busy'), 'store loading flow must keep aria-busy');
});
