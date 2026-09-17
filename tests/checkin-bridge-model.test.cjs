const {test} = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('../src/checkin-bridge-model.js');

const NOW = Date.parse('2026-09-17T10:00:00');

function fakeApi(overrides = {}) {
    return Object.assign({
        protocol: 'siyuan-checkin',
        hasCapability: (name) => ['items.read', 'analytics.read', 'occasions.read'].includes(name),
        getItems: () => ([
            {id: 'a', name: '阅读', kind: 'count', target: 30, unit: '分钟', sortOrder: 1},
            {id: 'b', name: '冥想', kind: 'once', target: 0, unit: '', sortOrder: 2},
        ]),
        getEvents: () => ([
            {itemId: 'a', localDate: '2026-09-17', value: 20},
            {itemId: 'a', localDate: '2026-09-16', value: 30},
            {itemId: 'b', localDate: '2026-09-17', value: 1},
        ]),
        getAnalyticsSnapshot: () => ({weeklyCurrent: 12, weekly: {points: [{label: '09-08', value: 4}, {label: '09-15', value: 12}]}}),
        getTodayOccasions: () => ([{name: '生日', occurrenceDate: '2026-09-20', daysUntil: 3, kind: '纪念日'}]),
    }, overrides);
}

test('bridge resolves the published ecosystem api by protocol', () => {
    assert.equal(bridge.resolveCheckinApi({}), null);
    assert.equal(bridge.resolveCheckinApi({siyuanCheckin: 'nope'}), null);
    assert.ok(bridge.resolveCheckinApi({siyuanCheckin: fakeApi()}));
    assert.equal(bridge.resolveCheckinApi({siyuanCheckin: {protocol: 'other'}}), null);
});

test('bridge probes capabilities without guessing from version', () => {
    const api = fakeApi();
    assert.equal(bridge.hasCheckinCapability(api, 'analytics.read'), true);
    assert.equal(bridge.hasCheckinCapability(null, 'analytics.read'), false);
    const legacy = {getItems: () => [], getEvents: () => []};
    assert.equal(bridge.hasCheckinCapability(legacy, 'items.read'), true);
    assert.equal(bridge.hasCheckinCapability(legacy, 'occasions.read'), false);
});

test('missing plugin yields a bounded empty state instead of throwing', () => {
    const snapshot = bridge.readCheckinBridge('checkin-today', {scope: {}, labels: {}, now: NOW});
    assert.deepEqual(snapshot.items, []);
    assert.match(snapshot.emptyHint, /小驴打卡/);
});

test('capability gaps degrade to a dedicated hint', () => {
    const scope = {siyuanCheckin: fakeApi({hasCapability: () => false})};
    const snapshot = bridge.readCheckinBridge('checkin-weekly', {scope, labels: {}, now: NOW});
    assert.deepEqual(snapshot.items, []);
    assert.match(snapshot.emptyHint, /不支持/);
});

test('today widget reports progress and per-item completion', () => {
    const snapshot = bridge.readCheckinBridge('checkin-today', {scope: {siyuanCheckin: fakeApi()}, labels: {}, now: NOW});
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].label, '阅读');
    assert.equal(snapshot.items[0].done, false);
    assert.equal(snapshot.items[1].done, true);
    assert.equal(snapshot.stat.value, '1/2');
    assert.equal(snapshot.stat.progress, 50);
});

test('streak widget ranks consecutive days and ignores amount kinds', () => {
    const api = fakeApi({
        getItems: () => ([
            {id: 'a', name: '阅读', kind: 'count'},
            {id: 'b', name: '冥想', kind: 'once'},
            {id: 'c', name: '喝水', kind: 'amount'},
        ]),
        getEvents: () => ([
            {itemId: 'a', localDate: '2026-09-17', value: 1},
            {itemId: 'a', localDate: '2026-09-16', value: 1},
            {itemId: 'b', localDate: '2026-09-17', value: 1},
            {itemId: 'c', localDate: '2026-09-17', value: 2},
        ]),
    });
    const snapshot = bridge.readCheckinBridge('checkin-streak', {scope: {siyuanCheckin: api}, labels: {}, now: NOW});
    assert.deepEqual(snapshot.items.map((item) => item.label), ['阅读', '冥想']);
    assert.equal(snapshot.items[0].rank, 1);
    assert.equal(snapshot.stat.value, '2');
});

test('streak tolerates a day that has not been recorded yet today', () => {
    const api = fakeApi({
        getItems: () => ([{id: 'a', name: '阅读', kind: 'count'}]),
        getEvents: () => ([
            {itemId: 'a', localDate: '2026-09-16', value: 1},
            {itemId: 'a', localDate: '2026-09-15', value: 1},
        ]),
    });
    const snapshot = bridge.readCheckinBridge('checkin-streak', {scope: {siyuanCheckin: api}, labels: {}, now: NOW});
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].done, false);
    assert.match(snapshot.items[0].value, /^2/);
});

test('heatmap stays within the renderer ceiling and keeps weekly alignment', () => {
    const snapshot = bridge.readCheckinBridge('checkin-year-heatmap', {scope: {siyuanCheckin: fakeApi()}, labels: {}, now: NOW});
    assert.ok(snapshot.items.length <= bridge.CHECKIN_HEATMAP_MAX_ITEMS, '热力图条目须在渲染硬顶内');
    assert.equal(snapshot.items.length % 7, 0, '周对齐后格子数须为 7 的倍数');
    assert.ok(snapshot.items.every((item) => item.level >= -1 && item.level <= 4));
    assert.ok(snapshot.items.some((item) => item.outside === true), '占位格须标记 outside');
    assert.match(snapshot.title, /2026/);
    assert.equal(snapshot.stat.value, '51');
});

test('heatmap year offset walks back through previous years', () => {
    const snapshot = bridge.readCheckinBridge('checkin-year-heatmap', {scope: {siyuanCheckin: fakeApi()}, labels: {}, config: {yearOffset: 1}, now: NOW});
    assert.match(snapshot.title, /2025/);
    // 年度热力图是日历视图：没有数据的年份仍然铺满整年格子（level 全 0），
    // 只是 stat 归零并给出空态提示。
    assert.equal(snapshot.stat.value, '0');
    assert.ok(snapshot.items.length > 0 && snapshot.items.length % 7 === 0);
    assert.ok(snapshot.items.every((item) => item.level <= 0));
});

test('weekly widget reuses the provider analytics snapshot verbatim', () => {
    const snapshot = bridge.readCheckinBridge('checkin-weekly', {scope: {siyuanCheckin: fakeApi()}, labels: {}, now: NOW});
    assert.deepEqual(snapshot.items, [{label: '09-15', value: '12'}, {label: '09-08', value: '4'}]);
    assert.equal(snapshot.stat.value, '12');
});

test('occasions widget is a read-only projection', () => {
    const snapshot = bridge.readCheckinBridge('checkin-occasions', {scope: {siyuanCheckin: fakeApi()}, labels: {}, now: NOW});
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].label, '生日');
    assert.equal(snapshot.items[0].done, false);
    assert.ok(!snapshot.items.some((item) => item.command || item.href), '只读投影不得携带写入动作');
});

test('occasion dates falling on today are labelled as today', () => {
    const api = fakeApi({getTodayOccasions: () => ([{name: '今天的事', occurrenceDate: '2026-09-17', daysUntil: 0}])});
    const snapshot = bridge.readCheckinBridge('checkin-occasions', {scope: {siyuanCheckin: api}, labels: {today: '今天'}, now: NOW});
    assert.equal(snapshot.items[0].value, '今天');
});

test('throwing provider getters never break the host read', () => {
    const api = fakeApi({
        getItems: () => { throw new Error('boom'); },
        getEvents: () => { throw new Error('boom'); },
    });
    const snapshot = bridge.readCheckinBridge('checkin-today', {scope: {siyuanCheckin: api}, labels: {}, now: NOW});
    assert.deepEqual(snapshot.items, []);
    assert.ok(snapshot.emptyHint.length > 0);
});

test('unknown bridge module ids fall back to the missing-provider hint', () => {
    const snapshot = bridge.readCheckinBridge('checkin-unknown', {scope: {siyuanCheckin: fakeApi()}, labels: {}, now: NOW});
    assert.deepEqual(snapshot.items, []);
    assert.ok(snapshot.emptyHint.length > 0);
});

test('every declared module id maps to a capability contract', () => {
    bridge.CHECKIN_MODULE_IDS.forEach((moduleId) => {
        assert.equal(typeof bridge.CHECKIN_CAPABILITIES[moduleId], 'string', `${moduleId} 缺能力声明`);
        assert.match(moduleId, /^[a-z][a-z0-9-]*$/, `${moduleId} 须为小写连字符形式（功能分组审计正则要求）`);
    });
});
