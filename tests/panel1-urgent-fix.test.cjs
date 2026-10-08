// T-7222：第一面板紧急回归——宿主标题去重、预览栏占满右列、预览请求信号。
// 本测试读取生产源码而非自造 DOM，违规注入必须让对应断言失败。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceText} = require('./source-scan.cjs');

const shell = readSourceText('src/styles/_platform-shell.scss');
const polish = readSourceText('src/styles/_11-ui-polish.scss');

test('platform dialogs hide the redundant native title row', () => {
    const block = shell.slice(shell.indexOf('.b3-dialog__container.sw-platform-dialog > .b3-dialog__header'),
        shell.indexOf('.b3-dialog__container.sw-platform-dialog > .b3-dialog__body') + 160);
    assert.match(block, /display:\s*none\s*!important/);
    assert.match(block, /padding-top:\s*0\s*!important/);
});

test('tab preview rail keeps the wide column and stretches through the tab list', () => {
    const railStart = polish.indexOf('.speed-switch .sw__tab-preview.sw--with-preview');
    assert.ok(railStart >= 0, '必须登记页签预览栏覆盖规则');
    const rail = polish.slice(railStart, polish.indexOf('\n}', railStart) + 2);
    assert.match(rail, /grid-template-columns:\s*minmax\(0, 1fr\) clamp\(280px, 34%, 480px\)/);
    assert.match(rail, /align-items:\s*stretch/);
    const paneStart = polish.indexOf('.speed-switch .sw__tab-preview.sw--with-preview .sw__doc-preview');
    const pane = polish.slice(paneStart, polish.indexOf('\n}', paneStart) + 2);
    assert.match(pane, /align-self:\s*stretch/);
    assert.match(pane, /height:\s*auto/);
    assert.match(pane, /min-height:\s*min\(60vh, 560px, calc\(100cqh - 48px\)\)/);
});

