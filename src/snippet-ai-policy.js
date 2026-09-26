"use strict";

// Short, product-specific guidance for the native editor AI request. This is
// intentionally separate from a Codex SKILL.md: the SiYuan endpoint accepts a
// prompt action, not an agent skill or tool session.
const SNIPPET_AI_POLICY_VERSION = "2026-09-26.1";
const SNIPPET_AI_POLICIES = Object.freeze({
    css: "Policy: Treat this as a SiYuan CSS snippet draft. Prefer existing SiYuan and platform custom properties and scoped selectors. Avoid external @import rules, remote URLs, and broad global resets; if the user requests them, explain the scope and risk. Preserve keyboard focus, contrast, reduced-motion behavior, and narrow-layout fallbacks. Do not claim browser testing or application.",
    js: "Policy: Treat this as a SiYuan JavaScript snippet draft. Never add credentials or document IDs. Treat network requests, eval, Function, dynamic script injection, unbounded loops, and unbounded global listeners as explicit risks; if the user requests them, explain the risk instead of claiming safety. Do not execute or auto-enable the draft. Do not claim it was tested or applied.",
});

function getSnippetAIPolicy(type) {
    return SNIPPET_AI_POLICIES[type] || "";
}

module.exports = {SNIPPET_AI_POLICY_VERSION, SNIPPET_AI_POLICIES, getSnippetAIPolicy};
