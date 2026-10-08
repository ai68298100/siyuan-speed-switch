// T-7185：笔记本加载失败回执契约（源码扫描 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const index = readSourceFile('src/index.ts');
const zh = JSON.parse(require('node:fs').readFileSync('src/i18n/zh-CN.json', 'utf8'));
const en = JSON.parse(require('node:fs').readFileSync('src/i18n/en.json', 'utf8'));

test('notebook loading distinguishes failure from empty (T-7185)', () => {
    assert.match(index, /private async loadNotebooksDetailed\(\): Promise<\{notebooks: Array<\{id: string, name: string\}>, failed: boolean\}>/,
        '失败可区分的详细加载必须存在');
    assert.match(index, /return \{notebooks: \[\], failed: true\};/, '失败路径必须带 failed 标记');
    assert.match(index, /return \{notebooks: result, failed: false\};/, '成功路径必须带 failed=false');
    assert.match(index, /private async loadNotebooks\(\)[\s\S]*?\(await this\.loadNotebooksDetailed\(\)\)\.notebooks;/,
        '旧签名兼容包装必须保留（三处既有调用不破坏）');
});

test('the select renders a failure receipt with retry (T-7185)', () => {
    const fnStart = index.indexOf('private notebookSelect');
    const body = index.slice(fnStart, index.indexOf('\n    }\n', fnStart) + 6);
    assert.match(body, /loadNotebooksDetailed\(\)/, '必须改用详细加载');
    assert.match(body, /if \(failed\) \{/, '失败分支必须存在');
    assert.match(body, /notebookLoadFailed/, '失败文案必须展示');
    assert.match(body, /sel\.disabled = true;/, '失败时下拉禁用');
    assert.match(body, /homeRetry/, '必须提供重试入口');
    assert.match(body, /sw-settings__journal-retry/, '重试按钮类名');
});

test('bilingual failure copy exists', () => {
    assert.equal(zh.notebookLoadFailed, '笔记本加载失败');
    assert.equal(en.notebookLoadFailed, 'Failed to load notebooks');
});

test('detector self-check: catch-return-empty is caught (negative verification)', () => {
    const legacy = 'catch (e) {\n    logger.warn("load notebooks fail", e);\n    return [];\n}';
    assert.match(legacy, /return \[\];/, '历史 catch 返回空数组的形态必须可被识别');
    const detailed = readSourceFile('src/index.ts');
    const fnStart = detailed.indexOf('private async loadNotebooksDetailed');
    const body = detailed.slice(fnStart, detailed.indexOf('\n    }\n', fnStart) + 6);
    assert.doesNotMatch(body, /return \[\];/, '详细加载不得返回裸空数组（失败必须带标记）');
});
