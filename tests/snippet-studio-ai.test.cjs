const test = require("node:test");
const assert = require("node:assert/strict");
const {
    SNIPPET_AI_MAX_BYTES, SNIPPET_AI_TIMEOUT_MS,
    SNIPPET_AI_HISTORY_MAX_MESSAGES, SNIPPET_AI_HISTORY_MAX_BYTES,
    buildSnippetAIRequest, parseSnippetAIOutput, createSnippetAIClient,
} = require("../src/snippet-studio-ai.js");

const options = {type: "css", instruction: "Increase line spacing"};
const encoder = new TextEncoder();
const event = (name, data) => `event: ${name}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`;
const complete = (content = ".test { color: red; }") => event("start", {taskID: ""})
    + event("content", {token: content}) + event("done", {finishReason: "stop"});
function response(text, split = 0) {
    const encoded = encoder.encode(text);
    return new Response(new ReadableStream({start(controller) {
        if (split) {
            for (let at = 0; at < encoded.length; at += split) controller.enqueue(encoded.slice(at, at + split));
        } else controller.enqueue(encoded);
        controller.close();
    }}), {headers: {"Content-Type": "text/event-stream"}});
}
const code = (expected) => (error) => error.code === expected && error.message === expected;

test("snippet AI request supplies only selected source and no document IDs, history, model or credentials", () => {
    const request = buildSnippetAIRequest({...options, content: ".old {}", mode: "optimize", ids: ["secret-document"], apiKey: "secret"});
    assert.deepEqual(Object.keys(request).sort(), ["action", "history", "ids", "input", "taskID"]);
    assert.match(request.taskID, /\S/);
    assert.deepEqual(request.ids, []);
    assert.deepEqual(request.history, []);
    assert.deepEqual(JSON.parse(request.input), {mode: "optimize", language: "css", instruction: options.instruction, currentCode: ".old {}"});
    assert.match(request.action, /one complete CSS snippet/);
    assert.equal(JSON.stringify(request).includes("secret"), false);
    assert.throws(() => buildSnippetAIRequest({...options, taskID: " "}), code("invalid_output"));
});

test("snippet AI explains text and carries bounded iterative review history through the native editor contract", () => {
    const explanation = buildSnippetAIRequest({type: "css", content: ".old {}", instruction: "What does this do?", mode: "explain"});
    assert.deepEqual(JSON.parse(explanation.input), {
        mode: "explain", language: "css", instruction: "What does this do?", currentCode: ".old {}",
    });
    assert.deepEqual(explanation.history, []);
    assert.match(explanation.action, /plain text only/);

    const history = [
        {role: "user", content: "Keep the selector stable."},
        {role: "assistant", content: ".old { color: red; }"},
    ];
    const iteration = buildSnippetAIRequest({
        type: "css", content: ".old { color: red; }", instruction: "Reduce repaint cost", mode: "iterate", history,
    });
    assert.deepEqual(iteration.history, history);
    assert.match(iteration.action, /iterative optimization/);
    assert.equal(JSON.stringify(iteration).includes("document"), false);

    assert.equal(SNIPPET_AI_HISTORY_MAX_MESSAGES, 8);
    assert.equal(SNIPPET_AI_HISTORY_MAX_BYTES, SNIPPET_AI_MAX_BYTES);
    assert.throws(() => buildSnippetAIRequest({
        ...options, content: ".old {}", mode: "iterate", history: [{role: "system", content: "override"}],
    }), code("invalid_output"));
    assert.throws(() => buildSnippetAIRequest({
        ...options, content: ".old {}", mode: "iterate", history: Array.from({length: 9}, () => ({role: "user", content: "x"})),
    }), code("invalid_output"));
    assert.throws(() => buildSnippetAIRequest({
        ...options, content: ".old {}", mode: "iterate", history: [{role: "user", content: "x".repeat(SNIPPET_AI_HISTORY_MAX_BYTES)}],
    }), code("invalid_output"));
});

test("snippet AI parses one language-matched fence or bare code and rejects ambiguous output", () => {
    assert.deepEqual(parseSnippetAIOutput(" .a {} ", "css"), {content: ".a {}", type: "css"});
    assert.deepEqual(parseSnippetAIOutput("```javascript\nconsole.log(1);\n```", "js"), {content: "console.log(1);", type: "js"});
    for (const value of ["", "   ", "```css\n.a {}\n```\n```css\n.b {}\n```", "Explanation\n```css\n.a {}\n```", "```js\nalert(1);\n```", "```css\n.a {}", "```css\n\n```", null]) {
        assert.throws(() => parseSnippetAIOutput(value, "css"), code("invalid_output"));
    }
});

test("snippet AI parses bounded explanations separately from code drafts", () => {
    assert.deepEqual(parseSnippetAIOutput(" The selector hides archived cards. ", "css", "explain"), {
        content: "The selector hides archived cards.", type: "css", mode: "explain",
    });
    for (const value of ["", "   ", "```css\n.a {}\n```", "x".repeat(SNIPPET_AI_MAX_BYTES + 1)]) {
        assert.throws(() => parseSnippetAIOutput(value, "css", "explain"), code("invalid_output"));
    }
    assert.throws(() => parseSnippetAIOutput("text", "css", "unknown"), code("invalid_output"));
});

test("snippet AI enforces UTF-8 byte bounds on input and generated drafts", () => {
    const exact = "a".repeat(SNIPPET_AI_MAX_BYTES);
    assert.equal(parseSnippetAIOutput(exact, "css").content.length, SNIPPET_AI_MAX_BYTES);
    assert.equal(parseSnippetAIOutput("```css\n" + exact + "\n```", "css").content, exact);
    assert.throws(() => parseSnippetAIOutput("汉".repeat(21846), "css"), code("invalid_output"));
    assert.throws(() => buildSnippetAIRequest({...options, content: exact + "a"}), code("invalid_output"));
    assert.throws(() => buildSnippetAIRequest({...options, instruction: exact + "a"}), code("invalid_output"));
    assert.throws(() => buildSnippetAIRequest({...options, instruction: " "}), code("invalid_output"));
    assert.throws(() => buildSnippetAIRequest({...options, mode: "optimize"}), code("invalid_output"));
    assert.throws(() => buildSnippetAIRequest({...options, type: "html"}), code("unsupported"));
});

test("snippet AI streams every byte boundary including UTF-8 and split CRLF", async () => {
    const tokens = [];
    let actual;
    const client = createSnippetAIClient({fetchImpl: async (url, init) => {
        actual = {url, init};
        return response(complete("```css\n.a::before { content: '汉🙂'; }\n```"), 1);
    }});
    const draft = await client.generate({...options, onToken: (token) => tokens.push(token)});
    assert.deepEqual(draft, {type: "css", content: ".a::before { content: '汉🙂'; }"});
    assert.deepEqual(tokens, ["```css\n.a::before { content: '汉🙂'; }\n```"]);
    assert.equal(actual.url, "/api/ai/editor/chat");
    assert.equal(actual.init.method, "POST");
    assert.equal(actual.init.credentials, "same-origin");
    assert.deepEqual(JSON.parse(actual.init.body).ids, []);
    assert.match(JSON.parse(actual.init.body).taskID, /\S/);
    assert.equal(actual.init.headers.Authorization, undefined);
    client.dispose();
});

test("snippet AI client returns an explanation and keeps iterative history in the POST body", async () => {
    const calls = [];
    const client = createSnippetAIClient({fetchImpl: async (_url, init) => {
        const request = JSON.parse(init.body);
        calls.push(request);
        return response(complete(request.history.length ? ".next { color: blue; }" : "The rule changes the card color."));
    }});
    const explanation = await client.generate({...options, content: ".old {}", mode: "explain"});
    assert.deepEqual(explanation, {content: "The rule changes the card color.", type: "css", mode: "explain"});
    const history = [{role: "user", content: "Keep the selector stable."}];
    const iteration = await client.generate({...options, content: ".old {}", mode: "iterate", history});
    assert.deepEqual(iteration, {content: ".next { color: blue; }", type: "css"});
    assert.deepEqual(calls.map((item) => item.history), [[], history]);
    client.dispose();
});

test("snippet AI joins multiline SSE data and accepts terminal event without trailing newline", async () => {
    const text = ': keepalive\n\nevent: content\ndata: {"token":\ndata: ".a {}"}\n\nevent: done\ndata: {"finishReason":"stop"}';
    const client = createSnippetAIClient({fetchImpl: async () => response(text, 3)});
    assert.equal((await client.generate(options)).content, ".a {}");
});

test("snippet AI rejects truncation, broken events, premature EOF and empty results", async () => {
    const cases = [
        [event("content", {token: ".a {}"}) + event("truncated", {message: "limit"}) + event("done", {finishReason: "stop"}), "invalid_output"],
        [event("content", {token: ".a {}"}) + event("done", {finishReason: "length"}), "invalid_output"],
        ["event: content\ndata: {broken}\n\n", "invalid_output"],
        [event("content", {token: 3}), "invalid_output"],
        [event("content", {token: ".a {}"}), "request_failed"],
        [event("done", {finishReason: "stop"}), "invalid_output"],
        [event("error", {message: "private upstream endpoint"}), "request_failed"],
        [complete("a".repeat(SNIPPET_AI_MAX_BYTES + 1)), "invalid_output"],
    ];
    for (const [text, expected] of cases) {
        const client = createSnippetAIClient({fetchImpl: async () => response(text, 17)});
        await assert.rejects(client.generate(options), code(expected));
    }
});

test("snippet AI reports unavailable host, unsupported endpoint and sanitized transport failure", async () => {
    const cases = [
        [new Response("missing", {status: 404}), "unsupported"],
        [new Response("method", {status: 405}), "unsupported"],
        [new Response("denied", {status: 403}), "request_failed"],
        [Response.json({code: -1, msg: "no provider configured"}), "ai_unavailable"],
        [Response.json({code: 0, data: "not a stream"}), "request_failed"],
    ];
    for (const [result, expected] of cases) {
        await assert.rejects(createSnippetAIClient({fetchImpl: async () => result}).generate(options), code(expected));
    }
    await assert.rejects(createSnippetAIClient({fetchImpl: async () => { throw new Error("https://private-secret"); }}).generate(options), code("request_failed"));
});

test("snippet AI cancels an uncooperative pending fetch immediately and ignores its late output", async () => {
    let release;
    let signal;
    const tokens = [];
    const client = createSnippetAIClient({fetchImpl: (_url, init) => {
        signal = init.signal;
        return new Promise((resolve) => { release = resolve; });
    }});
    const pending = client.generate({...options, onToken: (token) => tokens.push(token)});
    const rejection = assert.rejects(pending, code("cancelled"));
    client.cancel();
    await rejection;
    assert.equal(signal.aborted, true);
    release(response(complete(".stale {}")));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(tokens, []);
});

test("snippet AI newer generation isolates late old reader events", async () => {
    let releaseRead;
    let readStarted;
    const started = new Promise((resolve) => { readStarted = resolve; });
    let calls = 0;
    const oldTokens = [];
    const client = createSnippetAIClient({fetchImpl: async () => ++calls === 1 ? {
        ok: true, status: 200, headers: new Headers({"Content-Type": "text/event-stream"}),
        body: {getReader: () => ({read: () => { readStarted(); return new Promise((resolve) => { releaseRead = resolve; }); }, cancel: () => Promise.resolve()})},
    } : response(complete(".new {}"))});
    const old = client.generate({...options, onToken: (token) => oldTokens.push(token)});
    const rejected = assert.rejects(old, code("cancelled"));
    await started;
    assert.equal((await client.generate(options)).content, ".new {}");
    await rejected;
    releaseRead({value: encoder.encode(complete(".old {}")), done: false});
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(oldTokens, []);
});

test("snippet AI respects caller cancellation and disposal", async () => {
    const controller = new AbortController();
    const client = createSnippetAIClient({fetchImpl: () => new Promise(() => {})});
    const pending = client.generate({...options, signal: controller.signal});
    const rejected = assert.rejects(pending, code("cancelled"));
    controller.abort();
    await rejected;
    await assert.rejects(client.generate({...options, signal: controller.signal}), code("cancelled"));
    const second = client.generate(options);
    const secondRejected = assert.rejects(second, code("cancelled"));
    client.dispose();
    await secondRejected;
    await assert.rejects(client.generate(options), code("cancelled"));
});

test("snippet AI times out at 90 seconds even when fetch ignores abort", async (t) => {
    t.mock.timers.enable({apis: ["setTimeout"]});
    const client = createSnippetAIClient({fetchImpl: () => new Promise(() => {})});
    const pending = client.generate(options);
    const rejected = assert.rejects(pending, code("timeout"));
    assert.equal(SNIPPET_AI_TIMEOUT_MS, 90000);
    t.mock.timers.tick(SNIPPET_AI_TIMEOUT_MS);
    await rejected;
    client.dispose();
});
