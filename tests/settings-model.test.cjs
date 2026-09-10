const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalizeSettings, resolvePanelSize} = require('../src/settings-model.js');

const defaults = {
    dialogWidth: 880, dialogHeight: 600, columns: 0, thumbHeight: 128,
    sortBy: 'mru', excludedDocks: [], dockDisplay: 'full', sidebarLayout: 'enlarge',
    fullscreen: false, fabEnabled: false, mobileColumns: 2, mobileThumbHeight: 80,
    journalNotebook: '', lastSettingsTab: 'appearance', quickActions: [],
    panelSizeMode: 'adaptive', panelScale: 90,
    quickActionsRightRail: false, quickActionsDisplayDesktop: 'full',
    quickActionsDisplaySidebar: 'full', quickActionsDisplayMobile: 'full',
    quickActionsCollapsedDesktopBottom: false, quickActionsCollapsedDesktopRight: false,
    quickActionsCollapsedSidebar: false, quickActionsCollapsedMobile: false,
};
const options = {
    defaults,
    clamp: (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback,
    normalizeEnum: (value, allowed, fallback) => allowed.includes(String(value)) ? String(value) : fallback,
    ranges: {dialogWidth: [400, 1200], dialogHeight: [300, 900], columns: [0, 6], thumbHeight: [80, 240], mobileColumns: [0, 2], mobileThumbHeight: [60, 160], panelScale: [50, 100]},
    sortBy: ['mru', 'titleAsc'], dockDisplay: ['full', 'hidden'], sidebarLayout: ['enlarge', 'columns'],
    quickActions: () => [{id: 'switch'}],
};

test('settings model normalizes ranges, enums and booleans', () => {
    const result = normalizeSettings({dialogWidth: 9999, columns: 'bad', sortBy: 'invalid', dockDisplay: 'hidden', fullscreen: true, excludedDocks: ['a', 1], journalNotebook: 3}, options);
    assert.equal(result.dialogWidth, 1200);
    assert.equal(result.columns, 0);
    assert.equal(result.sortBy, 'mru');
    assert.equal(result.dockDisplay, 'hidden');
    // Legacy boolean-only data maps onto the size-mode enum.
    assert.equal(result.panelSizeMode, 'fullscreen');
    assert.equal(result.fullscreen, true);
    assert.deepEqual(result.excludedDocks, ['a']);
    assert.equal(result.journalNotebook, '');
    assert.deepEqual(result.quickActions, [{id: 'switch'}]);
});

test('settings model isolates malformed persisted objects and preserves defaults', () => {
    const result = normalizeSettings(null, {...options, quickActions: undefined});
    assert.equal(result.dialogWidth, defaults.dialogWidth);
    assert.equal(result.quickActions.length, 0);
    assert.equal(result.quickActionsDisplayMobile, 'full');
    assert.equal(result.panelSizeMode, 'adaptive');
    assert.equal(result.panelScale, 90);
});

test('panel size mode accepts known values and rejects unknown ones', () => {
    assert.equal(normalizeSettings({panelSizeMode: 'custom'}, options).panelSizeMode, 'custom');
    assert.equal(normalizeSettings({panelSizeMode: 'fullscreen'}, options).panelSizeMode, 'fullscreen');
    assert.equal(normalizeSettings({panelSizeMode: 'bogus'}, options).panelSizeMode, 'adaptive');
    // An explicit false with no mode keeps the adaptive default (no legacy mapping).
    assert.equal(normalizeSettings({fullscreen: false}, options).panelSizeMode, 'adaptive');
});

test('resolvePanelSize computes adaptive, custom and fullscreen sizes', () => {
    const viewport = {width: 2000, height: 1000, minWidth: 420, minHeight: 420};
    assert.deepEqual(resolvePanelSize({panelSizeMode: 'fullscreen'}, viewport), {width: 2000, height: 1000});
    assert.deepEqual(resolvePanelSize({panelSizeMode: 'adaptive', panelScale: 90}, viewport), {width: 1800, height: 900});
    assert.deepEqual(resolvePanelSize({panelSizeMode: 'custom', dialogWidth: 880.4, dialogHeight: 600.6}, viewport), {width: 880, height: 601});
});

test('resolvePanelSize clamps tiny viewports and out-of-range scales', () => {
    const viewport = {width: 600, height: 400, minWidth: 420, minHeight: 420};
    // The viewport cap wins over the min-size floor so the panel never
    // overflows a small window.
    assert.deepEqual(resolvePanelSize({panelSizeMode: 'adaptive', panelScale: 50}, viewport), {width: 420, height: 400});
    assert.deepEqual(resolvePanelSize({panelSizeMode: 'adaptive', panelScale: 999}, viewport), {width: 600, height: 400});
    // Missing viewport values still produce usable integers via the floor.
    assert.deepEqual(resolvePanelSize({panelSizeMode: 'adaptive', panelScale: 80}, {}), {width: 320, height: 320});
});
