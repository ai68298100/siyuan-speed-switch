// T-6321~T-6328 接线契约：内核端点白名单双登记（Set + 字面量 switch）、
// 六个组件的 adapter/目录接线、顶栏右键菜单与命令面板命令（v3.8.3/3.8.4 新特性）。
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {readSourceText} = require('./source-scan.cjs');
const home = require('../src/home-model.js');

const indexSource = readSourceText(path.join(__dirname, '..', 'src', 'index.ts'));
const configFormSource = readSourceText(path.join(__dirname, '..', 'src', 'home-config-form.ts'));

const NEW_ENDPOINTS = [
    "/api/filetree/getPinnedDocs",
    "/api/inbox/getShorthands",
    "/api/block/getRecentUpdatedBlocks",
    "/api/asset/getMissingAssets",
    "/api/storage/getRecentDocs",
    "/api/storage/getCriteria",
    "/api/av/renderAttributeView",
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
        ["recent-documents", "/api/storage/getRecentDocs", null],
        ["database-list", "/api/query/sql", "invalid_database_list"],
        ["saved-searches", "/api/storage/getCriteria", "invalid_saved_searches"],
        ["database-table", "/api/av/renderAttributeView", null],
    ];
    for (const [moduleId, endpoint, guard] of widgets) {
        const registration = indexSource.indexOf(`register("${moduleId}"`);
        assert.ok(registration > 0, `${moduleId} 适配器必须注册`);
        const window = indexSource.slice(registration, registration + 1800);
        assert.ok(window.includes(endpoint), `${moduleId} 必须调用 ${endpoint}`);
        if (guard) assert.ok(window.includes(guard), `${moduleId} 必须有无效载荷守卫 ${guard}`);
    }
});

test('inbox adapter degrades to a configured empty hint instead of a failure state', () => {
    const registration = indexSource.indexOf('register("inbox-shorthands"');
    const window = indexSource.slice(registration, registration + 900);
    assert.match(window, /homeInboxUnavailable/, "云端失败必须归一为确定空态（不进失败退避）");
    assert.match(window, /normalizeInboxConfig\(config\)/);
    assert.match(window, /\{page: normalized\.page\}/, "必须把组件页码传给官方分页参数");
    assert.match(window, /cacheTtlMs: 30000/, "云端收集箱应合并短时间内的重复读取");
});

test('capture, reservations, and plugin commands use bounded models and interaction guards', () => {
    const capture = indexSource.slice(indexSource.indexOf('private openQuickCapture'), indexSource.indexOf('private async openJournal'));
    const reservations = indexSource.slice(indexSource.indexOf('register("today-reservations"'), indexSource.indexOf('register("quick-capture"'));
    const commands = indexSource.slice(indexSource.indexOf('register("plugin-commands"'), indexSource.indexOf('register("pinned-docs"'));
    assert.match(capture, /if \(saving\) return/);
    assert.match(capture, /event\.ctrlKey \|\| event\.metaKey/);
    assert.match(capture, /normalizeAgentNotebookId\(preferredNotebook\)/);
    assert.match(indexSource, /parseQuickCaptureAction\(value\)/);
    assert.match(reservations, /buildTodayReservationsSnapshot\(/);
    assert.match(reservations, /LIMIT 48/);
    assert.match(reservations, /cacheTtlMs: 1000/);
    assert.match(commands, /buildPluginCommandsSnapshot\(/);
});

test('database list query applies bounded filters, sorting, total count, and a short cache', () => {
    const registration = indexSource.indexOf('register("database-list"');
    const window = indexSource.slice(registration, registration + 1800);
    assert.match(window, /type = 'av'/);
    assert.match(window, /normalizeDatabaseListConfig\(config\)/);
    assert.match(window, /buildNotebookBoxScope\(normalized\.notebook\)/);
    assert.match(window, /content LIKE/);
    assert.match(window, /COUNT\(\*\) OVER\(\) AS total_count/);
    assert.match(window, /ORDER BY \$\{orderBy\} LIMIT \$\{normalized\.limit\}/);
    assert.match(window, /timeoutMs: 1200, cacheTtlMs: 1000/);
});

test('four list widgets expose deep projection controls and bounded refresh policies', () => {
    const modules = new Map(home.registerModules([]).map((item) => [item.moduleId, item]));
    assert.deepEqual(modules.get('recent-updates').configSchema.map((field) => field.key),
        ['limit', 'groupByDocument', 'showPath', 'showUpdated', 'showRank']);
    assert.deepEqual(modules.get('database-list').configSchema.map((field) => field.key),
        ['limit', 'notebook', 'query', 'sortBy', 'showPath', 'showUpdated', 'showRank']);
    assert.deepEqual(modules.get('saved-searches').configSchema.map((field) => field.key),
        ['limit', 'query', 'method', 'sortBy', 'showKeyword', 'showMethod', 'showScope', 'showRank']);
    assert.deepEqual(modules.get('recent-edits').configSchema.map((field) => field.key),
        ['limit', 'notebook', 'days', 'query', 'showPath', 'showUpdated', 'showRank']);
    for (const [moduleId, cache] of [['recent-updates', 1000], ['database-list', 1000], ['saved-searches', 2000], ['recent-edits', 1000]]) {
        const registration = indexSource.indexOf(`register("${moduleId}"`);
        const window = indexSource.slice(registration, registration + 2200);
        assert.match(window, new RegExp(`cacheTtlMs: ${cache}`), `${moduleId} 使用预期短缓存`);
    }
});

test('recent edits applies a validated time and notebook window with accurate totals', () => {
    const registration = indexSource.indexOf('register("recent-edits"');
    const window = indexSource.slice(registration, registration + 1800);
    assert.match(window, /normalizeRecentEditsConfig\(config\)/);
    assert.match(window, /taskWindowStart\(normalized\.days\)/);
    assert.match(window, /buildNotebookBoxScope\(normalized\.notebook\)/);
    assert.match(window, /COUNT\(\*\) OVER\(\) AS total_count/);
    assert.match(window, /buildRecentEditsSnapshot/);
    assert.match(window, /invalid_recent_edits/);
});

test('recent documents use the official host history endpoint', () => {
    const registration = indexSource.indexOf('register("recent-documents"');
    assert.ok(registration > 0);
    const window = indexSource.slice(registration, registration + 900);
    assert.match(window, /\/api\/storage\/getRecentDocs/);
    assert.match(window, /stat: this\.i18n\.homeUnitDocs/);
    assert.match(window, /timeoutMs: 1200, cacheTtlMs: 1000/);
    assert.equal(indexSource.includes('register("host-recent-docs"'), false, "重复的最近文档 adapter 必须退役");
});

test('database table config exposes database, columns, labels, and row controls', () => {
    const database = home.registerModules([]).find((item) => item.moduleId === 'database-table');
    assert.equal(database.configSchema[0].type, 'database');
    assert.equal(database.configSchema[1].type, 'database-columns');
    assert.equal(database.configSchema.find((field) => field.key === 'showColumnNames').defaults, '是');
    assert.equal(database.configSchema.find((field) => field.key === 'showRank').defaults, '否');
    assert.match(indexSource, /loadHomeDatabaseOptions/);
    assert.match(indexSource, /loadHomeDatabaseColumns/);
});

test('database search terms cannot overwrite the selected database id', () => {
    const databaseField = configFormSource.slice(configFormSource.indexOf('field.type === "database"'), configFormSource.indexOf('field.type === "database-columns"'));
    assert.match(databaseField, /draft\[field\.key\] = item\.id/);
    assert.doesNotMatch(databaseField, /input\.addEventListener\("input", \(\) => \{\s*draft\[field\.key\] = input\.value/,
        '搜索词不能在未选择时覆盖已绑定的数据库 ID');
    assert.match(databaseField, /homeAvTableClear/);
    assert.match(configFormSource, /selected\.size >= 3/);
});

test('database table refresh uses the bounded one-second cache policy', () => {
    const registration = indexSource.indexOf('register("database-table"');
    assert.ok(registration > 0);
    const window = indexSource.slice(registration, registration + 1700);
    assert.match(window, /homeAvTableRows/);
    assert.match(window, /timeoutMs: 1500, cacheTtlMs: 1000/);
});

test('switcher exposes manual refresh and clamps newly rendered oversized icons', () => {
    assert.match(indexSource, /sw__refresh-btn/);
    assert.match(indexSource, /new MutationObserver\(clampIcons\)/);
    assert.match(indexSource, /clampOversizedIcons\(dialog\.element\)/);
});

test('all switcher toolbars use native titles instead of clipping pseudo tooltips', () => {
    const filterButtons = indexSource.match(/class="sw__search-filter-btn"[^>]+title=/g) || [];
    assert.equal(filterButtons.length, 3, "桌面、移动和侧栏筛选按钮都应使用原生 title");
    assert.doesNotMatch(indexSource, /sw__search-filter-btn[^"\n]*b3-tooltips/);
    assert.doesNotMatch(indexSource, /sw__settings-btn[^"\n]*b3-tooltips/);
});

test('persistent sidebar clamps icons after host DOM mutations and releases observers', () => {
    assert.match(indexSource, /this\.observeSidebarIcons\(element\)/);
    assert.match(indexSource, /this\.sidebarIconObserver = typeof MutationObserver === "function"/);
    assert.match(indexSource, /clampOversizedIcons\(element\)/);
    assert.match(indexSource, /this\.sidebarIconObserver\?\.disconnect\(\)/);
    assert.match(indexSource, /this\.sidebarIconFrameCancel\?\.\(\)/);
});

test('component panel clamps dynamically rendered oversized icons', () => {
    const panel = readSourceText(path.join(__dirname, '..', 'src', 'second-panel-ui.ts'));
    assert.match(panel, /import \{clampOversizedIcons\} from "\.\/util"/);
    assert.match(panel, /new MutationObserver\(scheduleIconClamp\)/);
    assert.match(panel, /clampOversizedIcons\(root\)/);
    assert.match(panel, /iconObserver\?\.disconnect\(\)/);
});

test('random review scopes SQL to descendants and reports the bounded candidate set', () => {
    const registration = indexSource.indexOf('register("random-review"');
    const window = indexSource.slice(registration, registration + 1800);
    assert.match(window, /parentDocument/);
    assert.match(window, /path LIKE/);
    assert.match(window, /COUNT\(\*\) OVER\(\) AS total_count/);
    assert.match(window, /LIMIT \$\{normalized\.limit\}/);
});

test('random review refresh keeps a short stable batch cache', () => {
    const registration = indexSource.indexOf('register("random-review"');
    const window = indexSource.slice(registration, registration + 1800);
    assert.match(window, /timeoutMs: 1500, cacheTtlMs: 15000/);
});

test('document config searches the workspace without persisting raw search text', () => {
    const documentField = configFormSource.slice(configFormSource.indexOf('field.type === "document"'), configFormSource.indexOf('field.type === "database"'));
    assert.match(indexSource, /loadHomeDocumentOptions\(query = ""\)/);
    assert.match(indexSource, /content LIKE/);
    assert.match(indexSource, /hpath LIKE/);
    assert.match(documentField, /this\.loadHomeDocumentOptions\(query\)/);
    assert.match(documentField, /draft\[field\.key\] = item\.id/);
    assert.doesNotMatch(documentField, /input\.addEventListener\("input", \(\) => \{\s*draft\[field\.key\] = input\.value/);
});

test('document and database pickers surface bounded truncation without fabricating options', () => {
    const documentLoader = indexSource.slice(indexSource.indexOf('public async loadHomeDocumentOptions'), indexSource.indexOf('public async loadHomeDatabaseColumns'));
    assert.match(documentLoader, /items\.truncated = payload\.truncated/);
    assert.match(documentLoader, /items\.limit = payload\.limit/);
    assert.match(configFormSource, /items\.truncated \?/);
    assert.equal((configFormSource.match(/items\.truncated \?/g) || []).length, 2,
        '文档与数据库选择器都必须显示截断提示');
    assert.equal((configFormSource.match(/sw-home-config__truncated-hint/g) || []).length, 2,
        '截断提示必须是非选项的提示节点');
    assert.match(configFormSource, /homeConfigOptionsTruncated/);
    assert.match(configFormSource, /draft\[field\.key\] = item\.id/);
    assert.doesNotMatch(configFormSource, /truncatedHint[^\n]*id/,
        '截断提示不能伪造可点击选项 ID');
});

test('document-entry widgets expose group, projection, validation, and recent-use wiring', () => {
    const modules = home.registerModules([]);
    const favorites = modules.find((item) => item.moduleId === 'favorites');
    const documentSets = modules.find((item) => item.moduleId === 'document-sets');
    const fixed = modules.find((item) => item.moduleId === 'fixed-document');
    const pinned = modules.find((item) => item.moduleId === 'pinned-docs');
    assert.equal(favorites.configSchema.find((field) => field.key === 'group').type, 'favorite-group');
    assert.deepEqual(documentSets.configSchema.map((field) => field.key), ['limit', 'sortBy', 'showCount', 'showUpdated']);
    assert.equal(fixed.configSchema.find((field) => field.key === 'showPath').defaults, '是');
    assert.deepEqual(pinned.configSchema.map((field) => field.key), ['limit', 'showPath', 'showChildCount', 'showRank', 'showUnavailable']);
    assert.match(indexSource, /favoriteDocumentIdsForProbe/);
    assert.match(indexSource, /buildFavoritesWidgetSnapshot/);
    assert.match(indexSource, /buildDocumentSetsWidgetSnapshot/);
    assert.match(indexSource, /buildFixedDocumentSnapshot/);
    assert.match(indexSource, /if \(summary\.attempted > 0\) \{\s*this\.saveDocumentSet\(item\);\s*this\.updateSettings\(\{documentSetsCurrentId: String\(item\.setId \|\| ""\)\.slice\(0, 64\)\}\);/);
});

test('favorite group config uses the registered groups and never falls back to free text', () => {
    const field = configFormSource.slice(configFormSource.indexOf('field.type === "favorite-group"'), configFormSource.indexOf('field.type === "document"'));
    assert.match(field, /loadHomeFavoriteGroups\(\)/);
    assert.match(field, /__ungrouped__/);
    assert.match(field, /draft\[field\.key\] = select\.value/);
});

test('fixed and pinned document adapters validate current metadata with short caches', () => {
    const fixed = indexSource.slice(indexSource.indexOf('register("fixed-document"'), indexSource.indexOf('register("today-tasks"'));
    const pinned = indexSource.slice(indexSource.indexOf('register("pinned-docs"'), indexSource.indexOf('register("inbox-shorthands"'));
    assert.match(fixed, /WHERE type='d' AND id=/);
    assert.match(fixed, /timeoutMs: 1200, cacheTtlMs: 1000/);
    assert.match(pinned, /SELECT id, hpath FROM blocks/);
    assert.match(pinned, /timeoutMs: 1200, cacheTtlMs: 1000/);
});

test('catalog registers all six kernel widgets as read-only builtins', () => {
    const defs = home.registerModules([]);
    for (const [moduleId, minSizes] of [
        ["pinned-docs", 3], ["inbox-shorthands", 3], ["recent-updates", 3],
        ["data-health", 3], ["recent-documents", 3], ["database-list", 3],
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
        "homeInboxFilteredEmpty", "homeInboxPage",
        "homeRecentUpdates", "homeDescRecentUpdates", "homeRecentUpdatesEmpty", "homeRecentUpdatesStat", "homeRecentUpdatesBlocks",
        "homeDataHealth", "homeDescDataHealth", "homeDataHealthEmpty", "homeDataHealthStat",
        "homeHostRecentEmpty",
        "homeConfigShowSecret", "homeConfigHideSecret",
        "homeDatabaseList", "homeDescDatabaseList", "homeDatabaseListEmpty", "homeDatabaseListFilteredEmpty", "homeDatabaseListStat",
        "homeSavedSearches", "homeDescSavedSearches", "homeSavedSearchesEmpty", "homeSavedSearchesFilteredEmpty", "homeSavedSearchesStat",
        "homeRecentEditsEmpty", "homeRecentEditsFilteredEmpty",
        "homeCriteriaMethod0", "homeCriteriaMethod1", "homeCriteriaMethod2", "homeCriteriaMethod3", "homeCriteriaMethod4",
        "homeAvTable", "homeDescAvTable", "homeAvTableConfigHint", "homeAvTableEmpty", "homeAvTableUnavailable", "homeAvTableRows",
        "homeAvTableSelected", "homeAvTableUnselected", "homeAvTableClear", "homeAvTableNoMatch",
        "homeRandomReviewCandidates", "homeRandomReviewEmpty", "homeRandomReviewScopedEmpty",
        "homeDocumentSelected", "homeDocumentUnselected", "homeDocumentClear", "homeDocumentNoMatch",
        "homeFavoritesAllGroups", "homeFavoritesUngrouped", "homeFavoritesEmpty", "homeFavoritesGroupEmpty",
        "homeFavoritesAvailableEmpty", "homeFavoritesUnavailable", "homeFavoritesSessionOnly",
        "homeDocumentSetsEmpty", "homeFixedDocumentConfigHint", "homeFixedDocumentUnavailable",
        "homePinnedDocsStat", "homePinnedDocsChildren", "homePinnedDocsUnavailable", "homePinnedDocsUnavailableShort",
        "homeTagsEmpty", "homeTagsFilteredEmpty", "homeBookmarksEmpty", "homeBookmarksFilteredEmpty", "homeBookmarkEmptyEntry",
        "homeRelationChild", "homeRelationReference", "homeRelationReferenceCount", "homeRelationsEmpty", "homeRelationsFilteredEmpty",
        "homeOutlineLevel", "homeOutlineEmpty", "homeOutlineFilteredEmpty", "homeCurrentDocumentMissing", "homeUnitBlocks",
        "homeClippedEmpty", "homeStatOnThisDay", "homeOnThisDayEmpty", "homeStatRecentDaily", "homeRecentDailyEmpty",
        "homeReservationToday", "homeReservationOverdue", "homeReservationsEmpty", "homeReservationsFilteredEmpty",
        "homePluginCommandsFilteredEmpty", "homePluginCommandsStat",
    ];
    for (const key of keys) {
        assert.ok(zh[key] && zh[key].length > 0, `zh-CN 缺少 ${key}`);
        assert.ok(en[key] && en[key].length > 0, `en 缺少 ${key}`);
    }
});

test('public API hook mounts on layout ready and unloads cleanly (T-6833)', () => {
    assert.match(indexSource, /private exposePublicApi\(\)/,
        '公开钩子必须是独立的宿主方法');
    assert.match(indexSource, /this\.exposePublicApi\(\);/,
        'onLayoutReady 必须挂载公开钩子（E2E 与生态的就绪信号）');
    assert.match(indexSource, /delete \(window as any\)\.siyuanSpeedSwitch;/,
        'onunload 必须移除公开钩子，不留悬挂引用');
    assert.match(indexSource, /whenReady: \(\) => true/,
        'whenReady 是就绪信号（契约对齐小驴打卡）');
    assert.match(indexSource, /openSwitcher: \(\) => \{/,
        '钩子只暴露受控动作，不泄漏内部状态');
});

test('document set restore and essentials open without stealing focus (T-6826)', () => {
    // 恢复链必须走 keepCursor 批量后台打开（思源 3.8.5 官方选项，旧版宿主自动忽略），
    // 不得退回逐个直连 openTab 抢焦点的形态。
    assert.match(indexSource, /openDocumentOnDesktop\(\{rootId, app: this\.app, openTab, logger, keepCursor: true\}\)/,
        '文档集恢复链必须以 keepCursor:true 后台打开');
    assert.match(indexSource, /: await openDocumentOnDesktop\(\{rootId, app: this\.app, openTab, logger, keepCursor: true\}\);/,
        'Essentials 常驻层跟随恢复链语义（T-6815 起带回执）');
    assert.doesNotMatch(indexSource, /await openTab\(\{app: this\.app, doc: \{id: rootId\}\}\)/,
        '恢复链内不得残留直连 openTab 的抢焦点打开');
});

test('saved searches round-trip through menu save and workbench replay (T-6827)', () => {
    const docSearchUi = readSourceText(path.join(__dirname, '..', 'src', 'doc-search-ui.ts'));
    assert.match(indexSource, /addRow\(this\.i18n\.workbenchSaved, savedSearches\.map\(\(saved: any\) => \(\{/,
        '零词条工作台必须呈现保存的搜索 chips');
    assert.match(indexSource, /applySavedSearchFilters\.call\(this, scrollElement, searchInput, saved, onClose\)/,
        '应用保存的搜索必须走共享回放函数（查询+筛选+徽标同步）');
    assert.match(indexSource, /this\.updateSettings\(\{savedSearches: \[\.\.\.this\.getSavedSearches\(\), entry\]\}\)/,
        '保存动作必须经设置归一化持久化（容量/形态门禁生效）');
    assert.match(docSearchUi, /click: \(\) => this\.saveCurrentSearch\(searchInput\.value, this\.docSearchState\.filters\.get\(scrollElement\) \|\| \{\}\)/,
        '筛选菜单必须提供"保存当前搜索"入口（仅在有查询时）');
    const settingsModel = readSourceText(path.join(__dirname, '..', 'src', 'settings-model.js'));
    assert.match(settingsModel, /savedSearches\.length >= 16/,
        '保存的搜索容量上限 16 必须在设置归一化中执行');
});

test('document set version history: overwrite stashes and settings can rollback (T-6829)', () => {
    const documentSets = readSourceText(path.join(__dirname, '..', 'src', 'document-sets.js'));
    const settingsSections = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    assert.match(documentSets, /versions = identical \? previous\.versions\n            : \[\{savedAt: previous\.updatedAt \|\| now, entries: previous\.entries\}, \.\.\.previous\.versions\]\.slice\(0, DOCUMENT_SET_VERSION_MAX\)/,
        '覆盖保存必须把被覆盖内容压入有界版本栈（内容未变不留噪音版本）');
    assert.match(documentSets, /function rollbackDocumentSet\(/,
        '回滚必须是 document-sets 纯函数（可单测、可逆）');
    assert.match(settingsSections, /rollbackDocumentSet\(this\.data\[DOCUMENT_SETS_KEY\], item\.setId, \{now: Date\.now\(\)\}\)/,
        '设置页回滚按钮必须走纯模型并注入当前时间');
    assert.match(settingsSections, /rollback\.disabled = versionCount === 0;/,
        '无版本时回滚按钮必须禁用');
});

test('open strategy: search results can reuse already-open tabs (T-6830)', () => {
    const docSearchUi = readSourceText(path.join(__dirname, '..', 'src', 'doc-search-ui.ts'));
    const settingsSections = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    assert.match(docSearchUi, /this\.reuseOpenTabsEnabled\(\) && this\.activateTabForReuse\(rootId\)/,
        '搜索结果打开必须先走复用分支（开关关闭时保持总是新开；T-6816 起预览路径跳过复用）');
    assert.match(indexSource, /findOpenTabByRootId\(rootId: string\): Tab \| null \{/,
        '复用必须按 rootId 归一查找已开页签（桌面/移动同源）');
    assert.match(settingsSections, /this\.switcher\(s\.reuseOpenTabs, \(v\) => \{/,
        '行为页必须提供复用开关');
});

test('breadcrumb entry mounts via capability detection and unloads cleanly (T-6831)', () => {
    assert.match(indexSource, /private setupBreadcrumbEntry\(\)/,
        '面包屑入口必须是独立宿主方法');
    assert.match(indexSource, /typeof host\.addBreadcrumbButton !== "function"\) return;/,
        '3.8.5 以下宿主无此 API 时必须静默不挂载（能力检测降级）');
    assert.match(indexSource, /private teardownBreadcrumbEntry\(\)/,
        '卸载必须移除面包屑按钮');
    assert.match(indexSource, /this\.teardownBreadcrumbEntry\(\);/,
        'onunload 必须调用面包屑拆除');
    assert.match(indexSource, /if \(!this\.isMobile && !this\.isUnloading\) this\.showSwitcher\(true\);/,
        '按钮回调只打开切换器（受控动作）');
});

test('related content: workbench region uses official backlink endpoint with bounded projection (T-6814)', () => {
    const relatedModel = readSourceText(path.join(__dirname, '..', 'src', 'related-content-model.js'));
    assert.match(indexSource, /fillRelatedContent\(relatedBox, activeRootId, onClose\)/,
        '零词条工作台必须挂接关联内容行（仅在有活动文档时）');
    assert.match(indexSource, /case "\/api\/ref\/getBacklink2":/,
        '官方反链/提及端点必须进入 fetch 白名单 switch（字面量 URL）');
    assert.match(relatedModel, /function projectRelatedContent\(/,
        '投影必须有界纯函数（反链优先/去重/限额/截断可解释）');
    assert.match(relatedModel, /truncated: shown < total/,
        '截断必须以 shown 与内核总量比较，可解释');
});

test('layered workspace snapshot: preset is persisted into the set and essentials produce receipts (T-6815)', () => {
    // 恢复链：场景按 presetId 优先固化，Essentials 带回执打开并并入统一摘要
    assert.match(indexSource, /presets\.find\(\(preset: \{id: string\}\) => preset\.id === item\.presetId\)/,
        '场景联动必须优先使用集内固化的 presetId（分层快照）');
    assert.match(indexSource, /item\.presetId = String\(applied\.preset\.id \|\| ""\)\.slice\(0, 96\);/,
        '场景应用成功后必须固化回文档集');
    assert.match(indexSource, /essentialsOutcome = await this\.openDocumentSetEssentials\(\);/,
        'Essentials 必须带回执打开（不再 fire-and-forget）');
    assert.match(indexSource, /documentSetEssentialsApplied/,
        '统一恢复摘要必须包含常驻层回执');
    const documentSets = readSourceText(path.join(__dirname, '..', 'src', 'document-sets.js'));
    assert.match(documentSets, /if \(!normalized\.presetId && previous\.presetId\) normalized\.presetId = previous\.presetId;/,
        '覆盖保存不得丢失上一版的场景固化');
});

test('preview open: alt+click on doc results uses doc.mode preview (T-6816)', () => {
    const docSearchUi = readSourceText(path.join(__dirname, '..', 'src', 'doc-search-ui.ts'));
    assert.match(docSearchUi, /\{preview: event\.altKey && !this\.isMobile\}/,
        'Alt+点击（仅桌面）必须走预览打开');
    assert.match(docSearchUi, /\.\.\.\(options\?\.preview \? \{mode: "preview" as const\} : \{\}\)/,
        '预览必须经 T-6826 的 openTab doc.mode 透传（思源官方预览态）');
    assert.match(docSearchUi, /\!\(options\?\.preview\) && this\.reuseOpenTabsEnabled\(\)/,
        '预览打开跳过页签复用（用户明确要一个预览页签）');
});

test('dynamic groups: composed conditions reach the bounded query builder (T-6817)', () => {
    const favoriteActions = readSourceText(path.join(__dirname, '..', 'src', 'favorite-actions.js'));
    const settingsSections = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    assert.match(indexSource, /buildTagSmartGroupQuery\(group, \{nowMs: Date\.now\(\)\}\)/,
        '条目拉取必须传整组（含笔记本/时间窗）并注入当前时间');
    assert.match(favoriteActions, /SMART_GROUP_UPDATED_CHOICES = \[7, 30, 90\]/,
        '更新时间窗必须白名单档位，拒绝任意天数');
    assert.match(favoriteActions, /AND box='/, '笔记本范围参数化进 WHERE');
    assert.match(favoriteActions, /AND updated >= '/, '更新窗参数化进 WHERE');
    assert.match(settingsSections, /favSmartGroupNotebookAny/, '管理器必须提供笔记本范围下拉');
    assert.match(settingsSections, /addFavoriteSmartGroup\(addName\.value, addTag\.value, addNotebook\.value, Number\(addUpdated\.value\) \|\| 0\)/,
        '新增组合条件必须透传到设置持久化');
});

test('quick capture: multi-target flow with destination preview and receipts (T-6818)', () => {
    assert.match(indexSource, /makeTargetButton\("journal", this\.i18n\.quickCaptureTargetJournal\)/,
        '日记目标必须存在且为默认');
    assert.match(indexSource, /if \(!this\.isMobile\) makeTargetButton\("current", this\.i18n\.quickCaptureTargetCurrent\);/,
        '当前文档目标仅桌面提供');
    assert.match(indexSource, /previewLine\.setAttribute\("aria-live", "polite"\);/,
        '目的地预览行必须存在（提交前声明写到哪里）');
    assert.match(indexSource, /const capture = this\.resolveActiveCaptureRoot\(\);\n\s*if \(!capture\) \{/,
        '当前文档写入前必须解析活动文档（缺失即分步失败原因）');
    assert.match(indexSource, /quickCapturePreviewCurrent\.replace\("\{x\}", capture\.title\)/,
        '成功回执必须携带目标文档标题');
    assert.match(indexSource, /private resolveActiveCaptureRoot\(\)/,
        '活动文档解析必须是独立方法');
});

test('keyboard-first: digit direct access and chip cycling shortcuts (T-6820)', () => {
    assert.match(indexSource, /\/\^\[1-9\]\$\/\.test\(key\) && !event\.ctrlKey && !event\.altKey && !event\.metaKey && !event\.shiftKey/,
        '数字直达必须拒绝修饰键组合（避免遮挡未来快捷键）');
    assert.match(indexSource, /this\.activateCardByElement\(cards\[Number\(key\) - 1\], closeOverlay\)/,
        '数字 n 必须打开第 n 个可见卡片');
    assert.match(indexSource, /private cycleSearchChip\(scrollElement: HTMLElement, delta: number\)/,
        'chip 循环必须是独立方法（空查询时静默不生效）');
    assert.match(indexSource, /this\.cycleSearchChip\(scrollElement, key === "ArrowRight" \? 1 : -1\)/,
        'Ctrl+←/→ 绑定 chip 循环');
    assert.match(indexSource, /private activateCardByElement\(card: HTMLElement \| undefined, closeOverlay: IOverlayClose\)/,
        'Enter 与数字直达共用激活逻辑（单一事实来源）');
});

test('skin layer wiring: body marker, unload cleanup and three registered skins', () => {
    assert.match(indexSource, /private applySkin\(\): void/);
    assert.match(indexSource, /document\.body\.dataset\.swSkin = skin;/);
    assert.match(indexSource, /delete document\.body\.dataset\.swSkin;/, 'unload must remove the body marker');
    const skins = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_10-skins.scss'));
    assert.match(skins, /body\[data-sw-skin="apple"\]/, 'apple must define its scope');
    assert.match(skins, /body\[data-sw-skin="midnight"\]/, 'midnight must define its scope');
    assert.match(skins, /body\[data-sw-skin="paper"\]/, 'paper must define its scope');
    assert.match(skins, /--b3-theme-primary/, 'skins override theme variables by design');
});

test('zero-term workbench wiring: renders on empty query and removes on input (T-6807)', () => {
    assert.match(indexSource, /private renderWorkbench\(scrollElement: HTMLElement, keyword: string, onClose: IOverlayClose\)/);
    assert.match(indexSource, /this\.renderWorkbench\(scrollElement, keyword, onClose\);/);
    assert.match(indexSource, /if \(keyword\) \{\s*existing\?\.remove\(\);/);
    assert.match(indexSource, /applyFloatingBallPreset\(this\.getSettings\(\)\.floatingBall, preset\.id\)/);
    assert.match(indexSource, /restoreDocumentSetFromHome\(set\.setId\)/);
});

test('operator query guards use raw keyword while kernel calls use cleaned query (T-6802 fix)', () => {
    const docSearchUi = readSourceText(path.join(__dirname, '..', 'src', 'doc-search-ui.ts'));
    // T-6813 起签名重排为 (…, keyword, version, onClose, filters, cacheKey, fetchQuery)：
    // version 必须是请求版本号，fetchQuery（最后一位）才是清洗后的内核查询——
    // 错位会把 keyword 当版本号，远程搜索静默退出（行为测试见 doc-search-fetch-behavior.test.cjs）。
    assert.match(indexSource, /runDocSearchFetch\.call\(this, scrollElement, searchInput, keyword, version, onClose, filters, cacheKey, kernelQuery\)/,
        'applySearch passes the request version and the cleaned kernel query in the reordered signature');
    // T-6813 起 current() 用正向比较收拢三个过期条件，语义不变：仍逐字对比原始输入。
    assert.match(docSearchUi, /searchInput\.value\.trim\(\) === keyword/,
        'staleness guards keep comparing the raw user input');
    assert.match(docSearchUi, /\{k: fetchText\}/,
        'the kernel title search request carries the cleaned query');
});
