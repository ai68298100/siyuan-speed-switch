const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions, createQuickActionRegistry} = require("../src/quick-actions.js");

test("post-release security: dangerous command payload remains inert metadata", () => {
    const item = sanitizeQuickActions([{id: "x", kind: "command", value: "javascript:alert(1)", label: "危险", icon: "iconCommand"}]).items[0];
    assert.equal(item.value, "javascript:alert(1)");
    assert.equal(item.icon, "iconPlugin");
});

test("post-release security: non-HTTPS icon URLs are downgraded to core plugin icon", () => {
    const item = sanitizeQuickActions([{id: "x", kind: "adapter", value: "p/open", label: "入口", icon: "http://evil.example/icon.svg"}]).items[0];
    assert.equal(item.icon, "iconPlugin");
    const normalize = (icon) => sanitizeQuickActions([{id: "x", kind: "adapter", value: "p/open", label: "入口", icon}]).items[0].icon;
    assert.equal(normalize("https://example.com/icon.svg"), "https://example.com/icon.svg");
    assert.equal(normalize("bad"), "bad", "short text is an intentional custom icon");
    assert.equal(normalize("https://user:password@example.com/icon.svg"), "iconPlugin");
    assert.equal(normalize("data:text/html;base64,PHNjcmlwdD4="), "iconPlugin");
    assert.equal(normalize("https://example.com/" + "x".repeat(500)), "iconPlugin");
});

test("post-release security: sensitive import fields do not survive sanitization", () => {
    const item = sanitizeQuickActions([{id: "x", kind: "command", value: "p/open", label: "入口", token: "secret", password: "pw", headers: {authorization: "x"}}]).items[0];
    for (const key of ["token", "password", "headers"]) assert.equal(Object.prototype.hasOwnProperty.call(item, key), false);
});

test("post-release security: registry does not execute without an explicit handler", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "x", name: "X", actions: [{value: "open"}]});
    assert.deepEqual(registry.invoke(registry.list()[0]), {ok: false, reason: "unavailable"});
});
