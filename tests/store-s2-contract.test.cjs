// T-6967 S2：组件商店余项契约——筛选一条化（排序收进 chips 行尾）、详情窗格
// 元信息四行明文（数据来源/刷新/隐私/缓存）、目录级失败横幅、心跳族唯一登记处。
// 注意：readSourceFile 已剥注释，"把调用写进注释"无法骗过本契约。
// SCSS 断言使用块级 declaresIn（G6 中性化另见 store-preview-disclosure-contract）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');
const {declaresIn} = require('./css-block-scan.cjs');

const storeUi = readSourceFile('src/home-store-ui.ts');
const css = readSourceFile('src/index.scss');
const base = {topLevel: true};

test('sort menu joins the filter row tail (T-6967 S2)', () => {
    // 排序不再挂在搜索行内；筛选行 = tablist + 排序，且排序在 tab 之后追加。
    assert.doesNotMatch(storeUi, /searchBar\.appendChild\(sortSelect\)/, '排序不得再挂回搜索行');
    assert.match(storeUi, /const filterBar = document\.createElement\("div"\);\s*\n\s*filterBar\.className = "sw-home-store__filter-bar";/);
    const filterIndex = storeUi.indexOf('filterBar.appendChild(tabBar);');
    const sortIndex = storeUi.indexOf('filterBar.appendChild(sortSelect);');
    assert.ok(filterIndex >= 0 && sortIndex > filterIndex, '排序必须追加在 chips（tablist）之后');
    // 排序事件链保持：变更 → 归一 → 落设置 → 重绘。
    assert.match(storeUi, /sortSelect\.addEventListener\("change", \(\) => \{ storeSort = normalizeHomeStoreSort\(sortSelect\.value\); persistStoreState\(\); renderStore\(\); \}\)/);
});

test('detail pane meta is four plain rows sourced from pure models (T-6967 S2)', () => {
    // 四行 = 数据来源/刷新/隐私/缓存，全部 dt/dd 文本节点，零 HTML 拼接。
    for (const key of ['homeStoreMetaSource', 'homeStoreMetaRefresh', 'homeStoreMetaPrivacy', 'homeStoreMetaCache']) {
        assert.match(storeUi, new RegExp(`this\\.i18n\\.${key}`), `详情元信息必须包含 ${key} 行`);
    }
    assert.match(storeUi, /document\.createElement\("dt"\);\s*\n\s*term\.textContent = label;/, '行标签必须是文本节点');
    assert.match(storeUi, /desc\.textContent = value;/, '行值必须是文本节点（远端来源名不进 HTML）');
    // 刷新行走共享心跳族登记处；缓存行只陈述框架级保证，不编造 TTL 数字。
    assert.match(storeUi, /isLifeHeartbeatModule\(moduleId\) \? this\.i18n\.homeStoreRefreshHeartbeat : this\.i18n\.homeStoreRefreshManual/);
    assert.match(storeUi, /externalInfo\?\.integration === "http" \|\| externalInfo\?\.integration === "local-bridge"/);
    assert.match(storeUi, /homeStoreCacheBounded/);
    // 四行明文只进详情窗格（目录行变体不再重复输出来源/联网/隐私 chips）。
    assert.match(storeUi, /if \(variant === "catalog"\) \{\s*\n\s*if \(externalInfo\) \{/, '来源/联网/隐私 chips 必须限定目录行变体');
    assert.match(storeUi, /detailPane\.appendChild\(buildDetailMeta\(storeSelectedModule, detailDef\)\);/, '详情窗格必须挂载四行元信息');
});

test('heartbeat family has a single registration point (T-6967 S2)', () => {
    // 登记处落 home-model：两个消费方（second-panel-ui / home-store-ui）都已依赖它，
    // 不为 11 个 id 把 46 KB 的 external-widget-model 目录模块拉进主包（包体自律）。
    const homeModel = readSourceFile('src/home-model.js');
    assert.match(homeModel, /const LIFE_HEARTBEAT_MODULE_IDS = Object\.freeze\(\[/);
    assert.match(homeModel, /function isLifeHeartbeatModule\(moduleId\) \{\s*\n\s*return LIFE_HEARTBEAT_MODULE_IDS\.includes/);
    assert.doesNotMatch(storeUi, /new Set\(\["external-weather-open-meteo"/, '商店侧不得再内联心跳族副本');
    assert.doesNotMatch(storeUi, /external-widget-model/, '商店不得引入 46 KB 目录模块（包体自律）');
});

test('detail meta and catalog banner styles are scoped (T-6967 S2)', () => {
    assert.ok(declaresIn(css, '.sw-home-store__detail-meta-row', /grid-template-columns: 64px minmax\(0, 1fr\)/, base),
        '四行明文必须是 dt 定宽左列的行结构');
    assert.ok(declaresIn(css, '.sw-home-store__detail-meta-row dd', /overflow-wrap: anywhere/, base),
        '来源名可能很长，值列必须可换行');
    assert.ok(declaresIn(css, '.sw-home-store__catalog-fail', /border-radius: 12px/, base),
        '目录失败横幅必须有独立卡片边界');
    assert.ok(declaresIn(css, '.sw-home-store__filter-bar', /align-items: flex-end/, base),
        '筛选行必须以 chips 行基线对齐排序菜单');
});
