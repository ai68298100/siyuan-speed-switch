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

test('readme exposes a complete release-candidate path', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const english = fs.readFileSync(path.join(root, 'README.en-US.md'), 'utf8');
    for (const text of [readme, english]) {
        assert.match(text, /Release Checklist|发布前检查/);
        assert.match(text, /verify:release/);
        assert.match(text, /Android/);
        assert.match(text, /not.*published|正式发布|发布版本/i);
    }
});

test('documentation local links resolve from the repository', () => {
    const documents = ['README.md', 'README.en-US.md', 'ROADMAP.md'];
    const missing = [];
    const linkPattern = /\[[^\]]+\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;
    for (const document of documents) {
        const source = fs.readFileSync(path.join(root, document), 'utf8');
        for (const match of source.matchAll(linkPattern)) {
            const target = match[1];
            if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
            const relative = target.split('#', 1)[0].split('?', 1)[0];
            if (!relative) continue;
            const resolved = path.resolve(root, path.dirname(document), relative);
            if (!fs.existsSync(resolved)) missing.push(`${document} -> ${target}`);
        }
    }
    assert.deepEqual(missing, [], `broken documentation links: ${missing.join(', ')}`);
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
