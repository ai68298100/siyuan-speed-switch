# ADR-0004 · 加载期数据净化（sanitize）

- **状态**：已采纳（v0.16.5）
- **背景**：插件持久化数据（收藏列表、置顶列表、分组注册表等）由运行时逐步写入，
  历史版本 bug（如收藏项点击后误删、字段类型漂移）或手工编辑可能让存储文件中出现脏数据：
  非对象元素、空 key、重复 key、字段类型错乱、非法字符串条目等。
  v0.16.4 已做运行时迁移修复（收藏 key 规范化），但只对"当次触达的数据"生效。
- **问题**：
  - 加载期不校验：脏数据随每次启动进入内存，并被后续写回放大。
  - 若每次启动都无条件回写：产生无意义的磁盘写入（移动端代价更高）。
- **决策**：
  - `src/util.js` 提供纯函数 `sanitizeFavorites(values)` 与 `sanitizeStringList(values)`，
    返回 `{ items, changed }`——仅在数据确实被清理时 `changed = true`。
  - 非数组输入返回 `{ items: [], changed: false }`：首启/缺文件场景返回空集合但不写盘，
    交由后续正常业务流程初始化。
  - `initPersistentData()` 加载完成后调用 `sanitizePersistentData()`，
    仅对 `changed` 的键调用 `saveDataDebounced` 回写。
  - `sanitizeFavorites` 归一化：丢弃非对象/空 key/重复 key（按 key 去重），
    `title`/`group` 强制为 string，`rootId` 空串归一为 `null`。
  - `sanitizeStringList`：过滤非 string 与空串条目，按值去重。
- **与运行时迁移的关系**：v0.16.4 的迁移（收藏 key 重映射）负责"结构升级"；
  本 ADR 的加载期净化负责"结构性脏数据兜底"。两者互补，均在数据加载路径上、
  在任何渲染与交互之前执行。
- **测试**：`tests/util.test.cjs` 新增 9 个用例（干净数据零改动、过滤、去重、
  字段归一、`rootId` 空串→`null`、非数组不写回等）；i18n 未受影响。
- **代价**：每次启动一次轻量遍历（数据量级 ≤ 数百条），可忽略。
