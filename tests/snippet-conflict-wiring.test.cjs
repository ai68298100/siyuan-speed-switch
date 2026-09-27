// T-6958：冲突界面接线契约——冲突检测进可决策界面、副本经新建管线禁用落盘、
// 放弃重载走只读重取、继续/取消零写入。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const uiSource = readSourceFile('src/snippet-studio-ui.js');
const model = readSourceFile('src/snippet-studio-model.js');
const hostSource = readSourceFile('src/snippet-studio-host.js');

test('conflict wiring: save conflicts open the decidable conflict dialog', () => {
    assert.match(uiSource, /String\(error\?\.message \|\| ""\) === "snippet-conflict"\)\s*void openConflictDialog\(\);/,
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
