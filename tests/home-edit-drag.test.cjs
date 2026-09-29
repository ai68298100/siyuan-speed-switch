// T-7030 切片①②：工作台编辑交互契约——Pointer 拖拽（把手触发+落点虚影+Esc
// 取消+全局监听自清理）替换 HTML5 DnD；键盘 Ctrl/Cmd+方向重排；三处重排共用
// home-model 纯函数。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {readSourceFile} = require('./source-scan.cjs');
const {moveLayoutEntry, moveLayoutEntryByOffset} = require('../src/home-model.js');

const panelSource = readSourceFile('src/second-panel-ui.ts');
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'en.json'), 'utf8'));

test('edit drag model: move/offset semantics match the legacy splice behavior', () => {
    const list = [{instanceId: 'a'}, {instanceId: 'b'}, {instanceId: 'c'}];
    assert.deepEqual(moveLayoutEntry(list, 'a', 'c').list.map((e) => e.instanceId), ['b', 'c', 'a'], '拖拽落点语义=先摘 from 再插 to');
    assert.equal(moveLayoutEntry(list, 'a', 'a').moved, false, '同位不动作');
    assert.equal(moveLayoutEntry(list, 'x', 'a').moved, false, '找不到不动作');
    assert.deepEqual(moveLayoutEntryByOffset(list, 'c', -2).list.map((e) => e.instanceId), ['c', 'a', 'b'], '偏移移动');
    assert.equal(moveLayoutEntryByOffset(list, 'a', -1).moved, false, '越界不动作');
    assert.deepEqual(list.map((e) => e.instanceId), ['a', 'b', 'c'], '输入不可变');
});

test('edit drag wiring: pointer drag replaces HTML5 DnD with cancel and self-cleanup', () => {
    assert.doesNotMatch(panelSource, /draggable = true|addEventListener\("dragstart"|addEventListener\("drop"/,
        'HTML5 DnD 必须整体移除（触控不可用/无取消/无落点预览）');
    assert.match(panelSource, /dragHandle\.classList\.add\("sw-home__tool--drag"\);/, '拖动把手必须存在');
    assert.match(panelSource, /dragHandle\.addEventListener\("pointerdown"/, '拖拽必须由把手 Pointer 触发');
    assert.match(panelSource, /if \(key\.key !== "Escape"\) return;\s*\n\s*key\.preventDefault\(\);\s*\n\s*key\.stopPropagation\(\);\s*\n\s*finish\(false\);/,
        'Esc 必须取消拖拽（不提交）');
    assert.match(panelSource, /window\.removeEventListener\("pointermove", onMove\);\s*\n\s*window\.removeEventListener\("pointerup", onUp\);\s*\n\s*window\.removeEventListener\("pointercancel", onCancel\);\s*\n\s*window\.removeEventListener\("keydown", onKey, true\);/,
        '全局监听必须在 finish 中自清理');
    assert.match(panelSource, /hovered\.dataset\.instanceId \|\| null/, '落点目标必须按实例标识识别');
});

test('edit drag wiring: keyboard reorder refocuses and shared model across three call sites', () => {
    assert.match(panelSource, /cell\.addEventListener\("keydown", \(key\) => \{\s*\n\s*if \(!\(key\.ctrlKey \|\| key\.metaKey\)\) return;/,
        'Ctrl/Cmd+方向键必须触发键盘重排');
    assert.match(panelSource, /fresh\?\.focus\(\{preventScroll: false\}\);/, '重排后必须回焦被移动的卡');
    const modelCalls = (panelSource.match(/moveLayoutEntry(ByOffset)?\(/g) || []).length;
    assert.ok(modelCalls >= 4, `拖拽/键盘/上移/下移必须共用纯模型，实测 ${modelCalls} 处`);
    assert.doesNotMatch(panelSource, /list\.splice\(from, 1\)/, '不得残留内联 splice 重排');
    assert.ok(zh.homeDragMove && en.homeDragMove, '把手文案必须双语齐备');
});
