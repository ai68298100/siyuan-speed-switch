// 测试辅助：CSS/SCSS 的**块级作用域**断言（非测试文件，不被 run-tests 发现）。
//
// 为什么需要它：本仓大量 CSS 契约门禁写成"选择器 A + 任意距离 + 声明 B"：
//
//     assert.match(css, /strong[\s\S]*?min-width: 0/);
//
// `[\s\S]*?` 会一路向后搜，断言于是退化为「文件里某处有 strong、其后再某处有
// min-width: 0」。`src/index.scss` 里有 104 处 `min-width: 0`，所以从目标规则块
// 里**删掉**该声明，断言照样通过（2026-09-16 注入实证，见 D-395 / T-6280）。
// 这类断言与它声称守护的规则无关，且**剥注释修不了**——同文件他处的声明照样满足它。
//
// 本助手把"文件级共现"升级为"块级包含"：把 SCSS 解析成「展开后的选择器 → 该块
// 自己的声明」映射，再断言"某个选择器匹配的块**自己**声明了某属性"。
//
// 解析范围（按本仓实际用法裁剪，够用即可）：
//   - 选择器按 `,` 拆分（逗号在括号/方括号内不拆，如 `:not(a, b)`）；
//   - SCSS 嵌套展开：子选择器含 `&` 时用父选择器替换，否则以空格拼接；
//   - at-rule 透明：`@media` 包的规则仍按内部选择器记账；嵌在规则内的 at-rule
//     继承父选择器；
//   - 注释先剥（复用 source-scan.cjs 的 stripComments），字符串内的 `{ } ; ,` 不参与切分；
//   - 每条规则记 `atDepth`（被几层 at-rule 包着）。这不是装饰：`@media (max-width: 560px)`
//     里常有一条同名覆盖规则，`declaresIn(..., {topLevel: true})` 才能守住"基础规则里
//     那条声明"——2026-09-16 实测 `.sw-home-store__summary` 的 max-width 删掉后断言仍绿，
//     就是因为手机端覆盖规则替他满足了断言（T-6280）。
//   - 每条规则还记 `atRules`（**外层 at-rule 的前导条件链**，如
//     `["@media (max-width: 560px)"]`）。`atDepth` 只说"被几层包着"、说不出"是哪一条"，
//     于是"窄屏分支里必须有 X"会退让成"任意 at-rule 里都算"：实测
//     `store-box-sizing-contract` 的 `card keeps max width full`——`max-width: 100%` **只存在
//     于 560px 分支**，加 `{topLevel: true}` 会假红，不加则"把它挪去 `@media print`"断言仍通过。
//     `declaresIn(..., {atRule: /max-width:\s*560px/})` 才能把它钉在正确的分支上（T-6283）。
//   - 不做完整 CSS 词法：`@keyframes` 里的 `from`/`to`/百分比会当成普通选择器记账
//     （本仓无相关断言）。若将来要断言 keyframes，本助手需先区分 at-rule 类型。
const {stripComments} = require("./source-scan.cjs");

const WHITESPACE = /\s+/g;

function normalizeSelector(value) {
    return value.replace(WHITESPACE, " ").trim();
}

function splitSelectorList(prelude) {
    const parts = [];
    let current = "";
    let depth = 0;
    let quote = null;
    for (let index = 0; index < prelude.length; index += 1) {
        const char = prelude[index];
        if (quote) {
            current += char;
            if (char === "\\") {
                current += prelude[index + 1] || "";
                index += 1;
            } else if (char === quote) {
                quote = null;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            current += char;
            continue;
        }
        if (char === "(" || char === "[") depth += 1;
        if (char === ")" || char === "]") depth -= 1;
        if (char === "," && depth === 0) {
            parts.push(current);
            current = "";
            continue;
        }
        current += char;
    }
    parts.push(current);
    return parts.map(normalizeSelector).filter(Boolean);
}

function expandSelectors(parents, children) {
    if (parents.length === 0) return children;
    const expanded = [];
    for (const parent of parents) {
        for (const child of children) {
            expanded.push(normalizeSelector(child.includes("&") ? child.split("&").join(parent) : `${parent} ${child}`));
        }
    }
    return expanded;
}

// 解析出扁平的规则列表：{selectors, declarations, atDepth, atRules, startLine, endLine}
//
// 行号说明（`scripts/css-assertion-injector.cjs` 用它定位注入点）：行号按**剥注释后**
// 的文本计数。`//` 行注释会被替换成一个 `\n`，故行号与原文件一致；但 `/* */` 块注释
// 是整段跳过、不补换行，一旦文件里存在块注释，行号就会漂移——所以注入工具在使用前
// 会先检查原文件不含 `/*`，否则直接报错而不是给出可能错位的行号。
function parseRules(cssText) {
    const source = stripComments(cssText);
    const rules = [];
    const stack = [];
    let buffer = "";
    let line = 1;
    const flushDeclaration = () => {
        // 声明归属最近的"真规则"祖先：嵌在规则内的 at-rule（@media 等）是透明容器，
        // 它里面的声明属于外层规则，不能丢。
        for (let index = stack.length - 1; index >= 0; index -= 1) {
            if (stack[index].sameAsParent) continue;
            stack[index].declarationBuffer.push(buffer.trim());
            break;
        }
        buffer = "";
    };
    const currentSelectors = () => {
        const frame = stack[stack.length - 1];
        if (!frame) return [];
        if (frame.sameAsParent) return frame.inherited;
        return frame.selectors;
    };
    // 外层 at-rule 的条件链。数组只在创建时整体赋予、之后只读（靠 concat 生成新数组），
    // 所以同一分支下的多条规则可以安全共享同一份引用。
    const currentAtRules = () => {
        const frame = stack[stack.length - 1];
        return frame ? frame.atRules : [];
    };
    let quote = null;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (char === "\n") line += 1;
        if (quote) {
            buffer += char;
            if (char === "\\") {
                buffer += source[index + 1] || "";
                index += 1;
            } else if (char === quote) {
                quote = null;
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            buffer += char;
            continue;
        }
        if (char === "{") {
            const prelude = buffer.trim();
            buffer = "";
            const parents = currentSelectors();
            const parentDepth = stack.length > 0 ? stack[stack.length - 1].atDepth : 0;
            const parentAtRules = currentAtRules();
            if (prelude.startsWith("@")) {
                // at-rule：透明容器，子规则继承父选择器，但 atDepth +1、条件链追加自身
                stack.push({
                    sameAsParent: true,
                    inherited: parents,
                    atDepth: parentDepth + 1,
                    atRules: parentAtRules.concat(normalizeSelector(prelude)),
                    declarationBuffer: [],
                });
                continue;
            }
            const children = splitSelectorList(prelude);
            stack.push({
                sameAsParent: false,
                selectors: expandSelectors(parents, children),
                atDepth: parentDepth,
                atRules: parentAtRules,
                startLine: line,
                declarationBuffer: [],
            });
            continue;
        }
        if (char === "}") {
            flushDeclaration();
            const frame = stack.pop();
            if (frame && !frame.sameAsParent && frame.selectors.length > 0) {
                rules.push({
                    selectors: frame.selectors,
                    atDepth: frame.atDepth,
                    atRules: frame.atRules,
                    startLine: frame.startLine,
                    endLine: line,
                    declarations: frame.declarationBuffer.filter(Boolean).join("\n"),
                });
            }
            continue;
        }
        if (char === ";") {
            flushDeclaration();
            continue;
        }
        buffer += char;
    }
    return rules;
}

// 规则是否落在断言要求的作用域里。
//   options.topLevel === true  → 只认**没有被任何 at-rule 包着**的规则（基础规则）
//   options.atRule = 字符串/正则 → 外层 at-rule 条件链里必须**至少有一条**与之相符
//     （字符串按子串匹配，正则按 test）。用来把断言钉在具体分支上，例如
//     `{atRule: /max-width:\s*560px/}`。两者可同时给出（既要在某个分支里，又要在该分支的顶层）。
function inScope(rule, options) {
    if (options.topLevel === true && rule.atDepth !== 0) return false;
    if (options.atRule !== undefined && options.atRule !== null) {
        const matcher = options.atRule;
        return rule.atRules.some((item) => (
            matcher instanceof RegExp ? matcher.test(item) : item.includes(String(matcher))
        ));
    }
    return true;
}

// 返回所有"展开后选择器匹配 selector 的块"。selector 可以是字符串（需完全相等，
// 空白归一）或正则（对每个展开后的选择器做 test）。
function findRules(cssText, selector, options = {}) {
    return parseRules(cssText).filter((rule) => {
        if (!inScope(rule, options)) return false;
        return rule.selectors.some((item) => (
            selector instanceof RegExp ? selector.test(item) : item === normalizeSelector(selector)
        ));
    });
}

// 断言用：存在一个选择器匹配 selector 的块，且该块**自身**声明了匹配 declaration 的内容。
function declaresIn(cssText, selector, declaration, options) {
    return findRules(cssText, selector, options).some((rule) => declaration.test(rule.declarations));
}

module.exports = {parseRules, findRules, declaresIn, normalizeSelector, inScope};
