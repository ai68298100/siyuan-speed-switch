// T-7181：收藏下拉关闭即释放契约（源码扫描 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const source = readSourceFile('src/index.ts');

test('closePanel releases all global listeners on close (T-7181)', () => {
    const fnStart = source.indexOf('const closePanel = () => {\n            panel.classList.add("fn__none");');
    assert.notEqual(fnStart, -1, 'closePanel 必须存在');
    const body = source.slice(fnStart, source.indexOf('\n        };', fnStart) + 10);
    assert.match(body, /unbindGlobal\(\);/, '关闭必须立即解绑全局监听（历史：仅隐藏等下次点击兜底）');
    // 解绑目标：pointerdown/resize/scroll 三监听 + 观察器 disconnect 都在 unbindGlobal 内
    const ubStart = source.indexOf('const unbindGlobal = () => {');
    const ubBody = source.slice(ubStart, source.indexOf('};', ubStart));
    assert.match(ubBody, /removeEventListener\("pointerdown"/, 'pointerdown 解绑');
    assert.match(ubBody, /removeEventListener\("resize"/, 'resize 解绑');
    assert.match(ubBody, /removeEventListener\("scroll"/, 'scroll 解绑');
    assert.match(ubBody, /observer\?\.disconnect\(\)/, '观察器断开');
});

test('open path re-registers after close released them (T-7181)', () => {
    const open = source.indexOf('document.addEventListener("pointerdown", onDocPointerDown, true);');
    assert.notEqual(open, -1, '打开路径必须重注册三监听');
    const observe = source.indexOf('observer?.observe(document.body, {childList: true, subtree: true});');
    assert.notEqual(observe, -1, '打开路径必须重启观察器');
});

test('detector self-check: hide-only closePanel is caught (negative verification)', () => {
    const legacy = 'const closePanel = () => {\n    panel.classList.add("fn__none");\n};';
    assert.doesNotMatch(legacy, /unbindGlobal/, '历史仅隐藏形态必须可被识别');
    const current = readSourceFile('src/index.ts');
    const fnStart = current.indexOf('const closePanel = () => {\n            panel.classList.add("fn__none");');
    const body = current.slice(fnStart, current.indexOf('\n        };', fnStart));
    assert.match(body, /unbindGlobal\(\);/, '真实源码必须关闭即释放');
});
