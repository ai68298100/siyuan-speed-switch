# v0.17 Agent 工作区能力生产接入计划

> 状态：研究结论（2026-09-14，D-219 预算解锁后）；每阶段进入实现前仍按 ROADMAP 8.0 口径复核。
> 预算基线：`package.zip` 252683 bytes（硬上限余量 54517 bytes）；raw 自律线 356 KiB（当前 363569 bytes）。

## 前置结论（已落档）

- D-216：16 个契约模块（约 155 KiB 源码）确认在生产闭包之外，`tests/production-graph-isolation.test.cjs` 固化。
- D-219：归档内容决策执行完毕，接入不再受包体内容决策阻塞；每阶段接入后照常复核 raw 自律线与 zip 余量。
- 生产注册模式已稳定：`registerAgentCapabilities()` → `registerReadOnlyAgentCapabilities(pluginWithAgent, [{spec, handler}])`，handler 统一 try/catch + `logger.warn` + 稳定错误串（见 index.ts `AGENT_CAPABILITY_SPECS.outline` 样例）。

## 体积预算（raw 源码 → 预估 minified）

| 模块簇 | raw | 预估 minified* | zip 增量预估 |
| --- | --- | --- | --- |
| 小型只读簇（document-context 2.4K + probe 1.3K + capability 2.7K + registry 1.1K + session 2.5K） | 10.1 KiB | ~5.5 KiB | ~2 KiB |
| 执行链（plan 12.8K + actions 6.8K + execution 4.7K + bridge 4.8K + approval 3.2K + write 3.2K） | 35.5 KiB | ~19 KiB | ~7 KiB |
| capability-definitions（definitions 矩阵 + diagnostics） | 100 KiB | ~55 KiB | ~20 KiB |

\* 按 search-model（35.3K→minified）实测压缩比估算；接入前以实际构建复核。

三阶段全部落地约 +29 KiB zip，硬上限内可容纳，但 definitions 全量接入后余量将回落至 ~25 KiB，需按协议校准自律线并记录。

## 阶段 1：workspace-capability-diagnostics（无宿主审计依赖，可立即开工）

- 契约已就绪（T-229~T-231、D-177~D-191）：只读 diagnostics 快照 + 异常隔离 handler + canonical effects 安全注册适配器。
- 接入步骤：
  1. 从 `agent-workspace-capability-definitions.js` 抽取 diagnostics 专用入口（或拆分模块），避免把未启用的 definitions 矩阵整体拖入 bundle；
  2. index.ts 增加 spec + handler，输出当前 definitions/lifecycle/registry 诊断摘要（未接线阶段预期为空态/禁用计数，正好为阶段 2/3 提供基础设施探针）；
  3. 卸载清理挂接现有 capability dispose 链；
  4. 测试镜像 `agent-outline.test.cjs` 模式（spec/effects/handler 一致性 + 输出有界）。
- 门禁：`production-graph-isolation` 的 UNWIRED 清单相应收窄并记录 D 条目；`verify:release` 全绿。

## 阶段 2：document-context 只读接入（前置：真实桌面取消/权限审计）

- T-122 自身依赖注明"真实桌面取消/权限审计后接入"；代码就绪（2.4 KiB 纯模型，大纲 ≤24 条、路径 ≤256 字符）。
- handler 复用 `/api/outline/getDocOutline` + 活动页签解析，与现有 outline/navigation 能力同源，无新增宿主面。
- 预算影响可忽略（+~2 KiB zip）。

## 阶段 3：计划执行链（前置：open-documents 真机点击验证 + 审批 UX 真机确认）

- 前置未满足前**不得**接入：plan/approval/execution/bridge 全链涉及受控写与确认弹窗（D-107 系列边界）。
- 接入顺序建议：bridge facade → 审批挑战/令牌（内存态）→ `open/open-batch` 两个白名单动作 definitions → 观察一个真实宿主周期后再评估扩动作。
- 真机验证清单：确认弹窗点击、拒绝/30 秒超时路径、令牌一次性消费、卸载后计划回收、手机端能力矩阵。

## 通用门槛（每阶段）

1. `production-graph-isolation` UNWIRED/WIRED 清单更新 + 对应 DECISIONS 条目；
2. 包体三查：raw 自律线、zip 硬上限余量、resource-audit 基线漂移诊断；
3. `pnpm verify:release` 全绿；真实宿主行为验证项集中记入 BLOCKERS/验收清单，不以 mock 替代。
