# ADR 0090：归档总上限校准 512 → 544 KiB

日期：2026-09-28。状态：已采纳。

## 背景

2026-09-27 计划（[dev-plan-2026-09-27](../dev-plan-2026-09-27.md)）阶段 A/B 全部与阶段 C 首项落地后，`package.zip` 达 522,587 字节（T-6957 后实测），距 512 KiB（524,288 字节）归档总上限仅余 ~1.7 KiB。T-6958（片段保存冲突比较与保留副本）为主体落在动态 chunk 的功能，其代码与 i18n 增量将使整包越线。

## 减量审计（先于任何上调执行）

1. **icon.png / preview.png / i18n / README 双语 / plugin.json**：集市上架必需资产，不可移除。
2. **包内 4 个 docs 文件**（agent-document-context-m2 / architecture.svg / component-store-guide / interface-map，合计压缩 ~8 KiB）：F7 收口（T-6707）按集市 `publish.resources` 新规逐文件声明的商店-facing 资产，移除即回退既有合规决策。
3. **代码资产**：snippet 实验室已是独立动态 chunk（59,829 字节未压缩）；阶段 A/B/C 增量均为用户在 13 项计划中逐项批准的功能（预览固定/查找、设置搜索、保存搜索编辑、布局撤销、健康详情、差异预览、脏稿三选一、草稿撤销）。
4. 结论：**无死重量可删，无合规资产可摘**——按 ADR 0089 同一程序做有记录上调。

## 决策

1. 归档总上限（`ARCHIVE_BUDGET_BYTES`）从 512 KiB 上调至 **544 KiB**（+32 KiB，与压缩条目线 0089 步进一致）。
2. 单条目压缩预算线 **320 KiB 不变**（ADR 0089），raw 自律线 **1088 KiB 不变**（当前 1,104,071 字节，余 ~10 KiB）。
3. 上调后立即恢复观测：连续两个版本整包增长 > 8 KiB/版时，下一批必须优先评估动态 chunk 分流而非再次上调。

## 后果

- `scripts/release-readiness-metrics.cjs`、`docs/release-readiness.md` 快照与预算链描述同步。
- 阶段 C 剩余（T-6957 已含）与阶段 D（T-6959~T-6961）的包体增量在此线内推进；每批提交照旧复核 `readiness:snapshot` 余量。
- 本 ADR 不改变任何外部契约；集市无归档体积限制，512 KiB 一直是本仓自查线。
