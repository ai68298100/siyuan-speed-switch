const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// T-6488：数据变更刷新链（借鉴 siyuan-lumina 的 onDataChanged 纪律）。
// 覆盖边界：静态源码约束 + 常量清单同源性，不证明宿主广播行为；
// 真实 sync / overwrite 触发须由 host-e2e 取证。

const ROOT = path.resolve(__dirname, "..");
const indexSource = fs.readFileSync(path.join(ROOT, "src/index.ts"), "utf8");
const constantsSource = fs.readFileSync(path.join(ROOT, "src/constants.ts"), "utf8");
const {KEY_ORDER} = require("../src/storage-migration.js");

// 取方法体：从签名起，到下一个同缩进的 `    }` 止（本仓方法均为 4 空格缩进）。
function methodBody(signature) {
    const start = indexSource.indexOf(signature);
    assert.ok(start > 0, `找不到 ${signature}，扫描需同步更新`);
    const end = indexSource.indexOf("\n    }", start);
    assert.ok(end > start, `${signature} 方法体边界未找到`);
    return indexSource.slice(start, end);
}

function constantValue(name) {
    const m = constantsSource.match(new RegExp(`export const ${name} = "([^"]+)"`));
    assert.ok(m, `常量 ${name} 未在 constants.ts 中找到字符串字面量`);
    return m[1];
}

test("plugin overrides onDataChanged so a sync no longer reloads the whole plugin", () => {
    assert.match(indexSource, /async onDataChanged\(reason\?: TPluginDataChangeReason\)/,
        "钩子必须带宿主声明的 reason 类型");
    const body = methodBody("    async onDataChanged(");
    // 回环防线：钩子链内任何写盘都会再次广播数据变更并回到本钩子。
    for (const step of ["saveData(", "saveDataDebounced(", "removeData(",
        "runQuickActionDefaultsMigration(", "sanitizePersistentData("]) {
        assert.ok(!body.includes(step), `onDataChanged 调用链不得出现会写盘的步骤：${step}`);
    }
    assert.match(body, /await this\.loadPersistentKeys\(\)/, "必须重读持久化 key");
    assert.match(body, /this\.captureStorageMigrationSnapshot\(\)/, "必须复跑只读演练");
    assert.match(body, /this\.scheduleSidebarRefresh\(\)/, "必须触发惰性刷新");
    assert.match(body, /dataChangeReloadInFlight/, "必须防并发重入并合并后续广播");
});

test("PERSISTENT_KEYS is the single source of the stored key list", () => {
    const declared = constantsSource.match(/export const PERSISTENT_KEYS[^\n]*\n([\s\S]*?)\]\)/);
    assert.ok(declared, "constants.ts 缺少 PERSISTENT_KEYS 清单");
    const names = [...declared[1].matchAll(/\b([A-Z_]+_KEY)\b/g)].map((m) => m[1]);
    assert.equal(names.length, KEY_ORDER.length,
        `PERSISTENT_KEYS 条目数（${names.length}）与 KEY_ORDER（${KEY_ORDER.length}）不一致`);
    assert.deepEqual(names.map(constantValue).sort(), KEY_ORDER.slice().sort(),
        "PERSISTENT_KEYS 与 storage-migration 的 KEY_ORDER 不同集：新增 key 必须两处同时登记");
});

test("the stored key list is never enumerated a second time in the entry", () => {
    const loads = [...indexSource.matchAll(/this\.loadData\(/g)];
    assert.equal(loads.length, 2, "只允许两处 loadData：loadPersistentKeys 与容量测量，且都遍历清单");
    assert.equal((indexSource.match(/PERSISTENT_KEYS\.map\(/g) || []).length, 2,
        "两处遍历都必须走 PERSISTENT_KEYS，不得回退成手抄清单");
    assert.ok(!/measure\([A-Z_]+_KEY, this\.loadData\([A-Z_]+_KEY\)\)/.test(indexSource),
        "容量测量不得再手抄 key 清单");
});
