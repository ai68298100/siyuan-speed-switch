// T-7161：第三方组件 icon 元数据的 SVG 标记注入回归。
// 两个层面：
// 1) 模型层——home-model.js 归一化把 icon 收敛为合法 symbol ID，恶意/畸形值回退；
// 2) 渲染层契约——home-store-ui.ts 禁止用 innerHTML 拼接 <use>，三处图标消费点
//    必须走 createIconUseSvg 安全构造。检测器先喂违规样例自检（负向验证），
//    确保扫描器真的能抓到回归，再对真实源码断言干净。
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/home-model.js');
const {readSourceFile} = require('./source-scan.cjs');

const storeUiSource = readSourceFile('src/home-store-ui.ts');

const MALICIOUS_ICONS = [
    '"/><img src=x onerror=alert(1)>',
    '"></use><script>alert(1)</script><use xlink:href="#',
    'javascript:alert(1)',
    'icon onload=alert(1)',
    'iconCalendar onclick=alert(1)',
    '<svg onload=alert(1)>',
    'icon"',
    "icon'",
    'icon id=x',
];
const LONG_BENIGN_ICON = 'icon' + 'A'.repeat(64);

test('module definition falls back on malicious icon payloads', () => {
    for (const payload of MALICIOUS_ICONS) {
        const def = model.normalizeModuleDefinition({moduleId: 'probe', title: 'Probe', icon: payload});
        assert.equal(def.icon, 'iconFile', `payload must fall back: ${payload}`);
    }
});

test('module definition falls back on non-string and oversized icons', () => {
    for (const payload of [undefined, null, 42, {}, '', '   ']) {
        const def = model.normalizeModuleDefinition({moduleId: 'probe', title: 'Probe', icon: payload});
        assert.equal(def.icon, 'iconFile');
    }
    const def = model.normalizeModuleDefinition({moduleId: 'probe', title: 'Probe', icon: LONG_BENIGN_ICON});
    assert.equal(def.icon, 'iconFile', 'over-length icon must fall back');
});

test('module definition keeps legitimate symbol ids', () => {
    for (const icon of ['iconCalendar', 'iconPlugin', 'icon-x', '_priv', 'Icon9']) {
        const def = model.normalizeModuleDefinition({moduleId: 'probe', title: 'Probe', icon});
        assert.equal(def.icon, icon);
    }
});

test('source metadata icon falls back to empty on malicious payloads', () => {
    for (const payload of MALICIOUS_ICONS) {
        const def = model.normalizeModuleDefinition({moduleId: 'probe', title: 'Probe', source: {pluginId: 'p', name: 'P', icon: payload}});
        assert.equal(def.source.icon, '', `payload must be dropped: ${payload}`);
    }
});

test('source metadata keeps legitimate icon and defaults safely', () => {
    const def = model.normalizeModuleDefinition({moduleId: 'probe', title: 'Probe', source: {pluginId: 'p', name: 'P', icon: 'iconCalendar'}});
    assert.equal(def.source.icon, 'iconCalendar');
    const bad = model.normalizeModuleDefinition({moduleId: 'probe', title: 'Probe', source: {pluginId: 'p', name: 'P', icon: 42}});
    assert.equal(bad.source.icon, '');
});

// —— 渲染层契约：检测器 + 自检（负向验证）——
// 匹配「innerHTML 赋值右侧出现含插值或引号上下文的 <use 标签」这类注入模式。
function findUnsafeIconInnerHtml(source) {
    const hits = [];
    const re = /innerHTML\s*=\s*[`'"][^`'"]*<use[\s\S]{0,200}?[`'"]\s*;/g;
    let m;
    while ((m = re.exec(source)) !== null) hits.push(m[0].slice(0, 120));
    return hits;
}

test('detector self-check: injection sample is caught (negative verification)', () => {
    const violation = 'icon.innerHTML = `<use xlink:href="#${def.icon}"></use>`;';
    assert.equal(findUnsafeIconInnerHtml(violation).length, 1, 'detector must catch the historic injection pattern');
});

test('store ui source no longer interpolates icons into innerHTML', () => {
    assert.deepEqual(findUnsafeIconInnerHtml(storeUiSource), []);
});

test('store ui builds icons via safe createElementNS helper at every consumption site', () => {
    assert.ok(storeUiSource.includes('function createIconUseSvg'), 'helper must exist');
    const callCount = (storeUiSource.match(/createIconUseSvg\(/g) || []).length;
    assert.equal(callCount, 4, 'helper definition + three icon consumption sites');
    assert.ok(storeUiSource.includes('createElementNS(SVG_NAMESPACE, "use")'), 'use must be namespace-constructed');
});
