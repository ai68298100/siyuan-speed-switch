// T-6960：预览场景与视口切换——白名单三场景、有限宽度档位、宽度不足回退、
// CSP 隔离在所有场景下不变（CSS 预览 script-src 恒为 'none'）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    SNIPPET_PREVIEW_SCENES, SNIPPET_PREVIEW_WIDTHS,
    normalizePreviewScene, resolvePreviewWidth, buildSnippetPreviewDocument,
} = require('../src/snippet-studio-preview.js');

test('scene catalog is a fixed whitelist and unknown ids fall back to reading', () => {
    assert.deepEqual(SNIPPET_PREVIEW_SCENES.map((s) => s.id), ['reading', 'table', 'controls']);
    assert.equal(normalizePreviewScene('table'), 'table');
    assert.equal(normalizePreviewScene('hacked'), 'reading', '未知场景必须回落，不得透传');
});

test('each scene builds its whitelisted static markup without scripts or network', () => {
    const reading = buildSnippetPreviewDocument({scene: 'reading', type: 'css', content: '.h1{color:red}'});
    const table = buildSnippetPreviewDocument({scene: 'table', type: 'css', content: ''});
    const controls = buildSnippetPreviewDocument({scene: 'controls', type: 'css', content: ''});
    assert.ok(reading.includes('让灵感有自己的样子'), '阅读场景保留综合样例');
    assert.ok(table.includes('<table>') && table.includes('code-block'), '表格与代码场景');
    assert.ok(!table.includes('demo-button'), '表格场景不含阅读场景专属按钮');
    assert.ok(controls.includes('<button') && controls.includes('<input') && controls.includes('<select'), '控件场景含表单控件');
    for (const doc of [reading, table, controls]) {
        assert.ok(doc.includes("script-src &#39;none&#39;"), 'CSS 预览 CSP 必须保持禁脚本（转义形态）');
        assert.ok(!doc.includes('<script'), 'CSS 预览不得内嵌脚本');
        assert.ok(!doc.includes('http://') && !doc.includes('https://'), '场景样例不得引入网络资源');
    }
});

test('preview width tiers clamp to the container and fall back to single view', () => {
    assert.deepEqual(SNIPPET_PREVIEW_WIDTHS.map((w) => w.id), ['auto', 'narrow', 'medium', 'wide']);
    assert.equal(resolvePreviewWidth('medium', 900), 768);
    assert.equal(resolvePreviewWidth('wide', 900), 0, '容器容不下时回退单视图');
    assert.equal(resolvePreviewWidth('auto', 2000), 0, 'auto 即 100%');
    assert.equal(resolvePreviewWidth('narrow', 500), 420);
    assert.equal(resolvePreviewWidth('unknown-width', 500), 0);
});
