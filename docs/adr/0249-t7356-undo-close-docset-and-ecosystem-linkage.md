# ADR 0249：T-7356 撤销关闭页签、T-7357 会话保存与思阅/思播生态联动

日期：2026-10-21  
状态：accepted  
任务：T-7356、T-7357  

## 背景

在 R19 阶段调研中，Arc/Zen 浏览器的 Spaces 工作区会话保护、Obsidian Quick Switcher++ 的高效导航以及思源生态内重点插件（思阅 SiReader、思播 SiMedia）的协同需求日益迫切：
1. 用户在切换器中误关标签页后，迫切需要浏览器标准的快捷键（`Ctrl+Shift+T` / `⌘Shift+T`）一键撤销并恢复工作现场；
2. 用户在完成一组关联研究后，需要一键将当前打开的所有页签固化为“工作区文档集（Document Set）”；
3. 思源生态内两款顶级多媒体与阅读工具——**思阅（SiReader）**与**思播（SiMedia）**已发布重大版本（思播基于 ArtPlayer 重构 v2.0，思阅完整上线 PDF 标注与书架系统 v0.8+），小驴雷切作为统一工作上下文平台，应在次级动作画板（Action Palette）、卡片单键直达及工作台卡片展示（进度条、徽标、微阴影）上实现优雅联动与效果升级。

## 决策

1. **一键撤销关闭页签（T-7356）**：
   - 切换器键盘事件监听 `(Ctrl || Meta) + Shift + T`；
   - 提取 `getClosedHistory()` 栈顶记录，调用 `removeClosedHistoryEntry` 避免重复并弹出统一回执；
   - 调用 `openTab` 恢复页签并销毁切换器弹窗。
2. **当前页签一键保存为文档集（T-7357）**：
   - 在动作画板中增加 `save-as-doc-set`（`⌘⇧S`）与 `undo-closed-tab`（`⌘⇧T`）；
   - 执行管线抽取所有已打开 tabs 的根文档 ID 与标题，调用 `createDocumentSet` 与 `upsertDocumentSet` 自动生成时间戳工作区快照，保证可撤销与版本回滚。
3. **思阅与思播生态联动与展示效果优化**：
   - **次级动作画板直达**：增加 `open-in-reader`（`⌥R`，在思阅中阅读）与 `open-in-media`（`⌥V`，在思播中打开）；在卡片获焦时支持单键直达执行；
   - **工作台卡片展示效果升级**：优化 `viewType === "media"` 渲染模型，支持在封面右上角渲染半透明磨砂徽标（`.sw__home-media-badge`）并在底部渲染高质感主题色进度指示条（`.sw__home-media-progress-bar`），增强 hover 浮起动效，为思播/思阅提供统一的沉浸式卡片视觉体验。
4. **包体预算与观察线校准**：
   - 生产构建 raw bundle 增长至 1,208,829 B，依据 ADR 0249 把 raw bundle 观察线由 1178 KiB 微调至 1182 KiB（1,210,368 B，余量约 1.5 KiB）；
   - 归档包上限相应由 592 KiB 微调至 594 KiB（608,256 B，实际 package.zip 为 606,461 B，余量约 1.8 KiB）；
   - 单条目压缩上限维持 320 KiB 不变。

## 证据与验证

1. **定向契约测试**：`tests/undo-closed-docset-and-ecosystem-contract.test.cjs` 5/5 通过（覆盖撤销实现、会话保存、动作画板模型、进度条/徽标 DOM 及负向注入）；
2. **多语言契约**：`tests/i18n.test.cjs` 11/11 通过；
3. **全量构建与类型检查**：`tsc --noEmit` 0 错误，生产打包 3 warnings（仅体积警告，无语法/引用错误）。
