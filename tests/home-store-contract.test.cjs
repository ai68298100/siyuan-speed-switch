const {readSourceText} = require("./source-scan.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = readSourceText(path.join(root, "src", "index.ts"));
const storeUiSource = readSourceText(path.join(root, "src", "home-store-ui.ts"));
// R3 重构（D-377）：配置表单方法体在 home-config-form.ts。
const configFormSource = readSourceText(path.join(root, "src", "home-config-form.ts"));

test("widget store previews refresh real data and separate size selection from commit", () => {
    assert.match(storeUiSource, /controller\.mount\(\);\s*const markPreviewReady = \(\) =>/);
    assert.match(storeUiSource, /homeStoreApplySize/);
    assert.match(storeUiSource, /homeStoreAdd/);
    assert.match(storeUiSource, /tile\.dataset\.size = sizeKey/);
    assert.match(storeUiSource, /sw-home-store__add/);
    assert.match(storeUiSource, /selectedTile\?\.classList\.remove\("is-selected"\)/);
    assert.match(storeUiSource, /sw-home-store__availability/);
    assert.match(storeUiSource, /homeStoreAvailabilityConditional/);
    assert.match(storeUiSource, /homeStoreTabConditional/);
    // 2026-09-16（D-395）修正：此处原为 /card\.dataset\.availability === availabilityFilter/
    // 与 /card\.dataset\.added === "true"/，两句文本只存在于 home-store-ui.ts 的行尾注释
    // 里（并由两个 `void x;` 空转局部变量"培育"），扫描前剥离注释后立刻失败——即本门禁
    // 此前断言的是注释。改为断言真实的委托调用；availability / addedOnly 两轴的过滤
    // 行为由 tests/home-store-model.test.cjs 覆盖（含阴性用例）。
    assert.match(storeUiSource, /matchesHomeStoreTokens\(card\.dataset, query, filter\)/);
    assert.match(storeUiSource, /resolveHomeStoreFilter\(activeTab\?\.dataset\.tabKey \|\| storeTab\)/);
    assert.match(storeUiSource, /listModules\(device\)\.forEach/);
    assert.match(storeUiSource, /sw-home-store__group/);
    assert.match(storeUiSource, /grid\.classList\.toggle\("fn__none", !visible\)/);
    assert.match(storeUiSource, /!added && def\.availability === "conditional"/);
    assert.match(storeUiSource, /homeStoreConditionalHint/);
    assert.match(storeUiSource, /addedInstance && Array\.isArray\(def\.configSchema\)/);
    assert.match(storeUiSource, /sw-home-store__configure/);
    assert.match(storeUiSource, /openHomeConfigForm\.call\(this, addedInstance, def\.configSchema/);
    assert.match(storeUiSource, /homeStoreSupportedSurfaces/);
    assert.match(storeUiSource, /sw-home-store__support/);
    assert.match(storeUiSource, /selectedTile = tile;\s*tile\.classList\.add\("is-selected"\)/);
    assert.match(storeUiSource, /resolveWidgetCatalogState\(\[\.\.\.activeIds\], \[\.\.\.instanceByModule\.keys\(\)\]\)/);
    assert.match(storeUiSource, /homeStoreProviderUnavailable/);
    assert.match(storeUiSource,/sw-home-store__remove-unavailable/);
    assert.match(source, /homeModuleChangeListeners\.add\(handleModuleChange\)/);
    assert.match(storeUiSource, /homeModuleChangeListeners\.delete\(handleModuleChange\)/);
    assert.match(storeUiSource, /btn\.dataset\.tabFilter = tab\.category \|\| "all"/);
    assert.match(storeUiSource, /homeStoreTabAdded/);
    assert.match(storeUiSource, /homeStoreNoResults/);
    assert.match(storeUiSource, /let storeQuery = ""/);
    assert.match(storeUiSource, /let storeTab = "all"/);
    assert.match(storeUiSource, /let storeSort = "relevance"/);
    assert.match(storeUiSource,/homeStoreSortLabel/);
    assert.match(source, /sortHomeStoreCards/);
    assert.match(source, /matchesHomeStoreTokens/);
    assert.match(storeUiSource, /buildHomeStoreTabCounts/);
    assert.match(storeUiSource, /card\.dataset\.moduleId = moduleId/);
    assert.match(storeUiSource, /btn\.dataset\.tabLabel = tab\.label/);
    assert.match(storeUiSource, /homeStoreGroupJournal/);
    assert.match(storeUiSource, /"journal-calendar", "writing-streak"/);
    assert.match(storeUiSource, /readyHeading\.dataset\.section = "ready"/);
    assert.match(storeUiSource, /heading\.dataset\.section === "ready"/);
    assert.match(storeUiSource,/homeStoreGroupPluginAuthor/);
    assert.match(source, /else if \(registration\.registered\) \{\s*this\.homeModuleOpens\.delete\(moduleId\)/);
    assert.match(source, /clearDeferredRefreshes\(\)/);
    assert.match(source, /panelEventCleanup\?\.\(\)/);
    assert.match(configFormSource, /field\.type === "document"/);
    assert.match(configFormSource, /this\.currentDocumentSetEntries\(\)\.slice\(0, 40\)/);
    assert.match(configFormSource, /input\.type = "date"/);
    assert.match(configFormSource, /input\.min = "1900-01-01"/);
    assert.match(configFormSource, /input:invalid, select:invalid/);
    assert.match(configFormSource, /emptyOption\.textContent = this\.i18n\.notebookPlaceholder/);
    assert.match(configFormSource, /homeConfigUnavailableValue/);
    assert.match(configFormSource, /homeConfigReset/);
    assert.match(source, /sw-home__empty-store/);
    assert.match(source, /homeEmptyOpenStore/);
    assert.match(storeUiSource, /tabBar\.setAttribute\("role", "tablist"\)/);
    assert.match(storeUiSource, /btn\.setAttribute\("role", "tab"\)/);
    assert.match(storeUiSource, /tile\.setAttribute\("aria-pressed"/);
    assert.match(storeUiSource, /homeStoreClearFilters/);
    assert.match(storeUiSource,/searchInput\.focus\(\)/);
    assert.match(source, /includeState: true/);
    assert.match(source, /configuredModuleIds/);
    assert.match(storeUiSource, /homeStoreResultSummary/);
    assert.match(storeUiSource, /homeStoreChooseSize/);
    assert.match(storeUiSource, /homeStoreStatusCurrent/);
    assert.match(storeUiSource, /collapsedGroups = new Set/);
    assert.match(storeUiSource, /homeStoreCollapseGroup/);
    assert.match(storeUiSource, /homeStoreExpandGroup/);
    assert.match(storeUiSource, /sw-home-store__remove/);
    // 同上：/PREVIEW_KINDS/ 在 home-store-ui.ts 里只出现在一句指针注释中
    // （"PREVIEW_KINDS is centralized in home-store-model.js."），剥注释即失败。
    // 改为断言真实的模型调用（PREVIEW_KINDS 本体在 home-store-model.js）。
    assert.match(storeUiSource, /const kind = resolveHomeStorePreviewKind\(moduleId, /);
    assert.match(storeUiSource, /resolveHomeStorePreviewKind,/);
    assert.match(storeUiSource,/p-calendar-grid/);
});
