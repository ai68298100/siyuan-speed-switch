// T-7022：双栏预览契约——左=已保存版本效果（显式渲染保存代码，禁冒用 baseline
// 原始样例标志），右=当前草稿效果；环境（场景/宽度/主题）两栏同步；窄容器单栏
// 降级（compareButton 切换）；无基线时左栏明确空态；预览零脚本封死语义延续。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {readSourceFile} = require('./source-scan.cjs');

const uiSource = readSourceFile('src/snippet-studio-ui.js');
const previewSource = readSourceFile('src/snippet-studio-preview.js');
const scss = readSourceFile('src/styles/_snippet-studio.scss');
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'en.json'), 'utf8'));

test('dual pane: two isolated preview instances with explicit saved code on the left (T-7022)', () => {
    assert.match(uiSource, /const previewSaved = createSnippetPreview\(savedCanvas, \{/,
        '左栏必须是独立隔离预览实例');
    assert.match(uiSource, /previewSaved\.render\(\{type: baseline\.type, content: original, dark, scene: previewScene, width: previewWidth\}\);/,
        '左栏必须显式渲染保存代码（baseline.type + original）');
    assert.match(uiSource, /const savedKey = \[baseline\.id, baseline\.type, original, dark, previewScene, previewWidth\]\.join/,
        '左栏内容签名必须含观察环境（场景/宽度/主题切换两栏同步）');
    assert.doesNotMatch(uiSource, /previewSaved\.render\(\{[^}]*baseline: true/,
        '左栏不得用 baseline 原始样例标志冒充已保存效果');
});

test('dual pane: layout decision, narrow fallback and empty state (T-7022)', () => {
    assert.match(uiSource, /const SNIPPET_DUAL_PANE_MIN = 860;/, '双栏阈值必须为具名常量');
    assert.match(uiSource, /previewDual\.dataset\.view = dual \? "dual" : \(savedView \? "saved" : "draft"\);/,
        '视图状态必须按容器宽度与单栏切换语义判定');
    assert.match(uiSource, /const savedView = !dual && showOriginal && !!baseline;/,
        '单栏切换语义必须以基线存在为前提');
    assert.match(uiSource, /compareButton\.hidden = dual;/, '双栏模式下切换按钮必须隐藏（两栏并排无需切换）');
    assert.match(uiSource, /savedPane\.dataset\.empty = "true";\s*\n\s*savedEmpty\.hidden = false;/,
        '无基线时左栏必须明确空态');
    assert.match(uiSource, /dualPaneObserver\?\.disconnect\(\);/, 'ResizeObserver 必须随面板销毁释放');
});

test('dual pane: styles, bilingual labels and the sealed no-script boundary (T-7022)', () => {
    assert.match(scss, /&__preview-dual \{ display: grid; grid-template-columns: 1fr 1fr;/, '双栏网格必须存在');
    assert.match(scss, /&__preview-dual\[data-view="draft"\] \.sw-studio__preview-pane--saved \{ display: none; \}/,
        '单栏降级必须隐藏未激活栏');
    for (const key of ['snippetPaneSaved', 'snippetPaneDraft', 'snippetPaneSavedEmpty']) {
        assert.ok(zh[key] && en[key], `i18n 键 ${key} 必须双语齐备`);
    }
    assert.doesNotMatch(previewSource, /allow-scripts/, '预览模块必须保持零脚本封死（T-7022 安全半场）');
});
