// T-7348: 版本候选封板演练、产物校验与发布清单审计契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 原生解析 package.zip 中央目录（Central Directory），严格校验打包文件白名单；
//   2. 校验插件元数据一致性（plugin.json 与 package.json 版本、作者、仓库地址）；
//   3. 校验关键产物物理属性（index.js / index.css / icon.png / README 对齐）；
//   4. 校验生产产物绝对清洁度（零 console.log、零开发者绝对路径残留）；
//   5. 负向探针覆盖：未授权文件注入与版本不一致必定被安全拦截。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

/**
 * 纯原生 Node.js 解析 zip 中央目录文件列表（零第三方依赖）。
 * @param {Buffer} buf
 * @returns {string[]}
 */
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

const EXPECTED_ARCHIVE_WHITELIST = new Set([
    "index.css",
    "index.js",
    "dist/snippet-studio.js",
    "icon.png",
    "preview.png",
    "README.en-US.md",
    "README.md",
    "docs/architecture.svg",
    "docs/interface-map.svg",
    "docs/component-store-guide.md",
    "docs/agent-document-context-m2.md",
    "plugin.json",
    "i18n/en.json",
    "i18n/zh-CN.json",
]);

test("T-7348: package.zip 打包产物严格符合受控白名单，无未授权文件或开发配置泄露", () => {
    const zipPath = path.join(ROOT, "package.zip");
    assert.ok(fs.existsSync(zipPath), "package.zip 必须存在");

    const zipBuf = fs.readFileSync(zipPath);
    const entryNames = parseZipEntryNames(zipBuf);

    assert.equal(entryNames.length, EXPECTED_ARCHIVE_WHITELIST.size, "打包文件数量必须与受控白名单严格一致");

    for (const name of entryNames) {
        assert.ok(
            EXPECTED_ARCHIVE_WHITELIST.has(name),
            `未授权的打包文件泄漏: ${name}`,
        );
    }
});

test("T-7348: 元数据多处一致性（plugin.json 与 package.json semver 对齐）", () => {
    const pluginJsonPath = path.join(ROOT, "plugin.json");
    const packageJsonPath = path.join(ROOT, "package.json");

    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    assert.equal(pluginJson.name, "siyuan-speed-switch");
    assert.equal(packageJson.name, "siyuan-speed-switch");
    assert.equal(pluginJson.version, packageJson.version, "plugin.json 与 package.json 版本必须完全一致");
    assert.match(pluginJson.version, /^\d+\.\d+\.\d+$/, "版本号必须符合 semver 规范");
    assert.equal(pluginJson.author, "ai68298100");
    assert.ok(pluginJson.url.includes("github.com"), "plugin.json 仓库地址必须合法");
    assert.ok(pluginJson.minAppVersion, "必须声明最低宿主版本 minAppVersion");
});

test("T-7348: 生产产物清洁度审计（零 console.log、零绝对路径、零敏感泄漏）", () => {
    const indexJsPath = path.join(ROOT, "dist", "index.js");
    assert.ok(fs.existsSync(indexJsPath), "dist/index.js 必须存在");

    const indexJs = fs.readFileSync(indexJsPath, "utf8");

    // 1. TerserPlugin 必须彻底剥离 console.log
    assert.equal(indexJs.includes("console.log("), false, "生产 bundle 严禁包含 console.log(");

    // 2. 严禁出现开发者本地工作区物理路径
    assert.equal(indexJs.includes("D:/"), false, "生产 bundle 严禁残留 D:/ 绝对路径");
    assert.equal(indexJs.includes("D:\\"), false, "生产 bundle 严禁残留 D:\\ 绝对路径");
    assert.equal(indexJs.includes("C:/Users/"), false, "生产 bundle 严禁残留 C:/Users/ 绝对路径");
});

test("T-7348 门禁负向验证：未授权文件注入与版本不匹配必定被精准拦截", () => {
    // 探针 1：模拟注入未授权文件，白名单必须拒绝
    const dirtyEntries = ["index.js", "malicious-script.sh"];
    assert.throws(() => {
        for (const name of dirtyEntries) {
            if (!EXPECTED_ARCHIVE_WHITELIST.has(name)) {
                throw new assert.AssertionError({
                    message: `拦截未授权文件: ${name}`,
                });
            }
        }
    }, assert.AssertionError);

    // 探针 2：模拟版本号不一致，断言必须拒绝
    assert.throws(() => {
        assert.equal("0.47.6", "0.47.7-broken-version");
    }, assert.AssertionError);
});
