// 存储兼容矩阵文档契约：防止 docs/storage-compatibility-matrix.md 与代码漂移。
//
// 为什么需要：该文档是 ROADMAP v0.20「存储版本统一审计」的交付物，内容是
// 「13 个 key 的迁移函数、容量边界与跨版本兼容」。这类文档的价值全在"与代码
// 一致"——手写数字会随功能增长悄悄过期（路线图自己那句"8 个数据 key"就是
// v0.16.9 时期的遗留，见文档第 0 节）。因此这里把双向一致性做成断言：
//   - 文档声明的 key 集合必须**等于** constants.ts 的 key 集合（不多不少）；
//   - 文档标注的分类（handled/inspect）必须与 storage-migration.js 一致；
//   - 文档给出的容量上限数字必须与常量真实值一致。
// 扫描 constants.ts 前剥离注释（tests/source-scan.cjs），避免注释里的字面量
// 把"文档写了某个 key"变成假绿。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {stripComments} = require('./source-scan.cjs');
const {KEY_ORDER, HANDLED_KEYS, INSPECTED_KEYS, DEFAULT_LIMITS, STORAGE_SCHEMA_VERSION} = require('../src/storage-migration.js');
const {QUICK_ACTION_DEFAULTS_VERSION} = require('../src/quick-actions.js');

const root = path.resolve(__dirname, '..');
const docsPath = path.join(root, 'docs/storage-compatibility-matrix.md');

function readSource(relative) {
    return fs.readFileSync(path.join(root, relative), 'utf8');
}

const constantsSource = stripComments(readSource('src/constants.ts'));
const rawMigrationSource = readSource('src/storage-migration.js');
const documentSetsSource = stripComments(readSource('src/document-sets.js'));

function documentSource() {
    return readSource('docs/storage-compatibility-matrix.md');
}

// 被审计的容量常量。清单刻意显式：constants.ts 中还有 THUMB_API_MAX(4)、
// COLUMNS_MAX(8)、MOBILE_COLUMNS_MAX(2)、PANEL_SCALE_MAX(100) 等与存储 key
// 无关的上限，宽泛的 `[A-Z_]+_MAX = (\d+)` 会把它们一起拉进来，逼文档引用
// 无关常量，反而让门禁失去意义。
const BUNDLED_LIMIT_CONSTANTS = ['MRU_MAX', 'HISTORY_MAX', 'PINNED_MAX', 'FAVORITES_MAX', 'FAVORITE_GROUPS_MAX', 'QUICK_ACTIONS_MAX', 'THUMB_CACHE_MAX', 'THUMB_HTML_MAX'];
const DOCUMENT_SET_LIMIT_CONSTANTS = ['DOCUMENT_SET_MAX', 'DOCUMENT_SET_ENTRY_MAX', 'DOCUMENT_SET_NAME_MAX', 'DOCUMENT_SET_TITLE_MAX', 'DOCUMENT_SET_GROUP_MAX'];

test('storage compatibility matrix exists and is a non-trivial document', () => {
    assert.ok(fs.existsSync(docsPath), 'docs/storage-compatibility-matrix.md must exist');
    const source = documentSource();
    assert.ok(source.length > 2000, 'the audit document must actually contain the matrix, not a stub');
    assert.match(source, /13 个 key/, 'the document must state the authoritative key count');
});

test('documented key list equals the code registry in both directions', () => {
    const codeKeys = new Map();
    const re = /export const ([A-Z_]+_KEY) = "(sw_[a-z_]+)"/g;
    let match;
    while ((match = re.exec(constantsSource)) !== null) codeKeys.set(match[1], match[2]);
    // 审计面非空自检：空集合会让下面的比对恒真（gate-audit-checklist 模式 ④）
    assert.equal(codeKeys.size, 13, 'constants.ts must define exactly 13 storage keys');
    assert.equal(KEY_ORDER.length, 13, 'storage-migration KEY_ORDER must stay at 13');

    const documented = new Set();
    const docRe = /`(sw_[a-z_]+)`/g;
    while ((match = docRe.exec(documentSource())) !== null) documented.add(match[1]);
    assert.ok(documented.size >= 13, `the document must enumerate every key by literal, found ${documented.size}`);

    const codeValues = new Set(codeKeys.values());
    assert.deepEqual([...codeValues].filter((key) => !documented.has(key)), [], 'every registered key must appear in the audit document');
    assert.deepEqual([...documented].filter((key) => !codeValues.has(key)), [], 'the document must not name keys that are no longer registered');
});

test('documented classification (handled vs inspect) matches storage-migration', () => {
    // 分类表行形态：| 1 | `sw_mru` | `MRU_KEY` | handled | ...
    const rows = new Map();
    const re = /^\|\s*\d+\s*\|\s*`(sw_[a-z_]+)`\s*\|\s*`[A-Z_]+`\s*\|\s*([a-z]+)\s*\|/gm;
    let match;
    while ((match = re.exec(documentSource())) !== null) rows.set(match[1], match[2]);
    assert.ok(rows.size >= 13, `expected at least 13 classified rows, found ${rows.size}`);

    for (const key of INSPECTED_KEYS) {
        assert.equal(rows.get(key), 'inspect', `${key} is inspected in code and must be documented as inspect`);
    }
    for (const key of HANDLED_KEYS) {
        assert.equal(rows.get(key), 'handled', `${key} is handled in code and must be documented as handled`);
    }
});

test('audited limit constants cover exactly the limits declared by DEFAULT_LIMITS', () => {
    // 自检：审计清单必须与 DEFAULT_LIMITS 注释里声明的来源常量集合一致。
    // 这里刻意读**原始**源码（不剥注释）——要考的就是注释里的常量名。
    const block = rawMigrationSource.slice(rawMigrationSource.indexOf('const DEFAULT_LIMITS'), rawMigrationSource.indexOf('const STORAGE_SCHEMA_VERSION'));
    const declared = new Set([...block.matchAll(/\b([A-Z_]+_MAX)\b/g)].map((entry) => entry[1]));
    assert.ok(declared.size >= 6, `expected DEFAULT_LIMITS to cite its source constants, found ${[...declared].join(', ')}`);
    assert.deepEqual([...declared].sort(), [...BUNDLED_LIMIT_CONSTANTS].sort(), 'the audited list must match the constants DEFAULT_LIMITS actually mirrors');
});

test('documented capacity limits match the real constants', () => {
    const source = documentSource();
    const lines = source.split('\n');
    const audit = [
        ...BUNDLED_LIMIT_CONSTANTS.map((name) => [name, constantsSource]),
        ...DOCUMENT_SET_LIMIT_CONSTANTS.map((name) => [name, documentSetsSource]),
    ];
    for (const [name, origin] of audit) {
        const value = origin.match(new RegExp(`\\b${name} = (\\d+)`));
        assert.ok(value, `${name} must be defined as a numeric constant`);
        const line = lines.find((entry) => entry.includes(`\`${name}\``));
        assert.ok(line, `the document must cite ${name} by name`);
        assert.match(line, new RegExp(`\\b${value[1]}\\b`), `the document must state ${name} = ${value[1]}`);
    }
    // 缩略图上限有端型差异（D-392 顺带修掉的同源缺口），单独钉住四个数字
    assert.equal(DEFAULT_LIMITS.thumbCache, 40);
    assert.equal(DEFAULT_LIMITS.thumbHtml, 200 * 1024);
    const thumbLine = lines.find((entry) => entry.includes('`THUMB_CACHE_KEY`'));
    assert.ok(thumbLine, 'the document must have a thumb cache row');
    for (const number of [40, 200, 30, 80]) {
        assert.match(thumbLine, new RegExp(`\\b${number}\\b`), `thumb cache row must state ${number}`);
    }
});

test('documented schema markers match their runtime values', () => {
    const source = documentSource();
    for (const marker of ['STORAGE_SCHEMA_VERSION', 'QUICK_ACTION_DEFAULTS_VERSION', 'DOCUMENT_SET_SCHEMA_VERSION', 'HOME_SCHEMA_VERSION', 'LEGACY_HOTKEY']) {
        assert.ok(source.includes(marker), `the schema summary must list ${marker}`);
    }
    const markerRows = [
        ['QUICK_ACTION_DEFAULTS_VERSION', QUICK_ACTION_DEFAULTS_VERSION],
        ['STORAGE_SCHEMA_VERSION', STORAGE_SCHEMA_VERSION],
    ];
    for (const [name, value] of markerRows) {
        const line = source.split('\n').find((entry) => entry.includes(`\`${name}\``) && entry.includes('|'));
        assert.ok(line, `the schema summary must have a ${name} row`);
        assert.match(line, new RegExp(`\\b${value}\\b`), `the documented ${name} must equal the runtime value ${value}`);
    }
});
