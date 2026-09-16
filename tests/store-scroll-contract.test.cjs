const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,findRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396 第十六批）：作用域迁移。本文件原有 7 条窗口断言外加 1 条
// **手写窗口**（普查扫不到）：旧首行 `gridBlock` 用 `/\.sw-home-store__grid\s*\{([\s\S]*?)\n\}/`
// 截取"到第一个 `\n}` 为止"的块，再断言块内无 `overflow: hidden`——锚点是**第一个块尾**，
// 规则内部只要出现空行+`}` 组合（嵌套/多行值）截取即漂移。分四档处理：
//
//   ① 5 条"选择器→声明"改块级断言（`{topLevel: true}`）。
//   ② `scroll contract avoids hidden overflow grid` 改逐规则：匹配 grid 的全部规则
//      （基础 + 覆盖）都不得声明 `overflow: hidden`；手写截块变量随之删除。
//   ③ 2 条删除：`scroll contract closes selectors`（`\}` 冗余）与
//      `scroll contract keeps flexible tab sizing`（迁移后与 `store tabs allow horizontal
//      scroll` 逐字相同，纯冗余）（31 → 29 条测试，README/快照同步）。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 匹配 grid 的全部规则（基础 + 覆盖），供"禁 hidden overflow"守卫使用（含非空自检）。
const gridRules=findRules(css,'.sw-home-store__grid',{});

test('store grid contains overscroll',()=>assert.ok(declaresIn(css,'.sw-home-store__grid',/overscroll-behavior: contain/,base)));
test('store cards have scroll margin',()=>assert.ok(css.includes('scroll-margin-block: 12px')));
test('store tabs allow horizontal scroll',()=>assert.ok(declaresIn(css,'.sw-home-store__tabs',/overflow-x: auto/,base)));
test('store tabs contain horizontal overscroll',()=>assert.ok(css.includes('overscroll-behavior-x: contain')));
test('store tabs reserve scrollbar gutter',()=>assert.ok(css.includes('scrollbar-gutter: stable')));
test('grid containment is explicit',()=>assert.ok(css.includes('overscroll-behavior: contain')));
test('card scroll margin is bounded',()=>assert.ok(css.includes('scroll-margin-block: 12px')));
test('tab overflow is horizontal',()=>assert.ok(css.includes('overflow-x: auto')));
test('tab overscroll is horizontal',()=>assert.ok(css.includes('overscroll-behavior-x: contain')));
test('scrollbar gutter is stable',()=>assert.ok(css.includes('scrollbar-gutter: stable')));
test('grid keeps display grid',()=>assert.ok(declaresIn(css,'.sw-home-store__grid',/display: grid/,base)));
test('cards keep display flex',()=>assert.ok(declaresIn(css,'.sw-home-store__card',/display: flex/,base)));
test('tabs keep display flex',()=>assert.ok(declaresIn(css,'.sw-home-store__tabs',/display: flex/,base)));
// 旧断言先按"第一个块尾"截取 grid 块再做否定检查，截取锚点脆弱；
// 正确形态：匹配 grid 的全部规则都不得声明 overflow: hidden（overflow-x/auto 不受影响）。
test('scroll contract avoids hidden overflow grid',()=>{
    assert.ok(gridRules.length>0,'审计面塌缩：没有任何 grid 规则');
    for(const rule of gridRules) assert.doesNotMatch(rule.declarations,/overflow:\s*hidden/,`grid 规则不得 hidden overflow：${rule.selectors.join(', ')}`);
});
test('scroll contract preserves mobile media',()=>assert.ok(css.includes('max-width: 560px')));
test('scroll contract preserves focus',()=>assert.ok(css.includes('focus-visible')));
test('scroll contract preserves touch action',()=>assert.ok(css.includes('touch-action: manipulation')));
test('scroll contract preserves card containment',()=>assert.ok(css.includes('contain: layout paint')));
test('scroll contract preserves intrinsic sizing',()=>assert.ok(css.includes('contain-intrinsic-size')));
test('scroll contract is CSS only',()=>assert.doesNotMatch(css,/scrollbar-gutter[^;]*=>/));
test('scroll contract has no network urls',()=>assert.doesNotMatch(css,/overscroll-behavior[^;]*https?:/));
test('scroll contract uses standard overscroll',()=>assert.ok(css.includes('overscroll-behavior')));
test('scroll contract uses standard gutter',()=>assert.ok(css.includes('scrollbar-gutter')));
test('scroll contract uses standard margin',()=>assert.ok(css.includes('scroll-margin-block')));
test('grid and tabs both guarded',()=>assert.ok(css.includes('sw-home-store__grid')&&css.includes('sw-home-store__tabs')));
test('scroll contract deterministic',()=>assert.ok(css.includes('overscroll-behavior: contain')&&css.includes('scrollbar-gutter: stable')));
test('card scroll position remains bounded',()=>assert.ok(css.includes('scroll-margin-block: 12px')));
test('horizontal scroll remains bounded',()=>assert.ok(css.includes('overscroll-behavior-x: contain')));
test('vertical grid scroll remains bounded',()=>assert.ok(css.includes('overscroll-behavior: contain')));
