const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {listZipEntryStats} = require(path.join(__dirname, 'lib', 'zip.cjs'));

const root = path.resolve(__dirname, '..', '..');
const baselinePath = path.join(__dirname, 'package-resource-baseline.json');
const MAX_ARCHIVE_ENTRIES = 32;
// 单条目硬上限，用于在资源膨胀时尽早报警（不是外部限制）。
// 演进：144 KiB → 148 KiB（v0.20 依赖目录与安装引导）→ 160 KiB
// （D-366：接入 v0.18 桌面路径筛选后 index.js 压缩后达 152040 字节，
// 超出 148 KiB 上限 488 字节；按 D-353 先例依真实功能增量上调，并为
// 后续 v0.18 契约模块接入保留评审余量）→ 168 KiB（D-386：v0.20 数据
// 连续性接入 storage-migration 演练模型与 storageHealth 只读投影后
// index.js 压缩后达 164015 字节，超出 160 KiB 上限 175 字节；只读演练、
// 无写入动作，按先例上调并保留后续接入余量）→ 180 KiB（T-6298 / ADR 0057：
// 接入 5 个小驴打卡桥接组件（checkin-bridge-model 415 行、home-source-model
// 144 行、商店来源分组 UI 与 30 组双语 i18n）后 index.js 压缩后达 175727 字节，
// 超出 168 KiB 上限 3695 字节；增量均为纯本地只读桥接与分组展示、无网络外传面，
// 按先例上调并为后续来源插件组件接入保留评审余量）→ 192 KiB（T-6357：
// 数据库搜索/列配置、官方最近文档、动态图标兜底与路径分组集中接入后达到
// 185498 字节；用户明确以功能、性能和交互为优先，保留约 11 KiB 评审余量）
// → 224 KiB（T-6400 / ADR 0059：完成前 15 个组件深度优化后达到 195019
// 字节，旧线仅余 1589 字节；继续遵循功能、性能、UI 与交互优先，并用独立的
// 512 KiB 整包上限防止失控增长）。
// 归档总上限独立为 512 KiB（D-353），当前仍余约 176 KiB。
const MAX_COMPRESSED_ENTRY_BYTES = 224 * 1024;
const MAX_EXPECTED_GROWTH_BYTES = 8 * 1024;
const MAX_EXPECTED_GROWTH_RATIO = 0.25;

function readBaseline() {
    if (!fs.existsSync(baselinePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    if (!parsed || parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== 'object') {
        throw new Error('package resource baseline must declare version 1 entries');
    }
    return parsed.entries;
}

test('release archive reports bounded per-entry resource sizes', (t) => {
    const zip = path.join(root, 'package.zip');
    if (!fs.existsSync(zip)) return;

    const entries = listZipEntryStats(fs.readFileSync(zip)).sort((left, right) => left.name.localeCompare(right.name));
    const baseline = readBaseline();
    let baselineDrift = false;
    assert.ok(entries.length > 0 && entries.length <= MAX_ARCHIVE_ENTRIES,
        `package.zip has ${entries.length} entries; expected at most ${MAX_ARCHIVE_ENTRIES}`);
    assert.equal(new Set(entries.map((entry) => entry.name)).size, entries.length,
        'package.zip must not contain duplicate entries');

    for (const entry of entries) {
        const previous = baseline[entry.name];
        let change = 'baseline=added';
        if (!Number.isSafeInteger(previous) || previous < 0) baselineDrift = true;
        if (Number.isSafeInteger(previous) && previous >= 0) {
            const delta = entry.compressedSize - previous;
            change = `delta=${delta >= 0 ? '+' : ''}${delta}`;
            if (delta !== 0) baselineDrift = true;
            const growthLimit = Math.max(MAX_EXPECTED_GROWTH_BYTES, Math.ceil(previous * MAX_EXPECTED_GROWTH_RATIO));
            if (delta > growthLimit) {
                t.diagnostic(`WARNING ${entry.name} grew by ${delta} compressed bytes (baseline=${previous}, limit=${growthLimit})`);
            }
        }
        t.diagnostic(`${entry.name}: compressed=${entry.compressedSize} bytes, uncompressed=${entry.uncompressedSize} bytes, ${change}`);
        assert.ok(Number.isInteger(entry.compressedSize) && entry.compressedSize >= 0);
        assert.ok(Number.isInteger(entry.uncompressedSize) && entry.uncompressedSize >= 0);
        assert.ok(entry.compressedSize <= MAX_COMPRESSED_ENTRY_BYTES,
            `${entry.name} is ${entry.compressedSize} compressed bytes; per-entry budget is ${MAX_COMPRESSED_ENTRY_BYTES}`);
    }

    for (const name of Object.keys(baseline).sort()) {
        if (!entries.some((entry) => entry.name === name)) {
            baselineDrift = true;
            t.diagnostic(`baseline entry removed: ${name}`);
        }
    }
    if (baselineDrift) {
        t.diagnostic('baseline review required: update package-resource-baseline.json only after an intentional archive change');
    }
});
