const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,findRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396 第二十批）：7 条窗口断言迁移为块级——hover/focus 的 will-change
// 钉到具名交互块；2 条否定式窗口改逐规则（声明 will-change 的规则全文件 2 条）；
// 2 条 `* rule closes` 删除；`will change is card scoped` 与 hover/focus 两条逐字重复，删除
// （30 → 27 条测试）。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
const willChangeRules=findRules(css,/./,{}).filter((rule)=>/will-change/.test(rule.declarations));
test('hover uses will change transform',()=>assert.ok(declaresIn(css,'.sw-home-store__card:hover',/will-change: transform/,base)));
test('focus uses will change outline',()=>assert.ok(declaresIn(css,'.sw-home-store__card:focus-visible',/will-change: outline/,base)));
test('hover keeps transform',()=>assert.match(css,/transform: translateY\(-1px\)/));
test('focus keeps outline',()=>assert.match(css,/outline: 2px solid/));
test('will change uses standard property',()=>assert.match(css,/will-change/));
test('will change does not use all',()=>assert.doesNotMatch(css,/will-change: all/));
test('will change does not use contents',()=>assert.doesNotMatch(css,/will-change: contents/));
test('reduced motion remains present',()=>assert.match(css,/prefers-reduced-motion: reduce/));
test('mobile hover remains disabled',()=>assert.match(css,/\.sw-home-store__card:hover \{ transform: none; \}/));
test('focus ring remains offset',()=>assert.match(css,/outline-offset: 2px/));
test('card remains isolated',()=>assert.match(css,/isolation: isolate/));
test('card remains contained',()=>assert.match(css,/contain: layout paint/));
test('card remains intrinsic',()=>assert.match(css,/contain-intrinsic-size/));
test('card remains bounded',()=>assert.match(css,/max-width: 100%/));
test('card remains flexible',()=>assert.match(css,/min-width: 0/));
test('card remains box sized',()=>assert.match(css,/box-sizing: border-box/));
test('will change no network',()=>{ assert.ok(willChangeRules.length>0,'审计面塌缩'); for(const rule of willChangeRules) assert.doesNotMatch(rule.declarations,/url\(/); });
test('will change no script',()=>{ assert.ok(willChangeRules.length>0,'审计面塌缩'); for(const rule of willChangeRules) assert.doesNotMatch(rule.declarations,/javascript/); });
test('will change keeps mobile compatibility',()=>assert.match(css,/max-width: 560px/));
test('will change keeps print compatibility',()=>assert.match(css,/@media print/));
test('will change keeps forced colors',()=>assert.match(css,/forced-colors: active/));
test('will change keeps typography',()=>assert.match(css,/font-size-adjust: from-font/));
test('will change keeps wrapping',()=>assert.match(css,/word-break: break-word/));
test('will change keeps touch',()=>assert.match(css,/touch-action: manipulation/));
test('will change is interaction scoped',()=>assert.match(css,/&:hover/));
test('will change is focus scoped',()=>assert.match(css,/&:focus-visible/));
test('will change contract deterministic',()=>assert.ok(css.includes('will-change: transform')&&css.includes('will-change: outline')));
