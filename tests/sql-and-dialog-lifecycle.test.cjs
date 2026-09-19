const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// T-6478 / T-6479 回归门：SQL 有界读与弹窗释放路径。
// 覆盖边界：本门只检查源码字面量与 helper 语义，不证明运行时行为；
// 真实截断/关闭行为由 docs/kernel-api-smoke-*.md 与后续 host-e2e 取证。

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

function readSources() {
    const out = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!/\.(ts|js)$/.test(entry.name)) continue;
            out.push({file: path.relative(ROOT, full).replace(/\\/g, "/"), text: fs.readFileSync(full, "utf8")});
        }
    };
    walk(SRC);
    return out;
}

const sources = readSources();

// 分发器之外的裸 fetch 债务登记：按端点路径记账（不受行号漂移影响）。
// 这三处自带 AbortController/超时语义，迁移到 fetchKernelJson 会改变时序，需真实宿主取证后再动（T-6483）。
const DIRECT_KERNEL_FETCH_DEBT = [
    {path: "/api/notebook/lsNotebooks", why: "启动期笔记本清单，自带早退与重试"},
    {path: "/api/filetree/getDoc", why: "逐文档读取带独立超时"},
    {path: "/api/filetree/searchDocs", why: "标题搜索用 Promise.race 自控超时"},
];

test("kernel fetches outside the dispatcher match the recorded debt list", () => {
    const found = new Set();
    let dispatcherLines = 0;
    for (const {file, text} of sources) {
        text.split("\n").forEach((line) => {
            const m = line.match(/fetch\(\s*"(\/api\/[^"]+)"/);
            if (!m) return;
            // 分发器自身每个 case 都以 `response = await fetch("...")` 发出，属设计内字面量。
            if (/response\s*=\s*await\s+fetch\(/.test(line)) { dispatcherLines += 1; return; }
            found.add(m[1]);
        });
    }
    assert.ok(dispatcherLines >= 19,
        `扫描失效检查：分发器字面量 fetch 只匹配到 ${dispatcherLines} 行`);
    assert.deepEqual([...found].sort(), DIRECT_KERNEL_FETCH_DEBT.map((row) => row.path).sort(),
        "分发器之外的裸 fetch 与登记表不一致：新增须登记理由并给出迁移前提，迁走请同步删除登记");
});

// 无外层 LIMIT 的语句登记表：只允许天然有界（单行/聚合）的查询，且必须写明理由。
// 登记表不得留僵尸条目——每条都必须至少命中一次，防止将来同类语句被无声放过。
const LIMIT_EXEMPT = [
    {pattern: /^SELECT id, content FROM blocks WHERE type='d' AND id IN \(/,
        reason: "Agent 批量开文档：ids 由上游钳制到 ≤5 行"},
    {pattern: /^SELECT markdown, content FROM blocks WHERE id='/, reason: "单块等值查询，至多 1 行"},
    {pattern: /^SELECT markdown FROM blocks WHERE id='/, reason: "单块等值查询，至多 1 行"},
    {pattern: /^SELECT COUNT\(.*\) AS total FROM /, reason: "无 GROUP BY 的纯聚合，恒 1 行"},
    {pattern: /^SELECT COUNT\(CASE/, reason: "无 GROUP BY 的纯聚合，恒 1 行"},
    {pattern: /^SELECT COALESCE\(SUM\(/, reason: "无 GROUP BY 的纯聚合，恒 1 行"},
];

test("every kernel SQL literal carries an outer LIMIT or a recorded exemption", () => {
    const stmts = [];
    for (const {file, text} of sources) {
        text.split("\n").forEach((line, index) => {
            const m = line.match(/stmt:\s*(`[^`]*`|"[^"]*")/);
            if (m) stmts.push({at: `${file}:${index + 1}`, sql: m[1].slice(1)});
        });
    }
    assert.ok(stmts.length >= 20, `扫描到的 stmt 字面量过少（${stmts.length}），扫描可能失效`);
    const used = new Set();
    const missing = stmts.filter(({at, sql}) => {
        if (/\bLIMIT\b/i.test(sql)) return false;
        const hit = LIMIT_EXEMPT.findIndex((row) => row.pattern.test(sql));
        if (hit >= 0) used.add(hit);
        return hit < 0;
    });
    assert.deepEqual(missing.map((row) => `${row.at} ${row.sql.slice(0, 60)}`), [],
        "无外层 LIMIT 的语句会被内核按 search.limit（默认 64）静默截断；确属天然有界请登记进 LIMIT_EXEMPT 并写明理由");
    const stale = LIMIT_EXEMPT.map((row, i) => i).filter((i) => !used.has(i));
    assert.deepEqual(stale, [], "LIMIT_EXEMPT 存在不再命中的条目，请删除");
});

test("normalizeSqlResult tolerates malformed envelopes and reports truncation", () => {
    const {normalizeSqlResult} = require("../src/util.js");
    assert.deepEqual(normalizeSqlResult(null), {rows: [], truncated: false, limit: 0});
    assert.deepEqual(normalizeSqlResult({}), {rows: [], truncated: false, limit: 0});
    assert.deepEqual(normalizeSqlResult({data: {}}), {rows: [], truncated: false, limit: 0});
    assert.deepEqual(normalizeSqlResult({data: [{id: "x"}], truncated: true, limit: 64}),
        {rows: [{id: "x"}], truncated: true, limit: 64});
    assert.equal(normalizeSqlResult({data: [], truncated: "true"}).truncated, false,
        "truncated 必须严格为布尔 true 才算截断");
    assert.equal(normalizeSqlResult({data: [], limit: "abc"}).limit, 0);
});

// ── 弹窗释放 ──
test("no interval-based dialog disposal polling remains", () => {
    const offenders = sources.filter(({text}) => /\bsetInterval\s*\(/.test(text)).map(({file}) => file);
    assert.deepEqual(offenders, [],
        "轮询 isConnected 释放控制器会在宿主 5 秒拆除预算外泄漏，且宿主 Dialog 已有 destroyCallback");
});

// 仍在覆写 dialog.destroy 的文件与数量（按文件计数，避免行号漂移造成假失败）。
// 每条都要有理由与跟进任务；修掉一处就删一处。
const DIALOG_DESTROY_OVERRIDES = [
    {file: "src/index.ts", count: 2, why: "切换器弹窗多资源回收；suspendFABForDialog 包装任意弹窗需改显式配对", trackedBy: "T-6481"},
    {file: "src/mobile-switcher-ui.ts", count: 1, why: "含 body 级 portal 拆除，需随 owner 一起迁", trackedBy: "T-6481"},
    {file: "src/second-panel-ui.ts", count: 1, why: "批量刷新控制器与观察器随面板销毁", trackedBy: "T-6481"},
];

test("remaining dialog.destroy overrides match the recorded debt list", () => {
    const found = new Map();
    let total = 0;
    for (const {file, text} of sources) {
        const hits = text.split("\n").filter((line) => /^\s*(?!\/\/)/.test(line)
            && /[Dd]ialog\.destroy\s*=\s*\(\s*\)\s*=>/.test(line)).length;
        if (hits) { found.set(file, hits); total += hits; }
    }
    assert.ok(total > 0 || DIALOG_DESTROY_OVERRIDES.length === 0, "扫描失效检查：无覆写但登记表非空");
    const expected = new Map(DIALOG_DESTROY_OVERRIDES.map((row) => [row.file, row.count]));
    assert.deepEqual([...found.entries()].sort(), [...expected.entries()].sort(),
        "dialog.destroy 覆写的文件/数量与登记表不一致：新增须登记理由，修掉请同步删除登记");
});
