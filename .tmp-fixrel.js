const fs = require('fs');
// 版本 0.16.32（修复 v0.16.31 的编译损坏）
for (const f of ['package.json', 'plugin.json']) {
    const t = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, t.replace('"version": "0.16.31"', '"version": "0.16.32"'));
}
let s = fs.readFileSync('README.md', 'utf8');
s = s.replace('version-0.16.31-blue', 'version-0.16.32-blue');
const re = /> `v0\.16\.31` [^\r\n]+/;
const m = s.match(re);
if (m) {
    const prev = m[0].replace('> `v0.16.31`', '上一版 `v0.16.31`');
    s = s.replace(re, '> `v0.16.32` 修复版：v0.16.31 存在内核请求函数改名遗漏（11 处调用未同步），导致标签/书签/本月日记/今日待办与智能体写操作在运行时失效；本版已修复并补上端点白名单校验。建议直接升级到 v0.16.32。' + prev);
}
const cl = '## 更新日志\r\n\r\n### v0.16.31（2026-09-12）';
if (!s.includes(cl)) { console.error('zh cl anchor missing'); process.exit(1); }
const entry = [
'## 更新日志',
'',
'### v0.16.32（2026-09-12）',
'',
'- **修复 v0.16.31 的运行故障**：内核请求函数改名后 11 处调用点未同步（TypeScript 类型检查可发现，但 esbuild 构建不做类型检查所以打包未报错），导致标签、书签、本月日记、今日待办组件与智能体写操作（新建文档/追加日记/切换任务）在运行时全部失效。本版恢复函数定义并加端点白名单校验。',
'- 发布流程补强：构建后追加一次类型检查门禁，避免「类型错误但仍能打包」的产物进入 Release。',
'',
'### v0.16.31（2026-09-12）',
].join('\r\n');
s = s.replace(cl, entry);
fs.writeFileSync('README.md', s);

let en = fs.readFileSync('README.en-US.md', 'utf8');
en = en.replace('version-0.16.31-blue', 'version-0.16.32-blue');
const enCl = '## Changelog\r\n\r\n### v0.16.31 (2026-09-12)';
if (en.includes(enCl)) {
    const enEntry = [
    '## Changelog',
    '',
    '### v0.16.32 (2026-09-12)',
    '',
    '- **Fixes a runtime break in v0.16.31**: a kernel-request helper was renamed without updating 11 call sites (type-check catches it, but the esbuild build does not type-check, so the broken bundle still packaged). Tags, bookmarks, journal-this-month, today\\'s tasks widgets and the agent write capabilities all failed at runtime. This release restores the helper and adds an endpoint whitelist.',
    '- Release hardening: a type-check gate now runs after the build so type-broken bundles cannot ship in a Release.',
    '',
    '### v0.16.31 (2026-09-12)',
    ].join('\r\n');
    en = en.replace(enCl, enEntry);
}
fs.writeFileSync('README.en-US.md', en);

let r = fs.readFileSync('ROADMAP.md', 'utf8');
r = r.replace('> 基线：本地 `main` / v0.16.31；最后更新：2026-09-12', '> 基线：本地 `main` / v0.16.32；最后更新：2026-09-12');
fs.writeFileSync('ROADMAP.md', r);
console.log('0.16.32 ready');
