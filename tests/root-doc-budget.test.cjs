// 根目录文档体积门禁（P0-2，ADR 0051）
//
// 起因：仓库根目录曾堆积三份治理账本——`TODO.md` 454957 B、`DECISIONS.md` 237575 B、
// `PROGRESS.md` 228393 B，合计 920925 B，占根目录 Markdown 总量约 89%。三者互相覆盖、
// 只增不删，必然过期（历史锚点如"当前 300 KiB 上限"会随时间失真），且 2026-09-17
// 实测已无人回写：当期任务 T-6290+ 全部记在 `docs/dev-plan-*.md` 与 ADR 里。
//
// 仅把它们移到 `docs/archive/` 只是一次性动作；**没有门禁就会复发**。本文件补上拦截：
//   1. 根目录 Markdown 的数量 / 单文件体积 / 合计体积三道上限；
//   2. 与 `docs/archive/README.md` 的归档清单建立双向契约（清单项须在 archive、
//      且根目录不得存在同名文件——防止"复活"）。
//
// 上限取值的依据（不是拍脑袋，也不是钉死当前值）：
//   - 单文件 150 KiB：归档三份中**最小**的一份是 228393 B，现有根目录最大文件是
//     `ROADMAP.md` 37216 B。150 KiB 落在两者之间 => 既能容纳 README 的正常增长
//     （当前最大 34.7 KiB，约 4.3 倍余量），又能在任一归档账本复活回根目录时精确拦截。
//   - 合计 300 KiB：归档后实测 110076 B（约 107 KiB），余量约 2.7 倍；
//     归档前 1031001 B（约 1007 KiB）远超此线 => 三份同时复活必被拦下。
//   - 数量 8：归档后 5 份，留 3 份余量给 README 多语言等正常新增。
//
// 设计取向（沿用 docs/gate-audit-checklist.md）：
//   - 数据驱动：根目录清单与归档清单都由文件系统 / 清单文件动态求得，不硬编码文件名；
//   - 非空自检：先断言"确实扫到了东西"，防止"扫描失效导致恒绿"；
//   - 下限不钉死进度：自检用 `>=3` / `>=40` 这类远低于实际值的下限，不作进度指标。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

// ---- 预算常量 -----------------------------------------------------------
const ROOT_DOC_MAX_COUNT = 8;
const ROOT_DOC_MAX_BYTES_PER_FILE = 150 * 1024;
const ROOT_DOC_MAX_TOTAL_BYTES = 300 * 1024;

// 归档清单的唯一事实源（文档即契约，双向校验）
const ARCHIVE_README = path.join(root, "docs", "archive", "README.md");
const MANIFEST_HEADING = "## 归档清单";

// ADR 下限只用于证明"目录没被清空"，不作进度指标（实际 50+，留 10 份回退空间）
const ADR_SELF_CHECK_MIN = 40;

// ---- 采集 ---------------------------------------------------------------

function rootMarkdown() {
    return fs.readdirSync(root, {withFileTypes: true})
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => ({
            name: entry.name,
            bytes: fs.statSync(path.join(root, entry.name)).size,
        }));
}

// 解析 docs/archive/README.md 的「## 归档清单」小节：
// 只取形如 `- `docs/archive/XXX.md` — 说明` 的列表项，忽略小节内的引用块说明。
function archiveManifest() {
    const lines = fs.readFileSync(ARCHIVE_README, "utf8").split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === MANIFEST_HEADING);
    if (start < 0) return [];
    const entries = [];
    for (let i = start + 1; i < lines.length; i += 1) {
        if (/^##\s/.test(lines[i])) break;
        const match = /^-\s+`([^`]+\.md)`/.exec(lines[i].trim());
        if (match) entries.push(match[1]);
    }
    return entries;
}

test("root markdown stays inside the per-file and count budget", (t) => {
    const docs = rootMarkdown();

    // 非空自检：扫描必须先证明自己扫到了东西，否则上限断言形同虚设
    assert.ok(docs.length >= 3,
        `root should still carry at least 3 markdown files, scanned ${docs.length}`);

    assert.ok(docs.length <= ROOT_DOC_MAX_COUNT,
        `root markdown count ${docs.length} exceeds budget ${ROOT_DOC_MAX_COUNT}: ` +
        docs.map((d) => d.name).join(", "));

    for (const doc of docs) {
        assert.ok(doc.bytes <= ROOT_DOC_MAX_BYTES_PER_FILE,
            `root markdown ${doc.name} is ${doc.bytes} bytes, ` +
            `exceeds per-file budget ${ROOT_DOC_MAX_BYTES_PER_FILE}`);
    }

    t.diagnostic(docs.map((d) => `${d.name}:${d.bytes}`).join(" "));
});

test("root markdown total stays inside the combined budget", (t) => {
    const docs = rootMarkdown();
    const total = docs.reduce((sum, doc) => sum + doc.bytes, 0);
    assert.ok(docs.length >= 3, `scanned only ${docs.length} root markdown files`);
    assert.ok(total <= ROOT_DOC_MAX_TOTAL_BYTES,
        `root markdown total ${total} bytes exceeds budget ${ROOT_DOC_MAX_TOTAL_BYTES}`);
    t.diagnostic(`total=${total} budget=${ROOT_DOC_MAX_TOTAL_BYTES} files=${docs.length}`);
});

test("archive manifest is honored: every archived doc lives in docs/archive, not at root", (t) => {
    assert.ok(fs.existsSync(ARCHIVE_README),
        `archive policy document is missing: ${ARCHIVE_README}`);

    const entries = archiveManifest();
    // 非空自检：清单解析失效会静默变成"零项全绿"
    assert.ok(entries.length >= 3,
        `archive manifest should declare at least 3 docs, parsed ${entries.length}`);

    for (const entry of entries) {
        assert.ok(entry.startsWith("docs/archive/"),
            `manifest entry must point into docs/archive/, got ${entry}`);
        assert.ok(fs.existsSync(path.join(root, entry)),
            `manifest entry does not exist: ${entry}`);
        // 反向：根目录不得残留同名文件（归档后"复活"会同时踩这里和体积门禁）
        const basename = path.basename(entry);
        assert.ok(!fs.existsSync(path.join(root, basename)),
            `${basename} must not exist at the repo root (it is archived)`);
    }

    t.diagnostic(entries.join(" "));
});

test("archiving did not orphan the workflow: replacement fact sources exist", (t) => {
    // 归档的合法性前提是"工作流有新的落点"。三份账本各有替代：
    //   DECISIONS -> docs/adr/；PROGRESS -> docs/acceptance-log.md；TODO -> docs/dev-plan-*.md
    const adrDir = path.join(root, "docs", "adr");
    const adrs = fs.readdirSync(adrDir).filter((name) => /^\d{4}-.+\.md$/.test(name));
    assert.ok(adrs.length >= ADR_SELF_CHECK_MIN,
        `docs/adr should keep at least ${ADR_SELF_CHECK_MIN} ADRs, found ${adrs.length}`);

    const acceptanceLog = path.join(root, "docs", "acceptance-log.md");
    assert.ok(fs.existsSync(acceptanceLog), "docs/acceptance-log.md must exist");
    assert.ok(fs.statSync(acceptanceLog).size >= 100,
        "docs/acceptance-log.md must carry real content, not an empty stub");

    const devPlans = fs.readdirSync(path.join(root, "docs"))
        .filter((name) => /^dev-plan-.+\.md$/.test(name));
    assert.ok(devPlans.length >= 1,
        "at least one docs/dev-plan-*.md must exist as the current task ledger");

    t.diagnostic(`adr=${adrs.length} devPlan=${devPlans.length}`);
});
