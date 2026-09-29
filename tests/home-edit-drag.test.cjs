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
const cssSource = readSourceFile('src/styles/_05-settings-widgets.scss');
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

// T-7030 切片③④：边缘自动滚动与移动端防误触——增量计算在纯函数，滚动循环随
// 拖拽结束取消；拖拽期间声明 data-prevent-swipe（宿主手势 L1 契约）结束即摘除。
const {computeEdgeScrollDelta} = require('../src/home-model.js');

test('edit drag edge scroll: pure delta honors edge zones and bounds', () => {
    assert.equal(computeEdgeScrollDelta(10, 600, 100, 500), -14, '上缘区给负增量');
    assert.equal(computeEdgeScrollDelta(590, 600, 100, 500), 14, '下缘区给正增量');
    assert.equal(computeEdgeScrollDelta(300, 600, 100, 500), 0, '中区不滚动');
    assert.equal(computeEdgeScrollDelta(10, 600, 0, 500), 0, '已到顶不再负滚');
    assert.equal(computeEdgeScrollDelta(590, 600, 500, 500), 0, '已到底不再正滚');
    assert.equal(computeEdgeScrollDelta(10, 600, 0, 0), 0, '不可滚容器恒零');
});

test('edit drag slices 3-4: edge loop and swipe guard wiring', () => {
    assert.match(panelSource, /const delta = computeEdgeScrollDelta\(lastClientY - rect\.top, rect\.height, scrollContainer\.scrollTop, maxScrollTop\);/,
        '边缘增量必须走纯模型');
    // 负向验证教训：只钉「循环定义存在」时摘除驱动调用仍绿（存在≠被驱动）——
    // 必须钉住 onMove 内的驱动调用点（邻接锚定）。
    assert.match(panelSource, /updateHover\(move\.clientX, move\.clientY\);\s*\n\s*ensureEdgeLoop\(\);/,
        'onMove 必须实际驱动边缘滚动循环');
    assert.match(panelSource, /edgeFrame = window\.requestAnimationFrame\(applyEdgeScroll\);/, '边缘滚动必须逐帧续驱');
    assert.match(panelSource, /if \(edgeFrame\) window\.cancelAnimationFrame\(edgeFrame\);/, '拖拽结束必须取消边缘滚动帧');
    assert.match(panelSource, /if \(on\) cell\.setAttribute\("data-prevent-swipe", "true"\);/, '拖拽激活必须声明防误触契约');
    assert.match(panelSource, /cell\.removeAttribute\("data-prevent-swipe"\);/, '拖拽结束必须摘除防误触声明');
});

test('edit drag entry: cell long-press enters the shared drag pipeline (T-7068)', () => {
    // 双入口共享同一启动器：把手直拉与长按都必须落在 beginDrag 上（存在≠被调用，邻接钉住）
    assert.match(panelSource, /const beginDrag = \(event: \{button: number; clientX: number; clientY: number; preventDefault: \(\) => void\}\) => \{/,
        '拖拽启动器必须提取为 beginDrag 供双入口共用');
    assert.match(panelSource, /dragHandle\.addEventListener\("pointerdown", beginDrag\);/,
        '把手直拉必须接到 beginDrag');
    // 长按守卫：鼠标旁路、工具按钮旁路、进行中旁路
    assert.match(panelSource, /if \(event\.pointerType === "mouse"\) return;/, '鼠标必须旁路长按（走把手，不抢选择）');
    assert.match(panelSource, /\?\.closest\("\.sw-home__tool"\)\) return;/, '工具按钮必须旁路长按（保留点击语义）');
    assert.match(panelSource, /if \(dragCleanup \|\| holdTimer\) return;/, '拖拽进行中必须旁路长按');
    // 触发条件：520ms 静置 + 位移 ≤6px 才进入；位移超限/抬起/取消即撤销
    assert.match(panelSource, /Math\.hypot\(move\.clientX - holdOrigin\.x, move\.clientY - holdOrigin\.y\) > 6\) cancelHold\(\);/,
        '长按位移超限必须撤销');
    assert.match(panelSource, /beginDrag\(\{button: 0, clientX: origin\.x, clientY: origin\.y, preventDefault: \(\) => undefined\}\);/,
        '长按触发必须实际调用 beginDrag（邻接锚定）');
    assert.match(panelSource, /cell\.classList\.add\("sw-home__cell--hold"\);/, '长按按压态必须可见（主色描边）');
    assert.match(panelSource, /cell\.classList\.remove\("sw-home__cell--hold"\);/, '长按结束必须摘除按压态');
    // 全局监听自清理（与拖拽 finish 同一卫生标准）
    assert.match(panelSource, /window\.removeEventListener\("pointermove", onHoldMove\);\s*\n\s*window\.removeEventListener\("pointerup", onHoldUp\);\s*\n\s*window\.removeEventListener\("pointercancel", onHoldUp\);/,
        '长按全局监听必须在撤销时自清理');
    // 触屏滚动契约：单元格 pan-y 保纵向滚动，按压态收紧为 none
    assert.match(cssSource, /\.sw-home__cell \{[^}]*touch-action: pan-y;/s, '单元格必须保纵向滚动（pan-y）');
    assert.match(cssSource, /\.sw-home \.sw-home__cell--hold \{[^}]*touch-action: none;/s, '按压态必须收紧手势');
});
