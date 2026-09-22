// 从思源上游 API 契约（kernel/apicontract/schema.json）生成插件侧使用的端点子集 fixture。
// 用法：node scripts/gen-api-contract.cjs [上游 schema.json 路径]
// 目的：把插件对内核端点的假设钉在官方契约快照上，而不是手写副本或运行时推断。
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA = process.argv[2]
    || path.join(ROOT, ".research/refs/siyuan-master/kernel/apicontract/schema.json");
// 上游源码根从 schema 路径推导（schema 位于 <root>/kernel/apicontract/），
// 便于对任意本地克隆（如 research-clones/siyuan）重新生成。
const UPSTREAM_ROOT = path.dirname(path.dirname(path.dirname(path.resolve(SCHEMA))));
const OUT = path.join(ROOT, "tests/fixtures/siyuan-api-contract.json");
const SRC = path.join(ROOT, "src");

// 以 "/api/" 开头但不是思源内核端点的字面量：必须显式写明归属，否则视为漂移。
// 本表只保留当前 src/ 真实命中的条目——出现僵尸归类会被下面的校验拦下。
const NON_KERNEL = {
    "/api/0/query/": "ActivityWatch 第三方服务查询路径（经思源正向代理访问）",
    "/api/s": "外部生活组件服务 URL 片段拼接来源，非独立内核端点",
    "/api/0/buckets": "ActivityWatch 第三方服务列桶路径（经思源正向代理访问，T-6689 桶选择）",
};

function scanKernelLiterals() {
    const found = new Map();
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!/\.(ts|js)$/.test(entry.name)) continue;
            const text = fs.readFileSync(full, "utf8");
            for (const match of text.matchAll(/"(\/api\/[A-Za-z0-9\-/]+)"/g)) {
                const literal = match[1];
                if (!found.has(literal)) found.set(literal, []);
                const rel = path.relative(ROOT, full).replace(/\\/g, "/");
                const line = text.slice(0, match.index).split("\n").length;
                const site = `${rel}:${line}`;
                if (!found.get(literal).includes(site)) found.get(literal).push(site);
            }
        }
    };
    walk(SRC);
    return found;
}

function typeOf(node) {
    if (!node || typeof node !== "object") return "unknown";
    if (node.$ref) return `${String(node.$ref).split("/").pop()}`;
    if (node.anyOf) return node.anyOf.map(typeOf).join("|");
    if (node.enum) return `${node.type || "const"}:${node.enum.join(",")}`;
    if (node.type === "array") return `array<${typeOf(node.items)}>`;
    if (node.type === "object") return "object";
    return node.type || "unknown";
}

function refName(node) {
    return node && node.$ref ? String(node.$ref).split("/").pop() : null;
}

// 把 $ref / anyOf 收敛到"带 properties 的那个分支"，用于结构化断言；纯类型联合保留原样。
function resolve(schema, node, depth = 4) {
    if (!node || depth <= 0 || typeof node !== "object") return node || {};
    const name = refName(node);
    if (name) return resolve(schema, schema.$defs[name], depth - 1);
    if (Array.isArray(node.anyOf)) {
        const withProps = node.anyOf.find((b) => (b && b.properties) || refName(b));
        if (withProps) return resolve(schema, withProps, depth - 1);
        // 联合里挑第一个结构性分支（array/object），null 分支只表示"可为空"。
        const structural = node.anyOf.find((b) => b && (b.type === "array" || b.type === "object"));
        if (structural) return resolve(schema, structural, depth - 1);
        return node;
    }
    return node;
}

// 有界展开：深度上限 2、字段上限 40，避免 fixture 无界增长。
function shape(schema, node, depth = 2) {
    const target = resolve(schema, node);
    if (!target || typeof target !== "object") return { kind: "unknown" };
    if (target.type === "array") {
        if (depth <= 0) return { kind: "array", itemKind: "deferred" };
        const out = { kind: "array", item: shape(schema, target.items, depth - 1) };
        return out;
    }
    if (target.type === "object" || target.properties) {
        const names = Object.keys(target.properties || {}).sort();
        const out = { kind: "object", fields: names.slice(0, 40) };
        if (depth > 0) {
            out.props = {};
            for (const name of names.slice(0, 40)) {
                out.props[name] = shape(schema, target.properties[name], depth - 1);
            }
        }
        if (target.additionalProperties && typeof target.additionalProperties === "object") {
            out.itemKind = "freeformMap";
        }
        return out;
    }
    if (target.enum) return { kind: target.type || "const", enum: target.enum };
    return { kind: target.type || typeOf(node), ref: refName(node) || undefined };
}

function extract(schema, entry) {
    const request = resolve(schema, entry.request);
    const required = Array.isArray(request.required) ? request.required.slice().sort() : [];
    const properties = {};
    for (const [name, node] of Object.entries(request.properties || {})) {
        properties[name] = { type: typeOf(node), required: required.includes(name) };
    }
    const branches = Array.isArray(entry.response.anyOf) ? entry.response.anyOf : [];
    const success = branches.find((b) => b.properties && (b.properties.code || {}).enum
        && (b.properties.code.enum.length === 1 && b.properties.code.enum[0] === 0));
    const errorCodes = branches.filter((b) => b !== success && b.properties && b.properties.code)
        .flatMap((b) => (b.properties.code.enum || []).filter((c) => c !== 0));
    const out = {
        method: entry.method,
        handler: entry.handler,
        body: entry.body,
        request: { required, properties },
        response: {
            successRequired: success && success.required ? success.required.slice().sort() : [],
            successTopFields: success && success.properties ? Object.keys(success.properties).sort() : [],
            errorCodes: [...new Set(errorCodes)].sort((a, b) => a - b),
        },
    };
    if (success && success.properties) {
        for (const [name, node] of Object.entries(success.properties)) {
            if (name === "code" || name === "msg") continue;
            out.response[name === "data" ? "data" : `top:${name}`] = shape(schema, node);
        }
    }
    return out;
}

function main() {
    if (!fs.existsSync(SCHEMA)) {
        console.error(`找不到上游契约：${SCHEMA}\n请先取回 siyuan master 快照（见 docs/dev-plan-2026-09-19.md §0）。`);
        process.exit(1);
    }
    const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
    const byPath = new Map(schema.endpoints.map((e) => [e.path, e]));
    const literals = scanKernelLiterals();

    const kernel = [];
    const rejected = [];
    for (const [literal, sites] of [...literals].sort()) {
        if (NON_KERNEL[literal]) { rejected.push({ path: literal, reason: NON_KERNEL[literal], sites }); continue; }
        const entry = byPath.get(literal);
        if (!entry) {
            console.error(`未归类且不在上游契约中：${literal}\n  出现：${sites.slice(0, 4).join(", ")}`);
            process.exit(1);
        }
        kernel.push(Object.assign({ path: literal, usedBy: sites }, extract(schema, entry)));
    }
    // 归类表不得留僵尸条目：否则将来同名内核端点会被静默当作外部路径放过。
    const usedRejections = new Set(rejected.map((r) => r.path));
    const stale = Object.keys(NON_KERNEL).filter((k) => !usedRejections.has(k));
    if (stale.length) {
        console.error(`NON_KERNEL 存在已不再命中的归类项，请删除：${stale.join(", ")}`);
        process.exit(1);
    }

    const subset = JSON.stringify(kernel, null, 1);
    const fixture = {
        source: {
            repo: "siyuan-note/siyuan",
            branch: "master",
            kernelVersion: (fs.readFileSync(path.join(UPSTREAM_ROOT,
                "kernel/util/working.go"), "utf8").match(/const Ver = "([^"]+)"/) || [])[1],
            retrievedAt: process.env.SW_CONTRACT_RETRIEVED_AT || "REPLACE_WITH_SNAPSHOT_DATE",
            note: "上游契约快照的有端子集；由 scripts/gen-api-contract.cjs 生成，勿手改。运行时真值以 docs/kernel-api-smoke-*.md 实测为准。",
            subsetSha256: crypto.createHash("sha256").update(subset).digest("hex"),
        },
        nonKernel: rejected.map(({ path: p, reason }) => ({ path: p, reason })),
        endpoints: kernel,
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(fixture, null, 2) + "\n");
    console.log(`写入 ${path.relative(ROOT, OUT).replace(/\\/g, "/")}`);
    console.log(`内核端点 ${kernel.length} 条，非内核字面量 ${rejected.length} 条，`
        + `subsetSha256 ${fixture.source.subsetSha256.slice(0, 12)}`);
    const uncovered = kernel.filter((k) => !k.response.successRequired.length);
    if (uncovered.length) console.log(`提示：${uncovered.length} 条无成功分支声明：${uncovered.map((k) => k.path).join(", ")}`);
}

main();
