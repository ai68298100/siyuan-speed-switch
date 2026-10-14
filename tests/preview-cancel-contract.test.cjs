// T-7165/T-7191：预览与路径筛选请求取消契约（源码扫描 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const ui = readSourceFile('src/doc-search-ui.ts');
const index = readSourceFile('src/index.ts');

test('cancelDocPreview aborts the in-flight preview controllers (T-7165)', () => {
    const fnStart = ui.indexOf('export function cancelDocPreview');
    const body = ui.slice(fnStart, ui.indexOf('\n}', fnStart) + 2);
    assert.match(body, /docPreviewControllers\.get\(scrollElement\)/, '必须取在途 controller');
    assert.match(body, /inflight\.abort\(\)/, '必须真正 abort（历史只递增代际）');
    assert.match(ui, /const docPreviewControllers = new WeakMap<HTMLElement, AbortController>\(\);/, '容器必须声明');
});

test('loadDocPreview carries the signal into both kernel requests (T-7165)', () => {
    const fnStart = ui.indexOf('async function loadDocPreview');
    const body = ui.slice(fnStart, ui.indexOf('\n    }\n', fnStart) + 6);
    assert.match(body, /new AbortController\(\)/, '必须创建取消控制器');
    assert.match(body, /signal: controller\?\.signal/, '两个请求必须携带 signal');
    assert.match(body, /docPreviewControllers\.delete\(scrollElement\)/, '完成后必须清理登记');
    const outlineCall = body.match(/getDocOutline[^)]*\{signal: controller\?\.signal\}/);
    const docCall = body.match(/getDoc[^)]*\{signal: controller\?\.signal\}/);
    assert.ok(outlineCall && docCall, 'outline 与 getDoc 两路都要带 signal');
});

test('path filter requests abort on generation bump (T-7191)', () => {
    assert.match(ui, /const pathFilterControllers = new WeakMap<HTMLElement, AbortController>\(\);/, '容器必须声明');
    const bump = ui.indexOf('this.docSearchState.pathGenerations.set(scrollElement, generation);');
    const bumpBlock = ui.slice(ui.lastIndexOf('openPathMenu', bump), bump + 400);
    assert.match(bumpBlock, /stalePathController\.abort\(\)/, '代际递增处必须 abort 旧请求');
    const fnStart = ui.indexOf('export async function loadDocSearchPathChildren');
    const body = ui.slice(fnStart, ui.indexOf('\n    }\n', fnStart) + 6);
    assert.match(body, /listDocsByPath", request\.body, \{signal: controller\?\.signal\}/, '路径请求必须携带 signal');
    assert.match(body, /pathFilterControllers\.delete\(scrollElement\)/, '完成后必须清理登记');
});

test('kernel fetch impl links external signal with its timeout abort', () => {
    const fnStart = index.indexOf('private async fetchKernelJsonOutcome');
    const body = index.slice(fnStart, index.indexOf('\n    }\n', fnStart) + 6);
    assert.match(body, /signal:\s*externalSignal/, '共享请求服务必须接受外部 signal');
    assert.match(body, /timeoutMs,/, '统一请求入口必须传递 deadline');
    assert.match(body, /this\.requestService\.request\(/, '请求必须经过共享服务');
});

test('kernel fetch accepts extracted UI options in the third argument', () => {
    const fnStart = index.indexOf('private async fetchKernelJson');
    const body = index.slice(fnStart, index.indexOf('\n    }\n', fnStart) + 6);
    assert.match(body, /timeoutOrOptions: number \| \{signal\?: AbortSignal(?:;[^}]*)?\}/,
        '实现必须兼容第三参直接传取消选项的抽取模块调用');
    assert.match(index, /const requestOptions = typeof timeoutOrOptions === "number" \? options : timeoutOrOptions/,
        '第三参对象必须成为实际外部 signal');
});

test('detector self-check: replaying only-generation cancel is caught (negative verification)', () => {
    const legacy = 'const generation = (docPreviewGenerations.get(scrollElement) || 0) + 1;\n    return generation;';
    assert.doesNotMatch(legacy, /abort\(\)/, '历史只递增代际的取消必须能被识别为缺 abort');
    const fixed = 'inflight.abort();';
    assert.match(fixed, /abort\(\)/, '修复形态必须含 abort 调用');
});
