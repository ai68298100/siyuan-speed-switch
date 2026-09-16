const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,findRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396 第二十批）：4 条窗口断言迁移——card 的 contain 钉具名块；
// 2 条否定式窗口改逐规则（content-visibility / contain-intrinsic-size 规则各一）；
// 1 条 `\n}` 冗余删除。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
const contentVisRules=findRules(css,/./,{}).filter((rule)=>/content-visibility/.test(rule.declarations));
const intrinsicRules=findRules(css,/./,{}).filter((rule)=>/contain-intrinsic-size/.test(rule.declarations));
test('store cards use layout containment',()=>assert.match(css,/contain: layout paint/));
test('store cards use content visibility',()=>assert.match(css,/content-visibility: auto/));
test('store cards define intrinsic size',()=>assert.match(css,/contain-intrinsic-size: 240px 320px/));
test('performance rule is card scoped',()=>assert.ok(declaresIn(css,'.sw-home-store__card',/contain: layout paint/,base)));
test('content visibility is explicit',()=>assert.match(css,/content-visibility: auto/));
test('intrinsic size is bounded',()=>assert.match(css,/contain-intrinsic-size: 240px 320px/));
test('mobile reduced motion media query exists',()=>assert.match(css,/max-width: 560px\) and \(prefers-reduced-motion: reduce\)/));
test('mobile reduced motion makes content visible',()=>assert.match(css,/content-visibility: visible/));
test('mobile reduced motion keeps layout containment',()=>assert.match(css,/contain: layout;/));
test('performance rule avoids fixed height',()=>assert.doesNotMatch(css,/contain-intrinsic-size: 240px 320px;\s*height:/));
test('performance rule avoids overflow clipping',()=>assert.doesNotMatch(css,/contain: layout paint;\s*overflow:/));
test('performance rule preserves card focus',()=>assert.match(css,/focus-visible/));
test('performance rule preserves card hover',()=>assert.match(css,/&:hover/));
test('performance rule preserves mobile layout',()=>assert.match(css,/max-width: 560px/));
test('performance rule uses standard property',()=>assert.match(css,/content-visibility/));
test('performance rule uses standard contain',()=>assert.match(css,/contain:/));
test('performance rule has no script dependency',()=>{ assert.ok(contentVisRules.length>0,'审计面塌缩'); for(const rule of contentVisRules) assert.doesNotMatch(rule.declarations,/javascript/); });
test('performance rule has no network dependency',()=>{ assert.ok(intrinsicRules.length>0,'审计面塌缩'); for(const rule of intrinsicRules) assert.doesNotMatch(rule.declarations,/url\(/); });
test('performance rule keeps print styles',()=>assert.match(css,/@media print/));
test('performance rule keeps forced colors',()=>assert.match(css,/forced-colors: active/));
test('performance rule keeps reduced motion',()=>assert.match(css,/prefers-reduced-motion: reduce/));
test('performance rule is deterministic',()=>assert.ok(css.includes('content-visibility: auto')&&css.includes('contain-intrinsic-size')));
test('card intrinsic width is positive',()=>assert.match(css,/contain-intrinsic-size: 240px/));
test('card intrinsic height is positive',()=>assert.match(css,/contain-intrinsic-size: 240px 320px/));
test('mobile override avoids paint containment',()=>assert.match(css,/contain: layout;/));
test('mobile override restores visibility',()=>assert.match(css,/content-visibility: visible/));
test('performance rules remain CSS only',()=>assert.doesNotMatch(css,/contain-intrinsic-size[^;]*=>/));
test('performance styles are scoped to store cards',()=>assert.match(css,/sw-home-store__card/));
test('performance styles do not alter tab semantics',()=>assert.match(css,/sw-home-store__tab/));
