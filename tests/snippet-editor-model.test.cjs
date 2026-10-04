const test = require("node:test");
const assert = require("node:assert/strict");
const {
    EDITOR_LINE_NUMBER_MAX,
    EDITOR_BRACKET_SCAN_MAX_CHARS,
    buildEditorLineNumbers,
    analyzeEditorBrackets,
} = require("../src/snippet-editor-model.js");

test("editor line numbers handle empty, mixed newline, and capped content", () => {
    assert.deepEqual(buildEditorLineNumbers(""), {
        text: "1", lineCount: 1, visibleLineCount: 1, truncated: false,
    });
    assert.deepEqual(buildEditorLineNumbers("a\r\nb\nc\n", 3), {
        text: "1\n2\n3\n…", lineCount: 4, visibleLineCount: 3, truncated: true,
    });
    const capped = buildEditorLineNumbers("x\n".repeat(EDITOR_LINE_NUMBER_MAX + 20));
    assert.equal(capped.visibleLineCount, EDITOR_LINE_NUMBER_MAX);
    assert.equal(capped.truncated, true);
    assert.equal(capped.text.endsWith("\n…"), true);
});

test("editor bracket matching ignores strings and comments", () => {
    const content = "const text = '{'; /* [ignored] */\nfunction run() { return [text]; }";
    const result = analyzeEditorBrackets(content);
    assert.equal(result.balanced, true);
    assert.equal(result.issues.length, 0);
});

test("editor bracket diagnostics report unexpected and unclosed pairs", () => {
    const result = analyzeEditorBrackets(".a { color: red; ]\n  (value");
    assert.equal(result.balanced, false);
    assert.deepEqual(result.issues.map(({kind, char, line}) => ({kind, char, line})), [
        {kind: "unexpected-close", char: "]", line: 1},
        {kind: "unclosed-open", char: "{", line: 1},
        {kind: "unclosed-open", char: "(", line: 2},
    ]);
});

test("editor bracket scan exposes an explicit large-content boundary", () => {
    const content = "(" + "x".repeat(EDITOR_BRACKET_SCAN_MAX_CHARS) + ")";
    const result = analyzeEditorBrackets(content);
    assert.equal(result.truncated, true);
    assert.equal(result.balanced, false);
});
