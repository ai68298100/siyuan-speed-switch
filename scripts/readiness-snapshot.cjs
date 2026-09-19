// T-6698：release-readiness 产物快照自动生成器。
//
// 背景（dev-plan §8/§10 流程摩擦）：dist 变更后需要手工回写 readiness 文档里的
// 三组数字（index.js / zip / index.js 压缩条目）与三类余量，历史上多次算错、
// 漏改或迟改。本脚本把这段回写自动化——只替换既有占位数字，不改任何其他内容；
// 不参与 verify:release 门禁链（门禁保持只读）。
//
// 用法：先 pnpm run build，再 node scripts/readiness-snapshot.cjs
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const distIndex = path.join(root, "dist", "index.js");
const distZip = path.join(root, "package.zip");
const readiness = path.join(root, "docs", "release-readiness.md");

function zipCompressedEntrySize(zipPath, entryName) {
    const buf = fs.readFileSync(zipPath);
    let off = buf.length - 22;
    while (off >= 0 && buf.readUInt32LE(off) !== 0x06054b50) off -= 1;
    if (off < 0) throw new Error("zip end-of-central-directory not found");
    const entries = buf.readUInt16LE(off + 10);
    let p = buf.readUInt32LE(off + 16);
    for (let i = 0; i < entries; i += 1) {
        if (buf.readUInt32LE(p) !== 0x02014b50) break;
        const compressed = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const name = buf.slice(p + 46, p + 46 + nameLen).toString();
        if (name === entryName) return compressed;
        p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error(`zip entry not found: ${entryName}`);
}

const RAW_BUNDLE_BUDGET = 832 * 1024;   // ADR 0062
const ARCHIVE_BUDGET = 512 * 1024;      // 归档硬上限
const COMPRESSED_ENTRY_BUDGET = 256 * 1024; // ADR 0065

const size = fs.statSync(distIndex).size;
const zip = fs.statSync(distZip).size;
const compressed = zipCompressedEntrySize(distZip, "index.js");

let doc = fs.readFileSync(readiness, "utf8");
const before = doc;

// 1) HTML 注释快照与 Current build 行
doc = doc.replace(/dist\/index\.js \d+ bytes; dist\/index\.css (\d+) bytes; package\.zip \d+ bytes/,
    `dist/index.js ${size} bytes; dist/index.css $1 bytes; package.zip ${zip} bytes`);
doc = doc.replace(/`dist\/index\.js` \d+ bytes; `dist\/index\.css` (\d+) bytes; `package\.zip` (\d+) bytes/g,
    `\`dist/index.js\` ${size} bytes; \`dist/index.css\` $1 bytes; \`package.zip\` ${zip} bytes`);

// 2) 生产产物表行：三类数字与余量
doc = doc.replace(/`dist\/index\.js` \d+ bytes（832 KiB 自律线内，余量 \d+ bytes，ADR 0062）/,
    `\`dist/index.js\` ${size} bytes（832 KiB 自律线内，余量 ${RAW_BUNDLE_BUDGET - size} bytes，ADR 0062）`);
doc = doc.replace(/`package\.zip` \d+ bytes（512 KiB 硬上限余量 \d+ bytes）/,
    `\`package.zip\` ${zip} bytes（512 KiB 硬上限余量 ${ARCHIVE_BUDGET - zip} bytes）`);
doc = doc.replace(/当前 `index\.js` 压缩后 \d+ bytes，余量 \d+ bytes）/,
    `当前 \`index.js\` 压缩后 ${compressed} bytes，余量 ${COMPRESSED_ENTRY_BUDGET - compressed} bytes）`);

fs.writeFileSync(readiness, doc, "utf8");
console.log(`readiness snapshot updated: index.js ${size} / zip ${zip} / compressed ${compressed}`);
console.log(`changed: ${before !== doc}`);
