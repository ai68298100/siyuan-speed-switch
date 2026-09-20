const fs = require('fs');
let rd = fs.readFileSync('docs/release-readiness.md', 'utf8');
const anchor = '| GitHub 发布动作 | 已通过 | ';
const idx = rd.indexOf(anchor);
if (idx < 0) { console.error('ROW NOT FOUND'); process.exit(1); }
const at = idx + anchor.length;
rd = rd.slice(0, at) + '`v0.28.0` 已于 2026-09-21 发布（Release workflow 自动构建，package.zip 380718 bytes）；' + rd.slice(at);
fs.writeFileSync('docs/release-readiness.md', rd, 'utf8');
console.log('release row updated');

let rm = fs.readFileSync('ROADMAP.md', 'utf8');
const EOL = rm.includes('\r\n') ? '\r\n' : '\n';
const pairs = [
    ['> 基线：`v0.25.0`（已发布，本地 `main` 与远端一致）；最后更新：2026-09-21（6335 项测试，212 文件）',
     '> 基线：`v0.28.0`（已发布，本地 `main` 与远端一致）；最后更新：2026-09-21（6335 项测试，212 文件）'],
    ['> 当前状态：v0.25.0 已发布（v0.24.0 执行链/灰度开关 + v0.25.0 性能门禁/查询词法/城市表已成版；未来三版本计划见 §8.0.6）；',
     '> 当前状态：v0.28.0 已发布（v0.26/v0.27/v0.28 三版连续成版：发布合规、文档对齐、B4、性能硬门禁、存储演练、iCal RRULE 语义完备、城市表 338 城分组化；未来三版本计划见 §8.0.6）；'],
];
for (const [from, to] of pairs) {
    if (rm.split(from).length !== 2) { console.error('RM NOT UNIQUE: ' + from.slice(0, 40)); process.exit(1); }
    rm = rm.replace(from, to);
}
fs.writeFileSync('ROADMAP.md', rm, 'utf8');
console.log('roadmap updated');
