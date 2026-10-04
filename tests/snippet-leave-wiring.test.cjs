// T-6956：脏稿三选一接线契约——canClose 同步阻止、待执行意图续行、三选一对话框
// 默认聚焦取消、保存失败停在草稿；readSourceFile 已剥注释。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const uiSource = readSourceFile('src/snippet-studio-ui.js');
const model = readSourceFile('src/snippet-studio-model.js');

test('leave intent wiring: canClose stays synchronous and blocks dirty drafts', () => {
    assert.match(uiSource, /canClose: \(\) => \{\s*\/\/ T-6956：宿主发起的关闭先同步阻止；脏稿经三选一，得到明确结果后由\s*\n\s*\/\/ 待执行意图继续（platform\.onClose 会再次触发宿主关闭）。干净则放行。\s*\n\s*if \(busy\) return false;\s*\n\s*if \(!dirty\(\)\) return true;\s*\n\s*const verdict = leave\.requestLeave\(true, busy, \(\) => platform\.onClose\?\.\(true\)\);\s*\n\s*if \(verdict\.action === "confirm"\) openLeaveDialog\(\);\s*\n\s*return false;\s*\n\s*\},/,
        'canClose 必须同步阻止脏稿关闭并打开三选一，不得把 Promise 当布尔');
});

test('leave intent wiring: every leave path goes through the intent coordinator', () => {
    assert.ok(uiSource.includes('const leave = createLeaveIntentCoordinator();'), '必须使用模型层协调器');
    assert.ok((uiSource.match(/guardLeave\(/g) || []).length >= 7, '所有离开路径（新建/刷新/导入/清单/外部/导航/关闭）必须走 guardLeave');
    assert.ok(!uiSource.includes('win.confirm(t("snippetDiscard"))'), '旧同步强制放弃确认必须移除');
});

test('leave intent wiring: three-way dialog defaults to cancel and stays on failure', () => {
    assert.ok(uiSource.includes('snippetLeaveSave'), '保存并继续');
    assert.ok(uiSource.includes('snippetLeaveDiscard'), '放弃更改');
    assert.ok(uiSource.includes('snippetLeaveSaveFailed'), '保存失败必须可见回执并停留草稿');
    assert.match(uiSource, /cancelChoice\.focus\(\{preventScroll: true\}\);/, '默认聚焦取消');
    assert.ok(model.includes('function createLeaveIntentCoordinator'), '协调器必须存在于纯模型');
    assert.ok(model.includes('if (typeof run === "function") run();'), '意图只经协调器显式执行');
});
