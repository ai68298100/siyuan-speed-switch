// T-7043 行为级：路径筛选代际按 surface/session（scrollElement）隔离——
// 跨表面打开路径菜单不得作废对方在途请求；同表面重开才作废自己的旧请求；
// 旧响应迟到不得覆盖新状态。生产函数经 TS 提取转译后真实执行（沿用
// doc-preview-behavior.test.cjs 的提取模式）。
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const {readSourceFile} = require('./source-scan.cjs');
const model = require('../src/path-filter-model.js');

const source = readSourceFile('src/doc-search-ui.ts');
const ast = ts.createSourceFile('ui.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'loadDocSearchPathChildren');
assert.ok(fn, 'loadDocSearchPathChildren 必须存在于生产模块');
const compiled = ts.transpileModule(fn.getText(ast).replace(/^export\s+/, ''), {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText;
const load = new Function('buildPathFilterListRequest', 'normalizePathFilterProbeOutcome', 'MAX_PATH_ITEMS', 'pathFilterControllers', 'AbortController',
    compiled + '\nreturn loadDocSearchPathChildren;')(
    model.buildPathFilterListRequest, model.normalizePathFilterProbeOutcome, model.MAX_PATH_ITEMS, new WeakMap(), AbortController);

const NOTEBOOK = '20260901';
const PATH = '/';
const OK_PAYLOAD = {code: 0, data: {box: NOTEBOOK, path: PATH, files: []}};

function makeHost() {
    const deferreds = [];
    const host = {
        docSearchState: {pathGenerations: new WeakMap()},
        fetchKernelJson: () => new Promise((resolve) => deferreds.push(resolve)),
    };
    const surfaceA = {};
    const surfaceB = {};
    const bump = (el) => {
        const next = (host.docSearchState.pathGenerations.get(el) || 0) + 1;
        host.docSearchState.pathGenerations.set(el, next);
        return next;
    };
    return {host, deferreds, surfaceA, surfaceB, bump};
}

test('path generation: opening the menu on another surface does not cancel in-flight requests (T-7043)', async () => {
    const {host, deferreds, surfaceA, surfaceB, bump} = makeHost();
    const genA = bump(surfaceA);
    const genB = bump(surfaceB);
    const flightA = load.call(host, NOTEBOOK, PATH, genA, surfaceA);
    const flightB = load.call(host, NOTEBOOK, PATH, genB, surfaceB);
    assert.equal(deferreds.length, 2, '两个表面的请求都必须真实发出（互不作废）');
    deferreds[0](OK_PAYLOAD);
    deferreds[1](OK_PAYLOAD);
    const [resultA, resultB] = await Promise.all([flightA, flightB]);
    assert.equal(resultA.ok, true, '表面 A 的在途请求不得被表面 B 打开菜单作废');
    assert.equal(resultB.ok, true, '表面 B 的在途请求不得被表面 A 打开菜单作废');
    assert.notEqual(resultA.reason, 'cancelled');
});

test('path generation: reopening the menu on the same surface cancels its own stale request', async () => {
    const {host, deferreds, surfaceA, bump} = makeHost();
    const genA = bump(surfaceA);
    const flight = load.call(host, NOTEBOOK, PATH, genA, surfaceA);
    assert.equal(deferreds.length, 1);
    bump(surfaceA);
    deferreds[0](OK_PAYLOAD);
    const result = await flight;
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'cancelled', '同表面重开必须作废自己的在途请求');
});

test('path generation: a stale generation is dropped before the request is even sent', async () => {
    const {host, deferreds, surfaceA, bump} = makeHost();
    bump(surfaceA);
    const stale = 1;
    bump(surfaceA);
    const result = await load.call(host, NOTEBOOK, PATH, stale, surfaceA);
    assert.equal(deferreds.length, 0, '过期代际必须在发起请求前被拒绝');
    assert.equal(result.reason, 'cancelled');
});
