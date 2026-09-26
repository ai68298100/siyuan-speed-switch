# R10 聚焦调研（2026-09-27）：usercss 变量系统深读 + 生态增量

> 轮次：R10（R9 后立即滚入；§8.0.12 引擎 + 用户"持续进入下一计划"指令）。定向两线，不做五类全铺。

## 1. usercss 变量系统（T-6912 的自然深化，片段实验室互通线）

对 Stylus/openstyles usercss 元数据规范的取证结论：

- **占位符语法**：正文中以 `/*[[变量名]]*/` 出现（注意不是 `{{name}}`——检索纠正了先验记忆）。
- **变量定义**：元数据块内 `@var <type> <name> <default> ["label"]`；类型= color / text / number（`min, max, step`）/ select（`"default" ["v1" "L1", ...]`）/ checkbox（`1|0`）；`@advanced` 承载 dropdown/image 等复杂 UI。
- **吸收判定（T-6923，本批实现）**：导入含 `@var` 的 usercss 时，此前 T-6912 的"无条件去头"会把变量定义剥掉、正文里的占位符悬空（预览损坏）。改为：**检出变量时保留头部，并按默认值代入占位符**——从 userstyles.world 下载的样式导入即可直接预览与启用；无变量的普通样式维持去头行为（往返不累积）。`@advanced` 的 dropdown/image 不猜，占位符原样保留。
- 导出侧配套：正文已含 usercss 头时不再叠加第二份头。
- **明确不做**：变量编辑 UI（@var 表单化）——大件，等真实使用反馈；checkbox 逻辑分支本就非纯 CSS 能力。

## 2. 启动器/笔记生态增量

- Raycast：R8 已覆盖 layout capture（已由 T-6921 活动文档维度吸收其语义）；本轮新增 Notes v0.46 与 Grid Overlay 均为平台内功能，无插件层可吸收点。
- Obsidian 周更/论坛：R8 后 24h 无结构性新信号。**防反复：不为凑轮次重复扫描。**
- 思源 3.8.6 仍 alpha（见 R9），解冻项维持后置。

## 3. 立项

T-6923：usercss 变量默认值代入（模型 `resolveUsercssVariables` + 导入接线 + 导出防叠头 + 变量数回执）。属片段实验室互通线的第二批，纯本地交付。
