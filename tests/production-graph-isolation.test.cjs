const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');

// v0.17 契约层模块:独立存在、独立测试,但尚未决定接入生产 bundle。
// 任何模块进入本清单的生产闭包都必须先通过包体预算决策(D-216)。
// 归档硬上限已于 2026-09-15 由 320 KiB 上调至经审核的 512 KiB(D-353),
// 余量约 225 KiB,因此预算不再是"无声涌入"式的风险,但仍须逐次评审。
const UNWIRED_CONTRACT_MODULES = [
    'agent-approval-token',
    'agent-document-set-actions',
    'agent-host-actions',
    'agent-workspace-actions',
    'agent-workspace-approval',
    'agent-workspace-bridge',
    'agent-workspace-capability',
    'agent-workspace-capability-definitions',
    'agent-workspace-execution',
    'agent-workspace-plan',
    'agent-workspace-probe',
    'agent-workspace-registry',
    'agent-workspace-session',
    'agent-write-actions',
];

const WIRED_SANITY_MODULES = [
    'agent-capabilities',
    'agent-document-context',
    'agent-workspace-diagnostics',
    'agent-workspace-runtime',
    // R2 重构（D-375）：外部组件注册定义外迁至 home-external-adapters。
    'home-adapters',
    'home-controller',
    'home-external-adapters',
    // R4 重构（D-376）：设置页 UI 构建外迁至 settings-sections。
    // R3 重构（D-377）：配置表单外迁至 home-config-form，共用来源标签收纳至 store-labels。
    // R1 重构（D-379）：商店 UI 外迁至 home-store-ui（复用 home-store-model 等既有闭包）。
    // R5a 重构（D-381）：搜索链路状态收拢至 doc-search-state（仅新增自身，import type 擦除）。
    // R5b 重构（D-383）：搜索方法群外迁至 doc-search-ui。
    'settings-sections',
    'home-config-form',
    'store-labels',
    'home-store-ui',
    'doc-search-state',
    'doc-search-ui',
    // T-103（D-365/D-366）：path-filter-model 随桌面路径筛选进入生产。
    // 它是首个接入的 v0.18 契约模块，且为只读——仅构造 listDocsByPath 请求
    // 并归一化响应，不含任何写入动作。
    'path-filter-model',
    'search-model',
    // T-6260（D-386 第二步）：storage-migration 随 onload 演练快照进入生产。
    // 只读演练：报告仅存实例内存、无任何写入动作；闭包 41→42 已复核
    // 512 KiB 包体门禁（D-353，index.js 607365 / zip 310902）。
    'storage-migration',
    // T-6294（P1-1b）：第二面板装配链路外迁至 second-panel-ui（openSecondPanel，
    // 601 行原样搬移，仅 4 处调用点改 .call(this)）。闭包 45→46 已复核。
    'second-panel-ui',
];

function resolveModule(fromFile, spec) {
    const base = spec.endsWith('.js') || spec.endsWith('.ts') ? spec : `${spec}.js`;
    const direct = path.resolve(path.dirname(fromFile), base);
    if (fs.existsSync(direct)) return path.relative(srcDir, direct).replace(/\\/g, '/');
    const tsDirect = path.resolve(path.dirname(fromFile), spec.endsWith('.js') ? spec : `${spec}.ts`);
    if (fs.existsSync(tsDirect)) return path.relative(srcDir, tsDirect).replace(/\\/g, '/');
    return null;
}

function collectProductionGraph() {
    const seen = new Set();
    const queue = ['index.ts'];
    while (queue.length) {
        const module = queue.shift();
        if (seen.has(module)) continue;
        seen.add(module);
        const file = path.join(srcDir, module);
        if (!fs.existsSync(file)) continue;
        const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
        const pattern = /(?:require\("\.\/|from "\.\/)([a-z0-9-]+?)(?:\.js)?"/g;
        let match;
        while ((match = pattern.exec(source))) {
            const resolved = resolveModule(file, match[1]);
            if (resolved && !seen.has(resolved)) queue.push(resolved);
        }
    }
    return seen;
}

// The traversal stores resolved filenames, so keys carry their extension
// (e.g. "agent-workspace-runtime.js"). Both gates must resolve names the same
// way: an earlier version checked only the bare name and `${name}.ts` here
// while the sanity gate below also checked `${name}.js`, so every plain-`.js`
// contract module could enter the production graph undetected -- agent-document-
// context was in the graph while still listed as unwired and the leak assertion
// still reported nothing (see D-354).
function inGraph(graph, name) {
    return graph.has(name) || graph.has(`${name}.js`) || graph.has(`${name}.ts`);
}

test('unwired agent contract modules stay out of the production import graph', () => {
    const graph = collectProductionGraph();
    const leaked = UNWIRED_CONTRACT_MODULES.filter((module) => inGraph(graph, module));
    assert.deepEqual(leaked, [],
        `contract modules reached the production graph without a bundle-budget decision: ${leaked.join(', ')}`);
});

test('production graph traversal reaches every wired runtime module', () => {
    const graph = collectProductionGraph();
    const missing = WIRED_SANITY_MODULES.filter((module) => !inGraph(graph, module));
    assert.deepEqual(missing, [],
        `traversal failed to reach wired modules (traversal regression): ${missing.join(', ')}`);
});

test('production graph size stays within the audited budget envelope', (t) => {
    const graph = collectProductionGraph();
    // 2026-09-16 T-6260（D-386 第二步）：storage-migration 演练快照入图，闭包 41→42。
    // 2026-09-17 T-6291（P1-1a）：mobile-switcher-ui 入图，闭包 44→45。
    // 2026-09-17 T-6294（P1-1b）：second-panel-ui 入图，闭包 45→46。
    // 2026-09-17 T-6298（ADR 0057）：checkin-bridge-model 入图，闭包 46→48。
    // 2026-09-18 T-6303：rss-model 入图（RSS/Atom 订阅组件），闭包 48→49。
    // 继续增长须复核 512 KiB 包体门禁（D-353）。
    t.diagnostic(`production import graph modules: ${graph.size}`);
    assert.ok(graph.size <= 49, `production graph grew to ${graph.size} modules; audited ceiling is 49`);
});
