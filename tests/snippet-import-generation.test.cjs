// T-7046：片段导入代际保护契约——file.text() 返回后必须核对导入代际与草稿现场，
// 迟到文件不得覆盖读取期间变化过的草稿（编辑/切换片段/另一轮导入）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const uiSource = readSourceFile('src/snippet-studio-ui.js');

test('import generation: importFile starts a generation and captures the draft revision', () => {
    assert.match(uiSource, /const generation = \+\+importGeneration;\s*\n\s*const startedRevision = revision;/,
        '导入开始必须前移代际并捕获当前草稿版本');
    assert.match(uiSource, /let importGeneration = 0;/, '导入代际计数器必须存在');
});

test('import generation: late files are dropped after the read resolves', () => {
    assert.match(uiSource, /if \(disposed \|\| generation !== importGeneration \|\| revision !== startedRevision\) return;/,
        '迟到文件必须核对 disposed、代际与草稿版本，任一变化诚实丢弃');
    assert.match(uiSource, /const imported = parseSnippetImport\(file\.name, text\);\s*\n\s*choose\(imported, null\);/,
        '只有通过代际核对才解析并进入草稿');
});

test('import generation: parse no longer happens before the disposed check', () => {
    // 旧写法：parseSnippetImport(file.name, await file.text()) 之后仅检查 disposed——
    // 契约钉住该形态不得回归。
    assert.doesNotMatch(uiSource, /parseSnippetImport\(file\.name, await file\.text\(\)\)/,
        '不得在 await 后未经代际核对直接解析导入');
});
