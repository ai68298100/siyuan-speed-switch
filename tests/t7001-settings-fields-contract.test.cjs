const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {readSourceText} = require('./source-scan.cjs');

const root = path.resolve(__dirname, '..');
const indexSource = readSourceText(path.join(root, 'src', 'index.ts'));
const settingsSource = readSourceText(path.join(root, 'src', 'settings-sections.ts'));
const settingsModelSource = readSourceText(path.join(root, 'src', 'settings-model.js'));
const journalSource = readSourceText(path.join(root, 'src', 'journal-actions.js'));
const homeStoreSource = readSourceText(path.join(root, 'src', 'home-store-ui.ts'));
const secondPanelSource = readSourceText(path.join(root, 'src', 'second-panel-ui.ts'));
const constantsSource = readSourceText(path.join(root, 'src', 'constants.ts'));
const zh = require('../src/i18n/zh-CN.json');
const en = require('../src/i18n/en.json');

test('T-7001 persists the new settings fields with production defaults', () => {
    assert.match(indexSource, /homeStore: \{rememberState: true, defaultViewMode: "grid", retryFailed: true\}/);
    assert.match(indexSource, /journalAutoCreate: true/);
    assert.match(indexSource, /rememberScrollPosition: true/);
    assert.match(settingsModelSource, /homeStore: normalizeHomeStoreState\(source\.homeStore, defaults\.homeStore\)/);
    assert.match(settingsModelSource, /journalAutoCreate: source\.journalAutoCreate === undefined \? true : source\.journalAutoCreate === true/);
    assert.match(settingsModelSource, /rememberScrollPosition: source\.rememberScrollPosition === undefined \? true : source\.rememberScrollPosition === true/);
});

test('T-7001 routes journal opening through create or read-only lookup', () => {
    assert.match(indexSource, /this\.getSettings\(\)\.journalAutoCreate === false\s*\? await this\.findTodayJournal\(notebook\)\s*:\s*await this\.ensureTodayJournal\(notebook\)/);
    assert.match(indexSource, /findTodayJournalAction\(\{notebook, fetchImpl: fetch, logger\}\)/);
    assert.match(journalSource, /fetchImpl\("\/api\/query\/sql"/);
    assert.match(journalSource, /custom-dailynote-\$\{ymd\.replace\(\/-\/g, ""\)\}/);
    assert.doesNotMatch(journalSource, /findTodayJournal[\s\S]*createDailyNote/);
});

test('T-7001 exposes the behavior, journal, workbench, shortcut, and legacy-ball settings', () => {
    for (const key of [
        'rememberScrollPositionLabel', 'rememberScrollPositionTip', 'shortcutBindingsLabel',
        'shortcutBindingsTip', 'shortcutSwitcher', 'shortcutWorkbench', 'journalAutoCreate',
        'journalAutoCreateTip', 'homeStoreRememberStateLabel', 'homeStoreDefaultViewModeLabel',
        'homeStoreRetryFailedLabel', 'floatingBallLegacySidebarHint',
    ]) {
        assert.ok(zh[key], `zh-CN must provide ${key}`);
        assert.ok(en[key], `en must provide ${key}`);
    }
    assert.match(settingsSource, /this\.i18n\.rememberScrollPositionLabel/);
    assert.match(settingsSource, /this\.i18n\.shortcutBindingsLabel/);
    assert.match(settingsSource, /this\.i18n\.journalAutoCreate/);
    assert.match(settingsSource, /this\.i18n\.homeStoreRememberStateLabel/);
    assert.match(settingsSource, /this\.i18n\.floatingBallLegacySidebarHint/);
});

test('T-7001 uses the registered hotkeys as read-only settings guidance', () => {
    assert.match(constantsSource, /export const DEFAULT_HOTKEY = "⌥⇧S"/);
    assert.match(constantsSource, /export const SECOND_PANEL_HOTKEY = "⌥⇧P"/);
    assert.match(settingsSource, /DEFAULT_HOTKEY/);
    assert.match(settingsSource, /SECOND_PANEL_HOTKEY/);
    assert.match(indexSource, /hotkey: DEFAULT_HOTKEY/);
    assert.match(indexSource, /hotkey: SECOND_PANEL_HOTKEY/);
});

test('T-7001 gates workbench scene persistence and per-widget health retry', () => {
    assert.match(homeStoreSource, /const rememberStoreState = savedStoreState\.rememberState !== false/);
    assert.match(homeStoreSource, /if \(!rememberStoreState\) return;/);
    assert.match(homeStoreSource, /defaultViewMode = savedStoreState\.defaultViewMode === "list" \? "list" : "grid"/);
    assert.match(homeStoreSource, /persistedStoreState\.viewMode === "grid"/);
    assert.match(secondPanelSource, /row\.health !== "ok" && this\.getSettings\(\)\.homeStore\?\.retryFailed !== false/);
});

test('T-7001 gates session scroll capture and restore without touching explicit marks', () => {
    assert.match(indexSource, /private captureDocScrollFromElement[\s\S]*?this\.getSettings\(\)\.rememberScrollPosition === false/);
    assert.match(indexSource, /private captureActiveDocScroll[\s\S]*?this\.getSettings\(\)\.rememberScrollPosition === false/);
    assert.match(indexSource, /private applyDocScrollAfterOpen[\s\S]*?this\.getSettings\(\)\.rememberScrollPosition === false/);
    assert.match(indexSource, /setSessionMark\(/);
    assert.match(indexSource, /jumpToSessionMark\(/);
});
