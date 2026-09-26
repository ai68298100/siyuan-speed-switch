"use strict";

// T-6916（ADR 0083 D2）：接受前确定性审查器。与 snippet-ai-policy 分层——policy 是
// 生成前的提示词软约束（可能被忽略），lint 是接受前的确定性硬信号（人来裁决）。
// 只做逐行模式匹配，不做数据流分析；规则 id 是技术标识，交由 UI 呈现。
const LINT_RULES_VERSION = 1;
const LINT_FINDINGS_MAX = 200;

const CSS_LINE_RULES = [
    {rule: "no-import-external", severity: "warn", pattern: /@import\s+(?:url\s*\(\s*)?["']?(?:https?:)?\/\//i},
    {rule: "no-unscoped-star", severity: "warn", pattern: /^\s*\*\s*\{/},
    {rule: "prefer-theme-variable", severity: "info", pattern: /(?:[^-]|^)(?:color|background(?:-color)?)\s*:\s*(?:#[0-9a-f]{3,8}\b|rgba?\s*\()/i},
];

const JS_LINE_RULES = [
    {rule: "no-dynamic-exec", severity: "warn", pattern: /\beval\s*\(|\bnew\s+Function\s*\(/},
    {rule: "no-network", severity: "warn", pattern: /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\s*\(/},
    {rule: "no-credential-literals", severity: "warn", pattern: /\b(?:api[_-]?key|apikey|secret|token|password)\b\s*[:=]\s*["'][^"']+["']/i},
    {rule: "no-global-write", severity: "info", pattern: /\bwindow\s*\.\s*[A-Za-z_$][\w$]*\s*=[^=]/},
];

function pushFinding(findings, rule, severity, line) {
    if (findings.length >= LINT_FINDINGS_MAX) return;
    findings.push({rule, severity, line});
}

// 同一规则块内重复声明（stylelint no-duplicate-properties 语义的行级启发式）：
// 以 "prop: …;" 结尾的行视为声明，块结束（行尾 }）即清空。注释与选择器不匹配。
function lintDuplicateProperties(content, findings) {
    const seen = new Map();
    const lines = content.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
        const declaration = lines[i].match(/^\s*([a-zA-Z-]+)\s*:\s*[^;{}]+;/);
        if (declaration) {
            const property = declaration[1].toLowerCase();
            if (seen.has(property)) pushFinding(findings, "no-duplicate-properties", "info", i + 1);
            else seen.set(property, i + 1);
        }
        if (/\}\s*$/.test(lines[i])) seen.clear();
    }
}

function lintSnippet(type, content) {
    const text = String(content || "");
    const lines = text.split(/\r\n|\r|\n/);
    const findings = [];
    const lineRules = type === "js" ? JS_LINE_RULES : CSS_LINE_RULES;
    for (let i = 0; i < lines.length; i++) {
        for (const rule of lineRules) {
            if (rule.pattern.test(lines[i])) pushFinding(findings, rule.rule, rule.severity, i + 1);
        }
    }
    if (type !== "js") lintDuplicateProperties(text, findings);
    findings.sort((a, b) => a.line - b.line);
    return {rulesVersion: LINT_RULES_VERSION, findings};
}

module.exports = {lintSnippet, LINT_RULES_VERSION, LINT_FINDINGS_MAX};
