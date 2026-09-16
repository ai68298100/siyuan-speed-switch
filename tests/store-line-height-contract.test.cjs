const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,parseRules,normalizeSelector}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396）：作用域迁移 + 兑现名字。本文件原有 14 条窗口断言，分三档处理：
//
//   ① 10 条"选择器→声明"改块级断言（`{topLevel: true}`）。其中 3 条的锚点过于宽泛——
//      `/strong[\s\S]*?line-height: 1\.35/` 里的 `strong` 匹配**全文件任何一个** strong，
//      比 `.sw-home-store__card[\s\S]*?…` 那类还退化；现按展开后的真实选择器书写。
//   ② 2 条否定式窗口（`line-height: 1\.45[\s\S]*?url\(` / `javascript`）改逐规则检查：
//      先取声明了 `line-height: 1.45` 的规则（全文件 4 条），再断言这些规则自身不含依赖。
//   ③ 3 条 `* rule closes` **删除**：`/strong[\s\S]*?line-height: 1\.35[\s\S]*?\}/` 里的
//      `\}` 由文件后面**任何一个** `}` 满足，从未验证过块的完整性；而块解析版的
//      `is defined` 本身就要求"存在一个合法闭合的规则块声明了它"——严格强于旧断言，
//      这三条是纯冗余（该文件 30 → 27 条测试，README/快照同步）。
//
// 另兑现两条**名不副实**的断言（都先侦察过真实数据再落笔）：
//   - `avoids px lock` 旧断言检查的是 `line-height: 1\.35;\s*height:`（相邻才拦），
//     与"像素"无关；现改为"受管五块不得写死 `height:`"（`min-`/`max-` 不受限——
//     实测 status/group/summary 各有一条合法的 min-height）。
//   - `uses unitless values` 旧断言只是"文件里存在 1.35"；现改为"受管五块的行高必须
//     是无单位数值"。**不能写成全文件禁 px**：实测设置页/工具栏等 7 处存在合法的
//     像素行高（如 `.sw__mobile-sheet-count` 的 16px），全文件禁令会是假红。
// `description retains font size` 原是文件级"包含 12px"，顺带收紧到块级。
// 读取改用 readSourceFile：剥注释后返回，且限定源码扩展名。
const css=readSourceFile('src/index.scss');
const base={topLevel: true};
// 本契约受管的五个块（竖向节奏 = 无单位行高 × 同块字号）。供逐规则不变式使用。
const MANAGED=['.sw-home-store__card-head strong','.sw-home-store__card-head span','.sw-home-store__status','.sw-home-store__group','.sw-home-store__summary'];
const managedRules=parseRules(css).filter((rule)=>rule.atDepth===0
    && rule.selectors.some((item)=>MANAGED.includes(item)));
// 声明了 line-height: 1.45 的规则（全文件 4 条），供逐规则否定使用（含非空自检，防集合为空时恒真）。
const lh145Rules=parseRules(css).filter((rule)=>/line-height: 1\.45/.test(rule.declarations));

test('title line height is defined',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/line-height: 1\.35/,base)));
test('description line height is defined',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/line-height: 1\.45/,base)));
test('status line height is defined',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/line-height: 1\.35/,base)));
test('group line height is defined',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/line-height: 1\.35/,base)));
test('summary line height is defined',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/line-height: 1\.45/,base)));
test('title retains font size',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head strong',/font-size: 13px/,base)));
test('description retains font size',()=>assert.ok(declaresIn(css,'.sw-home-store__card-head span',/font-size: 12px/,base)));
test('status retains font size',()=>assert.ok(declaresIn(css,'.sw-home-store__status',/font-size: 11px/,base)));
test('group retains font size',()=>assert.ok(declaresIn(css,'.sw-home-store__group',/font-size: 12px/,base)));
test('summary retains font size',()=>assert.ok(declaresIn(css,'.sw-home-store__summary',/font-size: 11px/,base)));
test('line height uses unitless values',()=>{
    assert.equal(managedRules.length,MANAGED.length,'审计面塌缩：受管块应有 5 条基础规则');
    for(const rule of managedRules){
        for(const line of rule.declarations.split('\n')){
            if(!/line-height:/.test(line)) continue;
            const value=line.split(':')[1].replace(';','').trim();
            assert.match(value,/^\d+(\.\d+)?$/,`行高必须是无单位数值：${rule.selectors.join(', ')} → ${value}`);
        }
    }
});
test('line height avoids px lock',()=>{
    assert.equal(managedRules.length,MANAGED.length,'审计面塌缩：受管块应有 5 条基础规则');
    for(const rule of managedRules){
        for(const line of rule.declarations.split('\n')){
            assert.doesNotMatch(line,/^\s*height:/,`受管块不得写死 height（min-/max- 不受限）：${rule.selectors.join(', ')}`);
        }
    }
});
// 下面 12 条本来就是合法的"文件级存在"断言（没有窗口模式），保持原样。
test('line height preserves wrapping',()=>assert.ok(css.includes('overflow-wrap: anywhere')));
test('line height preserves hyphens',()=>assert.ok(css.includes('hyphens: auto')));
test('line height preserves balancing',()=>assert.ok(css.includes('text-wrap: balance')));
test('line height preserves mobile',()=>assert.ok(css.includes('max-width: 560px')));
test('line height preserves print',()=>assert.ok(css.includes('@media print')));
test('line height preserves forced colors',()=>assert.ok(css.includes('forced-colors: active')));
test('line height preserves reduced motion',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('line height title scoped',()=>assert.ok(css.includes('sw-home-store__card-head')));
test('line height status scoped',()=>assert.ok(css.includes('sw-home-store__status')));
test('line height group scoped',()=>assert.ok(css.includes('sw-home-store__group')));
test('line height summary scoped',()=>assert.ok(css.includes('sw-home-store__summary')));
test('line height standard property',()=>assert.ok(css.includes('line-height')));
// 否定式窗口的正确形态：先取声明了 1.45 的规则，再断言这些规则自身不含外部依赖。
test('line height no network',()=>{
    assert.ok(lh145Rules.length>0,'审计面塌缩：没有任何声明 line-height: 1.45 的规则');
    for(const rule of lh145Rules) assert.doesNotMatch(rule.declarations,/url\(/);
});
test('line height no script',()=>{
    assert.ok(lh145Rules.length>0,'审计面塌缩：没有任何声明 line-height: 1.45 的规则');
    for(const rule of lh145Rules) assert.doesNotMatch(rule.declarations,/javascript/);
});
test('line height contract deterministic',()=>assert.ok(css.includes('line-height: 1.35')&&css.includes('line-height: 1.45')));
