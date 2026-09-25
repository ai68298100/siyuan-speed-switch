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
    const content = text.replace(/^\uFEFF/, "");
    assertDraftCode(content);
    return {name, type: extension[1].toLowerCase(), content, enabled: false};
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
    return catalog.filter((entry) => {
        if (!isRecord(entry)) return false;
        for (const key of ["type", "category", "source"]) {
            if (options[key] && options[key] !== "all" && entry[key] !== options[key]) return false;
        }
        if (!query) return true;
        return [entry.id, entry.name, entry.description, entry.nameKey, entry.descriptionKey, entry.category, entry.content]
            .filter((value) => typeof value === "string").join("\n").toLocaleLowerCase().includes(query);
    });
}

module.exports = {
    SNIPPET_CODE_MAX, parseSnippetImport, readNativeSnippetResponse,
    buildSnippetMutation, projectSnippetForWire, projectSnippetListForWire,
    BUILTIN_SNIPPETS, filterSnippetCatalog,
};
