# 片段 AI 多轮体验设计：本地摘要 + 行级 diff + 逐条接受 + 确定性审查器

- 日期：2026-09-26
- 状态：已实现（D1=`dba3438`、D2=`bb66df9`、D3=本批；ADR 0083）
- 依据：R8 调研 `docs/research-cycle-r8-2026-09-26.md` §4.1/§4.2（吸收项 A3）、T-6906 研究结论、ADR 0078（片段工作室边界）、ADR 0079
- 对应任务：T-6862 余项（更完整多轮体验）+ T-6906 余项（接受前确定性审查器）

## 1. 背景与生态依据

当前片段 AI 候选呈现是只读 textarea 全文 + 单按钮"接受"（全有或全无）。R8 调研给出三重生态佐证：

1. **AI 代码审查 2026 年已分化为两类形态**（编辑时内联审查 / 合并时异步审查），共同要件：结构化摘要、逐条 ✔/✗ 接受、上下文边界诚实声明。
2. **Obsidian 生态"引用验证"三段式**：每条 AI 建议必须通过确定性验证 + 人工批准才能落库——与 T-6906"本地短规则 + 接受前确定性审查器"结论互相印证。
3. **Stylus 双代码验证器**（规则可配置）是 CSS 片段管理的既有期待；其头号差评（数据损坏）已由 T-6909 能力声明对冲，验证器是下一个差异化点。

## 2. 现状与硬约束

- 思源 `/api/ai/editor/chat` SSE 返回**单代码块**（`snippet-studio-ai` 已解析），没有结构化的"摘要字段"或逐文件输出——模型侧无法依赖输出形态。
- 片段 ≤64 KiB（`SNIPPET_CODE_MAX`），行级处理规模有界。
- ADR 0078：AI 只生成手动审核结果；不新增宿主端点；不把提示词当安全保证。
- 包体：raw 线 1088 KiB（当前余 ~25 KiB）、zip 硬上限 512 KiB（余 ~23.6 KiB）——**不能 vendor stylelint 完整包**（npm 依赖树数百 KiB 级）。

## 3. 目标形态（三段式）

```
生成（现有 SSE，不变）
  ↓
① 本地改动摘要（确定性生成，非模型撰写）：hunk 数、增/删行数、字节增量、审查发现数
  ↓
② 行级 diff 面板：候选 vs 当前草稿，逐 hunk 展示 context/-/+ 行
  ↓
③ 逐条 ✔/✗（hunk 粒度）+ 确定性审查发现内联标注 → 应用所选 hunk 到草稿
```

- **摘要是本地算出来的**，不依赖模型输出结构——这是对"每轮输出摘要+影响点"的诚实落地：摘要与影响点都来自确定性层。
- explain 模式维持纯文本面板，不进 diff 管线（无代码可 diff）。
- 迭代（iterate）模式：diff 基准 = 当前候选而非草稿时，面板标注"相对上一轮"。

## 4. 确定性审查器（`snippet-lint.js`）

**与 `snippet-ai-policy.js` 的分层**：policy 是生成前的提示词约束（软，可能被忽略）；lint 是接受前的确定性机检（硬信号，人来裁决）——呼应"提示词不当安全门禁"。

**实现决策：不 vendor stylelint 本体**（依赖树不可承受），采纳其**规则语义子集**自实现（MIT 许可允许，但完整引入违反包体自律；自维护 ~10 条高信号规则）。首期规则表（版本化 `LINT_RULES_VERSION`）：

| 类型 | 规则（语义来源） | 检查 |
| --- | --- | --- |
| CSS | no-duplicate-properties（stylelint） | 同一规则块内重复声明 |
| CSS | no-import-external（T-6907 policy 对齐） | `@import url(http…)`/`@import "//"` |
| CSS | prefer-theme-variable（本仓约定） | 高频硬编码色值（#hex/rgb 于 color/background） |
| CSS | no-unscoped-star（自定） | 裸 `* {}` 全局选择器 |
| JS | no-dynamic-exec（T-6907 对齐） | `eval(` / `new Function(` |
| JS | no-network（T-6907 对齐） | `fetch(` / `XMLHttpRequest` / `WebSocket` |
| JS | no-credential-literals（T-6907 对齐） | `api[_-]?key/token/secret` 赋值字面量 |
| JS | no-global-write（T-6907 对齐） | `window.x =` / 覆写宿主对象 |

- 输出：`{findings: [{rule, severity: "warn"|"info", line, message}], rulesVersion}`，纯函数、零网络、行号有界。
- 发现**内联到 diff 面板**对应行，不阻断接受（人裁决），但摘要计数必须显示。
- 审查器只做确定性模式匹配，不做数据流分析；JS 深层风险仍由"禁执行"边界兜底。

## 5. 行级 diff 纯函数（`snippet-diff.js`）

- LCS 行级 diff（O(n·m)，64 KiB 片段最坏 ~2600 行² 在可接受范围；超长片段降级为"整块替换"单 hunk 并标注）。
- 输出：`[{type: "context"|"del"|"ins", text, aLine, bLine}]` + hunk 分组（连续变更 ±3 行上下文聚合一组）。
- 纯函数、无依赖；单测覆盖：等值、纯增、纯删、改行、乱序、空串、超限降级。

## 6. 逐条接受语义

- 候选默认全选 hunk；✔/✗ 切换 hunk 的 `accepted`。
- "应用"= 按行号从后向前拼接：accepted 的 ins 行 + 未被 rejected hunk 覆盖的 context/del 基准行。rejected hunk 的 del 行**保留**（拒绝删除 = 保留原文）。
- 应用后 `revision += 1`、写脏稿、走既有保存/冲突链；候选与面板清理。
- 全部 ✗ = 放弃候选（等价现状的关闭）；接受路径不绕过 `canDiscard` 脏稿守卫。

## 7. 明确不做

- 不做逐字符/语法感知 diff；不做模型自述摘要的解析与信任；不做自动接受任何 hunk；
- 不 vendor stylelint/ESLint；审查器不联网、不上报、不做数据流分析；
- 不改 SSE 请求投影（policy 投影已由 T-6907 完成）；不承诺理解全库片段（能力说明 T-6909 已声明）。

## 8. 分期与验收

| 期 | 内容 | 验收 |
| --- | --- | --- |
| D1 ✅ | `snippet-diff.js` 纯函数 + 候选面板结构化（diff 渲染 + 本地摘要 + 应用全部） | 纯函数单测（≥8 例含超限降级）+ 契约 + 负向验证 + 包体复核 |
| D2 ✅ | `snippet-lint.js` 审查器 + 发现内联 + 逐 hunk ✔/✗ 接受 | 规则单测（正反例各一）+ 接受语义单测（rejected del 保留）+ 契约 + 负向验证 |
| D3 ✅ | 迭代模式"相对上一轮"基准标注（history 轮次编号收敛省略，避免面板噪声） | 契约 + 负向验证；轮间标注的真实多轮观感随 B-005 真机批 |

每期独立提交可回滚；真机 SSE 证据继续按 B-005 后置，不阻塞 D1/D2 本地交付。
