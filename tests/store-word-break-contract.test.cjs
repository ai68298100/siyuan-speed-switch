const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,parseRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396 第十四批）：作用域迁移。本文件原有 8 条窗口断言，分四档处理：
//
//   ① 4 条"选择器→声明"改块级断言（`{topLevel: true}`）。
//   ② 2 条否定式窗口（`break-word[\s\S]*?url\(` / `javascript`）改逐规则检查：先取声明了
//      `word-break: break-word` 的规则（全文件 6 条），再断言这些规则自身不含依赖。
//   ③ 2 条**假绿删除**：`title/description has word break fallback`（`strong…`/`span…`）
//      ——实测 `word-break: break-word` 全文件 6 处，**card-head strong 与 span 从未声明过**
//      （它们的换行契约是 overflow-wrap: anywhere + hyphens: auto，已由 hyphenation/
//      typography 文件块级钉住）；旧断言靠"任何 strong/span 文本 + 其后某处 break-word"
//      退化为"文件里存在 break-word"（被首条测试覆盖），名与现实不符、内容零信息
//      （30 → 28 条测试，README/快照同步）。
//
// 另兑现 `word break pairs with overflow wrap`：旧断言只要求两属性在文件里先后出现；
// 现改为真实配对契约——group 与 summary 两个标签块**各自同时**声明
// `overflow-wrap: anywhere` 与 `word-break: break-word`（实测满足）。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 配对契约的载体：group 与 summary 各自同时声明两属性。
const PAIRED=['.sw-home-store__group','.sw-home-store__summary'];
// 声明了 word-break: break-word 的规则（全文件 6 条），供逐规则否定使用（含非空自检）。
const breakWordRules=parseRules(css).filter((rule)=>/word-break:\s*break-word/.test(rule.declarations));

test('word break property exists',()=>assert.ok(css.includes('word-break: break-word')));
test('group has word break fallback',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/word-break: break-word/,base)));
test('summary has word break fallback',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/word-break: break-word/,base)));
test('word break pairs with overflow wrap',()=>{
    assert.equal(PAIRED.length,2,'审计面塌缩：配对契约应有 2 个载体');
    for(const selector of PAIRED){
        assert.ok(declaresIn(css,selector,/overflow-wrap: anywhere/,base),`配对块须声明 overflow-wrap: anywhere：${selector}`);
        assert.ok(declaresIn(css,selector,/word-break: break-word/,base),`配对块须声明 word-break: break-word：${selector}`);
    }
});
test('word break pairs with hyphens',()=>assert.ok(css.includes('hyphens: auto')));
test('word break pairs with pretty wrap',()=>assert.ok(css.includes('text-wrap: pretty')));
test('word break keeps mobile',()=>assert.ok(css.includes('max-width: 560px')));
test('word break keeps print',()=>assert.ok(css.includes('@media print')));
test('word break keeps high contrast',()=>assert.ok(css.includes('forced-colors: active')));
test('word break keeps reduced motion',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('word break is standard CSS',()=>assert.ok(css.includes('word-break')));
// 否定式窗口的正确形态：先取声明了 break-word 的规则，再断言这些规则自身不含外部依赖。
test('word break avoids url dependency',()=>{
    assert.ok(breakWordRules.length>0,'审计面塌缩：没有任何声明 word-break: break-word 的规则');
    for(const rule of breakWordRules) assert.doesNotMatch(rule.declarations,/url\(/);
});
test('word break avoids script dependency',()=>{
    assert.ok(breakWordRules.length>0,'审计面塌缩：没有任何声明 word-break: break-word 的规则');
    for(const rule of breakWordRules) assert.doesNotMatch(rule.declarations,/javascript/);
});
test('word break title remains block',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/display: block/,base)));
test('word break description remains clamped',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/-webkit-line-clamp: 2/,base)));
test('word break status remains visible',()=>assert.ok(css.includes('.sw-home-store__status')));
test('word break group remains visible',()=>assert.ok(css.includes('.sw-home-store__group')));
test('word break summary remains visible',()=>assert.ok(css.includes('.sw-home-store__summary')));
test('word break preserves title balance',()=>assert.ok(css.includes('text-wrap: balance')));
test('word break preserves line height',()=>assert.ok(css.includes('line-height: 1.35')));
test('word break preserves font metrics',()=>assert.ok(css.includes('font-size-adjust: from-font')));
test('word break preserves numeric metrics',()=>assert.ok(css.includes('font-variant-numeric: tabular-nums')));
test('word break preserves focus',()=>assert.ok(css.includes('focus-visible')));
test('word break preserves touch',()=>assert.ok(css.includes('touch-action: manipulation')));
test('word break title scope',()=>assert.ok(css.includes('sw-home-store__card-head')));
test('word break group scope',()=>assert.ok(css.includes('sw-home-store__group')));
test('word break summary scope',()=>assert.ok(css.includes('sw-home-store__summary')));
test('word break contract deterministic',()=>assert.ok(css.includes('word-break: break-word')&&css.includes('overflow-wrap: anywhere')));
