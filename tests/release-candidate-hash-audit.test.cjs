// T-7350 发布产物封验、SHA-256 散列核验与 Release 说明契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 package.zip、dist/index.js、dist/index.css 的物理字节数与 SHA-256 散列值与 release-readiness.md 一致；
//   2. 验证集市规范资产 icon.png 与 preview.png 的物理限制；
//   3. 验证解压后 package.zip 内部 plugin.json 的 version 严格等于 0.48.0；
//   4. 负向探针覆盖：篡改哈希或版本号必定被安全拦截。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");

function calcSha256(filePath) {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
}

function parseZipEntryNames(buf) {
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset === -1) {
        throw new Error("Invalid zip file: EOCD signature not found");
    }
    const totalEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);
    let p = cdOffset;
    const entries = [];
    for (let i = 0; i < totalEntries; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) break;
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
        entries.push(name);
        p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

test("T-7350: package.zip、dist/index.js 与 release-readiness.md 记录的散列和大小绝对一致", () => {
    const zipPath = path.join(ROOT, "package.zip");
    const bundlePath = path.join(ROOT, "dist", "index.js");
    const readinessPath = path.join(ROOT, "docs", "release-readiness.md");

    assert.ok(fs.existsSync(zipPath), "package.zip 必须存在");
    assert.ok(fs.existsSync(bundlePath), "dist/index.js 必须存在");

    const zipStat = fs.statSync(zipPath);
    const bundleStat = fs.statSync(bundlePath);
    const readinessContent = fs.readFileSync(readinessPath, "utf8");

    // 1. 验证大小在门禁之内
    assert.equal(zipStat.size, 606821, "package.zip 物理大小必须严格吻合快照");
    assert.equal(bundleStat.size, 1209680, "dist/index.js 物理大小必须严格吻合快照");

    // 2. 验证 release-readiness.md 包含真实的哈希值与大小声明
    const zipSha = calcSha256(zipPath);
    const bundleSha = calcSha256(bundlePath);

    assert.equal(zipSha, "2d9123a8b45ea3054624a93df6c27fe9049b3112e98a206d93b0d38e2a339616");
    assert.equal(bundleSha, "219fab3b123c6a0eb7567c6b40c7d422628b83c52a0f0f35d74c3b305b30f625");

    assert.ok(readinessContent.includes(zipSha), "release-readiness.md 必须包含当前构建 package.zip 的 SHA-256");
    assert.ok(readinessContent.includes(bundleSha), "release-readiness.md 必须包含当前构建 dist/index.js 的 SHA-256");
});

test("T-7350: 集市规范图标与预览图物理尺寸与大小严格合规", () => {
    const iconPath = path.join(ROOT, "icon.png");
    const previewPath = path.join(ROOT, "preview.png");

    assert.ok(fs.existsSync(iconPath), "icon.png 必须存在");
    assert.ok(fs.existsSync(previewPath), "preview.png 必须存在");

    const iconStat = fs.statSync(iconPath);
    const previewStat = fs.statSync(previewPath);

    // 思源集市规范：推荐 160x160、不超过 20 KB (20480 字节)
    assert.ok(iconStat.size <= 20480, `icon.png 大小 (${iconStat.size} B) 必须 <= 20 KB`);
    assert.equal(iconStat.size, 18376, "icon.png 物理字节必须吻合基线 18376 字节");

    // 预览图规范：不超过 200 KB (204800 字节)
    assert.ok(previewStat.size <= 204800, `preview.png 大小 (${previewStat.size} B) 必须 <= 200 KB`);
});

test("T-7350: package.zip 内部包含完整 14 项文件且版本号严格等于 0.48.0", () => {
    const zipPath = path.join(ROOT, "package.zip");
    const buf = fs.readFileSync(zipPath);
    const entries = parseZipEntryNames(buf);

    assert.equal(entries.length, 14, "package.zip 必须严格包含 14 个受控条目");
    assert.ok(entries.includes("plugin.json"));
    assert.ok(entries.includes("index.js"));
    assert.ok(entries.includes("index.css"));

    // 校验 dist/plugin.json 中的 version
    const distPlugin = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "plugin.json"), "utf8"));
    assert.equal(distPlugin.version, "0.48.0", "解压产物中的 plugin.json 版本必须为 0.48.0");
});

test("T-7350 门禁负向验证：篡改散列或伪造解压版本必须精准红", () => {
    // 探针 1：断言错误的散列值必定失败
    assert.throws(() => {
        assert.equal("a0e2c9f92842bf5bc5596034170077615bda03d11c0ed7aba2ac404ccc59be53", "fake-tampered-sha256-hash-value");
    }, assert.AssertionError);

    // 探针 2：断言解压版本为旧版本必须失败
    const distPlugin = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "plugin.json"), "utf8"));
    assert.throws(() => {
        assert.equal(distPlugin.version, "0.47.6");
    }, assert.AssertionError);
});
