const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {listZipEntryStats, listZipEntryNames, readZipEntry} = require(path.join(__dirname, 'lib', 'zip.cjs'));
const {COMPRESSED_ENTRY_BUDGET_BYTES} = require('../../scripts/release-readiness-metrics.cjs');

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
const MAX_COMPRESSED_ENTRY_BYTES = COMPRESSED_ENTRY_BUDGET_BYTES;
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

// F7 发布资源契约门禁（T-6707，上游 docs/PLUGIN-PUBLISH.md "Resource declaration"，
// 2026-09-20 原文核实）：标准条目（index.js / index.css / i18n/*.json）自动可用；
// 宿主消费的清单与列表资产（plugin.json / icon / preview / README*）由宿主直接
// 读取；其余任何随包文件都必须在 plugin.json 的 publish.resources 逐文件声明。
// 声明条目须为精确相对文件名（用 "/"；官方示例 "views/index.html" 允许子目录
// 文件路径；禁止目录条目、通配符、绝对路径、父级穿越、百分号编码、链接）。
// 未声明的文件在发布模式下不可服务。
const STANDARD_ENTRY = (name) =>
    name === 'index.js' || name === 'index.css' || (name.startsWith('i18n/') && name.endsWith('.json'));
const HOST_CONSUMED_ENTRIES = new Set(['plugin.json', 'icon.png', 'preview.png', 'README.md', 'README.en-US.md']);
const RESOURCE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._\/-]*$/;

test('every packaged non-standard file is declared in plugin.json publish.resources', () => {
    const zip = path.join(root, 'package.zip');
    if (!fs.existsSync(zip)) return;
    const archive = fs.readFileSync(zip);

    const manifest = JSON.parse(readZipEntry(archive, 'plugin.json').toString('utf8'));
    const declared = Array.isArray(manifest.publish?.resources) ? manifest.publish.resources : [];

    const entryNames = listZipEntryNames(archive).sort();
    assert.ok(entryNames.length >= 10,
        `package.zip must contain the full plugin surface; only ${entryNames.length} entries readable`);

    assert.equal(new Set(declared).size, declared.length, 'publish.resources must not contain duplicates');
    for (const resource of declared) {
        assert.match(resource, RESOURCE_NAME_PATTERN,
            `publish.resources entry ${JSON.stringify(resource)} is not an exact relative filename`);
        assert.doesNotMatch(resource, /\/$|(^|\/)\.\.(\/|$)/,
            `publish.resources entry ${JSON.stringify(resource)} must not be a directory or traversal`);
    }

    const undeclared = entryNames.filter((name) =>
        !STANDARD_ENTRY(name) && !HOST_CONSUMED_ENTRIES.has(name) && !declared.includes(name));
    assert.deepEqual(undeclared, [],
        `packaged files missing from publish.resources (unreachable in publish mode): ${undeclared.join(', ')}`);

    // 体积基线交叉自检（防恒真）：即使 zip 条目读取路径失效，空/缺声明也会
    // 因基线里登记的非标准条目未获声明而在此精确失败。
    const baselineNames = Object.keys(readBaseline());
    const undeclaredInBaseline = baselineNames
        .filter((name) => !STANDARD_ENTRY(name) && !HOST_CONSUMED_ENTRIES.has(name) && !declared.includes(name));
    assert.deepEqual(undeclaredInBaseline, [],
        `baseline files missing from publish.resources: ${undeclaredInBaseline.join(', ')}`);
});
