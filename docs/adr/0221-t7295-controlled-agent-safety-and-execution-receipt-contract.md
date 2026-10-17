# ADR 0221：Phase C 受控智能与 Agent 动作安全回执契约

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7295（Phase C 受控智能与可信交付准入）
- 依据：[`docs/product-direction-2026-10-16.md`](../product-direction-2026-10-16.md) 阶段 C、ADR 0008/0063/0133/0155

## 背景

在 Phase C 路线中，产品战略对 AI 与智能体能力（Agent Capabilities）提出了极高严苛的安全与透明度要求：
> “对新增或扩展的 Agent 能力，优先保持只读上下文、搜索、组件快照和诊断；现有打开文档、批量打开、文档集恢复和受控写入动作，只有在真实确认、权限、取消和失败回执证据齐备时才继续扩展或放量。片段 AI 继续采用草稿、人工接受、CSS 沙箱和 JS 禁止执行。只有真实 provider、权限、费用、配额、取消和数据外发边界都有证据后，才评估片段之外的 AI；不引入聊天面板、整库隐式上下文、AI 排序或自动写入。”

为了避免未来演进中由于疏忽引入非受控的静默整库读取或未经确认的块覆盖风险，必须将只读能力与写动作在架构层面建立不可跨越的隔离边界，并对所有写入与执行动作实行强制性“显式意图 + 二次确认（confirmation）+ 单次执行（one-shot）+ 结构化回执（receipt）”闭环。

## 决策

1. **能力用途严格二分隔离 (Read-Only vs Action Partitioning)**：
   - **只读能力 (Read-Only Capabilities)**：如 `search-tabs`、`workspace-context`、`widget-snapshot`、`workspace-diagnostics`，声明严格的 `effects: ["localRead"]`，输出经过模式截断与长度限制，禁止附加任何写副作用；
   - **受控写动作 (Controlled Write Actions)**：如 `update-task`（打勾切换）、`append-to-journal`（追加日记）、`restore-document-set`（恢复文档集），必须显式声明 `effects: ["localWrite"]`，并在执行前触发思源宿主或插件原生二次确认。

2. **强制二次确认与单次防重放机制 (Mandatory Confirmation & Nonce)**：
   所有写操作必须声明 `confirmation: true`，拒绝未经用户许可的后台自动执行；工作区规划动作强制绑定会话唯一 Nonce 与有效期（5 分钟），执行后立即失效，杜绝重复调用导致重复追加内容。

3. **异常代码分类与零泄漏诊断 (Structured Receipts & Zero Leakage)**：
   动作执行结果必须返回标准化结果对象 `{ok: boolean, status?: string, reason?: string, receipt?: object}`：
   - 明确归一化状态代码：`success`、`cancelled`（用户主动取消或 Abort）、`timeout`（超时中断）、`permission_denied`（权限不足或拒绝）、`invalid_input`（参数校验失败）、`failed`（底层错误）；
   - 回执中严禁泄露未脱敏的笔记私密路径、用户 Token 或内部堆栈。

## 证据与验证

- 定向契约测试：[`tests/controlled-agent-safety-contract.test.cjs`](../../tests/controlled-agent-safety-contract.test.cjs)；
- 门禁负向验证：内置违规注入探针（只读能力误掺杂写副作用被拦截、写操作缺失确认声明被拦截），确保契约非恒真；
- 门禁自查：`npx tsc --noEmit` 0 错误；全量测试套件通过；构建体积守在 578 KiB 仓库门禁之内；`release-readiness` 指标通过。
