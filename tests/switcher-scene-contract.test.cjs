// T-7163：切换器跨面板往返现场快照契约（源码扫描 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const index = readSourceFile('src/index.ts');

test('scene snapshot is captured on switcher destroy (T-7163)', () => {
    const destroy = index.indexOf('sceneScroll.scrollTop');
    assert.notEqual(destroy, -1, '销毁捕获必须存在（代码锚：scrollTop 采样）');
    const block = index.slice(destroy - 600, index.indexOf('release.fn();', destroy) + 12);
    assert.match(block, /sceneInput\.value/, '快照必须捕获 query');
    assert.match(block, /this\.docSearchState\.filters\.get\(sceneScroll\)/, '快照必须捕获筛选');
    assert.match(block, /sceneScroll\.scrollTop/, '快照必须捕获滚动');
});

test('fresh entries reset the scene; roundtrips keep it (T-7163)', () => {
    const show = index.indexOf('private showSwitcher');
    const showBody = index.slice(show, show + 700);
    assert.match(showBody, /if \(!context\) this\.switcherScene = null;/, '新入口必须重置现场');
    const assemble = index.indexOf('const switcherScene = context ? this.switcherScene : null;');
    assert.notEqual(assemble, -1, '装配必须以 context 门控恢复');
});

test('restored scene drives query, filters and the first paint branch (T-7163)', () => {
    assert.match(index, /this\.docSearchState\.filters\.set\(scrollElement, \{\.\.\.switcherScene\.filters\}\);/, '筛选必须写回新 scrollElement');
    assert.match(index, /searchInput\.value = switcherScene\.query;/, 'query 必须写回输入框');
    // 初次 paint 与 refreshList 同分支：有 query/筛选走 applySearch
    // 初次 paint：renderWorkbench 前的分支与 refreshList 同为「||」形态（有 query 或筛选走 applySearch）
    const workbench = index.indexOf('this.renderWorkbench(scrollElement, "", closeOverlay)');
    assert.notEqual(workbench, -1, '零词条工作台入口必须存在');
    const paintBlock = index.slice(index.lastIndexOf('if (searchInput', workbench), index.indexOf('this.bindKeydown', workbench));
    assert.match(paintBlock, /this\.applySearch\(scrollElement, searchInput, closeOverlay\)/, '恢复现场必须走搜索渲染');
    assert.match(paintBlock, /this\.renderWorkbench\(scrollElement, "", closeOverlay\)/, '空现场保持零词条工作台');
    assert.match(index, /restoreSceneScroll\(\);/, '滚动恢复必须在装配尾调用');
});

test('scene is session-scoped only (never persisted)', () => {
    assert.match(index, /private switcherScene: \{query: string; filters: Record<string, unknown>; scrollTop: number\} \| null = null;/, '实例字段声明');
    // 不落 updateSettings / 不写持久化 key
    const sceneWrites = [...index.matchAll(/switcherScene\s*=\s*[^;\n]+/g)].map((m) => m[0]);
    const persisted = sceneWrites.filter((w) => /updateSettings|saveSettings|localStorage/.test(w));
    assert.deepEqual(persisted, [], '现场快照只能存内存实例字段');
});

test('detector self-check: fresh-entry without reset is caught (negative verification)', () => {
    const broken = 'private showSwitcher(focusSearch = false) { /* no reset */ }';
    assert.doesNotMatch(broken, /if \(!context\) this\.switcherScene = null;/, '缺重置的形态必须可被识别');
    assert.match(index, /if \(!context\) this\.switcherScene = null;/, '真实源码必须含重置');
});
