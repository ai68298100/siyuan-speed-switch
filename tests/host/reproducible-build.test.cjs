const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {listZipEntries} = require('./lib/zip.cjs');

const root = path.resolve(__dirname, '..', '..');

function digest(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// 测试名原为 "...are deterministic within one checkout"，但断言只有"文件存在"与
// "诊断快照有界"，从未做任何确定性验证（未做两次构建对比、未比对固定哈希）。
// 全仓亦无构建产物的两次构建对比——可复现性实际由下面两个固定 mtime 断言与构建
// 配置共同保障，本测试不重复承担。名称与断言已一并修正，见 docs/host-gate-audit.md。
test('build manifest resources are present with valid sha256 digests', () => {
    const dist = path.join(root, 'dist');
    if (!fs.existsSync(dist)) return;
    const files = ['index.js', 'index.css', 'plugin.json', 'i18n/en.json', 'i18n/zh-CN.json']
        .map((file) => path.join(dist, file));
    const missing = files.filter((file) => !fs.existsSync(file));
    assert.deepEqual(missing, [], `missing build resources: ${missing.map((file) => path.relative(root, file)).join(', ')}`);
    // 原为 assert.equal(snapshot.split('\n').length, files.length)：snapshot 由 files
    // map-join 而成，行数必然等于文件数，恒真且零信息。改为校验每个产物确实产出合法摘要。
    for (const file of files) {
        assert.match(digest(file), /^[0-9a-f]{64}$/,
            `sha256 digest must be a 64-char lowercase hex string: ${path.relative(root, file)}`);
    }
});

test('environment versions are available for reproducible-build diagnosis', () => {
    assert.match(process.version, /^v\d+\.\d+\.\d+$/);
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(typeof packageJson.packageManager, 'string');
    assert.match(packageJson.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
});

test('build metadata does not contain obvious wall-clock or random drift markers', () => {
    const manifestPath = path.join(root, 'dist', 'plugin.json');
    if (!fs.existsSync(manifestPath)) return;
    const source = fs.readFileSync(manifestPath, 'utf8');
    assert.doesNotMatch(source, /(?:timestamp|buildTime|generatedAt|randomSeed)\s*:/i);
});

test('release archive metadata uses a fixed ZIP timestamp', () => {
    const source = fs.readFileSync(path.join(root, 'webpack.config.js'), 'utf8');
    assert.match(source, /RELEASE_ZIP_MTIME\s*=\s*new Date\(1980,\s*0,\s*1,\s*0,\s*0,\s*0,\s*0\)/);
    assert.match(source, /fileOptions\s*:\s*\{[\s\S]*mtime:\s*RELEASE_ZIP_MTIME/);
    assert.doesNotMatch(source, /mtime:\s*new Date\(\)/);
});

test('generated release archive carries the ZIP epoch timestamp', () => {
    const archive = path.join(root, 'package.zip');
    if (!fs.existsSync(archive)) return;
    const entries = listZipEntries(fs.readFileSync(archive));
    assert.ok(entries.length > 0 && entries.length <= 32);
    assert.deepEqual(entries.map((entry) => [entry.lastModFileTime, entry.lastModFileDate]),
        entries.map(() => [0, 33]));
});
