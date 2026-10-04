# v0.17 Agent 工作区能力生产接入计划

> 状态：2026-10-04 T-7097 复核；阶段 1/2 已接入，阶段 3 由 ADR 0063 的宿主 actionEffects 路线替代并经 T-6680/T-1219 交付 propose/execute。旧自建审批/令牌/bridge 路线不再是待办，不恢复已撤除模块；真实宿主确认卡的端侧验收仍归 B-004/B-005。
> 以下预算是 2026-09-14 历史测量：`package.zip` 252683 bytes（当时余量 54517 bytes）、raw 自律线 356 KiB（当时 363569 bytes）。当前预算与构建快照以 `release-readiness.md` 为准，不能将历史余量用作新模块接入依据。

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

## 阶段 1：workspace-capability-diagnostics（✅ 已完成，2026-09-14，D-220）

- 契约已就绪（T-229~T-231、D-177~D-191）：只读 diagnostics 快照 + 异常隔离 handler + canonical effects 安全注册适配器。
- 实际执行（诚实搬移路线）：33 个符号（事件队列/恢复协调器/会话/registry/diff 队列/diagnostics handler）机械搬移至 `agent-workspace-runtime.js`，definitions 改同名 re-export；diagnostics 专用校验器不引用 bridge 常量；index.ts 经包装器接入只读通道并随卸载销毁。预算：raw +20.5 KiB（自律线 376 KiB）、zip +5.1 KiB（余量 49440 bytes）；未启用的 definitions 矩阵留在图外。原步骤保留备查：
  1. 从 `agent-workspace-capability-definitions.js` 抽取 diagnostics 专用入口（或拆分模块），避免把未启用的 definitions 矩阵整体拖入 bundle；
  2. index.ts 增加 spec + handler，输出当前 definitions/lifecycle/registry 诊断摘要（未接线阶段预期为空态/禁用计数，正好为阶段 2/3 提供基础设施探针）；
  3. 卸载清理挂接现有 capability dispose 链；
  4. 测试镜像 `agent-outline.test.cjs` 模式（spec/effects/handler 一致性 + 输出有界）。
- 门禁：`production-graph-isolation` 的 UNWIRED 清单相应收窄并记录 D 条目；`verify:release` 全绿。

## 阶段 2：document-context 只读接入（✅ 已完成，2026-09-14，T-368~T-390）

- 生产入口已注册独立 `document-context` 只读 capability：省略 id 时读取活动 root，已打开页签优先，关闭文档使用单行 SQL 元数据回退。
- handler 复用 `/api/outline/getDocOutline` + 活动页签解析，与现有 outline/navigation 能力同源；输出标题、笔记本、路径、活动态和 ≤24 条大纲，不返回正文。
- 输入/输出归一化、稳定错误语义和 wiring 静态门禁已落地；取消/权限真实桌面证据仍保留为后续宿主验收，不以 mock 替代。
- 预算影响：本轮构建后复核 raw 自律线与 zip 余量，并由 release-readiness 记录。

## 阶段 3：计划执行链（已由宿主审批路线替代并交付）

- 实际路线：宿主 `actionEffects` 声明与能力检测；propose 只读、execute 受控动作逐整单确认；无确认能力宿主只提供只读路径。`src/index.ts` 与 `production-graph-isolation.test.cjs` 记录六个执行模块的生产接入。
- 原 bridge facade、审批挑战/令牌、自建执行模块的建议已被 ADR 0063 否决，不重新实现；definitions/probe 的未接线合同继续在生产图外。
- 剩余真实验收：宿主确认卡点击、拒绝/超时、卸载清理及手机端能力矩阵。浏览器夹具和本地单元不替代 Android 或原生桌面确认卡证据。

## 通用门槛（每阶段）

1. `production-graph-isolation` UNWIRED/WIRED 清单更新 + 对应 ADR 条目；
2. 包体三查：raw 自律线、zip 硬上限余量、resource-audit 基线漂移诊断；
3. `pnpm verify:release` 全绿；真实宿主行为验证项集中记入 BLOCKERS/验收清单，不以 mock 替代。
