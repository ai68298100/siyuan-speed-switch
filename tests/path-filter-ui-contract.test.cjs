const {readSourceText} = require("./source-scan.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
// R5a 重构（D-381）：搜索链路状态宿主收拢至 doc-search-state.ts。
const searchState = readSourceText(path.join(__dirname, "..", "src", "doc-search-state.ts"));
// R5b 重构（D-383）：搜索方法群（含路径筛选菜单/取数）外迁至 doc-search-ui.ts。
const docSearchUi = readSourceText(path.join(__dirname, "..", "src", "doc-search-ui.ts"));

// 2026-09-16：宿主端点获批，本门禁从"禁止接入生产"转为"约束接入方式"。
// 放宽依据 = docs/path-filter-host-evidence.md（D-365）：在真实宿主
// （内核 3.8.4-beta.2，已认证会话）实测 /api/filetree/listDocsByPath 返回
// 200 / code 0 / 22ms，box 与 path 回显均等于请求值，响应结构与
// path-filter-model 的校验假设逐项吻合，故端点获批这一前提已成立。
// 仍未取证的是"最窄可用侧栏宽度"（UI 度量），因此本次只接入桌面筛选弹层，
// 侧栏入口不在本轮范围内。

test("path filter is wired now that the host endpoint is approved", () => {
    assert.match(docSearchUi, /delete next\.paths/, "清除路径筛选的分支必须保留");
    assert.match(docSearchUi, /listDocsByPath/, "端点获批后应已接入（见 D-365）");
});

test("path filter endpoint is allowlisted and called with a literal URL", () => {
    // 安全约束：新增端点必须进白名单，且请求使用字面量 URL（不存在变量 URL 请求）
    assert.match(source, /"\/api\/filetree\/listDocsByPath",/, "端点必须在 KERNEL_ENDPOINTS 白名单内");
    assert.match(source, /fetch\("\/api\/filetree\/listDocsByPath", init\)/, "必须使用字面量 URL 发起请求");
});

test("path filter keeps generation-token cancellation (T-7043: per-surface isolation)", () => {
    // fetchKernelJson 不接受外部 signal，取消只能靠代际标记；此约束不得退化。
    // T-7043：代际按 scrollElement（surface/session）隔离——全局单值会让桌面/
    // 侧栏/移动互相对方的在途路径请求作废。
    assert.match(searchState, /pathGenerations: new WeakMap\(\)/, "代际必须按 scrollElement 存于 WeakMap");
    assert.doesNotMatch(searchState, /pathGeneration: 0/, "全局单值代际不得回归");
    assert.match(source, /docSearchState = createDocSearchState\(\)/, "宿主必须持有状态宿主实例");
    const uses = [...docSearchUi.matchAll(/this\.docSearchState\.pathGenerations\.get\(scrollElement\)/g)].length;
    assert.ok(uses >= 4, `代际按表面读取应至少四处（重开读旧值/取数前/取数后/回包门），实测 ${uses} 处`);
    assert.match(docSearchUi, /this\.docSearchState\.pathGenerations\.set\(scrollElement, generation\)/, "每次打开路径菜单必须按表面自增代际标记");
    assert.match(docSearchUi, /loadDocSearchPathChildren\(this: DocSearchUiHost, notebook: string, path: string, generation: number, scrollElement: HTMLElement\)/, "取数助手必须携带表面上下文做代际比对");
    assert.doesNotMatch(docSearchUi, /this\.docSearchState\.pathGeneration\b/, "不得残留全局单值代际");
});

test("path filter degrades instead of blocking when the endpoint is unavailable", () => {
    assert.match(docSearchUi, /searchPathUnavailable/, "端点不可用时须给出降级提示");
    assert.match(docSearchUi, /kind: "unavailable"/, "失败须映射为 unavailable 而非抛出");
});

test("path filter stays read-only", () => {
    // 只读边界：路径筛选不得引入任何写入端点
    assert.doesNotMatch(source, /listDocsByPath[\s\S]{0,120}(updateBlock|insertBlock|appendBlock|createDocWithMd|removeDoc)/,
        "路径筛选不得与写入端点组合使用");
    assert.doesNotMatch(docSearchUi, /listDocsByPath[\s\S]{0,120}(updateBlock|insertBlock|appendBlock|createDocWithMd|removeDoc)/,
        "路径筛选不得与写入端点组合使用（R5b 后取数在 doc-search-ui）");
});

test("path filter applies to local tab cards and refreshes path metadata", () => {
    assert.match(source, /dataset\.searchPath = buildOpenedDocumentScope\(tab as unknown\)\?\.path \|\| ""/,
        "页签卡片必须记录可筛选的 notebook/path 元数据");
    assert.match(source, /matchesSearchDocumentFilters\(\{[\s\S]*?searchPath/,
        "本地卡片筛选必须复用远程结果的路径语义");
});
