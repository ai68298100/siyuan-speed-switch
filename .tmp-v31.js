const fs = require('fs');
for (const f of ['package.json', 'plugin.json']) {
    const t = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, t.replace('"version": "0.16.30"', '"version": "0.16.31"'));
}
let s = fs.readFileSync('README.md', 'utf8');
s = s.replace('version-0.16.30-blue', 'version-0.16.31-blue');
const re = /> `v0\.16\.30` [^\r\n]+/;
const m = s.match(re);
if (m) {
    s = s.replace(re, '> `v0.16.31` 组件面板视觉升级：卡片圆角 16px + 柔和双层阴影 + 悬停浮起，模块头图标带强调色芯片（按组件稳定配色），概览大数字（待办数/收藏数/标签数等），条目圆点标记。' + m[0].replace('> `v0.16.30`', '上一版 `v0.16.30`'));
}
const cl = '## 更新日志\r\n\r\n### v0.16.30（2026-09-12）';
if (!s.includes(cl)) { console.error('zh cl anchor missing'); process.exit(1); }
const entry = [
'## 更新日志',
'',
'### v0.16.31（2026-09-12）',
'',
'- 组件面板视觉升级：卡片圆角 16px + 柔和双层阴影 + 悬停浮起（translateY −1px），iPad 小组件质感；模块头图标改为强调色圆角芯片（8 色调色板按 moduleId 稳定分配）。',
'- 概览数字（stat）：收藏/标签/书签/文档集/今日待办组件在列表前显示大号概览数字与标签，一眼即见核心指标；内置适配器同步返回概览数据。',
'- 条目圆点标记：列表条目前缀强调色小圆点，与组件色调呼应；列表条目内边距微调。',
'',
'### v0.16.30（2026-09-12）',
].join('\r\n');
s = s.replace(cl, entry);
fs.writeFileSync('README.md', s);

let en = fs.readFileSync('README.en-US.md', 'utf8');
en = en.replace('version-0.16.30-blue', 'version-0.16.31-blue');
const enCl = '## Changelog\r\n\r\n### v0.16.30 (2026-09-12)';
if (!en.includes(enCl)) { console.error('en cl anchor missing'); process.exit(1); }
const enEntry = [
'## Changelog',
'',
'### v0.16.31 (2026-09-12)',
'',
'- Widget panel visual upgrade: 16px rounded cards with soft double shadows and hover lift; module header icons in accent-tinted rounded chips (8-color palette, stably assigned per moduleId).',
'- Stat overview: favorites / tags / bookmarks / document sets / today\\'s tasks widgets show a large overview number with label before the list.',
'- List items gain accent-colored dot markers and refined padding.',
'',
'### v0.16.30 (2026-09-12)',
].join('\r\n');
en = en.replace(enCl, enEntry);
fs.writeFileSync('README.en-US.md', en);

let r = fs.readFileSync('ROADMAP.md', 'utf8');
r = r.replace('> 基线：本地 `main` / v0.16.30；最后更新：2026-09-12', '> 基线：本地 `main` / v0.16.31；最后更新：2026-09-12');
fs.writeFileSync('ROADMAP.md', r);
console.log('0.16.31 done');
