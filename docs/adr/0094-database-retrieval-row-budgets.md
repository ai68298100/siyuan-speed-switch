# ADR 0094：数据库与检索终批的首屏行预算

- 日期：2026-09-28
- 状态：已采纳（T-6981 / T-6971 批次⑨ A 组）
- 关联：`docs/design/component-specs-09-longtail.html`、T-6478、T-6971

## 背景

终批 A 组的数据库与检索组件已经具备各自的内核取数和受控点击链路，但部分旧配置仍允许 8～12 行。规格卡把这些内容定义为一屏可读的列表：数据库、已存筛选、最近更新、近期编辑和插件命令最多 5 行；数据库当前视图保留独立的 8 行表格上限，随机回顾保留最多 6 个候选以支持抽样。

## 决策

1. 将 `database-list`、`saved-searches`、`recent-updates`、`recent-edits` 和 `plugin-commands` 的目录 schema、纯投影和请求参数统一钳制到最多 5 行，默认值也为 5。
2. `database-table` 继续使用 8 行投影上限；列白名单与 `/api/av/renderAttributeView` 的有界 `pageSize` 管线保持不变。
3. `random-review` 继续使用最多 6 个候选，保留 SQLite `ORDER BY random()` 的只读抽样；会话去重与刷新语义不在本任务扩权。
4. 插件命令继续由 `getPluginCommands()` 提供，投影值必须带 `cmd:` 前缀，点击仍走既有受控命令分发。

## 后果

- 终批 A 组在 small/medium/wide 卡中保持稳定首屏高度，配置输入、SQL LIMIT 和投影长度不会互相漂移。
- 数据库表格可以显示稍多行以保留列对比能力，但仍受 AV 投影预算约束；不把数据库表格改造成新的全库扫描。
- 随机回顾仍可能在跨刷新时重复文档；本任务明确保留当前手动刷新抽样语义，后续若引入会话级种子另立任务。
