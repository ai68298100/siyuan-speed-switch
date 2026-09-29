// T-6958：冲突界面接线契约——冲突检测进可决策界面、副本经新建管线禁用落盘、
// 放弃重载走只读重取、继续/取消零写入。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const uiSource = readSourceFile('src/snippet-studio-ui.js');
const model = readSourceFile('src/snippet-studio-model.js');
const hostSource = readSourceFile('src/snippet-studio-host.js');

test('conflict wiring: save conflicts open the decidable conflict dialog', () => {
    // T-7045 演进：冲突分支先落错误回执再打开可决策界面（此前为单行 void 调用，
    // 待确认态重构时冲突语义保持不变，仅分支结构变化）。
    assert.match(uiSource, /if \(String\(error\?\.message \|\| ""\) === "snippet-conflict"\) \{\s*\n\s*setStatus\(errorText\(error\), "error"\);\s*\n\s*void openConflictDialog\(\);/,
        '写前/写后冲突必须打开冲突界面');
    assert.ok(hostSource.includes('snippet-conflict'), '宿主必须保留 snippet-conflict 错误语义');
});

test('conflict wiring: disabled copy goes through the create pipeline with a unique name', () => {
    assert.match(uiSource, /buildConflictCopyEntry\(latest, \{name: draft\.name, type: draft\.type, content: draft\.content\}, copyId\)/,
        '副本必须经纯模型构建（新 id + 禁用 + 唯一名）');
    assert.match(uiSource, /store\.mutate\(null, "save", input\)/, '副本必须走新建管线（baseline=null），不改冲突原件');
    assert.ok(model.includes('function nextConflictCopyName'), '唯一命名必须走纯模型');
});

test('conflict wiring: reload is read-only and continue/cancel keep the local draft', () => {
    assert.match(uiSource, /snippetConflictReload/, '必须提供放弃并重载出口');
    assert.match(uiSource, /if \(latestEntry\) \{\s*\n\s*choose\(latestEntry, latestEntry\);\s*\n\s*\} else \{\s*\n\s*void load\(true\);/, '重载只读重取，不写入');
    assert.ok(uiSource.includes('snippetConflictContinue'), '必须保留继续编辑出口');
});

// T-7044：副本保存成功后曾调用未定义的局部 render()（openPicker 私有），抛出的
// ReferenceError 被本层 catch 捕获，把已成功写入误报成失败。契约钉住：成功路径
// 只能走 pickerRefresh 钩子，钩子由 openPicker 注册、closePicker 摘除。
test('conflict wiring: copy success refreshes via the picker hook, never an undefined render', () => {
    assert.match(uiSource, /setStatus\(t\("snippetSaved"\), "ready"\);\s*\n\s*dialog\.destroy\(\);\s*\n\s*if \(pickerRefresh\) pickerRefresh\(\);/,
        '副本保存成功路径必须走 pickerRefresh 钩子刷新目录');
    assert.match(uiSource, /pickerRefresh = render;/, 'openPicker 必须注册目录重绘钩子');
    assert.match(uiSource, /pickerRelease = \(\) => \{\};\s*\n\s*pickerRefresh = null;/, 'closePicker 必须摘除钩子，防悬挂引用');
    assert.doesNotMatch(uiSource, /dialog\.destroy\(\);\s*\n\s*render\(\);/,
        '成功路径不得调用未定义的 render()（openPicker 私有局部函数）');
});
