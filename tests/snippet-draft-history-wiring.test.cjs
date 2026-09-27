// T-6957：统一草稿历史接线契约——身份变化重置、输入合并落账、IME 不截断、
// 编辑器键盘接管、AI 接受作为一个事务、撤销/重做真实写回控件。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const uiSource = readSourceFile('src/snippet-studio-ui.js');
const model = readSourceFile('src/snippet-studio-model.js');

test('draft history wiring: choose resets history only on snippet identity change', () => {
    assert.match(uiSource, /const identity = native\?\.id \|\| `draft:\$\{value\.source \|\| "draft"\}:\$\{value\.name\}:\$\{value\.type\}`;/,
        '身份必须由稳定 id（或草稿签名）表达');
    assert.match(uiSource, /if \(identity !== draftHistorySignature\) \{\s*\n\s*resetDraftHistory\(identity\);/,
        '仅身份变化才重置历史——保存（同 id choose）保留撤销栈');
    assert.ok(model.includes('DRAFT_HISTORY_MAX_STEPS = 50'), '模型必须有 50 步上限');
    assert.ok(model.includes('DRAFT_HISTORY_MAX_BYTES = 512 * 1024'), '模型必须有总字节预算');
});

test('draft history wiring: typing settles into commits, type change commits instantly', () => {
    assert.match(uiSource, /function changed\(\) \{\s*\n\s*revision \+= 1;\s*\n\s*draft = \{\.\.\.draft, name: nameInput\.value, type: typeSelect\.value, content: editor\.value\};\s*\n\s*syncFields\(\);\s*\n\s*scheduleDraftHistoryCommit\(\);/,
        '输入合并经 changed() 调度落账');
    assert.match(uiSource, /typeSelect\.addEventListener\("change", \(\) => \{\s*\n\s*changed\(\);\s*\n\s*commitDraftHistory\(\);\s*\n\s*\}\);/,
        '类型切换立即落账');
});

test('draft history wiring: IME composition never truncates a transaction; editor owns undo keys', () => {
    assert.match(uiSource, /field\.addEventListener\("compositionstart", \(\) => \{ composing = true; \}\);/,
        '组合期不得截断事务');
    assert.match(uiSource, /field\.addEventListener\("compositionend", \(\) => \{\s*\n\s*composing = false;\s*\n\s*commitDraftHistory\(\);\s*\n\s*\}\);/,
        '组合提交后落账');
    assert.match(uiSource, /String\(event\.key\)\.toLowerCase\(\) !== "z" \|\| composing\) return;\s*\n\s*event\.preventDefault\(\);/,
        '编辑器聚焦时接管原生撤销快捷键（组合期放行给输入法）');
    assert.match(uiSource, /if \(event\.shiftKey\) redoDraft\(\);\s*\n\s*else undoDraft\(\);/, 'Shift+Z 反向');
});

test('draft history wiring: undo/redo write back the real controls and AI accept is one transaction', () => {
    assert.ok(uiSource.includes('draftUndoButton = action("snippetUndo"'), '编辑区必须有撤销按钮');
    assert.ok(uiSource.includes('draftRedoButton = action("snippetRedo"'), '编辑区必须有重做按钮');
    assert.ok(uiSource.includes('draftUndoButton.disabled = busy || !canUndoDraftHistory(draftHistory);'), '可用态跟随历史');
    assert.match(uiSource, /draft\.content = applied;\s*\n\s*draft\.type = candidate\.type;\s*\n\s*revision \+= 1;[\s\S]*?commitDraftHistory\(\);/,
        'AI 接受（整段/hunk 合并）必须作为一个事务落账');
});
