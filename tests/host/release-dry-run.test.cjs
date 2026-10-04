const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('release dry-run contract names package.zip and generated notes', () => {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    assert.match(workflow, /files:\s*package\.zip/);
    assert.match(workflow, /generate_release_notes:\s*true/);
    assert.match(workflow, /tags:[\s\S]{0,40}["']?v\*["']?/);
});

test('dry-run validates release inputs without invoking upload commands', () => {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    assert.doesNotMatch(workflow, /gh\s+release\s+upload/);
    assert.match(workflow, /run:\s+pnpm\s+verify:release/);
});

test('release workflow delegates local gates to verify:release exactly once', () => {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    const completeGateRuns = workflow.match(/^\s*run:\s+pnpm\s+verify:release\s*$/gm) || [];
    assert.equal(completeGateRuns.length, 1, 'release workflow must have one complete local gate');
    assert.doesNotMatch(workflow, /^\s*run:\s+pnpm\s+(?:exec\s+tsc|repro:audit|test|test:smoke)\s*$/gm,
        'release workflow must not drift into a partial duplicate gate');
});

test('release workflow provisions Chromium and exports its executable path', () => {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    assert.match(workflow, /pnpm\s+exec\s+playwright\s+install\s+--with-deps\s+chromium/);
    assert.match(workflow, /require\(['"]@playwright\/test['"]\)\.chromium\.executablePath\(\)/);
    assert.match(workflow, /test\s+-x\s+"\$browser_path"/);
    assert.match(workflow, /printf\s+'BROWSER_PATH=%s\\n'\s+"\$browser_path"\s+>>\s+"\$GITHUB_ENV"/);
});

test('release browser setup runs before the complete gate and package gate', () => {
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    const browserSetup = workflow.indexOf('name: Install Chromium for browser smoke');
    const completeGate = workflow.indexOf('name: Complete local release gate');
    const packageGate = workflow.indexOf('name: Package integrity gate');
    assert.ok(browserSetup >= 0, 'release workflow must name the browser setup step');
    assert.ok(completeGate > browserSetup, 'browser must be installed before the complete gate');
    assert.ok(packageGate > completeGate, 'package integrity must remain after the complete gate');
});

test('dry-run asset list remains bounded and explicit', () => {
    // 原实现自造 const assets = ['package.zip'] 再断言其等于自己、长度 <= 4，
    // 断言的全部输入都来自测试自身，从未读取 workflow（见 docs/host-gate-audit.md）。
    // 现改为从 release.yml 提取真实声明的上传资源。
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    const declared = [...workflow.matchAll(/^\s{6,}files:\s*(.+)$/gm)].map((match) => match[1].trim());
    assert.ok(declared.length > 0, 'release workflow must declare the uploaded assets');
    const assets = declared.flatMap((entry) => entry.split(/\s+/).filter(Boolean));
    assert.ok(assets.length > 0 && assets.length <= 4,
        `asset list must stay bounded and non-empty, got ${assets.length}: ${assets.join(', ')}`);
    for (const asset of assets) {
        assert.match(asset, /^[\w.-]+$/, `asset must be a plain filename: ${asset}`);
    }
});
