// source-scan 辅助的自身测试：契约门禁靠它才不会被注释欺骗，
// 因此它的边界必须比任何使用方都更严——包括"不能吃掉真实代码"。
const test = require('node:test');
const assert = require('node:assert/strict');

const {stripComments} = require('./source-scan.cjs');

test('stripComments removes whole-line, trailing and block comments', () => {
    assert.equal(stripComments('const a = 1; // const b = 2;').includes('const b = 2'), false,
        'trailing comments must be removed — otherwise a commented-out call still satisfies the gate');
    assert.equal(stripComments('// const a = 1;').trim(), '', 'whole-line comments must be removed');
    assert.equal(stripComments('/* const a = 1; */ const b = 2;').trim(), 'const b = 2;',
        'block comments must be removed');
    assert.equal(stripComments('/**\n * const a = 1;\n */ const b = 2;').trim(), 'const b = 2;',
        'JSDoc blocks must be removed');
    assert.equal(stripComments('// a\nconst b = 1;\n// c').includes('const b = 1;'), true,
        'code between comments must survive');
});

test('stripComments preserves comment-looking text inside string literals', () => {
    for (const literal of [
        "const u = 'https://example.com/x';",
        'const u = "https://example.com/x";',
        'const s = "/** not a comment */";',
        'const s = "// not a comment";',
        'const s = `https://example.com/${id}`;',
    ]) {
        assert.equal(stripComments(literal), literal, `string content must survive: ${literal}`);
    }
});

test('stripComments respects escaped quotes so strings cannot leak their contents', () => {
    assert.equal(stripComments('const s = "a\\"//b";'), 'const s = "a\\"//b";', 'escaped quotes must not end a string');
    assert.equal(stripComments("const s = 'a\\'//b';"), "const s = 'a\\'//b';");
});

test('stripComments never grows the text and keeps code the test would look for', () => {
    const code = 'function f() { return 1; } // note\nconst g = 2; /* x */';
    const stripped = stripComments(code);
    assert.ok(stripped.length < code.length, 'stripping must actually shorten the text');
    assert.ok(stripped.includes('function f() { return 1; }'), 'code must survive');
    assert.ok(stripped.includes('const g = 2;'), 'code before a block comment must survive');
    assert.equal(stripComments('const a = 1;').length, 'const a = 1;'.length, 'comment-free input is returned as-is');
});

test('stripComments is a fixpoint: stripping twice changes nothing further', () => {
    const source = 'const a = 1; // x\n/* y */ const b = "https://z";\n';
    const once = stripComments(source);
    assert.equal(stripComments(once), once, 'a second pass must be a no-op, or callers could double-strip code');
});
