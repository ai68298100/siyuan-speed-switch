# ADR 0268：T-7369 第二轮代码潜在 Bug 排查与交互边界防御 (v0.48.11)

日期：2026-10-24  
状态：accepted  
任务：T-7369  

## 背景

持续推进全插件代码潜在 Bug、DOM 竞态与交互边界隐患的深度排查与修复：
1. **输入法候选状态 Escape 误清空**：用户在拼音输入法处于候选中（`composing = true`）按下 Escape 时，预期仅关闭候选弹窗，但此前键盘监听直接拦截并清空了输入框，导致输入内容意外丢失；
2. **空态近期搜索 Chip 上下文绑定漂移**：`buildEmptyState` 创建时元素尚未挂载到 DOM，导致静态捕获的 `empty.closest(".sw-platform-surface")` 恒为 null，后续点击近期搜索 chip 时无法正确获取当前弹窗的搜索框；
3. **冒号大纲穿透误判 Windows 驱动器盘符**：当用户在搜索框粘贴或输入包含盘符的路径（如 `C:\Users`、`d:/notes`）时，此前的 `findOutlineColonIndex` 未过滤盘符冒号，导致误切为大纲穿透模式；
4. **块检索 SQL 纯空白笔记本 ID 容错**：当传入纯空白字符串 `notebookId: "   "` 时，由于未进行 `.trim()` 处理导致生成 `AND box = ''` 使得查询永远返回零条目。

## 决策

1. **IME 候选阶段 Escape 保护**：
   - 在 `bindSearchInputComposition` 的 `keydown` 监听中增加 `if (composing) return;` 保护，确保候选阶段 Escape 仅作用于系统输入法；
2. **近期搜索 Chip 动态上下文解析**：
   - 在 `qChip` 与 `focus-search` 点击事件回调中改为动态求值：`targetSurface = empty.closest(".sw-platform-surface") || empty.closest(".sw-platform-dialog") || ...`，确保点击时刻精准定位所属宿主；
3. **排除 Windows 驱动器盘符冒号**：
   - 在 `findOutlineColonIndex` 中增加盘符模式检测：当冒号前紧随单个字母且前面为字符串首或路径分隔符、后面紧跟 `/` 或 `\` 时判定为盘符路径予以跳过；
4. **块搜索 SQL notebookId 安全 trim 防空**：
   - 在 `buildBlockSearchSql` 中对 `options.notebookId` 执行 `.trim()` 防御，纯空白字符串自动不附加 `AND box = ...` 条件；
5. **版本升级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.10` -> `0.48.11`，并在 GitHub 发布 Release `v0.48.11`，确保集市爬虫准时索引。

## 证据与验证

1. **定向契约测试**：`tests/bug-audit-round2-contract.test.cjs` 5/5 通过；
2. **第一轮契约测试**：`tests/bug-audit-and-robustness-contract.test.cjs` 5/5 通过；
3. **全量单测与审计**：9080+ 项测试全绿，四大批量审计全部 PASS。
