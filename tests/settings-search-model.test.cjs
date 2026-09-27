// T-6951：设置全局搜索纯模型——DOM 扫描建索引、多词 AND、CJK、排序与有界结果。
const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {DEFAULT_SEARCH_LIMIT, collectSettingsSearchEntries, entryMatchesQuery, searchSettingsIndex} = require('../src/settings-search-model.js');

function buildPanels(doc) {
    doc.body.innerHTML = `
    <div id="panels">
      <div class="sw-settings__panel" data-panel="appearance">
        <div class="sw-settings__item"><div class="sw-settings__item-title">界面皮肤</div><div class="sw-settings__item-desc">融合主题跟随思源当前主题；独立皮肤只作用于小驴速切</div><button>融合主题</button></div>
        <div class="sw-settings__item"><div class="sw-settings__item-title">界面密度</div><div class="sw-settings__item-desc">舒适与紧凑两种显示密度</div><button>舒适</button></div>
        <div class="sw-settings__item"><div class="sw-settings__item-title">无描述条目</div></div>
      </div>
      <div class="sw-settings__panel" data-panel="storage">
        <div class="sw-settings__item"><div class="sw-settings__item-title">存储用量</div><div class="sw-settings__item-desc">各笔记本占用与容量状态</div></div>
        <div class="sw-settings__item"><div class="sw-settings__item-title">界面缓存</div><div class="sw-settings__item-desc">缩略图缓存大小与清理说明</div></div>
      </div>
    </div>`;
    return doc.getElementById('panels');
}

const LABELS = {appearance: '外观', storage: '存储'};

test('collect scans every panel and keeps panel attribution and element references', () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    const panels = buildPanels(dom.window.document);
    const entries = collectSettingsSearchEntries(panels, LABELS);
    assert.equal(entries.length, 5, '五个设置条目全部入索引');
    assert.equal(entries[0].key, 'appearance');
    assert.equal(entries[0].label, '外观');
    assert.equal(entries[0].title, '界面皮肤');
    assert.ok(entries[0].description.includes('融合主题'));
    assert.ok(entries[0].element?.tagName === 'DIV', '保留真实控件容器引用供定位');
    assert.equal(entries[2].description, '', '缺描述的条目照常入索引');
});

test('search matches CJK and latin case-insensitively with multi-token AND', () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    const entries = collectSettingsSearchEntries(buildPanels(dom.window.document), LABELS);
    assert.equal(searchSettingsIndex(entries, '皮肤').results.length, 1);
    assert.equal(searchSettingsIndex(entries, '界面').results.length, 3, '标题与描述命中合并去重按条目计');
    assert.equal(searchSettingsIndex(entries, '界面 缓存').results.length, 1, '多词 AND');
    assert.equal(searchSettingsIndex(entries, 'WORK').results.length, 0);
    const latin = searchSettingsIndex(entries, 'abc def');
    assert.equal(latin.total, 0);
});

test('search ranks title hits above description hits, then keeps stable order', () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    const entries = collectSettingsSearchEntries(buildPanels(dom.window.document), LABELS);
    const {results} = searchSettingsIndex(entries, '界面');
    assert.equal(results[0].title, '界面皮肤', '全部词命中标题者优先');
    assert.equal(results[1].title, '界面密度');
    assert.equal(results[2].title, '界面缓存', '仅描述命中排在最后');
});

test('search bounds results and reports the untruncated total', () => {
    const entries = Array.from({length: 30}, (_, index) => ({
        key: 'k', label: 'L', title: `设置项 ${index + 1}`, description: '公共描述', element: null,
    }));
    const {results, total} = searchSettingsIndex(entries, '设置项', 12);
    assert.equal(results.length, DEFAULT_SEARCH_LIMIT, '结果按上限截断');
    assert.equal(total, 30, 'total 保留截断前命中总数');
    assert.equal(searchSettingsIndex(entries, '设置项', 5).results.length, 5, 'limit 可覆盖默认值');
});

test('blank queries return empty results and entries never leak values', () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    const entries = collectSettingsSearchEntries(buildPanels(dom.window.document), LABELS);
    assert.deepEqual(searchSettingsIndex(entries, ''), {results: [], total: 0});
    assert.deepEqual(searchSettingsIndex(entries, '   '), {results: [], total: 0});
    assert.deepEqual(searchSettingsIndex([], '任何'), {results: [], total: 0});
    const json = JSON.stringify(searchSettingsIndex(entries, '界面').results.map(({element, ...rest}) => rest));
    assert.ok(!json.includes('融合主题</button>'), '索引数据不含控件内部值');
    assert.ok(entryMatchesQuery(entries[0], ['皮肤']));
});
