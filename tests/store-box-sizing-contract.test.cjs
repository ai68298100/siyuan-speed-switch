const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,parseRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396）：作用域迁移 + 兑现名字。本文件原有 12 条窗口断言
//
//     assert.match(css, /\.sw-home-store__card[\s\S]*?box-sizing: border-box/)
//
// `[\s\S]*?` 会一路向后搜，断言于是退化成"文件里某处有 `.sw-home-store__card`、其后再
// 某处有 `box-sizing: border-box`"，与目标规则是否声明无关；改成块级作用域断言后，要求
// **该选择器匹配的规则块自身**声明它。迁移中有两处不能机械套模板，逐条说明：
//
//   1. `card keeps max width full`：`max-width: 100%` **只声明在 `@media (max-width: 560px)`
//      分支里**（基础规则靠 `min-width: 0` 防网格溢出，见上一条）。所以这一条刻意**不加**
//      {topLevel: true}——它守的本来就是窄屏布局，加 topLevel 只会得到假红。改为"至少有一条
//      被 at-rule 包裹的 card 规则声明了它"，并附非空自检。
//   2. `box sizing avoids content box` / `no network` / `no script` 是**否定式窗口**
//      （`A[\s\S]*?B`），失效方向与正断言相反却同样无效：只要"B 出现在 A 之后"就报错，
//      B 出现在前面、或根本不在目标规则里时，语义已与意图无关。正确形态是逐规则检查：
//      先取该管住的规则集合，再断言这些规则**自身**不含被禁内容。
//
// 读取改用 readSourceFile：剥注释后返回，且限定源码扩展名。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 所有"声明了 box-sizing: border-box 的规则"，供整文件不变式使用（含非空自检，防集合为空时恒真）。
const borderRules=parseRules(css).filter((rule)=>/box-sizing:\s*border-box/.test(rule.declarations));

test('card uses border box',()=>assert.ok(declaresIn(css,'.sw-home-store__card',/box-sizing: border-box/,base)));
test('status uses border box',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/box-sizing: border-box/,base)));
test('group uses border box',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/box-sizing: border-box/,base)));
test('summary uses border box',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/box-sizing: border-box/,base)));
test('card keeps min width zero',()=>assert.ok(declaresIn(css,'.sw-home-store__card',/min-width: 0/,base)));
test('status keeps min width zero',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/min-width: 0/,base)));
test('group keeps min width zero',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/min-width: 0/,base)));
test('summary keeps min width zero',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/min-width: 0/,base)));
// 这一条守的是**窄屏分支**（见文件头①）：`max-width: 100%` 只声明在 `@media (max-width: 560px)`
// 里，所以既不能带 {topLevel: true}（会假红），也不能只要求"任意 at-rule 内"——那种退让写法下
// 把声明挪去 `@media print` 断言仍会通过（这正是 T-6283 的由来）。{atRule} 把它钉在具体分支上。
test('card keeps max width full',()=>assert.ok(
    declaresIn(css,'.sw-home-store__card',/max-width: 100%/,{atRule: /max-width:\s*560px/}),
    '窄屏分支必须让卡片不超出容器宽度',
));
// 下面 13 条本来就是合法的"文件级存在"断言（没有窗口模式），保持原样。
test('box sizing preserves wrapping',()=>assert.ok(css.includes('overflow-wrap: anywhere')));
test('box sizing preserves word break',()=>assert.ok(css.includes('word-break: break-word')));
test('box sizing preserves hyphens',()=>assert.ok(css.includes('hyphens: auto')));
test('box sizing preserves line height',()=>assert.ok(css.includes('line-height: 1.35')));
test('box sizing preserves mobile',()=>assert.ok(css.includes('max-width: 560px')));
test('box sizing preserves print',()=>assert.ok(css.includes('@media print')));
test('box sizing preserves forced colors',()=>assert.ok(css.includes('forced-colors: active')));
test('box sizing preserves reduced motion',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('box sizing is standard',()=>assert.ok(css.includes('box-sizing: border-box')));
test('box sizing keeps focus',()=>assert.ok(css.includes('focus-visible')));
test('box sizing keeps touch',()=>assert.ok(css.includes('touch-action: manipulation')));
test('box sizing keeps content visibility',()=>assert.ok(css.includes('content-visibility: auto')));
test('box sizing keeps intrinsic size',()=>assert.ok(css.includes('contain-intrinsic-size')));
// 否定断言：本文件统一 border-box，因此**任何**规则都不得声明 content-box（比原窗口断言更宽也更准：
// 原写法只截".sw-home-store__card 之后的第一个 content-box"，卡片前的规则它管不着）。
test('box sizing avoids content box',()=>{
    const rules=parseRules(css);
    assert.ok(rules.length>0,'审计面塌缩：解析不到任何规则');
    const offenders=rules.filter((rule)=>/box-sizing:\s*content-box/.test(rule.declarations))
        .map((rule)=>rule.selectors.join(', '));
    assert.deepEqual(offenders,[],'本文件应统一 border-box，不得出现 content-box');
});
test('card scope remains',()=>assert.ok(css.includes('sw-home-store__card')));
test('status scope remains',()=>assert.ok(css.includes('sw-home-store__status')));
test('group scope remains',()=>assert.ok(css.includes('sw-home-store__group')));
test('summary scope remains',()=>assert.ok(css.includes('sw-home-store__summary')));
// 否定式窗口的正确形态：先取声明了 border-box 的规则，再断言这些规则自身不含外部依赖。
test('box sizing no network',()=>{
    assert.ok(borderRules.length>0,'审计面塌缩：没有任何声明 box-sizing: border-box 的规则');
    for(const rule of borderRules) assert.doesNotMatch(rule.declarations,/url\(/);
});
test('box sizing no script',()=>{
    assert.ok(borderRules.length>0,'审计面塌缩：没有任何声明 box-sizing: border-box 的规则');
    for(const rule of borderRules) assert.doesNotMatch(rule.declarations,/javascript/);
});
test('box sizing deterministic',()=>assert.ok(css.includes('box-sizing: border-box')&&css.includes('min-width: 0')));
