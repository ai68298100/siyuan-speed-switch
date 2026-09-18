// T-6329 已存筛选组件契约：思源原生搜索已存条件的有界投影——
// name/k 双要素过滤、method 分档词、去重、截断与统计。
const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeSavedSearchesConfig, buildSavedSearchesSnapshot, CRITERIA_METHODS_COUNT} = require('../src/kernel-widget-model.js');

const NOW = 1725696000000;
const METHODS = ["文本", "查询语法", "SQL", "正则", "语义"];
const criterion = (name, k, method = 0, hPath = "") => ({name, k, method, hPath});

test('saved searches project name with keyword, method and scope', () => {
    const snapshot = buildSavedSearchesSnapshot({code: 0, data: [
        criterion("我的文献", "attention transformer", 3, "/文献"),
        criterion("", "未命名条件", 0, ""),
    ]}, {limit: 8}, {title: "T", methods: METHODS, stat: "已存条件"}, NOW);
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].label, "我的文献");
    assert.equal(snapshot.items[0].secondary, "attention transformer · 正则 · @/文献");
    assert.equal(snapshot.items[1].label, "未命名条件", "无名条件回退关键字");
    assert.equal(snapshot.items[1].secondary, "未命名条件 · 文本", "关键字回退进次级行");
    assert.equal(snapshot.stat.value, "2");
});

test('entries with neither name nor keyword are dropped and duplicates removed', () => {
    const snapshot = buildSavedSearchesSnapshot({code: 0, data: [
        criterion("", ""),
        criterion("同名", "k1", 0),
        criterion("同名", "k1", 1),
        criterion("", "空"),
    ]}, {limit: 8}, {title: "T", methods: METHODS}, NOW);
    assert.equal(snapshot.items.length, 2, "全空剔除、同名同键去重");
    assert.equal(snapshot.items[0].label, "同名");
});

test('method index beyond the label array degrades to no method text', () => {
    const snapshot = buildSavedSearchesSnapshot({code: 0, data: [criterion("条件", "", 99)]}, {limit: 8}, {title: "T", methods: METHODS}, NOW);
    assert.equal(snapshot.items[0].secondary, "", "越界 method 不产生文字");
    assert.equal(CRITERIA_METHODS_COUNT, 5);
});

test('limit clamp, stat and payload guards', () => {
    const criteria = Array.from({length: 14}, (_, index) => criterion(`条件${index}`, `k${index}`));
    const snapshot = buildSavedSearchesSnapshot({code: 0, data: criteria}, {limit: 6}, {title: "T", methods: METHODS}, NOW);
    assert.equal(snapshot.items.length, 6);
    assert.equal(snapshot.stat.value, "6/14", "统计同时反馈已显示和筛选后总数");
    assert.equal(model_normalizeSavedSearchesConfig({limit: 0}).limit, 1);
    assert.equal(model_normalizeSavedSearchesConfig({}).limit, 8);
    assert.equal(buildSavedSearchesSnapshot({data: "bad"}, {}, {title: "T"}), null);
    assert.equal(buildSavedSearchesSnapshot(null, {}, {title: "T"}), null);
});

test('saved searches filter method and text, sort by name, and control secondary metadata', () => {
    const criteria = [
        criterion("Zulu", "alpha", 0, "/A"),
        criterion("Beta", "alpha sql", 2, "/B"),
        criterion("Alpha", "alpha query", 2, "/C"),
    ];
    const snapshot = buildSavedSearchesSnapshot({code: 0, data: criteria}, {
        query: "alpha", method: "SQL", sortBy: "名称", showKeyword: "否", showScope: "否", showRank: "是",
    }, {methods: METHODS}, NOW);
    assert.deepEqual(snapshot.items.map((item) => item.label), ["Alpha", "Beta"]);
    assert.equal(snapshot.items[0].secondary, "SQL");
    assert.equal(snapshot.items[0].rank, 1);
    assert.equal(snapshot.stat.value, "2");
    assert.equal(buildSavedSearchesSnapshot({code: 0, data: criteria}, {query: "missing"}, {emptyFiltered: "无匹配"}, NOW).emptyHint, "无匹配");
});

function model_normalizeSavedSearchesConfig(value) {
    return require('../src/kernel-widget-model.js').normalizeSavedSearchesConfig(value);
}
