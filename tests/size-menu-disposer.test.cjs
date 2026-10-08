// T-7180 修复：尺寸菜单 owner disposer 契约（源码扫描 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const index = readSourceFile('src/index.ts');
const panel = readSourceFile('src/second-panel-ui.ts');

test('openHomeSizeMenu returns an idempotent disposer (T-7180)', () => {
    const fnStart = index.indexOf('private openHomeSizeMenu');
    const body = index.slice(fnStart, index.indexOf('\n    }\n', fnStart) + 6);
    assert.match(body, /let cleaned = false;/, '幂等旗标必须存在');
    assert.match(body, /if \(cleaned\) return;/, '重复清理必须短路');
    assert.match(body, /return cleanup;/, '必须返回 disposer');
    assert.match(body, /anchor\.focus\(\{preventScroll: true\}\);/, 'cleanup 必须回焦触发按钮（T-7180 焦点回归锚）');
    assert.match(body, /panel\.remove\(\);/, 'cleanup 必须移除菜单');
    assert.match(body, /removeEventListener\("pointerdown", outside, true\);/, 'pointerdown 必须解绑');
    assert.match(body, /removeEventListener\("keydown", esc, true\);/, 'keydown 必须解绑');
    assert.match(body, /window\.removeEventListener\("resize", reposition\);/, 'resize 必须解绑');
});

test('second-panel-ui stores the disposer and releases it on panel teardown (T-7180)', () => {
    assert.match(panel, /let disposeSizeMenu: \(\) => void = \(\) => undefined;/, 'disposer 槽必须声明');
    assert.match(panel, /disposeSizeMenu\(\);\n\s*disposeSizeMenu = this\.openHomeSizeMenu\(/, '新开前先释放旧浮层');
    const release = panel.indexOf('releasePanel = () => {');
    const releaseBody = panel.slice(release, panel.indexOf('\n        };', release));
    assert.match(releaseBody, /disposeSizeMenu\(\);/, '面板释放链必须调用尺寸菜单 disposer');
});

test('detector self-check: fire-and-forget call is caught (negative verification)', () => {
    const legacy = 'this.openHomeSizeMenu(sizeButton, supported, sizeKey, (picked) => { ... });';
    assert.doesNotMatch(legacy, /disposeSizeMenu = /, 'fire-and-forget 调用形态必须可被识别');
    const current = readSourceFile('src/second-panel-ui.ts');
    assert.match(current, /disposeSizeMenu = this\.openHomeSizeMenu\(/, '真实源码必须存槽');
});
