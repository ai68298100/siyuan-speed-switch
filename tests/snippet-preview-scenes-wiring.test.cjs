// T-6960：场景与宽度切换接线契约——预览工具条挂白名单场景与宽度选择、
// 渲染透传场景/宽度、切换不触及草稿。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const uiSource = readSourceFile('src/snippet-studio-ui.js');
const previewSource = readSourceFile('src/snippet-studio-preview.js');

test('preview scenes wiring: toolbar exposes whitelisted scene and width selects', () => {
    assert.match(uiSource, /const sceneSelect = select\("snippetScene", \[\["reading", "snippetSceneReading"\], \["table", "snippetSceneTable"\], \["controls", "snippetSceneControls"\]\]\);/,
        '场景选择必须是三场景白名单');
    assert.match(uiSource, /const widthSelect = select\("snippetPreviewWidth", \[\["auto", "snippetWidthAuto"\], \["narrow", "snippetWidthNarrow"\], \["medium", "snippetWidthMedium"\], \["wide", "snippetWidthWide"\]\]\);/,
        '宽度必须是有限档位');
    assert.match(uiSource, /sceneSelect\.addEventListener\("change", \(\) => \{ previewScene = sceneSelect\.value; renderPreview\(\); \}\);/,
        '切换必须即时重渲染');
});

test('preview scenes wiring: render passes scene and width through to the sandbox', () => {
    assert.match(uiSource, /scene: previewScene, width: previewWidth\}\);/, '渲染必须透传场景与宽度');
    assert.match(previewSource, /function resolvePreviewWidth\(widthId, containerWidth\)/, '宽度不足回退必须经纯函数');
    assert.match(previewSource, /nextFrame\.style\.width = `\$\{fixedWidth\}px`;/, '固定档位写入 iframe 宽度');
});

test('preview scenes wiring: scene switching never touches the draft', () => {
    const toolbar = uiSource.slice(uiSource.indexOf('const sceneSelect'), uiSource.indexOf('previewToolbar.append(previewLead, compareButton, themeButton, sceneSelect'));
    assert.ok(!toolbar.includes('editor.value ='), '场景/宽度切换不得写编辑器内容');
    assert.ok(!toolbar.includes('draft ='), '场景/宽度切换不得改草稿对象');
});
