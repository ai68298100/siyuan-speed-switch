const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..', '..');

function digest(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('build manifest resources are deterministic within one checkout', () => {
    const dist = path.join(root, 'dist');
    if (!fs.existsSync(dist)) return;
    const files = ['index.js', 'index.css', 'plugin.json', 'i18n/en.json', 'i18n/zh-CN.json']
        .map((file) => path.join(dist, file));
    const missing = files.filter((file) => !fs.existsSync(file));
    assert.deepEqual(missing, [], `missing build resources: ${missing.map((file) => path.relative(root, file)).join(', ')}`);
    const snapshot = files.map((file) => `${path.relative(dist, file)}:${digest(file)}`).join('\n');
    assert.equal(snapshot.split('\n').length, files.length);
    assert.ok(snapshot.length < 1024, 'diagnostic snapshot must remain bounded');
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
