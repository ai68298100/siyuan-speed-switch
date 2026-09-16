const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,parseRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396）：作用域迁移。本文件原有 11 条窗口断言（普查口径）外加
// 1 条**手写窗口**（普查扫不到）：旧首行用
// `/\.sw-home-store__card-head\s*\{([\s\S]*?)\n\}\s*\n\s*\.sw__home-source-health/`
// 截取"到下一个选择器为止"的块，再在其上做否定窗口——锚点是**下一个规则的类名**，
// 中间插入/删除任何规则都会让截取范围漂移，与 `A[\s\S]*?B` 是同一族病。分四档处理：
//
//   ① 9 条"选择器→声明"改块级断言（`{topLevel: true}`），`strong`/`span` 锚点按展开后
//      的真实选择器书写。
//   ② 3 条以 `text-wrap: balance` 为左锚的窗口（`width: Npx` 否定 / `url(` 否定 / `\}`
//      闭合）改逐规则：先取声明了 `text-wrap: balance` 的规则（全文件恰 2 条），再断言
//      这些规则自身禁写死 `width: Npx`、不含 `url(`；`\}` 闭合版纯冗余（块解析的
//      `is defined` 严格强于它），**删除**。手写的 `cardHeadBlock` 截取随之删除。
//   ③ 顺带收紧 1 条文件级存在断言到块级：`description remains clamped`。
// 该文件 31 → 30 条测试，README/快照同步。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 本契约受管的四个块。供逐规则不变式使用。
const MANAGED=['.sw-home-store__card-head strong','.sw-home-store__card-head span','.sw-home-store__group','.sw-home-store__summary'];
const managedRules=parseRules(css).filter((rule)=>rule.atDepth===0
    && rule.selectors.some((item)=>MANAGED.includes(item)));
// 声明了 text-wrap: balance 的规则（全文件 2 条），供逐规则否定使用（含非空自检）。
const balanceRules=parseRules(css).filter((rule)=>/text-wrap: balance/.test(rule.declarations));

test('card title wraps anywhere',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/overflow-wrap: anywhere/,base)));
test('card title balances text',()=>assert.ok(css.includes('text-wrap: balance')));
test('card descriptions wrap anywhere',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/overflow-wrap: anywhere/,base)));
test('group labels wrap anywhere',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/overflow-wrap: anywhere/,base)));
test('group labels balance text',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/text-wrap: balance/,base)));
test('summary wraps anywhere',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/overflow-wrap: anywhere/,base)));
test('title remains block',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/display: block/,base)));
test('description remains clamped',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/-webkit-line-clamp: 2/,base)));
test('description remains hidden overflow',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/overflow: hidden/,base)));
test('typography is scoped to store card',()=>assert.ok(css.includes('sw-home-store__card-head')));
test('group typography is scoped',()=>assert.ok(css.includes('sw-home-store__group')));
test('summary typography is scoped',()=>assert.ok(css.includes('sw-home-store__summary')));
test('title typography supports unicode',()=>assert.ok(css.includes('overflow-wrap: anywhere')));
test('description typography supports long URLs',()=>assert.ok(css.includes('overflow-wrap: anywhere')));
test('group typography supports long labels',()=>assert.ok(css.includes('text-wrap: balance')));
test('summary remains bounded',()=>assert.ok(css.includes('min-height: 18px')));
test('card title retains font size',()=>assert.ok(css.includes('font-size: 13px')));
test('card description retains font size',()=>assert.ok(css.includes('font-size: 12px')));
test('support text retains font size',()=>assert.ok(css.includes('font-size: 11px')));
test('group label retains font size',()=>assert.ok(css.includes('font-size: 12px')));
test('summary retains font size',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/font-size: 11px/,base)));
// 旧断言先截"card-head 到下一个选择器"的块再做否定窗口，锚点漂移即失效；
// 正确形态：先取声明了 balance 的规则，再断言这些规则自身禁写死宽度。
test('typography avoids fixed width',()=>{
    assert.equal(managedRules.length,MANAGED.length,'审计面塌缩：受管块应有 4 条基础规则');
    assert.ok(balanceRules.length>0,'审计面塌缩：没有任何声明 text-wrap: balance 的规则');
    for(const rule of balanceRules){
        for(const line of rule.declarations.split('\n')){
            assert.doesNotMatch(line,/^\s*width:\s*\d+px/,`声明 balance 的规则不得写死 width：${rule.selectors.join(', ')}`);
        }
    }
});
test('typography preserves balanced wrapping',()=>assert.ok(css.includes('text-wrap: balance')));
test('typography preserves mobile media',()=>assert.ok(css.includes('max-width: 560px')));
test('typography preserves focus states',()=>assert.ok(css.includes('focus-visible')));
test('typography preserves touch states',()=>assert.ok(css.includes('touch-action: manipulation')));
test('typography uses standard wrap property',()=>assert.ok(css.includes('overflow-wrap: anywhere')));
test('typography uses standard balance property',()=>assert.ok(css.includes('text-wrap: balance')));
// 否定式窗口的正确形态：先取声明了 balance 的规则，再断言这些规则自身不含外部依赖。
test('typography has no network dependency',()=>{
    assert.ok(balanceRules.length>0,'审计面塌缩：没有任何声明 text-wrap: balance 的规则');
    for(const rule of balanceRules) assert.doesNotMatch(rule.declarations,/url\(/);
});
test('typography contract deterministic',()=>assert.ok(css.includes('overflow-wrap: anywhere')&&css.includes('text-wrap: balance')));
