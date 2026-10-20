# ADR 0245：T-7352 穿透检索命中片段富文本高亮与 XSS 防护

日期：2026-10-20  
状态：accepted  
任务：T-7352  

## 背景

在引入穿透检索语法（`@大纲`、`#标签`、`!书签`、`^正文块`）之后，原有分段高亮器 `buildKeywordHighlightSegments` 存在一个真实缺陷：它直接把带前缀符号的完整 query（如 `@架构`、`^优化`）传给子串搜索器，而目标文档标题、大纲条目和正文块内部并不包含前缀符号，导致所有穿透检索结果的高亮完全丢失，视觉可读性严重下降。

同时，搜索结果可能包含用户自定义笔记内容中的未受信任 HTML/Markdown 标记，若直接拼接 HTML 高亮容易引入跨站脚本（XSS）漏洞。

## 决策

1. **实现纯净搜索词提取 `extractHighlightSearchNeedle(query)`**：
   - 消费 `parsePenetrationQuery`，自动识别穿透模式；
   - 针对 `@`、`#`、`!`、`^`、`>`、`:` 前缀精准提取 `headingNeedle`、`blockNeedle`、`tagNeedle`、`bookmarkNeedle` 或 `cleanKernelQuery`；
   - 确保分段器仅对真正有意义的关键字进行大小写不敏感匹配；
2. **严格 XSS 实体转义与安全分段装配**：
   - 实现 `escapeHtmlEntities(str)` 严格转义 `&`、`<`、`>`、`"`、`'` 五大危险字符；
   - 暴露 `highlightSearchMatchesHtml(text, query)`，对命中词注入 `<mark class="sw__search-mark">`；
   - `src/doc-search-ui.ts` 渲染结果时坚持分段 `document.createElement("mark")` 与 `document.createTextNode` 原生组装（零危险 innerHTML 注入）；
3. **全平台统一高亮样式规范（`_11-ui-polish.scss`）**：
   - 为 `mark.sw__search-mark`、`.sw__doc-title mark`、`.sw__doc-snippet mark` 声明半透明主色底衬（`color-mix(in srgb, var(--b3-theme-primary) 22%, transparent)`）与圆角；
   - 声明 `forced-colors: active` 下的高对比度 `Highlight` / `HighlightText` 系统色映射；
   - 声明 `prefers-contrast: more` 下的加粗与下划线无障碍增强。

## 证据与验证

1. **定向测试**：`tests/highlight-and-direct-shortcut-contract.test.cjs` 包含对前缀剥离、分段匹配、HTML 安全转义与样式的全量断言并通过；
2. **负向注入验证**：故意破坏前缀剥离断言，测试精确红后还原；
3. **全量通过**：`pnpm exec tsc --noEmit` 0 错误。
