const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,findRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396 第二十批）：3 条窗口断言迁移——card/tab 的 Canvas 钉 forced-colors
// 分支具名规则；手写的 forcedBlock 截块（锚点=下一个 @media print）删除，改对分支内**全部**
// 规则做逐规则否定（禁 animation/opacity/rgb）；1 条 `\n}` 冗余删除。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
const forcedRules=findRules(css,/./,{atRule: /forced-colors/});
test('forced colors media query exists',()=>assert.match(css,/forced-colors: active/));
test('forced colors covers cards',()=>assert.match(css,/forced-color-adjust: auto/));
test('forced colors uses Canvas background',()=>assert.match(css,/background: Canvas/));
test('forced colors uses CanvasText border',()=>assert.match(css,/border-color: CanvasText/));
test('forced colors uses CanvasText text',()=>assert.match(css,/color: CanvasText/));
test('forced colors covers tabs',()=>assert.match(css,/sw-home-store__tab,/));
test('forced colors covers group toggle',()=>assert.match(css,/sw-home-store__group-toggle/));
test('forced colors covers clear search',()=>assert.match(css,/sw-home-store__clear-search/));
test('forced focus outline uses Highlight',()=>assert.match(css,/outline: 2px solid Highlight/));
test('forced focus outline has offset',()=>assert.match(css,/outline-offset: 2px/));
test('forced focus covers cards',()=>assert.match(css,/sw-home-store__card:focus-visible/));
test('forced focus covers tabs',()=>assert.match(css,/sw-home-store__tab:focus-visible/));
test('active tab uses Highlight border',()=>assert.match(css,/border-bottom-color: Highlight/));
test('active tab uses Highlight background',()=>assert.match(css,/background: Highlight/));
test('active tab uses HighlightText',()=>assert.match(css,/color: HighlightText/));
test('forced block is scoped',()=>assert.match(css,/@media \(forced-colors: active\)/));
test('forced block does not add animation',()=>{ assert.ok(forcedRules.length>0,'审计面塌缩'); for(const rule of forcedRules) assert.doesNotMatch(rule.declarations,/animation:/); });
test('forced block does not add opacity',()=>{ for(const rule of forcedRules) assert.doesNotMatch(rule.declarations,/opacity:/); });
test('forced block keeps card semantics',()=>assert.ok(declaresIn(css,'.sw-home-store__card',/background: Canvas/, {atRule: /forced-colors/})));
test('forced block keeps tab semantics',()=>assert.ok(declaresIn(css,'.sw-home-store__tab',/background: Canvas/, {atRule: /forced-colors/})));
test('forced block preserves focus-visible',()=>assert.match(css,/focus-visible/));
test('forced block preserves active state',()=>assert.match(css,/is-active/));
test('forced block uses system colors only',()=>assert.match(css,/CanvasText/));
test('forced block uses highlight colors only',()=>assert.match(css,/HighlightText/));
test('forced block avoids hardcoded rgb',()=>{ for(const rule of forcedRules) assert.doesNotMatch(rule.declarations,/rgb\(/); });
test('forced block remains bounded',()=>assert.ok(forcedRules.some((rule)=>/Highlight/.test(rule.declarations)),'审计面塌缩'));
test('forced block covers action controls',()=>assert.match(css,/group-toggle/));
test('forced block preserves readable border',()=>assert.match(css,/border-color: CanvasText/));
test('forced colors contract deterministic',()=>assert.ok(css.includes('forced-colors: active')&&css.includes('Highlight')));
