const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,findRules,parseRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396）：作用域迁移。本文件原有 9 条窗口断言，分四档处理：
//
//   ① 4 条"选择器→声明"改块级断言（`{topLevel: true}`）。
//   ② 3 条否定式/守卫式窗口改逐规则：`source-meta…z-index: 2147483647`（防巨型 z-index）
//      改为"匹配 source-meta 的规则（基础 + 窄屏覆盖）都不得声明 2147483647"；
//      `isolation…url\(`/`javascript` 改为"声明 isolation 的规则（全文件 2 条）自身不含依赖"。
//   ③ 2 条删除：`stacking contract closes`（`\}` 冗余）与 `stacking uses one metadata z index`
//      （迁移后与 `source metadata has z index` 逐字相同，纯冗余）（30 → 28 条测试，README/快照同步）。
// 读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 本契约受管的三个块。
const SOURCE_META='.sw-home-store__source-meta';
// 声明了 isolation: isolate 的规则（全文件 2 条），供逐规则否定使用（含非空自检）。
const isolationRules=parseRules(css).filter((rule)=>/isolation:\s*isolate/.test(rule.declarations));
// 匹配 source-meta 的规则（基础 + 窄屏覆盖），供防巨型 z-index 使用（含非空自检）。
const sourceMetaRules=findRules(css,SOURCE_META,{});

test('store grid isolates stacking',()=>assert.ok(declaresIn(css,'.sw-home-store__grid',/isolation: isolate/,base)));
test('store card isolates stacking',()=>assert.ok(declaresIn(css,'.sw-home-store__card',/isolation: isolate/,base)));
test('source metadata is positioned',()=>assert.ok(declaresIn(css,'.sw-home-store__source-meta',/position: relative/,base)));
test('source metadata has z index',()=>assert.ok(declaresIn(css,'.sw-home-store__source-meta',/z-index: 1/,base)));
test('grid keeps overscroll',()=>assert.ok(css.includes('overscroll-behavior: contain')));
test('card keeps border box',()=>assert.ok(css.includes('box-sizing: border-box')));
test('stacking preserves focus',()=>assert.ok(css.includes('focus-visible')));
test('stacking preserves hover',()=>assert.ok(css.includes('&:hover')));
test('stacking preserves mobile',()=>assert.ok(css.includes('max-width: 560px')));
test('stacking preserves print',()=>assert.ok(css.includes('@media print')));
test('stacking preserves forced colors',()=>assert.ok(css.includes('forced-colors: active')));
test('stacking preserves reduced motion',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('isolation is standard',()=>assert.ok(css.includes('isolation: isolate')));
test('position is standard',()=>assert.ok(css.includes('position: relative')));
test('z index is bounded',()=>assert.ok(css.includes('z-index: 1')));
// 守卫式窗口的正确形态：匹配 source-meta 的规则（含窄屏覆盖）都不得声明巨型 z-index。
test('stacking avoids giant z index',()=>{
    assert.ok(sourceMetaRules.length>0,'审计面塌缩：没有任何 source-meta 规则');
    for(const rule of sourceMetaRules) assert.doesNotMatch(rule.declarations,/z-index:\s*2147483647/);
});
// 否定式窗口的正确形态：先取声明了 isolation 的规则，再断言这些规则自身不含外部依赖。
test('stacking avoids network',()=>{
    assert.ok(isolationRules.length>0,'审计面塌缩：没有任何声明 isolation 的规则');
    for(const rule of isolationRules) assert.doesNotMatch(rule.declarations,/url\(/);
});
test('stacking avoids script',()=>{
    assert.ok(isolationRules.length>0,'审计面塌缩：没有任何声明 isolation 的规则');
    for(const rule of isolationRules) assert.doesNotMatch(rule.declarations,/javascript/);
});
test('grid scope remains',()=>assert.ok(css.includes('sw-home-store__grid')));
test('card scope remains',()=>assert.ok(css.includes('sw-home-store__card')));
test('metadata scope remains',()=>assert.ok(css.includes('sw-home-store__source-meta')));
test('stacking keeps content visibility',()=>assert.ok(css.includes('content-visibility: auto')));
test('stacking keeps intrinsic size',()=>assert.ok(css.includes('contain-intrinsic-size')));
test('stacking keeps typography',()=>assert.ok(css.includes('font-size-adjust: from-font')));
test('stacking keeps wrapping',()=>assert.ok(css.includes('word-break: break-word')));
test('stacking keeps touch',()=>assert.ok(css.includes('touch-action: manipulation')));
test('grid isolation deterministic',()=>assert.ok(css.includes('sw-home-store__grid')&&css.includes('isolation: isolate')));
test('card isolation deterministic',()=>assert.ok(css.includes('sw-home-store__card')&&css.includes('isolation: isolate')));
