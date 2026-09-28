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

test('scene markup mirrors SiYuan block semantics so community selectors hit (T-6978)', () => {
    const reading = buildSnippetPreviewDocument({scene: 'reading', type: 'css', content: ''});
    // 根因修复钉住：社区片段惯用 `.protyle-wysiwyg [data-node-id].h1` 与
    // `.b3-typography h1`——块必须携带 data-node-id，容器必须同时挂两个类。
    assert.ok(reading.includes('data-node-id="20240101120000-1a2b3c4"'), '块必须带 data-node-id（社区选择器命中前提）');
    assert.ok(reading.includes('class="protyle-wysiwyg b3-typography'), '容器必须同时挂 protyle-wysiwyg 与 b3-typography');
    assert.ok(reading.includes('data-subtype="h1"'), '标题带级别语义');
});

test('css coverage probes append only the element kinds the snippet targets (T-6978)', () => {
    const {analyzeCssCoverage} = require('../src/snippet-studio-preview.js');
    // 莫兰迪样例：h1~h6 变量 + .protyle-wysiwyg [data-node-id].hN 选择器
    const morandi = ':root{--siyuan-heading-h3-color:#a87153}.protyle-wysiwyg [data-node-id].h3{color:var(--siyuan-heading-h3-color)}.b3-typography h4{color:#0ff}';
    assert.deepEqual(analyzeCssCoverage(morandi), ['h3', 'h4'], '标题级别探针按选择器命中');
    assert.deepEqual(analyzeCssCoverage('a:hover{color:red} ul li{margin:0} img{border-radius:4px} [data-type="tag"]{fill:red} strong{weight:700}'), ['links', 'lists', 'images', 'tags', 'marks'], '链接/列表/图片/标签/行内标记全谱命中');
    assert.deepEqual(analyzeCssCoverage('/* a ul li img */ .p{color:red}'), [], '注释不参与检测');
    assert.deepEqual(analyzeCssCoverage('.list-item .mark-text{color:red}'), [], '词边界：list-item/mark-text 不误报 li/mark');
    assert.deepEqual(analyzeCssCoverage(''), []);

    // 无命中 → 无探针区块；有命中 → 探针区块只含命中类型
    const plain = buildSnippetPreviewDocument({scene: 'reading', type: 'css', content: '.p{color:red}'});
    assert.ok(!plain.includes('class="studio-probe-note"'), '无命中不得渲染探针区块');
    const withProbe = buildSnippetPreviewDocument({scene: 'reading', type: 'css', content: 'a{color:red} ul{padding:0} img{max-width:100%} kbd{border:1px solid}'});
    assert.ok(withProbe.includes('<a href="#probe">'), '链接探针元素');
    assert.ok(withProbe.includes('<ul') || withProbe.includes('class="list"'), '列表探针元素');
    assert.ok(withProbe.includes('<img src="data:image/svg+xml,'), '图片探针（data URI，CSP img-src data: 允许）');
    assert.ok(withProbe.includes('<kbd>'), '行内标记探针元素');
    assert.ok(withProbe.includes('class="studio-probe-note"'), '探针区块说明行');
    const baseline = buildSnippetPreviewDocument({scene: 'reading', type: 'css', content: 'a{color:red}', baseline: true});
    assert.ok(!baseline.includes('class="studio-probe-note"'), 'baseline 对比视图不做探针（保持原样例）');
});

test('probe markup stays static: no scripts, no network, CSP intact (T-6978)', () => {
    const probed = buildSnippetPreviewDocument({scene: 'reading', type: 'css', content: 'a ul img mark li h3 h4 h5 h6 [data-type="tag"] NodeTaskListItem{color:red}'});
    assert.ok(!probed.includes('<script'), 'CSS 预览不得内嵌脚本');
    assert.ok(!probed.includes('http://') && !probed.includes('https://'), '探针不得引入网络资源（图片走 data URI）');
    assert.ok(probed.includes("script-src &#39;none&#39;"), 'CSP 禁脚本语义不变');
    assert.ok(probed.includes('data-type="NodeTaskListItem"'), '任务列表探针');
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
