# Agent 受控执行链（T-122~T-194）交付状态证据

> 生成日期：2026-09-15　用途：为 TODO 台账中 71 项 `T-122~T-194` 的裁定提供可核对证据。
> 关联决策：D-283（执行链拆到 v0.18）、D-111（写入动作仍等待独立审批与宿主验证）、D-352。

## 结论（先给结论）

**这 71 项不应勾选为已完成。**

准确状态是：**模型层已交付，执行链尚未接入生产入口**。按 D-283，受控执行链被有意推迟到 v0.18，因此"模块存在 + 测试通过"不等于"功能已上线"。

## 判定依据：生产入口闭包

`src/index.ts` 是唯一的生产入口。它**直接**引入 4 个 agent 模块：

| 模块 | 引入方式 | 说明 |
| --- | --- | --- |
| `agent-capabilities` | 直接 | 能力定义与注册 |
| `agent-document-context` | 直接 | 只读文档上下文（`index.ts:88`，v0.17 已上线） |
| `agent-readonly-audit` | 直接 | 只读审计 |
| `agent-workspace-diagnostics` | 直接 | 只读运行时诊断（D-220 接入） |
| `agent-workspace-runtime` | **间接** | 由 `agent-workspace-diagnostics` 引入（D-220 诚实搬移） |

因此生产闭包实际含 **5 个** agent 模块，而非仅看 `index.ts` 字面 import 所得的 4 个。判定时应以**从 `index.ts` 出发的可达闭包**为准，不能只看直接 import。

其余 **14 个模块未进入生产闭包**（另有 1 个非 agent 命名的 `path-filter-model` 同属未接线清单），只在测试与模型层互引中存在：

```
agent-approval-token           agent-workspace-capability
agent-document-set-actions     agent-workspace-capability-definitions
agent-host-actions             agent-workspace-execution
agent-workspace-actions        agent-workspace-plan
agent-workspace-approval       agent-workspace-probe
agent-workspace-bridge         agent-workspace-registry
agent-workspace-session
```

加上 `path-filter-model`，共 15 项未接线，与 `tests/production-graph-isolation.test.cjs` 的 `UNWIRED_CONTRACT_MODULES` 一致。

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

## v0.18 接入预算实测（2026-09-16 补）

包体曾被认为是 v0.18 的主要障碍，但 D-353 将 `package.zip` 上限上调至 512 KiB、`dist/index.js` 自律线调至 768 KiB 后，余量已不再是约束。以下为**实测**而非估算：

方法：用 esbuild 对同一入口做两次 `--bundle --minify` 打包，取差值。共享依赖在两次打包中都只计一次，因此差值即真实增量（esbuild 与 webpack 压缩率略有差异，esbuild 基线 585176 bytes 对应 webpack 产物 560476 bytes，约 4.4% 偏差，可按同比例下修）。

| 打包内容 | 字节数 |
| --- | --- |
| `src/index.ts` 单入口（基线） | 585,176 |
| 基线 + 全部 15 个契约模块 | 646,321 |
| **增量** | **61,145 bytes ≈ 59.7 KiB**（占总包 9.5%） |

按 webpack 压缩率折算约 **58 KiB**。对照当前余量：

| 约束 | 余量 | 全量接入后 |
| --- | --- | --- |
| `dist/index.js`（768 KiB 自律线） | 225,956 bytes | 约 168,000 bytes |
| `package.zip`（512 KiB 硬上限） | 229,884 bytes | 约 210,000 bytes（源码经 ZIP 二次压缩后增量远小于 59.7 KiB） |

**结论：v0.18 可以一次性接入全部 15 个模块，无需分批、无需先做归档内容裁剪。** 包体不再是阻塞项。

仍需注意的是，包体从来不是 v0.18 的唯一前置条件——`BLOCKERS.md` 的 B-005（无已认证桌面会话）与 D-111（写入动作待独立审批与宿主验证）依然有效，它们与体积无关。

## 方法说明

本表以"`src/index.ts` 是否 import 该模块"作为生产接线的判定信号，属于可机械核对的硬指标。

此前曾尝试按条目关键词匹配符号名来推断接线状态，得到"70/71 已接线"的结论——**该结论错误**：关键词（如 `session`、`runtime`、`bridge`）会在大量无关符号上命中，导致几乎所有条目都被判为已接线。该方法已废弃，本文只采用生产入口依赖这一硬指标。

### 该硬指标一度不可靠（D-354）

2026-09-16 核查发现，`tests/production-graph-isolation.test.cjs` 的未接线泄漏断言只检查 `graph.has(name)` 与 `graph.has(name + ".ts")`，而同文件的 WIRED 健全性断言还额外检查 `graph.has(name + ".js")`。由于遍历存的是**带扩展名的解析文件名**，缺失 `.js` 分支使该断言对纯 `.js` 契约模块完全失效：

- 当前闭包 31 个模块，旧逻辑漏检 **27** 个，修复后漏检 **0** 个；
- `UNWIRED_CONTRACT_MODULES` 全部条目均为 `.js`，即该门禁从未真正保护过其声称保护的对象；
- 直接证据：`agent-document-context` 已在生产闭包内却仍列于未接线清单，而断言报告无泄漏。

已修复为两断言共用 `inGraph()`（统一解析裸名 / `.js` / `.ts`）。**本文的接线结论以手工遍历闭包为准，不依赖修复前的门禁输出。**
