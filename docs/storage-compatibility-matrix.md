# 存储版本兼容矩阵

> 交付物对应 ROADMAP v0.20「存储版本统一审计：8 个数据 key 的迁移函数、容量边界与跨版本兼容矩阵」。
>
> 本文档是**开发文档**，不进发布归档（与 `gate-audit-checklist.md`、`host-gate-audit.md` 一致：`package.zip` 只收显式声明的 4 个 docs 文件）。

## 0. 先勘误：是 13 个 key，不是 8 个（v0.24.0 起为 14→15→16 个）

路线图该句沿用 R0 阶段写下的记录数字（`ROADMAP.md:114`「记录当前设置字段、8 个数据 key、思源最低版本和发布产物清单」）。逐 tag 统计 `src/constants.ts` + `src/index.ts` 中 `sw_*` 存储 key 的唯一数量，可以精确定位「8」的时点：

| 版本 | key 数 | 说明 |
| --- | --- | --- |
| v0.0.1 | 1 | 只有 `sw_mru` |
| v0.1.0 | 3 | + `sw_pinned`、`sw_settings` |
| v0.2.0 | 4 | + `sw_thumb_cache` |
| v0.3.0 | 5 | + `sw_favorites` |
| v0.6.0 | 6 | + `sw_fav_groups` |
| v0.15.0 | 7 | + `sw_fav_collapsed` |
| **v0.16.9** | **8** | + `sw_quick_actions` ← **路线图「8 个数据 key」的时点** |
| **v0.16.16** | **13** | + `sw_open_history` / `sw_closed_history` / `sw_quick_actions_defaults` / `sw_document_sets` / `sw_home_state` |
| v0.16.16 → v0.23.5 | 13 | 此后恒定不变 |
| **v0.24.0（D-401）** | **14** | + `sw_schema_version`（存储版本戳，见第 2 节末行） |
| **v0.24.0（T-6685）** | **15** | + `sw_rss_read`（RSS 已读状态，见第 2 节末两行） |
| **v0.37.0（T-6840）** | **16** | + `sw_related_swr`（关联内容 SWR 持久缓存，见第 2 节末行） |

复现命令：

```bash
for t in $(git tag --sort=creatordate); do
  n=$( (git show $t:src/constants.ts 2>/dev/null; git show $t:src/index.ts 2>/dev/null) \
       | grep -o '"sw_[a-z_]*"' | grep -v 'sw__' | sort -u | wc -l)
  echo "$t $n"
done
```

**因此本审计以代码为准：16 个 key。** 该数字由门禁钉住（见第 4 节），不会随文档漂移。

## 1. 唯一登记处

| 环节 | 位置 | 约束 |
| --- | --- | --- |
| key 常量定义 | `src/constants.ts`（ADR-0002） | 业务代码禁止手写 key 字符串字面量 |
| 迁移/分类登记 | `src/storage-migration.js` 的 `HANDLED_KEYS`(13) + `INSPECTED_KEYS`(2) + `META_KEYS`(1) | 拼接为 `KEY_ORDER`，总数恒 16 |
| 只读快照计数上限 | `src/agent-capabilities.js` | 与 `KEY_ORDER.length` 同源（钳制到 15） |
| 降级函数白名单 | `src/index.ts` 读取路径 | 每个 key 必须有清洗/归一化函数**被调用** |

`KEY_ORDER = HANDLED_KEYS ∪ INSPECTED_KEYS ∪ META_KEYS` 是**拼接**而非独立字面量，因此「分类集与报告 key 集合不可能漂移」。`sw_thumb_cache` 从 inspect 毕业到 handled 时，报告里它的位置从第 13 位前移到第 11 位，但 key 集合与总数完全不变，下游只读快照无需改动。

## 2. 15 个 key：迁移函数与容量边界

`分类` 列含义：**handled** = 进入迁移 `data`（宿主可据此覆盖）；**inspect** = 只报形状、不进 `data`（深度迁移由宿主读取路径负责）。

| # | key | 常量 | 分类 | 迁移/清洗函数 | 函数所在 | 容量边界 | 引入 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `sw_mru` | `MRU_KEY` | handled | `capMru` | util.js | 200（`MRU_MAX`） | v0.0.1 |
| 2 | `sw_open_history` | `HISTORY_KEY` | handled | `sanitizeOpenHistory` | util.js | 50（`HISTORY_MAX`） | v0.16.11 |
| 3 | `sw_closed_history` | `CLOSED_HISTORY_KEY` | handled | `normalizeClosedEntries` | recent-closed.js | 50（`HISTORY_MAX` 共用） | v0.16.12 |
| 4 | `sw_pinned` | `PINNED_KEY` | handled | `sanitizeStringList` | util.js | 64（`PINNED_MAX`） | v0.1.0 |
| 5 | `sw_favorites` | `FAV_KEY` | handled | `sanitizeFavorites` | util.js | 512（`FAVORITES_MAX`） | v0.3.0 |
| 6 | `sw_fav_groups` | `FAV_GROUPS_KEY` | handled | `sanitizeStringList` | util.js | 64（`FAVORITE_GROUPS_MAX`） | v0.6.0 |
| 7 | `sw_fav_collapsed` | `FAV_COLLAPSED_KEY` | handled | `sanitizeStringList` | util.js | 64（与分组注册表同界） | v0.15.0 |
| 8 | `sw_quick_actions` | `QUICK_ACTIONS_KEY` | handled | `sanitizeQuickActions` | quick-actions.js | 12（`QUICK_ACTIONS_MAX`） | v0.16.9 |
| 9 | `sw_quick_actions_defaults` | `QUICK_ACTIONS_DEFAULTS_KEY` | handled | `migrateQuickActionDefaults`（值 = `QUICK_ACTION_DEFAULTS_VERSION` 2） | quick-actions.js | 单值版本标记 | v0.16.12 |
| 10 | `sw_document_sets` | `DOCUMENT_SETS_KEY` | handled | `normalizeDocumentSets` | document-sets.js | 24 组（`DOCUMENT_SET_MAX`）、每组 40 条（`DOCUMENT_SET_ENTRY_MAX`）、组名 80（`DOCUMENT_SET_NAME_MAX`）、标题 200（`DOCUMENT_SET_TITLE_MAX`）、分组名 64（`DOCUMENT_SET_GROUP_MAX`） | v0.16.12 |
| 11 | `sw_thumb_cache` | `THUMB_CACHE_KEY` | handled | `normalizeThumbCache` | util.js | **40 条 / 200 KiB**（`THUMB_CACHE_MAX` / `THUMB_HTML_MAX`；手机 30 / 80 KiB） | v0.2.0 |
| 12 | `sw_settings` | `SETTINGS_KEY` | inspect | `normalizeSettings`（宿主读取路径） | settings-model.ts | 字段级（见设置 schema） | v0.1.0 |
| 13 | `sw_home_state` | `HOME_STATE_KEY` | inspect | `normalizeHomeState` + `migrateHomeState`（宿主读取路径） | home-model.js | 每设备布局 64 条、config 32 字段 | v0.16.13 |
| 14 | `sw_schema_version` | `SCHEMA_VERSION_KEY` | meta | `stampStorageSchemaVersion`（onload 落戳，D-401） | index.ts | 单值：`STORAGE_SCHEMA_VERSION`（当前 1） | v0.24.0 |
| 15 | `sw_rss_read` | `RSS_READ_KEY` | handled | `normalizeRssReadState`（rss-model，有界 200 条） | rss-model.js | 200 条（`RSS_READ_STATE_MAX`） | v0.24.0 |
| 16 | `sw_related_swr` | `RELATED_SWR_KEY` | handled | `normalizeRelatedSwrStore`（related-content-model，版本/年龄/去重/有界） | related-content-model.js | 8 条（`RELATED_SWR_MAX_ENTRIES`）、7 天年龄上界（`RELATED_SWR_MAX_AGE_MS`） | v0.37.0 |

`meta` 分类（D-401 新增）：不承载业务数据，永不进入迁移 `data`（写入完全由 onload 落戳函数管理）。演练判定：缺失 → missing；损坏（非 ≥1 整数）→ reset；等于当前版本 → kept；小于当前版本 → migrated（未来版本迁移入口）；大于当前版本 → kept 且值原样保留（疑似降级，保留证据，onload 侧 `logger.warn` 告警并记录 `storageSchemaDowngradeFrom`）。

**为什么 12/13 仍是 inspect**：两者的宿主读取路径本来就有 `normalizeSettings` / `normalizeHomeState` 兜底（`index.ts:1345` / `index.ts:3709`），不存在「写入侧有上限、读取侧无校验」的缺口，因此不做重复动作（D-392 的克制点）。

**迁移状态语义**（`runStorageMigration` 的 `report.keys[].status`）：

| status | 含义 |
| --- | --- |
| `missing` | 输入不存在 → 由宿主默认值补齐 |
| `kept` | 输入合法且无需改动 |
| `cleaned` | 输入被清洗（去重/截断/丢弃损坏条目），`kept`/`removed` 给出记账 |
| `migrated` | 结构或 schemaVersion 变更（如文档集旧形态） |
| `reset` | 整体重置（非数组/非对象输入，或缺失的版本标记） |
| `inspect` | 仅形状分类，深度迁移委托宿主 |

## 3. 跨版本迁移矩阵（时间线）

只列**真实存在迁移动作**的节点，均已由 git 定位到引入提交并核对 `plugin.json` 版本。

| 版本 | key | 变更 | 迁移实现 | 证据 |
| --- | --- | --- | --- | --- |
| v0.0.3 | （快捷键，非 key） | 默认快捷键 `⇧⌥S` → `⌥⇧S`（思源 `matchHotKey` 要求 `⌥` 在 `⇧` 之前，旧顺序永不匹配） | `LEGACY_HOTKEY` 比对 + 改写（`index.ts:1318`） | `d775a21` |
| v0.2.0 | `sw_thumb_cache` | 引入；写入侧上限 40 条 / 200 KiB | `setThumbCache` | `cc8fde1f` |
| v0.7.0 | `sw_thumb_cache` | 定义手机端常量（20 条 / 80 KiB），但 `setThumbCache` **硬编码桌面常量、未使用该常量** → 手机端实际按 40 条 / 200 KiB 收 | —（缺陷窗口） | `e5299c6` |
| v0.8.0 | `sw_thumb_cache` | 写入侧改为按端型选择 → 手机端**收紧**到 30 条 / 80 KiB（旧残留：31~40 条、或单条 80~200 KiB） | `this.isMobile ? … : …` | `ec55fe5` |
| v0.16.4 | `sw_mru` | 载入期清洗 | `capMru` | `35d183c` |
| v0.16.11 | `sw_open_history` | 引入（旧 tab-id 项迁移为文档 root 键） | `sanitizeOpenHistory` | `275a218` |
| v0.16.11 | `sw_home_state` | 引入；`widgets` → `instances`、`layout` → `layouts` | `migrateHomeState`（`home-model.js:357`） | `a690cd4` |
| v0.16.12 | `sw_closed_history` | 引入 | `normalizeClosedEntries` | `076ef02` / `d27fde0` |
| v0.16.12 | `sw_favorites` | 旧 tab-id key → 文档 rootId 的条目级迁移 | `migrateFavoriteEntry`（`favorite-actions.js:28`） | `d27fde0` |
| v0.16.12 | `sw_quick_actions_defaults` | 引入；版本标记升至 2 | `migrateQuickActionDefaults` | `d27fde0` |
| v0.16.12 | `sw_document_sets` | 引入；`DOCUMENT_SET_SCHEMA_VERSION = 1` | `normalizeDocumentSets` | `d27fde0` |
| v0.16.13 | `sw_home_state` | 扩展为分端布局（`layouts[device]`） | `normalizeLayout` | `0bdd056` |
| v0.19.0 | （全量） | 引入 `STORAGE_SCHEMA_VERSION = 1` 与迁移演练管道 | `runStorageMigration` | `ebcaea3` |
| v0.20.0（D-392） | `sw_thumb_cache` | **读取侧归一化**：此前写入侧只拦新增、不清理存量，读取侧只判「是不是对象」（连数组都放行） | `normalizeThumbCache`（`util.js`） | `1cccf79` |

**当前 schema 汇总**：

| 标记 | 值 | 定义处 |
| --- | --- | --- |
| `STORAGE_SCHEMA_VERSION` | 1 | `src/storage-migration.js:38` |
| `QUICK_ACTION_DEFAULTS_VERSION` | 2 | `src/quick-actions.js:21` |
| `DOCUMENT_SET_SCHEMA_VERSION` | 1 | `src/document-sets.js:4` |
| `HOME_SCHEMA_VERSION` | 1 | `src/home-model.js:3` |
| `LEGACY_HOTKEY` | `"⇧⌥S"` | `src/constants.ts:162` |

## 4. 门禁

| 门禁 | 覆盖 |
| --- | --- |
| `tests/storage-key-audit.test.cjs` | key 常量唯一登记处、`loadData`/`saveData` 只用 `*_KEY`、每个 key 的清洗函数**被调用**（非仅声明）、检查项数 = 注册项数 |
| `tests/storage-migration.test.cjs` | 16 个 key 的分类与总数不可漂移、per-key 迁移契约、端型上限三处同源、演练对宿主清洗结果是不动点 |
| `tests/storage-compatibility-matrix.test.cjs` | **本文件与代码一致**：文档列出的 key 集合、上限值必须与 `constants.ts` / `DEFAULT_LIMITS` 双向匹配 |
| `tests/storage-migration.test.cjs`（源码扫描） | 扫描前剥离注释（`tests/source-scan.cjs`），防止「调用被注释掉」仍通过 |

## 5. 已知未覆盖（诚实边界）

- **真机升级矩阵未取证**：干净目录安装 / 升级 / 卸载后的数据表现属 v0.21「思源市场发布流程演练」，需真实宿主与用户操作，本文档只覆盖**代码层**的迁移函数与边界。
- **`sw_settings` / `sw_home_state` 的深度迁移仍未在演练管道内实现**：两者的清洗函数在宿主读取路径被调用，但 `runStorageMigration` 对它们只报 `inspect`。若未来要「用演练管道替换 `sanitizePersistentData` 的静默修复」，这两个 key 必须先毕业（与 `sw_thumb_cache` 同样的路径）。
- **版本标记的语义边界**：`sw_quick_actions_defaults` 存的是「默认值迁移版本标记」而非数据本身，`reset` 在宿主语义里意味着「将执行一次性默认集迁移」，不是「清空用户数据」——阅读迁移报告时勿混用其它 key 的 `reset` 含义。
