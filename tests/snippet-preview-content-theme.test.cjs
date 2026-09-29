// T-6989 预览内容扩展 + T-6990 主题 token bridge：纯模型行为 + 安全边界。
// - 内容扩展：Callout/列/公式/块属性/数据库/媒体占位/文档标题 按真实 selector 采样，
//   全部静态样例（无脚本、无远程资源、无真实媒体元素）；
// - 主题桥接：只读内置 light/dark 快照，不加载宿主 CSS，**不接受外部 token 注入**。
// 注意：readSourceFile 已剥注释，锚点全部钉代码形态。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CSS_PROBE_PATTERNS,
    analyzeCssCoverage,
    buildSnippetPreviewDocument,
    SNIPPET_PREVIEW_THEME_PROFILES,
    resolveThemeProfile,
    renderThemeTokens,
    resolvePreviewCapability,
    formatPreviewCapability,
} = require('../src/snippet-studio-preview.js');
const {readSourceFile} = require('./source-scan.cjs');

const uiSource = readSourceFile('src/snippet-studio-ui.js');

const EXTENSION_SELECTORS = {
    callouts: '.b3-callout',
    columns: '.layout-column',
    formula: '.katex',
    attrs: '.protyle-attr',
    database: '.av',
    media: 'video',
    title: '.protyle-title',
};

test('content extension: every new feature is detected and renders its fixture (T-6989)', () => {
    for (const [feature, selector] of Object.entries(EXTENSION_SELECTORS)) {
        assert.ok(CSS_PROBE_PATTERNS[feature].test(selector), `特征 ${feature} 必须命中样例选择器 ${selector}`);
    }
    const content = Object.values(EXTENSION_SELECTORS).map((selector) => `${selector} { color: red; }`).join("\n");
    const features = analyzeCssCoverage(content);
    for (const feature of Object.keys(EXTENSION_SELECTORS)) {
        assert.ok(features.includes(feature), `覆盖检测必须报出 ${feature}`);
    }
    const doc = buildSnippetPreviewDocument({type: "css", content, labels: {}});
    // 夹具落进预览文档（类名/数据类型对齐思源惯用 DOM）
    for (const marker of ['b3-callout', 'layout-column', 'data-subtype="math"', 'protyle-attr',
        'NodeAttributeView', 'studio-media-blocked', 'protyle-title']) {
        assert.ok(doc.includes(marker), `预览文档必须包含 ${marker} 夹具`);
    }
});

test('media fixture is a blocked placeholder — no real media elements, no remote resources (T-6989)', () => {
    const content = Object.values(EXTENSION_SELECTORS).map((selector) => `${selector} { color: red; }`).join("\n");
    const doc = buildSnippetPreviewDocument({type: "css", content, labels: {}});
    assert.doesNotMatch(doc, /<(video|audio|iframe|embed|object)[\s>]/i, '预览不出现真实媒体/嵌入元素');
    assert.doesNotMatch(doc.replace(/data:image\/svg\+xml[^"']*/g, ""), /https?:\/\//, '除 data: 图片外不得出现远程地址');
    assert.match(doc, /studio-media-blocked/, '媒体必须是 blocked 占位');
});

test('fixture labels are HTML-escaped text nodes (T-6989)', () => {
    const doc = buildSnippetPreviewDocument({
        type: "css",
        content: ".b3-callout { color: red; }",
        labels: {probeCallout: '<script>alert(1)</script> 探针'},
    });
    assert.doesNotMatch(doc, /<script>alert\(1\)<\/script> 探针/, '标签值必须转义');
    assert.ok(doc.includes("&lt;script&gt;alert(1)&lt;/script&gt; 探针"), '转义后以文本呈现');
});

test('theme profiles: two frozen builtin snapshots, closed to external injection (T-6990)', () => {
    const ids = Object.keys(SNIPPET_PREVIEW_THEME_PROFILES);
    assert.deepEqual(ids.sort(), ["dark", "light"], '只允许内置 light/dark 两套快照');
    for (const profile of Object.values(SNIPPET_PREVIEW_THEME_PROFILES)) {
        assert.ok(Object.isFrozen(profile) && Object.isFrozen(profile.tokens), '快照必须冻结');
        assert.equal(Object.keys(profile.tokens).length, 8, '每套快照 8 个核心 token');
    }
    assert.equal(resolveThemeProfile("dark").id, "dark");
    assert.equal(resolveThemeProfile("bogus").id, "light", '未知主题回落亮色');
    // 外部注入负例：options 上的 tokens 不进入文档（桥接只读内置快照）
    const doc = buildSnippetPreviewDocument({
        type: "css",
        content: "",
        dark: false,
        tokens: {"--b3-theme-background": "evil-injected-value"},
    });
    assert.doesNotMatch(doc, /evil-injected-value/, '外部 token 注入必须被无视');
    // 渲染确实来自快照模型（暗色底色出自 profile，而非内联三元）
    const darkDoc = buildSnippetPreviewDocument({type: "css", content: "", dark: true});
    assert.ok(darkDoc.includes("--b3-theme-background:#20242c"), '暗色文档必须使用快照值');
    assert.ok(renderThemeTokens(resolveThemeProfile("light")).includes("--b3-theme-background:#fff"));
});

test('capability receipt marks the read-only token snapshot (T-6990)', () => {
    assert.equal(resolvePreviewCapability({type: "css", dark: true}).tokenSource, "builtin-dark");
    assert.equal(resolvePreviewCapability({type: "css", baseline: true}).tokenSource, "none", '基线对照无主题覆盖');
    const text = formatPreviewCapability(
        resolvePreviewCapability({type: "css", dark: true}),
        {},
        {tokenProfile: "主题 token：内置快照（只读）"},
    );
    assert.ok(text.includes("主题 token：内置快照（只读）"), '回执必须标注 token 来源与只读语义');
    // UI 接线：回执 boundary 参数携带 token 标签
    assert.match(uiSource, /tokenProfile: t\("snippetCapabilityTokenProfile"\),/);
    assert.match(uiSource, /tokenBaseline: t\("snippetCapabilityTokenBaseline"\),/);
});
