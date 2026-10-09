// T-6961：配置包差异应用接线契约——导入先归一校验、差异走纯模型、确认时重验
// 并发签名、组粒度落盘且写入异常如实回执。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const sectionsSource = readSourceFile('src/settings-sections.ts');
const indexSource = readSourceFile('src/index.ts');
const model = readSourceFile('src/config-pack-model.js');

test('pack diff wiring: import normalizes first, then opens the diff dialog', () => {
    assert.match(sectionsSource, /const normalized = normalizeConfigPackImport\(parsed\);/,
        '导入必须先走既有归一契约');
    assert.match(sectionsSource, /openConfigPackDiffDialog\.call\(this, parsed, groups, signature,/, '必须打开差异对话框');
    assert.match(sectionsSource, /const signature = configPackBaselineSignature\(current\);/, '必须记录预览基线签名');
});

test('pack diff wiring: confirm re-validates the baseline before applying selected groups', () => {
    assert.match(sectionsSource, /configPackBaselineSignature\(current\) !== currentSignature/,
        '确认时必须重验并发签名，不应用旧预览');
    assert.match(sectionsSource, /this\.importConfigPack\(parsed, \{groups: chosen\}\)/,
        '应用必须按勾选组走宿主组粒度导入');
});

test('pack diff wiring: host applier persists only selected groups and reports partial failure', () => {
    assert.match(indexSource, /const selected = new Set\(requested\.filter\(\(group\) => group === "settings" \|\| group === "documentSets"\)\);/,
        '组白名单必须在宿主侧再过滤');
    assert.match(indexSource, /return \{ok: false, reason: "apply-failed", applied\};/, '写入异常必须如实回执已应用范围');
    assert.ok(model.includes('function diffConfigPackGroups'), '差异纯模型必须存在于 config-pack-model');
    assert.ok(model.includes('selected.has("settings")') || model.includes('selectedGroups'), '合并必须按勾选组');
});

test('pack diff tears down a malformed host dialog shell', () => {
    const pattern = /const root = dialog\.element\.querySelector<HTMLElement>\("\.sw-config-pack-diff"\);[\s\S]{0,180}?if \(!root\) \{\s*dialog\.destroy\(\);\s*return;\s*\}/;
    assert.match(sectionsSource, pattern, '配置包差异弹窗缺少根节点失败清理');
    const matched = sectionsSource.match(pattern)?.[0];
    const injected = sectionsSource.replace(matched, matched.replace('dialog.destroy();', '// injected violation'));
    assert.doesNotMatch(injected, pattern, '删除配置包差异空壳销毁动作后门禁必须失败');
});
