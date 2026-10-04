const test = require("node:test");
const assert = require("node:assert/strict");
const {selectSnippetAIContext, createSnippetAIClient} = require("../src/snippet-studio-ai.js");

test("snippet AI context excludes unchecked code and history and bounds selected UTF8 bytes", () => {
    const content = "private snippet";
    const history = [{role: "user", content: "private history"}];
    assert.deepEqual(selectSnippetAIContext({content, history}), {content: "", history: [], byteLength: 2});
    assert.deepEqual(selectSnippetAIContext({content, history, includeCode: true}).history, []);
    assert.equal(selectSnippetAIContext({content, history, includeHistory: true}).content, "");
    assert.equal(selectSnippetAIContext({content, history, includeCode: true, includeHistory: true}).history[0].content, "private history");
    assert.throws(() => selectSnippetAIContext({content: "中".repeat(24000), includeCode: true}), {code: "context_too_large"});
    assert.throws(() => selectSnippetAIContext({history: [{role: "assistant", content: "中".repeat(24000)}], includeHistory: true}), {code: "context_too_large"});
    assert.throws(() => selectSnippetAIContext({content: "a".repeat(40000), includeCode: true,
        history: [{role: "assistant", content: "b".repeat(40000)}], includeHistory: true}), {code: "context_too_large"});
});

test("snippet AI reports host authorization rejection without changing draft", async () => {
    const client = createSnippetAIClient({fetchImpl: async () => ({status: 403, ok: false})});
    await assert.rejects(client.generate({type: "css", instruction: "make a draft"}), {code: "permission_denied"});
    client.dispose();
});
