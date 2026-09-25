"use strict";

// 宿主 3.8.5 的编辑 AI 只返回内容，不启动 Agent 工具会话或自动应用片段。
const SNIPPET_AI_MAX_BYTES = 64 * 1024;
const SNIPPET_AI_TIMEOUT_MS = 90000;
const MAX_EVENT_BYTES = SNIPPET_AI_MAX_BYTES * 8;
const SNIPPET_AI_HISTORY_MAX_MESSAGES = 8;
const SNIPPET_AI_HISTORY_MAX_BYTES = SNIPPET_AI_MAX_BYTES;
const SNIPPET_AI_MODES = Object.freeze(["generate", "optimize", "explain", "iterate"]);
const ERROR_CODES = new Set(["unsupported", "ai_unavailable", "timeout", "cancelled", "invalid_output", "request_failed"]);

function newTaskID() {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    return `swss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function aiError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function bytes(value) {
    return new TextEncoder().encode(value).byteLength;
}

function normalizeSnippetAIHistory(history) {
    if (history == null) return [];
    if (!Array.isArray(history) || history.length > SNIPPET_AI_HISTORY_MAX_MESSAGES) throw aiError("invalid_output");
    let totalBytes = 2;
    const normalized = history.map((message) => {
        if (!message || typeof message !== "object" || Array.isArray(message)
            || !["user", "assistant"].includes(message.role)
            || typeof message.content !== "string" || !message.content.trim()) {
            throw aiError("invalid_output");
        }
        const item = {role: message.role, content: message.content};
        totalBytes += bytes(JSON.stringify(item));
        if (bytes(item.content) > SNIPPET_AI_MAX_BYTES || totalBytes > SNIPPET_AI_HISTORY_MAX_BYTES) {
            throw aiError("invalid_output");
        }
        return item;
    });
    return normalized;
}

function snippetAIAction(type, mode) {
    const language = type === "css" ? "CSS" : "JavaScript";
    if (mode === "explain") {
        return "Explain the selected " + language + " snippet for a user reviewing it. "
            + "Return concise plain text only: describe its purpose, important behavior, risks, and likely side effects. "
            + "Do not return a code block, HTML wrapper, alternative implementation, or a claim that it was tested.";
    }
    if (mode === "iterate") {
        return "Continue the iterative optimization of the selected " + language + " snippet using the prior conversation as review context. "
            + "Return exactly one complete " + language + " snippet as plain code, or one fenced code block. "
            + "No explanations, HTML wrappers, alternatives, or partial changes. Preserve existing behavior unless the request changes it. "
            + "Use SiYuan theme variables where applicable. The result is a draft for manual review, so do not claim it has been applied or tested.";
    }
    if (mode === "optimize") {
        return "Optimize the selected " + language + " snippet according to the request. "
            + "Return exactly one complete " + language + " snippet as plain code, or one fenced code block. "
            + "No explanations, HTML wrappers, alternatives, or partial changes. Preserve existing behavior unless the request changes it. "
            + "Use SiYuan theme variables where applicable. The result is a draft for manual review, so do not claim it has been applied or tested.";
    }
    return "Create a complete " + language + " code snippet according to the request. "
        + "Return exactly one complete " + language + " snippet as plain code, or one fenced code block. "
        + "No explanations, HTML wrappers, alternatives, or partial changes. Use SiYuan theme variables where applicable. "
        + "The result is a draft for manual review, so do not claim it has been applied or tested.";
}

function buildSnippetAIRequest({type, content = "", instruction, mode = "generate", taskID = newTaskID(), history = []} = {}) {
    if (type !== "css" && type !== "js") throw aiError("unsupported");
    if (typeof instruction !== "string" || !instruction.trim() || typeof content !== "string"
        || typeof taskID !== "string" || !taskID.trim()
        || !SNIPPET_AI_MODES.includes(mode) || (["optimize", "explain", "iterate"].includes(mode) && !content.trim())
        || bytes(content) > SNIPPET_AI_MAX_BYTES || bytes(instruction) > SNIPPET_AI_MAX_BYTES) {
        throw aiError("invalid_output");
    }
    const normalizedHistory = normalizeSnippetAIHistory(history);
    return {
        taskID: taskID.trim(),
        ids: [],
        history: normalizedHistory,
        input: JSON.stringify({mode, language: type, instruction: instruction.trim(), currentCode: content}),
        action: snippetAIAction(type, mode),
    };
}

function parseSnippetAIExplanation(output, type) {
    if (type !== "css" && type !== "js") throw aiError("unsupported");
    if (typeof output !== "string") throw aiError("invalid_output");
    const content = output.trim();
    if (!content || bytes(content) > SNIPPET_AI_MAX_BYTES || content.includes("```")) throw aiError("invalid_output");
    return {content, type, mode: "explain"};
}

function parseSnippetAIOutput(output, type, mode = "generate") {
    if (type !== "css" && type !== "js") throw aiError("unsupported");
    if (typeof mode === "object") mode = mode?.mode || "generate";
    if (mode === "explain") return parseSnippetAIExplanation(output, type);
    if (!["generate", "optimize", "iterate"].includes(mode)) throw aiError("invalid_output");
    if (typeof output !== "string") throw aiError("invalid_output");
    let content = output.trim();
    if (content.includes("```")) {
        const match = /^```([a-z]*)[\t ]*\r?\n([\s\S]*?)\r?\n```$/i.exec(content);
        const language = match?.[1]?.toLowerCase();
        if (!match || match[2].includes("```") || (language && language !== type
            && !(type === "js" && language === "javascript"))) throw aiError("invalid_output");
        content = match[2].trim();
    }
    if (!content || bytes(content) > SNIPPET_AI_MAX_BYTES) throw aiError("invalid_output");
    return {content, type};
}

function createSnippetAIClient({fetchImpl = globalThis.fetch} = {}) {
    let active = null;
    let generation = 0;
    let disposed = false;

    function stop(code = "cancelled") {
        const run = active;
        if (!run) return;
        active = null;
        run.failure = code;
        run.controller.abort();
        run.reject(aiError(code));
    }

    async function generate(options = {}) {
        if (disposed) throw aiError("cancelled");
        if (typeof fetchImpl !== "function" || typeof AbortController !== "function") throw aiError("unsupported");
        const body = buildSnippetAIRequest(options);
        if (options.signal?.aborted) throw aiError("cancelled");
        stop();
        const run = {id: ++generation, controller: new AbortController(), failure: "", reject: null};
        const interrupted = new Promise((_resolve, reject) => { run.reject = reject; });
        active = run;
        const abort = () => { if (active === run) stop(); };
        const timer = setTimeout(() => { if (active === run) stop("timeout"); }, SNIPPET_AI_TIMEOUT_MS);
        options.signal?.addEventListener("abort", abort, {once: true});
        const assertCurrent = () => {
            if (disposed || active !== run || run.id !== generation || run.controller.signal.aborted) {
                throw aiError(run.failure || "cancelled");
            }
        };
        let reader = null;
        const request = async () => {
            assertCurrent();
            const response = await fetchImpl("/api/ai/editor/chat", {
                method: "POST",
                credentials: "same-origin",
                headers: {"Content-Type": "application/json", "Accept": "text/event-stream"},
                body: JSON.stringify(body),
                signal: run.controller.signal,
            });
            assertCurrent();
            if (response.status === 404 || response.status === 405) throw aiError("unsupported");
            if (!response.ok) throw aiError("request_failed");
            if (!(response.headers.get("Content-Type") || "").toLowerCase().includes("text/event-stream")) {
                let payload;
                try { payload = await response.json(); } catch (_error) { throw aiError("request_failed"); }
                assertCurrent();
                throw aiError(payload && typeof payload.code === "number" && payload.code !== 0
                    ? "ai_unavailable" : "request_failed");
            }
            if (!response.body?.getReader) throw aiError("request_failed");
            reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8", {fatal: true});
            let buffer = "";
            let eventName = "";
            let data = [];
            let eventBytes = 0;
            let output = "";
            let done = false;
            const dispatch = () => {
                assertCurrent();
                if (!data.length) { eventName = ""; eventBytes = 0; return; }
                let value;
                try { value = JSON.parse(data.join("\n")); } catch (_error) { throw aiError("invalid_output"); }
                if (!value || typeof value !== "object" || Array.isArray(value)) throw aiError("invalid_output");
                if (eventName === "content") {
                    if (typeof value.token !== "string") throw aiError("invalid_output");
                    output += value.token;
                    // fence 元数据留少量余量；最终代码仍严格按 UTF-8 64 KiB 校验。
                    if (bytes(output) > SNIPPET_AI_MAX_BYTES + 64) throw aiError("invalid_output");
                    if (typeof options.onToken === "function") options.onToken(value.token);
                    assertCurrent();
                } else if (eventName === "truncated") {
                    throw aiError("invalid_output");
                } else if (eventName === "error") {
                    throw aiError("request_failed");
                } else if (eventName === "done") {
                    if (value.finishReason !== "stop") throw aiError("invalid_output");
                    done = true;
                }
                eventName = "";
                data = [];
                eventBytes = 0;
            };
            const line = (value) => {
                if (!value) { dispatch(); return; }
                if (value.startsWith(":")) return;
                eventBytes += bytes(value);
                if (eventBytes > MAX_EVENT_BYTES) throw aiError("invalid_output");
                const colon = value.indexOf(":");
                const field = colon < 0 ? value : value.slice(0, colon);
                let fieldValue = colon < 0 ? "" : value.slice(colon + 1);
                if (fieldValue.startsWith(" ")) fieldValue = fieldValue.slice(1);
                if (field === "event") eventName = fieldValue;
                if (field === "data") data.push(fieldValue);
            };
            const consume = (final = false) => {
                while (!done) {
                    const index = buffer.search(/[\r\n]/);
                    if (index < 0) break;
                    if (!final && buffer[index] === "\r" && index === buffer.length - 1) break;
                    const width = buffer[index] === "\r" && buffer[index + 1] === "\n" ? 2 : 1;
                    const nextLine = buffer.slice(0, index);
                    buffer = buffer.slice(index + width);
                    line(nextLine);
                }
                if (bytes(buffer) > MAX_EVENT_BYTES) throw aiError("invalid_output");
                if (final && !done) {
                    if (buffer) line(buffer);
                    dispatch();
                }
            };
            while (!done) {
                const chunk = await reader.read();
                assertCurrent();
                if (chunk.done) {
                    buffer += decoder.decode();
                    consume(true);
                    break;
                }
                buffer += decoder.decode(chunk.value, {stream: true});
                consume();
            }
            assertCurrent();
            if (!done) throw aiError("request_failed");
            return parseSnippetAIOutput(output, options.type, options.mode);
        };
        try {
            return await Promise.race([request(), interrupted]);
        } catch (error) {
            if (run.failure) throw aiError(run.failure);
            if (ERROR_CODES.has(error?.code)) throw error;
            throw aiError(error?.name === "AbortError" ? "cancelled" : "request_failed");
        } finally {
            clearTimeout(timer);
            options.signal?.removeEventListener("abort", abort);
            if (active === run) active = null;
            run.controller.abort();
            if (reader) {
                try { Promise.resolve(reader.cancel()).catch(() => {}); } catch (_error) { /* 流已关闭。 */ }
            }
        }
    }

    return {generate, cancel: () => stop(), dispose: () => { disposed = true; stop(); }};
}

module.exports = {
    SNIPPET_AI_MAX_BYTES, SNIPPET_AI_TIMEOUT_MS, SNIPPET_AI_HISTORY_MAX_MESSAGES,
    SNIPPET_AI_HISTORY_MAX_BYTES, SNIPPET_AI_MODES, buildSnippetAIRequest,
    normalizeSnippetAIHistory, parseSnippetAIExplanation, parseSnippetAIOutput, createSnippetAIClient,
};
