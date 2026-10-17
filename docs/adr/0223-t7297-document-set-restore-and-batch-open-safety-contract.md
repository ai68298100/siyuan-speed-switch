# ADR 0223：文档集恢复与批量打开动作受控执行与 6 态回执契约

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7297（Phase C 智能动作受控执行闭环）
- 依据：[`docs/product-direction-2026-10-16.md`](../product-direction-2026-10-16.md) 阶段 C、ADR 0063/0110/0155/0221

## 背景

在 Phase C 路线中，产品战略明确强调：
> “现有打开文档、批量打开、文档集恢复和受控写入动作，只有在真实确认、权限、取消和失败回执证据齐备时才继续扩展或放量。”

虽然在 UI 层面用户可以通过面板直观看到文档集恢复进度，但在通过 Agent 或智能动作管线触发批量打开与文档集恢复时，若缺少严格的状态回执与批量硬约束，极易引发两种严重故障：
1. Agent 传入海量文档 ID 一次性打开上百个页签，直接拖垮思源前端 DOM 与内存；
2. 文档集恢复遇到部分条目已被删除或已打开时，缺少确定的状态机回执，导致调用方误以为全部失败或陷入重复重试死循环。

## 决策

1. **批量打开文档 5 篇硬上限与 ID 强归一化 (Batch Open Cap of 5 & Sanitization)**：
   - 动作 `open-documents` 必须在 Input Schema 中声明 `maxItems: 5`，严禁放宽；
   - 输入的文档 ID 列表在进入执行前自动去重并剔除非法字符，仅保留符合 `/^\d{14}-[0-9a-z]+$/i` 的合法根 ID，非法输入直接降级拒绝，不抛出未捕获错误。

2. **文档集恢复 6 态状态机与结构化回执 (Document Set Restore 6-State Machine)**：
   在 `src/agent-document-set-actions.js` 中确立覆盖以下 6 种明确状态的回执标准：
   - `completed`: 待打开条目全部成功由宿主打开；
   - `already_open`: 集合内所有文档均已打开，安全跳过，绝不制造重复页签；
   - `missing_entries`: 包含 404 缺失项时优雅跳过缺失项并如实回执，不阻断其余有效文档；
   - `cancelled`: 接收到 abort 信号或用户主动取消时立即退出；
   - `restore_failed`: 待恢复条目在宿主打开均返回失败；
   - `set_not_found`: 查询不到指定 `setId` 时给出受控错误代码。

3. **强制二次确认原则 (Mandatory Confirmation)**：
   由于恢复文档集涉及批量排版变动与多页签激活，动作元数据必须强制标注 `requiresConfirmation: true`，严禁未经用户批准自动执行。

## 证据与验证

- 定向契约测试：[`tests/document-set-restore-agent-contract.test.cjs`](../../tests/document-set-restore-agent-contract.test.cjs)；
- 负向违规注入：
  - 注入违规 1：模拟批量打开允许超过 5 篇，确认模式硬门禁精确拦截并复绿；
  - 注入违规 2：模拟已打开跳过被错误当成恢复失败，确认状态机回执断言精确拦截并复绿；
- 门禁自查：`npx tsc --noEmit` 0 错误；全量测试套件通过；构建体积守在 578 KiB 仓库门禁之内；`release-readiness` 指标通过。
