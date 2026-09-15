const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const css=fs.readFileSync(path.join(__dirname,'..','src','index.scss'),'utf8');
test('reduced motion media query exists',()=>assert.match(css,/prefers-reduced-motion: reduce/));
test('reduced motion disables card transition',()=>assert.match(css,/sw-home-store__card,[\s\S]*?transition: none !important/));
test('reduced motion disables tab transition',()=>assert.match(css,/sw-home-store__tab[\s\S]*?transition: none !important/));
test('reduced motion disables hover transform',()=>assert.match(css,/sw-home-store__card:hover[\s\S]*?transform: none/));
test('motion query uses standard syntax',()=>assert.match(css,/@media \(prefers-reduced-motion: reduce\)/));
// 以下三条改绑动效令牌而非具体字面量（D-362）：保留"过渡仍然存在"的回归保护，
// 同时不再因调整档位或曲线而误报。令牌定义在 src/index.scss 顶部。
test('card transition remains defined',()=>assert.match(css,/transition: border-color \$sw-dur-\w+ \$sw-ease/));
test('tab transition remains defined',()=>assert.match(css,/transition: color \$sw-dur-\w+, border-color \$sw-dur-\w+/));
test('mobile hover transform remains disabled',()=>assert.match(css,/\.sw-home-store__card:hover \{ transform: none; \}/));
test('card focus visible remains present',()=>assert.match(css,/&:focus-visible/));
test('tab focus visible remains present',()=>assert.match(css,/outline: 2px solid var\(--b3-theme-primary\)/));
test('reduced motion block is present',()=>assert.match(css,/prefers-reduced-motion: reduce/));
test('reduced motion does not disable pointer input',()=>assert.doesNotMatch(css,/prefers-reduced-motion: reduce[\s\S]*?pointer-events:\s*none/));
test('reduced motion keeps card border',()=>assert.match(css,/prefers-reduced-motion: reduce[\s\S]*?sw-home-store__card/));
test('reduced motion keeps tab semantics',()=>assert.match(css,/prefers-reduced-motion: reduce[\s\S]*?sw-home-store__tab/));
test('card hover uses a short motion token',()=>assert.match(css,/\$sw-dur-(fast|base) \$sw-ease/));
test('tab hover remains color only',()=>assert.match(css,/transition: color/));
test('motion fallback is scoped',()=>assert.match(css,/@media \(prefers-reduced-motion: reduce\)/));
test('store cards support keyboard focus',()=>assert.match(css,/\.sw-home-store__card[\s\S]*?focus-visible/));
test('store tabs support keyboard focus',()=>assert.match(css,/\.sw-home-store__tab[\s\S]*?focus-visible/));
test('mobile rules precede reduced motion safely',()=>assert.ok(css.indexOf('@media (max-width: 560px)')<css.indexOf('@media (prefers-reduced-motion: reduce)')));
test('reduced motion selector includes card',()=>assert.match(css,/\.sw-home-store__card,/));
test('reduced motion selector includes tab',()=>assert.match(css,/\.sw-home-store__tab\s*\{/));
test('reduced motion important override is explicit',()=>assert.match(css,/transition: none !important/));
test('hover fallback is explicit',()=>assert.match(css,/transform: none;/));
test('motion styles keep bounded scope',()=>assert.match(css,/prefers-reduced-motion: reduce[\s\S]*?sw-home-store__card/));
test('motion styles keep explicit transition override',()=>assert.match(css,/transition: none !important/));
test('motion styles keep hover fallback',()=>assert.match(css,/transform: none;/));
test('motion styles preserve theme focus',()=>assert.match(css,/var\(--b3-theme-primary\)/));
test('motion styles preserve touch behavior',()=>assert.match(css,/touch-action: manipulation/));
test('motion contract is deterministic',()=>assert.ok(css.includes('prefers-reduced-motion')&&css.includes('transition: none !important')));
test('motion fallback has closing brace',()=>assert.match(css,/prefers-reduced-motion: reduce[\s\S]*?\n\}/));

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
