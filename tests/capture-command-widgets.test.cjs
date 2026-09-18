const test = require('node:test');
const assert = require('node:assert/strict');
const capture = require('../src/home-model.js');
const commands = capture;

test('quick capture action safely round-trips a component notebook and starter text', () => {
    const action = capture.buildQuickCaptureAction({
        notebook: '20260918120000-abcdef', initialText: '先写下一个想法🙂', includeTime: '是',
    });
    assert.ok(action.length <= 256, '动作值必须能完整通过主页快照边界');
    assert.deepEqual(capture.parseQuickCaptureAction(action), {
        notebook: '20260918120000-abcdef', initialText: '先写下一个想法🙂', includeTime: true,
    });
    assert.equal(capture.parseQuickCaptureAction('action:quick-capture:broken'), null);
    assert.deepEqual(capture.parseQuickCaptureAction('action:quick-capture'), {
        notebook: '', initialText: '', includeTime: false,
    });
});

test('quick capture builds a bounded local-time draft without changing saved config', () => {
    const now = new Date(2026, 8, 18, 9, 7);
    assert.equal(capture.buildQuickCaptureInitialText({initialText: '晨间记录', includeTime: '是'}, now), '09:07 晨间记录');
    assert.equal(capture.normalizeQuickCaptureConfig({notebook: 'bad', initialText: 'x'.repeat(99)}).initialText.length, 24);
});

const commandRows = [
    {value: 'alpha::open', label: '打开面板', pluginName: 'alpha', pluginTitle: 'Alpha 工具', commandKey: 'open'},
    {value: 'beta::sync', label: '同步数据', pluginName: 'beta', pluginTitle: 'Beta', commandKey: 'sync'},
    {value: 'alpha::export', label: '导出', pluginName: 'alpha', pluginTitle: 'Alpha 工具', commandKey: 'export'},
];

test('plugin commands search names and sources while exposing source as secondary text', () => {
    const snapshot = commands.buildPluginCommandsSnapshot(commandRows, {query: 'alpha', showRank: '是'}, {stat: '命令'});
    assert.deepEqual(snapshot.items, [
        {label: '打开面板', value: 'cmd:alpha::open', secondary: 'Alpha 工具', rank: 1},
        {label: '导出', value: 'cmd:alpha::export', secondary: 'Alpha 工具', rank: 2},
    ]);
    assert.deepEqual(snapshot.stat, {value: '2', label: '命令'});
});

test('plugin commands preserve legacy filter and support deterministic sorting and filtered empty states', () => {
    const legacy = commands.buildPluginCommandsSnapshot(commandRows, {filter: '同步', showPlugin: '否'}, {});
    assert.deepEqual(legacy.items, [{label: '同步数据', value: 'cmd:beta::sync'}]);
    const sorted = commands.buildPluginCommandsSnapshot(commandRows, {sortBy: '命令名称', limit: 2}, {});
    assert.deepEqual(sorted.items.map((item) => item.label), ['打开面板', '导出']);
    const empty = commands.buildPluginCommandsSnapshot(commandRows, {plugin: 'missing'}, {emptyFiltered: '无匹配'});
    assert.equal(empty.emptyHint, '无匹配');
});

test("plugin command CJK sorting pins an explicit collator (T-6464)", () => {
    // localeCompare 缺省 locale 随宿主 ICU 漂移：CI 镜像升级曾令同一断言在
    // 新旧 Runner 上一绿一红。排序必须显式钉定 zh 拼音 Collator。
    const fs = require("node:fs");
    const source = fs.readFileSync(require("node:path").join(__dirname, "..", "src", "home-model.js"), "utf8");
    assert.match(source, /new Intl\.Collator\("zh-Hans-CN"\)/, "必须显式钉定 zh 拼音 Collator");
    assert.match(source, /compareZh\(left\.label, right\.label\)/, "命令名称排序必须走钉定 Collator");
    assert.match(source, /compareZh\(left\.pluginTitle, right\.pluginTitle\)/, "插件名称排序必须走钉定 Collator");
});
