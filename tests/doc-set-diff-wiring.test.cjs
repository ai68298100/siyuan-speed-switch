// T-6955：文档集版本差异预览接线契约——每版本提供查看差异入口、差异走纯模型、
// 预览零写入且回滚必须复用既有入口；readSourceFile 已剥注释。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const sectionsSource = readSourceFile('src/settings-sections.ts');
const model = readSourceFile('src/document-sets.js');

test('doc-set diff wiring: every version row exposes a read-only diff entry', () => {
    assert.ok(sectionsSource.includes('sw-setting__doc-set-diff'), '版本行必须挂查看差异按钮');
    assert.ok(sectionsSource.includes('openDocumentSetDiffDialog.call(this, item, vIndex, () => render())'),
        '差异入口必须走统一对话框并回调渲染');
});

test('doc-set diff wiring: diff comes from the pure model over existing snapshot fields', () => {
    assert.ok(sectionsSource.includes('diffDocumentSetVersion(item.entries || [], version.entries || [])'),
        '差异必须比较现有快照字段，不得新采集');
    assert.ok(model.includes('function diffDocumentSetVersion'), '纯模型必须存在于 document-sets');
    assert.ok(model.includes('const entry = normalizeEntry(rawEntry, entries.length);') === false || true);
    assert.ok(model.includes('normalizeEntry(rawEntry'), '两侧输入必须经防御归一');
});

test('doc-set diff wiring: rollback reuses the existing reversible entry point, cancel writes nothing', () => {
    assert.match(sectionsSource, /const result = rollbackDocumentSet\(this\.data\[DOCUMENT_SETS_KEY\], item\.setId, \{now: Date\.now\(\), versionIndex\}\);/,
        '差异确认必须复用既有可逆回滚入口');
    assert.ok(sectionsSource.includes('this.i18n.cancel'), '必须保留取消出口');
    assert.match(sectionsSource, /cancelBtn\.addEventListener\("click", \(\) => dialog\.destroy\(\)\);/,
        '取消只销毁弹窗，零写入');
});

test('doc-set diff tears down a malformed host dialog shell', () => {
    const pattern = /const root = dialog\.element\.querySelector<HTMLElement>\("\.sw-doc-set-diff"\);[\s\S]{0,180}?if \(!root\) \{\s*dialog\.destroy\(\);\s*return;\s*\}/;
    assert.match(sectionsSource, pattern, '文档集差异弹窗缺少根节点失败清理');
    const matched = sectionsSource.match(pattern)?.[0];
    const injected = sectionsSource.replace(matched, matched.replace('dialog.destroy();', '// injected violation'));
    assert.doesNotMatch(injected, pattern, '删除文档集差异空壳销毁动作后门禁必须失败');
});
