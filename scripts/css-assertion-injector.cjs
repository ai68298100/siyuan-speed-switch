// T-6280 迁移工具：对"块级作用域断言"逐条做判别力验证（见 D-396 的"判别力三件套"）。
//
// 为什么需要它：改了 N 条断言就要验 N 条，手写注入脚本每条都要人肉找行号、猜"旧写法是否
// 仍绿"，既慢又容易把猜测当成结论（实测第一批我猜错了 2 条）。本工具把三件事自动化：
//
//   ① 正断言（`assert.ok(declaresIn(css, '<sel>', /<decl>/, {topLevel: true}))`）
//      —— 在目标规则块内找到匹配该声明的**行**并删掉，要求声明随之不再成立；
//   ② 负断言（`assert.equal(declaresIn(css, '<sel>', /<forbidden>/, opts), false)`）
//      —— 由正则合成一个"必须被拦下"的声明值，插进目标规则块，要求声明随之成立；
//   ③ 病态对照 —— 从 `git show HEAD:<测试文件>` 取出**原来**的窗口断言（`A[\s\S]*?B`），
//      在同一份被注入的文件上跑一遍，报告它是否仍然通过（旧写法漏检的直接证据）。
//
// 每次注入都**真的跑一遍测试文件**（`node --test`），要求：目标测试失败、其余失败者都在
// 预期共因集合内；全部结束后按 md5 校验字节级还原。
//
// 用法：
//   node scripts/css-assertion-injector.cjs tests/store-xxx-contract.test.cjs [样式表] [--old=HEAD~1]
//   [--probe='<选择器>@@<声明文本>@@expect=<必须失败项1>|<必须失败项2>']…   插入式探针
//   [--probe='@<选择器>@@-<声明正则>@@expect=<测试名>']…                    删除式探针，作用域任意深度
//   （探针可重复；用于验证工具提取不到的断言：循环式、deepEqual 式、文件级）
//
// 前提与边界：
//   - 测试文件需是本仓的常规写法（`test('<名>', …)` + 单行 `declaresIn(...)` 调用）；
//     跨行拼接、走变量的断言提取不到——工具会把"提取不到的测试"**逐个点名**（见
//     scanTestCoverage），因为"工具报全部通过"最危险的读法就是"整个文件都验过了"。
//     循环式与文件级断言用 `--probe` 验证，不要退回手写注入脚本。
//   - 样式表必须**不含 `/* */` 块注释**：行号依赖"剥注释不改行数"（`//` 行注释会补一个
//     换行，块注释不会）。含块注释时直接报错退出，而不是给出可能错位的行号。
//
// 两条来自实战的教训（都写进输出里，避免重犯）：
//   ① **必须打印注入原文**。首版只打印 `注入=insert 行=N`，我另手写脚本注入
//      `font-weight: normal` 得到 2 条失败，工具对"同一注入"报 0 条，据此误判
//      "工具漏采失败项"。实情是工具注入的是交替分支的第一个样本
//      （`/(?:400|normal)/` → `400`），两次对照实验**不同源**。对照必须同源。
//   ② 负断言的**每一个**交替分支都要注入。`normal` 会连带触发整文件不变式
//      （`weight uses numeric values`）而 `400` 不会——只注第一个分支就看不到这层证据。
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {stripComments} = require("../tests/source-scan.cjs");
const {parseRules, normalizeSelector, inScope} = require("../tests/css-block-scan.cjs");

const ROOT = path.join(__dirname, "..");
const testFile = process.argv[2];
const target = process.argv[3] || "src/index.scss";
// 病态对照要拿"迁移前"的版本比。默认 `HEAD`——正常流程是"改完先验、再提交"，此时 HEAD
// 就是迁移前的版本；文件已提交后再复核，用 `--old=HEAD~1`（首版没这个开关，导致对已提交
// 的文件报"0 条窗口断言可作对照"，看着像"旧写法本来就没漏检"，是假信号）。
const oldRev = (process.argv.find((item) => item.startsWith("--old=")) || "--old=HEAD").slice("--old=".length);
if (!testFile) {
    console.error("用法：node scripts/css-assertion-injector.cjs tests/<文件>.test.cjs [样式表相对路径] [--old=HEAD~1] [--probe='<选择器>@@<声明>@@expect=<测试名>']");
    process.exit(2);
}

const trim = (value) => String(value || "").replace(/\s+/g, " ").trim();
function md5(buffer) {
    return require("node:crypto").createHash("md5").update(buffer).digest("hex");
}

// 从正则源码合成一个"必被该正则匹配"的声明文本（只支持本仓实际用到的形态）。
// 替换顺序很重要：先处理 `\s*`（否则后续的"去掉其余转义"会把 `\s` 拆成 `s`，留下 `s*`
// 直接被守卫判为不可合成——首版就是这个顺序错误，导致三条负断言全被跳过）。
function sampleFromRegex(source) {
    let out = source;
    out = out.replace(/\\s\*/g, " ").replace(/\\s\+/g, " ");
    out = out.replace(/\(\?:([^()]*)\)/g, (whole, body) => body.split("|")[0]);
    // `\d+` 必须先于 `\d` 处理：`\d` → `0` 会留下裸 `0+`，被守卫的 `+` 判为不可合成。
    // 实测 `max-width:\s*\d+px` 就这样整条负断言被判"找不到注入位置"（T-6280 第三批）。
    out = out.replace(/\\d\+/g, "0").replace(/\\d/g, "0").replace(/\\\./g, ".");
    // 零宽断言（`\b` 等）必须**整体删掉**：合成串里留下一个字母 `b` 就不再匹配 `\b`，
    // 注入等于没生效（表现为"注入后断言未翻转"，会被误读成断言不守护任何东西）。
    out = out.replace(/\\[bBAZz]/g, "");
    out = out.replace(/\\([^d.]|$)/g, "$1");
    if (/\\|\[|\]|\?|\*|\+/.test(out)) return null;
    return trim(out);
}

// 展开 `(?:a|b)` 交替，对**每个分支**各合成一个样本（上限 limit 个，去重）。
// 为什么不能只取第一个分支：负断言"不得声明 400/normal"，注 `400` 只翻目标断言，
// 注 `normal` 会连带触发"字重必须是数字"的整文件不变式——后者是更有价值的证据
// （证明不变式真的生效），只注第一个分支就看不到。见文件头教训 ②。
function samplesFromRegex(source, limit = 4) {
    const expanded = [];
    const walk = (text) => {
        if (expanded.length >= limit) return;
        const group = text.match(/\(\?:([^()|]*(?:\|[^()|]*)+)\)/);
        if (!group) {
            expanded.push(text);
            return;
        }
        for (const alternative of group[1].split("|")) {
            walk(text.slice(0, group.index) + alternative + text.slice(group.index + group[0].length));
            if (expanded.length >= limit) return;
        }
    };
    walk(source);
    const samples = [];
    for (const text of expanded) {
        const sample = sampleFromRegex(text);
        if (sample && !samples.includes(sample)) samples.push(sample);
    }
    return samples;
}

// 按顶层逗号切分实参（跨过单引号字符串与正则字面量内部）。
function splitArgs(text) {
    const parts = [];
    let current = "";
    let quote = null;
    let inRegex = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quote) {
            current += char;
            if (char === quote) quote = null;
            continue;
        }
        if (inRegex) {
            current += char;
            if (char === "\\") { current += text[index + 1] || ""; index += 1; continue; }
            if (char === "/") inRegex = false;
            continue;
        }
        if (char === "'" || char === '"') { quote = char; current += char; continue; }
        if (char === "/" && current.trim() === "") { inRegex = true; current += char; continue; }
        if (char === ",") { parts.push(current); current = ""; continue; }
        current += char;
    }
    parts.push(current);
    return parts.map(trim).filter(Boolean);
}

// 从 `declaresIn(` 之后读到配对的闭括号，回传实参文本与收尾位置（跨过引号与正则字面量）。
// 不能用 `/declaresIn\(([^)]*)\)/`：声明正则里常带 `(?:…)`，`[^)]*` 会在正则内部提前收口，
// 于是带 `(?:400|normal)` 的负断言一条都提取不到。
function readArguments(line, from) {
    let depth = 1;
    let quote = null;
    let inRegex = false;
    let index = from;
    for (; index < line.length; index += 1) {
        const char = line[index];
        if (quote) {
            if (char === "\\") index += 1;
            else if (char === quote) quote = null;
            continue;
        }
        if (inRegex) {
            if (char === "\\") index += 1;
            else if (char === "/") inRegex = false;
            continue;
        }
        if (char === "'" || char === '"') { quote = char; continue; }
        if (char === "/") { inRegex = true; continue; }
        if (char === "(") depth += 1;
        else if (char === ")") { depth -= 1; if (depth === 0) break; }
    }
    return {text: line.slice(from, index), end: index};
}

// 从测试文件里提取 (测试名, 选择器, 声明正则, 是否负断言, 作用域)。
// 形如：assert.ok(declaresIn(css, '<sel>', /<re>/, base))
//       assert.equal(declaresIn(css, '<sel>', /<re>/, base), false, '…')
//       assert.ok(declaresIn(css, '<sel>', /<re>/, {atRule: /560px/}))
// 注意 `, false` 在**闭括号之后**——首版把它当作"要捕获的实参"，于是负断言被当成正断言，
// 报"找不到注入位置"（负断言需要的是"插入一条被禁声明"，不是"删掉一条声明"）。
function extractAssertions(source) {
    // 允许 `assert.ok(` 与 `declaresIn(` **跨行**。首版逐行要求两者同行，于是自己刚写的
    // 换行版断言提取不到（覆盖账立刻报"9 处调用只提取到 8 条"——那道自检正是为此存在）。
    // 折行只影响提取，不改变行数语义（提取不使用行号）；**不能反过来要求作者为迁就工具而
    // 把断言压成一行**，那是让工具绑架代码风格。
    const stripped = stripComments(source).replace(/assert\.(ok|equal)\(\s*\n\s*/g, (whole, kind) => `assert.${kind}(`);
    // 迁移后的文件常把作用域写成共享常量：`const base = {topLevel: true};` 然后传 `base`。
    // 不解析这层间接，工具就会以为"没带作用域"，于是挑到媒体查询里的同名覆盖规则去注入
    // （表现为"注入后断言未翻转"——与"断言不守护任何东西"是两回事，极易误判）。
    const scopeVars = new Set();
    for (const match of stripped.matchAll(/const\s+([A-Za-z0-9_$]+)\s*=\s*\{([^}]*)\}/g)) {
        if (/topLevel\s*:\s*true/.test(match[2])) scopeVars.add(match[1]);
    }
    const assertions = [];
    let current = null;
    for (const line of stripped.split("\n")) {
        const named = line.match(/test\(\s*'([^']+)'/);
        if (named) current = named[1];
        const marker = line.match(/assert\.(ok|equal)\(\s*declaresIn\(/);
        if (!marker || !current) continue;
        const {text, end} = readArguments(line, marker.index + marker[0].length);
        const rest = line.slice(end + 1);
        const args = splitArgs(text);
        const selector = args[1] && args[1].match(/^'([^']*)'$/);
        const regex = args[2] && args[2].match(/^\/([\s\S]*)\/([a-z]*)$/);
        if (!selector || !regex) continue;
        const scopeArg = trim(args[3] || "");
        // `{atRule: /…/}` 也要认出来：否则工具会对"只在某个分支里"的断言按"任意深度"挑规则，
        // 挑错分支时的症状（注入后断言未翻转）与"断言不守护任何东西"极像，会误导判断。
        const atRule = scopeArg.match(/atRule:\s*\/((?:[^/\\]|\\.)+)\//);
        assertions.push({
            name: current,
            selector: selector[1],
            declSource: regex[1],
            negative: marker[1] === "equal" && /^\s*,\s*false\b/.test(rest),
            topLevel: /topLevel/.test(scopeArg) || scopeVars.has(scopeArg),
            // 注意必须转成 RegExp：`inScope` 对**字符串**参数走的是子串匹配，直接传正则源码
            // （`"max-width:\\s*560px"`）会永远匹配不上，症状是"跳过：找不到注入位置"——
            // 不是假绿，但会让人以为断言写错了位置。
            atRule: atRule ? new RegExp(atRule[1]) : null,
        });
    }
    return assertions;
}

// 测试文件的"覆盖账"：所有 `test(...)` 名 + 源码里 `declaresIn(` 的出现次数。
// 为什么要它：本工具只认 `assert.ok(declaresIn(...))` / `assert.equal(declaresIn(...), …)`
// 这一种形态，循环式断言（`for (const rule of weightRules) assert.doesNotMatch(...)`）与
// 文件级断言（`assert.ok(css.includes(...))`）**提取不到**。不点名的话，"工具报全部通过"
// 最自然的读法就是"整个文件都验过了"——这正是本仓反复强调的"断言集合为空时恒真"的同一族
// 失效模式（空集合恒真 / 未覆盖 ≠ 通过）。所以分两档：
//   - `declaresIn(` 出现次数 > 提取条数 → 有块级断言没被解析出来，是**工具的问题**；
//   - 其余未覆盖测试 → 信息，逐个点名，需人工另验。
function scanTestCoverage(source) {
    const stripped = stripComments(source);
    const names = [...stripped.matchAll(/test\(\s*'([^']+)'/g)].map((item) => item[1]);
    const callCount = (stripped.match(/declaresIn\(/g) || []).length;
    return {names, callCount};
}

// 从对照版本（默认 HEAD）里取出窗口断言（`A[\s\S]*?B`），供病态对照使用。
function headWindowPatterns() {
    let source = "";
    try {
        source = execFileSync("git", ["show", oldRev + ":" + testFile.replace(/\\/g, "/")],
            {cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024});
    } catch {
        return [];
    }
    const patterns = [];
    for (const match of stripComments(source).matchAll(/assert\.(match|doesNotMatch)\(css,\s*\/((?:[^/\\]|\\.)+)\//g)) {
        if (match[2].includes("[\\s\\S]*?")) patterns.push({kind: match[1], source: match[2]});
    }
    return patterns;
}

function literalOf(source) {
    return trim(source.replace(/\\s\*/g, " ").replace(/\\([^d.]|$)/g, "$1").replace(/\[\\s\\S\]\*\?/g, "|"));
}

function runTest() {
    const proc = require("node:child_process").spawnSync(
        "node", ["--test", testFile.replace(/\\/g, "/")],
        {cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024},
    );
    const output = (proc.stdout || "") + (proc.stderr || "");
    return [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map((item) => item[1].trim());
}

// 应用一次注入 → 真跑测试 → 无论成败都还原，返回失败项名称与注入后的文本。
// 抽出来的原因：断言验证与探针验证要共享"注入—真跑—还原"这一整段，两处各写一份
// 迟早会漂移（而漂移的正是"到底注了什么"这件最容易出错的事）。
//
// 入参 `rawLines` **必须是原始行**：注入要"外科式"——写回的文件除注入那一行外必须逐字节
// 等于原文件。首版图省事把剥注释后的行同时用于"定位"和"写回"，等于每次注入都顺手删掉
// 全文件的 `//` 注释，差别不止注入那一处（混淆实验）——虽然本仓契约测试自己也会剥注释、
// 所以当时没有观测到偏差，但那只是"恰好没撞上"，不是"安全"。
// 定位用剥注释的行（防注释里的同名字样被当成注入点），写回用原始行，两者行号一致
// （`//` 行注释被换成一个 `\n`，块注释已在入口处被拒绝）。
function mutate(rawLines, injection) {
    // 插入时沿用块内下一行的缩进，让注入看起来像同一个人写的代码（注入文本本身也要可读）
    const indent = injection.mode === "insert"
        ? ((rawLines[injection.index + 1] || "").match(/^\s*/) || [""])[0]
        : "";
    return injection.mode === "delete"
        ? rawLines.slice(0, injection.index).concat(rawLines.slice(injection.index + 1))
        : rawLines.slice(0, injection.index + 1)
            .concat([indent + injection.text + ";"])
            .concat(rawLines.slice(injection.index + 1));
}

function applyAndRun(rawLines, injection, original) {
    const text = mutate(rawLines, injection).join("\n");
    fs.writeFileSync(path.join(ROOT, target), text);
    let failed = [];
    try {
        failed = runTest();
    } finally {
        fs.writeFileSync(path.join(ROOT, target), original);
    }
    return {failed, text};
}


function main() {
    const original = fs.readFileSync(path.join(ROOT, target));
    const originalMd5 = md5(original);
    const raw = original.toString("utf8");
    if (raw.includes("/*")) {
        console.error(`！！${target} 含 /* */ 块注释，行号会漂移——本工具拒绝给出可能错位的结果`);
        process.exit(2);
    }
    // 两份行：`scanLines`（剥注释）只用于**定位**注入点，`rawLines`（原始）用于**写回**。
    // 定位若用原始行，注释里写下 `font-weight: 650` 就会被当成注入点删掉——"删了目标声明"
    // 其实没删，工具反过来报"断言不守护任何东西"（假警报）。写回若用剥离后的行，差别就
    // 不止注入那一处（混淆实验）。两者行号一致：`//` 行注释被换成一个 `\n`，`/* */` 已在入口拒绝。
    const rawLines = raw.split("\n");
    const scanLines = stripComments(raw).split("\n");
    // 显式守住"两份行等长"这个前提，而不是当作理所当然：定位给的是 scanLines 的下标，
    // 写回用的是 rawLines 的同一下标；一旦不等长（例如文件末尾有一行没有换行的 `//` 注释，
    // stripComments 会补一个 `\n`），行号就会静默错位到别的规则上。
    if (rawLines.length !== scanLines.length) {
        console.error(`！！${target} 剥注释后行数变了（${rawLines.length} → ${scanLines.length}），定位与写回的行号会错位`);
        process.exit(2);
    }
    const testSource = fs.readFileSync(path.join(ROOT, testFile), "utf8");
    const assertions = extractAssertions(testSource);
    const coverage = scanTestCoverage(testSource);
    const windowPatterns = headWindowPatterns();
    const problems = [];

    console.log(`${testFile}：提取到 ${assertions.length} 条块级断言（对照版本里有 ${windowPatterns.length} 条窗口断言可作对照）`);
    console.log(`样式表 ${target}，原 md5 ${originalMd5}\n`);

    const named = new Set(assertions.map((item) => item.name));
    const uncovered = coverage.names.filter((name) => !named.has(name));
    if (coverage.callCount > assertions.length) {
        problems.push(`源码里有 ${coverage.callCount} 处 declaresIn( 调用，只提取到 ${assertions.length} 条——有块级断言没被解析出来（跨行/走变量？）`);
    }
    if (uncovered.length) {
        console.log(`本工具不覆盖的测试（${uncovered.length} 条，需人工另验）：`);
        for (const name of uncovered) console.log(`  · ${name}`);
        console.log("");
    }

    for (const assertion of assertions) {
        const re = new RegExp(assertion.declSource);
        const rules = parseRules(raw).filter((rule) => {
            if (!inScope(rule, {topLevel: assertion.topLevel, atRule: assertion.atRule})) return false;
            return rule.selectors.some((item) => item === normalizeSelector(assertion.selector) || re.test(item));
        });
        const injections = [];
        if (assertion.negative) {
            // 每个交替分支各注一次：`(?:400|normal)` 的 `normal` 会连带触发整文件不变式，
            // 只注第一个分支就把这层证据丢了（见文件头教训 ②）。
            for (const value of samplesFromRegex(assertion.declSource)) {
                const rule = rules.find((item) => !re.test(item.declarations));
                if (rule) injections.push({mode: "insert", index: rule.startLine - 1, text: value, sample: value});
            }
        } else {
            for (const rule of rules) {
                for (let index = rule.startLine - 1; index < rule.endLine; index += 1) {
                    if (re.test(scanLines[index])) { injections.push({mode: "delete", index, sample: null}); break; }
                }
                if (injections.length) break;
            }
        }
        if (!injections.length) {
            problems.push(`${assertion.name}：找不到可注入的位置（选择器或声明未解析到）`);
            console.log(`${assertion.name.padEnd(34)} 跳过：找不到注入位置`);
            continue;
        }
        for (const injection of injections) {
            const label = assertion.name + (injection.sample ? ` [${injection.sample}]` : "");
            // 文本级先自检：正断言必须翻成"不成立"，负断言必须翻成"成立"（不跑测试，只解析）
            const after = parseRules(mutate(rawLines, injection).join("\n")).filter((rule) => {
                if (!inScope(rule, {topLevel: assertion.topLevel, atRule: assertion.atRule})) return false;
                return rule.selectors.some((item) => item === normalizeSelector(assertion.selector));
            });
            const holds = after.some((rule) => re.test(rule.declarations));
            if (holds === !assertion.negative) {
                problems.push(`${label}：注入后断言未翻转（行 ${injection.index + 1}）`);
            }
            const {failed, text} = applyAndRun(rawLines, injection, original);
            if (!failed.includes(assertion.name)) {
                problems.push(`${label}：真跑测试后该断言仍通过——它不守护任何东西`);
            }
            const extra = failed.filter((item) => item !== assertion.name);
            // 旧写法对照：只有"头部与本次选择器相容"且"尾部与本次声明相容"的窗口断言才算对照。
            // 只比尾部会把"另一个元素的同名断言"也算进来，于是 `some(...)` 一律报"仍绿"——
            // 实测就吃掉了"这两条其实不漏检"的结论（含逗号的锚点版本 vs 不含逗号的版本）。
            const literal = literalOf(re.source);
            const head = normalizeSelector(assertion.selector).replace(/^[.#]/, "");
            const paired = windowPatterns.filter((item) => {
                const [rawHead] = item.source.split("[\\s\\S]*?");
                const tail = literalOf(item.source.split("[\\s\\S]*?").pop() || "");
                if (!tail || !(tail.includes(literal) || literal.includes(tail))) return false;
                const headLiteral = literalOf(rawHead || "").replace(/,$/, "").replace(/^[.#]/, "").trim();
                if (!headLiteral) return false;
                return head.includes(headLiteral) || headLiteral.includes(head);
            });
            const green = paired.some((item) => new RegExp(item.source).test(text));
            console.log(`${label.padEnd(44)} 注入=${injection.mode.padEnd(6)} 行=${String(injection.index + 1).padStart(5)} `
                + `目标失败=${failed.includes(assertion.name)} 其他失败=${extra.length ? extra.join(",") : "无"} `
                + `旧写法仍绿=${paired.length ? green : "无对照"}`);
        }
    }

    // 探针（可重复，用于验证工具提取不到的断言——循环式、`deepEqual` 式、文件级）：
    //   --probe='<选择器>@@<声明文本>[@@expect=<必须失败项1>|<必须失败项2>]'      插入一条声明
    //   --probe='<选择器>@@-<声明正则>[@@expect=…]'                              删掉块内匹配的声明行
    //   --probe='@<选择器>@@…'                                                  作用域放宽到任意深度
    //
    // 存在理由：本工具的提取只覆盖 `assert.ok/equal(declaresIn(...))` 这一种形态，而本仓
    // 还有**循环式**断言（`for (const rule of borderRules) assert.doesNotMatch(rule.declarations, /url\(/)`）
    // 与 `deepEqual` 式断言，提取不到——它们此前只能靠手写脚本注入，而手写注入正是"两次对照实验
    // 不同源"那类误判的温床（见文件头教训 ①）。探针把它们纳入同一条可复现、受 md5 保护的通道：
    // 注入内容写在命令行上、由工具打印、每次真跑测试并列出实际失败项；带 `expect` 时逐个核对
    // "必须失败的测试真的失败了"（这是"断言真的守护了东西"的直接证据）。
    //
    // 前导 `@` 的必要性：`card keeps max width full` 这类断言**刻意**不要求 topLevel（声明只
    // 存在于窄屏分支），插入/删除都必须落到 at-rule 内部那条规则上；而其余绝大多数断言恰恰相反
    // （必须落到基础规则，否则会被同名覆盖规则替身满足）。两种作用域都要能表达，所以显式写出来。
    const probes = process.argv.filter((item) => item.startsWith("--probe=")).map((item) => item.slice("--probe=".length));
    if (probes.length) console.log("");
    for (const probe of probes) {
        const [selectorField, valueField, expectation] = probe.split("@@");
        const anyDepth = selectorField.startsWith("@");
        const selector = anyDepth ? selectorField.slice(1) : selectorField;
        const expect = (expectation || "").replace(/^expect=/, "").split("|").map(trim).filter(Boolean);
        const rules = parseRules(raw).filter((rule) => {
            if (!anyDepth && rule.atDepth !== 0) return false;
            return rule.selectors.some((item) => item === normalizeSelector(selector));
        });
        let injection = null;
        let line = 0;
        if (valueField.startsWith("-")) {
            const re = new RegExp(valueField.slice(1));
            // 在匹配到的规则里找**第一条真有该声明的**：不能用 `rules[0]`——同一个选择器常有
            // 多条规则（基础 + 若干 at-rule 覆盖），首条未必是承载该声明的那条（实测
            // `@.sw-home-store__card` 的首条是 depth=1 的另一段覆盖规则）。
            for (const rule of rules) {
                for (let index = rule.startLine - 1; index < rule.endLine; index += 1) {
                    if (re.test(scanLines[index])) { injection = {mode: "delete", index}; line = index + 1; break; }
                }
                if (injection) break;
            }
        } else if (rules[0]) {
            injection = {mode: "insert", index: rules[0].startLine - 1, text: valueField};
            line = rules[0].startLine;
        }
        if (!injection) {
            problems.push(`探针 ${probe}：找不到可注入的位置`);
            console.log(`探针 ${probe} 跳过：找不到注入位置`);
            continue;
        }
        const {failed} = applyAndRun(rawLines, injection, original);
        const missing = expect.filter((name) => !failed.includes(name));
        if (missing.length) problems.push(`探针 ${probe}：期望失败但没有失败 → ${missing.join(",")}`);
        console.log(`探针 ${probe} 行=${line} 失败项=${failed.length ? failed.join(",") : "无"}`
            + (expect.length ? ` 期望失败=${expect.join(",")} 全部命中=${missing.length === 0}` : ""));
    }

    const restoredMd5 = md5(fs.readFileSync(path.join(ROOT, target)));
    console.log(`\nmd5 原始=${originalMd5} 还原后=${restoredMd5} 字节级一致=${restoredMd5 === originalMd5}`);
    if (restoredMd5 !== originalMd5) problems.push("还原失败：md5 不一致");
    if (problems.length) {
        console.log("\n" + problems.map((item) => "!! " + item).join("\n"));
        process.exit(1);
    }
    console.log(`提取到的 ${assertions.length} 条全部通过：目标断言精确失败、其余失败者已列出（需人工确认是否预期共因）`
        + (uncovered.length ? `；另有 ${uncovered.length} 条测试本工具不覆盖，必须人工另验` : ""));
}

main();
