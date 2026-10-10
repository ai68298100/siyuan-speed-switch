const {readSourceText} = require("./source-scan.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = readSourceText(path.join(root, "src", "index.ts"));
const storeUiSource = readSourceText(path.join(root, "src", "home-store-ui.ts"));
const secondPanelSource = readSourceText(path.join(root, "src", "second-panel-ui.ts"));
// R3 重构（D-377）：配置表单方法体在 home-config-form.ts。
const configFormSource = readSourceText(path.join(root, "src", "home-config-form.ts"));
const storeCardStyles = readSourceText(path.join(root, "src", "styles", "_08-home-store-cards.scss"));

test("standalone dialogs tear down malformed host shells", () => {
    const guards = [
        ["store guide", /const root = dialog\.element\.querySelector<HTMLElement>\("\.sw-home-store-guide"\);[\s\S]{0,220}?if \(!root\) \{[\s\S]{0,120}?dialog\.destroy\(\);[\s\S]{0,80}?return;\s*\}/],
        ["quick capture", /const root = dialog\.element\.querySelector<HTMLElement>\("\.sw-quick-capture"\);[\s\S]{0,220}?if \(!root\) \{[\s\S]{0,120}?dialog\.destroy\(\);[\s\S]{0,80}?return;\s*\}/],
        ["settings", /const root = dialog\.element\.querySelector<HTMLElement>\("\.sw-settings"\);[\s\S]{0,220}?if \(!root\) \{[\s\S]{0,120}?dialog\.destroy\(\);[\s\S]{0,80}?return;\s*\}/],
        ["template picker", /const root = dialog\.element\.querySelector<HTMLElement>\("\.sw-template-picker"\);[\s\S]{0,220}?if \(!root\) \{[\s\S]{0,120}?dialog\.destroy\(\);[\s\S]{0,80}?return;\s*\}/],
        ["host list", /const root = dialog\.element\.querySelector<HTMLElement>\("\.sw__host-list"\);[\s\S]{0,220}?if \(!root\) \{[\s\S]{0,120}?dialog\.destroy\(\);[\s\S]{0,80}?return;\s*\}/],
    ];
    for (const [label, pattern] of guards) {
        assert.match(source, pattern, `${label} 缺少空 Dialog 销毁保护`);
        const matched = source.match(pattern)?.[0];
        assert.ok(matched, `${label} 必须能提取可验证的保护块`);
        const injected = source.replace(matched, matched.replace("dialog.destroy();", "// injected violation"));
        assert.doesNotMatch(injected, pattern, `${label} 删除销毁动作后门禁必须失败`);
    }
});

test("notebook placeholder contract rejects bypassing the shared loader helper", () => {
    const notebookLoaderSource = readSourceText(path.join(root, "src", "notebook-load-ui.js"));
    const regressed = notebookLoaderSource.replace(/setOption\(select, "", labels\.placeholder\)/, 'setOption(select, "", labels.loading)');
    assert.notEqual(regressed, notebookLoaderSource);
    assert.doesNotMatch(regressed, /setOption\(select, "", labels\.placeholder\)/,
        "负向注入必须破坏成功态占位选项合同");
});

test("workbench tears down a malformed host dialog shell", () => {
    const guard = secondPanelSource.match(/if \(!root\) \{[\s\S]{0,260}?dialog\.destroy\(\);[\s\S]{0,120}?return;\s*\}/);
    assert.ok(guard, "宿主主题移除工作台根节点时必须销毁空 Dialog");
    const injected = secondPanelSource.replace("dialog.destroy();", "");
    assert.doesNotMatch(injected, /if \(!root\) \{[\s\S]{0,260}?dialog\.destroy\(\);[\s\S]{0,120}?return;\s*\}/,
        "删除空壳销毁动作后门禁必须失败");
});

test("health details tears down a malformed host dialog shell", () => {
    const guard = secondPanelSource.match(/const listRoot = dialog\.element\.querySelector<HTMLElement>\("\.sw-home-health"\);[\s\S]{0,260}?if \(!listRoot\) \{[\s\S]{0,160}?dialog\.destroy\(\);[\s\S]{0,100}?return;\s*\}/);
    assert.ok(guard, "宿主主题移除健康详情根节点时必须销毁空 Dialog");
    const injected = secondPanelSource.replace("if (!listRoot) {\n                dialog.destroy();", "if (!listRoot) {\n                // injected violation");
    assert.doesNotMatch(injected, /const listRoot = dialog\.element\.querySelector<HTMLElement>\("\.sw-home-health"\);[\s\S]{0,260}?if \(!listRoot\) \{[\s\S]{0,160}?dialog\.destroy\(\);[\s\S]{0,100}?return;\s*\}/,
        "删除健康详情空壳销毁动作后门禁必须失败");
});

test("widget config tears down a malformed host dialog shell", () => {
    const guard = configFormSource.match(/const root = dialog\.element\.querySelector<HTMLElement>\("\.sw-home-config"\);[\s\S]{0,260}?if \(!root\) \{[\s\S]{0,160}?dialog\.destroy\(\);[\s\S]{0,100}?return;\s*\}/);
    assert.ok(guard, "宿主主题移除组件配置根节点时必须销毁空 Dialog");
    const injected = configFormSource.replace("if (!root) {\n            dialog.destroy();", "if (!root) {\n            // injected violation");
    assert.doesNotMatch(injected, /const root = dialog\.element\.querySelector<HTMLElement>\("\.sw-home-config"\);[\s\S]{0,260}?if \(!root\) \{[\s\S]{0,160}?dialog\.destroy\(\);[\s\S]{0,100}?return;\s*\}/,
        "删除组件配置空壳销毁动作后门禁必须失败");
});

test("widget store previews refresh real data and separate size selection from commit", () => {
    // T-7223：商店内容区必须保留可见关闭动作，避免主题裁掉原生标题栏后无法退出。
    assert.match(storeUiSource, /sw-home-store__close-bar/);
    assert.match(storeUiSource, /sw-home-store__close/);
    assert.match(storeUiSource, /closeButton\.addEventListener\("click", \(\) => storeDialog\.destroy\(\)\)/,
        "组件商店必须提供内容区关闭按钮并销毁当前 Dialog");
    assert.match(storeUiSource, /controller\.mount\(\);\s*const markPreviewReady = \(\) =>/);
    assert.match(storeUiSource, /homeStoreApplySize/);
    assert.match(storeUiSource, /homeStoreAdd/);
    assert.match(storeUiSource, /tile\.dataset\.size = sizeKey/);
    assert.match(storeUiSource, /sw-home-store__add/);
    assert.match(storeUiSource, /selectedTile\?\.classList\.remove\("is-selected"\)/);
    assert.match(storeUiSource, /sw-home-store__availability/);
    assert.match(storeUiSource, /homeStoreAvailabilityConditional/);
    assert.match(storeUiSource, /sw-home-store__availability--\$\{availability\}/); // T-6967：条件可用改由行内徽标表达（chips 收敛）
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
    assert.match(storeUiSource, /resolveWidgetCatalogState\(\[\.\.\.activeIds\], \[\.\.\.instanceByModule\.keys\(\)\], \[\.\.\.instanceByModule\.keys\(\)\]\)/);
    assert.match(storeUiSource, /homeStoreProviderUnavailable/);
    assert.match(storeUiSource, /homeStoreProviderUnknown/, "孤儿实例（目录未登记）必须走专用提示文案（T-7071）");
    assert.match(storeUiSource,/sw-home-store__remove-unavailable/);
    assert.match(secondPanelSource, /homeModuleChangeListeners\.add\(handleModuleChange\)/);
    assert.match(storeUiSource, /homeModuleChangeListeners\.delete\(handleModuleChange\)/);
    assert.match(storeUiSource, /btn\.dataset\.tabFilter = tab\.category \|\| "all"/);
    assert.match(storeUiSource, /homeStoreTabAdded/);
    assert.match(storeUiSource, /homeStoreNoResults/);
    assert.match(storeUiSource, /let storeQuery = ""/);
    assert.match(storeUiSource, /let storeTab = "all"/);
    assert.match(storeUiSource, /let storeSort = persistedStoreState.sort || "relevance"/);
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
    assert.match(secondPanelSource, /clearDeferredRefreshes\(\)/);
    assert.match(secondPanelSource, /panelEventCleanup\?\.\(\)/);
    assert.match(configFormSource, /field\.type === "document"/);
    assert.match(configFormSource, /this\.currentDocumentSetEntries\(\)\.slice\(0, 40\)/);
    assert.match(configFormSource, /input\.type = "date"/);
    assert.match(configFormSource, /input\.min = "1900-01-01"/);
    assert.match(configFormSource, /input:invalid, select:invalid/);
    assert.match(configFormSource, /runNotebookLoad\(/, '笔记本字段必须通过统一加载回执助手渲染');
    assert.match(readSourceText(path.join(root, 'src', 'notebook-load-ui.js')), /setOption\(select, "", labels\.placeholder\)/,
        '成功态必须保留笔记本占位选项');
    assert.match(configFormSource, /homeConfigUnavailableValue/);
    assert.match(configFormSource, /homeConfigReset/);
    assert.match(secondPanelSource, /sw-home__empty-store/);
    assert.match(secondPanelSource, /homeEmptyOpenStore/);
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
    assert.match(storeCardStyles, /\.sw-home-store__detail-head\s*\{/);
    assert.match(storeCardStyles, /\.sw-home-store__detail-actions\s*\{/);
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

// T-7069：calendar#17 宿主侧修复契约——第三方组件不被归一化清除 + 预览反映所选尺寸。
test("third-party home modules survive host normalization and store preview honors selected size (T-7069, calendar#17)", () => {
    // P1：getHomeState 必须把 homeThirdPartyIds 纳入归一化允许名单
    assert.match(source, /const persisted = new Set<string>\(\(\(raw && Array\.isArray\(raw\.instances\)\) \? raw\.instances : \[\]\)\s*\n\s*\.map\(\(item: \{moduleId\?: unknown\}\) => String\(item\?\.moduleId \|\| ""\)\)\.filter\(Boolean\)\);/,
        "getHomeState 必须把已持久化实例 moduleId 并入允许名单（禁用/重载保留，ADR 0103）");
    assert.match(source, /return normalizeHomeState\(raw, new Set\(\[\.\.\.this\.homeThirdPartyIds, \.\.\.persisted\]\)\);/,
        "getHomeState 必须透传运行时注册 + 持久化双来源允许名单（否则商店添加即被清除）");
    assert.match(source, /registerHomeModule[\s\S]{0,2200}?this\.homeThirdPartyIds\.add\(moduleId\);/,
        "registerHomeModule 成功后必须登记允许名单");
    // P2：预览对话框必须优先用户所选尺寸，而非恒 medium
    assert.match(storeUiSource, /const sizeKey = preferredSize && sizes\.includes\(preferredSize\) \? preferredSize : \(sizes\.includes\("medium"\) \? "medium" : sizes\[0\]\);/,
        "预览尺寸必须优先用户所选档位");
    assert.match(storeUiSource, /const previewSize = selectedLayout\?\.size \|\| resolveHomeTileDefaultSize\(storeSelectedModule, supportedSizes, "medium"\)/,
        "内联预览必须使用卡片当前已添加尺寸或同一默认档位");
    assert.match(storeUiSource, /buildReadyCard\(storeSelectedModule, detailDef, "detail", inlinePreview\.mount\.setSize\)/,
        "尺寸按钮必须把变化同步到内联预览");
    // T-7231：详情栏只借用卡片的标题和尺寸动作，不能把第二份完整卡片
    // 再挂到实时预览之后，否则右栏会出现重复预览和不清晰的滚动层级。
    assert.match(storeUiSource, /const detailHead = detailCard\.querySelector<HTMLElement>\("\.sw-home-store__card-head"\)/);
    assert.match(storeUiSource, /detailPane\.appendChild\(inlinePreview\.section\)/);
    assert.match(storeUiSource, /detailSizes\.classList\.add\("sw-home-store__detail-actions"\)/);
    assert.match(storeUiSource, /detailPane\.removeAttribute\("aria-labelledby"\)/);
    assert.match(storeUiSource, /detailPane\.setAttribute\("aria-labelledby", detailTitle\.id\)/);
    assert.doesNotMatch(storeUiSource, /detailPane\.appendChild\(buildReadyCard\(storeSelectedModule, detailDef, "detail", inlinePreview\.mount\.setSize\)\)/,
        "详情栏不得把完整目录卡和实时预览重复挂载");
    const injectedDuplicate = storeUiSource.replace(
        "detailPane.appendChild(inlinePreview.section);",
        "detailPane.appendChild(inlinePreview.section); detailPane.appendChild(buildReadyCard(storeSelectedModule, detailDef, \"detail\", inlinePreview.mount.setSize));",
    );
    assert.match(injectedDuplicate, /detailPane\.appendChild\(buildReadyCard\(storeSelectedModule, detailDef, "detail", inlinePreview\.mount\.setSize\)\)/,
        "负向注入必须能识别重复详情卡");
});
