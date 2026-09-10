const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    migrateQuickActionDefaults,
    QUICK_ACTION_DEFAULTS_VERSION,
    getDefaultQuickActions,
} = require('../src/quick-actions.js');

test('quick action defaults migrate once for pre-marker stored bars', () => {
    const legacyBar = [
        {id: 'builtin-switcher', label: '切换', icon: 'iconLayout', kind: 'builtin', value: 'switcher', targets: ['desktop'], order: 10, enabled: true},
        {id: 'adapter-siyuan-checkin', label: '打卡', icon: 'iconPlugin', kind: 'adapter', value: 'siyuan-checkin/today', targets: ['desktop'], order: 20, enabled: true},
    ];
    const decision = migrateQuickActionDefaults(legacyBar, undefined);
    assert.equal(decision.migrated, true);
    // The reset lands on the current minimal default set: journal, search,
    // settings — external providers never re-enter automatically.
    const values = decision.items.map((item) => item.value).sort();
    assert.deepEqual(values, ['journal', 'search', 'settings']);
});

test('quick action defaults keep curated bars after the marker is stored', () => {
    const curatedBar = getDefaultQuickActions().concat([{
        id: 'adapter-custom', label: '自定', icon: 'iconPlugin', kind: 'adapter', value: 'custom/action', targets: ['desktop'], order: 30, enabled: true,
    }]);
    const decision = migrateQuickActionDefaults(curatedBar, QUICK_ACTION_DEFAULTS_VERSION);
    assert.equal(decision.migrated, false);
    assert.equal(decision.items, null);
});

test('quick action defaults migration is idempotent across reloads', () => {
    const first = migrateQuickActionDefaults([], 1);
    assert.equal(first.migrated, true);
    // Once the version marker is persisted, later loads skip the reset even
    // if the bar still equals the defaults.
    const second = migrateQuickActionDefaults(first.items, QUICK_ACTION_DEFAULTS_VERSION);
    assert.equal(second.migrated, false);
});
