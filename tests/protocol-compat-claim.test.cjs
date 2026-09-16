// 对外文档的版本承诺一致性（D-393 延伸）。
//
// 为什么需要：`只读契约自 vX 起向后兼容` 这类文案是对第三方组件作者的**对外承诺**，
// 读者据此判断"我的实现从哪个版本起能稳定运行"。它不是代码、不进任何行为测试，
// 也与运行时无关 —— 正是「叙述性历史断言无防线」（见 docs/gate-audit-checklist.md
// 第九类）的典型形态：错了没人会发现，只会安静地误导外部读者。
//
// 本批实测到一次真实漂移：docs/widget-protocol.md 声明「自 v0.16.16 起保持向后兼容」
// （与 v0.16.16 tag 实测一致 —— 该版本发布时协议文档已列出全部六个契约字段），
// 而两份邀请函写的是「自 v0.16.17 起」（该版本**没有** tag）。故把"所有带版本号的
// 兼容声明必须唯一一致、且不得晚于当前版本"固化为断言。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function collectMarkdownFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...collectMarkdownFiles(full));
        else if (entry.name.endsWith('.md')) out.push(full);
    }
    return out;
}

// 收集 docs 下所有"只读契约 … 向后兼容"且写明版本号的声明。
function collectCompatibilityClaims() {
    const claims = [];
    for (const file of collectMarkdownFiles(path.join(root, 'docs'))) {
        for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
            if (!line.includes('只读契约') || !line.includes('向后兼容')) continue;
            const version = line.match(/v(\d+\.\d+\.\d+)/);
            if (version) claims.push({file: path.relative(root, file).replace(/\\/g, '/'), version: version[1]});
        }
    }
    return claims;
}

function compareVersions(left, right) {
    const a = left.split('.').map(Number);
    const b = right.split('.').map(Number);
    for (let index = 0; index < 3; index += 1) {
        if (a[index] !== b[index]) return a[index] - b[index];
    }
    return 0;
}

test('read-only contract compatibility start is stated once and consistently', () => {
    const claims = collectCompatibilityClaims();
    // 审计面非空自检：找不到带版本号的声明时，下面的"唯一"断言会恒真
    assert.ok(claims.length >= 3, `expected at least 3 versioned compatibility claims, found ${claims.length}`);
    const versions = new Set(claims.map((claim) => claim.version));
    assert.equal(versions.size, 1,
        `compatibility start must be stated exactly once, found ${[...versions].join(' / ')} across ${claims.map((claim) => claim.file).join(', ')}`);
});

test('documented compatibility start never promises a future version', () => {
    const current = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8')).version;
    const claims = collectCompatibilityClaims();
    assert.ok(claims.length >= 3, 'the same non-empty audit surface must hold here');
    for (const claim of claims) {
        assert.ok(compareVersions(claim.version, current) <= 0,
            `${claim.file} promises compatibility from v${claim.version}, which is newer than the current v${current}`);
    }
});
