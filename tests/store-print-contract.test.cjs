const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396 第二十批）：7 条窗口断言迁移——print 分支内各规则用
// `{atRule: /@media print/}` 钉分支；3 条重复窗口（block scoped / keeps cards visible /
// keeps headings visible 三写一意）合并删除 2 条、`\n}` 冗余删除 1 条
// （31 → 28 条测试）。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const printScope={atRule: /@media print/};
test('print media query exists',()=>assert.match(css,/@media print/));
test('print hides search',()=>assert.match(css,/sw-home-store__search/));
test('print hides tabs',()=>assert.match(css,/sw-home-store__tabs/));
test('print hides size controls',()=>assert.match(css,/sw-home-store__sizes/));
test('print hides previews',()=>assert.match(css,/sw-home-store__preview/));
test('print hides group toggles',()=>assert.match(css,/sw-home-store__group-toggle/));
test('print uses important display override',()=>assert.match(css,/display: none !important/));
test('print avoids card breaks',()=>assert.match(css,/break-inside: avoid/));
test('print removes shadow',()=>assert.match(css,/box-shadow: none/));
test('print uses readable border',()=>assert.match(css,/border: 1px solid #888/));
test('print uses black text',()=>assert.match(css,/color: #000/));
test('print uses white background',()=>assert.match(css,/background: #fff/));
test('print keeps card head text',()=>assert.match(css,/sw-home-store__card-head span/));
test('print keeps support text',()=>assert.match(css,/sw-home-store__support/));
test('print keeps status text',()=>assert.match(css,/sw-home-store__status/));
test('print darkens secondary text',()=>assert.match(css,/color: #333/));
test('print block scoped',()=>assert.ok(declaresIn(css,'.sw-home-store__card',/break-inside: avoid/,printScope)));
test('print keeps status colors readable',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/color: #333/,printScope)));
test('print keeps support colors readable',()=>assert.ok(declaresIn(css,'.sw-home-store__support',/color: #333/,printScope)));
test('print uses card border fallback',()=>assert.match(css,/border: 1px solid #888/));
test('print card avoids shadow noise',()=>assert.match(css,/box-shadow: none/));
test('print card avoids page split',()=>assert.match(css,/break-inside: avoid/));
test('print controls hidden together',()=>assert.ok(declaresIn(css,'.sw-home-store__search',/display: none !important/,printScope)));
test('print preview hidden',()=>assert.match(css,/sw-home-store__preview,/));
test('print size row hidden',()=>assert.match(css,/sw-home-store__sizes,/));
test('print toggle hidden',()=>assert.match(css,/sw-home-store__group-toggle\s*\{/));
test('print high contrast independent',()=>assert.match(css,/@media \(forced-colors: active\)/));
test('print contract deterministic',()=>assert.ok(css.includes('@media print')&&css.includes('break-inside: avoid')));
