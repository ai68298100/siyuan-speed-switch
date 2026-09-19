/**
 * 存储契约清单门禁（ROADMAP v0.20 存储审计前置，2026-09-14）
 *
 * 固化三项事实：
 * 1. constants.ts 是存储 key 的唯一登记处，且每个 key 带用途注释；
 * 2. index.ts 的 loadData/saveData 只能引用 *_KEY 常量，不得出现裸字符串 key；
 * 3. 每个持久化 key 的读取路径必须有对应 sanitize/normalize 函数引用，
 *    防止"新增 key 忘记损坏数据降级"。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const {readSourceText} = require('./source-scan.cjs');
// constants.ts 刻意读原始文本：下面的 key 断言要求声明行带 `// 说明` 尾注释，
// 注释本身就是被断言的客体（doc-comment-contract，见 tests/source-scan-coverage.test.cjs）。
const constants = fs.readFileSync(path.join(root, 'src', 'constants.ts'), 'utf8').replace(/\r\n/g, '\n');
// 源码扫描只看代码，不看注释：否则把调用注释掉、或在注释里写下调用文本，
// 就能满足"每个 key 都有降级路径"的存在性断言（假绿）。
const indexCode = readSourceText(path.join(root, 'src', 'index.ts'));

test('storage: every key is registered in constants.ts with a usage comment', () => {
    const keys = [...constants.matchAll(/export const ([A-Z0-9_]+_KEY) = "([a-z0-9_]+)";\s*\/\/\s*(.+)/g)];
    assert.ok(keys.length >= 13, `expected at least 13 registered storage keys, found ${keys.length}`);
    const keyNames = keys.map(([, name]) => name);
    assert.equal(new Set(keyNames).size, keyNames.length, 'duplicate key constant names');
    const rawIds = keys.map(([, , id]) => id);
    assert.equal(new Set(rawIds).size, rawIds.length, 'duplicate raw storage ids');
    for (const id of rawIds) {
        assert.match(id, /^sw_[a-z0-9_]+$/, `storage id "${id}" must be sw_ prefixed`);
    }
});

test('storage: plugin reads/writes only registered key constants, never bare strings', () => {
    // queueSave(key, value) 防抖封装层是唯一的字符串间接点：其内部
    // `this.saveData(key, value)` 的 key 一律来自上层的 *_KEY 常量调用方。
    const queueSaveInternal = 'this.saveData(key, value)';
    // 受控间接点：遍历 PERSISTENT_KEYS 的唯一清单读取每个 key（清单同源性由
    // tests/data-change-refresh.test.cjs 与 KEY_ORDER 锁定），除此以外一律要求字面量 *_KEY。
    const indirectLoads = [
        'PERSISTENT_KEYS.map((key) => this.loadData(key))',
        'PERSISTENT_KEYS.map((key) => measure(key, this.loadData(key)))',
    ];
    for (const site of indirectLoads) {
        assert.ok(indexCode.includes(site), `受控间接点已消失，需同步审计：${site}`);
    }
    // 变量式读取必须恰好等于受控站点数，否则说明有人在清单之外走了间接读取。
    assert.equal((indexCode.match(/this\.loadData\(key\)/g) || []).length, indirectLoads.length,
        "this.loadData(key) 只允许出现在受控间接点内");
    for (const match of indexCode.matchAll(/this\.(?:loadData|saveData)\(([^)]*)\)/g)) {
        const call = match[0];
        if (call.includes(queueSaveInternal)) continue;
        if (call === 'this.loadData(key)') continue;
        const args = match[1].trim();
        const firstArg = args.split(',')[0].trim();
        assert.match(firstArg, /^[A-Z0-9_]+_KEY$/,
            `loadData/saveData must reference a *_KEY constant: ${call.slice(0, 70)}`);
    }
    // 裸字符串 key 禁令（当前应为零）
    const bare = [...indexCode.matchAll(/(?:loadData|saveData)\(\s*"sw_[a-z0-9_]+"/g)];
    assert.deepEqual(bare.map((m) => m[0]), [], 'bare string storage keys found');
    // 封装层的所有外部调用方必须传常量；仅豁免防抖链内部的精确传递调用
    // （scheduleSave → queueSave → saveData，key 始终来自最初的 *_KEY 调用方）。
    for (const match of indexCode.matchAll(/this\.queueSave\(([^)]*)\)/g)) {
        const args = match[1].trim();
        if (args === 'key, this.data[key]') continue;
        const firstArg = args.split(',')[0].trim();
        assert.match(firstArg, /^[A-Z0-9_]+_KEY$/,
            `queueSave callers must pass a *_KEY constant: ${match[0].slice(0, 60)}`);
    }
});

test('storage: every persisted key has a sanitize path before use', () => {
    // key → 允许的清洗/迁移函数引用白名单（存在性断言，防止无降级直读）
    const sanitizeAllowlist = {
        MRU_KEY: ['sanitizeStringList', 'capMru'],
        HISTORY_KEY: ['sanitizeOpenHistory'],
        CLOSED_HISTORY_KEY: ['normalizeClosedEntries', 'sanitizeOpenHistory'],
        PINNED_KEY: ['sanitizeStringList'],
        FAV_KEY: ['sanitizeFavorites'],
        FAV_GROUPS_KEY: ['sanitizeStringList', 'sanitizeFavorites'],
        FAV_COLLAPSED_KEY: ['sanitizeStringList'],
        QUICK_ACTIONS_KEY: ['sanitizeQuickActions', 'normalizeQuickActionText'],
        QUICK_ACTIONS_DEFAULTS_KEY: ['migrateQuickActionDefaults'],
        DOCUMENT_SETS_KEY: ['normalizeDocumentSets'],
        HOME_STATE_KEY: ['normalizeHomeState'],
        SETTINGS_KEY: ['normalizeSettings'],
        THUMB_CACHE_KEY: ['normalizeThumbCache'],
    };
    const registered = [...constants.matchAll(/export const ([A-Z0-9_]+_KEY) = "/g)].map((m) => m[1]);
    const unknown = Object.keys(sanitizeAllowlist).filter((key) => !registered.includes(key));
    assert.deepEqual(unknown, [], `allowlist references unregistered keys: ${unknown.join(', ')}`);
    const unaccounted = registered.filter((key) => !(key in sanitizeAllowlist));
    assert.deepEqual(unaccounted, [],
        `new storage keys must join the sanitize allowlist with their degradation path: ${unaccounted.join(', ')}`);

    // 白名单的**值**必须被真正断言，否则它只是装饰（本门禁 2026-09-16 修正前的
    // 原状：只遍历 Object.keys，值从未读过——一个恒真断言）。这里要求每个 key
    // 至少有一个降级函数在 index.ts 里被**调用**（而不是仅被 import 或仅在
    // 类型声明里出现），即"读取路径确实走过了清洗函数"。
    let checkedKeys = 0;
    let checkedCalls = 0;
    for (const [key, markers] of Object.entries(sanitizeAllowlist)) {
        assert.ok(Array.isArray(markers) && markers.length > 0, `${key} must declare at least one degradation path`);
        const called = markers.filter((name) => {
            // 反向否定环视排除 `export function name(` 这类 ambient 声明：
            // 声明存在不等于调用存在。扫描对象是去注释后的 indexCode，
            // 所以「把调用注释掉」或「在注释里写下调用文本」都不能满足这条断言。
            const call = new RegExp(`(?<!export function )\\b${name}\\(`);
            return call.test(indexCode);
        });
        assert.ok(called.length > 0,
            `${key}: none of [${markers.join(', ')}] is actually invoked in index.ts — the read path has no sanitize`);
        checkedKeys += 1;
        checkedCalls += called.length;
    }
    assert.equal(checkedKeys, registered.length, 'every registered key must be checked, not a subset');
    assert.ok(checkedCalls >= registered.length, 'each key needs at least one live call site');
});
