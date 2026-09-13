const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('desktop acceptance template keeps real-host evidence boundaries explicit', () => {
    const file = path.join(root, 'docs', 'desktop-acceptance-template.md');
    const source = fs.readFileSync(file, 'utf8');
    for (const marker of [
        '真实桌面验收',
        '/api/filetree/listDocsByPath',
        '最窄可用侧栏宽度',
        '长文案是否遮挡重试/折叠控件',
        '安装/升级/卸载/重启',
        '不要记录令牌',
        '浏览器模拟结果不能替代本记录',
    ]) {
        assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
});
