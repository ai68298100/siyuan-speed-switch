// T-7177：回收站焦点生命周期契约（源码扫描 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const ui = readSourceFile('src/snippet-studio-ui.js');

test('openRecycleViewer captures the opener and registers capture-phase Esc/Tab (T-7177)', () => {
    const fnStart = ui.indexOf('function openRecycleViewer');
    const body = ui.slice(fnStart, ui.indexOf('function openPicker', fnStart));
    assert.match(body, /const opener = doc\.activeElement instanceof doc\.defaultView\.HTMLElement \? doc\.activeElement : null;/,
        '打开时必须捕获触发元素');
    assert.match(body, /doc\.addEventListener\("keydown", keydown, true\)/, 'Esc/Tab 必须走捕获阶段');
    assert.match(body, /doc\.removeEventListener\("keydown", keydown, true\)/, '关闭必须解除捕获监听');
});

test('all close paths route through close() which restores focus (T-7177)', () => {
    const fnStart = ui.indexOf('function openRecycleViewer');
    const body = ui.slice(fnStart, ui.indexOf('function openPicker', fnStart));
    assert.match(body, /const close = \(\) => \{[\s\S]*?closed = true;[\s\S]*?opener\.focus\(\{preventScroll: true\}\);/,
        'close() 必须幂等且回焦触发元素');
    // 四条关闭出口统一走 close()：Esc、外点、关闭按钮、恢复成功
    assert.match(body, /event\.key === "Escape"[\s\S]{0,160}close\(\)/, 'Esc 出口');
    assert.match(body, /event\.target === overlay\) close\(\)/, '外点出口');
    assert.match(body, /action\("snippetClose", \(\) => close\(\)\)/, '关闭按钮出口');
    assert.match(body, /choose\(\{name: entry\.name[\s\S]{0,120}close\(\);/, '恢复成功出口');
    assert.doesNotMatch(body, /overlay\.remove\(\);\n(\s*)(setStatus|root\.appendChild)/, '禁止绕过 close() 直接 remove');
});

test('Tab cycles within the overlay and focus enters on open (T-7177)', () => {
    const fnStart = ui.indexOf('function openRecycleViewer');
    const body = ui.slice(fnStart, ui.indexOf('function openPicker', fnStart));
    assert.match(body, /const focusables = \(\) => Array\.from\(overlay\.querySelectorAll\("button"\)\)\.filter\(\(el\) => !el\.disabled\);/, '必须枚举可用控件');
    assert.match(body, /doc\.activeElement === firstEl && event\.shiftKey/, 'Shift+Tab 首元素回绕');
    assert.match(body, /doc\.activeElement === lastEl && !event\.shiftKey/, 'Tab 末元素回绕');
    assert.match(body, /!overlay\.contains\(doc\.activeElement\)/, '焦点逃逸必须拉回');
    assert.match(body, /firstFocusable\.focus\(\{preventScroll: true\}\);/, '打开必须入焦首个控件');
});

test('detector self-check: bare remove without focus restore is caught (negative verification)', () => {
    const legacy = 'overlay.addEventListener("keydown", (event) => {\n  if (event.key !== "Escape") return;\n  overlay.remove();\n});';
    assert.doesNotMatch(legacy, /opener\.focus/, '历史形态（直接 remove 无回焦）必须可被识别');
    assert.match(ui, /if \(opener\) opener\.focus\(\{preventScroll: true\};?\)?/, '真实源码必须回焦');
});
