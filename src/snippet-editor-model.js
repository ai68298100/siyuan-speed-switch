"use strict";

const EDITOR_LINE_NUMBER_MAX = 4096;
const EDITOR_BRACKET_SCAN_MAX_CHARS = 64 * 1024;
const OPEN = {"(": ")", "[": "]", "{": "}"};
const CLOSE = {")": "(", "]": "[", "}": "{",
};

function text(value) { return typeof value === "string" ? value : ""; }

function buildEditorLineNumbers(content, maxLines = EDITOR_LINE_NUMBER_MAX) {
    const lines = text(content).split(/\r\n|\r|\n/);
    const limit = Number.isInteger(maxLines) ? Math.max(1, Math.min(EDITOR_LINE_NUMBER_MAX, maxLines)) : EDITOR_LINE_NUMBER_MAX;
    const visibleLineCount = Math.min(lines.length, limit);
    const numbers = Array.from({length: visibleLineCount}, (_, index) => String(index + 1));
    if (lines.length > limit) numbers.push("…");
    return {text: numbers.join("\n"), lineCount: lines.length, visibleLineCount, truncated: lines.length > limit};
}

function location(source, index) {
    const lines = source.slice(0, index).split(/\r\n|\r|\n/);
    return {line: lines.length, column: lines[lines.length - 1].length + 1};
}

function scan(content) {
    const source = text(content);
    const length = Math.min(source.length, EDITOR_BRACKET_SCAN_MAX_CHARS);
    const scanSource = source.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, (value) => value.replace(/[^\r\n]/g, " "));
    const stack = [];
    const issues = [];
    const issue = (kind, char, index) => {
        if (issues.length < 20) issues.push({kind, char, index, ...location(source, index)});
    };
    for (let index = 0; index < length; index += 1) {
        const char = scanSource[index];
        if (OPEN[char]) { stack.push([char, index]); continue; }
        if (!CLOSE[char]) continue;
        const top = stack[stack.length - 1];
        if (!top || top[0] !== CLOSE[char]) { issue("unexpected-close", char, index); continue; }
        stack.pop();
    }
    stack.forEach(([char, index]) => issue("unclosed-open", char, index));
    return {issues, truncated: source.length > length};
}

function analyzeEditorBrackets(content) {
    const result = scan(content);
    return {balanced: result.issues.length === 0 && !result.truncated, issues: result.issues, truncated: result.truncated};
}

module.exports = {EDITOR_LINE_NUMBER_MAX, EDITOR_BRACKET_SCAN_MAX_CHARS, buildEditorLineNumbers, analyzeEditorBrackets};
