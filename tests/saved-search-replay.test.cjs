// T-7162：保存搜索回放范围隔离——纯模型单测 + 回放契约（含检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const model = require('../src/search-model.js');
const uiSource = readSourceFile('src/doc-search-ui.ts');

test('replay filters carry only the saved notebook', () => {
    assert.deepEqual(model.buildSavedSearchReplayFilters({notebook: '  nb1 '}), {notebook: 'nb1'}, 'notebook 裁剪保留');
    assert.deepEqual(model.buildSavedSearchReplayFilters({}), {}, '无 notebook = 空筛选');
    assert.deepEqual(model.buildSavedSearchReplayFilters({notebook: 42}), {}, '非字符串忽略');
    assert.deepEqual(model.buildSavedSearchReplayFilters(null), {}, '空入参安全');
    assert.deepEqual(model.buildSavedSearchReplayFilters({notebook: 'nb', paths: ['/x']}), {notebook: 'nb'}, '未保存字段一律不采纳');
});

test('replay does not inherit the live filter scene (T-7162 contract)', () => {
    // applySavedSearchFilters 必须从保存项构造筛选，不得复制当前现场
    assert.match(uiSource, /const filters: IDocSearchFilters = buildSavedSearchReplayFilters\(saved\);/,
        '回放筛选必须来自 buildSavedSearchReplayFilters');
    const fnStart = uiSource.indexOf('export function applySavedSearchFilters');
    const fnBody = uiSource.slice(fnStart, uiSource.indexOf('\n}', fnStart) + 2);
    assert.doesNotMatch(fnBody, /\.\.\.\(?this\.docSearchState\.filters\.get/,
        '回放不得复制当前现场筛选（历史缺陷：仅覆盖 notebook，其余字段泄漏）');
});
