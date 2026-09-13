const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');

// v0.17 契约层模块:独立存在、独立测试,但尚未决定接入生产 bundle。
// 任何模块进入本清单的生产闭包都必须先通过包体预算决策(D-216),
// 防止 155 KiB 源码无声涌入仅剩 ~1 KiB 余量的 300 KiB 硬上限归档。
const UNWIRED_CONTRACT_MODULES = [
    'agent-approval-token',
    'agent-document-context',
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
    'path-filter-model',
];

const WIRED_SANITY_MODULES = [
    'agent-capabilities',
    'agent-workspace-diagnostics',
    'agent-workspace-runtime',
    'home-adapters',
    'home-controller',
    'search-model',
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

test('unwired agent contract modules stay out of the production import graph', () => {
    const graph = collectProductionGraph();
    const leaked = UNWIRED_CONTRACT_MODULES.filter((module) => graph.has(module)
        || graph.has(`${module}.ts`));
    assert.deepEqual(leaked, [],
        `contract modules reached the production graph without a bundle-budget decision: ${leaked.join(', ')}`);
});

test('production graph traversal reaches every wired runtime module', () => {
    const graph = collectProductionGraph();
    const has = (module) => graph.has(module) || graph.has(`${module}.js`) || graph.has(`${module}.ts`);
    const missing = WIRED_SANITY_MODULES.filter((module) => !has(module));
    assert.deepEqual(missing, [],
        `traversal failed to reach wired modules (traversal regression): ${missing.join(', ')}`);
});

test('production graph size stays within the audited budget envelope', (t) => {
    const graph = collectProductionGraph();
    // 2026-09-14 阶段 1 接入后闭包为 25 个模块（+runtime/+diagnostics，
    // D-220）；超过 29 说明引入了新生产模块，必须复核包体预算后再放行。
    t.diagnostic(`production import graph modules: ${graph.size}`);
    assert.ok(graph.size <= 29, `production graph grew to ${graph.size} modules; audit baseline is 25`);
});
