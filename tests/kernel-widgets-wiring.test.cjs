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
        const window = indexSource.slice(registration, registration + 3600);
        assert.ok(window.includes(endpoint), `${moduleId} 必须调用 ${endpoint}`);
        if (guard) assert.ok(window.includes(guard), `${moduleId} 必须有无效载荷守卫 ${guard}`);
    }
});

test('inbox adapter degrades to a configured empty hint instead of a failure state', () => {
    const registration = indexSource.indexOf('register("inbox-shorthands"');
    const window = indexSource.slice(registration, registration + 3500);
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
    const window = indexSource.slice(registration, registration + 3600);
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
        ['blockId', 'limit', 'notebook', 'query', 'sortBy', 'showPath', 'showUpdated', 'showRank']);
    assert.deepEqual(modules.get('saved-searches').configSchema.map((field) => field.key),
        ['limit', 'query', 'method', 'sortBy', 'showKeyword', 'showMethod', 'showScope', 'showRank']);
    assert.deepEqual(modules.get('recent-edits').configSchema.map((field) => field.key),
        ['limit', 'notebook', 'days', 'query', 'showPath', 'showUpdated', 'showRank']);
    for (const [moduleId, cache] of [['recent-updates', 1000], ['database-list', 1000], ['saved-searches', 2000], ['recent-edits', 1000]]) {
        const registration = indexSource.indexOf(`register("${moduleId}"`);
        const window = indexSource.slice(registration, registration + 3600);
        assert.match(window, new RegExp(`cacheTtlMs: ${cache}`), `${moduleId} 使用预期短缓存`);
    }
});

test('recent edits applies a validated time and notebook window with accurate totals', () => {
    const registration = indexSource.indexOf('register("recent-edits"');
    const window = indexSource.slice(registration, registration + 3600);
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
    const window = indexSource.slice(registration, registration + 3500);
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
    const window = indexSource.slice(registration, registration + 3600);
    assert.match(window, /parentDocument/);
    assert.match(window, /path LIKE/);
    assert.match(window, /COUNT\(\*\) OVER\(\) AS total_count/);
    assert.match(window, /LIMIT \$\{normalized\.limit\}/);
});

test('random review refresh keeps a short stable batch cache', () => {
    const registration = indexSource.indexOf('register("random-review"');
    const window = indexSource.slice(registration, registration + 3600);
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

test('single unified top bar entry exposes a dynamic context menu (v3.8.4 addTopBar, T-7026)', () => {
    // T-7026（ADR 0099 D3）：顶栏收敛为唯一平台入口——旧「切换器+第二面板」双入口
    // 契约随模块可见性一并演进；菜单动态列出全部已启用表面 + 设置。
    const menus = indexSource.match(/contextMenu: \(menu\) =>/g) || [];
    assert.equal(menus.length, 1, "顶栏必须只保留统一平台入口一个 contextMenu");
    const switcherAt = indexSource.indexOf('contextMenu: (menu) =>');
    const switcherWindow = indexSource.slice(switcherAt, switcherAt + 600);
    assert.match(switcherWindow, /openSetting/);
    assert.match(switcherWindow, /for \(const surface of this\.getAvailablePlatformSurfaces\(\)\)/,
        "统一入口菜单必须动态列出已启用表面");
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
    assert.match(settingsSections, /rollbackDocumentSet\(this\.data\[DOCUMENT_SETS_KEY\], item\.setId, \{now: Date\.now\(\), versionIndex: vIndex\}\)/,
        '设置页回滚按钮必须走纯模型、注入当前时间并透传所选版本下标');
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

test('related content SWR persistence: cold-start cache with stale-while-revalidate semantics (T-6840)', () => {
    const relatedModel = readSourceText(path.join(__dirname, '..', 'src', 'related-content-model.js'));
    const constants = readSourceText(path.join(__dirname, '..', 'src', 'constants.ts'));
    assert.match(relatedModel, /function normalizeRelatedSwrStore\(value, options = \{\}\)/,
        '持久层归一化必须是纯函数（版本/年龄/去重/有界）');
    assert.match(relatedModel, /RELATED_SWR_MAX_AGE_MS = 7 \* 24 \* 60 \* 60 \* 1000/,
        '持久条目必须有 7 天硬年龄上界（不把陈旧数据伪装成缓存）');
    assert.match(relatedModel, /RELATED_SWR_MAX_ENTRIES = 8/,
        '持久条目必须有界 8 条');
    assert.match(constants, /RELATED_SWR_KEY = "sw_related_swr"/,
        '持久缓存必须有注册过的存储 key（D-401 体系）');
    assert.match(indexSource, /const relatedSwr = normalizeRelatedSwrStore\(this\.data\[RELATED_SWR_KEY\]\);/,
        'onload 必须经归一化载入持久层（无降级直读）');
    assert.match(indexSource, /this\.renderRelatedRow\(box, persisted\.projection, onClose, \{cached: true\}\)/,
        '持久命中必须先渲染并标注"缓存"（stale 半程）');
    assert.match(indexSource, /if \(!persisted && box\.dataset\.swRelatedRendered !== "1"\) \{\s*box\.remove\(\);/,
        '终态清理必须保留已渲染的缓存行（SWR 不误删 stale 内容）');
    assert.match(indexSource, /private persistRelatedSwr\(\): void \{\s*this\.data\[RELATED_SWR_KEY\] = buildRelatedSwrStore/,
        '成功取数后必须经 buildRelatedSwrStore 序列化落盘');
    assert.match(indexSource, /workbenchRelatedCached/,
        '缓存标注必须有 i18n 键（双语）');
});

test('wave-2: preview hover trigger, sticky pane, synthetic dedupe, essentials receipts (T-6842~T-6844)', () => {
    const docSearchUi = readSourceText(path.join(__dirname, '..', 'src', 'doc-search-ui.ts'));
    const searchModel = readSourceText(path.join(__dirname, '..', 'src', 'search-model.js'));
    const documentSets = readSourceText(path.join(__dirname, '..', 'src', 'document-sets.js'));
    const settingsSections = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    const scss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_03-switcher-mobile.scss'));
    // T-6843 悬停触发与行焦点同一管线
    assert.match(docSearchUi, /box\.addEventListener\("mouseover"/,
        '预览窗格必须响应行悬停（与 focusin 共用 debounce 管线）');
    // T-6842 sticky 吸顶：grid 列布局 + sticky，旧 absolute 覆盖退场
    assert.match(scss, /&\.sw--with-preview \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) clamp\(280px, 34%, 480px\);/,
        '预览布局必须转为网格两列（窗格独立成列）');
    assert.match(scss, /position: sticky;\s*top: 0;/, '窗格必须 sticky 吸顶（长列表滚动时仍在场）');
    assert.doesNotMatch(scss, /padding-right: 272px/, '旧 absolute 覆盖层的网格留白必须移除');
    // T-6844 合成名去重
    assert.match(searchModel, /function dedupeSyntheticOutlineHeading\(outline\)/,
        '合成文档名项与文档自带同名 h1 必须去重');
    // T-6841 Essentials 回执进报告 + Markdown 导出
    assert.match(documentSets, /function documentSetRestoreReportToMarkdown\(report\)/,
        '报告必须提供 Markdown 渲染纯函数');
    assert.match(documentSets, /normalizeEssentialsOutcome\(options\.essentials\)/,
        '报告必须并入 Essentials 回执明细');
    assert.match(settingsSections, /this\.openDocumentSetEssentials\(\)/,
        '设置页恢复路径必须执行 Essentials 常驻层（对齐 T-6810 语义）');
    assert.match(settingsSections, /documentSetRestoreReportToMarkdown\(lastRestoreReport\)/,
        '设置页必须提供 Markdown 导出按钮');
});

test('wave-3: action catalog expansion with i18n labels (T-6856/T-6845)', () => {
    const quickActions = readSourceText(path.join(__dirname, '..', 'src', 'quick-actions.js'));
    const floatingActions = readSourceText(path.join(__dirname, '..', 'src', 'floating-ball-actions.js'));
    assert.match(quickActions, /"mark-set", "mark-jump", "clipboard", "close-tab",/,
        'BUILTIN_VALUES 必须登记四个新内建动作值');
    assert.match(quickActions, /langKey: "actionMarkJump"/, '新动作必须携带 langKey');
    assert.match(quickActions, /function resolveQuickActionLabel\(action, translations\)/,
        '标签解析必须是导出的纯函数（i18n 命中/中文兜底）');
    assert.equal((quickActions.match(/langKey:/g) || []).length, 35,
        '全部 23 内建 + 12 宿主命令条目必须携带 langKey');
    assert.match(floatingActions, /case "mark-jump":/, 'executor 必须分发 mark-jump');
    assert.match(floatingActions, /case "clipboard"/, 'executor 必须分发 clipboard');
    assert.match(floatingActions, /case "close-tab"/, 'executor 必须分发 close-tab');
    assert.match(indexSource, /onMarkSet: \(\) => this\.setSessionMark\(\)/,
        'index 必须接线 mark-set（marks 复用既有命令）');
    assert.match(indexSource, /onClipboard: \(\) => this\.openClipboardEntry\(\)/,
        'index 必须接线 clipboard（剪贴板入口复用既有命令）');
    assert.match(indexSource, /private async closeActiveTabForAction\(\): Promise<boolean>/,
        'close-tab 必须有独立方法（无活动页签/失败给明确回执）');
    assert.match(indexSource, /label: resolveQuickActionLabel\(action, this\.i18n\)/g,
        '球面板目录标签必须经宿主 i18n 解析');
    assert.match(indexSource, /\.\.\.action, label: resolveQuickActionLabel\(action, this\.i18n\)\}\);/,
        '命令模式目录标签必须经宿主 i18n 解析（P-F 收口）');
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
    // T-6924 起入口选项扩为多行（新增 split），preview 语义保持原样。
    assert.match(docSearchUi, /preview: event\.altKey && !this\.isMobile,/,
        'Alt+点击（仅桌面）必须走预览打开（经 T-6837 单一激活入口透传）');
    assert.match(docSearchUi, /void openDocSearchResult\.call\(this, id, item\.dataset\.swDocHit \|\| null,\s*\n\s*options\.split \? "right" : undefined, \{preview: Boolean\(options\.preview\)\}\)/,
        '激活入口必须把 preview 语义传给 openDocSearchResult（T-6924 起带分屏位参数）');
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

test('clipboard entry: deep link open with confirm and capture fallback (T-6821)', () => {
    assert.match(indexSource, /langKey: "clipboardEntry"/,
        '剪贴板入口必须注册为插件命令（命令面板白得发现性）');
    assert.ok(indexSource.includes('match(/^siyuan:\\/\\/blocks\\/(\\d{14}-[0-9a-z]+)$/i)'),
        '思源块链接必须严格锚定匹配（消毒：ID 形态校验）');
    assert.match(indexSource, /if \(confirm\(this\.i18n\.clipboardOpenConfirm\)\)/,
        '链接打开前必须经用户确认（来源标记+确认）');
    assert.match(indexSource, /this\.openQuickCapture\("", clean\.slice\(0, 500\)\)/,
        '普通文本必须预填进快速捕获（有界 500 字）');
    assert.match(indexSource, /showMessage\(this\.i18n\.clipboardEmpty, MESSAGE_DEFAULT_MS, "error"\)/,
        '空/不可读剪贴板必须有明确回执');
});

test('density wiring: body marker mounted on load, toggled from settings, removed on unload (T-6823)', () => {
    const settingsSections = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    assert.match(indexSource, /private applyDensity\(\): void/);
    assert.match(indexSource, /document\.body\.dataset\.swDensity = "compact";/);
    assert.match(indexSource, /delete document\.body\.dataset\.swDensity;/, 'unload must remove the density marker');
    assert.match(indexSource, /this\.applyDensity\(\);/, 'onload must apply the density');
    // T-6872（RZ-2）：密度从开关行升级为 舒适/紧凑 分段控件（语义与 body 标记不变）。
    assert.match(settingsSections, /this\.settingSegmented\(this\.i18n\.densityLabel, this\.i18n\.densityCompactTip/,
        '行为页必须提供密度分段控件');
    assert.match(settingsSections, /this\.updateSettings\(\{density: v === "compact" \? "compact" : "comfortable"\}\)/,
        '密度分段必须写回 compact/comfortable 设置');
    const skins = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_10-skins.scss'));
    assert.match(skins, /body\[data-sw-density="compact"\]/, '紧凑密度必须以 body 标记作用域生效');
});

test('config pack: export/import wiring with diff preview and per-group confirm (T-6824/T-6961)', () => {
    const settingsSections = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    const configPack = readSourceText(path.join(__dirname, '..', 'src', 'config-pack-model.js'));
    assert.match(settingsSections, /this\.exportConfigPack\(\)/, '设置页必须提供配置包导出');
    assert.match(settingsSections, /importConfigPack\(parsed, \{groups: chosen\}\)/, '设置页必须按勾选组提供配置包导入');
    assert.match(settingsSections, /const normalized = normalizeConfigPackImport\(parsed\);/,
        '导入应用前必须先归一校验');
    assert.match(settingsSections, /openConfigPackDiffDialog\.call\(this, parsed, groups, signature,/,
        '导入应用前必须经差异预览对话框（逐组确认，T-6961）');
    assert.match(configPack, /CONFIG_PACK_SETTINGS_KEYS = \[/, '可迁移键必须走白名单');
    assert.match(configPack, /payload\.app !== "siyuan-speed-switch"/, '外来包必须拒绝（来源校验）');
    assert.match(indexSource, /const normalized = normalizeDocumentSets\(result\.documentSets\);/,
        'documentSets 深校验必须走既有 normalizeDocumentSets 迁移门禁');
});

test('mobile swipe ownership: portal root and recovery handle declare data-prevent-swipe (T-6778)', () => {
    const fabUi = readSourceText(path.join(__dirname, '..', 'src', 'floating-ball-ui.ts'));
    assert.match(fabUi, /if \(this\.surface === "mobile"\) \{\s*root\.dataset\.preventSwipe = "true";/,
        '移动 portal 根必须声明 data-prevent-swipe（宿主 hasClosestByAttribute 向上匹配，覆盖触发按钮/动作面板）');
    assert.match(fabUi, /if \(this\.surface === "mobile"\) \{\s*recovery\.dataset\.preventSwipe = "true";/,
        '恢复把手挂在 body 层（portal 根之外），必须自带标记');
    assert.match(fabUi, /dataset\.preventSwipe/, '标记经由 dataset 写出（即 data-prevent-swipe）');
});

test('digit badges: first nine visible cards advertise digit-direct access (T-6820)', () => {
    assert.match(indexSource, /private updateDigitBadges\(scrollElement: HTMLElement\)/,
        '角标刷新必须是独立方法');
    assert.match(indexSource, /this\.updateDigitBadges\(scrollElement\);\n\s*return visible;/,
        'filterCards 可见性变化后必须刷新角标');
    assert.match(indexSource, /const digit = index < 9 \? String\(index \+ 1\) : "";/,
        '只有前 9 个可见卡片携带角标（与数字直达键位一致）');
    const badgeScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_03-switcher-mobile.scss'));
    assert.match(badgeScss, /content: attr\(data-sw-digit\);/, '角标由 CSS attr() 渲染（零 DOM 增量）');
});

test('doc-result digit direct access: search-state digits activate result rows (T-6837)', () => {
    const docSearchUi = readSourceText(path.join(__dirname, '..', 'src', 'doc-search-ui.ts'));
    assert.match(indexSource, /private activateDocItemByDigit\(scrollElement: HTMLElement, key: string, closeOverlay: IOverlayClose\): boolean/,
        '结果行数字直达必须是独立方法（可回退、可测试）');
    assert.match(indexSource, /if \(!this\.activateDocItemByDigit\(scrollElement, key, closeOverlay\)\)/,
        '搜索态数字直达必须优先投文档结果行，未接管才回退卡片');
    assert.match(indexSource, /this\.activateDocItemByDigit\(scrollElement, key, closeOverlay\);\s*\}\s*return;/,
        '页签卡隐藏（搜索态）时数字直达不得静默丢失');
    assert.match(indexSource, /!event\.ctrlKey && !event\.altKey && !event\.metaKey && !event\.shiftKey\) \{\s*event\.preventDefault\(\);\s*this\.activateDocItemByDigit/,
        '卡片隐藏分支的数字直达同样拒绝修饰键组合');
    assert.match(indexSource, /if \(!target\.closest\("\.sw__doc-item"\) \|\| !navKey\) \{\s*return;\s*\}/,
        '控件守卫必须放行结果行上的数字键与 ↑/↓（Tab 聚焦后键盘链路可用），其余控件照旧让路');
    assert.match(indexSource, /private moveDocItemFocus\(scrollElement: HTMLElement, current: HTMLElement, delta: number\): boolean/,
        '结果行 ↑/↓ 导航必须是独立方法（网格外行返回 false 不劫持原生滚动）');
    assert.match(indexSource, /if \(this\.moveDocItemFocus\(scrollElement, target, key === "ArrowDown" \? 1 : -1\)\) \{\s*event\.preventDefault\(\);\s*\}/,
        '行导航接管时才阻止默认滚动');
    assert.match(docSearchUi, /export function activateDocResultItem/,
        '结果行激活必须单一入口（点击与数字直达共用，单一事实来源）');
    assert.match(docSearchUi, /item\.dataset\.swDocHit = hitId \|\| "";/,
        '块级锚定必须随行持久化（数字直达与点击行为一致）');
    assert.match(docSearchUi, /if \(index < 9\) element\.dataset\.swDigit = String\(index \+ 1\);/,
        '前 9 条可见结果行携带角标（与数字直达键位一致）');
    const badgeScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_03-switcher-mobile.scss'));
    assert.match(badgeScss, /\.sw__doc-item\[data-sw-digit\]/, '结果行角标由 CSS attr() 渲染');
});

test('doc-result split-open gains a keyboard equivalent (T-6924, R11)', () => {
    const docSearchUi = readSourceText(path.join(__dirname, '..', 'src', 'doc-search-ui.ts'));
    assert.match(docSearchUi, /split: event\.ctrlKey && !this\.isMobile && !event\.altKey,/,
        'Ctrl+click/Ctrl+Enter must request the right split (Alt keeps preview priority)');
    assert.match(docSearchUi, /options: \{query\?: string; preview\?: boolean; split\?: boolean\} = \{\}/,
        'the single activation entry must carry the split option');
    assert.match(docSearchUi, /options\.split \? "right" : undefined, \{preview: Boolean\(options\.preview\)\}\)/,
        'split activation must flow through openDocSearchResult as the right position');
    assert.match(docSearchUi, /event\.ctrlKey && !this\.isMobile && !event\.altKey,/,
        'mobile surfaces must not bind the split modifier');
    assert.match(readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json')), /Ctrl\+点击：在右侧分屏打开/,
        'the row hint must advertise the keyboard equivalent');
});

test('resident preview pane: focus-synced outline preview with bounded fetch (T-6839)', () => {
    const docSearchUi = readSourceText(path.join(__dirname, '..', 'src', 'doc-search-ui.ts'));
    const searchModel = readSourceText(path.join(__dirname, '..', 'src', 'search-model.js'));
    const scss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_03-switcher-mobile.scss'));
    assert.match(docSearchUi, /export function mountDocPreviewPane/,
        '预览窗格挂载必须是独立入口（随结果区重挂）');
    assert.match(docSearchUi, /if \(this\.isMobile \|\| scrollElement\.clientWidth < DOC_PREVIEW_MIN_WIDTH\)/,
        '手机端与窄容器必须不挂载窗格');
    assert.match(docSearchUi, /DOC_PREVIEW_DEBOUNCE_MS = 300/,
        '预览取数必须 debounce 300ms（快速连按方向键不级联请求）');
    assert.match(docSearchUi, /box\.addEventListener\("focusin"/,
        '窗格同步钩子必须是结果区 focusin 委托（行重建不丢钩子）');
    assert.match(docSearchUi, /if \(!BLOCK_ID_RE\.test\(rootId\)\) return;/,
        'rootId 必须经锚定正则校验后才可请求内核文档');
    assert.match(docSearchUi, /this\.fetchKernelJson\("\/api\/outline\/getDocOutline", \{id: rootId, preview: true\}\)/,
        '大纲必须走白名单端点且 preview:true（审查轮实证：false 恒返回空）');
    assert.match(docSearchUi, /this\.fetchKernelJson\("\/api\/filetree\/getDoc", \{id: rootId, mode: 0, size: 12\}\)/,
        '正文必须使用文档顺序的宿主块流');
    assert.match(docSearchUi, /\(docPreviewGenerations\.get\(scrollElement\) \|\| 0\) !== generation\) return;/,
        '过期预览回包必须丢弃（代际计数竞态防线）');
    assert.match(searchModel, /function buildDocPreviewSnapshot\(outline, blocks\)/,
        '预览投影必须是纯模型（有界、可单测）');
    assert.match(searchModel, /DOC_PREVIEW_OUTLINE_MAX = 12/, '大纲必须有界 12 条');
    assert.match(searchModel, /DOC_PREVIEW_EXCERPT_MAX = 900/, '摘要必须有界 900 字');
    assert.match(scss, /sw__doc-preview \{/, '预览窗格必须有样式定义');
});

test('session marks: set/jump commands with ratio restore (T-6820/R3 marks)', () => {
    assert.match(indexSource, /private sessionMarks = new Map<string, number>\(\);/,
        '会话级标记存储（内存 Map，不持久化）');
    assert.match(indexSource, /const ratio = computeScrollRatio\(scroller\.scrollTop, scroller\.scrollHeight, scroller\.clientHeight\);/,
        '标记必须按比例记录（复用 T-6801 工具）');
    assert.match(indexSource, /sessionMarks\.size >= 12/,
        '标记容量 FIFO ≤12');
    assert.match(indexSource, /await openDocSearchResult\.call\(this, rootId, null\);/,
        '文档未打开时先经打开链路聚焦再回卷');
});

test('command prefix: `>` mode lists executable actions in place of doc results (T-6820)', () => {
    assert.match(indexSource, /if \(keyword\.startsWith\(">"\)\) \{/,
        'applySearch 必须识别 `>` 命令前缀');
    assert.match(indexSource, /private renderCommandList\(scrollElement: HTMLElement, query: string, onClose: IOverlayClose\)/,
        '命令列表必须是独立渲染方法');
    assert.match(indexSource, /getBuiltinQuickActions\(\), \.\.\.getGlobalQuickActions\(\)/,
        '目录=内建动作+宿主命令（同一命令面板）');
    assert.match(indexSource, /\.filter\(\(action\) => action\.targets\?\.includes\("desktop"\)\)/,
        '命令模式仅列当前端可执行的动作');
    // T-6911 契约演进：≤12 截断由分组折叠替代；命令项只经分组容器渲染，目录仍受固定注册表有界。
    assert.match(indexSource, /commandGroupList\.appendChild\(item\);/,
        '命令项必须经分组容器渲染（分组折叠替代 ≤12 截断，T-6911）');
    assert.doesNotMatch(indexSource, /matched\.slice\(0, 12\)/,
        '整体截断必须移除，由组头折叠承担列表长度（T-6911）');
});

test('version timeline: rollback targets a chosen version from an inline list (T-6824)', () => {
    const settingsSections = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    assert.match(settingsSections, /versionList\.hidden = !versionList\.hidden;/,
        '回滚按钮必须展开/收起版本列表');
    assert.match(settingsSections, /versionIndex: vIndex/,
        '版本行回滚必须透传所选版本下标');
    assert.match(readSourceText(path.join(__dirname, '..', 'src', 'document-sets.js')), /versionIndex/,
        '模型支持指定版本回滚');
});
test('mobile off-edge docking: edgeAvoid insets ball away from the swipe strip (T-6784/P6)', () => {
    const fabUi = readSourceText(path.join(__dirname, '..', 'src', 'floating-ball-ui.ts'));
    const model = readSourceText(path.join(__dirname, '..', 'src', 'floating-ball-model.js'));
    const settingsSections = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    assert.match(fabUi, /private get mobileEdgeAvoid\(\): boolean \{\s*return this\.surface === "mobile" && this\.edgeAvoidPx >= 12;/,
        '离边停靠生效判定必须 ≥ 宿主 12px 激活条');
    assert.match(fabUi, /bounds\.left \+ this\.effectiveMarginX \+ radius/,
        '水平钳制必须使用离边有效边距（拖动不入激活条）');
    assert.match(fabUi, /private get effectiveHalfHide\(\): boolean \{\s*return this\.halfHide && !this\.mobileEdgeAvoid;/,
        '离边停靠时半隐必须停用（半隐会把球推回激活条）');
    assert.match(model, /edgeAvoidMobile = bool\(behavior\.edgeAvoidMobile, defaults\.behavior\.edgeAvoidMobile === true\)/,
        '模型必须归一化 edgeAvoidMobile（默认关）');
    assert.match(settingsSections, /edgeAvoidMobile: v\}\}\}\);/,
        '设置页必须提供手机端离边停靠开关');
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

test('platform surface context: singleton dialogs, FAB restore and workbench edit resume (T-6869)', () => {
    const secondPanelSource = readSourceText(path.join(__dirname, '..', 'src', 'second-panel-ui.ts'));
    const mobileSwitcherSource = readSourceText(path.join(__dirname, '..', 'src', 'mobile-switcher-ui.ts'));
    // 纯模型模块必须进入生产入口（表面白名单与恢复回退的唯一决策点）。
    assert.match(indexSource, /from "\.\/platform-surface-model"/,
        'index.ts must import the platform surface model');
    // 会话级最近表面记录：openPlatformSurface 与 openSnippetStudio 都要落记录。
    assert.match(indexSource, /private notePlatformSurface\(surface: PlatformSurface, context\?: PlatformSurfaceContext \| null\)/,
        'session-level last-surface recorder must exist');
    assert.match(indexSource, /this\.notePlatformSurface\(surface, context\);\s*\n\s*if \(surface === "switcher"\)/,
        'openPlatformSurface must record the surface before dispatching');
    assert.match(indexSource, /this\.notePlatformSurface\("studio", context\);/,
        'studio open must record the surface too');
    assert.match(secondPanelSource, /this\.notePlatformSurfaceOpened\?\.\("workbench", context\);/,
        'workbench open must record via the host hook');
    // 三个表面的 Dialog 单例守卫：重复入口先销毁旧实例，不再叠窗。
    assert.match(indexSource, /if \(this\.platformSwitcherDialog\?\.element\.isConnected\) this\.platformSwitcherDialog\.destroy\(\);/,
        'desktop switcher singleton guard');
    assert.match(indexSource, /if \(this\.platformSwitcherDialog === holder\.dialog\) this\.platformSwitcherDialog = null;/,
        'desktop switcher must clear its field on destroy');
    assert.match(mobileSwitcherSource, /if \(this\.mobileSwitcherDialog\?\.element\.isConnected\) this\.mobileSwitcherDialog\.destroy\(\);/,
        'mobile switcher singleton guard');
    assert.match(indexSource, /if \(this\.mobileSwitcherDialog === holder\.dialog\) this\.mobileSwitcherDialog = null;/,
        'mobile switcher must clear its field on destroy');
    assert.match(secondPanelSource, /if \(this\.workbenchDialog\?\.element\.isConnected\) this\.workbenchDialog\.destroy\(\);/,
        'workbench singleton guard');
    assert.match(secondPanelSource, /if \(this\.workbenchDialog === dialogHolder\.dialog\) this\.workbenchDialog = null;/,
        'workbench must clear its field on destroy');
    // 悬浮球恢复上次表面：恢复决策必须经 resolveSurfaceReturnTarget，回退入口为切换器。
    assert.match(indexSource, /private openPlatformFromBall\(\)/,
        'FAB restore helper must exist');
    const ballHelper = indexSource.slice(indexSource.indexOf('private openPlatformFromBall'));
    assert.match(ballHelper, /resolveSurfaceReturnTarget\(this\.lastPlatformSurface, this\.getAvailablePlatformSurfaces\(\)\)/,
        'restore decision must go through resolveSurfaceReturnTarget');
    assert.match(ballHelper, /entry: "fab"/, 'FAB open must carry the fab entry');
    assert.match(indexSource, /onSwitcher: \(\) => this\.openPlatformFromBall\(\),/,
        'the floating-ball executor onSwitcher must restore the last surface');
    // 工作台编辑现场：表面导航离开时记录、重开时恢复且焦点回到布局开关。
    assert.match(secondPanelSource, /this\.workbenchResumeEditing = editing;\s*\n\s*dialog\.destroy\(\);/,
        'leaving the workbench via surface nav must record the editing state');
    assert.match(secondPanelSource, /let editing = this\.workbenchResumeEditing === true;\s*\n\s*this\.workbenchResumeEditing = false;/,
        'reopening must consume the resume flag exactly once');
    assert.match(secondPanelSource, /root\.querySelector<HTMLElement>\("\.sw-home__bar button"\)\?\.focus\(\{preventScroll: true\}\);/,
        'resume must move focus back to the layout toggle');
    // ContextBar 投影与上下文透传：chrome 挂载接受 context，表面导航带 entry。
    assert.match(indexSource, /const caption = buildSurfaceContextCaption\(\{surface: options\.surface, context: options\.context, labels: options\.labels\}\);/,
        'chrome mount must render through the caption builder');
    assert.match(indexSource, /this\.openPlatformSurface\(surface, returnTo, \{\s*\n\s*entry: "surface-nav",/,
        'desktop chrome nav must carry the surface-nav entry');
    assert.match(secondPanelSource, /this\.openPlatformSurface\?\.\(surface, "workbench", \{\s*\n\s*entry: "surface-nav",/,
        'workbench chrome nav must carry the surface-nav entry');
    assert.match(mobileSwitcherSource, /this\.openPlatformSurface\?\.\(surface, returnTo, \{\s*\n\s*entry: "surface-nav",/,
        'mobile chrome nav must carry the surface-nav entry');
    assert.match(indexSource, /this\.openPlatformSurface\(returnTo, "switcher", \{\s*\n\s*entry: "back",/,
        'studio Back must carry the back entry');
    // T-7018 演进：动态导入携带 webpackChunkName 魔法注释（readSourceText 会剥注释，
    // 但该锚点同时钉住路径与 .then 链——注释在 import( 与路径之间，用免注释形态匹配）。
    assert.match(indexSource, /void import\([^)]*"\.\/snippet-studio-ui"\)\.then\(/,
        'studio must load the editor through the published lazy chunk');
    assert.match(indexSource, /snippet studio import failed/,
        'studio lazy chunk failures must be logged at the host boundary');
    assert.match(indexSource, /showMessage\(this\.i18n\.snippetFailed\);\s*\n\s*this\.showSwitcher\(false, returnTo\);/,
        'studio lazy chunk failure must restore the switcher with a user-visible receipt');
});

// T-7012：平台外壳统一合同——query 透传、焦点来源捕获/恢复与设置互返。
test('platform surface contract: query passthrough, focus restore and settings round-trip (T-7012)', () => {
    const secondPanelSource = readSourceText(path.join(__dirname, '..', 'src', 'second-panel-ui.ts'));
    const mobileSwitcherSource = readSourceText(path.join(__dirname, '..', 'src', 'mobile-switcher-ui.ts'));
    const modelSource = readSourceText(path.join(__dirname, '..', 'src', 'platform-surface-model.js'));
    // 入口词表：在用入口必须全部在册（缺席会被归 unknown 静默丢弃）。
    for (const entry of ["topbar-context-menu", "plugin-command", "quick-action", "floating-ball"]) {
        assert.ok(modelSource.includes(`"${entry}"`), `entry whitelist must cover "${entry}"`);
    }
    // query + 焦点来源透传：桌面切换器与 studio 的表面导航都要携带查询现场。
    const navPassthrough = 'query: context?.query, ...(focusSource ? {focusSource} : {}),';
    assert.ok(indexSource.split(navPassthrough).length - 1 >= 2,
        'desktop switcher and studio navs must pass query + focusSource through');
    assert.match(indexSource, /const focusSource = encodeSurfaceFocusSource\(dialog\.element\.ownerDocument\?\.activeElement \|\| null\);/,
        'leaving a surface must capture the focus source before destroy');
    assert.match(mobileSwitcherSource, /const focusSource = encodeSurfaceFocusSource\(dialog\.element\.ownerDocument\?\.activeElement \|\| null\);/,
        'mobile chrome nav must capture the focus source too');
    assert.match(mobileSwitcherSource, /query: context\?\.query, \.\.\.\(focusSource \? \{focusSource\} : \{\}\),/,
        'mobile chrome nav must pass the query and focus source through');
    // 工作台：focusSource 的 object:<id> 形式参与回跳目标解析；nav 透传 query。
    assert.match(secondPanelSource, /\(context\?\.focusSource \|\| ""\)\.startsWith\("object:"\)/,
        'workbench must honor the focusSource object target');
    assert.match(secondPanelSource, /\.\.\.\(context\?\.query \? \{query: context\.query\} : \{\}\),/,
        'workbench chrome nav must pass the query through');
    // 片段 chips 打开实验室必须携带查询词（studio 上下文回执可见）。
    assert.match(indexSource, /\{entry: "toolbar", objectId: item\.id, query: keyword\}/,
        'snippet chips must carry the live query');
    // 侧边栏 chrome 的表面导航必须记录入口（此前无 context 被丢弃）。
    assert.match(indexSource, /this\.openPlatformSurface\(surface, "switcher", \{entry: "surface-nav"\}\);/,
        'sidebar chrome nav must record the surface-nav entry');
    // 返回焦点：切换器重开时按焦点来源恢复控件，找不到保留默认首焦点。
    assert.match(indexSource, /const target = surfaceRoot \? resolveSurfaceFocusRestoreTarget\(surfaceRoot, context\.focusSource\) : null;/,
        'switcher reopen must resolve the focus source');
    assert.match(indexSource, /target\?\.focus\(\{preventScroll: true\}\);\s*\n\s*\}, 0\);/,
        'focus restore must run after assembly in a macro task');
    // 设置互返：openSetting 接受 returnTo，关闭后恢复来源表面；面板入口传参。
    assert.match(indexSource, /openSetting\(initialPanel\?: string, returnTo\?: PlatformSurface \| null\)/,
        'openSetting must accept the returnTo surface');
    assert.match(indexSource, /const restoreSurface = normalizeSurfaceId\(returnTo \|\| "", ""\);/,
        'the restore surface must go through the id whitelist');
    assert.match(indexSource, /if \(restoreSurface && !this\.isUnloading\) \{[\s\S]{0,200}?this\.openPlatformSurface\(restoreSurface, "switcher", \{entry: "back"\}\);/,
        'settings close must restore the originating surface behind the unload guard');
    assert.match(indexSource, /this\.openSetting\(undefined, "switcher"\);/,
        'the desktop switcher settings button must request restore');
    assert.match(mobileSwitcherSource, /this\.openSetting\(undefined, "switcher"\);/,
        'the mobile switcher settings button must request restore');
});

// T-7007：第一面板主焦点模型与过滤 chips 语义收口。
test('switcher focus model: cards are real focus targets and chips are an honest button group (T-7007)', () => {
    const createCardSlice = indexSource.slice(
        indexSource.indexOf('private createCard('),
        indexSource.indexOf('private buildCardThumb('),
    );
    assert.match(createCardSlice, /card\.tabIndex = 0;/,
        '页签卡必须是真实 DOM 焦点目标（tabindex=0）');
    assert.match(createCardSlice, /card\.setAttribute\("role", "button"\);/,
        '卡片必须有 button 语义供读屏播报激活行为');
    assert.match(createCardSlice, /card\.setAttribute\("aria-label", this\.titleOf\(tab\)\);/,
        '卡片可访问名称必须是页签标题');
    const syncSlice = indexSource.slice(
        indexSource.indexOf('private syncCardState('),
        indexSource.indexOf('private buildEmptyState('),
    );
    assert.match(syncSlice, /card\.setAttribute\("aria-label", title\);/,
        '复用卡片跨页签重挂时必须同步可访问名称');
    const focusFn = indexSource.slice(
        indexSource.indexOf('private focusCard('),
        indexSource.indexOf('private scrollIntoView('),
    );
    assert.match(focusFn, /domFocus = false/, 'focusCard 必须参数化 DOM 焦点（悬浮聚焦不抢焦点）');
    assert.match(focusFn, /card\.focus\(\{preventScroll: true\};?/, '键盘路径必须把焦点落到卡片本体');
    assert.match(indexSource, /this\.focusCard\(cards\[next\], true\);/,
        '方向键/Tab 导航必须移动 DOM 焦点');
    assert.match(indexSource, /this\.focusCard\(all\[focusState\.defaultFocusIndex\]\?\.card, true\);/,
        '打开面板时初始焦点必须落在默认卡片本体');
    assert.match(indexSource, /scrollElement\.addEventListener\("focusin"/,
        'DOM 焦点进入卡片时必须同步视觉焦点与预览（单一真源）');
    // 过滤 chips：诚实降级为按钮组（aria-pressed），不留半套 tablist。
    const chipsSlice = indexSource.slice(
        indexSource.indexOf('private applySearchChips('),
        indexSource.indexOf('private activateUnifiedItem(') >= 0
            ? indexSource.indexOf('private activateUnifiedItem(')
            : indexSource.indexOf('T-6799 统一索引分区'),
    );
    assert.match(chipsSlice, /row\.setAttribute\("role", "group"\);/,
        'chips 容器必须是 group 语义');
    assert.match(chipsSlice, /aria-pressed/, 'chips 必须用 aria-pressed 表达选中');
    assert.doesNotMatch(chipsSlice, /setAttribute\("role", "tab"\)/,
        'chips 不得保留无 aria-controls/roving 的半套 tab 语义');
    assert.doesNotMatch(chipsSlice, /aria-selected/,
        'chips 不得残留 aria-selected（tablist 专属属性）');
});

// T-7042：chips 键盘路径与同级行补钉——cycleSearchChip 曾写 aria-selected，
// 与 applySearchChips 的 aria-pressed 按钮组语义分裂（T-7007 契约只钉住点击路径，
// 键盘路径漏网）；快速捕获目标按钮组同错一并收口。
test('switcher focus model: chip keyboard path and capture targets use aria-pressed (T-7042)', () => {
    const cycleSlice = indexSource.slice(
        indexSource.indexOf('private cycleSearchChip('),
        indexSource.indexOf('private pickCardByPosition('),
    );
    assert.match(cycleSlice, /el\.setAttribute\("aria-pressed", String\(active\)\);/,
        'chips 键盘循环必须与点击路径同为 aria-pressed');
    assert.doesNotMatch(cycleSlice, /aria-selected/,
        'chips 键盘路径不得残留 aria-selected');
    const targetSlice = indexSource.slice(
        indexSource.indexOf('const setActiveTarget = (next: CaptureTarget) => {'),
        indexSource.indexOf('const setActiveTarget') >= 0
            ? indexSource.indexOf('updatePreview();', indexSource.indexOf('const setActiveTarget'))
            : -1,
    );
    assert.match(targetSlice, /el\.setAttribute\("aria-pressed", String\(key === target\)\);/,
        '快速捕获目标按钮组必须用 aria-pressed 表达单选');
    assert.doesNotMatch(targetSlice, /aria-selected/,
        '快速捕获目标按钮组不得残留 aria-selected');
});

// T-7041：侧栏独立日记入口（ROADMAP §2.2 三端必备）——桌面弹窗与手机快捷动作均有
// 日记入口，侧栏工具栏此前缺失；复用共享 openJournal 命令，不新增第二套实现。
test('sidebar toolbar parity: independent journal entry reuses the shared openJournal command (T-7041)', () => {
    const sidebarHtml = indexSource.slice(
        indexSource.indexOf('private buildSidebarHtml(): string {'),
        indexSource.indexOf('private observeSidebarResize('),
    );
    assert.match(sidebarHtml, /class="b3-button b3-button--text sw__icon-btn sw__journal-btn"/,
        '侧栏工具栏必须有独立日记按钮');
    assert.match(sidebarHtml, /aria-label="\$\{this\.i18n\.journalBtn\}"/,
        '日记按钮可访问名称必须与桌面同 i18n 键');
    const toolbar = indexSource.slice(
        indexSource.indexOf('private bindSidebarToolbarEvents('),
        indexSource.indexOf('private scheduleSidebarRefresh('),
    );
    assert.match(toolbar, /element\.querySelector\("\.sw__journal-btn"\)\?\.addEventListener\("click", \(\) => \{\s*\n\s*this\.openJournal\(\);/,
        '侧栏日记必须走共享 openJournal 命令（不新增实现）');
});

// T-7010：第二面板 renderPanel 重绘事务——捕获滚动锚与聚焦现场，挂载后恢复。
test('workbench rerender transaction: capture scroll and focus before rebuild, restore after mount (T-7010)', () => {
    const secondPanelSource = readSourceText(path.join(__dirname, '..', 'src', 'second-panel-ui.ts'));
    const captureSlice = secondPanelSource.slice(
        secondPanelSource.indexOf('const renderPanel = () => {'),
        secondPanelSource.indexOf('homeRefreshBatchController?.abort();'),
    );
    assert.match(captureSlice, /root\.contains\(activeBefore\)/,
        '捕获必须只认面板内的活动元素');
    assert.match(captureSlice, /closest<HTMLElement>\("\.sw-home__cell"\)/,
        '组件卡现场必须按 cell 捕获');
    assert.match(captureSlice, /dataset\.homeAction/,
        '工具栏按钮现场必须按 data-home-action 捕获');
    assert.match(captureSlice, /scrollTop: root\.scrollTop,/,
        '滚动锚必须在清空 DOM 前捕获');
    const restoreSlice = secondPanelSource.slice(
        secondPanelSource.indexOf('root.appendChild(mountFragment);'),
        secondPanelSource.indexOf('T-6953：编辑会话历史压栈'),
    );
    assert.match(restoreSlice, /root\.scrollTop = capture\.scrollTop;/,
        '挂载后必须立即复位滚动锚');
    assert.match(restoreSlice, /for \(const candidate of cellsNow\)/,
        '组件卡焦点必须按 object-id 遍历比对恢复（不走选择器插值）');
    assert.match(restoreSlice, /restoreTarget\?\.focus\(\{preventScroll: true\}\);/,
        '丢失的 DOM 焦点必须恢复到现场目标');
    assert.match(secondPanelSource, /editToggle\.dataset\.homeAction = "edit";/,
        '编辑开关必须带稳定动作标识供重建后找回');
    assert.match(secondPanelSource, /refreshAllButton\.dataset\.homeAction = "refresh-all";/,
        '刷新全部按钮必须带稳定动作标识');
});

test('platform primitives: badge dot, kbd chip, segmented control, pill actions (T-6871 RZ-1)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const shell = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_platform-shell.scss'));
    // 纯模型 DOM 助手进入生产入口（kbd 提示组的唯一产出方）。
    assert.match(indexSource, /import \{createPlatformKbd, createPlatformSegmented\} from "\.\/platform-dom"/,
        'index.ts must import the platform DOM helpers');
    // chrome 挂载接受 kbdHints 并渲染为 kbd 芯片组（空芯片与空组都不落 DOM）。
    assert.match(indexSource, /kbdHints\?: readonly string\[\];/, 'chrome options must declare kbdHints');
    assert.match(indexSource, /onClose\?: \(\) => void;/, 'chrome options must expose a close action');
    const chromeMount = indexSource.slice(indexSource.indexOf('export function mountPlatformChrome'), indexSource.indexOf('declare module "./snippet-studio-ui"'));
    assert.match(chromeMount, /if \(options\.kbdHints && options\.kbdHints\.length > 0\)/,
        'mountPlatformChrome must guard empty kbdHints');
    assert.match(chromeMount, /kbdHints\.className = "sw-platform-context__kbd-hints"/,
        'kbd hints must render into the context actions slot');
    assert.match(chromeMount, /kbdHints\.appendChild\(createPlatformKbd\(doc, trimmed\)\)/,
        'each non-empty hint must become a platform kbd chip');
    assert.match(chromeMount, /close\.className = "b3-button b3-button--text sw-platform-header__close";/, 'chrome must render a top-right close button');
    assert.match(chromeMount, /close\.addEventListener\("click", \(\) => options\.onClose\?\.\(\)\)/,
        'close button must invoke the supplied surface close action');
    // T-7015b（用户反馈：关闭钮要更明显）：必须带边框/底色的实感钮 + hover 强调。
    {
        const {declaresIn} = require('./css-block-scan.cjs');
        const shellScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_platform-shell.scss'));
        const base = {topLevel: true};
        assert.ok(declaresIn(shellScss, '.sw-platform-header__close', /border: 1px solid var\(--sw-platform-line/, base),
            'close button must carry a visible border');
        assert.ok(declaresIn(shellScss, '.sw-platform-header__close', /background: var\(--sw-platform-surface/, base),
            'close button must carry an opaque surface background');
        assert.ok(declaresIn(shellScss, '.sw-platform-header__close:hover', /border-color: var\(--sw-platform-accent/, base),
            'close button hover must use the accent border');
    }
    // 切换器是首个消费点：上下文栏常驻 Tab/1-9/Enter/Alt 预览。
    assert.match(indexSource, /kbdHints: \["Tab", "1-9", "Enter", this\.i18n\.platformKbdPreview\]/,
        'desktop switcher chrome must pass the keyboard hints');
    assert.match(indexSource, /platformKbdPreview/, 'the Alt-preview hint must come from i18n');
    assert.match(indexSource, /onClose: \(\) => dialog\.destroy\(\)/,
        'switcher and workbench dialogs must wire close to destroy');
    const studioUi = readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-ui.js'));
    assert.match(studioUi, /onClose: \(\) => \{\s*guardLeave\(\(\) => platform\.onClose\?\.\(\)\);\s*\}/,
        'studio close must go through the leave-intent dirty guard (T-6956)');
    assert.match(indexSource, /onClose: \(\) => \{\s*dialog\.destroy\(\);\s*\},\s*closeLabel: this\.i18n\.close/,
        'studio host must destroy only after the studio dirty guard succeeds');
    // SCSS 原语：块级断言（选择器块内声明了关键属性，非文件级共现）。
    assert.ok(declaresIn(shell, '.sw-platform-status::before', /content:\s*""/),
        'status badge must render the semantic color dot');
    assert.ok(declaresIn(shell, '.sw-platform-kbd', /font-family:\s*var\(--b3-font-family-code/),
        'kbd chip must use the host code font');
    assert.ok(declaresIn(shell, '.sw-platform-context__kbd-hints', /margin-left:\s*auto/),
        'kbd hints slot must right-align in the context bar');
    assert.ok(declaresIn(shell, '.sw-platform-seg', /border-radius:\s*9px/),
        'segmented control container must exist');
    assert.ok(declaresIn(shell, '.sw-platform-seg__item.is-active', /font-weight:\s*600/),
        'segmented active item must be styled');
    assert.ok(declaresIn(shell, '.sw-platform-action--pill', /border-radius:\s*var\(--sw-platform-radius-pill\)/),
        'pill action modifier must exist');
    assert.ok(declaresIn(shell, '.sw-platform-action--soft', /background:\s*var\(--sw-platform-accent-soft\)/),
        'soft pill modifier must exist');
    // 徽标语义色与正文色混合（宿主 warning/error 原色做小字不达 3:1，采样实证）。
    assert.ok(declaresIn(shell, '.sw-platform-status[data-state="stale"]', /color:\s*color-mix\(in srgb,\s*var\(--sw-platform-warning\) 68%,\s*var\(--sw-platform-text\)\)/),
        'stale badge text must blend warning with the text color');
    assert.ok(declaresIn(shell, '.sw-platform-status[data-state="error"]', /color:\s*color-mix\(in srgb,\s*var\(--sw-platform-error\) 68%,\s*var\(--sw-platform-text\)\)/),
        'error badge text must blend error with the text color');
    // 触控：coarse 指针下分段项 38px + 容器 6px padding = 44px 命中区。
    const coarse = shell.slice(shell.indexOf('@media (pointer: coarse)'));
    assert.match(coarse, /\.sw-platform-seg__item \{ min-height: 38px; \}/,
        'coarse pointer must raise segmented hit area to 44px total');
    // i18n 双语键。
    const zh = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'));
    const en = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'en.json'));
    assert.match(zh, /"platformKbdPreview": "Alt 预览"/);
    assert.match(en, /"platformKbdPreview": "Alt Preview"/);
});

test('settings group cards and segmented enums (T-6872 RZ-2)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const settingsSections = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    const settingsScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_02-settings.scss'));
    // 宿主装配：分段行必须经 createPlatformSegmented（平台原语唯一产出方），分组卡与组标题方法存在。
    assert.match(indexSource, /createPlatformSegmented\(document, \{items, active: current, onChange, ariaLabel: title\}\)/,
        'settingSegmented must build on the platform segmented primitive');
    assert.match(indexSource, /private settingGroupTitle\(text: string\): HTMLElement/,
        'group title helper must exist');
    assert.match(indexSource, /private settingGroupCard\(\.\.\.children: HTMLElement\[\]\): HTMLElement/,
        'group card helper must exist');
    assert.match(settingsSections, /settingGroupTitle\(text: string\): HTMLElement;/,
        'host interface must declare the group helpers');
    // 枚举（2~4 个互斥取值）必须改分段控件；columns(9)/sortBy(6) 保留 select。
    for (const label of ['skinLabel', 'panelSizeMode', 'setDockDisplay', 'sidebarLayout', 'setHomePalette', 'setHomeSizeMode', 'mobileLayout', 'densityLabel']) {
        assert.match(settingsSections, new RegExp(`this\\.settingSegmented\\(this\\.i18n\\.${label}[,)]`),
            `the ${label} row must use the segmented control`);
    }
    assert.match(settingsSections, /this\.i18n\.densityComfortable/, 'density segmented needs the comfortable label');
    assert.match(settingsSections, /s\.density === "compact" \? "compact" : "comfortable"/,
        'density segmented must derive the active value from settings');
    // 分组卡片：五个标签各以组标题+组卡装配。
    for (const groupKey of ['settingsGroupTheme', 'settingsGroupWindow', 'settingsGroupSortDensity', 'settingsGroupListSidebar', 'settingsGroupComponents', 'settingsGroupWorkbenchWindow', 'settingsGroupMobileLayout', 'settingsGroupCompatibility']) {
        assert.match(settingsSections, new RegExp(`this\\.settingGroupTitle\\(this\\.i18n\\.${groupKey}\\)`),
            `settings sections must use the ${groupKey} group title`);
    }
    // 旧密度开关行已被替换（标签不复用，避免残留歧义文案）。
    assert.doesNotMatch(settingsSections, /densityCompactLabel/,
        'the old compact-density switch label must be gone from the builders');
    // SCSS：块级断言（组标题弱化大写 + 组卡片边界 + 卡内行收敛内边距）。
    // 选择器用展开后的形态（_02-settings.scss 在 .sw-settings 作用域内嵌套）。
    assert.ok(declaresIn(settingsScss, '.sw-settings .sw-settings__group-title', /text-transform:\s*uppercase/),
        'group titles must render as small caps labels');
    assert.ok(declaresIn(settingsScss, '.sw-settings .sw-settings__group-title', /color:\s*var\(--b3-theme-on-surface-light\)/),
        'group titles must use the muted text color');
    assert.ok(declaresIn(settingsScss, '.sw-settings .sw-settings__group-card', /border-radius:\s*10px/),
        'group cards must have their own rounded boundary');
    assert.ok(declaresIn(settingsScss, '.sw-settings .sw-settings__group-card > .sw-settings__item', /margin-inline:\s*0/),
        'rows inside a group card must drop their negative gutters');
    // i18n 双语：新键双语齐备，旧键删除。
    const zh = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'));
    const en = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'en.json'));
    for (const key of ['densityLabel', 'densityComfortable', 'densityCompact', 'settingsGroupTheme', 'settingsGroupWindow', 'settingsGroupThumbnails', 'settingsGroupSortDensity', 'settingsGroupSearchOpen', 'settingsGroupAgent', 'settingsGroupListSidebar', 'settingsGroupDocks', 'settingsGroupComponents', 'settingsGroupWorkbenchWindow', 'settingsGroupMobileLayout', 'settingsGroupCompatibility']) {
        assert.match(zh, new RegExp(`"${key}": "`), `zh-CN must carry ${key}`);
        assert.match(en, new RegExp(`"${key}": "`), `en must carry ${key}`);
    }
    assert.doesNotMatch(zh, /"densityCompactLabel"/, 'zh must drop the replaced density label key');
    assert.doesNotMatch(en, /"densityCompactLabel"/, 'en must drop the replaced density label key');
});

test('switcher polish: kbd-skinned digit badges and preview status badge (T-6873 RZ-3)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const docSearchUi = readSourceText(path.join(__dirname, '..', 'src', 'doc-search-ui.ts'));
    const badgeScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_03-switcher-mobile.scss'));
    // 数字角标 kbd 化：attr() 渲染机制不变，皮肤改为不透明 surface 底+边框+代码字体。
    for (const [selector, scope] of [['.sw__card[data-sw-digit]::after', badgeScss], ['.sw__doc-item[data-sw-digit]::after', badgeScss]]) {
        assert.ok(declaresIn(scope, selector, /content:\s*attr\(data-sw-digit\)/), `${selector} must keep attr() rendering`);
        assert.ok(declaresIn(scope, selector, /background:\s*var\(--b3-theme-surface\)/), `${selector} must use the opaque surface chip`);
        assert.ok(declaresIn(scope, selector, /border: 1px solid var\(--b3-border-color\)/), `${selector} must carry a hairline border`);
        assert.ok(declaresIn(scope, selector, /font-family:\s*var\(--b3-font-family-code/), `${selector} must use the code font`);
    }
    // T-7015b（用户实测：角标被卡片 overflow:hidden 裁掉半个数字）：角标必须
    // 内嵌（非负 top），绝不悬出可裁剪容器。
    assert.ok(declaresIn(badgeScss, '.sw__card[data-sw-digit]::after', /top:\s*4px/), 'card badge must sit inside the card');
    assert.ok(declaresIn(badgeScss, '.sw__doc-item[data-sw-digit]::after', /top:\s*3px/), 'doc-item badge must sit inside the row');
    assert.doesNotMatch(badgeScss, /top:\s*-\dpx[^}]*attr\(data-sw-digit\)/, 'badge must not hang outside a clipping container');
    // 预览窗格状态徽标：loading→ready 两态推进，经平台六态徽标原语产出。
    assert.match(docSearchUi, /import \{createPlatformStatus\} from "\.\/platform-dom"/,
        'doc-search-ui must import the platform status primitive');
    assert.match(docSearchUi, /function setDocPreviewStatus\(pane: HTMLElement, state: "loading" \| "ready" \| "error" \| "blocked", label: string\): void/,
        'preview status must be a dedicated helper');
    assert.match(docSearchUi, /setDocPreviewStatus\(pane, "loading", this\.i18n\.docSearchPreviewStatusLoading\);/,
        'fetch start must switch the badge to loading');
    assert.match(docSearchUi, /setDocPreviewStatus\(pane, failed \? "error" : "ready", failed/,
        'after the generation guard the badge must reflect request failures');
    // 头部 flex 与徽标右置（嵌套 SCSS 用展开后的完整选择器）。
    assert.ok(declaresIn(badgeScss, '.speed-switch .sw__doc-results.sw--with-preview .sw__doc-preview .sw__doc-preview-header', /display:\s*flex/),
        'preview header must be a flex row');
    assert.ok(declaresIn(badgeScss, '.speed-switch .sw__doc-results.sw--with-preview .sw__doc-preview .sw__doc-preview-header .sw__doc-preview-status', /margin-left:\s*auto/),
        'preview badge must right-align in the header');
    // i18n 双语。
    const zh = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'));
    const en = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'en.json'));
    assert.match(zh, /"docSearchPreviewStatusLoading": "加载中"/);
    assert.match(zh, /"docSearchPreviewStatusReady": "已就绪"/);
    assert.match(en, /"docSearchPreviewStatusLoading": "Loading"/);
    assert.match(en, /"docSearchPreviewStatusReady": "Ready"/);
});

test('workbench edit banner and store pill actions (T-6874 RZ-4)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const secondPanelSource = readSourceText(path.join(__dirname, '..', 'src', 'second-panel-ui.ts'));
    const homeWidgetsScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_05-settings-widgets.scss'));
    const storeScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_06-widgets-store.scss'));
    // 编辑横幅：仅编辑态插入（renderPanel 首个 if (editing) 分支），提示文案走 i18n，完成按钮退回查看态。
    // 注意 readSourceText 会剥注释，锚点只能落真实代码。
    const bannerWindow = secondPanelSource.slice(secondPanelSource.indexOf('if (editing) {'), secondPanelSource.indexOf('if (editing) {') + 700);
    assert.match(bannerWindow, /banner\.className = "sw-home__edit-banner";/,
        'the edit-mode branch must mount the banner');
    assert.match(secondPanelSource, /banner\.className = "sw-home__edit-banner";/,
        'the banner must use its dedicated class');
    assert.match(secondPanelSource, /bannerHint\.textContent = this\.i18n\.homeEditingHint;/,
        'the banner hint must come from i18n');
    assert.match(secondPanelSource, /editing = false;\s*\n\s*layoutHistory = null;\s*\n\s*renderPanel\(\);/,
        'the banner done button must exit edit mode, release the layout history and re-render (T-6953)');
    // i18n 双语。
    const zh = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'));
    const en = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'en.json'));
    assert.match(zh, /"homeEditingHint": "正在编辑布局/, 'zh must carry the editing hint');
    assert.match(en, /"homeEditingHint": "Editing layout/, 'en must carry the editing hint');
    // 横幅样式：主色软底卡片。
    assert.ok(declaresIn(homeWidgetsScss, '.sw-home__edit-banner', /border-radius:\s*10px/),
        'the banner must be a rounded card');
    assert.ok(declaresIn(homeWidgetsScss, '.sw-home__edit-banner', /background:\s*color-mix\(in srgb, var\(--b3-theme-primary\) 9%, transparent\)/),
        'the banner must use the accent-soft wash');
    // 商店动作胶囊：添加=主色实底，配置=主色软底；既有契约（min-width/字重/焦点环/nowrap）不动。
    assert.ok(declaresIn(storeScss, '.sw-home-store__add', /border-radius:\s*var\(--sw-platform-radius-pill, 999px\)/),
        'store add must be a pill');
    assert.ok(declaresIn(storeScss, '.sw-home-store__add', /background:\s*var\(--b3-theme-primary\)/),
        'store add must be filled with the accent');
    assert.ok(declaresIn(storeScss, '.sw-home-store__add', /min-width: 88px/),
        'store add keeps its minimum width contract');
    assert.ok(declaresIn(storeScss, '.sw-home-store__configure', /background:\s*color-mix\(in srgb, var\(--b3-theme-primary\) 12%, transparent\)/),
        'store configure must use the soft accent pill');
    assert.ok(declaresIn(storeScss, '.sw-home-store__configure', /border-radius:\s*var\(--sw-platform-radius-pill, 999px\)/),
        'store configure must be a pill');
});

test('quick capture segmented targets, pill save and honest kbd hints (T-6875 RZ-5)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const captureScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_08-home-store-cards.scss'));
    // 目标段选：sw__target--active 的类切换机制不变（T-6818 契约），但必须有激活样式
    // （修复真实缺陷：该类此前从无任何 CSS 规则，激活目标不可辨识）。
    assert.ok(declaresIn(captureScss, '.sw-quick-capture__targets', /border-radius:\s*9px/),
        'targets container must render as a segmented control');
    assert.ok(declaresIn(captureScss, '.sw-quick-capture__targets .sw__target--active', /font-weight:\s*600/),
        'the active target must be visually distinct');
    // 保存按钮：专用类承载主色胶囊皮肤（保留既有 T-6818 结构锚点）。
    assert.match(indexSource, /save\.className = "b3-button b3-button--outline sw-quick-capture__save";/,
        'the save button must carry its dedicated skin class');
    assert.ok(declaresIn(captureScss, '.sw-quick-capture__save', /border-radius:\s*var\(--sw-platform-radius-pill, 999px\)/),
        'the save button must be a pill');
    assert.ok(declaresIn(captureScss, '.sw-quick-capture__save:disabled', /opacity:\s*\.52/),
        'the disabled save state must stay visibly dimmed');
    // 键位提示必须诚实：只出现真实绑定 Ctrl+Enter（keydown 处理器既有锚点）与 Esc。
    assert.match(indexSource, /event\.key === "Enter" && \(event\.ctrlKey \|\| event\.metaKey\)/,
        'the Ctrl/Cmd+Enter binding must actually exist');
    assert.match(indexSource, /createPlatformKbd\(document, "Ctrl\+Enter"\)/,
        'the hint chip must say Ctrl+Enter');
    assert.match(indexSource, /kbdHints\.className = "sw-quick-capture__kbd-hints";/,
        'the hints must live in their own slot');
    assert.ok(declaresIn(captureScss, '.sw-quick-capture__kbd-hints', /margin-right:\s*auto/),
        'the hints must left-align against the action buttons');
});

test('mobile stacked quick-action bar and converged sheet language (T-6876 RZ-6)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const badgeScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_03-switcher-mobile.scss'));
    // 移动底栏：图标在上、标签在下的堆叠布局 + 44px 命中区（仅 .sw__mobile 作用域）。
    const mobileBar = badgeScss.slice(badgeScss.indexOf('&.sw__mobile {'));
    assert.ok(mobileBar.length > 0, 'the mobile scope block must exist');
    assert.ok(/flex-direction:\s*column/.test(mobileBar.slice(0, mobileBar.indexOf('缩略图网格'))),
        'mobile quick actions must stack icon over label');
    const stacked = mobileBar.slice(mobileBar.indexOf('flex-direction: column') - 200, mobileBar.indexOf('flex-direction: column') + 700);
    assert.match(stacked, /min-height:\s*44px/, 'stacked buttons must keep the 44px touch target');
    assert.match(stacked, /font-size:\s*10px/, 'stacked labels must shrink to the caption scale');
    // 收敛项：移动 sheet 的抓手/顶圆角/安全区与移动图标边界既有实现已覆盖，锁定防回退。
    assert.ok(declaresIn(readSourceText(path.join(__dirname, '..', 'src', 'styles', '_05-settings-widgets.scss')),
        '.sw__mobile-sheet', /border-radius:\s*16px 16px 0 0/), 'sheets keep the 16px top radius');
    assert.ok(declaresIn(readSourceText(path.join(__dirname, '..', 'src', 'styles', '_05-settings-widgets.scss')),
        '.sw__mobile-sheet .sw__mobile-sheet-handle', /width:\s*36px/), 'sheets keep the grabber handle');
});

test('surfaces default to fullscreen with optional sizes (T-6877, ADR 0080; T-6986)', () => {
    const secondPanelSource = readSourceText(path.join(__dirname, '..', 'src', 'second-panel-ui.ts'));
    const settingsModel = readSourceText(path.join(__dirname, '..', 'src', 'settings-model.js'));
    const defaults = indexSource.slice(indexSource.indexOf('const DEFAULT_SETTINGS: ISwSettings = {'), indexSource.indexOf('const DEFAULT_SETTINGS: ISwSettings = {') + 1200);
    // 切换器与工作台默认全屏（fullscreen 布尔由 panelSizeMode 派生，语义不变）。
    assert.match(defaults, /panelSizeMode: "fullscreen"/, 'the switcher must default to fullscreen');
    assert.match(defaults, /homeSizeMode: "fullscreen"/, 'the workbench must default to fullscreen');
    // 片段实验室（T-6986，D1 决断）：默认仍全屏；非全屏走 resolvePanelSize 管线
    // （与工作台同语义），只有全屏模式才叠加 fullscreen 容器类。
    assert.match(defaults, /studioSizeMode: "fullscreen"/, 'the studio must default to fullscreen');
    assert.match(indexSource, /const size = studioMode === "fullscreen"\s*\n\s*\? \{width: studioViewport\.width, height: studioViewport\.height\}/,
        'the studio must open at viewport size in fullscreen mode');
    assert.match(indexSource, /if \(studioMode === "fullscreen"\) \{\s*\n\s*dialog\.element\.querySelector<HTMLElement>\("\.b3-dialog__container"\)\?\.classList\.add\("sw-dialog--fullscreen"\);/,
        'only fullscreen mode carries the fullscreen container class');
    assert.match(indexSource, /studioMode === "adaptive"\s*\n\s*\? resolvePanelSize\(\{\.\.\.studioSettings, panelSizeMode: "adaptive", panelScale: PANEL_SCALE_DEFAULT\}, studioViewport\)/,
        'studio adaptive mode must reuse the shared resolvePanelSize pipeline');
    assert.match(indexSource, /panelSizeMode: "custom", dialogWidth: studioSettings\.studioWidth, dialogHeight: studioSettings\.studioHeight/,
        'studio custom mode must use the dedicated studio width/height settings');
    // 白名单归一：模式值非法回落全屏（ADR 0080 默认不回退）。
    assert.match(settingsModel, /studioSizeMode: source\.studioSizeMode === "adaptive" \|\| source\.studioSizeMode === "custom"\s*\n\s*\|\| source\.studioSizeMode === "fullscreen"/,
        'settings-model must whitelist studioSizeMode values');
    // 尺寸可选项全部保留（用户可改回）：三表面设置行仍在。
    assert.match(secondPanelSource, /mode === "fullscreen" \|\| \(mode === "follow" && settings\.panelSizeMode === "fullscreen"\)/,
        'the workbench keeps its follow/adaptive/custom/fullscreen options');
});


// T-7015c（用户实测：工作台 SurfaceNav「片段实验室」呈灰字不可点）：
test("platform chrome: non-current surfaces never render as fake entries (T-7015c)", () => {
    // mountPlatformChrome：非当前表面在 onNavigate 缺失时必须跳过渲染，
    // 绝不输出「看起来像入口的灰字 span」。
    assert.match(indexSource, /if \(surface !== options\.surface && !navigable\) return;/,
        "非当前表面无导航处理时必须跳过渲染（诚实降级）");
    // 现有四条装配路径全部传入 onNavigate（结构性防回退）。
    const secondPanel = readSourceText(path.join(__dirname, "..", "src", "second-panel-ui.ts"));
    assert.match(secondPanel, /onNavigate: navigatePlatformSurface,/, "工作台 chrome 必须传 onNavigate");
});
test('cross-surface snippet objects: query results and studio selection (T-6878/T-6979)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const studioUi = readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-ui.js'));
    // 端点白名单 + 字面量分发双登记（安全扫描要求）。
    assert.match(indexSource, /"\/api\/snippet\/getSnippet",/,
        'getSnippet must be registered in the kernel endpoint whitelist');
    assert.match(indexSource, /case "\/api\/snippet\/getSnippet":\s*response = await fetch\("\/api\/snippet\/getSnippet", init\);/,
        'getSnippet must have a literal fetch dispatch case');
    assert.match(indexSource, /import \{[^}]*projectSnippetObjects[^}]*} from "\.\/platform-surface-model"/,
        'index.ts must import the snippet object projection');
    // T-6979：空查询回执区不再混入无上下文的片段 chips。
    assert.doesNotMatch(indexSource, /snippetBox\.className = "sw__workbench-snippets";/,
        'zero-query workbench must not mount a snippet row');
    assert.doesNotMatch(indexSource, /this\.fillSnippetObjects\(snippetBox\);/,
        'zero-query workbench must not fetch snippets');
    // T-6881 查询态仍复用有界单飞取数。
    const ensure = indexSource.slice(indexSource.indexOf('private ensureSnippetObjects'), indexSource.indexOf('private renderSnippetSearchSection'));
    assert.match(ensure, /Date\.now\(\) - cached\.at < 60000/, 'the snippet cache must have a 60s TTL');
    assert.match(ensure, /generation !== this\.snippetObjectsGeneration/, 'stale generations must be discarded');
    assert.match(ensure, /projectSnippetObjects\(payload, \{limit: 6\}\)/, 'the projection must be bounded to 6');
    assert.match(ensure, /snippetObjectsInFlight/, 'concurrent callers must share one in-flight fetch');
    // 跨表面动作：查询结果携带 objectId+query 打开工作室定位片段（导航语义，T-7012 加 query）。
    assert.match(indexSource, /this\.openPlatformSurface\("studio", "switcher", \{entry: "toolbar", objectId: item\.id, query: keyword\}\)/,
        'snippet chips must open the studio carrying the objectId and the live query');
    assert.match(indexSource, /objectId: !context\?\.objectKind \|\| context\.objectKind === "snippet" \? context\.objectId \|\| "" : "",/,
        'the studio mount must receive snippet ids without mistaking a widget return id for a snippet');
    assert.match(indexSource, /objectId\?: string;/, 'the studio ambient module must declare objectId');
    // 工作室消费：就绪后 id 精确匹配、名称回退，且经脏稿守卫。
    assert.match(studioUi, /objectId = ""/, 'the studio mount must accept an objectId');
    assert.match(studioUi, /snippets\.find\(\(item\) => item && item\.id === objectId\)\s*\|\|\s*snippets\.find\(\(item\) => item && item\.name === objectId\)/,
        'the objectId must match by id with a name fallback');
    assert.match(studioUi, /if \(target\) guardLeave\(\(\) => choose\(target, target\)\);/,
        'the selection must respect the leave-intent dirty guard (T-6956)');
    assert.match(studioUi, /const initialFocus = root\.querySelector\("\.sw-platform-header__close"\) \|\| backButton;/,
        'studio must prefer the platform close button for first focus');
    assert.match(studioUi, /initialFocus\.focus\(\{preventScroll: true\}\)/,
        'studio first focus must avoid scrolling the full-screen surface');
    // i18n 双语。
    const zh = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'));
    const en = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'en.json'));
    assert.match(zh, /"workbenchSnippets": "片段实验室"/);
    assert.match(en, /"workbenchSnippets": "Snippet lab"/);
});

test('workbench health receipt: per-cell health markers and aggregate receipt bar (T-6879/T-6874b)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const secondPanelSource = readSourceText(path.join(__dirname, '..', 'src', 'second-panel-ui.ts'));
    const homeWidgetsScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_05-settings-widgets.scss'));
    // 健康记录：refresh 包装器把结果 ok 写回单元 data-sw-health 并触发聚合。
    // T-6880 起判定提升为 const ok = result?.ok === true（供对象描述复用）。
    // T-6954 起同一包装器记录最近尝试/成功时间（供健康详情与脱敏诊断）。
    assert.match(secondPanelSource, /const ok = result\?\.ok === true;\s*\n\s*if \(ok\) health\.lastOkAt = health\.lastAttemptAt;\s*\n\s*else health\.lastFailReason = String\(result\?\.reason \|\| "failed"\);\s*\n\s*cell\.dataset\.swHealth = ok \? "ok" : "failed";/,
        'the refresh wrapper must record per-cell health plus attempt/success times (T-6879/T-6954)');
    assert.match(secondPanelSource, /updateWorkbenchReceipt\(\);/,
        'the wrapper must refresh the receipt after each refresh');
    // 回执条：存在专用类、按 DOM 聚合、无单元时移除、i18n 模板插值。
    assert.match(secondPanelSource, /receipt\.className = "sw-home__receipt";/,
        'the receipt bar must exist');
    assert.match(secondPanelSource, /root\.querySelector<HTMLElement>\("\.sw-home__receipt"\)/,
        'the aggregator must read the receipt from the panel root');
    assert.match(secondPanelSource, /if \(cells\.length === 0\) \{\s*receipt\.remove\(\);/,
        'an empty panel must remove the receipt');
    assert.match(secondPanelSource, /homeReceiptSummary/,
        'the summary must come from i18n');
    assert.match(secondPanelSource, /homeReceiptFailed/,
        'the failed count must come from i18n');
    // SCSS：回执条与失败单元描边（块级断言）。
    assert.ok(declaresIn(homeWidgetsScss, '.sw-home__receipt', /border-top:\s*1px solid var\(--b3-border-color\)/),
        'the receipt bar must carry its own top hairline');
    assert.ok(declaresIn(homeWidgetsScss, '.sw-home__cell\[data-sw-health="failed"\]', /border-color:\s*color-mix\(in srgb, var\(--b3-theme-error, #d23f31\) 45%, transparent\)/),
        'failed cells must carry an error-tinted border');
    // i18n 双语。
    const zh = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'));
    const en = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'en.json'));
    assert.match(zh, /"homeReceiptSummary": "\{ok\}\/\{total\} 组件正常"/);
    assert.match(zh, /"homeReceiptFailed": "失败 \{x\}"/);
    assert.match(en, /"homeReceiptSummary": "\{ok\}\/\{total\} widgets healthy"/);
    assert.match(en, /"homeReceiptFailed": "\{x\} failed"/);
});

test('widget object descriptors and two-channel failure marking (T-6880)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const secondPanelSource = readSourceText(path.join(__dirname, '..', 'src', 'second-panel-ui.ts'));
    const homeWidgetsScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_05-settings-widgets.scss'));
    // 对象描述：kind/title/健康 三段 aria 语义，随健康变化重写。
    assert.match(secondPanelSource, /cell\.setAttribute\("aria-label", \`\$\{this\.i18n\.homeObjectTitle\} · \$\{descriptor\.title\} · \$\{healthLabel\}\`\);/,
        'each cell must carry its object descriptor as aria semantics');
    assert.match(secondPanelSource, /const descriptor = projectWidgetObject\(inst, def, cell\.dataset\.swHealth, this\.homeModuleOpens\.has\(inst\.moduleId\)\);/,
        'the descriptor must project the current instance and health');
    assert.match(secondPanelSource, /cell\.setAttribute\("aria-description", detail\);/,
        'the descriptor must expose source and capability detail');
    assert.match(secondPanelSource, /updateCellDescription\(\);\s*\n\s*updateWorkbenchReceipt\(\);/,
        'the descriptor must update before each health receipt');
    // 失败两通道：颜色边框之外补 attr() 文字 chip（OK 态清空标记）。
    assert.match(secondPanelSource, /cell\.dataset\.swHealthText = this\.i18n\.homeHealthFailed;/,
        'failed cells must set the chip text attribute');
    assert.match(secondPanelSource, /delete cell\.dataset\.swHealthText;/,
        'healthy cells must clear the chip text attribute');
    assert.ok(declaresIn(homeWidgetsScss, '.sw-home__cell[data-sw-health="failed"]::after', /content:\s*attr\(data-sw-health-text\)/),
        'the failure chip must render via attr() (zero DOM)');
    assert.ok(declaresIn(homeWidgetsScss, '.sw-home__cell[data-sw-health="failed"]::after', /pointer-events:\s*none/),
        'the chip must not intercept pointer interactions');
    // i18n 双语。
    const zh = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'));
    const en = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'en.json'));
    assert.match(zh, /"homeHealthFailed": "失败"/);
    assert.match(zh, /"homeHealthOk": "正常"/);
    assert.match(zh, /"homeObjectTitle": "组件"/);
    assert.match(en, /"homeHealthFailed": "Failed"/);
    assert.match(en, /"homeHealthOk": "OK"/);
    assert.match(en, /"homeObjectTitle": "Widget"/);
});

test('snippet studio consumes platform theme aliases during token migration (T-6903)', () => {
    const studioScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_snippet-studio.scss'));
    assert.match(studioScss, /--studio-accent: var\(--sw-platform-accent,/,
        'studio accent must inherit the shared platform token');
    assert.match(studioScss, /--studio-accent-soft: var\(--sw-platform-accent-soft,/,
        'studio accent wash must inherit the shared platform token');
    assert.match(studioScss, /--studio-line: var\(--sw-platform-line,/,
        'studio borders must inherit the shared platform token');
    assert.match(studioScss, /--studio-surface: var\(--sw-platform-surface,/,
        'studio surfaces must inherit the shared platform token');
    assert.match(studioScss, /--studio-on-surface: var\(--sw-platform-text-muted,/,
        'studio muted text must inherit the shared platform token');
    assert.match(studioScss, /--studio-success: var\(--sw-platform-success,/,
        'studio success state must inherit the shared platform token');
    assert.match(studioScss, /--studio-error: var\(--sw-platform-error,/,
        'studio error state must inherit the shared platform token');
    assert.match(studioScss, /--studio-radius-lg: var\(--sw-platform-radius-lg,/,
        'studio large radius must inherit the shared platform token');
    assert.match(studioScss, /--studio-shadow-card: var\(--sw-platform-shadow-card,/,
        'studio card shadow must inherit the shared platform token');
});

test('snippet studio footer exposes a shared receipt state contract (T-6904)', () => {
    const studioUi = readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-ui.js'));
    const studioScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_snippet-studio.scss'));
    assert.match(studioUi, /status\.setAttribute\("role", "status"\);/, 'the footer receipt must remain a live status region');
    assert.match(studioUi, /status\.setAttribute\("aria-atomic", "true"\);/, 'receipt updates must be announced atomically');
    assert.match(studioUi, /status\.dataset\.state = "loading";/, 'the initial receipt must expose loading state');
    assert.match(studioUi, /const setStatus = \(message, state = "ready"\) => \{\s*\n\s*status\.textContent = message;\s*\n\s*status\.dataset\.state = state;/,
        'footer text and state must be updated through one helper');
    assert.match(studioUi, /setStatus\(errorText\(error\), "error"\)/, 'load and mutation failures must expose error state');
    assert.match(studioUi, /setStatus\(t\("snippetSaveFirst"\), "blocked"\)/, 'unsafe toggle attempts must expose blocked state');
    assert.match(studioScss, /&__status\[data-state="loading"\], &__status\[data-state="busy"\]/, 'busy receipts must use the accent token');
    assert.match(studioScss, /&__status\[data-state="ready"\].*var\(--studio-success\)/s, 'ready receipts must use the success token');
    assert.match(studioScss, /&__status\[data-state="blocked"\].*var\(--studio-warning\)/s, 'blocked receipts must use the warning token');
    assert.match(studioScss, /&__status\[data-state="error"\].*var\(--studio-error\)/s, 'error receipts must use the error token');
});

test('snippet studio AI receipt distinguishes loading, success, and failure (T-6905)', () => {
    const studioUi = readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-ui.js'));
    assert.match(studioUi, /aiStatus\.setAttribute\("aria-live", "polite"\);/, 'AI status must be announced as a live region');
    assert.match(studioUi, /aiStatus\.setAttribute\("aria-atomic", "true"\);/, 'AI status updates must be announced atomically');
    assert.match(studioUi, /const setAIStatus = \(value, ready = false, state = ""\) => \{/, 'AI status must use one state helper');
    assert.match(studioUi, /aiStatus\.dataset\.state = state \|\| \(ready \? "ready" : "idle"\);/, 'AI status must expose a stable state value');
    assert.match(studioUi, /state === "error" \? " is-error" : state === "loading" \? " is-loading" : ready \? " is-ready"/, 'AI provider badge must style loading, error, and ready states');
    assert.match(studioUi, /setAIStatus\(t\("snippetAIGenerating"\), false, "loading"\)/, 'AI generation must expose loading state');
    assert.match(studioUi, /setAIStatus\(errorText\(error\), false, "error"\)/, 'AI failures must expose error state');
    assert.match(studioUi, /setAIStatus\(t\("snippetAIDone"\), true\)/, 'completed AI generation must expose ready state');
});

test('snippet studio keeps safety boundaries visible as capability notes (T-6908)', () => {
    const studioUi = readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-ui.js'));
    const studioScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_snippet-studio.scss'));
    assert.match(studioUi, /const capabilities = node\("ul", "sw-studio__capabilities"\);/,
        'the capability notes must be one always-visible list');
    assert.match(studioUi, /capabilities\.setAttribute\("aria-label", t\("snippetCapabilities"\)\);/,
        'the capability list must be labelled for assistive tech');
    assert.match(studioUi, /\["css", "snippetCapabilityCSS"\], \["js", "snippetCapabilityJS"\], \["ai", "snippetCapabilityAI"\], \["scope", "snippetCapabilityScope"\], \["storage", "snippetCapabilityStorage"\]/,
        'all five boundaries must be stated: sandboxed CSS preview, disabled JS execution, draft-only AI, AI context scope, native-only storage');
    assert.match(studioUi, /item\.dataset\.capability = capability;/,
        'each capability note must expose a stable data hook');
    assert.match(studioUi, /details\.append\(detailsTitle, selection, nameLabel, typeSelect, typeNote, state, commands, description, capabilities\);/,
        'capability notes must render inside the always-visible details panel');
    assert.match(studioScss, /&__capabilities \{ display: grid;[^}]*border: 1px dashed var\(--studio-line\)/,
        'the capability list must use the shared platform line token');
    assert.match(studioScss, /&__capability \{ position: relative;[^}]*color: var\(--studio-on-surface\)/,
        'capability notes must use the shared muted text token');
});

test('command mode groups built-in and host commands with collapsible heads (T-6911)', () => {
    const indexSource = readSourceText(path.join(__dirname, '..', 'src', 'index.ts'));
    const switcherScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_03-switcher-mobile.scss'));
    assert.match(indexSource, /commandCollapsedGroups = new Set<string>\(\);/,
        'collapse state must be remembered for the session across re-renders');
    assert.match(indexSource, /matched\.filter\(\(action\) => action\.kind !== "global"\)/,
        'built-in actions must form their own group');
    assert.match(indexSource, /matched\.filter\(\(action\) => action\.kind === "global"\)/,
        'host commands must form their own group');
    assert.match(indexSource, /this\.i18n\.commandGroupBuiltin/, 'the built-in group must use an i18n label');
    assert.match(indexSource, /this\.i18n\.commandGroupGlobal/, 'the host command group must use an i18n label');
    assert.match(indexSource, /heading\.setAttribute\("aria-expanded", String\(!collapsed\)\);/,
        'group heads must expose their expanded state');
    assert.match(indexSource, /heading\.addEventListener\("keydown", \(event\) => \{\s*\n\s*if \(event\.key === "Enter" \|\| event\.key === " "\)/,
        'group heads must be collapsible from the keyboard');
    assert.match(switcherScss, /\.sw__command-group-toggle \{[^}]*cursor: pointer/,
        'the group head must be styled as an interactive toggle');
    assert.match(switcherScss, /\.sw__command-group-toggle \{[\s\S]*?\[aria-expanded="false"\]::before \{[^}]*transform: rotate/,
        'the caret must reflect the collapsed state');
});

test('snippet studio export interops with usercss headers (T-6912/T-6923)', () => {
    const studioUi = readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-ui.js'));
    const model = require('../src/snippet-studio-model.js');
    assert.match(studioUi, /const needsHeader = draft\.type === "css" && !hasUsercssHeader\(draft\.content\);/,
        'CSS exports must add the header only when one is not already present (T-6923)');
    assert.match(studioUi, /const payload = needsHeader \? `\$\{buildUsercssHeader\(draft\.name\)\}/,
        'CSS exports must carry the usercss interop header');
    assert.match(studioUi, /t\("snippetUsercssVars"\)/,
        'the import receipt must disclose how many variable defaults were applied');
    assert.equal(typeof model.buildUsercssHeader, 'function', 'the header builder must be exported');
    assert.equal(typeof model.stripUsercssHeader, 'function', 'the header stripper must be exported');
    assert.equal(typeof model.hasUsercssHeader, 'function', 'the header detector must be exported');
    assert.equal(typeof model.resolveUsercssVariables, 'function', 'the variable resolver must be exported');
    assert.match(readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-model.js')),
        /const resolved = resolveUsercssVariables\(text\);/,
        'imports with variables must resolve defaults instead of stripping the header (T-6923)');
    assert.match(readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-model.js')),
        /\.\.\.\(varsResolved > 0 \? \{varsResolved\} : \{\}\)/,
        'the import result must carry the resolved variable count');
});

test('snippet catalog ranks native entries before builtin samples (T-6913)', () => {
    const modelSource = readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-model.js'));
    assert.match(modelSource, /return found\.sort\(\(a, b\) => \(a\?\.source === "native" \? 0 : 1\) - \(b\?\.source === "native" \? 0 : 1\)\);/,
        'the filtered catalog must rank native snippets before builtin samples');
});

test('AI candidate renders a local summary and line diff before acceptance (T-6915)', () => {
    const studioUi = readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-ui.js'));
    const studioScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_snippet-studio.scss'));
    const diffModule = require('../src/snippet-diff.js');
    assert.equal(typeof diffModule.buildSnippetDiff, 'function', 'the diff builder must come from a dedicated pure module');
    assert.equal(typeof diffModule.summarizeDiff, 'function', 'the local summary must come from the same module');
    assert.match(studioUi, /const summary = summarizeDiff\(baselineText, candidate\.content, diff\);/,
        'the change summary must be computed locally from the diff, never parsed from model output');
    assert.match(studioUi, /if \(!candidate \|\| candidate\.mode === "explain"\) \{\s*\n\s*hideAIDiffPanel\(\);/,
        'explain candidates must keep the plain text panel');
    assert.match(studioUi, /hideAIDiffPanel\(\);\s*\n\s*setAIStatus\(t\("snippetAIGenerating"\), false, "loading"\);/,
        'streaming must fall back to the raw text view');
    assert.match(studioUi, /aiDiffNote\.textContent = t\("snippetDiffDegraded"\);/,
        'oversized candidates must disclose whole-block replacement');
    assert.match(studioUi, /if \(shown >= DIFF_RENDER_ROW_MAX\) break;/,
        'diff rendering must be row-capped');
    assert.match(studioScss, /&__diff-row\.is-del \{ background: color-mix\(in srgb, var\(--studio-error\) 13%, transparent\); \}/,
        'deleted lines must use the error token');
    assert.match(studioScss, /&__diff-row\.is-ins \{ background: color-mix\(in srgb, var\(--studio-success\) 13%, transparent\); \}/,
        'inserted lines must use the success token');
});

test('AI candidates lint deterministically and accept per hunk (T-6916)', () => {
    const studioUi = readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-ui.js'));
    const studioScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_snippet-studio.scss'));
    const lint = require('../src/snippet-lint.js');
    const diffModule = require('../src/snippet-diff.js');
    assert.equal(typeof lint.lintSnippet, 'function', 'the deterministic linter must be a dedicated module');
    assert.equal(typeof lint.LINT_RULES_VERSION, 'number', 'the rule set must be versioned');
    assert.equal(typeof diffModule.applyDiffHunks, 'function', 'hunk application must be a pure diff operation');
    assert.match(studioUi, /const lint = lintSnippet\(candidate\.type, candidate\.content\);/,
        'candidates must be linted for the panel');
    assert.match(studioUi, /activeHunkAccepted = diff\.hunks\.map\(\(\) => true\);/,
        'hunks must default to accepted');
    assert.match(studioUi, /head\.setAttribute\("aria-pressed", String\(activeHunkAccepted\[h\]\)\);/,
        'each hunk must expose an accept toggle');
    assert.match(studioUi, /applied = applyDiffHunks\(activeDiff, activeHunkAccepted\);/,
        'partial acceptance must merge through the pure hunk application');
    assert.match(studioUi, /setAIStatus\(t\("snippetAIDiscarded"\)\);/,
        'rejecting every hunk must discard the candidate without touching the draft');
    assert.match(studioUi, /line\.classList\.add\("has-finding", rowFindings\.some\(\(f\) => f\.severity === "warn"\) \? "finding-warn" : "finding-info"\);/,
        'lint findings must be marked inline on their diff rows');
    assert.match(studioScss, /&__diff-row\.finding-warn \{ box-shadow: inset 3px 0 0 var\(--studio-warning\); \}/,
        'warnings must use the warning token');
    assert.match(studioScss, /&__diff-hunk-head\[aria-pressed="false"\] \{ color: var\(--studio-error\)/,
        'rejected hunk heads must use the error token');
});

test('floating ball gestures: double-tap and long-press bind, classify and dispatch (T-6919)', () => {
    const modelSource = readSourceText(path.join(__dirname, '..', 'src', 'floating-ball-model.js'));
    const uiSource = readSourceText(path.join(__dirname, '..', 'src', 'floating-ball-ui.ts'));
    const indexModel = require('../src/floating-ball-model.js');
    assert.match(modelSource, /doubleTapAction: "",/,
        'double-tap must default to unbound so single taps stay zero-latency');
    assert.match(modelSource, /config\.behavior\.doubleTapAction = typeof behavior\.doubleTapAction === "string"/,
        'double-tap binding must normalize through bounded cleaning');
    assert.match(modelSource, /config\.behavior\.longPressAction = typeof behavior\.longPressAction === "string"/,
        'long-press binding must normalize through bounded cleaning');
    assert.equal(typeof indexModel.isLongPressGesture, 'function', 'the long-press classifier must be pure and exported');
    assert.equal(typeof indexModel.isDoubleTapGesture, 'function', 'the double-tap classifier must be pure and exported');
    assert.match(uiSource, /this\.suppressClick = wasDragging \|\| this\.longPressFired;/,
        'a fired long-press must suppress the synthetic click');
    assert.match(uiSource, /if \(this\.options\.isDoubleTapBound\?\.\(\)\) \{/,
        'single taps must enter the delayed window only when double-tap is bound');
    assert.match(uiSource, /this\.options\.onDoubleTap\?\.\(\);/, 'double taps must dispatch');
    assert.match(uiSource, /this\.options\.onLongPress\?\.\(\);/, 'long presses must dispatch');
    assert.match(uiSource, /destroy\(\): void \{[\s\S]{0,200}this\.clearPendingTapTimer\(\);/,
        'gesture timers must be torn down with the controller');
    assert.match(indexSource, /isDoubleTapBound: \(\) => !!this\.getSettings\(\)\.floatingBall\?\.behavior\?\.doubleTapAction,/,
        'the host must expose the live double-tap binding');
    assert.match(indexSource, /onLongPress: \(\) => this\.executeFloatingBallBoundGesture\(surface, this\.getSettings\(\)\.floatingBall\?\.behavior\?\.longPressAction\),/,
        'the host must route long presses through the shared bound-gesture executor');
    assert.match(indexSource, /private executeFloatingBallBoundGesture\(surface: FloatingBallSurface, bound: unknown\): void \{[^}]*actionId === "more"/,
        'the bound-gesture executor must keep the more-panel route');
    // T-6920：设置页手势绑定卡片（复用快滑面板模式）。
    const settingsSource = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    assert.match(settingsSource, /select\.dataset\.gestureBinding = key;/,
        'gesture selects must expose their binding key');
    assert.match(settingsSource, /next\.behavior\[key\] = select\.value;/,
        'gesture changes must persist through config normalization');
    assert.match(settingsSource, /wrapper\.addEventListener\("sw-floating-ball-refresh", \(\) => renderGestureOptions\(\)\);/,
        'gesture selects must re-render on ball refresh');
    assert.match(readSourceText(path.join(__dirname, '..', 'src', 'styles', '_02-settings.scss')), /&__gesture-panel \{/,
        'the gesture panel must reuse the ball settings card language');
});

test('document sets capture an active doc and preview visitors (T-6921/T-6922)', () => {
    const indexDocSets = readSourceText(path.join(__dirname, '..', 'src', 'index.ts'));
    const modelSource = readSourceText(path.join(__dirname, '..', 'src', 'document-sets.js'));
    const settingsSource = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    const settingsScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_02-settings.scss'));
    const model = require('../src/document-sets.js');
    assert.equal(typeof model.orderDocumentSetRestoreEntries, 'function',
        'the restore ordering must be a pure model function');
    assert.match(modelSource, /\.\.\.\(value\.active === true \? \{active: true\} : \{\}\),/,
        'the active flag must survive entry normalization and versions');
    assert.match(indexDocSets, /rootId === activeRootId && activeRootId \? \{active: true\} : \{\}/,
        'capture must mark the active desktop tab in the snapshot');
    assert.match(indexDocSets, /runDocumentSetRestore\(orderDocumentSetRestoreEntries\(candidates\)/,
        'restore must replay through the active-last ordering');
    assert.match(indexDocSets, /const focusOnRestore = \(entry as \{active\?: boolean\} \| undefined\)\?\.active === true;/,
        'the active entry must be detected per entry');
    assert.match(indexDocSets, /keepCursor: !focusOnRestore/,
        'the active entry must be exempt from keepCursor so it gains focus');
    assert.match(settingsSource, /runDocumentSetRestore\(orderDocumentSetRestoreEntries\(candidates\)/,
        'the settings restore path must share the active-last ordering');
    assert.match(settingsSource, /sw-setting__doc-set-preview/,
        'the preview must render as an inline list');
    assert.match(settingsSource, /this\.i18n\.documentSetVisitor/,
        'visitor rows must carry the kept-open semantics');
    assert.match(settingsScss, /\.sw-setting__doc-set-preview-row\.is-visitor \{[^}]*opacity: \.6/,
        'visitor rows must render dimmed');
});

test('iterate rounds label their diff against the previous candidate (T-6917)', () => {
    const studioUi = readSourceText(path.join(__dirname, '..', 'src', 'snippet-studio-ui.js'));
    assert.match(studioUi, /const iterateFromCandidate = mode === "iterate" && candidate\?\.mode !== "explain" && candidate\?\.type === captured\.type;/,
        'iterate rounds must detect when the AI input was the previous candidate');
    assert.match(studioUi, /renderAIDiff\(iterateFromCandidate \? sourceContent : draft\.content, iterateFromCandidate\);/,
        'the diff baseline must follow the generation source and say so');
    assert.match(studioUi, /summaryText = relativeToRound \? `\$\{t\("snippetDiffRoundBase"\)\} · ` : "";/,
        'round-relative diffs must carry the base label');
});

test('workbench widget objectId returns to the exact instance (T-6890)', () => {
    const secondPanelSource = readSourceText(path.join(__dirname, '..', 'src', 'second-panel-ui.ts'));
    const mobileSwitcherSource = readSourceText(path.join(__dirname, '..', 'src', 'mobile-switcher-ui.ts'));
    assert.match(secondPanelSource, /cell\.dataset\.swObjectId = inst\.instanceId;/,
        'the return target must use the instance id, not the module id');
    assert.match(secondPanelSource, /cell\.tabIndex = 0;/,
        'widget cards must be reachable by keyboard before their focus can be remembered');
    assert.match(secondPanelSource, /lastFocusedWidgetId = cell\.dataset\.swObjectId \|\| "";/,
        'focus within a widget must remember the instance before navigation moves focus');
    assert.match(secondPanelSource, /objectKind: "widget", objectId: lastFocusedWidgetId/,
        'workbench surface navigation must carry the selected widget');
    assert.match(secondPanelSource, /cell\.dataset\.swObjectId === focusObjectId/,
        'return must find the exact widget instance (focusSource object:<id> included, T-7012)');
    assert.match(secondPanelSource, /targetWidget\.focus\(\{preventScroll: true\}\);/,
        'return must restore focus to the matched card');
    assert.match(indexSource, /entry: "back", objectKind: context\?\.objectKind, objectId: context\?\.objectId/,
        'studio Back must preserve the widget return context');
    assert.match(indexSource, /entry: "surface-nav", objectKind: context\?\.objectKind, objectId: context\?\.objectId/,
        'desktop switcher navigation must preserve the widget return context');
    assert.match(mobileSwitcherSource, /entry: "surface-nav", objectKind: context\?\.objectKind, objectId: context\?\.objectId/,
        'mobile switcher navigation must preserve the widget return context');
});

test('query-time snippet section: cached single-flight projection into search results (T-6881)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const model = require('../src/platform-surface-model.js');
    // applySearch 挂点：命令模式先行清理；非命令模式渲染查询态片段分区。
    assert.match(indexSource, /if \(keyword\.startsWith\(">"\)\) \{\s*\n\s*scrollElement\.querySelector\("\.sw__snippet-results"\)\?\.remove\(\);/,
        'command mode must remove the snippet section');
    assert.match(indexSource, /this\.renderSnippetSearchSection\(scrollElement, keyword\);[\s\S]{0,200}?this\.renderWorkbench\(scrollElement, keyword, onClose\);/,
        'applySearch must render the snippet section before the workbench toggle');
    // 渲染器：骨架清理 + 关键词陈旧守卫 + 有界过滤 + 注入点在 doc-results 之前。
    const section = indexSource.slice(indexSource.indexOf('private renderSnippetSearchSection'), indexSource.indexOf('    async openClipboardEntry'));
    assert.match(section, /scrollElement\.dataset\.swDocSearchQuery !== keyword/,
        'stale keywords must discard the pending render');
    assert.match(section, /filterSnippetObjects\(this\.snippetObjectsCache\?\.items \|\| \[\], keyword, 6\)/,
        'the section must filter the cached projections (no refetch per keystroke)');
    assert.match(section, /scrollElement\.insertBefore\(box, docResults\);/,
        'the section must be inserted before the doc results');
    assert.match(section, /this\.openPlatformSurface\("studio", "switcher", \{entry: "toolbar", objectId: item\.id, query: keyword\}\)/,
        'search results retain the studio cross-surface action (with the live query, T-7012)');
    // 过滤条可见性语义：tabs/docs 选中时片段分区隐藏，unified 保留。
    const chipsScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_03-switcher-mobile.scss'));
    assert.match(chipsScss, /\[data-sw-chip="tabs"\]\s*\{\s*\.sw__unified, \.sw__snippet-results, \.sw__doc-results/,
        'tabs chip must hide the snippet section');
    assert.match(chipsScss, /\[data-sw-chip="docs"\]\s*\{\s*\.sw__group, \.sw__unified, \.sw__snippet-results/,
        'docs chip must hide the snippet section');
    // 模型：filterSnippetObjects 供查询态二次过滤（行数保留）。
    assert.equal(typeof model.filterSnippetObjects, 'function');
    const refiltered = model.filterSnippetObjects([{id: 'a', name: '卡片', type: 'css', enabled: true, lines: 5}], '卡片');
    assert.equal(refiltered[0].lines, 5, 're-filtering preserves the line count');
});

test('card updated-time badge: setting, ctx threading and meta rendering (T-6883/T-6848)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const secondPanelSource = readSourceText(path.join(__dirname, '..', 'src', 'second-panel-ui.ts'));
    const settingsModel = readSourceText(path.join(__dirname, '..', 'src', 'settings-model.js'));
    const sectionsSource = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    const mobileSwitcherSource = readSourceText(path.join(__dirname, '..', 'src', 'mobile-switcher-ui.ts'));
    const badgeScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_03-switcher-mobile.scss'));
    // 设置键：默认关、布尔清洗、外观分组卡片行。
    assert.match(indexSource, /showCardUpdatedBadge: false,/, "production default must be off");
    assert.match(settingsModel, /showCardUpdatedBadge: source\.showCardUpdatedBadge === undefined \? false : source\.showCardUpdatedBadge === true,/,
        'normalize must whitelist the boolean');
    assert.match(sectionsSource, /this\.settingItem\(this\.i18n\.cardUpdatedBadgeLabel, this\.i18n\.cardUpdatedBadgeTip,\s*\n\s*this\.switcher\(s\.showCardUpdatedBadge === true, \(v\) => \{\s*\n\s*this\.updateSettings\(\{showCardUpdatedBadge: v\}\);/,
        'the appearance group card must carry the badge switch');
    // 渲染接线：updatedMap 进 ctx、徽标仅在设置开启且映射命中时渲染。
    assert.match(indexSource, /const ctx: ITabGroupRenderCtx = \{reusable, activeTabId, pinned, favorites, mru, settings, updatedMap, opts\};/,
        'renderList must thread updatedMap through the render ctx');
    assert.match(mobileSwitcherSource, /settings, updatedMap, opts\};/,
        'the mobile ctx must thread updatedMap too');
    assert.match(indexSource, /if \(ctx\?\.settings\.showCardUpdatedBadge === true\) \{/,
        'the badge is gated on the setting');
    assert.match(indexSource, /const badge = formatUpdatedBadge\(updated, Date\.now\(\)\);\s*\n\s*if \(badge\) \{/,
        'invalid stamps render nothing');
    assert.match(indexSource, /badgeEl\.className = "sw__updated-badge" \+ \(badge\.fresh \? " is-fresh" : ""\);/,
        'the badge must carry the fresh tier class');
    // CSS：徽标右对齐 + fresh 主色（嵌套 SCSS 用展开后完整选择器）。
    assert.ok(declaresIn(badgeScss, '.speed-switch .sw__meta .sw__updated-badge', /margin-left:\s*auto/),
        'the badge must right-align in the card meta');
    assert.ok(declaresIn(badgeScss, '.speed-switch .sw__meta .sw__updated-badge.is-fresh', /color:\s*var\(--b3-theme-primary\)/),
        'fresh badges use the accent color');
    // i18n 双语。
    const zh = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'));
    const en = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'en.json'));
    assert.match(zh, /"cardUpdatedBadgeLabel": "页签卡改动信息"/);
    assert.match(en, /"cardUpdatedBadgeLabel": "Tab card changes"/);
});

test('card change marker shares the recent 7-day predicate and refreshes all tab surfaces (T-6892/T-6848)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const recent = readSourceText(path.join(__dirname, '..', 'src', 'recent-closed.js'));
    const scss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_03-switcher-mobile.scss'));
    const zh = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'), 'utf8'));
    const en = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'en.json'), 'utf8'));
    const cardMeta = indexSource.slice(indexSource.indexOf('private buildCardMeta('), indexSource.indexOf('private buildCardIcon('));
    const desktop = indexSource.slice(indexSource.indexOf('private bindSwitcherListArea('), indexSource.indexOf('private bindSearchInputComposition('));
    const mobile = indexSource.slice(indexSource.indexOf('private renderMobileSwitcherList('), indexSource.indexOf('private buildMobileGroupGrid('));
    const sidebar = indexSource.slice(indexSource.indexOf('private renderSidebarPanel('), indexSource.indexOf('private buildSidebarHtml('));
    assert.ok(cardMeta.length > 600 && desktop.length > 600 && mobile.length > 300 && sidebar.length > 300,
        'each scoped production method must be present before checking wiring');
    assert.match(recent, /return updatedChangedWithin\(updated, windowStart\);/,
        'recent changed-only filter must use the shared predicate');
    assert.match(cardMeta, /if \(updatedChangedWithin\(updated, formatChangedWindowStart\(Date\.now\(\)\)\)\) \{/,
        'card marker must use the same 7-day predicate and the same blocks.updated value');
    assert.match(cardMeta, /changedEl\.className = "sw__changed-badge";\s*changedEl\.textContent = this\.i18n\.cardChangedBadge;/,
        'the marker must render visible localized text');
    assert.match(indexSource, /this\.syncCardState\(card, item\.tab, item\.tab\.id === ctx\.activeTabId, isPinned, isFaved, ctx\);/,
        'reused cards must receive the current updated map');
    assert.match(indexSource, /card\.querySelector<HTMLElement>\("\.sw__meta"\)\?\.replaceWith\(this\.buildCardMeta\(tab, ctx\)\);/,
        'reused card meta must be rebuilt from current data');
    for (const [surface, source] of [['desktop', desktop], ['mobile', mobile], ['sidebar', sidebar]]) {
        assert.match(source, /this\.loadUpdatedMap\(/, `${surface} must request blocks.updated`);
        assert.match(source, /this\.refreshCardUpdatedBadges\(/, `${surface} must refresh cards without a sort change`);
    }
    assert.ok(declaresIn(scss, '.speed-switch .sw__meta .sw__changed-badge', /color:\s*var\(--b3-theme-primary\)/, {topLevel: true}),
        'the visible change chip needs a theme color');
    assert.ok(declaresIn(scss, '.speed-switch.sw__mobile .sw__mobile-card .sw__meta .sw__changed-badge', /width:\s*7px/, {topLevel: true}),
        'the mobile change marker stays compact beside the action rail');
    assert.equal(zh.cardChangedBadge, '有改动');
    assert.equal(en.cardChangedBadge, 'Changed');
    assert.ok(zh.cardChangedBadgeTip.includes('7 天') && en.cardChangedBadgeTip.includes('7 days'),
        'the precise seven-day meaning must be available on hover in both languages');
});

test('ball panel digit direct access: keydown lifecycle, hints and mobile guard (T-6884/T-6857)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const panelSource = readSourceText(path.join(__dirname, '..', 'src', 'floating-ball-panel.js'));
    const moreScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_floating-ball-more.scss'));
    // 键盘监听生命周期：mount 挂载、destroy 解绑。
    assert.match(panelSource, /documentRef\.addEventListener\?\.\("keydown", onMorePanelKeydown\);/,
        'the digit keydown listener must attach on mount');
    assert.match(panelSource, /documentRef\.removeEventListener\?\.\("keydown", onMorePanelKeydown\);/,
        'destroy must remove the digit keydown listener');
    // 直达语义：提示与键位共用解析结果，且可编辑目标保留数字输入。
    const keySlice = panelSource.slice(panelSource.indexOf('function onMorePanelKeydown'), panelSource.indexOf('function positionMore'));
    const hintSlice = panelSource.slice(panelSource.indexOf('function refreshDigitHints'), panelSource.indexOf('function onMorePanelKeydown'));
    assert.ok(keySlice.length > 200 && hintSlice.length > 200, 'digit handler and hint resolver must both exist');
    assert.match(keySlice, /if \(!open \|\| disposed\) return;/, 'digits only apply while the panel is open');
    assert.match(keySlice, /isEditableTarget\(event\.target\) \|\| isEditableTarget\(documentRef\.activeElement\)/,
        'editable targets must retain digit input');
    assert.match(keySlice, /event\.ctrlKey \|\| event\.altKey \|\| event\.metaKey \|\| event\.shiftKey/,
        'modifier combos must not be hijacked');
    assert.match(keySlice, /\/\^\[1-9\]\$\/\.test\(event\.key\)/, 'digit direct access is bounded to 1-9');
    assert.match(keySlice, /const target = digitTargets\[Number\(event\.key\) - 1\];/,
        'the keydown path must consume the resolved digit target');
    assert.match(hintSlice, /digitTargets = resolveFloatingBallDigitTargets\(config, surface, rows\.map/,
        'the hint path must use the same resolver');
    assert.match(hintSlice, /visible: !row\.hidden, enabled: !button\.disabled/,
        'hidden and disabled rows must not become digit targets');
    assert.match(hintSlice, /if \(surface !== "mobile" && candidate\) candidate\.row\.dataset\.digit = String\(index \+ 1\);/,
        'digit hints are desktop-only and follow the resolved slot');
    const filterSlice = panelSource.slice(panelSource.indexOf('function filterRows'), panelSource.indexOf('function refreshDigitHints'));
    assert.match(filterSlice, /refreshDigitHints\(\);/, 'filterRows must refresh the digit hints');
    // CSS：attr() 渲染芯片（零 DOM）且不挡交互（嵌套 SCSS 用展开后完整选择器）。
    assert.ok(declaresIn(moreScss, '.sw-fab-root.sw__fab .sw__floating-ball-more .sw__floating-ball-more-row[data-digit]::before', /content:\s*attr\(data-digit\)/),
        'the digit chip must render via attr()');
    assert.ok(declaresIn(moreScss, '.sw-fab-root.sw__fab .sw__floating-ball-more .sw__floating-ball-more-row[data-digit]::before', /pointer-events:\s*none/),
        'the digit chip must not intercept pointer interactions');
});

test('ball fixed digit slots: live action catalog, saved-search identity and configuration gestures (T-6891)', () => {
    const panelSource = readSourceText(path.join(__dirname, '..', 'src', 'floating-ball-panel.js'));
    const resolver = panelSource.slice(panelSource.indexOf('function resolveFloatingBallDigitTargets'), panelSource.indexOf('function safeIconId'));
    const render = panelSource.slice(panelSource.indexOf('function render()'), panelSource.indexOf('function focusMoreEntry'));
    const keydown = panelSource.slice(panelSource.indexOf('function onMorePanelKeydown'), panelSource.indexOf('function positionMore'));
    const gesture = panelSource.slice(panelSource.indexOf('function attachConfigurationGesture'), panelSource.indexOf('function syncFirstLayerVisibility'));
    const configure = panelSource.slice(panelSource.indexOf('function configureDigitSlot'), panelSource.indexOf('function attachConfigurationGesture'));
    assert.ok(resolver.length > 400 && render.length > 400 && keydown.length > 200 && gesture.length > 200,
        'fixed-slot implementation slices must exist');
    assert.match(resolver, /if \(target\.fixed\) return;/, 'only empty slots may receive dynamic fallback');
    assert.match(render, /availableActions\.find\(\(item\) => actionIdOf\(item\) === reference\.actionId\)/,
        'fixed actions must resolve against the current catalog, even if absent from config.actions');
    assert.match(render, /const savedSearches = collectSavedSearches\(options\.savedSearches\);/,
        'saved searches must remain a separate panel data source');
    assert.match(panelSource, /options\.onSavedSearch\?\.\(\{searchId: saved\.id\}, surface\);/,
        'saved-search execution must send only an id for host revalidation');
    assert.match(keydown, /options\.onUnavailable\?\.\(target\.reference, surface\);/,
        'a stale fixed slot must report unavailability instead of falling through');
    assert.match(render, /digitSlotBound: true/, 'fixed action activation must request a host capability recheck');
    assert.equal((gesture.match(/configureDigitSlot\(reference\);/g) || []).length, 2,
        'context menu and long press must invoke the same configuration path');
    assert.match(configure, /options\.onConfigureDigitSlot\(index, reference, surface\);/,
        'the configuration path must delegate the slot and reference to the host');
});

test('flick radial actions: direction classifier, host dispatch and config defaults (T-6886/T-6858 batch 1)', () => {
    const uiSource = readSourceText(path.join(__dirname, '..', 'src', 'floating-ball-ui.ts'));
    const modelSource = readSourceText(path.join(__dirname, '..', 'src', 'floating-ball-model.js'));
    // 手势：分类必须走模型纯函数（速度+方向双判定），上方向保留 P6 更多面板语义。
    // T-6917 契约演进：import 扩展为多符号（新增双击/长按时序判定），仍自同一纯函数模块。
    assert.match(uiSource, /import \{classifyFlickDirection, FLOATING_BALL_DOUBLE_TAP_MS, FLOATING_BALL_LONG_PRESS_MS, isDoubleTapGesture\} from "\.\/floating-ball-model\.js"/,
        'the ui must classify flicks via the model pure function');
    assert.match(uiSource, /const direction = classifyFlickDirection\(last\.x - first\.x, last\.y - first\.y, dt\);/,
        'the flick judgment must use the classifier');
    assert.match(uiSource, /if \(direction === "up"\) \{\s*\n\s*this\.setState\("more"\);/,
        'up keeps the P6 more-panel semantics');
    assert.match(uiSource, /this\.options\.onFlickAction\?\.\(direction\);/,
        'down/left/right must dispatch via onFlickAction');
    // 宿主分发：绑定值 more=更多面板；目录查找失败给不可用回执。
    assert.match(indexSource, /onFlickAction: \(direction: "down" \| "left" \| "right"\) => \{/,
        'the host must wire onFlickAction');
    const flickHandler = indexSource.slice(indexSource.indexOf('onFlickAction: (direction:'), indexSource.indexOf('onBeforeTargeting: () => this.refreshFloatingBallPanels()'));
    assert.match(flickHandler, /if \(bound === "more"\) \{/, 'more binding opens the panel');
    assert.match(flickHandler, /this\.executeFloatingBallSurfaceAction\(surface, action\);/,
        'bound actions go through the shared executor');
    assert.match(flickHandler, /quickActionUnavailable/, 'unknown bindings surface an unavailable receipt');
    // 模型：flickActions 归一化默认与有界清洗；分类器导出。
    assert.match(modelSource, /flickActions: \{up: "more", down: "quick-capture", left: "previous-tab", right: "next-tab"\},/,
        'defaults must be more/quick-capture/previous-tab/next-tab');
    assert.match(modelSource, /classifyFlickDirection,/, 'classifier must be exported');
});


test('flick actions settings: visual binding card with per-direction selects (T-6887/T-6858 batch 2)', () => {
    const {declaresIn} = require('./css-block-scan.cjs');
    const sectionsSource = readSourceText(path.join(__dirname, '..', 'src', 'settings-sections.ts'));
    const settingsScss = readSourceText(path.join(__dirname, '..', 'src', 'styles', '_02-settings.scss'));
    // 绑定卡片：四向 select 挂 data-flick-direction，变更写回 flickActions 并走 persist 归一化。
    assert.match(sectionsSource, /select\.dataset\.flickDirection = direction;/,
        'each direction select must be marked');
    assert.match(sectionsSource, /next\.behavior\.flickActions\[direction\] = select\.value;/,
        'select changes must write the bound action back');
    assert.match(sectionsSource, /persist\(next\);/,
        'flick binding changes must persist through the budget-checked path');
    // 选项来源：无操作 + 更多面板 + 目录（mobile 支持过滤）。
    assert.match(sectionsSource, /\{value: "", label: this\.i18n\.floatingBallFlickNone\}/,
        'the none option must exist');
    assert.match(sectionsSource, /\{value: "more", label: this\.i18n\.floatingBallFlickMore\}/,
        'the more option must exist');
    assert.match(sectionsSource, /getQuickActionSupport\(action, "mobile" as QuickActionTarget\) === "unsupported"\) return;/,
        'catalog options must be mobile-support filtered');
    // 刷新：sw-floating-ball-refresh 事件重读绑定值。
    assert.match(sectionsSource, /wrapper\.addEventListener\("sw-floating-ball-refresh", \(\) => renderFlickOptions\(\)\);/,
        'the refresh event must re-render the flick binds');
    // i18n 八键双语。
    const zh = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'));
    const en = readSourceText(path.join(__dirname, '..', 'src', 'i18n', 'en.json'));
    for (const key of ['floatingBallFlickTitle', 'floatingBallFlickTip', 'floatingBallFlickUp', 'floatingBallFlickDown', 'floatingBallFlickLeft', 'floatingBallFlickRight', 'floatingBallFlickNone', 'floatingBallFlickMore']) {
        assert.match(zh, new RegExp('"' + key + '": '), `zh must carry ${key}`);
        assert.match(en, new RegExp('"' + key + '": '), `en must carry ${key}`);
    }
    // SCSS：绑定卡片与 2 列网格（块级断言，展开后选择器——该块不在 .sw-settings 嵌套内）。
    assert.ok(declaresIn(settingsScss, '.sw-floating-ball-settings__flick-panel', /flex-direction:\s*column/),
        'the flick panel must be a card column');
    assert.ok(declaresIn(settingsScss, '.sw-floating-ball-settings__flick-grid', /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/),
        'the flick grid must be two columns');
});

test('document set probes abort the underlying request on per-item timeout (T-6927)', () => {
    const indexSource = readSourceText(path.join(__dirname, '..', 'src', 'index.ts'));
    const probeStart = indexSource.indexOf('private async probeDocumentSetEntries(');
    assert.ok(probeStart > 0, 'the probe implementation must exist');
    const probe = indexSource.slice(probeStart, probeStart + 2600);
    assert.match(probe, /const controller = typeof AbortController === "function" \? new AbortController\(\) : null;/,
        'each probe item must own an AbortController');
    assert.match(probe, /\.\.\.\(controller \? \{signal: controller\.signal\} : \{\}\),/,
        'the probe fetch must carry the per-item signal');
    assert.match(probe, /timeoutHandle = window\.setTimeout\(\(\) => \{\s*controller\?\.abort\(\);\s*resolve\(null\);\s*\}, DOCUMENT_SET_PROBE_TIMEOUT_MS\);/,
        'the per-item timeout must abort the request before resolving, or zombie connections pile up');
    assert.match(probe, /signal\?\.addEventListener\?\.\("abort", onOuterAbort, \{once: true\}\);/,
        'batch cancellation must bridge into the per-item controller');
    assert.match(probe, /signal\?\.removeEventListener\?\.\("abort", onOuterAbort\);/,
        'the abort bridge must be removed when the item settles');
});
