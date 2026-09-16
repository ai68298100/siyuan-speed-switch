const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-395）：作用域迁移。本文件原有 15 条宽度断言写作
//
//     assert.match(css, /strong[\s\S]*?min-width: 0/)
//
// `[\s\S]*?` 会一路向后搜，断言于是退化成"文件里某处有 strong、其后再某处有
// min-width: 0"。`src/index.scss` 里有 104 处 `min-width: 0`，所以把目标规则块里的
// 声明**删掉**，旧断言照样通过（B1/B2 注入实证）。现改为块级作用域断言：某个选择器的
// 规则块**自身**声明了该属性。靶点在 SCSS 里是嵌套选择器，按展开后的形态书写。
//
// 迁移时顺带修掉两处问题：
//   1. `avoid fixed * width` 那 5 条与前面的 `* max width full` **逐字节相同**——
//      名字承诺的是"没有写死宽度"，断言却是同一句话的副本（15 条实际只有 10 条信息）。
//      已改成对 `max-width: <数字>px` 的否定断言，兑现名字。
//   2. 读取改用 readSourceFile：它在剥离注释后返回文本，且限定源码扩展名。
//
// 正断言统一带 {topLevel: true}（只认没被 at-rule 包着的基础规则）：注入实验发现
// `.sw-home-store__summary` 既有基础规则、又在 `@media (max-width: 560px)` 里被覆盖一次，
// 不带作用域时"删掉基础声明"也不会失败。基础声明是桌面端的承重墙，必须守住。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};

test('title min width zero',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/min-width: 0/,base)));
test('title max width full',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/max-width: 100%/,base)));
test('description min width zero',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/min-width: 0/,base)));
test('description max width full',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/max-width: 100%/,base)));
test('status min width zero',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/min-width: 0/,base)));
test('status max width full',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/max-width: 100%/,base)));
test('group min width zero',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/min-width: 0/,base)));
test('group max width full',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/max-width: 100%/,base)));
test('summary min width zero',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/min-width: 0/,base)));
test('summary max width full',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/max-width: 100%/,base)));
// 下面 9 条本来就是合法的"文件级存在"断言（没有窗口模式），保持原样。
test('width rules preserve wrap',()=>assert.ok(css.includes('overflow-wrap: anywhere')));
test('width rules preserve word break',()=>assert.ok(css.includes('word-break: break-word')));
test('width rules preserve hyphens',()=>assert.ok(css.includes('hyphens: auto')));
test('width rules preserve pretty wrap',()=>assert.ok(css.includes('text-wrap: pretty')));
test('width rules preserve balance',()=>assert.ok(css.includes('text-wrap: balance')));
test('width rules preserve mobile',()=>assert.ok(css.includes('max-width: 560px')));
test('width rules preserve print',()=>assert.ok(css.includes('@media print')));
test('width rules preserve forced colors',()=>assert.ok(css.includes('forced-colors: active')));
test('width rules preserve reduced motion',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('width rules standard min width',()=>assert.ok(css.includes('min-width: 0')));
test('width rules standard max width',()=>assert.ok(css.includes('max-width: 100%')));
// 否定断言：这些块里不得出现写死的像素宽度（否则名字里的 "avoid fixed * width" 就是空话）。
test('width rules avoid fixed title width',()=>assert.equal(declaresIn(css,'.sw-home-store__card-head strong',/max-width:\s*\d+px/),false,'card-head strong 不得写死 max-width 像素值'));
test('width rules avoid fixed description width',()=>assert.equal(declaresIn(css,'.sw-home-store__card-head span',/max-width:\s*\d+px/),false,'card-head span 不得写死 max-width 像素值'));
test('width rules avoid fixed status width',()=>assert.equal(declaresIn(css,'.sw-home-store__status',/max-width:\s*\d+px/),false,'status 不得写死 max-width 像素值'));
test('width rules avoid fixed group width',()=>assert.equal(declaresIn(css,'.sw-home-store__group',/max-width:\s*\d+px/),false,'group 不得写死 max-width 像素值'));
test('width rules avoid fixed summary width',()=>assert.equal(declaresIn(css,'.sw-home-store__summary',/max-width:\s*\d+px/),false,'summary 不得写死 max-width 像素值'));
test('width rules preserve card scope',()=>assert.ok(css.includes('sw-home-store__card-head')));
test('width rules preserve status scope',()=>assert.ok(css.includes('sw-home-store__status')));
test('width rules preserve group scope',()=>assert.ok(css.includes('sw-home-store__group')));
test('width rules preserve summary scope',()=>assert.ok(css.includes('sw-home-store__summary')));
test('width contract deterministic',()=>assert.ok(css.includes('min-width: 0')&&css.includes('max-width: 100%')));
