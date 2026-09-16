const {execFileSync} = require('node:child_process');

function run(cmd, args) {
    return execFileSync('git', [cmd, ...args], {encoding: 'utf8', maxBuffer: 10 * 1024 * 1024});
}

const branches = [
    'feature/icon-fallback',
    'feature/mobile-sort-audit',
    'feature/mobile-stability',
    'feature/open-history',
    'feature/quick-action-platform',
    'feature/search-global',
    'feature/search-opened-content',
];

for (const b of branches) {
    // 取分支独有 diff 中新增的“实体”行（函数/导出/测试名），抽样核对其是否已在 main
    const diff = run('diff', ['main...' + b]);
    const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    // 抽取新增行中的独特 token（函数定义/导出名）
    const tokens = new Set();
    for (const line of added) {
        const fn = line.match(/^\+\s*(?:function|const)\s+([A-Za-z_$][\w$]*)/);
        if (fn) tokens.add(fn[1]);
        const ex = line.match(/^\+\s*([A-Za-z_$][\w$]*),?$/);
        if (ex && ex[1].length > 6) tokens.add(ex[1]);
        const t = line.match(/^\+test\("([^"]+)"/);
        if (t) tokens.add(t[1]);
    }
    const mainSrc = run('show', ['main:src/index.ts']) + run('show', ['main:src/search-model.js']) +
        run('show', ['main:src/util.js']) + run('show', ['main:src/home-panel.js']) +
        (() => { try { return run('show', ['main:src/home-runtime.js']); } catch (e) { return ''; } })() +
        (() => { try { return run('show', ['main:src/home-adapters.js']); } catch (e) { return ''; } })();
    let inMain = 0, total = 0;
    const missing = [];
    for (const t of tokens) {
        total += 1;
        if (mainSrc.includes(t)) inMain += 1; else missing.push(t);
    }
    console.log('===', b, '| tokens:', total, '| in main:', inMain);
    if (missing.length) console.log('   MISSING:', missing.join(' | ').slice(0, 200));
}
