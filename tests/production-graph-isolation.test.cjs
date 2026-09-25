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
    'agent-workspace-capability-definitions',
    'agent-workspace-probe',
    // T-6680（ADR 0063 宿主路线）：agent-workspace-plan / agent-workspace-actions /
    // agent-workspace-registry / agent-host-actions / agent-write-actions /
    // agent-document-set-actions 六模块作为 propose/execute 双能力进入生产图；
    // ADR 0063（T-6677）撤除的自建审批管线（approval-token / workspace-approval /
    // workspace-execution / workspace-session / workspace-capability / workspace-bridge）
    // 不再存在，也不会回潜入生产图。
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
    // T-6757/B0：悬浮球配置模型与 portal 生命周期控制器随移动入口进入生产图。
    'floating-ball-model',
    'floating-ball-ui',
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
    // T-6759/B2：悬浮球动作执行器与首层/更多动作面板进入生产图。
    'floating-ball-actions',
    'floating-ball-panel',
    // T-6869（P1-c，ADR 0079）：平台 SurfaceContext 纯模型（表面白名单/上下文归一化/
    // 悬浮球恢复回退/ContextBar 文案投影）进入生产图；闭包 66→67 已复核，
    // 包体复核见 release-readiness 快照（raw 1024 KiB 自律线、zip 硬上限独立审查）。
    'platform-surface-model',
    // T-6871（RZ-1）：平台原语 DOM 助手（六态徽标/kbd/分段控件/胶囊按钮）进入生产图。
    'platform-dom',
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
    // 2026-09-18 T-6308：air-quality-model 入图（空气质量组件），闭包 49→50。
    // 2026-09-18 T-6321~6328：kernel-widget-model 入图（内核数据组件群投影），闭包 50→51。
    // 2026-09-18 T-6376~6383：document-widget-model 入图（收藏/文档集/指定文档纯投影），闭包 51→52。
    // 2026-09-20 T-6680（ADR 0063 宿主路线）：执行链六模块入图（plan/actions/registry/
    // host-actions/write-actions/document-set-actions，propose+execute 双能力），闭包 52→58。
    // T-6757/B0：floating-ball-ui 接入 index.ts，闭包 58→59；模型已由
    // settings-model 的版本化配置入口进入同一闭包。
    // T-6759/B2：floating-ball-actions 与 floating-ball-panel 接入 index.ts，闭包 59→61。
    // T-6760/B3：floating-ball-settings-model 接入设置页，闭包 61→62。
    // T-6764/B7：有界 floating-ball-layout 几何入图，实测 63；审计上限 64，见 ADR 0068。
    // T-6814（R5-A）：related-content-model 只读关联投影入图，实测 65；上限按
    // ADR 0076 口径随实测增量校准 64→66（数量类门禁仅作观测护栏，不阻挡合理功能）。
    // T-6869（P1-c，ADR 0079）：platform-surface-model 平台路由上下文纯模型入图，
    // 实测 67；上限按同口径校准 66→67（先例 T-6814），包体余量另行复核。
    // T-6871（RZ-1，ADR 0079）：platform-dom 平台原语 DOM 助手（徽标/kbd/分段/胶囊）
    // 入图，实测 68；上限按同口径校准 67→68，包体余量另行复核。
    // 包体复核：raw 1024 KiB 自律线、zip 硬上限与压缩条目线均独立审查（见 release-readiness 快照）。
    // 继续增长须复核 512 KiB 包体门禁（D-353）。
    t.diagnostic(`production import graph modules: ${graph.size}`);
    assert.ok(graph.size <= 68, `production graph grew to ${graph.size} modules; audited ceiling is 68`);
});
