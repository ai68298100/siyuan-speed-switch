// T-6987 预览契约 v2 + T-6988 CSS 覆盖诊断：纯模型行为 + 生产接线锚点。
// - 能力回执：SceneId/ViewportId/ThemeProfile 白名单、固定组合、边界常量（脚本/网络/语义）；
// - 覆盖诊断：有界 selector 分层分析——注释/字符串安全、@media/@supports 归属、
//   命中/可能未命中/未知三态、错误行列、上限截断。
// 注意：readSourceFile 已剥注释，锚点全部钉代码形态。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    resolvePreviewCapability,
    formatPreviewCapability,
    analyzeSelectorDiagnostics,
    normalizePreviewTheme,
    SELECTOR_DIAGNOSTICS_LIMITS,
} = require('../src/snippet-studio-preview.js');
const {readSourceFile} = require('./source-scan.cjs');
const {declaresIn} = require('./css-block-scan.cjs');

const uiSource = readSourceFile('src/snippet-studio-ui.js');
const previewSource = readSourceFile('src/snippet-studio-preview.js');
const css = readSourceFile('src/index.scss');
const base = {topLevel: true};

test('capability: whitelists scene/viewport/theme and freezes the receipt (T-6987)', () => {
    const cap = resolvePreviewCapability({type: "css", scene: "table", width: "narrow", dark: true, probeHits: ["h3", "links"], containerWidth: 500});
    assert.equal(cap.scene, "table");
    assert.equal(cap.viewport.id, "narrow");
    assert.equal(cap.viewport.appliedWidth, 420);
    assert.equal(cap.theme, "dark");
    assert.deepEqual(cap.probe.hits, ["h3", "links"]);
    assert.equal(cap.probe.count, 2);
    assert.equal(cap.script, "blocked", 'CSS 预览脚本必须标记为完全禁用');
    assert.equal(cap.network, "none", '网络边界是固定常量');
    assert.equal(cap.semantics, "approximation", '语义近似是固定标记');
    assert.ok(Object.isFrozen(cap) && Object.isFrozen(cap.viewport) && Object.isFrozen(cap.probe), '回执必须冻结');
    // 白名单外回落 + 基线对照强制
    assert.equal(resolvePreviewCapability({scene: "bogus"}).scene, "reading");
    assert.equal(resolvePreviewCapability({width: "bogus"}).viewport.id, "auto");
    assert.equal(normalizePreviewTheme("bogus"), "light");
    const baseline = resolvePreviewCapability({baseline: true, dark: true, probeHits: ["h3"], type: "css"});
    assert.equal(baseline.theme, "baseline");
    assert.equal(baseline.probe.on, false, '基线对照必须关探针');
    assert.deepEqual(baseline.probe.hits, []);
    const js = resolvePreviewCapability({type: "js"});
    // T-7022：JS 执行能力封死后，JS 片段预览与 CSS 同为完全禁脚本（错误引导
    // bootstrap 通道随执行能力一并移除）。
    assert.equal(js.script, "blocked", 'JS 预览脚本边界必须与 CSS 同为完全禁用');
});

test('formatPreviewCapability carries every boundary label (T-6987)', () => {
    const cap = resolvePreviewCapability({type: "css", scene: "reading", width: "wide", dark: false, probeHits: ["links", "tags", "h3"], containerWidth: 1200});
    const text = formatPreviewCapability(cap, {scene: "阅读文档", width: "宽 1024", theme: "亮色"}, {
        probeOn: "探针：命中 {n} 项", probeOff: "探针：关（基线对照）", scriptCss: "脚本：禁用",
        network: "网络：无", semantics: "语义近似预览，不代表当前笔记", singleView: "容器不足，单视图",
        sceneLabel: "场景", widthLabel: "宽度", themeLabel: "主题",
    });
    for (const part of ["场景 阅读文档", "宽度 宽 1024 · 1024px", "主题 亮色", "探针：命中 3 项", "脚本：禁用", "网络：无", "语义近似预览，不代表当前笔记"]) {
        assert.ok(text.includes(part), `回执缺少：${part}`);
    }
    // 容器不足 → 单视图回退说明；基线 → 探针关
    const narrow = formatPreviewCapability(resolvePreviewCapability({width: "wide", containerWidth: 400}), {}, {singleView: "容器不足，单视图"});
    assert.ok(narrow.includes("容器不足，单视图"), '回退单视图必须如实标注');
    const baselineText = formatPreviewCapability(resolvePreviewCapability({baseline: true}), {}, {probeOff: "探针：关（基线对照）"});
    assert.ok(baselineText.includes("探针：关（基线对照）"));
});

test('diagnostics: tier analysis over the fixture matrix with line numbers (T-6988)', () => {
    const css = [
        "a {}",
        ".h3 { x: y; }",
        "[data-type=\"tag\"] { z: w; }",
        "/* 注释 { 干扰 */",
        "@media (max-width: 600px) { ul > li:focus { q } }",
        "@supports (display: grid) { .grid { g } }",
        "input[type=\"text\"]::placeholder { s }",
        ".protyle-custom-thing { u }",
        ".plainunknown { v }",
    ].join("\n");
    const diag = analyzeSelectorDiagnostics(css);
    const bySelector = new Map(diag.rows.map((row) => [row.selector, row]));
    assert.equal(bySelector.get("a").verdict, "hit", '基础特征（链接）= 命中');
    assert.equal(bySelector.get(".h3").line, 2, '行号必须真实（注释前的空行计入）');
    assert.equal(bySelector.get(".h3").verdict, "hit");
    assert.equal(bySelector.get("[data-type=\"tag\"]").attribute, true);
    const mediaRow = bySelector.get("ul > li:focus");
    assert.equal(mediaRow.atRule, "media", '@media 归属必须记录');
    assert.equal(mediaRow.complex, true, '组合器选择器标记 complex');
    const supportsRow = bySelector.get(".grid");
    assert.equal(supportsRow.atRule, "supports", '@supports 归属必须记录');
    assert.equal(bySelector.get("input[type=\"text\"]::placeholder").pseudo, true);
    assert.equal(bySelector.get(".protyle-custom-thing").verdict, "miss", '可识别 SiYuan 前缀但样例没有 = 可能未命中');
    assert.equal(bySelector.get(".plainunknown").verdict, "unknown");
    assert.equal(diag.errors.length, 0);
});

test('diagnostics: strings and declarations never become selectors; brace errors report position (T-6988)', () => {
    // 变量值误判负例：声明/字符串里的 h3、注释里的花括号都不产生选择器或结构错误
    const d1 = analyzeSelectorDiagnostics('.foo { content: "h3 /* x */"; }\n/* @media 假头 */ .bar { color: red; }');
    assert.deepEqual(d1.rows.map((row) => row.selector), [".foo", ".bar"]);
    assert.equal(d1.errors.length, 0);
    // 括号不平衡：错误带行列
    const d2 = analyzeSelectorDiagnostics('.a { color: red;\n\n.b { q }');
    assert.equal(d2.errors.length, 1, '缺少右括号必须报错');
    assert.equal(d2.errors[0].line, 3);
    const d3 = analyzeSelectorDiagnostics('.a }');
    assert.equal(d3.errors.length, 1, '多余右括号必须报错');
    assert.equal(d3.errors[0].line, 1);
    // 上限截断
    const big = Array.from({length: 300}, (_, i) => `.c${i} { a: b; }`).join("\n");
    const d4 = analyzeSelectorDiagnostics(big);
    assert.equal(d4.truncated, true);
    assert.equal(d4.counts.selectors, SELECTOR_DIAGNOSTICS_LIMITS.maxRules);
    assert.ok(d4.rows.length <= SELECTOR_DIAGNOSTICS_LIMITS.maxRows);
});

test('studio UI renders the receipt and diagnostics panel from the pure models (T-6987/T-6988)', () => {
    assert.match(uiSource, /previewReceipt\.setAttribute\("role", "status"\);\s*\n\s*previewReceipt\.setAttribute\("aria-live", "polite"\);/,
        '能力回执必须 live 播报');
    assert.match(uiSource, /const capability = resolvePreviewCapability\(\{\s*\n\s*type: draft\.type, scene: previewScene, width: previewWidth,/,
        '回执必须来自纯模型（UI 只渲染不计算）');
    assert.match(uiSource, /previewReceipt\.textContent = formatPreviewCapability\(capability,/);
    assert.match(uiSource, /previewReceipt\.dataset\.theme = capability\.theme;/);
    assert.match(uiSource, /const diagnostics = analyzeSelectorDiagnostics\(content\);/, '诊断必须走共享纯模型');
    assert.match(uiSource, /if \(draft\.type !== "css"\) \{\s*\n\s*diagnosticsDetails\.hidden = true;/, 'JS 片段不显示诊断');
    assert.match(uiSource, /diagnostics\.errors\.forEach\(\(error\) => \{/, '错误行列必须渲染');
    // 回执样式存在于产物样式源
    assert.ok(declaresIn(css, '.sw-studio__preview-receipt', /border: 1px dashed/, base));
});

// T-7022：预览模块硬封死 JS 执行——T-6996 用户决策维持 blocked。曾存在 runJS=true
// 可达 allow-scripts + data: 脚本注入的分支；UI 按钮 disabled 不构成安全契约，
// 边界必须由预览模块唯一决定。
test('preview module hard-seals JS execution (T-7022)', () => {
    assert.doesNotMatch(previewSource, /allow-scripts/, '沙箱不得出现 allow-scripts');
    assert.doesNotMatch(previewSource, /runJS/, '预览模型不得再接受 runJS 输入');
    assert.doesNotMatch(previewSource, /<script/, '预览文档不得生成 script 元素');
    assert.doesNotMatch(previewSource, /error-bootstrap-only/, '能力回执不得再声明脚本执行档');
    assert.match(previewSource, /script: "blocked",/, '能力回执脚本边界恒为 blocked');
    const policyMatch = previewSource.match(/const policy = `([^`]+)`;/);
    assert.ok(policyMatch, 'CSP 策略必须存在');
    assert.match(policyMatch[1], /script-src 'none';/, 'CSP script-src 必须恒为 none');
    assert.doesNotMatch(policyMatch[1], /script-src \$\{/, 'CSP script-src 不得再动态插值');
    assert.match(uiSource, /preview\.render\(\{type: draft\.type, content, dark, scene: previewScene, width: previewWidth\}\);/, 'UI 渲染不得传 runJS');
    assert.doesNotMatch(uiSource, /snippetRunJS/, 'UI 不得残留执行暗示按钮文案');
    assert.doesNotMatch(uiSource, /runButton/, 'UI 不得残留 runButton 引用');
});
