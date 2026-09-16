// 门禁：源码扫描的"剥注释"覆盖率（D-395，第八类失效模式的机制级防线）。
//
// 背景：本仓大量契约门禁用"源码里必须出现某段文本"来证明接线。若扫描的是原始
// 文本，则把调用注释掉、或在注释里写下同样的调用，断言照样通过——门禁变成假绿。
// 2026-09-16 实测到 3 处此类断言（`tests/home-store-contract.test.cjs` 的
// availabilityFilter / card.dataset.added / PREVIEW_KINDS），三句文本都只存在于
// `src/home-store-ui.ts` 的行尾注释里，其中两句还被两个 `void x;` 空转局部变量
// "培育"着——即门禁读的是注释，而那些注释是为了过门禁而留的。
//
// 本门禁不修存量，只把两件必须自动化的事钉住：
//   1. 登记：仍以原始方式读 src 源码的文件必须在 SOURCE_SCAN_DEBT 里显式列出并
//      给出理由标签；
//   2. 冻结：登记清单必须与实测集合**恰好相等**——新增裸读立即失败（逼你改走
//      `readSourceText` 或显式登记并说明理由），债还清后忘记删条目同样立即失败
//      （清单不能腐烂）。
//
// 判据（刻意保守）：`fs.readFileSync(path.join(..., 'src', ...), 'utf8')` 且最后一个
// 字面量不是 `.json`。走 `readSourceText(...)` 的读取不会被计入。已知盲区：路径来自
// 变量（如 `fs.readFileSync(srcPath, ...)`）时无法判定，故本门禁的目标是"防止悄悄
// 新增裸读"，不是"证明全仓已剥注释"。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {stripComments} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const RAW_READ = /fs\.readFileSync\(\s*path\.join\(([^()]*)\)[^)]*\)/g;
const LITERAL = /["']([^"']*)["']/g;

// 统计"以原始方式读 src 源码"的读取点。
function rawSourceReads(text) {
    const hits = [];
    for (const match of text.matchAll(new RegExp(RAW_READ.source, "g"))) {
        const args = match[1];
        if (!/["']src["']/.test(args)) continue;
        const literals = [...args.matchAll(new RegExp(LITERAL.source, "g"))].map((m) => m[1]);
        const last = literals[literals.length - 1] || "";
        if (last.endsWith(".json")) continue;
        hits.push(match[0]);
    }
    return hits;
}

// 理由词汇表：每个标签都要被用到，且说明不得为空（避免"字段是装饰"）。
const DEBT_REASONS = {
    "css-window-scope":
        "文件里的断言是无界窗口（A[\\s\\S]*?B），弱点是作用域而非注释：剥注释后依然"
        + "会被同文件他处的 B 满足（实测从目标规则删掉声明后断言仍通过）。修法是 CSS "
        + "块级作用域断言助手（T-6277），不是剥注释。",
    "doc-comment-contract":
        "断言的对象就是注释本身（JSDoc 声明的不变量 / 声明行尾的 key 说明），必须读原始文本。",
    "json-data":
        "读的是 src/i18n/*.json：JSON 无注释语义，剥注释无收益。",
    "smoke-harness":
        "smoke 脚手架自带归一函数（tests/mobile-card-smoke.cjs 的 readSource），迁移需连同 "
        + "`pnpm test:smoke` 一起复跑（T-6278）。",
};

const SOURCE_SCAN_DEBT = [
    {file: "tests/external-widget-availability-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-a11y-navigation.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-actions-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-card-navigation.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-filter-state-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-focus-navigation-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-focus-recovery-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-forced-colors.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-group-semantics-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-mobile-external-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-mobile-layout-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-motion-accessibility.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-pending-card-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-performance-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-preview-context-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-preview-disclosure-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-print-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-render-stability.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-render-state-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-rerender-focus-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-scroll-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-search-interaction.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-stacking-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-text-wrap-pretty.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-ui-polish.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-will-change-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/store-word-break-contract.test.cjs", reason: "css-window-scope"},
    {file: "tests/sync-panel-stability.test.cjs", reason: "css-window-scope"},
    {file: "tests/doc-search-pagination-contract.test.cjs", reason: "doc-comment-contract"},
    {file: "tests/storage-key-audit.test.cjs", reason: "doc-comment-contract"},
    {file: "tests/storage-migration.test.cjs", reason: "doc-comment-contract"},
    {file: "tests/shipped-i18n-parity.test.cjs", reason: "json-data"},
    {file: "tests/mobile-card-smoke.cjs", reason: "smoke-harness"},
];

// 每个理由标签的**内容判据**（T-6282，"白名单值必须被断言"的第三次自我适用）。
// 背景：`DEBT_REASONS` 只校验"标签取自词汇表 + 说明 ≥20 字 + 不留死标签"，从不校验
// **标签与文件内容是否相符**——实测 `kernel-endpoint-guard.test.cjs` 贴着
// `css-window-scope`（描述写着"文件里的断言是无界窗口"），实际一条窗口断言都没有
// （它那处 `[\s\S]*?` 是 `source.match(...)` 的区间截取，不在 assert 内），真债是读
// 原始文本。判据是**必要条件**而非充分条件：它拦"标签与内容明显不符"，不证明理由
// 完全成立。判据作用在**剥注释后**的文本上——否则任何文件头注释里引用一句
// `[\s\S]*?` 就能让标签蒙混过关（第八类失效模式的又一次自我适用）。
const DEBT_REASON_CHECKS = {
    // "断言是无界窗口"：至少存在一行 assert 同时带 `[\s\S]*?` 或 `[^}]*` 窗口模式
    "css-window-scope": (text) => text.split("\n").some((line) => (
        /assert\./.test(line) && /\[\\s\\S\]\*\\?|\[\^}\]\*/.test(line)
    )),
    // "断言的对象就是注释本身"：持有同一源文件的原始/剥离双视图（Raw 孪生或显式
    // stripComments），或断言needle里带转义的注释标记 `\/\/`
    "doc-comment-contract": (text) => (
        text.includes("stripComments(") || /[A-Za-z]Raw\b/.test(text) || text.includes("\\/\\/")
    ),
    // "读的是 JSON（无注释语义）"：文件确实在解析 JSON
    "json-data": (text) => text.includes("JSON.parse("),
    // "脚手架自带归一函数"：文件自建了带 CRLF 归一的读取，而不是走 readSourceText
    "smoke-harness": (text) => text.includes("fs.readFileSync") && text.includes("replace(/\\r\\n/g"),
};

function discoverRawReaderFiles() {
    // 排除两个文件：助手本体（它只是读写函数），以及本门禁自身——它的自测夹具里
    // 就写着 `fs.readFileSync(path.join(r, 'src', 'a.ts'), 'utf8')` 这句模式串，
    // 不排除就会把自己判成裸读（⑥ 自指）。
    const SELF = new Set(["source-scan.cjs", "source-scan-coverage.test.cjs"]);
    const found = [];
    for (const dir of ["tests", "tests/host"]) {
        for (const name of fs.readdirSync(path.join(root, dir))) {
            if (!name.endsWith(".cjs") || SELF.has(name)) continue;
            const rel = dir + "/" + name;
            const text = fs.readFileSync(path.join(root, dir, name), "utf8");
            if (rawSourceReads(text).length > 0) found.push(rel);
        }
    }
    return found.sort();
}

test("undetected-vs-registered: the debt list is exactly the measured set", () => {
    const found = discoverRawReaderFiles();
    // 非空自检：审计面塌缩（例如判据写坏、目录改名）时必须先失败，
    // 否则下面两个集合都是空的、断言恒真。下限按"防塌缩"校准（T-6280 第八批）：
    // T-6278 时代的 `>= 35` 是按当时 43 条债钉的，随迁移推进必然误伤正常进展——
    // 精确相等已由下面的集合比对保证，这里只拦"判据坏掉 → 归零"。
    assert.ok(found.length >= 3, `audit surface collapsed: only ${found.length} files matched`);
    const expected = SOURCE_SCAN_DEBT.map((entry) => entry.file).sort();
    const unexpected = found.filter((file) => !expected.includes(file));
    const stale = expected.filter((file) => !found.includes(file));
    assert.deepEqual(
        {unexpected, stale},
        {unexpected: [], stale: []},
        "新增裸读要改走 readSourceText 或显式登记；迁移完成后要删掉对应债条目",
    );
});

test("every debt entry carries a used, non-empty reason from the fixed vocabulary", () => {
    assert.ok(SOURCE_SCAN_DEBT.length >= 3, "debt list shrank unexpectedly without reason tags being pruned");
    const seen = new Set();
    for (const entry of SOURCE_SCAN_DEBT) {
        assert.ok(DEBT_REASONS[entry.reason], `unknown reason tag: ${entry.reason}`);
        assert.ok(!seen.has(entry.file), `duplicate debt entry: ${entry.file}`);
        seen.add(entry.file);
        assert.ok(fs.existsSync(path.join(root, entry.file)), `debt entry points at a missing file: ${entry.file}`);
    }
    // 反向断言：词汇表里不留死标签（登记了就得用，用完就得删）
    for (const [tag, description] of Object.entries(DEBT_REASONS)) {
        assert.ok(SOURCE_SCAN_DEBT.some((entry) => entry.reason === tag), `unused reason tag: ${tag}`);
        assert.ok(description.length >= 20, `reason tag ${tag} needs a real explanation`);
    }
});

test("every debt entry's reason tag matches the content it describes (T-6282)", () => {
    // 判据自身必须有非空审计面：词汇表里每个标签都要有判据、每条债都要被真正检查过，
    // 否则"标签与内容不符"永远检测不到（判据沦为装饰 = 本门禁要防的形态本身）。
    assert.deepEqual(
        Object.keys(DEBT_REASON_CHECKS).sort(),
        Object.keys(DEBT_REASONS).sort(),
        "每个理由标签都必须配有内容判据，且不留无判据的死标签",
    );
    // 下限按"防塌缩"校准（T-6280 第八批）：T-6282 时代的 `>= 35` 随迁移推进必然误伤，
    // 只拦"债清单被清空/判据全失"的归零形态。
    assert.ok(SOURCE_SCAN_DEBT.length >= 3, `audit surface collapsed: only ${SOURCE_SCAN_DEBT.length} debt entries`);
    // 判据的**非平凡自检**：每个判据必须至少拒绝一个真实形态的反例，否则把判据改成
    // 恒真（`() => true`）不会被发现——判据沦为装饰，正是本门禁要防的形态本身。
    const DEBT_REASON_COUNTEREXAMPLES = {
        // 有窗口模式但**不在 assert 内**（正是 kernel-endpoint-guard 当年的形态）
        "css-window-scope": 'const x = source.match(/a[\\s\\S]*?b/);',
        // 读原文断**代码**（无注释客体、无双视图）
        "doc-comment-contract": 'assert.ok(source.includes("case x:"));',
        // 读代码但不解析 JSON
        "json-data": 'const t = fs.readFileSync(path.join(root, "src", "index.ts"), "utf8");',
        // 走共享助手，没有自建归一
        "smoke-harness": 'const t = readSourceText(path.join(root, "src", "index.ts"));',
    };
    for (const [tag, probe] of Object.entries(DEBT_REASON_COUNTEREXAMPLES)) {
        assert.equal(
            DEBT_REASON_CHECKS[tag](stripComments(probe)), false,
            `reason tag ${tag} 的判据失去了判别力（对反例样本也放行，已是恒真）`,
        );
    }
    const mismatched = [];
    for (const entry of SOURCE_SCAN_DEBT) {
        const text = stripComments(fs.readFileSync(path.join(root, entry.file), "utf8"));
        if (!DEBT_REASON_CHECKS[entry.reason](text)) mismatched.push(`${entry.file} (${entry.reason})`);
    }
    assert.deepEqual(mismatched, [],
        "理由标签与文件内容不符——标签描述的事实（见 DEBT_REASON_CHECKS）在该文件里不存在；"
        + "应改走 readSourceText / 重新归类，而不是保留一个名不副实的标签",
    );
});

test("the detector itself is not vacuous", () => {
    assert.equal(rawSourceReads("fs.readFileSync(path.join(r, 'src', 'a.ts'), 'utf8')").length, 1);
    assert.equal(rawSourceReads("readSourceText(path.join(r, 'src', 'a.ts'))").length, 0);
    assert.equal(rawSourceReads("fs.readFileSync(path.join(r, 'src', 'i18n', 'zh-CN.json'), 'utf8')").length, 0);
    assert.equal(rawSourceReads("fs.readFileSync(path.join(r, 'docs', 'x.md'), 'utf8')").length, 0);
});
