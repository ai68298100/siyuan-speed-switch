const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "docs", "current-status-index.json");
const statuses = new Set(["completed", "in_progress", "planned", "blocked", "deferred"]);
const priorities = new Set(["P0", "P1", "P2"]);
const taskId = /^T-\d+$/;

function fail(message) { throw new Error(`current-status-audit: ${message}`); }
function load() {
    if (!fs.existsSync(indexPath)) fail("缺少 docs/current-status-index.json");
    try { return JSON.parse(fs.readFileSync(indexPath, "utf8")); }
    catch (error) { fail(`JSON 无法解析：${error.message}`); }
}
function validate(index) {
    if (!index || typeof index !== "object" || Array.isArray(index)) fail("索引根必须是对象");
    if (index.schemaVersion !== 1) fail("schemaVersion 必须为 1");
    if (index.sourceOfTruth !== "docs/current-status-index.json") fail("sourceOfTruth 必须指向自身");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(index.updated)) fail("updated 必须为 YYYY-MM-DD");
    if (!Array.isArray(index.tasks) || index.tasks.length < 1) fail("tasks 不能为空");
    const ids = new Set();
    for (const [position, item] of index.tasks.entries()) {
        if (!item || typeof item !== "object" || Array.isArray(item)) fail(`第 ${position + 1} 项必须为对象`);
        if (!taskId.test(item.id)) fail(`任务 ID 非法：${item.id}`);
        if (ids.has(item.id)) fail(`任务 ID 重复：${item.id}`);
        ids.add(item.id);
        if (!statuses.has(item.status)) fail(`${item.id} 状态非法：${item.status}`);
        if (!priorities.has(item.priority)) fail(`${item.id} 优先级非法：${item.priority}`);
        if (!["local", "environment", "external", "release", "product"].includes(item.owner)) fail(`${item.id} owner 非法：${item.owner}`);
        if (!Array.isArray(item.evidence) || item.evidence.length === 0) fail(`${item.id} 必须有 evidence`);
        for (const file of item.evidence) {
            if (typeof file !== "string" || !file) fail(`${item.id} evidence 路径非法：${file}`);
            if (!file.startsWith(".") && !fs.existsSync(path.resolve(root, file))) fail(`${item.id} evidence 不存在：${file}`);
        }
        if (item.status === "blocked" && (!Array.isArray(item.blockedBy) || item.blockedBy.length === 0)) fail(`${item.id} blocked 必须有 blockedBy`);
        if (item.status === "deferred" && (!Array.isArray(item.deferredBy) || item.deferredBy.length === 0)) fail(`${item.id} deferred 必须有 deferredBy`);
        if (item.next !== null && item.next !== undefined && !taskId.test(item.next)) fail(`${item.id} next 非法：${item.next}`);
    }
    if (!ids.has(index.currentTask)) fail(`currentTask 不在 tasks：${index.currentTask}`);
    const current = index.tasks.find((item) => item.id === index.currentTask);
    if (current.status !== "in_progress") fail(`currentTask ${index.currentTask} 必须为 in_progress，当前为 ${current.status}`);
    if (index.global?.mainlineMerge !== "forbidden_until_user_action") fail("必须明确禁止自动合并主线");
    return {taskCount: index.tasks.length, statuses: Object.fromEntries([...statuses].map((status) => [status, index.tasks.filter((item) => item.status === status).length]))};
}
try {
    const summary = validate(load());
    console.log(`current-status-audit: ${summary.taskCount} tasks valid`);
    console.log(JSON.stringify(summary.statuses));
} catch (error) { console.error(error.message); process.exitCode = 1; }
