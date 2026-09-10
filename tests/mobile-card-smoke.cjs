// UI 烟雾测试：加载 SiYuan 移动端 base CSS + 插件 dist CSS + litheness sprite，
// 验证 .sw__pin / .sw__fav-btn / .sw__close 的计算样式仍是 28×28px，
// 且透明扩展区域保留可命中的触控热区。
// 在 dist/index.css 重新生成后跑一次，发现按钮被异常放大即可立刻定位。
//
// 用法: npm run test:smoke   （前提：已经 npm run build）

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { isDocumentOpenSuccess, openDocumentOnMobile, openDocumentOnDesktop } = require('../src/document-actions.js');
const { ensureTodayJournal } = require('../src/journal-actions.js');

const REPO = path.resolve(__dirname, '..');
const distCss = path.join(REPO, 'dist', 'index.css');
const baseCssPath = process.env.SIYUAN_BASE_CSS || path.join(__dirname, 'fixtures', 'siyuan-mobile-base.css');

if (!fs.existsSync(distCss)) {
    console.error('❌ dist/index.css not found. Run `npm run build` first.');
    process.exit(1);
}
if (!fs.existsSync(baseCssPath)) {
    console.error(`❌ SiYuan CSS fixture not found at: ${baseCssPath}`);
    process.exit(1);
}
const pluginCss = fs.readFileSync(distCss, 'utf-8');
const baseCss = fs.readFileSync(baseCssPath, 'utf-8');
const sprite = '<svg aria-hidden="true" style="display:none"><symbol id="iconPin" viewBox="0 0 24 24"><path d="M12 2v20"/></symbol><symbol id="iconStar" viewBox="0 0 24 24"><path d="M12 2l3 7h7l-6 5 2 8-6-4-6 4 2-8-6-5h7z"/></symbol><symbol id="iconClose" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol></svg>';

const html = `<!DOCTYPE html><html><body>${sprite}
<div class="speed-switch sw__body sw__mobile">
  <div class="sw__grid sw__mobile-grid">
    <div class="sw__card sw__mobile-card">
      <div class="sw__thumb"></div>
      <div class="sw__meta">
        <span class="sw__icon"><svg><use xlink:href="#iconFile"></use></svg></span>
        <span class="sw__title">Test doc</span>
      </div>
      <div class="sw__actions">
        <button type="button" class="sw__pin"><svg><use xlink:href="#iconPin"></use></svg></button>
        <button type="button" class="sw__fav-btn"><svg><use xlink:href="#iconStar"></use></svg></button>
        <button type="button" class="sw__close"><svg><use xlink:href="#iconClose"></use></svg></button>
      </div>
    </div>
  </div>
</div>
<div class="b3-dialog"><div class="sw-settings__item">
  <div class="sw-settings__item-main"><div class="sw-settings__item-title">Setting</div></div>
  <div class="sw-settings__item-action"><label class="b3-switch sw-switch"><input type="checkbox"><span></span></label></div>
</div></div>
<div class="speed-switch"><section class="sw__home-module" data-status="error" role="region" aria-busy="false">
  <div class="sw__home-module-header"><h3 class="sw__home-module-title">Home</h3></div>
  <div class="sw__home-module-body"><p class="sw__home-module-status sw__home-module-status--error" role="alert">暂时无法加载</p></div>
</section></div>
<style>${baseCss}</style>
<style>${pluginCss}</style>
<style>
  /* Simulate a theme loaded after the plugin with broad tooltip rules. */
  .b3-tooltips { width: 100%; height: 88px; min-width: 100%; padding: 20px; line-height: 4; }
</style>
</body></html>`;

const dom = new JSDOM(html, {pretendToBeVisual: true});
const doc = dom.window.document;

const card = doc.querySelector('.sw__mobile-card');
const pin = doc.querySelector('.sw__pin');
const fav = doc.querySelector('.sw__fav-btn');
const close = doc.querySelector('.sw__close');

function rect(el) {
    // jsdom 不做 layout，使用 inline class 规则 + 内联样式来推断
    const cs = dom.window.getComputedStyle(el);
    return {
        width: cs.width,
        height: cs.height,
        position: cs.position,
        bottom: cs.bottom,
        right: cs.right,
        display: cs.display,
        pointerEvents: cs.pointerEvents,
    };
}

const expected = '28px';
const actionTargets = [
    ['sw__pin', pin],
    ['sw__fav-btn', fav],
    ['sw__close', close],
];
let allPassed = true;
for (const [name, el] of actionTargets) {
    const r = rect(el);
    const passed = el.tagName === 'BUTTON' && !el.classList.contains('b3-tooltips')
        && r.width === expected && r.height === expected && r.position === 'absolute'
        && r.pointerEvents !== 'none';
    console.log(`${passed ? '✅' : '❌'} action ${name}: ${r.width}x${r.height} ${r.position} pointer-events=${r.pointerEvents}`);
    if (!passed) allPassed = false;
}

// 图标：min-width/height 防御 SVG 加载失败导致塌陷
const icon = doc.querySelector('.sw__icon');
const iconR = rect(icon);
const iconOk = iconR.width !== '0px' && iconR.height !== '0px' && iconR.display !== 'none';
console.log(`${iconOk ? '✅' : '❌'} icon .sw__icon: ${iconR.width}x${iconR.height} display=${iconR.display}`);
if (!iconOk) allPassed = false;

// 卡片整体存在且可见（jsdom 不计算 layout，只检查 display/visibility 而非像素尺寸）
const cardR = rect(card);
const cardOk = card !== null && cardR.display !== 'none';
console.log(`${cardOk ? '✅' : '❌'} card .sw__mobile-card: ${cardR.width}x${cardR.height} display=${cardR.display}`);
if (!cardOk) allPassed = false;

// 网格：手机端默认单列（grid-template-columns 应只有一列）
const grid = doc.querySelector('.sw__mobile-grid');
const gridCs = dom.window.getComputedStyle(grid);
const gridCols = (gridCs.gridTemplateColumns || '').split(' ').filter((s) => s && s !== 'none').length;
const gridOk = gridCols === 1;
console.log(`${gridOk ? '✅' : '❌'} mobile grid columns: ${gridCols} (expected 1)`);
if (!gridOk) allPassed = false;

// 缩略图占位：必须存在（即便内容为空也是渲染的入口）
const thumb = doc.querySelector('.sw__thumb');
const thumbR = rect(thumb);
const thumbOk = thumb !== null;
console.log(`${thumbOk ? '✅' : '❌'} thumb .sw__thumb present: ${thumbR.width}x${thumbR.height}`);
if (!thumbOk) allPassed = false;

console.log(`\n${allPassed ? '✅ mobile card smoke passed' : '❌ mobile card smoke failed'}`);
const settingSwitch = doc.querySelector('.sw-settings__item-action .sw-switch');
const switchCs = dom.window.getComputedStyle(settingSwitch);
const switchOk = switchCs.width === '42px' && switchCs.height === '24px' && switchCs.position === 'relative';
console.log(`${switchOk ? 'PASS' : 'FAIL'} settings switch: ${switchCs.width}x${switchCs.height} ${switchCs.position}`);
if (!switchOk) allPassed = false;

const homeModule = doc.querySelector('.sw__home-module');
const homeStatus = doc.querySelector('.sw__home-module-status');
const homeCs = dom.window.getComputedStyle(homeModule);
const homeStatusCs = dom.window.getComputedStyle(homeStatus);
const homeOk = homeModule && homeStatus && homeCs.display === 'flex'
    && homeCs.borderRadius !== '0px' && homeStatusCs.minHeight === '54px';
console.log(`${homeOk ? 'PASS' : 'FAIL'} opt-in home module states: ${homeCs.display} radius=${homeCs.borderRadius} min-height=${homeStatusCs.minHeight}`);
if (!homeOk) allPassed = false;
const homePanelCssOk = pluginCss.includes('.sw__home-panel')
    && pluginCss.includes('.sw__home-panel-module');
console.log(`${homePanelCssOk ? 'PASS' : 'FAIL'} opt-in home panel layout`);
if (!homePanelCssOk) allPassed = false;
// Visual language contract: the first/second panels and mobile surface must
// ship the shared lavender + blue-grey tokens, elevated cards and safe-area
// spacing.  This catches accidental removal of the redesign during refactors
// without asserting browser-specific color interpolation values.
const visualTokensOk = pluginCss.includes('--sw-accent-soft')
    && pluginCss.includes('--sw-page-bg')
    && pluginCss.includes('--sw-radius-panel')
    && pluginCss.includes('--sw-float-shadow')
    && pluginCss.includes('.sw__home-module-header')
    && pluginCss.includes('env(safe-area-inset-bottom');
console.log(`${visualTokensOk ? 'PASS' : 'FAIL'} shared lavender/blue-grey visual tokens`);
if (!visualTokensOk) allPassed = false;
const source = fs.readFileSync(path.join(REPO, 'src', 'index.ts'), 'utf8');
const mobileToolbarSemanticsOk = source.includes('<button type="button" class="b3-button b3-button--text sw__icon-btn sw__mobile-fav-btn"')
    && source.includes('<button type="button" class="b3-button b3-button--text sw__icon-btn sw__settings-btn"')
    && source.includes('<button type="button" class="b3-button b3-button--text sw__icon-btn sw__mobile-close-btn"');
console.log(`${mobileToolbarSemanticsOk ? 'PASS' : 'FAIL'} mobile toolbar controls use button semantics`);
if (!mobileToolbarSemanticsOk) allPassed = false;
const documentActionsSource = fs.readFileSync(path.join(REPO, 'src', 'document-actions.js'), 'utf8');
const homePanelSource = fs.readFileSync(path.join(REPO, 'src', 'home-panel.js'), 'utf8');
const homeViewSource = fs.readFileSync(path.join(REPO, 'src', 'home-view.js'), 'utf8');
const homeAdapterSource = fs.readFileSync(path.join(REPO, 'src', 'home-adapters.js'), 'utf8');
const homeRuntimeSource = fs.readFileSync(path.join(REPO, 'src', 'home-runtime.js'), 'utf8');
const agentSource = fs.readFileSync(path.join(REPO, 'src', 'agent-capabilities.js'), 'utf8');
const documentSetSource = fs.readFileSync(path.join(REPO, 'src', 'document-sets.js'), 'utf8');
const documentSetContractOk = source.includes('"documentSets"')
    && source.includes('buildSettingsDocumentSets')
    && source.includes('createDocumentSet')
    && source.includes('planDocumentSetRestore')
    && source.includes('documentSetRestoreConfirm')
    && source.includes('probeDocumentSetEntries')
    && source.includes('/api/filetree/getDoc')
    && source.includes('mobileOpenDoc(entry.rootId)')
    && source.includes('restoreController.abort()')
    && source.includes('documentSetRestoreCancelled')
    && source.includes('documentSetRestoreSkipped')
    && source.includes('documentSetRestoreMissing')
    && source.includes('!restore.isConnected')
    && source.includes('this.isUnloading || !restore.isConnected')
    && source.includes('activeDocumentSetRestoreControllers')
    && source.includes('this.activeDocumentSetRestoreControllers.forEach((controller) => controller.abort())')
    && source.includes('const workers = Math.min(DOCUMENT_SET_PROBE_CONCURRENCY, queue.length)')
    && source.includes('await Promise.all(Array.from({length: workers}, () => worker()))')
    && source.includes('DOCUMENT_SET_PROBE_TIMEOUT_MS')
    && source.includes('Promise.race([request, timeout])')
    && source.includes('DOCUMENT_SET_IMPORT_MAX_BYTES')
    && source.includes('file.size > DOCUMENT_SET_IMPORT_MAX_BYTES')
    && source.includes('documentSetImportFailed')
    && source.includes('documentSetImportConfirm')
    && source.includes('documentSetUnknownConfirm')
    && source.includes('importButton.setAttribute("aria-busy", "true")')
    && source.includes('importButton.removeAttribute("aria-busy")')
    && source.includes('siyuan-speed-switch-document-sets.json')
    && source.includes('editingSetId')
    && source.includes('event.key === "Enter"')
    && source.includes('event.key === "Escape"')
    && source.includes('data-document-set-rename')
    && source.includes('focusRenameAction')
    && source.includes('mergeDocumentSets')
    && documentSetSource.includes('DOCUMENT_SET_SCHEMA_VERSION');
console.log(`${documentSetContractOk ? 'PASS' : 'FAIL'} document-set settings and restore preview contract`);
if (!documentSetContractOk) allPassed = false;
const homePanelBusyOk = homePanelSource.includes('panel.setAttribute("aria-busy", "true")')
    && homePanelSource.includes('panel.setAttribute("aria-busy", "false")');
console.log(`${homePanelBusyOk ? 'PASS' : 'FAIL'} home panel busy-state lifecycle`);
if (!homePanelBusyOk) allPassed = false;
const homePanelDedupeOk = homePanelSource.includes('const seenModuleIds = new Set()')
    && homePanelSource.includes('seenModuleIds.has(moduleId)')
    && homePanelSource.includes('modules.push({...module, moduleId})');
console.log(`${homePanelDedupeOk ? 'PASS' : 'FAIL'} home panel module-id de-duplication`);
if (!homePanelDedupeOk) allPassed = false;
const homePanelGenerationOk = homePanelSource.includes('let refreshGeneration = 0')
    && homePanelSource.includes('const generation = ++refreshGeneration')
    && homePanelSource.includes('generation === refreshGeneration');
console.log(`${homePanelGenerationOk ? 'PASS' : 'FAIL'} home panel overlapping-refresh guard`);
if (!homePanelGenerationOk) allPassed = false;
const homePanelFailureBoundaryOk = homePanelSource.includes('try {\n                    const moduleConfig =')
    && homePanelSource.includes('typeof controller.showError === "function"')
    && homePanelSource.includes('const view = typeof controller.showError === "function"')
    && homePanelSource.includes(': results.some((result) => result?.ok === false) ? "failed" : ""')
    && homePanelSource.includes('results.some((result) => result?.reason === "aborted") ? "aborted"')
    && homePanelSource.includes('results.some((result) => result?.reason === "disposed") ? "disposed"');
console.log(`${homePanelFailureBoundaryOk ? 'PASS' : 'FAIL'} home panel per-module failure boundary`);
if (!homePanelFailureBoundaryOk) allPassed = false;
const homeControllerSource = fs.readFileSync(path.join(REPO, 'src', 'home-controller.js'), 'utf8');
const homeControllerSignalOk = homeControllerSource.includes('const externalSignal = readOptions && typeof readOptions.signal === "object" ? readOptions.signal : null')
    && homeControllerSource.includes('externalSignal.addEventListener("abort", externalAbortHandler, {once: true})')
    && homeControllerSource.includes('externalSignal.removeEventListener("abort", externalAbortHandler)')
    && homeControllerSource.includes('if (externalSignal?.aborted) {')
    && homeControllerSource.includes('return {ok: false, reason: "aborted", view: currentView};');
console.log(`${homeControllerSignalOk ? 'PASS' : 'FAIL'} home controller external cancellation bridge`);
if (!homeControllerSignalOk) allPassed = false;
const homeFocusRestoreOk = homeControllerSource.includes('let pendingFocusKey = null;')
    && homeControllerSource.includes('typeof container.contains === "function"')
    && homeControllerSource.includes('active.dataset?.focusKey')
    && homeControllerSource.includes('focusTarget.focus({preventScroll: true})')
    && homeControllerSource.includes('pendingFocusKey = null;')
    && homeViewSource.includes('const focusKeys = new Map();')
    && homeViewSource.includes('const usedFocusKeys = new Set();')
    && homeViewSource.includes('while (usedFocusKeys.has(focusKey))')
    && homeViewSource.includes('button.dataset.focusKey = focusKey;')
    && homeControllerSource.includes('if (view.status !== "loading") pendingFocusKey = null;');
console.log(`${homeFocusRestoreOk ? 'PASS' : 'FAIL'} home module focus restoration`);
if (!homeFocusRestoreOk) allPassed = false;
const homeToggleContractOk = homeControllerSource.includes('function toggle()')
    && homeControllerSource.includes('onToggle: () => toggle()')
    && homeControllerSource.includes('return {mount, refresh, toggle, showError, dispose')
    && homePanelSource.includes('function toggle(moduleId)')
    && homePanelSource.includes('toggle,');
console.log(`${homeToggleContractOk ? 'PASS' : 'FAIL'} home module collapse toggle contract`);
if (!homeToggleContractOk) allPassed = false;
const homeIconContractOk = homeViewSource.includes('function renderModuleIcon(doc, value)')
    && homeViewSource.includes('^icon[A-Za-z][A-Za-z0-9_-]*$')
    && homeViewSource.includes('sw__home-module-icon--text')
    && pluginCss.includes('.sw__home-module-icon');
console.log(`${homeIconContractOk ? 'PASS' : 'FAIL'} home module icon rendering contract`);
if (!homeIconContractOk) allPassed = false;
const homeMetaContractOk = homeViewSource.includes('function formatUpdatedAt(value)')
    && homeViewSource.includes('sw__home-module-meta')
    && pluginCss.includes('.sw__home-module-meta');
console.log(`${homeMetaContractOk ? 'PASS' : 'FAIL'} home module metadata contract`);
if (!homeMetaContractOk) allPassed = false;
const homePanelEmptyContractOk = homePanelSource.includes('sw__home-panel-empty')
    && homePanelSource.includes('empty.setAttribute("role", "status")')
    && pluginCss.includes('.sw__home-panel-empty');
console.log(`${homePanelEmptyContractOk ? 'PASS' : 'FAIL'} home panel empty-state contract`);
if (!homePanelEmptyContractOk) allPassed = false;
const searchSubTypeContractOk = source.includes('const subTypeOptions')
    && source.includes('label: this.i18n.searchSubType')
    && source.includes('next.subTypes = Object.freeze({[value]: true})')
    && source.includes('delete next.types');
console.log(`${searchSubTypeContractOk ? 'PASS' : 'FAIL'} search subtype filter contract`);
if (!searchSubTypeContractOk) allPassed = false;
const searchFilterSummaryContractOk = source.includes('getDocSearchFilterSummary(filters, scrollElement)')
    && source.includes('button.setAttribute("aria-label", accessibleLabel)')
    && source.includes('this.i18n.searchFilterNotebook')
    && source.includes('this.i18n.searchSubType');
console.log(`${searchFilterSummaryContractOk ? 'PASS' : 'FAIL'} search filter summary contract`);
if (!searchFilterSummaryContractOk) allPassed = false;
const searchFilterBadgeContractOk = source.includes('button.dataset.filterCount = count > 0 ? String(Math.min(9, count)) : "";')
    && (pluginCss.includes('content: attr(data-filter-count)') || pluginCss.includes('content:attr(data-filter-count)'))
    && (pluginCss.includes('border: 2px solid var(--b3-theme-surface)') || pluginCss.includes('border:2px solid var(--b3-theme-surface)'));
console.log(`${searchFilterBadgeContractOk ? 'PASS' : 'FAIL'} search filter count badge contract`);
if (!searchFilterBadgeContractOk) allPassed = false;
const searchFilterFocusContractOk = source.includes('const onMenuKeyDown = (event: KeyboardEvent)')
    && source.includes('button.focus({preventScroll: true})')
    && source.includes('document.addEventListener("keydown", onMenuKeyDown, true)')
    && source.includes('document.removeEventListener("keydown", onMenuKeyDown, true)');
console.log(`${searchFilterFocusContractOk ? 'PASS' : 'FAIL'} search filter focus recovery contract`);
if (!searchFilterFocusContractOk) allPassed = false;
const settingsTabScrollContractOk = source.includes('const ensureTabVisible = (key: string, behavior: ScrollBehavior = "auto")')
    && source.includes('tabs.scrollTo({left: nextLeft, behavior: scrollBehavior})')
    && source.includes('window.matchMedia("(prefers-reduced-motion: reduce)")')
    && source.includes('ensureTabVisible(key, persist ? "smooth" : "auto")')
    && source.includes('tabs.setAttribute("aria-label", this.i18n.settings)')
    && source.includes('tabs.setAttribute("aria-orientation", horizontalTabs ? "horizontal" : "vertical")')
    && source.includes('window.addEventListener("resize", onSettingsResize)')
    && source.includes('window.removeEventListener("resize", onSettingsResize)')
    && source.includes('p.hidden = !active')
    && source.includes('p.setAttribute("aria-hidden", active ? "false" : "true")')
    && pluginCss.includes('.sw-settings__tab:focus-visible')
    && (pluginCss.includes('touch-action: pan-x') || pluginCss.includes('touch-action:pan-x'))
    && (pluginCss.includes('scroll-snap-type: x proximity') || pluginCss.includes('scroll-snap-type:x proximity'));
console.log(`${settingsTabScrollContractOk ? 'PASS' : 'FAIL'} settings tab scroll visibility contract`);
if (!settingsTabScrollContractOk) allPassed = false;
const adapterCleanupOk = homeAdapterSource.includes('clearTimeout(timeoutHandle)')
    && homeAdapterSource.includes('removeEventListener("abort", abortHandler)')
    && homeAdapterSource.includes('typeof signal.addEventListener === "function"')
    && homeAdapterSource.includes('typeof signal.removeEventListener === "function"');
console.log(`${adapterCleanupOk ? 'PASS' : 'FAIL'} home adapter timeout and abort cleanup`);
if (!adapterCleanupOk) allPassed = false;
const homeStatusLiveOk = homeViewSource.includes('status.setAttribute("aria-live", view.status === "error" ? "assertive" : "polite")');
console.log(`${homeStatusLiveOk ? 'PASS' : 'FAIL'} home module status live-region semantics`);
if (!homeStatusLiveOk) allPassed = false;
const homeA11yOk = homeViewSource.includes('root.setAttribute("aria-labelledby", titleId)')
    && homeViewSource.includes('root.setAttribute("aria-expanded", view.collapsed === true ? "false" : "true")')
    && homeViewSource.includes('body.setAttribute("aria-hidden", view.collapsed === true ? "true" : "false")')
    && pluginCss.includes('.sw__home-module-toggle:focus-visible')
    && homeViewSource.includes('title.id = titleId')
    && homeViewSource.includes('function instanceHash(value)')
    && homeViewSource.includes('const instanceKey = `${instanceHash(view.moduleId)}-${renderSequence}`')
    && homeViewSource.includes('const bodyId = `sw-home-body-${instanceKey}`')
    && homeViewSource.includes('toggle.setAttribute("aria-controls", bodyId)')
    && homeViewSource.includes('body.id = bodyId');
console.log(`${homeA11yOk ? 'PASS' : 'FAIL'} home module title accessibility linkage`);
if (!homeA11yOk) allPassed = false;
const responsiveRulesOk = pluginCss.includes('.sw__quick-actions--icons')
    && pluginCss.includes('.sw__quick-actions--hidden')
    && pluginCss.includes('.sw-settings-dialog')
    && pluginCss.includes('.sw__mobile-toolbar')
    && pluginCss.includes('--sw-radius-control')
    && pluginCss.includes('.sw__history-section-title')
    && pluginCss.includes('.sw__home-module')
    && pluginCss.includes('.sw__home-module-status--error')
    && pluginCss.includes('env(safe-area-inset-bottom, 0px)')
    && pluginCss.includes('prefers-reduced-motion: reduce')
    && /z-index:\s*2147483647/.test(pluginCss)
    && source.includes("sortButton.innerHTML = '<svg><use xlink:href=\"#iconSort\"></use></svg>'");
console.log(`${responsiveRulesOk ? 'PASS' : 'FAIL'} responsive quick actions, mobile settings, and icon sort rules`);
if (!responsiveRulesOk) allPassed = false;

const stateSemanticsOk = pluginCss.includes('.sw__empty-title')
    && pluginCss.includes('.sw__doc-status--error')
    && pluginCss.includes('color-mix(in srgb, var(--b3-theme-error)')
    && pluginCss.includes('.sw__mobile-sheet-empty')
    && source.includes('empty.setAttribute("role", "status")')
    && source.includes('empty.setAttribute("aria-live", "polite")')
    && source.includes('status.setAttribute("role", state === "error" ? "alert" : "status")')
    && source.includes('loading.setAttribute("role", "status")')
    && source.includes('box.setAttribute("aria-busy", state === "loading" ? "true" : "false")');
console.log(`${stateSemanticsOk ? 'PASS' : 'FAIL'} shared empty/loading/error state semantics`);
if (!stateSemanticsOk) allPassed = false;

const homeMountContractOk = source.includes('public registerHomeModule')
    && source.includes('public createHomeModuleController')
    && source.includes('public createHomePanelController')
    && source.includes('registration.unregister()')
    && source.includes('no default panel is created here')
    && source.includes('if (!module || !container')
    && source.includes('this.homeRuntime.listModules(device)');
console.log(`${homeMountContractOk ? 'PASS' : 'FAIL'} explicit home-module mount contract`);
if (!homeMountContractOk) allPassed = false;
const homeControllerTypeContractOk = source.includes('showError: (reason?: string) => unknown;')
    && source.includes('Promise<{ok: boolean; reason: string; view: unknown}>')
    && source.includes('Promise<{ok: boolean; reason: string; results: Array<{ok: boolean; reason: string; view: unknown}>}>')
    && homeControllerSource.includes('return {mount, refresh, toggle, showError, dispose, getView: () => currentView};')
    && homePanelSource.includes('toggle,');
console.log(`${homeControllerTypeContractOk ? 'PASS' : 'FAIL'} home controller error-state type contract`);
if (!homeControllerTypeContractOk) allPassed = false;
const homeReadonlyBoundaryOk = homeRuntimeSource.includes('readOnly: true')
    && homeRuntimeSource.includes('public home-module boundary is intentionally read-only');
console.log(`${homeReadonlyBoundaryOk ? 'PASS' : 'FAIL'} home module read-only registration boundary`);
if (!homeReadonlyBoundaryOk) allPassed = false;

const filterLifecycleOk = source.includes('let notebooks: Array<{id: string; name: string}> = [];')
    && source.includes('logger.warn("load search filter notebooks fail", error)')
    && source.includes('if (button.isConnected) {')
    && source.includes('button.removeAttribute("aria-busy");');
console.log(`${filterLifecycleOk ? 'PASS' : 'FAIL'} search filter host-error lifecycle recovery`);
if (!filterLifecycleOk) allPassed = false;

const globalEventLifecycleOk = source.includes('private globalEventHandlers: {')
    && source.includes('if (this.globalEventHandlers) return;')
    && source.includes('this.eventBus.off("switch-protyle", globalEventHandlers.switchProtyle)')
    && source.includes('this.eventBus.off("loaded-protyle-static", globalEventHandlers.loadedProtyle)')
    && source.includes('this.eventBus.off("destroy-protyle", globalEventHandlers.destroyProtyle)');
console.log(`${globalEventLifecycleOk ? 'PASS' : 'FAIL'} host event listener lifecycle cleanup`);
if (!globalEventLifecycleOk) allPassed = false;
const switcherRefreshFallbackOk = source.includes('private switcherRefreshFrameCancel: (() => void) | null = null;')
    && source.includes('if (typeof requestAnimationFrame === "function")')
    && source.includes('this.switcherRefreshFrameCancel = () => window.clearTimeout(timer);')
    && source.includes('this.switcherRefreshFrameCancel?.();');
console.log(`${switcherRefreshFallbackOk ? 'PASS' : 'FAIL'} switcher refresh frame fallback`);
if (!switcherRefreshFallbackOk) allPassed = false;

const searchSourceUiOk = pluginCss.includes('.sw__doc-source')
    && source.includes('this.i18n.docSearchSourceOpened')
    && source.includes('this.i18n.docSearchSourceGlobal')
    && source.includes('docSearchHitId')
    && documentActionsSource.includes('cb-get-scroll')
    && source.includes('openDocumentOnDesktop');
console.log(`${searchSourceUiOk ? 'PASS' : 'FAIL'} search result source labels`);
if (!searchSourceUiOk) allPassed = false;

const searchViewAllOk = source.includes('buildNativeSearchTabConfig')
    && source.includes('this.i18n.docSearchViewAll')
    && source.includes('className = "sw__doc-view-all')
    && source.includes('search: search.config')
    && pluginCss.includes('.sw__doc-view-all');
console.log(`${searchViewAllOk ? 'PASS' : 'FAIL'} native search view-all escape hatch`);
if (!searchViewAllOk) allPassed = false;

// Sort is presented by a body-level sheet on touch devices. Keep a structural
// guard for the six native sort values and the owner-lifecycle cleanup so a
// host Dialog cannot leave a stale, lower-layer portal behind.
const sortLifecycleOk = [
    'mru: this.i18n.sortMru',
    'layout: this.i18n.sortLayout',
    'layoutDesc: this.i18n.sortLayoutDesc',
    'updatedDesc: this.i18n.sortUpdatedDesc',
    'titleAsc: this.i18n.sortTitleAsc',
    'titleDesc: this.i18n.sortTitleDesc',
].every((line) => source.includes(line))
    && source.includes('document.addEventListener("keydown", onDocumentKeyDown, true)')
    && source.includes('document.removeEventListener("keydown", onDocumentKeyDown, true)')
    && source.includes('list.setAttribute("role", "menu")')
    && source.includes('item.setAttribute("role", "menuitemradio")')
    && source.includes('item.tabIndex = value === sortSelect.value ? 0 : -1')
    && source.includes('event.key !== "ArrowDown" && event.key !== "ArrowUp"')
    && source.includes('overlay.addEventListener("click", (event) =>')
    && source.includes('return () => {');
console.log(`${sortLifecycleOk ? 'PASS' : 'FAIL'} mobile sort options and lifecycle cleanup`);
if (!sortLifecycleOk) allPassed = false;

const mobileTabMetadataOk = source.includes("notebookId: t.current!.notebookID")
    && source.includes("path: t.current!.path");
console.log(`${mobileTabMetadataOk ? 'PASS' : 'FAIL'} SiYuan 3.8.3 MobileTabs search metadata`);
if (!mobileTabMetadataOk) allPassed = false;

const searchFilterUiOk = (source.match(/class="sw__search-filter-btn/g) || []).length === 3
    && source.includes('new Menu("swSearchFilter")')
    && source.includes('label: this.i18n.searchContentType')
    && source.includes('label: this.i18n.searchMethod')
    && source.includes('label: this.i18n.searchResultOrder')
    && source.includes('label: this.i18n.searchResetFilters')
    && source.includes('this.docSearchFilters.set(scrollElement, Object.freeze(next))')
    && source.includes('if (!canUseTitleSearch(filters))')
    && source.includes('this.runOpenedDocumentContentSearch(keyword, signal, filters)')
    && source.includes('card.dataset.notebookId = resolveSearchNotebookId(tab as unknown)')
    && pluginCss.includes('.sw__search-filter-btn')
    && pluginCss.includes('.sw__search-filter-btn.sw__active');
console.log(`${searchFilterUiOk ? 'PASS' : 'FAIL'} shared notebook search filter`);
if (!searchFilterUiOk) allPassed = false;
const agentSubtypeContractOk = agentSource.includes('normalizeAgentSearchSubType')
    && agentSource.includes('subType: {type: "string", enum: SEARCH_SUBTYPES}')
    && source.includes('const subType = normalizeAgentSearchSubType(args.subType)')
    && source.includes('filters.subTypes = {[subType]: true};');
console.log(`${agentSubtypeContractOk ? 'PASS' : 'FAIL'} Agent subtype filter contract`);
if (!agentSubtypeContractOk) allPassed = false;
const searchFilterMenuLifecycleOk = source.includes('let activeMenu: Menu | null = null;')
    && source.includes('activeMenu?.close();')
    && source.includes('activeMenu = menu;')
    && source.includes('activeMenu = null;');
console.log(`${searchFilterMenuLifecycleOk ? 'PASS' : 'FAIL'} search filter menu lifecycle cleanup`);
if (!searchFilterMenuLifecycleOk) allPassed = false;
const notebookAbortFallbackOk = source.includes('const controller = typeof AbortController === "function" ? new AbortController() : null;')
    && source.includes('...(controller ? {signal: controller.signal} : {})')
    && source.includes('Promise.race([request, timeoutPromise])')
    && source.includes('if (timer !== null) window.clearTimeout(timer);');
console.log(`${notebookAbortFallbackOk ? 'PASS' : 'FAIL'} notebook request abort fallback`);
if (!notebookAbortFallbackOk) allPassed = false;
const searchAbortFallbackOk = source.includes('controller = typeof AbortController === "function" ? new AbortController() : null;')
    && source.includes('private async runOpenedDocumentContentSearch(\n        keyword: string,\n        signal?: AbortSignal,')
    && source.includes('private async runFullTextSearchFallback(\n        keyword: string,\n        signal?: AbortSignal,')
    && source.includes('...(signal ? {signal} : {})')
    && source.includes('const signal = controller?.signal;')
    && source.includes('if (controller) this.activeAgentSearchControllers.add(controller);')
    && source.includes('if (controller) this.activeAgentSearchControllers.delete(controller);');
console.log(`${searchAbortFallbackOk ? 'PASS' : 'FAIL'} search and Agent AbortController fallback`);
if (!searchAbortFallbackOk) allPassed = false;

const recentClosedUiOk = source.includes('CLOSED_HISTORY_KEY')
    && source.includes('scheduleRecentClosedSync()')
    && source.includes('syncRecentClosedFromSnapshot(')
    && source.includes('this.eventBus.on("destroy-protyle"')
    && source.includes('entry.source === "closed"')
    && source.includes('this.i18n.clearClosedHistory');
const recentHistorySurfacesOk = (source.match(/class="sw__history-dd/g) || []).length >= 3
    && source.includes('setupOpenHistoryDropdown(dialog.element.querySelector<HTMLElement>(".sw__history-dd"), closeOverlay)')
    && source.includes('this.setupOpenHistoryDropdown(element.querySelector<HTMLElement>(".sw__history-dd"), refresh)')
    && pluginCss.includes('.sw__history-dd--icon');
if (!recentHistorySurfacesOk) allPassed = false;
console.log(`${recentClosedUiOk ? 'PASS' : 'FAIL'} recent-closed event and recovery wiring`);
if (!recentClosedUiOk) allPassed = false;
const recentClosedLifecycleOk = source.includes('private lifecycleGeneration = 0;')
    && source.includes('this.lifecycleGeneration += 1;')
    && source.includes('const generation = this.lifecycleGeneration;')
    && source.includes('if (generation !== this.lifecycleGeneration) return;')
    && source.includes('this.syncRecentClosedFromSnapshot(generation);');
console.log(`${recentClosedLifecycleOk ? 'PASS' : 'FAIL'} recent-closed delayed lifecycle guard`);
if (!recentClosedLifecycleOk) allPassed = false;
console.log(`${recentHistorySurfacesOk ? 'PASS' : 'FAIL'} recent history shared across three surfaces`);

const recentHistoryActionsOk = source.includes('swHistoryItemMenu')
    && source.includes('historyOpenAction')
    && source.includes('historyRemove')
    && source.includes('item.addEventListener("contextmenu"')
    && source.includes('item.addEventListener("touchstart"')
    && source.includes('this.removeClosedHistoryEntry(entry.rootId || entry.key)');
console.log(`${recentHistoryActionsOk ? 'PASS' : 'FAIL'} recent history right-click and long-press actions`);
if (!recentHistoryActionsOk) allPassed = false;
const recentHistoryMenuLifecycleOk = source.includes('private activeHistoryMenu: Menu | null = null;')
    && source.includes('this.closeHistoryMenu();')
    && source.includes('this.activeHistoryMenu = menu;')
    && source.includes('private closeHistoryMenu()')
    && source.includes('private historyDropdownClosers = new WeakMap<HTMLElement, {close: () => void; dispose: () => void}>();')
    && source.includes('private historyDropdownCloseSet = new Set<() => void>();')
    && source.includes('this.historyDropdownCloseSet.forEach((close) => close());')
    && source.includes('const previous = this.historyDropdownClosers.get(container);')
    && source.includes('this.historyDropdownClosers.set(container, {close, dispose});')
    && source.includes('this.historyDropdownClosers.get(container)?.close();');
console.log(`${recentHistoryMenuLifecycleOk ? 'PASS' : 'FAIL'} recent history menu lifecycle cleanup`);
if (!recentHistoryMenuLifecycleOk) allPassed = false;
const sidebarHistoryDisposeOk = source.includes('private sidebarHistoryDropdownDispose: (() => void) | null = null;')
    && source.includes('this.sidebarHistoryDropdownDispose?.();')
    && source.includes('this.sidebarHistoryDropdownDispose = this.bindSidebarToolbarEvents(element, scrollElement, refresh);')
    && source.includes('const disposeHistoryDropdown = this.setupOpenHistoryDropdown(element.querySelector<HTMLElement>(".sw__history-dd"), refresh);');
console.log(`${sidebarHistoryDisposeOk ? 'PASS' : 'FAIL'} sidebar history dropdown disposal`);
if (!sidebarHistoryDisposeOk) allPassed = false;
const saveUnloadGuardOk = source.includes('private isUnloading = false;')
    && source.includes('this.isUnloading = true;')
    && source.includes('if (this.isUnloading) return;')
    && source.includes('this.isUnloading = false;');
console.log(`${saveUnloadGuardOk ? 'PASS' : 'FAIL'} persistence unload write guard`);
if (!saveUnloadGuardOk) allPassed = false;
const resizeObserverFallbackOk = source.includes('if (typeof ResizeObserver !== "function") {')
    && source.includes('this.sidebarResizeObserver = null;')
    && source.includes('this.sidebarResizeObserver = new ResizeObserver');
console.log(`${resizeObserverFallbackOk ? 'PASS' : 'FAIL'} sidebar ResizeObserver fallback`);
if (!resizeObserverFallbackOk) allPassed = false;
const mutationObserverFallbackOk = source.includes('const observer = typeof MutationObserver === "function" ? new MutationObserver')
    && source.includes('observer?.disconnect();')
    && source.includes('observer?.observe(document.body');
console.log(`${mutationObserverFallbackOk ? 'PASS' : 'FAIL'} favorite MutationObserver fallback`);
if (!mutationObserverFallbackOk) allPassed = false;
const mobileFirstFrameFallbackOk = source.includes('let readyFrameCancel: (() => void) | null = null;')
    && source.includes('if (typeof requestAnimationFrame === "function") {')
    && source.includes('readyFrameCancel = () => window.clearTimeout(timer);')
    && source.includes('readyFrameCancel?.();');
console.log(`${mobileFirstFrameFallbackOk ? 'PASS' : 'FAIL'} mobile first-frame scheduler fallback`);
if (!mobileFirstFrameFallbackOk) allPassed = false;
const animationFrameHelperOk = source.includes('private scheduleAnimationFrame(callback: FrameRequestCallback): number')
    && source.includes('return window.setTimeout(() => callback(Date.now()), 16);')
    && source.includes('if (overlay.isConnected) overlay.focus({preventScroll: true})')
    && source.includes('if (sheet.isConnected) sheet.classList.add("sw__mobile-sheet--open")');
console.log(`${animationFrameHelperOk ? 'PASS' : 'FAIL'} mobile transient animation fallback`);
if (!animationFrameHelperOk) allPassed = false;
const documentActionsContractOk = source.includes('openDocumentOnMobile({')
    && source.includes('openDocumentOnDesktop({')
    && fs.existsSync(path.join(REPO, 'src', 'document-actions.js'));
console.log(`${documentActionsContractOk ? 'PASS' : 'FAIL'} shared document-open command adapter`);
if (!documentActionsContractOk) allPassed = false;
const journalActionContractOk = source.includes('ensureTodayJournalAction({')
    && documentActionsSource.includes('openDocumentOnDesktop')
    && fs.existsSync(path.join(REPO, 'src', 'journal-actions.js'));
console.log(`${journalActionContractOk ? 'PASS' : 'FAIL'} shared journal creation command adapter`);
if (!journalActionContractOk) allPassed = false;
const portalUnloadCleanupOk = source.includes('document.querySelectorAll<HTMLElement>(".sw__mobile-sort-overlay, .sw__mobile-sheet-overlay, .sw-quick-icon-picker-overlay")')
    && source.includes(').forEach((overlay) => overlay.remove());');
console.log(`${portalUnloadCleanupOk ? 'PASS' : 'FAIL'} transient portal unload cleanup`);
if (!portalUnloadCleanupOk) allPassed = false;
const intersectionObserverFallbackOk = source.includes('if (typeof IntersectionObserver !== "function") {')
    && source.includes('this.renderThumbBatch(list, batch);')
    && source.includes('const observer = new IntersectionObserver');
console.log(`${intersectionObserverFallbackOk ? 'PASS' : 'FAIL'} thumbnail IntersectionObserver fallback`);
if (!intersectionObserverFallbackOk) allPassed = false;

Promise.resolve().then(async () => {
    const opened = [];
    const openResultCompat = isDocumentOpenSuccess(undefined)
        && isDocumentOpenSuccess(true)
        && isDocumentOpenSuccess('success')
        && !isDocumentOpenSuccess('cancelled');
    const logger = {warn: (...args) => opened.push(args[0])};
    const mobileOk = await openDocumentOnMobile({
        rootId: '20260906120000-aaaaaaa',
        tabs: {open: async () => 'success'},
        openTab: async () => { throw new Error('fallback must not run'); },
        logger,
    });
    const fallbackOk = await openDocumentOnMobile({
        rootId: '20260906120001-bbbbbbb',
        tabs: {},
        openTab: async () => undefined,
        logger,
    });
    const desktopOk = await openDocumentOnDesktop({
        rootId: '20260906120002-ccccccc',
        openTab: async () => undefined,
        logger,
    });
    const desktopCalls = [];
    const desktopHitFallback = await openDocumentOnDesktop({
        rootId: '20260906120004-eeeeeee',
        hitId: '20260906120005-fffffff',
        openTab: async (options) => {
            desktopCalls.push(options.doc);
            if (desktopCalls.length === 1) throw new Error('stale hit');
        },
        logger,
    });
    const rejected = await openDocumentOnMobile({
        rootId: '20260906120003-ddddddd',
        tabs: {open: async () => 'cancelled'},
        openTab: async () => { throw new Error('fallback must not run'); },
        logger,
    });
    const journalId = await ensureTodayJournal({
        notebook: 'box-a',
        fetchImpl: async (endpoint, options) => ({
            ok: endpoint === '/api/filetree/createDailyNote'
                && options?.body === JSON.stringify({notebook: 'box-a'}),
            json: async () => ({code: 0, data: {id: '20260906120006-ggggggg'}}),
        }),
        logger,
    });
    const journalFailure = await ensureTodayJournal({
        notebook: 'box-a',
        fetchImpl: async () => { throw new Error('offline'); },
        logger,
    });
const documentActionsOk = openResultCompat && mobileOk && fallbackOk && desktopOk && desktopHitFallback
        && desktopCalls[0]?.id === '20260906120005-fffffff'
        && desktopCalls[0]?.action?.[0] === 'cb-get-scroll'
        && desktopCalls[1]?.id === '20260906120004-eeeeeee'
        && !rejected;
    const journalActionOk = journalId === '20260906120006-ggggggg' && journalFailure === null;
    console.log(`${documentActionsOk ? 'PASS' : 'FAIL'} document-open command behavior`);
    console.log(`${journalActionOk ? 'PASS' : 'FAIL'} journal creation command behavior`);
    process.exit(allPassed && documentActionsOk && journalActionOk ? 0 : 1);
}).catch((error) => {
    console.error('FAIL document-open command behavior', error);
    process.exit(1);
});
