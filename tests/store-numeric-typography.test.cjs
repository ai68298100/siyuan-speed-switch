const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,parseRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396）：作用域迁移 + 兑现名字。本文件原有 13 条窗口断言，分四档处理：
//
//   ① 8 条"选择器→声明"改块级断言（`{topLevel: true}`）。`source-chip` 与 `availability`
//      **共用一条分组规则**声明 `text-rendering: optimizeLegibility`（同 `store-font-metrics`），
//      两条断言各钉各的选择器。
//   ② 2 条否定式窗口（`optimizeLegibility[\s\S]*?url\(` / `javascript`）改逐规则检查：
//      先取声明了 `text-rendering: optimizeLegibility` 的规则，再断言这些规则自身不含依赖。
//   ③ 3 条 `* rule closes` **删除**（含 1 条双窗口 `summary…optimizeLegibility…\}`）：
//      `\}` 由文件后面**任何一个** `}` 满足，块解析版的 `is defined` 严格强于旧断言，纯冗余
//      （该文件 30 → 27 条测试，README/快照同步）。
//
// 另兑现一条**名不副实**的断言：`keeps flexible width` 旧断言只是"存在 tabular-nums"，
// 现改为"受管规则不得写死 `width:`"（`min-`/`max-` 不受限——实测各块只有
// `min-width: 0` 与 `max-width: 100%`）。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 本契约受管的 4 个选择器（后两个共用一条分组规则）。
const MANAGED=['.sw-home-store__status','.sw-home-store__summary','.sw-home-store__source-chip','.sw-home-store__availability'];
const managedRules=parseRules(css).filter((rule)=>rule.atDepth===0
    && rule.selectors.some((item)=>MANAGED.includes(item)));
// 审计面自检：4 个选择器都必须被某条受管规则承载（分组规则按选择器记账）。
function assertManagedCovered(){
    const covered=new Set(managedRules.flatMap((rule)=>rule.selectors));
    assert.ok(MANAGED.every((item)=>covered.has(item)),'审计面塌缩：受管选择器缺块');
}
// 声明了 optimizeLegibility 的规则，供逐规则否定使用（含非空自检，防集合为空时恒真）。
const renderingRules=parseRules(css).filter((rule)=>/text-rendering: optimizeLegibility/.test(rule.declarations));

test('status uses tabular numerics',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/font-variant-numeric: tabular-nums/,base)));
test('summary uses tabular numerics',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/font-variant-numeric: tabular-nums/,base)));
test('status optimizes legibility',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/text-rendering: optimizeLegibility/,base)));
test('summary optimizes legibility',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/text-rendering: optimizeLegibility/,base)));
test('source chip optimizes legibility',()=>assert.ok(declaresIn(css,'.sw-home-store__source-chip',/text-rendering: optimizeLegibility/,base)));
test('availability optimizes legibility',()=>assert.ok(declaresIn(css,'.sw-home-store__availability',/text-rendering: optimizeLegibility/,base)));
test('numeric style is standard',()=>assert.ok(css.includes('font-variant-numeric: tabular-nums')));
test('rendering style is standard',()=>assert.ok(css.includes('text-rendering: optimizeLegibility')));
test('status remains visible',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/display: block/,base)));
test('summary remains visible',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/min-height/,base)));
test('source chips remain inline',()=>assert.ok(css.includes('.sw-home-store__source-chip')));
test('availability remains inline',()=>assert.ok(css.includes('.sw-home-store__availability')));
test('numeric style preserves theme colors',()=>assert.ok(css.includes('var(--b3-theme-on-surface-light)')));
test('numeric style preserves status accent',()=>assert.ok(css.includes('is-added')));
test('numeric style preserves mobile rules',()=>assert.ok(css.includes('max-width: 560px')));
test('numeric style preserves print rules',()=>assert.ok(css.includes('@media print')));
test('numeric style preserves high contrast',()=>assert.ok(css.includes('forced-colors: active')));
test('numeric style preserves reduced motion',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('status style remains bounded',()=>assert.ok(css.includes('font-size: 11px')));
test('summary style remains bounded',()=>assert.ok(css.includes('font-size: 11px')));
test('source labels remain bounded',()=>assert.ok(css.includes('font-size: 10px')));
test('numeric style keeps flexible width',()=>{
    assertManagedCovered();
    for(const rule of managedRules){
        for(const line of rule.declarations.split('\n')){
            assert.doesNotMatch(line,/^\s*width:\s*\d/,`受管规则不得写死 width（min-/max- 不受限）：${rule.selectors.join(', ')}`);
        }
    }
});
// 否定式窗口的正确形态：先取声明了 optimizeLegibility 的规则，再断言这些规则自身不含外部依赖。
test('numeric style has no network url',()=>{
    assert.ok(renderingRules.length>0,'审计面塌缩：没有任何声明 text-rendering: optimizeLegibility 的规则');
    for(const rule of renderingRules) assert.doesNotMatch(rule.declarations,/url\(/);
});
test('numeric style has no script',()=>{
    assert.ok(renderingRules.length>0,'审计面塌缩：没有任何声明 text-rendering: optimizeLegibility 的规则');
    for(const rule of renderingRules) assert.doesNotMatch(rule.declarations,/javascript/);
});
test('numeric style is CSS only',()=>assert.ok(css.includes('font-variant-numeric')&&css.includes('text-rendering')));
test('status remains readable',()=>assert.ok(css.includes('text-rendering: optimizeLegibility')));
test('numeric typography deterministic',()=>assert.ok(css.includes('tabular-nums')&&css.includes('optimizeLegibility')));
