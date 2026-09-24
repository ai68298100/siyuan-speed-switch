# R6 调研-吸收循环报告（2026-09-25）

> 聚焦五领域：①浏览器标签搜索 UI ②IDE Switcher/Recent Files ③Spotlight/Raycast 搜索结果 UI ④Obsidian 导航插件 ⑤悬浮球手势最佳实践。

## Top 发现（按吸收价值排序）

| # | 来源 | 机制 | 雷切启示 | 优先 |
|---|---|---|---|---|
| 1 | Spotlight/Raycast | 结果顶部类型筛选 chips + 右侧常驻预览窗格 + <50ms 响应 | 已有 chips（T-6809）+ Alt 预览（T-6816），可补"常驻预览窗格"把 Alt 预览从隐藏变常驻 | P1候选 |
| 2 | JetBrains Switcher | pinned 页签独立行 + Switcher 内直接关闭 | 页签卡可加内嵌关闭按钮（搜索结果行内直接关，不必先切过去） | P1候选 |
| 3 | Another Quick Switcher | front matter 键值纳入搜索/过滤 + 钉住搜索 | 与保存的搜索互补——元数据层搜索 | 候补 |
| 4 | Chrome Tab Search | Ctrl+Shift+A 下拉，搜索框+单列+方向键/回车+MRU | 已实现同构功能 | ✅已覆盖 |
| 5 | Arc Command Bar | `/` 前缀分流命令模式 | 已实现 `>` 前缀 | ✅已覆盖 |
| 6 | VS Code Ctrl+Tab | 按住保持面板，方向键移动实时预览，松开落位 | 可实现轻量选中预览 | 候补 |
| 7 | Material FAB | 空闲降透明+唤醒回弹 | 已实现（B4） | ✅已覆盖 |
| 8 | UX 悬浮球手势 | tap 执行 / 长按拖拽分层 + 空闲防误触 | 已实现三层防误触 | ✅已覆盖 |
| 9 | Obsidian Tab Switcher | 按当前页签顺序前后循环切换 | 可补轻命令 | 候补 |
| 10 | JetBrains Ctrl+E | 含已关闭文件与最近编辑 | 已实现统一历史入口 | ✅已覆盖 |

## 结论

R6 确认：**核心功能面已覆盖对标产品的主干交互**。剩余增量均为细节打磨：
1. 搜索结果行内嵌关闭按钮（Chrome Tab Search 模式）
2. 常驻预览窗格（Spotlight/Raycast 模式，把 Alt 预览从"按住才看"变为"选中即显"）
3. 前端元数据搜索（front matter 键值，与智能分组互补）

三者均为 P1/P2 级候补，建议合并为一个"搜索结果增强"批次在 v0.35.0 交付。
