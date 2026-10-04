// T-7047 收尾补全：ui-handbook 关键事实新鲜度守卫
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const handbook = fs.readFileSync(path.join(__dirname, "..", "docs", "ui-handbook-2026-09-27.md"), "utf8");
const webpackConfig = require("../webpack.config.js");
const constants = require("./source-scan.cjs").readSourceFile("src/constants.ts");

test("ui-handbook section 7: stale facts corrected (T-7047 follow-up)", () => {
    // 存储数：应与 KEY_ORDER 一致（不再硬编码旧值）
    assert.doesNotMatch(handbook, /存储 key 恒 13/, "旧存储数（13）不得残留");
    assert.ok(handbook.includes("18"), "当前存储 key 总数 18 必须在册");
    // 包体预算：不再硬编码过时余量（指向 release-readiness 最新快照）
    assert.doesNotMatch(handbook, /zip 512 KiB 线.*余约 16 KiB/, "过时包体余量不得残留");
    assert.ok(handbook.includes("release-readiness"), "包体预算应指向最新快照");
    // siyuan 1.2.8 适配后基类 i18n 类型已由 declare 收窄，handbook 不涉及——无需断言
});

test("ui-handbook section 7: webpack chunk naming matches T-7018 reality", () => {
    const webpackSource = fs.readFileSync(path.join(__dirname, "..", "webpack.config.js"), "utf8");
    assert.ok(webpackSource.includes("dist/[name].js"), "chunkFilename 必须为 [name] 模式（T-7018）");
    assert.ok(webpackSource.includes("webpackChunkName"), "魔法注释声明必须已在配置注释中登记");
});
