const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {readSourceText} = require("./source-scan.cjs");
const webpackConfig = require("../webpack.config.js");
const {listZipEntryNames} = require("./host/lib/zip.cjs");

const root = path.resolve(__dirname, "..");

test("snippet studio lazy chunk has a stable published path and runtime base", () => {
    const config = webpackConfig({}, {mode: "production"});
    // T-7018 演进：chunkFilename 改为 [name] 模式（多 chunk 稳定命名）——
    // 既有工作室 chunk 的名字由 src/index.ts 的 webpackChunkName 魔法注释
    // 钉住为 "snippet-studio"，发布路径 dist/snippet-studio.js 不变。
    assert.equal(config.output.chunkFilename, "dist/[name].js");

    // webpackChunkName 是魔法注释——readSourceText 会剥注释，此处必须读原始文本
    //（source-scan 头注的合法例外：断言对象就是注释本身）。
    const entrySourceRaw = fs.readFileSync(path.join(root, "src", "index.ts"), "utf8").replace(/\r\n/g, "\n");
    assert.match(entrySourceRaw, /webpackChunkName:\s*"snippet-studio"/,
        "工作室 chunk 名必须由魔法注释显式钉住（多 chunk 下不得依赖默认命名）");

    const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin.json"), "utf8"));
    assert.equal(config.output.publicPath, `/plugins/${manifest.name}/`);
    assert.ok(manifest.publish?.resources?.includes("dist/snippet-studio.js"));

    const entrySource = readSourceText(path.join(root, "src", "index.ts"));
    assert.doesNotMatch(entrySource, /__webpack_public_path__|document\.currentScript/);
    const e2eInstaller = fs.readFileSync(path.join(root, "scripts", "e2e", "lib.mjs"), "utf8");
    assert.match(e2eInstaller, /lazyChunk/);
    assert.match(e2eInstaller, /path\.join\(lazyDir, "snippet-studio\.js"\)/);

    const bundle = path.join(root, "dist", "index.js");
    if (fs.existsSync(bundle)) {
        const source = fs.readFileSync(bundle, "utf8");
        assert.match(source, /dist\/snippet-studio\.js/);
        assert.ok(source.includes(config.output.publicPath), "built runtime must contain the plugin resource base");
    }

    const zip = path.join(root, "package.zip");
    if (fs.existsSync(zip)) {
        assert.ok(listZipEntryNames(fs.readFileSync(zip)).includes("dist/snippet-studio.js"));
    }
});

test("E2E plugin installation mirrors the published lazy chunk layout", async () => {
    const distChunk = path.join(root, "dist", "snippet-studio.js");
    if (!fs.existsSync(distChunk)) return;
    const {installPlugin} = await import(pathToFileURL(path.join(root, "scripts", "e2e", "lib.mjs")).href);
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "swss-snippet-layout-"));
    try {
        const {target} = installPlugin(workspace, root);
        assert.ok(fs.existsSync(path.join(target, "index.js")));
        assert.ok(fs.existsSync(path.join(target, "dist", "snippet-studio.js")));
        assert.equal(fs.existsSync(path.join(target, "snippet-studio.js")), false);
    } finally {
        fs.rmSync(workspace, {recursive: true, force: true});
    }
});
