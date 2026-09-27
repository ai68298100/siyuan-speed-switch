// T-6959：草稿内查找与替换纯模型——字面匹配（无正则）、大小写不敏感、
// 左起不重叠、命中封顶 1000、替换计数与内容一致。
const test = require('node:test');
const assert = require('node:assert/strict');
const {DRAFT_FIND_MATCH_CAP, findDraftMatches, replaceDraftMatches} = require('../src/snippet-studio-model.js');

test('find matches CJK and latin case-insensitively with exact ranges', () => {
    const content = '第一段 工作台\n第二段 工作上下文';
    const matches = findDraftMatches(content, '工作');
    assert.equal(matches.length, 2);
    assert.deepEqual(matches.map((m) => content.slice(m.start, m.end)), ['工作', '工作']);
    assert.equal(findDraftMatches('Word work WORK', 'work').length, 2, '大小写不敏感');
});

test('find treats regex metacharacters literally and respects the match cap', () => {
    const matches = findDraftMatches('a.c axc a.c', 'a.c');
    assert.equal(matches.length, 2, '点号按字面匹配');
    const many = 'hit '.repeat(2000);
    assert.equal(findDraftMatches(many, 'hit').length, DRAFT_FIND_MATCH_CAP, '命中封顶 1000');
    assert.deepEqual(findDraftMatches('abc', ''), []);
});

test('replace keeps text outside matches byte-identical, including CRLF and newlines', () => {
    const content = 'body {\r\n  color: red;\r\n}\r\n/* 工作台 */';
    const result = replaceDraftMatches(content, 'color', 'background');
    assert.equal(result.count, 1);
    assert.equal(result.content, 'body {\r\n  background: red;\r\n}\r\n/* 工作台 */', 'CRLF 内容原样保留');
    const multi = replaceDraftMatches('alpha\nbeta\nalpha', 'alpha', 'START');
    assert.equal(multi.content, 'START\nbeta\nSTART');
    assert.equal(multi.count, 2);
});

test('replace is literal, counts honestly, and rejects empty queries', () => {
    const result = replaceDraftMatches('a.c axc', 'a.c', 'X.Y');
    assert.equal(result.content, 'X.Y axc');
    assert.equal(result.count, 1);
    assert.deepEqual(replaceDraftMatches('abc', '', 'x'), {content: 'abc', count: 0}, '空查询零替换');
    assert.deepEqual(replaceDraftMatches(null, 'a', 'b'), {content: '', count: 0}, '非字符串输入按空串处理');
});

test('overlapping hits resolve leftmost-first without double replacement', () => {
    const result = replaceDraftMatches('aaa', 'aa', 'B');
    assert.equal(result.content, 'Ba');
    assert.equal(result.count, 1, '重叠命中按左起不重叠结算');
});
