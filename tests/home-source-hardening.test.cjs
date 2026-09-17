// T-6318 来源分组模型加固契约：只补 home-source-model.test.cjs 未覆盖的真实行为——
// 旧注册的作者兜底、order 钳制、组排序的"成员多者在前"规则与内建组件的分组排除。
const test = require('node:test');
const assert = require('node:assert/strict');
const {resolveHomeModuleSource, orderHomeStoreSourceEntries, buildHomeStoreSourceGroups} = require('../src/home-source-model.js');

const defOf = (moduleId, extra = {}) => ({moduleId, ...extra});
const checkinDef = (moduleId, order) => defOf(moduleId, {source: {pluginId: "siyuan-checkin", name: "小驴打卡", icon: "iconCheck", order}});

test('legacy plugin-category registrations fall back to the author as source key', () => {
    const byAuthor = resolveHomeModuleSource(defOf("third-party-widget", {category: "plugin", author: "某作者"}));
    assert.equal(byAuthor.key, "plugin:某作者");
    assert.equal(byAuthor.kind, "plugin");
    const noAuthor = resolveHomeModuleSource(defOf("third-party-widget", {category: "plugin"}));
    assert.equal(noAuthor.key, "plugin:third-party-widget", "无作者时用 moduleId 兜底");
    const builtin = resolveHomeModuleSource(defOf("recent-documents", {category: "siyuan"}));
    assert.equal(builtin.kind, "builtin");
    assert.equal(resolveHomeModuleSource(null).kind, "builtin");
});

test('source order clamps into 0..999 and non-numeric orders settle at zero', () => {
    assert.equal(resolveHomeModuleSource(checkinDef("a", 999)).order, 999);
    assert.equal(resolveHomeModuleSource(checkinDef("a", 5000)).order, 999);
    assert.equal(resolveHomeModuleSource(checkinDef("a", -3)).order, 0);
    assert.equal(resolveHomeModuleSource(defOf("a", {source: {pluginId: "p", order: "2"}})).order, 0, "字符串数字不参与钳制语义");
});

test('same-source ordering falls back to moduleId when orders tie', () => {
    const entries = [
        {moduleId: "checkin-weekly", def: checkinDef("checkin-weekly", 4)},
        {moduleId: "checkin-streak", def: checkinDef("checkin-streak", 4)},
        {moduleId: "checkin-today", def: checkinDef("checkin-today", 1)},
    ];
    const ordered = orderHomeStoreSourceEntries(entries).map((entry) => entry.moduleId);
    assert.deepEqual(ordered, ["checkin-today", "checkin-streak", "checkin-weekly"]);
});

test('builtin-category widgets never join source groups', () => {
    const groups = buildHomeStoreSourceGroups([
        {moduleId: "recent-documents", def: defOf("recent-documents", {category: "siyuan"}), added: true},
        {moduleId: "checkin-today", def: checkinDef("checkin-today", 1), added: false},
        {moduleId: "checkin-streak", def: checkinDef("checkin-streak", 2), added: true},
    ]);
    assert.equal(groups.length, 1, "只有来源为插件 kind 的组件进组");
    assert.equal(groups[0].addedCount, 1);
    assert.equal(groups[0].count, 2);
});

test('bigger source groups sort before smaller ones, ties break by label', () => {
    const groups = buildHomeStoreSourceGroups([
        {moduleId: "single-a", def: defOf("single-a", {source: {pluginId: "zeta", name: "Zeta", order: 1}})},
        {moduleId: "one-of-two", def: defOf("one-of-two", {source: {pluginId: "alpha", name: "Alpha", order: 1}})},
        {moduleId: "two-of-two", def: defOf("two-of-two", {source: {pluginId: "alpha", name: "Alpha", order: 2}})},
    ]);
    assert.deepEqual(groups.map((group) => group.pluginId), ["alpha", "zeta"], "成员多的来源组排前");
});

test('source search text carries provider name and plugin id for the store query', () => {
    const {buildHomeStoreSourceSearchText} = require('../src/home-source-model.js');
    const text = buildHomeStoreSourceSearchText(checkinDef("checkin-today", 1));
    assert.match(text, /小驴打卡/);
    assert.match(text, /siyuan-checkin/);
});
