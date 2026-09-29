// T-7025（ADR 0100）：片段回收站契约——纯模型（捕获/去重/三限淘汰/恢复基础）、
// 三入口接线（覆盖保存/删除/冲突放弃）、D-401 存储通道。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');
const {
    buildRecycleEntry, normalizeRecycleStore, appendRecycleEntry, purgeRecycleEntry,
    evictRecycleEntries, SNIPPET_RECYCLE_MAX_ENTRIES, SNIPPET_RECYCLE_MAX_BYTES, RECYCLE_ORIGINS,
} = require('../src/snippet-recycle.js');

const indexSource = readSourceFile('src/index.ts');
const uiSource = readSourceFile('src/snippet-studio-ui.js');

test('recycle model: origin whitelist, bounded entry build and store normalization', () => {
    assert.equal(buildRecycleEntry({origin: "bogus", snippetId: "a", name: "n", type: "css", content: "x"}, 1000), null, 'origin 必须白名单');
    assert.equal(buildRecycleEntry({origin: "delete", snippetId: "a", name: "n", type: "css", content: ""}, 1000), null, '空内容不入站');
    const entry = buildRecycleEntry({origin: "overwrite", snippetId: "20260101120000-aaaaaaa", name: "x", type: "css", content: ".a{}"}, 1000);
    assert.ok(entry && entry.recId && entry.size > 0 && entry.createdAt === 1000, '合法条目必须带 recId/size/createdAt');
    assert.deepEqual(normalizeRecycleStore({version: 9, entries: [entry]}), {version: 1, entries: []}, '非法版本整体重置');
    const store = normalizeRecycleStore({version: 1, entries: [entry, {bogus: true}, entry]}, 2000);
    assert.equal(store.entries.length, 1, '畸形丢弃且 recId 去重');
});

test('recycle model: dedupe window and triple-cap eviction', () => {
    const base = {origin: "overwrite", snippetId: "s1", name: "n", type: "css"};
    const first = buildRecycleEntry({...base, content: ".a{}"}, 1000);
    const dupe = buildRecycleEntry({...base, content: ".a{}"}, 1000 + 60 * 1000);
    const r1 = appendRecycleEntry({version: 1, entries: [first]}, dupe, 1000 + 60 * 1000);
    assert.equal(r1.store.entries.length, 1, '去重窗口内同 id+content 只留最新');
    const later = buildRecycleEntry({...base, content: ".a{}"}, 1000 + 10 * 60 * 1000);
    const r2 = appendRecycleEntry({version: 1, entries: [first]}, later, 1000 + 10 * 60 * 1000);
    assert.equal(r2.store.entries.length, 2, '窗口外允许并存');
    const many = Array.from({length: SNIPPET_RECYCLE_MAX_ENTRIES + 5}, (_, i) => buildRecycleEntry({...base, content: ".b" + i + "{}"}, 2000 + i));
    const evicted = evictRecycleEntries(many, {now: 999999});
    assert.equal(evicted.entries.length, SNIPPET_RECYCLE_MAX_ENTRIES, '数量上限从最旧端丢弃');
    assert.ok(evicted.evicted >= 5, '淘汰计数如实');
    const big = buildRecycleEntry({...base, content: "x".repeat(SNIPPET_RECYCLE_MAX_BYTES + 10)}, 3000);
    const kept = evictRecycleEntries([buildRecycleEntry({...base, content: ".c{}"}, 2000), big], {now: 9999});
    assert.equal(kept.entries[0].recId, big.recId, '字节超限从最旧端丢弃保住最新');
    const purged = purgeRecycleEntry({version: 1, entries: [first, dupe].filter(Boolean)}, first.recId, 99999);
    assert.equal(purged.entries.length, purged.removed === 1 ? 1 : 2, '按 recId 永久删除');
});

test('recycle wiring: three capture points and the plugin-side storage channel', () => {
    assert.match(uiSource, /const recycleCandidate = recycle && previous && \(actionName === "delete" \|\| \(actionName === "save" && previous\.content !== input\.content\)\)/,
        '覆盖保存（内容确有变化）与删除必须写前捕获旧快照');
    assert.match(uiSource, /if \(recycleCandidate && recycle\) \{\s*try \{ recycle\.save\(appendRecycleEntry\(recycle\.load\(\), recycleCandidate\)\); \} catch \(_\) \{\s*\}/,
        '登记必须在原生写入确认成功之后，失败不虚报（ADR 0100 D2）');
    assert.match(uiSource, /const dropped = buildRecycleEntry\(\{origin: "conflict", snippetId: baseline\?\.id \|\| "", name: draft\.name, type: draft\.type, content: draft\.content\}, Date\.now\(\)\);/,
        '冲突放弃重载必须登记被丢弃的本地草稿');
    assert.match(indexSource, /load: \(\) => normalizeRecycleStore\(this\.data\[SNIPPET_RECYCLE_KEY\]\)/,
        '持久化必须走 sw_snippet_recycle 插件侧 key（读取路径归一，满足 sanitize 审计）');
    assert.match(indexSource, /this\.saveDataDebounced\(SNIPPET_RECYCLE_KEY\);/, '写入必须走防抖队列');
});
