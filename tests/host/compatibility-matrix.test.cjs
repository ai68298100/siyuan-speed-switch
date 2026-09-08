const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('compatibility matrix documents supported and degraded host surfaces', () => {
    const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    assert.match(readme, /3\.8\.3/);
    assert.match(readme, /SVG|图标/i);
    assert.match(readme, /卸载|unload/i);
    assert.match(readme, /Android/);
});

test('release resources required by the plugin are present', () => {
    const required = ['plugin.json', 'index.js', 'index.css', 'i18n/en.json', 'i18n/zh-CN.json'];
    const missing = required.filter((file) => !fs.existsSync(path.join(root, 'dist', file)));
    if (missing.length) {
        assert.deepEqual(missing, [], `run pnpm run build before compatibility checks: ${missing.join(', ')}`);
    }
});

test('plugin manifest declares a compatible minimum SiYuan API surface', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
    assert.equal(typeof manifest.name, 'string');
    assert.equal(typeof manifest.version, 'string');
    assert.ok(Array.isArray(manifest.backends) && manifest.backends.length > 0);
    assert.ok(Array.isArray(manifest.frontends) && manifest.frontends.includes('mobile'));
    assert.equal(typeof manifest.minAppVersion, 'string');
});
