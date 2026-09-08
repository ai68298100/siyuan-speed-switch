const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('host config documents an isolated SiYuan workspace and port', () => {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.example.json'), 'utf8'));
    assert.equal(typeof config.workspace, 'string');
    assert.notEqual(config.workspace.trim(), '');
    const port = Number(new URL(config.baseUrl).port);
    assert.equal(Number.isInteger(port), true);
    assert.ok(port >= 1024 && port <= 65535);
    assert.equal(config.allowRemote, false);
    assert.equal(config.preserveFailedData, true);
});

test('host test contract keeps Android acceptance separate from browser emulation', () => {
    const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    assert.match(readme, /Android/);
    assert.match(readme, /browser emulation/i);
    assert.match(readme, /3\.8\.3/);
});

test('release package metadata stays aligned with plugin metadata', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const pluginJson = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
    assert.equal(typeof packageJson.version, 'string');
    assert.equal(pluginJson.version, packageJson.version);
    assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
});

test('production bundle remains within the mobile performance budget when built', () => {
    const bundle = path.join(root, 'dist', 'index.js');
    if (!fs.existsSync(bundle)) return;
    const bytes = fs.statSync(bundle).size;
    assert.ok(bytes <= 220 * 1024, `dist/index.js is ${bytes} bytes; budget is 225280`);
});
