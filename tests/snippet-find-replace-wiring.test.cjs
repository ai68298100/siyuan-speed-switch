// T-6959：编辑区查找替换接线契约——按需查找条、两步替换全部（单事务落账）、
// 选区导航、busy 禁用。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const uiSource = readSourceFile('src/snippet-studio-ui.js');
const model = readSourceFile('src/snippet-studio-model.js');

test('find-replace wiring: toggle expands the find bar inside the editor section', () => {
    assert.ok(uiSource.includes('const findToggleButton = action("snippetFindBar", () => toggleFindBar());'), '工具条必须有查找开关');
    assert.match(uiSource, /editorSection\.append\(editorBar, findBar, editor, fileInput, restoreInput\);/, '查找条必须位于编辑器上方，导入入口必须保持隐藏挂载');
    assert.ok(uiSource.includes('findBar.hidden = !findBar.hidden;'), '开关必须切换展开态');
});

test('find-replace wiring: replace-all is literal via the model and lands as one transaction', () => {
    assert.match(uiSource, /const result = replaceDraftMatches\(editor\.value, query, findReplaceInput \? findReplaceInput\.value : ""\);/,
        '替换必须走纯模型字面替换');
    assert.match(uiSource, /commitDraftHistory\(\);\s*\n\s*const result = replaceDraftMatches/, '替换前先结算未落账输入');
    assert.match(uiSource, /suppressDraftHistory = true;\s*\n\s*editor\.value = result\.content;\s*\n\s*changed\(\);\s*\n\s*suppressDraftHistory = false;\s*\n\s*commitDraftHistory\(\);/,
        '替换结果必须作为单事务落账（一次撤销即恢复）');
    assert.ok(uiSource.includes('replaceArmed = true;'), '替换全部必须两步确认');
    assert.ok(model.includes('DRAFT_FIND_MATCH_CAP'), '模型必须有命中封顶');
});

test('find-replace wiring: navigation uses textarea selection and busy disables inputs', () => {
    assert.match(uiSource, /editor\.setSelectionRange\(match\.start, match\.end\);/, '导航必须用选区定位');
    assert.match(uiSource, /if \(findQueryInput\) findQueryInput\.disabled = busy;/, 'busy 期间查找输入禁用');
    assert.match(uiSource, /snippetFindNone/, '无命中必须有可见文案');
});
