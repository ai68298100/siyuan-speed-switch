// css-block-scan 辅助的自身测试：块级作用域断言必须真的"看块"，而不是"看文件里有没有"。
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {parseRules, findRules, declaresIn, normalizeSelector} = require("./css-block-scan.cjs");
const {readSourceText} = require("./source-scan.cjs");

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
});
