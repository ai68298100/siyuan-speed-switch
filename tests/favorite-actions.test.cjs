const {test} = require('node:test');
const assert = require('node:assert/strict');
const {removeFavoriteEntry, setFavoriteEntryGroup, migrateFavoriteEntry} = require('../src/favorite-actions.js');

test('favorite actions remove entries idempotently', () => {
    const entries = [{key: 'a', group: ''}, {key: 'b', group: 'work'}];
    const removed = removeFavoriteEntry(entries, 'a');
    assert.deepEqual(removed.items, [{key: 'b', group: 'work'}]);
    assert.equal(removed.changed, true);
    assert.equal(removeFavoriteEntry(removed.items, 'missing').changed, false);
    assert.deepEqual(entries, [{key: 'a', group: ''}, {key: 'b', group: 'work'}]);
});

test('favorite actions set group trims and preserves identity', () => {
    const entries = [{key: 'a', group: ''}, {key: 'b', group: 'work'}];
    const changed = setFavoriteEntryGroup(entries, 'a', '  personal  ');
    assert.deepEqual(changed.items, [{key: 'a', group: 'personal'}, {key: 'b', group: 'work'}]);
    assert.equal(setFavoriteEntryGroup(changed.items, 'a', 'personal').changed, false);
});

test('favorite actions migrate legacy tab key and remove duplicate root safely', () => {
    const migrated = migrateFavoriteEntry([{key: 'tab-1', title: 'Doc'}], 'tab-1', '20240101010101-abcdefg');
    assert.deepEqual(migrated.items[0], {key: '20240101010101-abcdefg', title: 'Doc', rootId: '20240101010101-abcdefg'});
    const duplicate = migrateFavoriteEntry([
        {key: 'tab-1'}, {key: '20240101010101-abcdefg'},
    ], 'tab-1', '20240101010101-abcdefg');
    assert.deepEqual(duplicate.items, [{key: '20240101010101-abcdefg'}]);
    assert.equal(duplicate.duplicate, true);
});

test("smart groups: normalize bounds, dedupes by name and strips LIKE wildcards", () => {
    const {normalizeFavoriteSmartGroups, buildTagSmartGroupQuery, projectTagSmartGroupEntries} = require("../src/favorite-actions.js");
    const groups = normalizeFavoriteSmartGroups([
        {name: "论文", tag: "论文"},
        {name: "论文", tag: "重复名被丢弃"},
        {name: "", tag: "x"},
        {name: "坏标签", tag: "a'b%c\d_e"},
        {name: "干净", tag: "clean-tag"},
    ], 4);
    // 同名去重 + 空名丢弃；"坏标签"保留但 tag 中的引号/通配符被剥离（a'b%c\d_e → abcde）
    assert.equal(groups.length, 3);
    assert.deepEqual(groups.map((group) => group.name), ["论文", "坏标签", "干净"]);
    assert.equal(groups[1].tag, "abcde");
    assert.equal(groups[2].tag, "clean-tag");
    assert.equal(normalizeFavoriteSmartGroups([]).length, 0);
    assert.equal(normalizeFavoriteSmartGroups("x").length, 0);
});

test("smart groups: query builder escapes and projects validated entries", () => {
    const {buildTagSmartGroupQuery, projectTagSmartGroupEntries} = require("../src/favorite-actions.js");
    const query = buildTagSmartGroupQuery("论文", 20);
    assert.ok(query && query.stmt.includes("type='d'") && query.stmt.includes("%#论文#%") && query.stmt.endsWith("LIMIT 20"));
    const sanitized = buildTagSmartGroupQuery("a'b");
    assert.ok(sanitized && sanitized.stmt.includes("%#ab#%"), "quote is stripped, the rest of the tag survives");
    assert.equal(buildTagSmartGroupQuery("'%_"), null, "a tag made only of stripped characters yields no query");
    assert.equal(buildTagSmartGroupQuery("   "), null);
    const entries = projectTagSmartGroupEntries([
        {id: "20260923120000-aaaaaaa", content: "论文草稿"},
        {id: "20260923120000-aaaaaaa", content: "重复行被去重"},
        {id: "bad-id", content: "无效 id 被丢弃"},
        {id: "20260923120000-bbbbbbb", content: "   "},
    ]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].title, "论文草稿");
    assert.equal(projectTagSmartGroupEntries("x").length, 0);
});

test("dynamic groups: tag + notebook + updated-window compose a bounded query (T-6817)", () => {
    const {buildTagSmartGroupQuery} = require("../src/favorite-actions.js");
    const now = Date.UTC(2026, 8, 24, 12, 0, 0); // 2026-09-24T12:00:00Z
    const full = buildTagSmartGroupQuery(
        {tag: "论文", notebook: "20260924000000-notebook", updatedWithinDays: 7},
        {limit: 20, nowMs: now},
    );
    assert.match(full.stmt, /content LIKE '%#论文#%'/, "标签锚点保留");
    assert.match(full.stmt, /AND box='20260924000000-notebook'/, "笔记本范围参数化");
    assert.match(full.stmt, /AND updated >= '20260917120000'/, "7 天窗按 nowMs 计算 cutoff");
    assert.match(full.stmt, /LIMIT 20$/, "LIMIT 仍由插件钳制");
    // 仅标签：不携带 box/updated 条件
    const tagOnly = buildTagSmartGroupQuery({tag: "论文"}, {nowMs: now});
    assert.doesNotMatch(tagOnly.stmt, /AND box=/);
    assert.doesNotMatch(tagOnly.stmt, /AND updated/);
    // 兼容旧字符串入参
    const legacy = buildTagSmartGroupQuery("论文", 20);
    assert.equal(legacy.stmt, tagOnly.stmt.replace(" LIMIT 20", " LIMIT 20"));
    // 白名单外天数与非法笔记本被丢弃
    const sanitized = buildTagSmartGroupQuery(
        {tag: "论文", notebook: "bad id!!'; DROP", updatedWithinDays: 13},
        {nowMs: now},
    );
    // 清洗语义与 setId 同规：剔除引号/空格等危险字符后无害保留（无法逃逸 SQL 字符串）
    assert.match(sanitized.stmt, /AND box='badidDROP'/, "非法字符清洗后保留");
    assert.doesNotMatch(sanitized.stmt, /AND updated/, "白名单外天数剔除");
    // 13 天被拒绝但不影响 7/30/90
    assert.match(buildTagSmartGroupQuery({tag: "t", updatedWithinDays: 30}, {nowMs: now}).stmt, /AND updated/);
    assert.equal(buildTagSmartGroupQuery({tag: "", notebook: "x"}, {nowMs: now}), null, "无标签锚点拒绝构造");
});
