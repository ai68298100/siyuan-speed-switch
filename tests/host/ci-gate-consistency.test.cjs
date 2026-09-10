const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

function readWorkflow(name) {
    return fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8');
}

test('CI and release workflows invoke the same core local gates', () => {
    const ci = readWorkflow('ci.yml');
    const release = readWorkflow('release.yml');
    assert.match(ci, /permissions:\s*\n\s+contents:\s+read/);
    assert.match(ci, /pnpm\s+exec\s+tsc\s+--noEmit/);
    assert.match(ci, /concurrency:\s*[\s\S]*cancel-in-progress:\s+true/);
    assert.match(ci, /timeout-minutes:\s+15/);
    assert.match(release, /concurrency:\s*[\s\S]*cancel-in-progress:\s+false/);
    assert.match(release, /timeout-minutes:\s+15/);
    for (const command of ['pnpm build', 'pnpm test']) {
        assert.match(ci, new RegExp(command.replace(' ', '\\s+')));
        assert.match(release, new RegExp(command.replace(' ', '\\s+')));
    }
    const buildIndex = release.indexOf('name: Build package.zip');
    const packageGateIndex = release.indexOf('name: Package integrity gate');
    assert.ok(buildIndex >= 0 && packageGateIndex > buildIndex,
        'release archive gate must run after package.zip is built');
    assert.match(release, /SW_REQUIRE_PACKAGE:\s*["']?1["']?/,
        'release archive gate must require a generated package.zip');
    assert.match(release, /package\.zip/);
});

test('workflow gate diagnostics preserve explicit failure categories', () => {
    const release = readWorkflow('release.yml');
    assert.match(release, /version mismatch/i);
    assert.match(release, /process\.exit\(1\)/);
    const hostReadme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    for (const marker of ['BUILD_FAILED', 'RESOURCE_MISSING', 'MANIFEST_MISMATCH', 'ENVIRONMENT_DRIFT']) {
        assert.match(hostReadme, new RegExp(marker));
    }
});

test('local host gate files remain discoverable without CI-only dependencies', () => {
    const hostDir = path.join(root, 'tests', 'host');
    const files = fs.readdirSync(hostDir);
    assert.ok(files.includes('release-quality.test.cjs'));
    assert.ok(files.includes('package-integrity.test.cjs'));
    assert.ok(files.includes('reproducible-build.test.cjs'));
    assert.ok(files.includes('release-diagnostics.test.cjs'));
});
