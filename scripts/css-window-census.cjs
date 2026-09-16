// T-6280 迁移工具：统计 CSS 契约文件里"窗口断言"的形态分布。
//
// 背景见 D-395 / D-396：`assert.match(css, /strong[\s\S]*?min-width: 0/)` 这类
// "选择器 + 任意距离 + 声明"的断言退化为"文件里某处有 A、其后再某处有 B"，与它
// 声称守护的规则无关（`src/index.scss` 有 104 处 `min-width: 0`，几乎恒真）。
// 修法是改成块级作用域断言（见 `tests/css-block-scan.cjs`），但**不能机械替换**：
// 不同形态需要不同的正确写法，所以先分类。
//
// 用法：`node scripts/css-window-census.cjs [文件glob子串]`
//   - 不带参数：列出全仓 tests/ 下三类形态的文件级分布（判断还剩多少要迁）。
//   - 带子串（如 `store-box-sizing`）：逐条打印该文件里的窗口断言原文，
//     方便逐条改写（改写后该文件应从 W1 组消失）。
//
// 分类：
//   W1 选择器→声明  —— 右侧是 CSS 声明；正确形态是 declaresIn(..., {topLevel: true})
//   W2 选择器→非声明 —— 比较两个属性、否定断言、url(/javascript 依赖检查等；需人审
//                        （否定式窗口的正确形态是"逐规则检查"：先取声明了 A 的规则，
//                          再断言这些规则的声明不含 B）
//   W3 窄窗口 [^}]* —— 介于两者之间，按块内近似；仍要核对展开后的选择器
//
// 注意：扫描前**必须剥注释**（复用 `tests/source-scan.cjs` 的 stripComments，第八类
// 失效模式）。否则本工具会把"迁移说明注释里引用的旧写法"再数一遍——实测样板迁移后
// 仍报 1 条，就是文件头注释里那句 `assert.match(css, /strong[\s\S]*?min-width: 0/)`。
//
// 口径（T-6280 第三批修正）：**以债清单为准，不以"扫到什么"为准**。
// 工具扫的是全部 `tests/*.test.cjs`，而 `tests/source-scan-coverage.test.cjs` 里的
// `css-window-scope` 条目才是"还剩多少要迁"的权威口径——两者不是一回事：
//   - 债外的命中不计入待迁（例如 `tests/css-block-scan.test.cjs` 里那条**故意的**
//     "病态对照"，以及 W3 里几个用 `[^}]*` 的旧门禁：`[^}]*` 越不过 `}`，退化程度
//     远小于 `[\s\S]*?`，它们不是同一类缺陷）；
//   - 债**内**却扫不到命中的文件必须**点名**——普查只认单行 `assert.match(css, /…/)`，
//     跨行拼接、`new RegExp(...)`、走变量的写法扫不到。不点名的话，这类文件会以
//     "本文件 0 条"的样子静默漂在待办之外（"审计面塌缩"的同一族失效模式）。
// 因此每组都按 债内/债外 分开计数，末尾列出"登记了债但零命中"的文件。
const fs = require("node:fs");
const path = require("node:path");
const {stripComments} = require("../tests/source-scan.cjs");

const root = path.join(__dirname, "..");
const filter = process.argv[2] || "";
const files = fs.readdirSync(path.join(root, "tests"))
    .filter((name) => name.endsWith(".test.cjs") && name.includes(filter))
    .sort();

function debtFiles() {
    const source = fs.readFileSync(path.join(root, "tests", "source-scan-coverage.test.cjs"), "utf8");
    return new Set([...source.matchAll(/\{file:\s*"([^"]+)",\s*reason:\s*"css-window-scope"\}/g)]
        .map((item) => item[1]));
}
const debt = debtFiles();

const buckets = {
    "W1 选择器→声明（块级可修）": [],
    "W2 选择器→非声明（需人工看）": [],
    "W3 窄窗口 [^}]*（近似块内）": [],
};
let total = 0;
const hitFiles = new Set();

for (const name of files) {
    const rel = "tests/" + name;
    const text = stripComments(fs.readFileSync(path.join(root, rel), "utf8"));
    for (const line of text.split(/\r?\n/)) {
        if (!/\[\\s\\S\]\*\?|\[\^}\]\*/.test(line)) continue;
        const match = line.match(/assert\.(?:match|doesNotMatch)\(([A-Za-z0-9_$.]+),\s*\/(.+?)\/([a-z]*)\s*[,)]/);
        if (!match) continue;
        const expression = match[2];
        total += 1;
        hitFiles.add(rel);
        if (filter) {
            console.log(`${rel} :: ${expression}`);
            continue;
        }
        const item = {rel, expression, inDebt: debt.has(rel)};
        if (/\[\^}\]\*/.test(expression)) {
            buckets["W3 窄窗口 [^}]*（近似块内）"].push(item);
        } else if (/\\s\\S\]\*\?/.test(expression) && /:\s|;$/.test(expression)) {
            buckets["W1 选择器→声明（块级可修）"].push(item);
        } else {
            buckets["W2 选择器→非声明（需人工看）"].push(item);
        }
    }
}

if (filter) {
    console.log(`\n${files.length} 个文件，共 ${total} 条窗口断言`);
} else {
    let debtTotal = 0;
    const debtHitFiles = new Set();
    for (const [key, list] of Object.entries(buckets)) {
        const inside = list.filter((item) => item.inDebt);
        const outside = list.filter((item) => !item.inDebt);
        debtTotal += inside.length;
        console.log(`\n## ${key} —— 债内 ${inside.length} 条 / 债外 ${outside.length} 条`);
        const byFile = {};
        for (const item of list) {
            byFile[item.rel] = byFile[item.rel] || {count: 0, inDebt: item.inDebt};
            byFile[item.rel].count += 1;
        }
        for (const [file, info] of Object.entries(byFile).sort((left, right) => right[1].count - left[1].count)) {
            if (info.inDebt) debtHitFiles.add(file);
            console.log(`   ${info.count}\t${file}${info.inDebt ? "" : "  ← 债外，不计入待迁"}`);
        }
    }
    console.log(`\n合计提取到 ${total} 条；其中**债内待迁 ${debtTotal} 条 / ${debtHitFiles.size} 个文件**`
        + `（债清单共 ${debt.size} 个文件）`);
    const silent = [...debt].filter((file) => !hitFiles.has(file)).sort();
    if (silent.length) {
        console.log(`\n！！登记了债但本工具**零命中**的 ${silent.length} 个文件（跨行拼接 / new RegExp / 走变量？必须人工打开看）：`);
        for (const file of silent) console.log(`   ${file}`);
    }
    console.log("\n判据只认 assert.match/doesNotMatch 的**单个单行**正则，跨行拼接或走变量的断言不在统计内。");
}
