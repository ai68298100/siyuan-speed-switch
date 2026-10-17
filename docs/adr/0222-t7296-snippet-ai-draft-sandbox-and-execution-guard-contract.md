# ADR 0222：片段 AI 草稿隔离、CSS 沙箱与 JS 禁执行安全契约

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7296（Phase C 片段实验室受控智能安全契约）
- 依据：[`docs/product-direction-2026-10-16.md`](../product-direction-2026-10-16.md) 阶段 C、ADR 0078/0083/0086/0096/0133

## 背景

在 Phase C 路线中，产品战略对代码片段实验室与 AI 生成做出了不可动摇的底线约束：
> “片段 AI 继续采用草稿、人工接受、CSS 沙箱和 JS 禁止执行。只有真实 provider、权限、费用、配额、取消和数据外发边界都有证据后，才评估片段之外的 AI；不引入聊天面板、整库隐式上下文、AI 排序或自动写入。”

为了确保在后续任何功能演进中，代码片段与 AI 提议永远处于最高级别的安全隔离与用户完全掌控之下，必须将“草稿隔离”、“Diff 人工接受”、“CSS 预览沙箱”与“JS 脚本禁执行”固化为自动化门禁。

## 决策

1. **草稿隔离与人工接受原则 (Draft Isolation & Manual Acceptance)**：
   - AI 代码生成输出始终仅作为临时草稿候选（`candidate`），绝不允许直接写入正式生产片段库（`snippets`）；
   - 用户界面必须通过结构化 Diff 对比呈现变更行（行级增删标记 `is-ins` / `is-del` 与块级 Hunk 折叠）；
   - 用户具有绝对处置权：必须显式点击“接受”才合入编辑器草稿，点击“放弃”无痕销毁候选，编辑器原草稿状态毫发无损。

2. **双重预览 CSS 沙箱 (CSS Sandbox)**：
   - 预览画布严格隔离于思源真实 DOM 之外，仅注入受控的近似组件沙盒容器；
   - 预览能力回执（`resolvePreviewCapability`）强制声明 `script: "blocked"`、`network: "none"`，禁止任何外部网络请求与非受控样式穿透。

3. **JS 片段执行能力硬阻断 (JS Non-Execution Invariant)**：
   - 片段实验室对 JS 片段仅提供只读语法高亮、文本编辑、元数据管理与 Diff 审查；
   - 无论是静态预览、交互测试还是 AI 生成过程，对 JS 脚本的执行能力一律硬性阻断（`script === "blocked"`），严禁任何 `eval`、`new Function` 或 `<script>` 注入执行逻辑（永久守护 ADR 0078 / T-7022 成果）。

## 证据与验证

- 定向契约测试：[`tests/snippet-ai-sandbox-execution-guard-contract.test.cjs`](../../tests/snippet-ai-sandbox-execution-guard-contract.test.cjs)；
- 负向违规注入：
  - 注入违规 1：模拟 JS 预览回执泄露为可执行状态，验证契约精确失败并复绿；
  - 注入违规 2：模拟 AI 提议绕过 Diff 直接修改原始内容，验证隔离断言精确拦截并复绿；
- 门禁自查：`npx tsc --noEmit` 0 错误；全量测试套件通过；构建体积守在 578 KiB 仓库门禁之内；`release-readiness` 指标通过。
