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
const fs = require("node:fs");
const path = require("node:path");
const {stripComments} = require("../tests/source-scan.cjs");

const root = path.join(__dirname, "..");
const filter = process.argv[2] || "";
const files = fs.readdirSync(path.join(root, "tests"))
    .filter((name) => name.endsWith(".test.cjs") && name.includes(filter))
    .sort();

const buckets = {
    "W1 选择器→声明（块级可修）": [],
    "W2 选择器→非声明（需人工看）": [],
    "W3 窄窗口 [^}]*（近似块内）": [],
};
let total = 0;

for (const name of files) {
    const rel = "tests/" + name;
    const text = stripComments(fs.readFileSync(path.join(root, rel), "utf8"));
    for (const line of text.split(/\r?\n/)) {
        if (!/\[\\s\\S\]\*\?|\[\^}\]\*/.test(line)) continue;
        const match = line.match(/assert\.(?:match|doesNotMatch)\(([A-Za-z0-9_$.]+),\s*\/(.+?)\/([a-z]*)\s*[,)]/);
        if (!match) continue;
        const expression = match[2];
        total += 1;
        if (filter) {
            console.log(`${rel} :: ${expression}`);
            continue;
        }
        if (/\[\^}\]\*/.test(expression)) {
            buckets["W3 窄窗口 [^}]*（近似块内）"].push(`${rel} :: ${expression}`);
        } else if (/\\s\\S\]\*\?/.test(expression) && /:\s|;$/.test(expression)) {
            buckets["W1 选择器→声明（块级可修）"].push(`${rel} :: ${expression}`);
        } else {
            buckets["W2 选择器→非声明（需人工看）"].push(`${rel} :: ${expression}`);
        }
    }
}

if (filter) {
    console.log(`\n${files.length} 个文件，共 ${total} 条窗口断言`);
} else {
    for (const [key, list] of Object.entries(buckets)) {
        console.log(`\n## ${key} —— ${list.length} 条`);
        const byFile = {};
        for (const item of list) {
            const file = item.split(" :: ")[0];
            byFile[file] = (byFile[file] || 0) + 1;
        }
        for (const [file, count] of Object.entries(byFile).sort((left, right) => right[1] - left[1])) {
            console.log(`   ${count}\t${file}`);
        }
    }
    console.log("\n合计提取到", total, "条（判据只认 assert.match/doesNotMatch 的单个正则，"
        + "跨行拼接或走变量的断言不在统计内，迁移时要再看一遍文件）");
}
