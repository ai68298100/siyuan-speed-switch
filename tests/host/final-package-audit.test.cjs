const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const {listZipEntryNames, readZipEntry} = require(path.join(__dirname, 'lib', 'zip.cjs'));

test('final package audit matches manifest, readme, and workflow claims', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    assert.equal(manifest.icon, 'icon.png');
    assert.equal(manifest.preview, 'preview.png');
    assert.match(readme, /package\.zip/);
    assert.match(workflow, /files: package\.zip/);
});

test('final package audit reports a bounded unique archive', () => {
    const zip = path.join(root, 'package.zip');
    if (!fs.existsSync(zip)) return;
    const entries = listZipEntryNames(fs.readFileSync(zip));
    assert.ok(entries.length >= 8 && entries.length <= 32);
    assert.equal(new Set(entries).size, entries.length);
});

test('release archive carries the current candidate documentation', () => {
    const zip = path.join(root, 'package.zip');
    if (!fs.existsSync(zip)) return;
    const buffer = fs.readFileSync(zip);
    const readme = readZipEntry(buffer, 'README.md').toString('utf8');
    assert.match(readme, /verify:release/);
    assert.match(readme, /正式发布/);
    assert.match(readme, /发布前检查/);
    // D-219：ROADMAP 移出发布归档为纯开发文档；完整路线保留在仓库根目录，
    // 由本测试在仓库边界继续把关内容，不再随包分发。
    const roadmap = fs.readFileSync(path.join(root, 'ROADMAP.md'), 'utf8');
    assert.match(roadmap, /R7：现代化 UI 视觉重构/);
    const entryNames = listZipEntryNames(buffer);
    assert.equal(entryNames.includes('ROADMAP.md'), false,
        'ROADMAP.md must stay out of the release archive (D-219)');
});

test('final audit is read-only', () => {
    // 原断言为 assert.equal(typeof fs.readFileSync, 'function')，恒为真、零覆盖
    // （凡有 fs 模块该断言必过）。改为真正校验本审计只读：源码中不得出现任何
    // 写/删/改文件的调用，否则审计会污染它正在检查的产物。
    // 禁用词按"词根 + 后缀"拼接构造——若直接写成完整字面量，它们本身就会出现在
    // 本文件源码里，使 includes 恒为真、断言又退化回恒真。
    const self = fs.readFileSync(__filename, 'utf8');
    const suffix = ['Sy', 'nc'].join('');
    for (const stem of ['writeFile', 'appendFile', 'unlink', 'rm', 'rmdir', 'rename', 'mkdir', 'copyFile', 'truncate', 'chmod']) {
        const forbidden = stem + suffix;
        assert.equal(self.includes(forbidden), false,
            `the audit must stay read-only but references ${forbidden}`);
    }
});
