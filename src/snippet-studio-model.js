"use strict";

// Experimental snippet studio: pure data operations. Native snippets remain
// authoritative; previews and AI drafts must not enter the native list implicitly.
const SNIPPET_CODE_MAX = 65536;
const NEW_SNIPPET_ID = /^\d{14}-[a-z0-9]{7}$/;
const encoder = new TextEncoder();

function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/** Clone JSON values without dropping unknown host fields or invoking setters. */
function cloneJson(value, ancestors = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if ((!isRecord(value) && !Array.isArray(value)) || ancestors.has(value)) fail("snippet-invalid-data");
    ancestors.add(value);
    const clone = Array.isArray(value)
        ? value.map((item) => cloneJson(item, ancestors))
        : Object.fromEntries(Object.keys(value).map((key) => [key, cloneJson(value[key], ancestors)]));
    ancestors.delete(value);
    return clone;
}

function assertNativeSnippet(snippet) {
    if (!isRecord(snippet)
        || typeof snippet.id !== "string" || snippet.id.length === 0 || /[\u0000-\u001f\u007f]/.test(snippet.id)
        || typeof snippet.name !== "string" || typeof snippet.content !== "string"
        || (snippet.type !== "css" && snippet.type !== "js") || typeof snippet.enabled !== "boolean"
        || (Object.hasOwn(snippet, "disabledInPublish") && typeof snippet.disabledInPublish !== "boolean")) {
        fail("snippet-invalid-data");
    }
}

// The kernel's setSnippet contract is intentionally narrower than the object
// we keep in memory. Unknown fields may be returned by a future host build and
// are useful for conflict detection, but must never be sent back to an
// additionalProperties:false endpoint.
function projectSnippetForWire(snippet) {
    assertNativeSnippet(snippet);
    return {
        id: snippet.id,
        name: snippet.name,
        type: snippet.type,
        content: snippet.content,
        enabled: snippet.enabled,
        // Snippet responses require this field; older native rows may omit it.
        // The input contract permits omission, and false preserves that legacy
        // row's effective publish behavior.
        disabledInPublish: typeof snippet.disabledInPublish === "boolean" ? snippet.disabledInPublish : false,
    };
}

function projectSnippetListForWire(snippets) {
    if (!Array.isArray(snippets)) fail("snippet-invalid-data");
    return snippets.map(projectSnippetForWire);
}

function cloneNativeList(list) {
    if (!Array.isArray(list)) fail("snippet-invalid-data");
    const seen = new Set();
    for (const snippet of list) {
        assertNativeSnippet(snippet);
        if (seen.has(snippet.id)) fail("snippet-duplicate-id");
        seen.add(snippet.id);
    }
    return cloneJson(list);
}

/** Malformed/error responses must never be treated as an empty native store. */
function readNativeSnippetResponse(response) {
    if (!isRecord(response) || response.code !== 0 || !isRecord(response.data)) {
        fail("snippet-read-failed");
    }
    return cloneNativeList(response.data.snippets);
}

function assertDraftCode(content) {
    if (typeof content !== "string" || content.trim().length === 0 || content.includes("\u0000")) {
        fail("snippet-invalid-code");
    }
    if (encoder.encode(content).byteLength > SNIPPET_CODE_MAX) fail("snippet-code-too-large");
}

/** Import plain code as an inert draft. No imported file can enable itself. */
function parseSnippetImport(filename, text) {
    if (typeof filename !== "string" || typeof text !== "string") fail("snippet-import-invalid");
    const basename = filename.split(/[\\/]/).pop();
    const extension = basename.match(/\.(css|js)$/i);
    if (!extension) fail("snippet-import-type");
    const name = basename.slice(0, -extension[0].length).trim();
    if (!name || /[\u0000-\u001f\u007f]/.test(name)) fail("snippet-import-name");
    // T-6912/T-6923：普通样式去头防往返累积；含 @var/@advanced 变量的样式保留
    // 头部并按默认值代入占位符（变量数随导入回执披露）。
    let content;
    let varsResolved = 0;
    const headerMatch = text.match(/^\uFEFF?(\/\* ==UserStyle==[\s\S]*?==\/UserStyle== \*\/)/);
    if (headerMatch && /@(?:var|advanced)\b/i.test(headerMatch[1])) {
        const resolved = resolveUsercssVariables(text);
        content = resolved.text;
        varsResolved = resolved.resolved;
    } else {
        content = stripUsercssHeader(text);
    }
    assertDraftCode(content);
    return {name, type: extension[1].toLowerCase(), content, enabled: false, ...(varsResolved > 0 ? {varsResolved} : {})};
}

const USERCSS_HEADER_RE = /\/\* ==UserStyle==[\s\S]*?==\/UserStyle== \*\//;

/**
 * T-6912（R8-A4）：usercss 生态互通头。只有展示用元数据（名称/命名空间/版本），
 * 不替用户声明许可证或作者；仅 CSS 导出加头，导入侧无条件去头防累积。
 */
function buildUsercssHeader(name) {
    const safe = String(name || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 120) || "snippet";
    return `/* ==UserStyle==\n@name ${safe}\n@namespace siyuan-speed-switch\n@version 1.0.0\n==/UserStyle== */`;
}

function stripUsercssHeader(content) {
    return String(content || "").replace(USERCSS_HEADER_RE, "").replace(/^\uFEFF/, "").replace(/^\s+/, "");
}

function hasUsercssHeader(content) {
    return USERCSS_HEADER_RE.test(String(content || ""));
}

/**
 * T-6923（R10 吸收）：usercss 变量默认值代入。@var/@advanced 定义的变量在正文
 * 中以 CSS 注释包裹的 [[名称]] 占位符出现；导入含变量的样式时保留头部并按
 * 默认值代入（从 userstyles.world 下载即可直接预览与启用）。只解析 color/
 * text/number/select/checkbox 五种基础类型；dropdown/image 等高级 UI 不猜，
 * 占位符原样保留。
 */
function resolveUsercssVariables(text) {
    const source = String(text || "");
    const headerMatch = source.match(USERCSS_HEADER_RE);
    if (!headerMatch) return {text: source, resolved: 0};
    const defaults = new Map();
    for (const line of headerMatch[0].split(/\r\n|\r|\n/)) {
        const varMatch = line.match(/^[ \t]*@(?:var|advanced)\s+[a-z]+\s+([\w-]+)\s+(.+?)\s*$/i);
        if (!varMatch) continue;
        const name = varMatch[1];
        const rest = varMatch[2];
        let value = null;
        const doubleQuoted = rest.match(/^"((?:[^"\\]|\\.)*)"/);
        const singleQuoted = doubleQuoted ? null : rest.match(/^'((?:[^'\\]|\\.)*)'/);
        if (doubleQuoted) value = doubleQuoted[1];
        else if (singleQuoted) value = singleQuoted[1];
        else {
            const bare = rest.match(/^[^\s",]+/);
            if (bare) value = bare[0].split(",")[0].trim();
        }
        if (value !== null && value !== "" && !defaults.has(name)) defaults.set(name, value);
    }
    if (!defaults.size) return {text: source, resolved: 0};
    let resolved = 0;
    let output = source;
    for (const [name, value] of defaults) {
        const placeholder = new RegExp("/\\*\\[\\[" + name + "\\]\\]\\*/", "g");
        if (placeholder.test(output)) {
            resolved++;
            output = output.replace(placeholder, () => value);
        }
    }
    return {text: output, resolved};
}

/** Object-key order is not an external edit; unknown-field changes are. */
function sameJson(left, right) {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length
        && leftKeys.every((key, index) => key === rightKeys[index] && sameJson(left[key], right[key]));
}

/**
 * Read/merge/write planning only, not a cross-plugin atomic transaction. The caller
 * serializes its own writes, reads latest immediately beforehand, waits for native
 * save success, then applies the result. No unrelated row is removed or rewritten.
 * baseline is the selected row captured when editing began, or null for creation.
 */
function buildSnippetMutation(latest, baseline, action, draft) {
    const result = cloneNativeList(latest);
    if (!["save", "toggle", "delete"].includes(action)) fail("snippet-invalid-action");
    let targetIndex = -1;
    if (baseline !== null) {
        assertNativeSnippet(baseline);
        cloneJson(baseline);
        targetIndex = result.findIndex((snippet) => snippet.id === baseline.id);
        if (targetIndex < 0 || !sameJson(result[targetIndex], baseline)) fail("snippet-conflict");
    } else if (action !== "save") {
        fail("snippet-missing-baseline");
    }

    if (action === "delete") {
        result.splice(targetIndex, 1);
        return result;
    }
    if (!isRecord(draft)) fail("snippet-invalid-draft");
    if (action === "toggle") {
        if (typeof draft.enabled !== "boolean") fail("snippet-invalid-draft");
        if (Object.hasOwn(draft, "id") && draft.id !== baseline.id) fail("snippet-id-mismatch");
        result[targetIndex].enabled = draft.enabled;
        return result;
    }

    assertNativeSnippet(draft);
    assertDraftCode(draft.content);
    if (targetIndex < 0) {
        if (!NEW_SNIPPET_ID.test(draft.id)) fail("snippet-invalid-new-id");
        if (result.some((snippet) => snippet.id === draft.id)) fail("snippet-conflict");
        const created = {
            id: draft.id, name: draft.name, type: draft.type,
            content: draft.content, enabled: draft.enabled,
            ...(Object.hasOwn(draft, "disabledInPublish") ? {disabledInPublish: draft.disabledInPublish} : {}),
        };
        // Retain native CSS-before-JS grouping without sorting the existing list.
        const firstJs = result.findIndex((snippet) => snippet.type === "js");
        result.splice(draft.type === "css" ? 0 : firstJs < 0 ? result.length : firstJs, 0, created);
        return result;
    }
    if (draft.id !== baseline.id) fail("snippet-id-mismatch");
    result[targetIndex] = {
        ...result[targetIndex], name: draft.name, type: draft.type,
        content: draft.content, enabled: draft.enabled,
        ...(Object.hasOwn(draft, "disabledInPublish") ? {disabledInPublish: draft.disabledInPublish} : {}),
    };
    return result;
}

// Original examples for the studio. These target SiYuan editor markup and can
// also be demonstrated with an explicit sample document in an isolated preview.
const BUILTIN_SNIPPETS = Object.freeze([
    {
        id: "swss-builtin-typography", nameKey: "snippetBuiltinTypographyName", descriptionKey: "snippetBuiltinTypographyDescription",
        category: "typography", type: "css", source: "builtin",
        content: ".protyle-wysiwyg [data-type=\"NodeParagraph\"] { line-height: 1.8; }\n.protyle-wysiwyg [data-type=\"NodeHeading\"] { margin-block: 1.2em 0.5em; letter-spacing: 0.02em; }",
    },
    {
        id: "swss-builtin-table", nameKey: "snippetBuiltinTableName", descriptionKey: "snippetBuiltinTableDescription",
        category: "table", type: "css", source: "builtin",
        content: ".protyle-wysiwyg table { border-collapse: collapse; }\n.protyle-wysiwyg th, .protyle-wysiwyg td { padding: 0.65em 0.9em; }\n.protyle-wysiwyg tbody tr:nth-child(even) { background: var(--b3-theme-background-light, #f4f5f7); }",
    },
    {
        id: "swss-builtin-focus", nameKey: "snippetBuiltinFocusName", descriptionKey: "snippetBuiltinFocusDescription",
        category: "focus", type: "css", source: "builtin",
        content: ".protyle-wysiwyg [data-type=\"NodeParagraph\"] { border-inline-start: 3px solid transparent; padding-inline-start: 0.7em; }\n.protyle-wysiwyg [data-type=\"NodeParagraph\"]:focus-within { border-inline-start-color: var(--b3-theme-primary, #4c78a8); background: var(--b3-theme-background-light, #f4f5f7); }",
    },
    {
        id: "swss-builtin-code", nameKey: "snippetBuiltinCodeName", descriptionKey: "snippetBuiltinCodeDescription",
        category: "code", type: "css", source: "builtin",
        content: ".protyle-wysiwyg [data-type=\"NodeCodeBlock\"] { border: 1px solid var(--b3-border-color, #d7dbe0); border-radius: 8px; padding: 0.8em; }\n.protyle-wysiwyg [data-type=\"NodeCodeBlock\"] .hljs { line-height: 1.65; tab-size: 4; }",
    },
    {
        id: "swss-builtin-font", nameKey: "snippetBuiltinFontName", descriptionKey: "snippetBuiltinFontDescription",
        category: "font", type: "css", source: "builtin",
        content: ".protyle-wysiwyg [data-type=\"NodeParagraph\"], .protyle-wysiwyg [data-type=\"NodeHeading\"] { font-family: Georgia, \"Noto Serif CJK SC\", \"Songti SC\", serif; }\n.protyle-wysiwyg [data-type=\"NodeCodeBlock\"] { font-family: ui-monospace, Consolas, monospace; }",
    },
].map((entry) => Object.freeze(entry)));

/** Caller may attach localized name/description and its own native entries. */
function filterSnippetCatalog(catalog, filters = {}) {
    if (!Array.isArray(catalog)) return [];
    const options = isRecord(filters) ? filters : {};
    const query = typeof options.query === "string" ? options.query.trim().toLocaleLowerCase() : "";
    const found = catalog.filter((entry) => {
        if (!isRecord(entry)) return false;
        for (const key of ["type", "category", "source"]) {
            if (options[key] && options[key] !== "all" && entry[key] !== options[key]) return false;
        }
        if (!query) return true;
        return [entry.id, entry.name, entry.description, entry.nameKey, entry.descriptionKey, entry.category, entry.content]
            .filter((value) => typeof value === "string").join("\n").toLocaleLowerCase().includes(query);
    });
    // T-6913（R8-A6 变体）：宿主 getSnippet 契约没有更新时间字段（仅
    // id/name/type/content/enabled/disabledInPublish），无法按更新时间排序。
    // 以"自有片段优先于内建示例"防内建样本霸榜；组内保持宿主返回序（≈创建序）。
    return found.sort((a, b) => (a?.source === "native" ? 0 : 1) - (b?.source === "native" ? 0 : 1));
}

// T-6956：脏稿三选一的待执行意图协调器。宿主 canClose 保持同步阻止（返回 false
// 并打开三选一），保存/放弃得到明确结果后再执行待执行意图——绝不把 Promise 当
// 布尔用。语义：干净直接放行；保存成功才导航一次（失败/冲突/异常停在草稿）；
// 放弃零写入直接放行；取消清空意图；saving 期间拒绝重复提交（连续点击不重复
// 写入、不执行两个导航）。
function createLeaveIntentCoordinator() {
    let pending = null;
    let saving = false;
    return {
        requestLeave(dirty, busy, run) {
            if (busy || saving) return {action: "reject"};
            if (!dirty) {
                if (typeof run === "function") run();
                return {action: "run"};
            }
            pending = {run};
            return {action: "confirm"};
        },
        async confirmSave(save) {
            if (!pending || saving) return {saved: false, navigated: false};
            saving = true;
            try {
                const ok = await save();
                saving = false;
                if (ok !== true) {
                    pending = null;
                    return {saved: false, navigated: false};
                }
                const run = pending ? pending.run : null;
                pending = null;
                if (typeof run === "function") run();
                return {saved: true, navigated: true};
            } catch (_) {
                saving = false;
                pending = null;
                return {saved: false, navigated: false};
            }
        },
        confirmDiscard() {
            const run = pending ? pending.run : null;
            pending = null;
            saving = false;
            if (typeof run === "function") {
                run();
                return {navigated: true};
            }
            return {navigated: false};
        },
        cancel() {
            pending = null;
            saving = false;
            return {pending: false};
        },
        hasPending: () => Boolean(pending),
        isSaving: () => saving,
    };
}

// T-6957：统一草稿历史（名称/类型/正文事务）——快照策略：SNIPPET_CODE_MAX=64 KiB
// 时 50 步全量快照最坏 ~3.2 MB，故设 512 KiB 总字节预算，超限从最旧端丢弃（至少
// 保留当前态）；不新建持久化片段副本，历史只存活于编辑会话。
const DRAFT_HISTORY_MAX_STEPS = 50;
const DRAFT_HISTORY_MAX_BYTES = 512 * 1024;

function estimateDraftStateBytes(state) {
    if (!state || typeof state !== "object") return 8;
    return (String(state.name || "").length) + (String(state.content || "").length) + 8;
}

function createDraftHistory(state, options) {
    const opts = options || {};
    const entry = {state: {...(state || {name: "", type: "css", content: ""})}, bytes: estimateDraftStateBytes(state)};
    return {stack: [entry], index: 0, max: opts.max || DRAFT_HISTORY_MAX_STEPS, maxBytes: opts.maxBytes || DRAFT_HISTORY_MAX_BYTES};
}

function pushDraftHistory(history, state) {
    const top = history.stack[history.index];
    if (top && JSON.stringify(top.state) === JSON.stringify(state)) return history;
    const stack = history.stack.slice(0, history.index + 1);
    stack.push({state: {...state}, bytes: estimateDraftStateBytes(state)});
    let index = stack.length - 1;
    while (stack.length > 1 && (stack.length > history.max || totalDraftBytes(stack) > history.maxBytes)) {
        stack.shift();
        index = Math.min(index, stack.length - 1);
    }
    return {stack, index, max: history.max, maxBytes: history.maxBytes};
}

function totalDraftBytes(stack) {
    return stack.reduce((sum, entry) => sum + entry.bytes, 0);
}

function canUndoDraftHistory(history) {
    return history.index > 0;
}

function canRedoDraftHistory(history) {
    return history.index < history.stack.length - 1;
}

function undoDraftHistory(history) {
    if (!canUndoDraftHistory(history)) return {history, state: null};
    const index = history.index - 1;
    return {history: {...history, index}, state: {...history.stack[index].state}};
}

function redoDraftHistory(history) {
    if (!canRedoDraftHistory(history)) return {history, state: null};
    const index = history.index + 1;
    return {history: {...history, index}, state: {...history.stack[index].state}};
}

module.exports = {
    SNIPPET_CODE_MAX, parseSnippetImport, readNativeSnippetResponse,
    buildSnippetMutation, projectSnippetForWire, projectSnippetListForWire,
    BUILTIN_SNIPPETS, filterSnippetCatalog, buildUsercssHeader, stripUsercssHeader,
    hasUsercssHeader, resolveUsercssVariables,
    USERCSS_HEADER_RE,
    createLeaveIntentCoordinator,
    DRAFT_HISTORY_MAX_STEPS,
    DRAFT_HISTORY_MAX_BYTES,
    createDraftHistory,
    pushDraftHistory,
    undoDraftHistory,
    redoDraftHistory,
    canUndoDraftHistory,
    canRedoDraftHistory,
};
