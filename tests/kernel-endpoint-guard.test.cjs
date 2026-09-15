const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// KERNEL_ENDPOINTS 是防 SSRF 的关键守卫：fetchKernelJson 只允许同源、硬编码的
// 内核相对路径。此前全仓测试对它零覆盖，而白名单与 switch 分支分散在两处、
// 必须成对修改——只改一处不会报错：漏加分支会让端点在 default 静默返回 null，
// 漏加白名单会让分支永不可达。这与 D-354 揭示的"门禁看似存在实则失效"同类。
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "index.ts"), "utf8");

// 只截取 fetchKernelJson 函数体，避免把其它 switch（例如生活组件代理分发）
// 误当作内核端点分发来断言。
function fetchKernelBody() {
    const start = source.indexOf("private async fetchKernelJson");
    assert.ok(start >= 0, "fetchKernelJson must exist in src/index.ts");
    const rest = source.slice(start);
    const end = rest.indexOf("\n    private ");
    return end > 0 ? rest.slice(0, end) : rest;
}

const body = fetchKernelBody();

function allowlistedEndpoints() {
    const match = source.match(/KERNEL_ENDPOINTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(match, "KERNEL_ENDPOINTS must be declared as an inline literal Set");
    return [...match[1].matchAll(/"(\/api\/[^"]+)"/g)].map((entry) => entry[1]);
}

function dispatchCases() {
    return [...body.matchAll(/case "(\/api\/[^"]+)":/g)].map((entry) => entry[1]);
}

test("the kernel endpoint allowlist is non-empty", () => {
    assert.ok(allowlistedEndpoints().length > 0, "an empty allowlist would disable every kernel request");
});

test("allowlisted endpoints are same-origin relative paths", () => {
    const malformed = allowlistedEndpoints().filter((endpoint) => !endpoint.startsWith("/")
        || endpoint.startsWith("//") || /^https?:/i.test(endpoint));
    assert.deepEqual(malformed, [],
        `allowlisted endpoints must be same-origin relative paths: ${malformed.join(", ")}`);
});

test("every allowlisted endpoint has a matching dispatch branch", () => {
    const cases = dispatchCases();
    const missing = allowlistedEndpoints().filter((endpoint) => !cases.includes(endpoint));
    assert.deepEqual(missing, [],
        `allowlisted without a case branch; these would silently fall through to default and return null: ${missing.join(", ")}`);
});

test("every dispatch branch targets an allowlisted endpoint", () => {
    const allowed = allowlistedEndpoints();
    const orphaned = dispatchCases().filter((endpoint) => !allowed.includes(endpoint));
    assert.deepEqual(orphaned, [],
        `dispatch branches whose endpoint is not allowlisted are unreachable: ${orphaned.join(", ")}`);
});

test("kernel requests use literal URLs drawn from the allowlist", () => {
    const literals = [...body.matchAll(/fetch\("(\/api\/[^"]+)"/g)].map((entry) => entry[1]);
    const allowed = allowlistedEndpoints();
    assert.deepEqual(literals.filter((endpoint) => !allowed.includes(endpoint)), [],
        "every literal kernel fetch URL must be allowlisted");
    assert.equal(literals.length, dispatchCases().length,
        "each dispatch branch must issue exactly one literal fetch");
});

test("kernel requests never use a variable or absolute URL", () => {
    // 安全扫描要求：不存在变量 URL 请求。这里把它固化为可在本地运行的门禁，
    // 避免只在外部扫描器里才暴露。
    assert.doesNotMatch(body, /fetch\(\s*(?!")/, "fetch must not be called with a non-literal URL");
    assert.doesNotMatch(body, /fetch\(\s*["'`]https?:/i, "fetch must never target an absolute URL");
});

test("unknown endpoints are rejected by an explicit default branch", () => {
    assert.match(body, /default:\s*\n\s*logger\.warn\("blocked non-whitelisted kernel endpoint"/,
        "the switch must reject unknown endpoints through an explicit default branch");
});

test("the allowlist guard keeps all four rejections", () => {
    assert.match(body, /typeof url !== "string"/, "non-string URLs must be rejected");
    assert.match(body, /!url\.startsWith\("\/"\)/, "non-relative URLs must be rejected");
    assert.match(body, /url\.startsWith\("\/\/"\)/, "protocol-relative URLs must be rejected");
    assert.match(body, /KERNEL_ENDPOINTS\.has\(url\)/, "URLs outside the allowlist must be rejected");
});
