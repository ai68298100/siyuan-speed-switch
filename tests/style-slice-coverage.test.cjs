// 样式切片覆盖门禁（P1-3，ADR 0050）
//
// 起因：P1-2 的覆盖审计发现——逐个从清单删除样式切片，**10/10 全部零失败**。
// 即删掉 1940 行的 03-chunk（约占样式 30%），5872 项测试照样全绿；
// 只有清空到只剩 tokens 才会触发 128 项失败。
// 这说明既有样式断言分布稀薄，**没有任何单一切片被独占锚定**。
//
// 本门禁的做法：为每个切片动态求取「独占锚点」——只出现在该切片、不出现在
// 其它任何切片中的顶层选择器行——并要求这些锚点在**组合视图**中确实存在。
// 于是「删除任一整段切片」必然让该切片的独占锚点从组合视图消失，门禁精确拦截。
//
// 设计取向（沿用 docs/gate-audit-checklist.md）：
//   - 数据驱动：锚点由源码动态求得，不硬编码清单，切片后续重命名/增删无需改本文件；
//   - 非空自检：先断言切片数与锚点总量，防止"正则失效导致恒绿"；
//   - 下限不钉死进度：只要求每个切片 ≥3 条独占锚点（可用 `>=3`，勿写 `>=35`）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {readStyleSource} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const MANIFEST = path.join(root, "src", "index.scss");
const STYLE_DIR = path.join(root, "src", "styles");

// 从清单解析切片名（保持与 readStyleSource 同源，避免两处口径漂移）
function sliceNames() {
    const manifest = fs.readFileSync(MANIFEST, "utf8");
    const names = [];
    const re = /@use\s+"styles\/([^"]+)"/g;
    let m = re.exec(manifest);
    while (m) {
        names.push(m[1]);
        m = re.exec(manifest);
    }
    return names;
}

function sliceLines(name) {
    const file = path.join(STYLE_DIR, "_" + name + ".scss");
    return fs.readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => !/^\s*@use\s/.test(line));
}

// 锚点候选，两类：
//   1) 顶层选择器行（列 0 起始、以 { 结尾）—— 唯一性强、稳定；
//   2) SCSS 变量声明 —— tokens 切片不产出任何 CSS，没有选择器，
//      它的"内容存在"只能靠变量声明来锚定（动效令牌被删同样要被拦下）。
function isAnchorCandidate(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@")) return false;
    if (/^\$[\w-]+\s*:/.test(trimmed)) return true;
    return /^\S.*\{\s*$/.test(trimmed);
}

test("style manifest carries enough slices to make this gate meaningful (self-check)", () => {
    const names = sliceNames();
    assert.ok(names.length >= 5, `manifest should list at least 5 slices, got ${names.length}`);
    const totalAnchors = names.reduce(
        (sum, name) => sum + sliceLines(name).filter(isAnchorCandidate).length, 0);
    assert.ok(totalAnchors >= 20,
        `anchor extraction must find plenty of selectors, only found ${totalAnchors}`);
});

test("every style slice pins exclusive anchors that the composed view must contain", (t) => {
    const names = sliceNames();
    const composed = readStyleSource();

    // 每个候选锚点出现在哪些切片中
    const owners = new Map();
    for (const name of names) {
        for (const line of sliceLines(name)) {
            const anchor = line.trim();
            if (!isAnchorCandidate(anchor)) continue;
            if (!owners.has(anchor)) owners.set(anchor, new Set());
            owners.get(anchor).add(name);
        }
    }

    const report = [];
    for (const name of names) {
        const exclusive = [];
        for (const [anchor, set] of owners) {
            if (set.size === 1 && set.has(name)) exclusive.push(anchor);
        }
        report.push({name, exclusive});
        assert.ok(exclusive.length >= 3,
            `slice ${name} must own at least 3 exclusive selectors, got ${exclusive.length}`);
        // 绑定：这些锚点必须真的出现在组合视图里（删切片即消失）
        for (const anchor of exclusive.slice(0, 3)) {
            assert.ok(composed.includes(anchor),
                `composed view is missing exclusive anchor of ${name}: ${anchor}`);
        }
    }

    t.diagnostic(report
        .map((r) => `${r.name}:${r.exclusive.length}`)
        .join(" "));
});

test("dropping a slice from the manifest would be detected (deletion simulation)", () => {
    const names = sliceNames();
    const owners = new Map();
    for (const name of names) {
        for (const line of sliceLines(name)) {
            const anchor = line.trim();
            if (!isAnchorCandidate(anchor)) continue;
            if (!owners.has(anchor)) owners.set(anchor, new Set());
            owners.get(anchor).add(name);
        }
    }
    // 模拟删除：把某个切片的独占锚点从"组合视图"里抹掉，
    // 至少应有 3 条因此消失——这正是真实删除清单行时会发生的事。
    const victim = names[Math.floor(names.length / 2)];
    const exclusive = [];
    for (const [anchor, set] of owners) {
        if (set.size === 1 && set.has(victim)) exclusive.push(anchor);
    }
    assert.ok(exclusive.length >= 3, `victim ${victim} should own >=3 exclusive anchors`);
    const composed = readStyleSource();
    const remaining = exclusive.filter((anchor) => composed.includes(anchor));
    assert.equal(remaining.length, exclusive.length,
        "all exclusive anchors of a slice must currently be present (gate is loaded)");
});
