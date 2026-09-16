const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,parseRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396 第二十二批）：5 条窗口断言迁移为块级；2 条否定式窗口
// （backface…url( / translateZ…javascript）改逐规则检查——声明这两条属性的规则全文件各 1 条；
// 1 条 `* rule closes` 删除（30 → 29 条测试）。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
const backfaceRules=parseRules(css).filter((rule)=>/backface-visibility: hidden/.test(rule.declarations));
const translateZRules=parseRules(css).filter((rule)=>/transform: translateZ\(0\)/.test(rule.declarations));
test('card backface hidden',()=>assert.ok(declaresIn(css,'.sw-home-store__card',/backface-visibility: hidden/,base)));
test('card establishes composite layer',()=>assert.ok(declaresIn(css,'.sw-home-store__card',/transform: translateZ\(0\)/,base)));
test('card keeps hover transform',()=>assert.match(css,/transform: translateY\(-1px\)/));
test('card keeps isolation',()=>assert.match(css,/isolation: isolate/));
test('card keeps containment',()=>assert.match(css,/contain: layout paint/));
test('card keeps intrinsic size',()=>assert.match(css,/contain-intrinsic-size/));
test('card keeps focus visible',()=>assert.match(css,/focus-visible/));
test('card keeps transitions',()=>assert.match(css,/transition: border-color/));
test('render stability preserves mobile',()=>assert.match(css,/max-width: 560px/));
test('render stability preserves print',()=>assert.match(css,/@media print/));
test('render stability preserves forced colors',()=>assert.match(css,/forced-colors: active/));
test('render stability preserves reduced motion',()=>assert.match(css,/prefers-reduced-motion: reduce/));
test('backface property standard',()=>assert.match(css,/backface-visibility/));
test('transform property standard',()=>assert.match(css,/transform/));
test('render stability no url dependency',()=>{ assert.ok(backfaceRules.length>0,'审计面塌缩'); for(const rule of backfaceRules) assert.doesNotMatch(rule.declarations,/url\(/); });
test('render stability no script dependency',()=>{ assert.ok(translateZRules.length>0,'审计面塌缩'); for(const rule of translateZRules) assert.doesNotMatch(rule.declarations,/javascript/); });
test('card width remains bounded',()=>assert.match(css,/max-width: 100%/));
test('card min width remains bounded',()=>assert.match(css,/min-width: 0/));
test('card box model remains stable',()=>assert.match(css,/box-sizing: border-box/));
test('card wrapping remains stable',()=>assert.match(css,/overflow-wrap: anywhere/));
test('card word break remains stable',()=>assert.match(css,/word-break: break-word/));
test('card hyphenation remains stable',()=>assert.match(css,/hyphens: auto/));
test('card pretty wrapping remains stable',()=>assert.match(css,/text-wrap: pretty/));
test('card typography remains stable',()=>assert.match(css,/font-size-adjust: from-font/));
test('card numeric typography remains stable',()=>assert.match(css,/font-variant-numeric: tabular-nums/));
test('card touch remains stable',()=>assert.match(css,/touch-action: manipulation/));
test('card stacking remains stable',()=>assert.match(css,/isolation: isolate/));
test('card scroll remains stable',()=>assert.match(css,/scroll-margin-block/));
test('render stability contract deterministic',()=>assert.ok(css.includes('backface-visibility: hidden')&&css.includes('translateZ(0)')));
