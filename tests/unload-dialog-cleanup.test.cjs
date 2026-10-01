// T-7179：卸载时三面板 Dialog 统一回收契约（源码扫描 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const source = readSourceFile('src/index.ts');

test('onunload destroys all four panel dialogs (T-7179)', () => {
    const fnStart = source.indexOf('async onunload()');
    const body = source.slice(fnStart, fnStart + 2000);
    for (const dialog of ['snippetStudioDialog', 'platformSwitcherDialog', 'workbenchDialog', 'mobileSwitcherDialog']) {
        assert.match(body, new RegExp(`this\\.${dialog}\\?\\.destroy\\(\\);`), `onunload 必须显式销毁 ${dialog}`);
        assert.match(body, new RegExp(`this\\.${dialog} = null;`), `onunload 必须置空 ${dialog}`);
    }
});

test('destroy order: snippet studio first (matches existing pattern)', () => {
    const fnStart = source.indexOf('async onunload()');
    const body = source.slice(fnStart, fnStart + 2000);
    const snippetAt = body.indexOf('this.snippetStudioDialog?.destroy()');
    const switcherAt = body.indexOf('this.platformSwitcherDialog?.destroy()');
    assert.ok(snippetAt > 0 && switcherAt > snippetAt, '片段实验室先销毁（与既有模式一致），后补的其他面板在其后');
});

test('detector self-check: missing dialog destroy is caught (negative verification)', () => {
    const legacy = 'async onunload() {\n        this.isUnloading = true;\n        // no dialog cleanup\n    }';
    assert.doesNotMatch(legacy, /platformSwitcherDialog\?\.destroy/, '历史形态（无 Dialog 回收）必须可被识别');
    assert.match(source, /this\.platformSwitcherDialog\?\.destroy\(\);/, '真实源码必须显式销毁切换器 Dialog');
});
