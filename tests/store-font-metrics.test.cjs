const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,parseRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396）：作用域迁移 + 兑现名字。本文件原有 11 条窗口断言，分四档处理：
//
//   ① 7 条"选择器→声明"改块级断言（`{topLevel: true}`）。其中 `strong`/`span` 锚点按展开
//      后的真实选择器书写；`source-chip` 与 `availability` **共用一条分组规则**
//      （`.sw-home-store__source-chip, .sw-home-store__availability { font-size-adjust: … }`），
//      两条断言各钉各的选择器——将来若拆组并丢掉其中一方，仍会被对应断言抓到。
//   ② 2 条否定式窗口（`font-size-adjust: from-font[\s\S]*?url\(` / `javascript`）改逐规则
//      检查：先取声明了 `font-size-adjust: from-font` 的规则（全文件恰 3 条），再断言这些
//      规则自身不含依赖。
//   ③ 2 条 `* rule closes` **删除**：`/…[\s\S]*?\}/` 里的 `\}` 由文件后面**任何一个** `}`
//      满足，从未验证过块的完整性；块解析版的 `is defined` 严格强于旧断言，纯冗余
//      （该文件 30 → 28 条测试，README/快照同步）。
//
// 另兑现两条**名不副实**的断言（旧断言都只是"存在 font-size-adjust: from-font"）：
//   - `avoid fixed width` → 受管规则不得写死 `width:`（`min-`/`max-` 不受限——实测各块
//     只有 `min-width: 0` 与 `max-width: 100%`）；
//   - `standard property` → 受管规则用标准属性 `font-size-adjust`，不得写
//     `-webkit-font-size-adjust`。
// 顺带收紧一条文件级存在断言到块级：`description remains clamped`（-webkit-line-clamp: 2
// 归 card-head span 块）。读取改用 readSourceFile：剥注释后返回，且限定源码扩展名。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 本契约受管的 5 个选择器（注意后两个共用一条分组规则，受管"规则"只有 4 条）。
const MANAGED=['.sw-home-store__card-head strong','.sw-home-store__card-head span','.sw-home-store__status','.sw-home-store__source-chip','.sw-home-store__availability'];
const managedRules=parseRules(css).filter((rule)=>rule.atDepth===0
    && rule.selectors.some((item)=>MANAGED.includes(item)));
// 审计面自检：5 个选择器都必须被某条受管规则承载（分组规则按选择器记账，不按条数）。
function assertManagedCovered(){
    const covered=new Set(managedRules.flatMap((rule)=>rule.selectors));
    assert.ok(MANAGED.every((item)=>covered.has(item)),'审计面塌缩：受管选择器缺块');
}
// 声明了 font-size-adjust: from-font 的规则（全文件 3 条），供逐规则否定使用（含非空自检）。
const adjustRules=parseRules(css).filter((rule)=>/font-size-adjust: from-font/.test(rule.declarations));

test('title uses font size adjust',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/font-size-adjust: from-font/,base)));
test('description uses font size adjust',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/font-size-adjust: from-font/,base)));
test('source chip uses font size adjust',()=>assert.ok(declaresIn(css,'.sw-home-store__source-chip',/font-size-adjust: from-font/,base)));
test('availability uses font size adjust',()=>assert.ok(declaresIn(css,'.sw-home-store__availability',/font-size-adjust: from-font/,base)));
test('title uses compact letter spacing',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/letter-spacing: -0\.01em/,base)));
test('status uses readable letter spacing',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/letter-spacing: 0\.01em/,base)));
test('font adjust uses from-font',()=>assert.ok(css.includes('font-size-adjust: from-font')));
test('metrics remain card scoped',()=>assert.ok(css.includes('sw-home-store__card-head')));
test('status remains scoped',()=>assert.ok(css.includes('sw-home-store__status')));
test('source remains scoped',()=>assert.ok(css.includes('sw-home-store__source-chip')));
test('availability remains scoped',()=>assert.ok(css.includes('sw-home-store__availability')));
test('title remains block',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/display: block/,base)));
test('description remains clamped',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/-webkit-line-clamp: 2/,base)));
test('metrics preserve wrapping',()=>assert.ok(css.includes('overflow-wrap: anywhere')));
test('metrics preserve hyphenation',()=>assert.ok(css.includes('hyphens: auto')));
test('metrics preserve balancing',()=>assert.ok(css.includes('text-wrap: balance')));
test('metrics preserve mobile',()=>assert.ok(css.includes('max-width: 560px')));
test('metrics preserve print',()=>assert.ok(css.includes('@media print')));
test('metrics preserve forced colors',()=>assert.ok(css.includes('forced-colors: active')));
test('metrics preserve reduced motion',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('metrics avoid fixed width',()=>{
    assertManagedCovered();
    for(const rule of managedRules){
        for(const line of rule.declarations.split('\n')){
            assert.doesNotMatch(line,/^\s*width:/,`受管规则不得写死 width（min-/max- 不受限）：${rule.selectors.join(', ')}`);
        }
    }
});
// 否定式窗口的正确形态：先取声明了 from-font 的规则，再断言这些规则自身不含外部依赖。
test('metrics no network url',()=>{
    assert.ok(adjustRules.length>0,'审计面塌缩：没有任何声明 font-size-adjust: from-font 的规则');
    for(const rule of adjustRules) assert.doesNotMatch(rule.declarations,/url\(/);
});
test('metrics no script',()=>{
    assert.ok(adjustRules.length>0,'审计面塌缩：没有任何声明 font-size-adjust: from-font 的规则');
    for(const rule of adjustRules) assert.doesNotMatch(rule.declarations,/javascript/);
});
test('metrics standard property',()=>{
    assertManagedCovered();
    for(const rule of managedRules){
        assert.doesNotMatch(rule.declarations,/-webkit-font-size-adjust/,`受管规则须用标准属性 font-size-adjust：${rule.selectors.join(', ')}`);
    }
});
test('metrics standard spacing',()=>assert.ok(css.includes('letter-spacing')));
test('metrics preserve theme text',()=>assert.ok(css.includes('var(--b3-theme-on-surface-light)')));
test('metrics preserve status accent',()=>assert.ok(css.includes('is-added')));
test('metrics deterministic',()=>assert.ok(css.includes('font-size-adjust: from-font')&&css.includes('letter-spacing')));
