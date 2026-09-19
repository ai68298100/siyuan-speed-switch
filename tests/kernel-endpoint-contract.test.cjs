const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// T-6477：把插件对内核端点的假设钉在官方契约快照上。
// 契约来源：siyuan master（kernel 3.8.4）kernel/apicontract/schema.json，
// 经 scripts/gen-api-contract.cjs 生成 tests/fixtures/siyuan-api-contract.json。
// 边界声明：本门禁只保证"与上游契约快照一致"，不保证与用户运行时内核一致；
// 运行时真值以 docs/kernel-api-smoke-*.md 实测为准，分歧登记在 MEASURED_DIVERGENCE。

const ROOT = path.resolve(__dirname, "..");
const FIXTURE_PATH = path.join(ROOT, "tests/fixtures/siyuan-api-contract.json");
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
const indexSource = fs.readFileSync(path.join(ROOT, "src/index.ts"), "utf8");

const byPath = new Map(fixture.endpoints.map((e) => [e.path, e]));

// ── 1. fixture 自身不可手改 ──
test("api contract fixture is reproducible from its endpoint subset", () => {
    const recomputed = crypto.createHash("sha256")
        .update(JSON.stringify(fixture.endpoints, null, 1)).digest("hex");
    assert.equal(recomputed, fixture.source.subsetSha256,
        "fixture 被手改过；请改 scripts/gen-api-contract.cjs 后重新生成");
    assert.ok(fixture.source.kernelVersion, "fixture 必须记录上游内核版本");
    assert.match(fixture.source.retrievedAt, /^\d{4}-\d{2}-\d{2}$/,
        "fixture 必须记录快照取回日期");
});

// ── 2. src/ 里每个 /api/ 字面量都必须有归属 ──
test("every kernel-shaped literal in src is classified by the contract", () => {
    const literals = new Set();
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!/\.(ts|js)$/.test(entry.name)) continue;
            for (const m of fs.readFileSync(full, "utf8").matchAll(/"(\/api\/[A-Za-z0-9\-/]+)"/g)) {
                literals.add(m[1]);
            }
        }
    };
    walk(path.join(ROOT, "src"));
    assert.ok(literals.size >= 25, `扫描到的 /api/ 字面量过少（${literals.size}），扫描可能失效`);
    const classified = new Set([...fixture.endpoints, ...fixture.nonKernel]
        .map((e) => e.path));
    const unknown = [...literals].filter((l) => !classified.has(l)).sort();
    assert.deepEqual(unknown, [],
        "新增 /api/ 端点必须先登记进契约 fixture（node scripts/gen-api-contract.cjs）");
});

// ── 3. 分发面 1:1：白名单 / case / fetch 字面量不得漂移 ──
test("kernel dispatcher whitelist, case labels and fetch literals stay 1:1", () => {
    const wlStart = indexSource.indexOf("private static KERNEL_ENDPOINTS = new Set([");
    assert.ok(wlStart > 0, "找不到 KERNEL_ENDPOINTS 锚点，门禁需同步更新");
    const whitelist = [...indexSource.slice(wlStart, indexSource.indexOf("]);", wlStart))
        .matchAll(/"(\/api\/[^"]+)"/g)].map((m) => m[1]);

    const fnStart = indexSource.indexOf("private async fetchKernelJson(");
    const fnEnd = indexSource.indexOf("// 外部生活组件在桌面 WebView", fnStart);
    assert.ok(fnStart > 0 && fnEnd > fnStart, "找不到 fetchKernelJson 方法边界");
    const body = indexSource.slice(fnStart, fnEnd);
    const cases = [...body.matchAll(/case "(\/api\/[^"]+)":/g)].map((m) => m[1]);
    const fetches = [...body.matchAll(/fetch\("(\/api\/[^"]+)"/g)].map((m) => m[1]);

    assert.ok(whitelist.length >= 19 && cases.length === whitelist.length,
        "白名单或 case 数量异常，扫描可能失效");
    assert.deepEqual([...new Set(whitelist)].sort(), whitelist.slice().sort(),
        "白名单存在重复条目");
    assert.deepEqual(cases.sort(), whitelist.slice().sort(),
        "case 与白名单不一致（名单有分发无，或反之）");
    assert.deepEqual(fetches.sort(), whitelist.slice().sort(),
        "case 内 fetch 的字面量必须与 case 标签同名");
    for (const endpoint of whitelist) {
        assert.ok(byPath.has(endpoint), `${endpoint} 不在上游契约中（可能已改名或删除）`);
    }
});

// ── 4. 逐端点契约事实 ──
// body 取值为上游契约声明的请求体种类：json / none / legacyOptional。
// 显式写出，避免"所有端点都收 JSON"这类想当然的断言。
const CONTRACT_FACTS = [
    {
        path: "/api/query/sql",
        note: "请求字段是 stmt，不是 query（历史 16 处静默失败根因）；结果受 limit/truncated 约束。",
        body: "json",
        requestRequired: ["stmt"],
        requestOptional: ["mode"],
        dataKind: "array",
        successFieldsInclude: ["limit", "truncated"],
    },
    {
        path: "/api/storage/getRecentDocs",
        note: "官方最近文档条目字段，含 closedAt，可与 src/recent-closed.js 对齐。",
        body: "legacyOptional",
        dataKind: "array",
        itemFieldsInclude: ["rootID", "title", "viewedAt", "openAt", "closedAt", "icon"],
    },
    {
        path: "/api/filetree/listDocsByPath",
        note: "T-107 取证过的目录列表。",
        body: "json",
        requestRequired: ["notebook", "path"],
        requestOptional: ["maxListCount", "sort", "showHidden", "ignoreMaxListHint"],
        dataKind: "object",
        dataFieldsInclude: ["box", "files", "path"],
        fileFieldsInclude: ["id", "name", "path", "subFileCount", "childrenSortMode"],
    },
    {
        path: "/api/filetree/getPinnedDocs",
        note: "官方置顶文档条目；收藏夹与之重叠时以此为准。",
        body: "none",
        dataKind: "array",
        itemFieldsInclude: ["id", "notebook", "name", "path", "icon", "subFileCount", "unavailable"],
    },
    {
        path: "/api/network/forwardProxy",
        note: "生活组件与 ActivityWatch 的唯一出网通道，请求/响应字段均为私有形状。",
        body: "json",
        requestRequired: ["url"],
        requestOptional: ["method", "payload", "payloadEncoding", "headers", "timeout", "responseEncoding"],
        dataKind: "object",
        dataFieldsInclude: ["status", "body", "bodyEncoding", "headers", "contentType", "elapsed", "url"],
        errorCodesNonEmpty: true,
    },
    {
        path: "/api/av/renderAttributeView",
        note: "ADR 0058 有界投影的前置条件：库 ID 与块 ID 语义不同。",
        body: "json",
        requestRequired: ["id"],
        requestOptional: ["blockID", "pageSize", "page", "viewID", "query"],
    },
    {
        path: "/api/search/fullTextSearchBlock",
        note: "分层搜索第三层；分页与截断字段必须存在。",
        body: "json",
        requestOptional: ["query", "page", "pageSize", "method", "notebook", "paths", "types"],
        dataKind: "object",
        dataFieldsInclude: ["blocks", "pageCount", "matchedBlockCount", "docMode"],
    },
    {
        path: "/api/search/semanticSearchBlock",
        note: "语义搜索：未配置 embedding 时静默空，属能力探测面。",
        body: "json",
        requestOptional: ["query", "page", "pageSize", "method", "types"],
    },
    {
        path: "/api/asset/getMissingAssets",
        note: "见 MEASURED_DIVERGENCE：契约声明 path，实测响应不带。",
        body: "none",
        dataKind: "array",
        itemFieldsInclude: ["item", "name", "blockIDs"],
    },
];

for (const fact of CONTRACT_FACTS) {
    test(`contract facts hold for ${fact.path}`, () => {
        const entry = byPath.get(fact.path);
        assert.ok(entry, `${fact.path} 未进入契约 fixture`);
        assert.equal(entry.method, "POST", `${fact.path} 方法变化需同步 fetch 方式`);
        assert.equal(entry.body, fact.body,
            `${fact.path} 请求体种类变化（现为 ${entry.body}，登记为 ${fact.body}）`);
        for (const name of fact.requestRequired || []) {
            assert.ok(entry.request.required.includes(name),
                `${fact.path} 契约不再要求 ${name}：${fact.note}`);
        }
        for (const name of fact.requestOptional || []) {
            const prop = entry.request.properties[name];
            assert.ok(prop, `${fact.path} 契约不再接受 ${name}：${fact.note}`);
            assert.equal(prop.required, false, `${fact.path}.${name} 由可选变为必填`);
        }
        if (fact.dataKind) {
            assert.equal(entry.response.data.kind, fact.dataKind,
                `${fact.path} data 顶层类型变化（${entry.response.data.kind} → 期望 ${fact.dataKind}）：${fact.note}`);
        }
        const itemFields = fact.dataKind === "array"
            ? (entry.response.data.item.fields || []) : [];
        for (const name of fact.itemFieldsInclude || []) {
            assert.ok(itemFields.includes(name), `${fact.path} 条目缺少字段 ${name}：${fact.note}`);
        }
        for (const name of fact.itemFieldsExclude || []) {
            assert.ok(!itemFields.includes(name), `${fact.path} 条目新增了曾判定缺失的字段 ${name}`);
        }
        const dataFields = entry.response.data.fields || [];
        for (const name of fact.dataFieldsInclude || []) {
            assert.ok(dataFields.includes(name), `${fact.path} data 缺少字段 ${name}：${fact.note}`);
        }
        if (fact.fileFieldsInclude) {
            const files = entry.response.data.props && entry.response.data.props.files;
            assert.ok(files, `${fact.path} 不再返回 data.files`);
            for (const name of fact.fileFieldsInclude) {
                assert.ok((files.item.fields || []).includes(name),
                    `${fact.path} data.files 条目缺少 ${name}：${fact.note}`);
            }
        }
        for (const name of fact.successFieldsInclude || []) {
            assert.ok(entry.response.successTopFields.includes(name),
                `${fact.path} 成功响应不再携带 ${name}：${fact.note}`);
        }
        if (fact.errorCodesNonEmpty) {
            assert.ok(entry.response.errorCodes.length > 0,
                `${fact.path} 契约错误码分支丢失`);
        }
    });
}

// ── 5. 契约与真实宿主的分歧登记（上游一改就会失败，强制回来复核） ──
const MEASURED_DIVERGENCE = [
    {
        path: "/api/asset/getMissingAssets",
        contractField: "path",
        contractDeclares: true,
        runtime: "3.8.4 实测响应元素为 item|name|blockIDs，无 path",
        evidence: "docs/kernel-api-smoke-2026-09-19.md:39-42",
        pluginRule: "不得读取 data[].path；定位改用 blockIDs[0]（T-6471）",
    },
    {
        path: "/api/av/renderAttributeView",
        contractField: "id",
        contractDeclares: true,
        runtime: "传块 ID 时 rows 恒 0（含 pageSize/viewID）；须先经 getAttributeView 解析库 ID",
        evidence: "docs/kernel-api-smoke-2026-09-19.md:24-37；src/kernel-widget-model.js（T-6470）",
        pluginRule: "id 必须是库 ID，块 ID 走 getAttributeView 兜底",
    },
];

test("measured host divergences stay recorded against the contract", () => {
    for (const row of MEASURED_DIVERGENCE) {
        const entry = byPath.get(row.path);
        assert.ok(entry, `${row.path} 已从契约中消失，登记需重审`);
        const declared = Object.prototype.hasOwnProperty.call(entry.request.properties, row.contractField)
            || (entry.response.data.item && (entry.response.data.item.fields || []).includes(row.contractField))
            || (entry.response.data.fields || []).includes(row.contractField);
        assert.equal(declared, row.contractDeclares,
            `${row.path}.${row.contractField} 的契约声明状态已变化（${row.runtime}；${row.evidence}），`
            + `插件规则「${row.pluginRule}」需重新判定`);
    }
});
