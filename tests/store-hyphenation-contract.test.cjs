const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,parseRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396）：作用域迁移 + 兑现名字。本文件原有 14 条窗口断言，分四档处理：
//
//   ① 11 条"选择器→声明"改块级断言（`{topLevel: true}`）。其中 `strong`/`span` 两条锚点
//      过于宽泛——`/strong[\s\S]*?hyphens: auto/` 里的 `strong` 匹配**全文件任何一个**
//      strong，比具名类选择器还退化；现按展开后的真实选择器书写。
//   ② 2 条否定式窗口（`hyphens: auto[\s\S]*?url\(` / `javascript`）改逐规则检查：
//      先取声明了 `hyphens: auto` 的规则（全文件恰 4 条），再断言这些规则自身不含依赖。
//   ③ 1 条 `styles close selectors` **删除**：`/hyphens: auto[\s\S]*?\}/` 里的 `\}` 由文件
//      后面**任何一个** `}` 满足，从未验证过块的完整性；而块解析版的 `is defined` 本身就
//      要求"存在一个合法闭合的规则块声明了它"——严格强于旧断言，纯冗余
//      （该文件 30 → 29 条测试，README/快照同步）。
//
// 另兑现三条**名不副实**的断言（旧断言都只是"文件里存在 hyphens: auto"，与名字无关）：
//   - `keeps flexible widths` → 受管四块各自声明 `min-width: 0` 与 `max-width: 100%`；
//   - `avoids nowrap` → 受管四块不得声明 `white-space: nowrap`；
//   - `standard property` → 受管四块用标准属性 `hyphens`，不得写 `-webkit-hyphens`。
// 顺带收紧两条文件级存在断言到块级：`summary remains bounded`（min-height: 18px 归
// summary 块）、`description remains clamped`（-webkit-line-clamp: 2 归 card-head span 块）。
// 读取改用 readSourceFile：剥注释后返回，且限定源码扩展名。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 本契约受管的四个块（连字/换行契约的载体）。供逐规则不变式使用。
const MANAGED=['.sw-home-store__card-head strong','.sw-home-store__card-head span','.sw-home-store__group','.sw-home-store__summary'];
const managedRules=parseRules(css).filter((rule)=>rule.atDepth===0
    && rule.selectors.some((item)=>MANAGED.includes(item)));
// 声明了 hyphens: auto 的规则（全文件 4 条），供逐规则否定使用（含非空自检，防集合为空时恒真）。
const hyphenRules=parseRules(css).filter((rule)=>/hyphens: auto/.test(rule.declarations));

test('card title enables hyphens',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/hyphens: auto/,base)));
test('card description enables hyphens',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/hyphens: auto/,base)));
test('group labels enable hyphens',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/hyphens: auto/,base)));
test('summary enables hyphens',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/hyphens: auto/,base)));
test('hyphens uses auto mode',()=>assert.ok(css.includes('hyphens: auto')));
test('title keeps overflow wrap',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/overflow-wrap: anywhere/,base)));
test('description keeps overflow wrap',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/overflow-wrap: anywhere/,base)));
test('group keeps overflow wrap',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/overflow-wrap: anywhere/,base)));
test('summary keeps overflow wrap',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/overflow-wrap: anywhere/,base)));
test('title keeps balanced wrap',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/text-wrap: balance/,base)));
test('group keeps balanced wrap',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/text-wrap: balance/,base)));
test('hyphenation is card scoped',()=>assert.ok(css.includes('sw-home-store__card-head')));
test('hyphenation is group scoped',()=>assert.ok(css.includes('sw-home-store__group')));
test('hyphenation is summary scoped',()=>assert.ok(css.includes('sw-home-store__summary')));
test('hyphenation remains mobile compatible',()=>assert.ok(css.includes('max-width: 560px')));
test('hyphenation preserves focus rules',()=>assert.ok(css.includes('focus-visible')));
test('hyphenation preserves touch rules',()=>assert.ok(css.includes('touch-action: manipulation')));
test('hyphenation preserves print rules',()=>assert.ok(css.includes('@media print')));
test('hyphenation preserves forced colors',()=>assert.ok(css.includes('forced-colors: active')));
test('hyphenation preserves reduced motion',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('hyphenation keeps flexible widths',()=>{
    assert.equal(managedRules.length,MANAGED.length,'审计面塌缩：受管块应有 4 条基础规则');
    for(const rule of managedRules){
        assert.ok(declaresIn(css,rule.selectors[0],/min-width: 0/,base),`受管块须声明 min-width: 0：${rule.selectors.join(', ')}`);
        assert.ok(declaresIn(css,rule.selectors[0],/max-width: 100%/,base),`受管块须声明 max-width: 100%：${rule.selectors.join(', ')}`);
    }
});
test('hyphenation avoids nowrap',()=>{
    assert.equal(managedRules.length,MANAGED.length,'审计面塌缩：受管块应有 4 条基础规则');
    for(const rule of managedRules){
        assert.doesNotMatch(rule.declarations,/white-space:\s*nowrap/,`受管块不得 nowrap：${rule.selectors.join(', ')}`);
    }
});
test('hyphenation standard property',()=>{
    assert.equal(managedRules.length,MANAGED.length,'审计面塌缩：受管块应有 4 条基础规则');
    for(const rule of managedRules){
        assert.doesNotMatch(rule.declarations,/-webkit-hyphens/,`受管块须用标准属性 hyphens：${rule.selectors.join(', ')}`);
    }
});
// 否定式窗口的正确形态：先取声明了 hyphens: auto 的规则，再断言这些规则自身不含外部依赖。
test('hyphenation no network dependency',()=>{
    assert.ok(hyphenRules.length>0,'审计面塌缩：没有任何声明 hyphens: auto 的规则');
    for(const rule of hyphenRules) assert.doesNotMatch(rule.declarations,/url\(/);
});
test('hyphenation no scripting dependency',()=>{
    assert.ok(hyphenRules.length>0,'审计面塌缩：没有任何声明 hyphens: auto 的规则');
    for(const rule of hyphenRules) assert.doesNotMatch(rule.declarations,/javascript/);
});
test('hyphenation title remains visible',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/display: block/,base)));
test('hyphenation summary remains bounded',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/min-height: 18px/,base)));
test('hyphenation description remains clamped',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/-webkit-line-clamp: 2/,base)));
test('hyphenation contract deterministic',()=>assert.ok(css.includes('hyphens: auto')&&css.includes('overflow-wrap: anywhere')));
