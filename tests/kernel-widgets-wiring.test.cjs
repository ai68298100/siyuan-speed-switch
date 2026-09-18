// T-6321~T-6328 接线契约：内核端点白名单双登记（Set + 字面量 switch）、
// 六个组件的 adapter/目录接线、顶栏右键菜单与命令面板命令（v3.8.3/3.8.4 新特性）。
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {readSourceText} = require('./source-scan.cjs');
const home = require('../src/home-model.js');

const indexSource = readSourceText(path.join(__dirname, '..', 'src', 'index.ts'));

const NEW_ENDPOINTS = [
    "/api/filetree/getPinnedDocs",
    "/api/inbox/getShorthands",
    "/api/block/getRecentUpdatedBlocks",
    "/api/asset/getMissingAssets",
    "/api/storage/getRecentDocs",
    "/api/storage/getCriteria",
];

test('every new kernel endpoint is registered in the whitelist set', () => {
    for (const endpoint of NEW_ENDPOINTS) {
        assert.ok(indexSource.includes(`"${endpoint}"`), `${endpoint} 必须出现在 KERNEL_ENDPOINTS`);
    }
});

test('every new kernel endpoint has a literal fetch dispatch case', () => {
    for (const endpoint of NEW_ENDPOINTS) {
        const pattern = new RegExp(`case "${endpoint.replace(/\//g, "\\/")}":\\s*response = await fetch\\("${endpoint.replace(/\//g, "\\/")}", init\\);`);
        assert.match(indexSource, pattern, `${endpoint} 必须有字面量分发分支（安全扫描要求）`);
    }
});

test('each kernel widget adapter calls its own endpoint and guards invalid payloads', () => {
    const widgets = [
        ["pinned-docs", "/api/filetree/getPinnedDocs", "invalid_pinned_docs"],
        ["inbox-shorthands", "/api/inbox/getShorthands", null],
        ["recent-updates", "/api/block/getRecentUpdatedBlocks", "invalid_recent_updates"],
        ["data-health", "/api/asset/getMissingAssets", "invalid_data_health"],
        ["host-recent-docs", "/api/storage/getRecentDocs", "invalid_host_recent_docs"],
        ["database-list", "/api/query/sql", "invalid_database_list"],
        ["saved-searches", "/api/storage/getCriteria", "invalid_saved_searches"],
    ];
    for (const [moduleId, endpoint, guard] of widgets) {
        const registration = indexSource.indexOf(`register("${moduleId}"`);
        assert.ok(registration > 0, `${moduleId} 适配器必须注册`);
        const window = indexSource.slice(registration, registration + 900);
        assert.ok(window.includes(endpoint), `${moduleId} 必须调用 ${endpoint}`);
        if (guard) assert.ok(window.includes(guard), `${moduleId} 必须有无效载荷守卫 ${guard}`);
    }
});

test('inbox adapter degrades to a configured empty hint instead of a failure state', () => {
    const registration = indexSource.indexOf('register("inbox-shorthands"');
    const window = indexSource.slice(registration, registration + 900);
    assert.match(window, /homeInboxUnavailable/, "云端失败必须归一为确定空态（不进失败退避）");
});

test('database list query only scans av blocks with a bounded limit', () => {
    const registration = indexSource.indexOf('register("database-list"');
    const window = indexSource.slice(registration, registration + 900);
    assert.match(window, /type = 'av'/);
    assert.match(window, /Math\.min\(64, Math\.max\(1,/);
    assert.match(window, /ORDER BY updated DESC LIMIT/);
});

test('catalog registers all six kernel widgets as read-only builtins', () => {
    const defs = home.registerModules([]);
    for (const [moduleId, minSizes] of [
        ["pinned-docs", 3], ["inbox-shorthands", 3], ["recent-updates", 3],
        ["data-health", 3], ["host-recent-docs", 3], ["database-list", 3],
    ]) {
        const def = defs.find((item) => item.moduleId === moduleId);
        assert.ok(def, `${moduleId} 目录条目存在`);
        assert.equal(def.readOnly, true);
        assert.ok(def.configSchema.length >= 1, `${moduleId} 必须有 limit 配置`);
    }
});

test('both top bar icons expose a right-click context menu (v3.8.4 addTopBar)', () => {
    const menus = indexSource.match(/contextMenu: \(menu\) =>/g) || [];
    assert.equal(menus.length, 2, "切换器与第二面板两个顶栏图标都要有右键菜单");
    const switcherAt = indexSource.indexOf('contextMenu: (menu) =>');
    const switcherWindow = indexSource.slice(switcherAt, switcherAt + 500);
    assert.match(switcherWindow, /openSetting/);
    assert.match(switcherWindow, /openSecondPanel\.call\(this\)/);
});

test('command palette exposes settings and journal commands through the safe guard', () => {
    assert.match(indexSource, /langKey: "openSettings"/);
    assert.match(indexSource, /langKey: "openJournal"/);
});

test('new command and widget i18n keys exist in both languages', () => {
    const zh = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'), 'utf8'));
    const en = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'en.json'), 'utf8'));
    const keys = [
        "openSettings", "openJournal",
        "homePinnedDocs", "homeDescPinnedDocs", "homePinnedDocsEmpty",
        "homeInbox", "homeDescInbox", "homeInboxEmpty", "homeInboxUnavailable",
        "homeRecentUpdates", "homeDescRecentUpdates", "homeRecentUpdatesEmpty",
        "homeDataHealth", "homeDescDataHealth", "homeDataHealthEmpty", "homeDataHealthStat",
        "homeHostRecent", "homeDescHostRecent", "homeHostRecentEmpty",
        "homeDatabaseList", "homeDescDatabaseList", "homeDatabaseListEmpty",
        "homeSavedSearches", "homeDescSavedSearches", "homeSavedSearchesEmpty", "homeSavedSearchesStat",
        "homeCriteriaMethod0", "homeCriteriaMethod1", "homeCriteriaMethod2", "homeCriteriaMethod3", "homeCriteriaMethod4",
    ];
    for (const key of keys) {
        assert.ok(zh[key] && zh[key].length > 0, `zh-CN 缺少 ${key}`);
        assert.ok(en[key] && en[key].length > 0, `en 缺少 ${key}`);
    }
});
