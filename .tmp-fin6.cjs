const fs = require('fs');
let rd = fs.readFileSync('docs/release-readiness.md', 'utf8');
const anchor = '| GitHub 发布动作 | 已通过 | ';
const idx = rd.indexOf(anchor);
if (idx < 0) { console.error('ROW NOT FOUND'); process.exit(1); }
const at = idx + anchor.length;
rd = rd.slice(0, at) + '`v0.28.1` 已于 2026-09-21 发布（Release workflow 自动构建，package.zip 381382 bytes）；' + rd.slice(at);
fs.writeFileSync('docs/release-readiness.md', rd, 'utf8');
console.log('release row updated');
let rm = fs.readFileSync('ROADMAP.md', 'utf8');
const pairs = [
    ['> 基线：`v0.27.0`（已发布，本地 `main` 与远端一致）；最后更新：2026-09-21（6335 项测试，212 文件）',
     '> 基线：`v0.28.1`（已发布，本地 `main` 与远端一致）；最后更新：2026-09-21（6341 项测试，212 文件）'],
];
for (const [from, to] of pairs) {
    if (rm.split(from).length !== 2) { console.error('RM NOT UNIQUE: ' + from.slice(0, 40)); process.exit(1); }
    rm = rm.replace(from, to);
}
fs.writeFileSync('ROADMAP.md', rm, 'utf8');
console.log('roadmap baseline updated');
