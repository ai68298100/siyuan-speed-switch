# 片段实验室 CSS/JS 专项 skill 研究

日期：2026-09-26

## 结论

存在适合借鉴的 CSS 专项 skill，但没有发现一个由 OpenAI 官方提供、可以直接作为思源编辑器 AI 运行时插件加载的 CSS/JS 片段 skill。

Codex skill 的形态是包含 `SKILL.md` 的指令目录，由 Codex 在任务匹配时读取；片段实验室当前调用的是思源 `/api/ai/editor/chat` SSE。当前请求投影只有 `taskID`、`ids`、`history`、`input` 和 `action`，没有 `system`、tool session 或 skill loader 字段。因此，安装一个 Codex skill 不会自动改变片段实验室 AI 的行为。

## 候选评估

| 候选 | 适配度 | 证据与限制 | 结论 |
|---|---|---|---|
| [PyModel/css-pro-tips](https://github.com/PyModel/css-pro-tips) | 高（CSS） | MIT；专门覆盖 token、cascade、静态 CSS、可访问状态、性能、渐进增强和 Baseline 兼容性；仓库 README 标注版本 1.3.0。内容面向代码代理的审查/实现流程，体积和措辞不适合原样放进每次 SSE prompt。 | 借鉴规则，保留 MIT 归属；不直接作为运行时依赖。 |
| [high-performance-web-codex](https://github.com/MiniaPale/high-performance-web-codex) | 中（JS/前端） | 覆盖 JavaScript/TypeScript、网络、渲染和性能预算，但 GitHub API 未返回许可证元数据，且不是片段语义 skill。 | 不随插件分发；只可作为研究参考。 |
| [frontend-design](https://github.com/Ilm-Alan/frontend-design) | 中低（视觉） | MIT；强调视觉方向、排版、色彩和 anti-slop，适合界面重构，不负责 CSS 片段正确性或 JS 副作用。 | 不作为片段 AI 的核心规则。 |
| [you-dont-need-javascript-for-that](https://github.com/IFAKA/you-dont-need-javascript-for-that) | 低（JS 边界） | MIT；强调优先使用 Web 平台能力，方向有价值，但范围窄，不能覆盖 SiYuan 片段生命周期。 | 可吸收“能用 CSS/平台能力就不写 JS”的一条原则。 |
| [motion-ref](https://github.com/joepUI/motion-ref-skill) | 低（动效） | 只解决动效选择和 `prefers-reduced-motion`，不覆盖片段生成、审查或安全边界。 | 不纳入片段 AI。 |

## 适合内置的方式

不要把完整 `SKILL.md` 拼进每次请求。建议建立一个本地、版本化的片段规则层，作为 `snippetAIAction` 的固定前缀，并继续由产品代码执行硬约束：

1. CSS 规则：优先使用现有 SiYuan/平台变量；默认要求作用域明确、避免无意全局选择器和外部 `@import`；保留键盘焦点、对比度、reduced-motion 和窄屏回退；生成结果只能是一个可审阅草稿。
2. JS 规则：默认不执行、不自动启用；禁止把凭据、文档 ID 或网络请求带入草稿；明确提示 `eval`、`Function`、动态脚本注入、无限循环和全局事件监听等风险；解释模式必须输出纯文本。
3. 接受前验证：提示词只能改善倾向，不能替代门禁。解析结果后增加确定性的字节、代码块、危险 API 和外部资源检查；高风险结果保持草稿并要求用户手动审阅，不直接保存或启用。
4. 规则版本：把规则版本写入 `input` 的内部元数据或测试夹具，便于回溯生成行为；不要向宿主声明不存在的 skill/tool 能力。

## 推荐实现分期

第一期只做本地规则投影：新增 `src/snippet-ai-policy.js`，按 `css/js` 导出短规则和版本号；`buildSnippetAIRequest` 将规则合并到现有 `action`，不改宿主端点，不新增网络依赖。

第二期增加纯本地草稿审查器，返回 `ok/warnings/blockedReasons`，在“接受 AI 草稿”前展示风险回执。它应先覆盖外部资源、动态执行、全局副作用和超限，不声称完整 JavaScript 静态分析。

第三期再评估是否新增“审查”模式。真实 SSE、宿主执行和启用结果仍需 B-005 桌面验证；没有验证证据时，不能把外部 skill 的规则当作安全保证。

## 来源

- [OpenAI Developers：Build skills](https://developers.openai.com/codex/skills)（skill 是 Codex 读取的 `SKILL.md` 指令包；当前页面 canonical 到 [ChatGPT Learn](https://learn.chatgpt.com/docs/build-skills)）
- [CSS Pro-Tips README](https://github.com/PyModel/css-pro-tips/blob/main/README.md)
- [CSS Pro-Tips SKILL.md](https://github.com/PyModel/css-pro-tips/blob/main/SKILL.md)
- [High Performance Web Codex SKILL.md](https://github.com/MiniaPale/high-performance-web-codex/blob/main/SKILL.md)
- [Frontend Design SKILL.md](https://github.com/Ilm-Alan/frontend-design/blob/main/SKILL.md)
