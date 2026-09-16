const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,parseRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396）：作用域迁移 + 兑现名字。本文件原有 11 条窗口断言，分四档处理：
//
//   ① 6 条"选择器→声明"改块级断言（`{topLevel: true}`）。`user-select: none` 侧是两条
//      **分组规则**（`.sw-home-store__source-chip, .sw-home-store__availability` 与
//      `.sw-home-store__sizes, .sw-home-store__group-toggle, …`），五条断言各钉各的选择器，
//      审计面自检按"选择器被承载"记账（同 `store-font-metrics`）。
//   ② 3 条否定式窗口（`user-select: text[\s\S]*?url\(` / `javascript` / `draggable`）改
//      逐规则检查：先取声明了 `user-select: text` 的规则（全文件 3 条），再断言这些规则
//      自身不含依赖/拖拽属性。
//   ③ 2 条 `* rule closes` **删除**（`\}` 由文件后面任何一个 `}` 满足，块解析版的
//      `is defined` 严格强于旧断言；该文件 30 → 28 条测试，README/快照同步）。
//
// 另兑现一条断言：`uses explicit values` 旧断言只是"文件里存在 text|none"，现改为
// "受管规则的 user-select 声明必须是显式的 text/none"（实测全部合规）。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 本契约受管的 5 个选择器（none 侧；前两个与后三个各共用一条分组规则）。
const MANAGED=['.sw-home-store__source-chip','.sw-home-store__availability','.sw-home-store__sizes','.sw-home-store__group-toggle','.sw-home-store__clear-search'];
const managedRules=parseRules(css).filter((rule)=>rule.atDepth===0
    && rule.selectors.some((item)=>MANAGED.includes(item)));
// 审计面自检：5 个选择器都必须被某条受管规则承载。
function assertManagedCovered(){
    const covered=new Set(managedRules.flatMap((rule)=>rule.selectors));
    assert.ok(MANAGED.every((item)=>covered.has(item)),'审计面塌缩：受管选择器缺块');
}
// 声明了 user-select: text 的规则（全文件 3 条），供逐规则否定使用（含非空自检）。
const textRules=parseRules(css).filter((rule)=>/user-select: text/.test(rule.declarations));

test('cards allow text selection',()=>assert.ok(declaresIn(css,'.sw-home-store__card',/user-select: text/,base)));
test('source chips prevent selection',()=>assert.ok(declaresIn(css,'.sw-home-store__source-chip',/user-select: none/,base)));
test('availability badges prevent selection',()=>assert.ok(declaresIn(css,'.sw-home-store__availability',/user-select: none/,base)));
test('size controls prevent selection',()=>assert.ok(declaresIn(css,'.sw-home-store__sizes',/user-select: none/,base)));
test('group toggle prevents selection',()=>assert.ok(declaresIn(css,'.sw-home-store__group-toggle',/user-select: none/,base)));
test('clear button prevents selection',()=>assert.ok(declaresIn(css,'.sw-home-store__clear-search',/user-select: none/,base)));
test('selection property standard',()=>assert.ok(css.includes('user-select:')));
test('card keeps focus',()=>assert.ok(css.includes('focus-visible')));
test('card keeps touch',()=>assert.ok(css.includes('touch-action: manipulation')));
test('selection keeps wrapping',()=>assert.ok(css.includes('overflow-wrap: anywhere')));
test('selection keeps word break',()=>assert.ok(css.includes('word-break: break-word')));
test('selection keeps hyphens',()=>assert.ok(css.includes('hyphens: auto')));
test('selection keeps pretty wrapping',()=>assert.ok(css.includes('text-wrap: pretty')));
test('selection keeps mobile',()=>assert.ok(css.includes('max-width: 560px')));
test('selection keeps print',()=>assert.ok(css.includes('@media print')));
test('selection keeps forced colors',()=>assert.ok(css.includes('forced-colors: active')));
test('selection keeps reduced motion',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('selection keeps isolation',()=>assert.ok(css.includes('isolation: isolate')));
test('selection keeps containment',()=>assert.ok(css.includes('contain: layout paint')));
// 否定式窗口的正确形态：先取声明了 user-select: text 的规则，再断言这些规则自身不含外部依赖。
test('selection no network',()=>{
    assert.ok(textRules.length>0,'审计面塌缩：没有任何声明 user-select: text 的规则');
    for(const rule of textRules) assert.doesNotMatch(rule.declarations,/url\(/);
});
test('selection no script',()=>{
    assert.ok(textRules.length>0,'审计面塌缩：没有任何声明 user-select: text 的规则');
    for(const rule of textRules) assert.doesNotMatch(rule.declarations,/javascript/);
});
test('card selection scoped',()=>assert.ok(css.includes('sw-home-store__card')));
test('chip selection scoped',()=>assert.ok(css.includes('sw-home-store__source-chip')));
test('badge selection scoped',()=>assert.ok(css.includes('sw-home-store__availability')));
test('control selection scoped',()=>assert.ok(css.includes('sw-home-store__sizes')));
test('selection avoids draggable state',()=>{
    assert.ok(textRules.length>0,'审计面塌缩：没有任何声明 user-select: text 的规则');
    for(const rule of textRules) assert.doesNotMatch(rule.declarations,/draggable/);
});
test('selection remains deterministic',()=>assert.ok(css.includes('user-select: text')&&css.includes('user-select: none')));
test('selection contract uses explicit values',()=>{
    assertManagedCovered();
    for(const rule of managedRules){
        for(const line of rule.declarations.split('\n')){
            if(!/user-select:/.test(line)) continue;
            assert.match(line,/^\s*user-select:\s*(text|none)\s*;?$/,`user-select 必须是显式 text/none：${rule.selectors.join(', ')} → ${line.trim()}`);
        }
    }
});
