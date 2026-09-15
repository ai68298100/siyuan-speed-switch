# Agent 受控执行链（T-122~T-194）交付状态证据

> 生成日期：2026-09-15　用途：为 TODO 台账中 71 项 `T-122~T-194` 的裁定提供可核对证据。
> 关联决策：D-283（执行链拆到 v0.18）、D-111（写入动作仍等待独立审批与宿主验证）、D-352。

## 结论（先给结论）

**这 71 项不应勾选为已完成。**

准确状态是：**模型层已交付，执行链尚未接入生产入口**。按 D-283，受控执行链被有意推迟到 v0.18，因此"模块存在 + 测试通过"不等于"功能已上线"。

## 判定依据：生产入口直接依赖

`src/index.ts` 是唯一的生产入口。它只直接引入 4 个 agent 模块：

| 模块 | 生产入口 | 说明 |
| --- | --- | --- |
| `agent-capabilities` | 是 | 能力定义与注册 |
| `agent-document-context` | 是 | 只读文档上下文（v0.17 已上线） |
| `agent-readonly-audit` | 是 | 只读审计 |
| `agent-workspace-diagnostics` | 是 | 只读运行时诊断（D-220 接入） |

其余 **15 个模块全部未进入生产入口**，只在测试与模型层互引中存在：

```
agent-approval-token           agent-workspace-capability
agent-document-set-actions     agent-workspace-capability-definitions
agent-host-actions             agent-workspace-execution
agent-workspace-actions        agent-workspace-plan
agent-workspace-approval       agent-workspace-probe
agent-workspace-bridge         agent-workspace-registry
agent-workspace-runtime        agent-workspace-session
agent-write-actions
```

这 15 个模块覆盖了 `T-122~T-194` 描述的计划、审批令牌、执行状态机、宿主适配器、bridge facade、session registry、事件队列与恢复协调器等能力——即**完整的受控执行链**。

## 为什么不能仅凭"模块存在"打勾

表面上每个条目都能找到对应模块和测试，但这些模块：

1. 不被 `index.ts` 引入，因此不会随插件加载；
2. 其能力（计划审批、写入动作、文档集恢复等）**未注册为 Agent capability**；
3. D-111 明确"写入动作仍等待独立审批与宿主验证"，D-283 明确执行链属于 v0.18。

若据此勾选，台账会把"有模型、未接线"误标为"已完成"，使自主开发循环跳过 v0.18 的真实接线工作。

## 建议的台账处理

保持 `T-122~T-194` 为未完成，并在章节标题补充状态标注，例如：

```
## T-122~T-194 Agent 受控执行链（模型已交付，待 v0.18 生产接线）
```

后续 v0.18 接线时，判定标准应包含至少一条可验证信号：

- 相应模块被 `src/index.ts` 引入；
- 能力出现在 `agent-capabilities` 的注册集合中；
- 存在针对生产注册结果的宿主契约测试。

## 方法说明

本表以"`src/index.ts` 是否 import 该模块"作为生产接线的判定信号，属于可机械核对的硬指标。

此前曾尝试按条目关键词匹配符号名来推断接线状态，得到"70/71 已接线"的结论——**该结论错误**：关键词（如 `session`、`runtime`、`bridge`）会在大量无关符号上命中，导致几乎所有条目都被判为已接线。该方法已废弃，本文只采用生产入口依赖这一硬指标。
