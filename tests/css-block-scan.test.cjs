// css-block-scan 辅助的自身测试：块级作用域断言必须真的"看块"，而不是"看文件里有没有"。
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {parseRules, findRules, declaresIn, normalizeSelector} = require("./css-block-scan.cjs");
const {readSourceText, readStyleSource} = require("./source-scan.cjs");

const SAMPLE = `
.alpha {
    min-width: 0;
    color: red;
}
.beta {
    display: block;

    strong {
        min-width: 0;
    }
    > div { min-width: 0; }
    &:hover { color: blue; }
    &.is-active, .gamma { min-width: 0; }
}
`;

test("top-level rule declarations are attributed to that rule", () => {
    assert.equal(declaresIn(SAMPLE, ".alpha", /min-width: 0/), true);
    assert.equal(declaresIn(SAMPLE, ".alpha", /color: red/), true);
    assert.equal(declaresIn(SAMPLE, ".beta", /min-width: 0/), false, "beta 自身没有该声明");
});

test("nested selectors expand to parent + child", () => {
    assert.deepEqual(
        findRules(SAMPLE, ".beta strong").map((rule) => rule.selectors),
        [[".beta strong"]],
    );
    assert.equal(declaresIn(SAMPLE, ".beta strong", /min-width: 0/), true);
    assert.equal(declaresIn(SAMPLE, ".beta > div", /min-width: 0/), true);
});

test("ampersand is replaced by the parent selector", () => {
    assert.equal(declaresIn(SAMPLE, ".beta:hover", /color: blue/), true);
    assert.equal(declaresIn(SAMPLE, ".beta.is-active", /min-width: 0/), true);
});

test("comma lists expand for every parent-child pair", () => {
    const selectors = parseRules(SAMPLE).flatMap((rule) => rule.selectors);
    // 注意 SCSS 语义：嵌套里的 `.gamma` 是后代选择器，展开为 `.beta .gamma`（不是 `.gamma`）
    assert.ok(selectors.includes(".beta .gamma"));
    assert.ok(selectors.includes(".beta.is-active"));
});

test("at-rules are transparent and nested at-rules inherit the parent selector", () => {
    const css = `
@media (max-width: 420px) {
    .top { min-width: 0; }
    .wrapped {
        @media (min-width: 480px) { color: green; }
    }
}
`;
    assert.equal(declaresIn(css, ".top", /min-width: 0/), true);
    assert.equal(declaresIn(css, ".wrapped", /color: green/), true, "嵌在规则内的媒体查询应继承父选择器");
});

// {topLevel: true} 的存在理由：同名覆盖规则会替基础规则满足断言。
test("topLevel scoping is not satisfied by an override rule", () => {
    const broken = `
.base { display: block; }
@media (max-width: 560px) { .base { max-width: 100%; } }
`;
    assert.equal(declaresIn(broken, ".base", /max-width: 100%/), true,
        "无作用域断言被覆盖规则满足 —— 这正是要防的假绿");
    assert.equal(declaresIn(broken, ".base", /max-width: 100%/, {topLevel: true}), false,
        "topLevel 作用域只认基础规则，才守得住那条声明");
});

// {atRule} 的存在理由：`atDepth` 只说"被几层 at-rule 包着"，说不出"是哪一条"，
// 于是"窄屏分支里必须有 X"会退让成"任意 at-rule 里都算"（T-6283）。
test("atRule scoping distinguishes which branch a rule sits in", () => {
    const broken = `
.base { display: block; }
@media (max-width: 560px) { .base { max-width: 100%; } }
@media print { .base { page-break-inside: avoid; } }
`;
    // 深度够（atDepth > 0）却身份不对：把声明挪去 print 分支，只按"非顶层"断言仍会通过
    assert.equal(findRules(broken, ".base").filter((rule) => rule.atDepth > 0).length, 2,
        "两个分支各有一条 .base 覆盖规则");
    assert.equal(declaresIn(broken, ".base", /max-width: 100%/, {atRule: /max-width:\s*560px/}), true);
    assert.equal(declaresIn(broken, ".base", /max-width: 100%/, {atRule: /@media print/}), false,
        "print 分支里没有这条声明 —— 身份不匹配时必须失败（这正是深度不够用的地方）");
    // 字符串形式按子串匹配
    assert.equal(declaresIn(broken, ".base", /max-width: 100%/, {atRule: "(max-width: 560px)"}), true);
    // 条件链要完整：`@media (max-width: 560px) and (prefers-reduced-motion: reduce)` 这类
    // 复合查询必须能被整条命中，而不是只留下某一个片段
    const composed = `
@media (max-width: 560px) and (prefers-reduced-motion: reduce) {
    .card { content-visibility: visible; }
}
`;
    assert.deepEqual(parseRules(composed)[0].atRules, ["@media (max-width: 560px) and (prefers-reduced-motion: reduce)"]);
    assert.equal(declaresIn(composed, ".card", /content-visibility: visible/, {atRule: /prefers-reduced-motion/}), true);
});

test("topLevel and atRule can be combined", () => {
    const css = `
.a { color: red; }
@media print { .a { color: blue; } }
`;
    assert.equal(declaresIn(css, ".a", /color: red/, {topLevel: true}), true);
    assert.equal(declaresIn(css, ".a", /color: red/, {topLevel: true, atRule: /print/}), false,
        "既要基础规则、又要落在 print 分支——两者互斥时必须失败，而不是让一个条件覆盖另一个");
    assert.equal(declaresIn(css, ".a", /color: blue/, {topLevel: true, atRule: /print/}), false);
    assert.equal(declaresIn(css, ".a", /color: blue/, {atRule: /print/}), true);
});

test("comments never satisfy a declaration assertion", () => {
    const css = `
.card {
    /* min-width: 0; */
    display: block;
}
`;
    assert.equal(declaresIn(css, ".card", /min-width: 0/), false);
});

test("semicolons and braces inside strings do not split declarations", () => {
    const css = `
.card::after {
    content: ";";
    content: "";
    min-width: 0;
}
`;
    assert.equal(declaresIn(css, ".card::after", /content: "xxx"/), false);
    assert.equal(declaresIn(css, ".card::after", /min-width: 0/), true, "字符串里的分号不得截断后续声明");
});

test("commas inside functions or attribute selectors do not split the selector", () => {
    const css = `
.card:not(.a, .b) { min-width: 0; }
[data-x="y,z"] { color: red; }
`;
    assert.equal(declaresIn(css, ".card:not(.a, .b)", /min-width: 0/), true);
    assert.equal(declaresIn(css, '[data-x="y,z"]', /color: red/), true);
});

// 判别力对照：这正是本助手要取代的旧写法。同一份 CSS 上，旧写法通过、新写法失败。
test("block scoping catches what the unbounded-window pattern misses", () => {
    const broken = `
.card { display: block; }
.other { min-width: 0; }
`;
    assert.match(broken, /\.card[\s\S]*?min-width: 0/); // 旧断言：仍然通过 —— 缺陷本身
    assert.equal(declaresIn(broken, ".card", /min-width: 0/), false); // 新断言：正确失败
});

test("selector normalization collapses whitespace", () => {
    assert.equal(normalizeSelector("  .a   >   .b  "), ".a > .b");
    assert.equal(declaresIn("  .a\n >\n .b { color: red; }", ".a > .b", /color: red/), true);
});

// 对真实文件跑一遍，证明解析器不是"玩具"（.sw-home-store__card-head strong 是
// D-395 注入实验的靶点：它的 min-width: 0 曾被删掉而旧断言依然通过）。
test("parses the real stylesheet and pins the D-395 injection target", () => {
    const css = readSourceText(path.join(__dirname, "..", "src", "index.scss"));
    const rules = parseRules(css);
    assert.ok(rules.length > 500, `expected a substantial rule count, got ${rules.length}`);
    assert.equal(declaresIn(css, ".sw-home-store__card-head strong", /min-width: 0/), true);
    assert.equal(declaresIn(css, ".sw-home-store__card-head strong", /max-width: 100%/), true);
    assert.equal(declaresIn(css, ".sw-home-store__card-head strong", /display: grid/), false);
    // 注释不得被当成声明——用真实文件里的 D-364 靶点证明：这两个块里各有一条行注释
    // 写着被覆盖掉的旧值（status 的 "font-weight: 500"、group 的 "font-weight: 600"），
    // 真实声明是 550 / 650。若解析器漏剥注释，下面两句会翻成 true（门禁读注释）。
    assert.equal(declaresIn(css, ".sw-home-store__status", /font-weight: 500/), false);
    assert.equal(declaresIn(css, ".sw-home-store__status", /font-weight: 550/), true);
    assert.equal(declaresIn(css, ".sw-home-store__group", /font-weight: 600/), false);
    assert.equal(declaresIn(css, ".sw-home-store__group", /font-weight: 650/), true);
    // 真实靶点二：`.sw-home-store__summary` 有两条同名规则（基础规则 + `@media (max-width: 560px)`
    // 覆盖），后者会让"删掉基础声明"的注入失效——所以宽度断言必须带 {topLevel: true}。
    assert.equal(findRules(css, ".sw-home-store__summary").length, 2);
    assert.equal(findRules(css, ".sw-home-store__summary", {topLevel: true}).length, 1);
    assert.equal(declaresIn(css, ".sw-home-store__summary", /max-width: 100%/, {topLevel: true}), true);
    // 行号是注入工具（scripts/css-assertion-injector.cjs）定位注入点的唯一依据，故按
    // **关系不变式**（而非绝对行号，避免 SCSS 一改就脆断）钉住它：每条规则的 startLine
    // 必须是含 `{` 的那一行、endLine 必须是含 `}` 的那一行，且声明必须落在区间内。
    // 声明按"空白归一后的子串"比对而不是整行相等——`from { transform: rotate(0deg); }`
    // 这类单行块（keyframes 步进）与跨行声明都会让整行比对失效（首版即被它拦下）。
    // P1-2：样式已拆为顺序切片，本体退化为 @use 清单；此处须读组合视图。
    const rawLines = readStyleSource().split("\n");
    assert.ok(rules.length > 500, "审计面塌缩");
    let checked = 0;
    for (const rule of rules) {
        assert.ok(rawLines[rule.startLine - 1].includes("{"), `startLine ${rule.startLine} 不是块首行`);
        assert.ok(rawLines[rule.endLine - 1].includes("}"), `endLine ${rule.endLine} 不是块尾行`);
        assert.ok(rule.startLine <= rule.endLine, "startLine 必须不大于 endLine");
        const haystack = rawLines.slice(rule.startLine - 1, rule.endLine).join("\n").replace(/\s+/g, " ");
        for (const declaration of rule.declarations.split("\n")) {
            const needle = declaration.replace(/\s+/g, " ").trim();
            if (!needle) continue;
            assert.ok(haystack.includes(needle), `声明 ${needle} 不在 ${rule.startLine}-${rule.endLine} 区间内`);
            checked += 1;
        }
    }
    assert.ok(checked > 500, `行号关系不变式覆盖面过小：只校验了 ${checked} 条声明`);
});
