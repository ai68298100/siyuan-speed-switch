const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,parseRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396）：作用域迁移 + 兑现测试名。本文件原有 12 条窗口断言
// （`sw-home-store__card[\s\S]*?box-sizing` 这类），退化为"文件里某处有 A、其后再某处
// 有 B"，与目标规则无关；现改为块级作用域断言，正断言一律带 {topLevel: true}（只认
// 未被 at-rule 包裹的基础规则——同名覆盖规则会替基础规则满足断言，见 D-396）。
// 同时兑现 5 条"名不副实"的断言：`title weight avoids 400` 等的原体与 `* weight is
// defined` 逐字节相同（只是同一句话的副本），现按名字给出真实语义（不得声明关键字字重、
// 不得声明写死宽度、每条字重规则的值必须是数字）。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 所有"声明了 font-weight 的规则"，供整文件不变式使用（含非空自检，防集合为空时恒真）。
const weightRules=parseRules(css).filter((rule)=>/font-weight:/.test(rule.declarations));

test('title weight is defined',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/font-weight: 650/,base)));
test('status weight is defined',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/font-weight: 550/,base)));
test('group weight is defined',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/font-weight: 650/,base)));
test('summary weight is defined',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/font-weight: 450/,base)));
test('source weight is defined',()=>assert.ok(declaresIn(css,'.sw-home-store__source-chip',/font-weight: 550/,base)));
test('availability weight is defined',()=>assert.ok(declaresIn(css,'.sw-home-store__availability',/font-weight: 550/,base)));
test('title keeps line height',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/line-height: 1\.35/,base)));
test('status keeps line height',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/line-height: 1\.35/,base)));
test('group keeps line height',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/line-height: 1\.35/,base)));
test('summary keeps line height',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/line-height: 1\.45/,base)));
// 下面 9 条是合法的"文件级存在"断言（本来就没有窗口模式），保持原样。
test('weight preserves wrapping',()=>assert.ok(css.includes('overflow-wrap: anywhere')));
test('weight preserves hyphens',()=>assert.ok(css.includes('hyphens: auto')));
test('weight preserves balanced text',()=>assert.ok(css.includes('text-wrap: balance')));
test('weight preserves font adjust',()=>assert.ok(css.includes('font-size-adjust: from-font')));
test('weight preserves tabular nums',()=>assert.ok(css.includes('font-variant-numeric: tabular-nums')));
test('weight preserves mobile',()=>assert.ok(css.includes('max-width: 560px')));
test('weight preserves print',()=>assert.ok(css.includes('@media print')));
test('weight preserves forced colors',()=>assert.ok(css.includes('forced-colors: active')));
test('weight preserves reduced motion',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('title weight avoids 400',()=>assert.equal(declaresIn(css,'.sw-home-store__card-head strong',/font-weight:\s*(?:400|normal)\b/,base),false,'标题块不得声明 400/normal'));
test('status weight avoids normal',()=>assert.equal(declaresIn(css,'.sw-home-store__status',/font-weight:\s*(?:400|normal)\b/,base),false,'状态块不得声明 400/normal'));
test('summary weight is lighter',()=>assert.equal(declaresIn(css,'.sw-home-store__summary',/font-weight:\s*(?:6\d\d|bold)\b/,base),false,'摘要块应是最轻的一档（450），不得声明 6xx/bold'));
test('weight uses numeric values',()=>{
    assert.ok(weightRules.length>0,'审计面塌缩：没有任何声明 font-weight 的规则');
    for(const rule of weightRules){
        assert.match(rule.declarations,/font-weight: \d+/);
        assert.doesNotMatch(rule.declarations,/font-weight:\s*(?:normal|bold|bolder|lighter)\b/);
    }
});
test('weight has no fixed width',()=>{
    assert.ok(weightRules.length>0,'审计面塌缩：没有任何声明 font-weight 的规则');
    for(const rule of weightRules){
        assert.doesNotMatch(rule.declarations,/max-width:\s*\d+px/,'字重规则不得写死像素宽度');
    }
});
// 否定式窗口断言（`/font-weight: 650[\s\S]*?url\(/`）的失效方向与正断言相反却同样无效：
// 只要"url( 出现在 650 之后"就报错，而 url( 出现在前面、或根本不在目标规则里时语义已与
// 意图无关。正确形态是逐规则检查：先取声明了该字重的规则，再断言这些规则自身不含依赖。
test('weight has no network',()=>{
    assert.ok(weightRules.length>0,'审计面塌缩');
    for(const rule of weightRules) assert.doesNotMatch(rule.declarations,/url\(/);
});
test('weight has no script',()=>{
    assert.ok(weightRules.length>0,'审计面塌缩');
    for(const rule of weightRules) assert.doesNotMatch(rule.declarations,/javascript/);
});
test('weight remains card scoped',()=>assert.ok(css.includes('sw-home-store__card-head')));
test('weight remains status scoped',()=>assert.ok(css.includes('sw-home-store__status')));
test('weight remains source scoped',()=>assert.ok(css.includes('sw-home-store__source-chip')));
test('weight remains summary scoped',()=>assert.ok(css.includes('sw-home-store__summary')));
test('font weight contract deterministic',()=>assert.ok(css.includes('font-weight: 650')&&css.includes('font-weight: 450')));
