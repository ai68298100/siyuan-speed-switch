const test=require('node:test');const assert=require('node:assert/strict');
const {readSourceFile}=require('./source-scan.cjs');
const {declaresIn,findRules}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396 第十五批）：作用域迁移。本文件原有 10 条窗口断言（普查口径，
// 含 1 条重复计数），分四档处理：
//
//   ① 5 条"选择器→声明"改块级断言，且全部用 `{atRule: /prefers-reduced-motion: reduce/}`
//      **钉在减弱动效分支上**（把 `transition: none !important` 挪去别的分支必须失败）；
//      `&:focus-visible` 按展开选择器（`.sw-home-store__card:focus-visible` 等）钉住外框声明。
//   ② 1 条否定式窗口（`reduce…pointer-events: none`）改逐规则：减弱动效分支里的**全部**
//      规则都不得声明 `pointer-events: none`（保证不误禁指针输入）。
//   ③ 2 条"reduce 分支里有 card/tab 规则"的窗口改写为覆盖声明检查（分支内每条 card/tab
//      规则都必须带 transition: none !important——顺带兑现了名不副实：原名说 border/semantics，
//      实际守护的是覆盖本身）。
//   ④ 2 条删除：`motion fallback has closing brace`（`\n\}` 由任何块尾满足）与
//      `motion styles keep bounded scope`（与 `reduced motion keeps card border` 逐字重复）
//      （35 → 33 条测试，README/快照同步）。读取改用 readSourceFile。
const css=readSourceFile('src/index.scss');
const reduce={atRule: /prefers-reduced-motion: reduce/};
const base={topLevel: true};
// 减弱动效分支里的全部规则，供逐规则否定使用（含非空自检）。
const reduceRules=findRules(css,/./,reduce);
// 卡片与 tab 在**纯** reduce 分支里的覆盖规则。判据是条件链**恰好等于** reduce 媒体——
// 复合分支（`560px and reduce`，条件合写为一条）职责不同，不计入（T-6283：身份而非深度/条数）。
const pureReduce=(rule)=>rule.atRules.length===1 && rule.atRules[0]==='@media (prefers-reduced-motion: reduce)';
const cardReduce=findRules(css,'.sw-home-store__card',reduce).filter(pureReduce);
const tabReduce=findRules(css,'.sw-home-store__tab',reduce).filter(pureReduce);

test('reduced motion media query exists',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
test('reduced motion disables card transition',()=>assert.ok(declaresIn(css,'.sw-home-store__card',/transition: none !important/,reduce)));
test('reduced motion disables tab transition',()=>assert.ok(declaresIn(css,'.sw-home-store__tab',/transition: none !important/,reduce)));
test('reduced motion disables hover transform',()=>assert.ok(declaresIn(css,'.sw-home-store__card:hover',/transform: none/,reduce)));
test('motion query uses standard syntax',()=>assert.ok(css.includes('@media (prefers-reduced-motion: reduce)')));
// 以下三条改绑动效令牌而非具体字面量（D-362）：保留"过渡仍然存在"的回归保护，
// 同时不再因调整档位或曲线而误报。令牌定义在 src/index.scss 顶部。
test('card transition remains defined',()=>assert.match(css,/transition: border-color \$sw-dur-\w+ \$sw-ease/));
test('tab transition remains defined',()=>assert.match(css,/transition: color \$sw-dur-\w+, border-color \$sw-dur-\w+/));
test('mobile hover transform remains disabled',()=>assert.match(css,/\.sw-home-store__card:hover \{ transform: none; \}/));
test('card focus visible remains present',()=>assert.ok(css.includes('&:focus-visible')));
test('tab focus visible remains present',()=>assert.match(css,/outline: 2px solid var\(--b3-theme-primary\)/));
test('reduced motion block is present',()=>assert.ok(css.includes('prefers-reduced-motion: reduce')));
// 减弱动效分支的正确守卫：分支内全部规则都不得误禁指针输入。
test('reduced motion does not disable pointer input',()=>{
    assert.ok(reduceRules.length>0,'审计面塌缩：减弱动效分支内没有规则');
    for(const rule of reduceRules){
        if(!pureReduce(rule)) continue; // 复合分支（560px and reduce 等）不在本守卫内
        assert.doesNotMatch(rule.declarations,/pointer-events:\s*none/,`减弱动效分支不得禁指针输入：${rule.selectors.join(', ')}`);
    }
});
test('reduced motion keeps card override',()=>{
    assert.ok(cardReduce.length>0,'审计面塌缩：减弱动效分支内没有 card 覆盖规则');
    for(const rule of cardReduce) assert.ok(/transition: none !important/.test(rule.declarations),`减弱动效分支的 card 规则须带覆盖：${rule.selectors.join(', ')}`);
});
test('reduced motion keeps tab override',()=>{
    assert.ok(tabReduce.length>0,'审计面塌缩：减弱动效分支内没有 tab 覆盖规则');
    for(const rule of tabReduce) assert.ok(/transition: none !important/.test(rule.declarations),`减弱动效分支的 tab 规则须带覆盖：${rule.selectors.join(', ')}`);
});
test('card hover uses a short motion token',()=>assert.match(css,/\$sw-dur-(fast|base) \$sw-ease/));
test('tab hover remains color only',()=>assert.match(css,/transition: color/));
test('motion fallback is scoped',()=>assert.ok(css.includes('@media (prefers-reduced-motion: reduce)')));
test('store cards support keyboard focus',()=>assert.ok(declaresIn(css,'.sw-home-store__card:focus-visible',/outline: 2px solid/,base)));
test('store tabs support keyboard focus',()=>assert.ok(declaresIn(css,/(^| )\.sw-home-store__tab:focus-visible$/,/outline: 2px solid/,base)));
test('mobile rules precede reduced motion safely',()=>assert.ok(css.indexOf('@media (max-width: 560px)')<css.indexOf('@media (prefers-reduced-motion: reduce)')));
test('reduced motion selector includes card',()=>assert.ok(css.includes('.sw-home-store__card,')));
test('reduced motion selector includes tab',()=>assert.match(css,/\.sw-home-store__tab\s*\{/));
test('reduced motion important override is explicit',()=>assert.ok(css.includes('transition: none !important')));
test('hover fallback is explicit',()=>assert.ok(css.includes('transform: none;')));
test('motion styles keep explicit transition override',()=>assert.ok(css.includes('transition: none !important')));
test('motion styles keep hover fallback',()=>assert.ok(css.includes('transform: none;')));
test('motion styles preserve theme focus',()=>assert.ok(css.includes('var(--b3-theme-primary)')));
test('motion styles preserve touch behavior',()=>assert.ok(css.includes('touch-action: manipulation')));
test('motion contract is deterministic',()=>assert.ok(css.includes('prefers-reduced-motion')&&css.includes('transition: none !important')));

// 动效令牌规范（D-362）：全部过渡声明必须使用 $sw-dur-* / $sw-ease 令牌，
// 不再回退到裸时长或浏览器默认 ease。linear 不在检查内（旋转加载动画需匀速）。
test('transitions use motion tokens instead of hardcoded values', () => {
    const offenders = [];
    css.split(/\r?\n/).forEach((line, index) => {
        if (!/\btransition\s*:/.test(line)) return;
        if (/^\s*\/\//.test(line)) return;
        if (/transition:\s*none/.test(line)) return;
        if (/(?<![\w-])\d*\.?\d+m?s\b/.test(line)) offenders.push(`L${index + 1} 裸时长: ${line.trim()}`);
        if (/(?<![\w-])ease(?!-)/.test(line)) offenders.push(`L${index + 1} 裸曲线: ${line.trim()}`);
    });
    assert.deepEqual(offenders, [], `过渡声明须使用动效令牌：\n${offenders.join('\n')}`);
});

test('motion tokens stay declared in the stylesheet', () => {
    for (const token of ['$sw-dur-fast', '$sw-dur-base', '$sw-dur-slow', '$sw-dur-panel', '$sw-ease', '$sw-ease-sym']) {
        assert.match(css, new RegExp('\\' + token + '\\s*:'), `令牌 ${token} 必须保持定义`);
    }
});

// 高对比度偏好（D-363）：Apple 无障碍指南要求适配 prefers-contrast: more。
// 与 forced-colors（系统强制色）分工不同，它沿用主题色、只收紧低透明度软层。
test('high contrast preference is honoured for both token scopes', () => {
    assert.match(css, /@media \(prefers-contrast: more\)/, '必须存在 prefers-contrast 适配');
    const block = css.slice(css.indexOf('@media (prefers-contrast: more)'));
    assert.match(block, /\.speed-switch/, '需覆盖 .speed-switch 令牌作用域');
    assert.match(block, /\.sw-settings/, '需覆盖 .sw-settings 令牌作用域');
});

test('high contrast override stays token-only', () => {
    // 该适配被承诺为"纯增量、不影响默认外观"，因此不得改动布局属性。
    const start = css.indexOf('@media (prefers-contrast: more)');
    const block = css.slice(start, css.indexOf('\n}', start) + 2);
    for (const prop of ['padding:', 'margin:', 'width:', 'height:', 'font-size:', 'display:']) {
        assert.equal(block.includes(prop), false, `高对比度覆盖不应改动布局属性 ${prop}`);
    }
});
