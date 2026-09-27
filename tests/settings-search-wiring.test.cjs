// T-6951：设置全局搜索接线契约——索引必须来自生产面板 DOM、查询走有界纯模型、
// 定位必须切组+聚焦真实控件+短暂强调、结果列表有界且有可见文案。
// 注意：readSourceFile 已剥注释，"把调用写进注释"无法骗过本契约。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const source = readSourceFile('src/index.ts');
const model = readSourceFile('src/settings-search-model.js');

test('settings search wiring: index is collected from the real panels DOM', () => {
    assert.ok(source.includes('collectSettingsSearchEntries(panels, panelLabels)'),
        '设置搜索索引必须扫描生产面板 DOM，不得手抄静态清单漂移');
    assert.ok(model.includes('querySelectorAll(".sw-settings__panel")'), '模型必须按面板归类');
    assert.ok(model.includes('.sw-settings__item-title'), '索引只收设置标题');
});

test('settings search wiring: query goes through the bounded pure model', () => {
    assert.ok(source.includes('searchSettingsIndex(searchEntries, query)'),
        '查询必须走有界纯模型，不得在 UI 内自建匹配逻辑');
    assert.ok(model.includes('DEFAULT_SEARCH_LIMIT'), '模型必须有默认结果上限');
    assert.ok(model.includes('tokens.every'), '多词必须 AND 语义');
});

test('settings search wiring: locate activates the panel and focuses the real control', () => {
    assert.ok(source.includes('activate(entry.key)'), '定位必须切换到条目所属分组');
    assert.ok(source.includes("\"button, input, select, textarea, [tabindex]:not([tabindex='-1'])\""),
        '定位必须聚焦条目内真实控件');
    assert.ok(source.includes('sw-settings__item--locate'), '定位必须有短暂强调反馈');
});

test('settings search wiring: bounded listbox with visible no-result and truncation copy', () => {
    assert.ok(source.includes('"listbox"'), '结果容器必须是 listbox 语义');
    assert.ok(source.includes('settingsSearchNoResults'), '无结果必须有可见文案');
    assert.ok(source.includes('settingsSearchMore'), '截断必须提示剩余数量');
});
