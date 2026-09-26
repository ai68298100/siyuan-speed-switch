"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {lintSnippet, LINT_RULES_VERSION, LINT_FINDINGS_MAX} = require("../src/snippet-lint.js");

const rulesOf = (findings) => findings.map((f) => f.rule);

test("snippet lint: exposes a versioned rule set", () => {
    assert.equal(typeof LINT_RULES_VERSION, "number");
    assert.ok(LINT_RULES_VERSION >= 1);
    const result = lintSnippet("css", "p { color: red; }");
    assert.equal(result.rulesVersion, LINT_RULES_VERSION);
    assert.deepEqual(result.findings, []);
});

test("snippet lint: flags external @import but allows theme-relative imports", () => {
    const flagged = lintSnippet("css", '@import url("https://cdn.example.com/x.css");');
    assert.deepEqual(rulesOf(flagged.findings), ["no-import-external"]);
    assert.equal(flagged.findings[0].line, 1);
    const clean = lintSnippet("css", '@import "theme.css";');
    assert.deepEqual(clean.findings, []);
});

test("snippet lint: flags unscoped universal selectors only when unscoped", () => {
    assert.deepEqual(rulesOf(lintSnippet("css", "* { box-sizing: border-box; }").findings), ["no-unscoped-star"]);
    assert.deepEqual(lintSnippet("css", ".protyle-wysiwyg * { margin: 0; }").findings, []);
});

test("snippet lint: flags hardcoded colors as info, theme variables stay clean", () => {
    const flagged = lintSnippet("css", "p {\n  color: #ff0000;\n}");
    const finding = flagged.findings.find((f) => f.rule === "prefer-theme-variable");
    assert.equal(finding.line, 2);
    assert.equal(finding.severity, "info");
    assert.deepEqual(lintSnippet("css", "p {\n  color: var(--b3-theme-red);\n}").findings, []);
});

test("snippet lint: duplicate properties in one block are flagged, across blocks are fine", () => {
    const duplicate = lintSnippet("css", "p {\n  margin: 0;\n  margin: 4px;\n}");
    assert.deepEqual(rulesOf(duplicate.findings), ["no-duplicate-properties"]);
    assert.equal(duplicate.findings[0].line, 3);
    const separate = lintSnippet("css", "p {\n  margin: 0;\n}\ndiv {\n  margin: 4px;\n}");
    assert.deepEqual(separate.findings, []);
});

test("snippet lint: js rules catch dynamic execution, network and credential literals", () => {
    const bad = [
        "const run = eval(input);",
        "const f = new Function('return 1');",
        "fetch('/api/example').then(r => r.text());",
        "const apiKey = 'sk-123';",
    ].join("\n");
    const flagged = lintSnippet("js", bad);
    assert.deepEqual(rulesOf(flagged.findings), [
        "no-dynamic-exec", "no-dynamic-exec", "no-network", "no-credential-literals",
    ]);
    assert.equal(flagged.findings[0].line, 1);
    assert.equal(flagged.findings[3].line, 4);
});

test("snippet lint: js rules tolerate comparison and plain window reads", () => {
    assert.deepEqual(lintSnippet("js", "if (window.x == y) { keep(); }\nconst v = window.innerWidth;").findings, []);
});

test("snippet lint: findings are line-sorted and bounded", () => {
    const body = Array.from({length: LINT_FINDINGS_MAX + 10}, () => "fetch('/x');").join("\n");
    const flagged = lintSnippet("js", body);
    assert.equal(flagged.findings.length, LINT_FINDINGS_MAX);
    const lines = flagged.findings.map((f) => f.line);
    assert.deepEqual(lines, [...lines].sort((a, b) => a - b));
});

test("snippet lint: css rules do not fire on js content and vice versa", () => {
    assert.deepEqual(lintSnippet("js", "* { color: #fff; }").findings, []);
    assert.deepEqual(lintSnippet("css", "fetch('/x');").findings, []);
});
