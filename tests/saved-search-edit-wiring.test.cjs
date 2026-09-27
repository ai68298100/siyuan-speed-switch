// T-6952：保存搜索编辑接线契约——菜单子项（应用/编辑/删除）、编辑对话框、
// 宿主纯模型更新与失败回执必须真实接线；readSourceFile 已剥注释，注释伪装无效。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const uiSource = readSourceFile('src/doc-search-ui.ts');
const indexSource = readSourceFile('src/index.ts');
const model = readSourceFile('src/search-model.js');

test('saved-search edit wiring: menu expands each entry into apply/edit/delete', () => {
    assert.ok(uiSource.includes('searchSavedApply'), '应用子项缺失');
    assert.ok(uiSource.includes('searchSavedEdit'), '编辑子项缺失');
    assert.ok(uiSource.includes('searchSavedDelete'), '删除子项缺失');
    assert.ok(uiSource.includes('openSavedSearchEditor.call(this, saved.id)'), '编辑必须以保存搜索 ID 打开');
});

test('saved-search edit wiring: editor saves through the host normalized update', () => {
    assert.ok(uiSource.includes('this.updateSavedSearch(id, {'), '保存必须走宿主 updateSavedSearch');
    assert.ok(uiSource.includes('searchSavedEditEmptyQuery'), '空查询必须有可见提示');
    assert.ok(uiSource.includes('searchSavedEditTruncated'), '超长必须有可见提示');
    assert.ok(uiSource.includes('saveBtn.disabled = !query'), '空查询必须禁用保存');
    assert.ok(uiSource.includes('this.i18n.cancel'), '必须保留取消出口（零写入）');
});

test('saved-search edit wiring: host update keeps ids via the pure model and persists once', () => {
    assert.ok(indexSource.includes('updateSavedSearchEntry(this.getSavedSearches(), id, patch)'),
        '宿主必须经纯模型 updateSavedSearchEntry 归一');
    assert.ok(indexSource.includes('this.updateSettings({savedSearches: result.list})'),
        '更新必须整体落盘到 savedSearches');
    assert.ok(indexSource.includes('searchSavedUpdateFailed'), '失败必须有可见回执');
    assert.ok(model.includes('function updateSavedSearchEntry'), '纯模型函数必须存在于 search-model');
    assert.ok(model.includes('id: current.id'), '纯模型必须显式保持原 ID');
});
