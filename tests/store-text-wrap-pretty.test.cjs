const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,parseRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396）：作用域迁移。本文件原有 11 条窗口断言，分四档处理：
//
//   ① 8 条"选择器→声明"改块级断言（`{topLevel: true}`）。
//   ② 2 条否定式窗口（`text-wrap: pretty[\s\S]*?url\(` / `javascript`）改逐规则检查：
//      先取声明了 `text-wrap: pretty` 的规则（全文件恰 3 条），再断言这些规则自身不含依赖。
//   ③ 1 条 `* rule closes` **删除**（`\}` 由文件后面任何一个 `}` 满足）；连同下面那条
//      假绿测试共删 2 条（30 → 28 条测试，README/快照同步）。
//
// **删除 1 条假绿测试**：`description has pretty wrapping`
// （`/span[\s\S]*?text-wrap: pretty/`）——实测 `text-wrap: pretty` 全文件恰 3 处
// （card-head strong、status、group），**card-head span 从未声明过 pretty**（它的换行
// 契约是 `-webkit-line-clamp: 2`，两行截断的场景不需要 pretty）；旧断言靠"文件里任何
// 一个 span 文本 + 其后的 pretty"匹配，实为"文件里存在 pretty"的重复（被
// `pretty wrapping property exists` 覆盖），名字与现实不符、内容零信息——删除并在
// `hyphenation`/`typography` 两文件中已有 span 的真实换行契约（overflow-wrap/hyphens/
// line-clamp）块级断言。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 本契约受管的四个块（pretty 载体 ×3 + summary 的 overflow-wrap）。
const MANAGED=['.sw-home-store__card-head strong','.sw-home-store__status','.sw-home-store__group','.sw-home-store__summary'];
const managedRules=parseRules(css).filter((rule)=>rule.atDepth===0
    && rule.selectors.some((item)=>MANAGED.includes(item)));
// 声明了 text-wrap: pretty 的规则（全文件 3 条），供逐规则否定使用（含非空自检）。
const prettyRules=parseRules(css).filter((rule)=>/text-wrap: pretty/.test(rule.declarations));

test('pretty wrapping property exists',()=>assert.ok(css.includes('text-wrap: pretty')));
test('title keeps balance fallback',()=>assert.ok(css.includes('text-wrap: balance')));
test('title has pretty wrapping',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/text-wrap: pretty/,base)));
test('status has pretty wrapping',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/text-wrap: pretty/,base)));
test('group has pretty wrapping',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/text-wrap: pretty/,base)));
test('summary text remains wrapped',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/overflow-wrap: anywhere/,base)));
test('pretty wrapping keeps hyphens',()=>assert.ok(css.includes('hyphens: auto')));
test('pretty wrapping keeps line heights',()=>assert.ok(css.includes('line-height: 1.35')));
test('pretty wrapping keeps mobile',()=>assert.ok(css.includes('max-width: 560px')));
test('pretty wrapping keeps print',()=>assert.ok(css.includes('@media print')));
test('pretty wrapping keeps high contrast',()=>assert.ok(css.includes('forced-colors: active')));
test('pretty wrapping keeps reduced motion',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('pretty wrapping is standard CSS',()=>assert.ok(css.includes('text-wrap: pretty')));
// 否定式窗口的正确形态：先取声明了 pretty 的规则，再断言这些规则自身不含外部依赖。
test('pretty wrapping avoids network',()=>{
    assert.ok(prettyRules.length>0,'审计面塌缩：没有任何声明 text-wrap: pretty 的规则');
    for(const rule of prettyRules) assert.doesNotMatch(rule.declarations,/url\(/);
});
test('pretty wrapping avoids scripting',()=>{
    assert.ok(prettyRules.length>0,'审计面塌缩：没有任何声明 text-wrap: pretty 的规则');
    for(const rule of prettyRules) assert.doesNotMatch(rule.declarations,/javascript/);
});
test('pretty wrapping keeps title block',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/display: block/,base)));
test('pretty wrapping keeps description clamp',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/-webkit-line-clamp: 2/,base)));
test('pretty wrapping keeps status display',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/display: block/,base)));
test('pretty wrapping keeps group spacing',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/letter-spacing: 0\.04em/,base)));
test('pretty wrapping keeps summary spacing',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/font-size: 11px/,base)));
test('pretty wrapping keeps font adjust',()=>assert.ok(css.includes('font-size-adjust: from-font')));
test('pretty wrapping keeps numeric style',()=>assert.ok(css.includes('font-variant-numeric: tabular-nums')));
test('pretty wrapping keeps focus',()=>assert.ok(css.includes('focus-visible')));
test('pretty wrapping keeps touch',()=>assert.ok(css.includes('touch-action: manipulation')));
test('pretty wrapping scoped to store',()=>assert.ok(css.includes('sw-home-store__card-head')));
test('pretty wrapping scoped to status',()=>assert.ok(css.includes('sw-home-store__status')));
test('pretty wrapping scoped to group',()=>assert.ok(css.includes('sw-home-store__group')));
test('pretty wrapping deterministic',()=>assert.ok(css.includes('text-wrap: pretty')&&css.includes('text-wrap: balance')));
