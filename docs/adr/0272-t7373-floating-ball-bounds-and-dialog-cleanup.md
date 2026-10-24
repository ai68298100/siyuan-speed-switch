# ADR 0272：T-7373 悬浮球极端视口边界防倒置与生命周期清理加固 (v0.48.15)

日期：2026-10-24  
状态：accepted  
任务：T-7373  

## 背景

持续优化全插件极端环境容错与生命周期稳健性：
1. **移动端横屏/软键盘下悬浮球边界倒置**：此前 `FloatingBallUi.getBounds` 在移动端（`surface === "mobile"`）计算可视区域时，直接执行 `visible.bottom -= inset("--sw-fab-safe-bottom") + 48` 与 `visible.right -= inset("--sw-fab-safe-right")`；在横屏、全屏手势导航条或输入法弹出的极端小视口下，可能导致 `visible.bottom < visible.top` 或 `visible.right < visible.left`，引发悬浮球坐标计算溢出与拖拽抖动；
2. **生命周期回收路径冗余清理**：`onunload` 中此前对 `mobileSwitcherDialog` 存在重复的销毁调用语句，需梳理并固化单次明确的销毁链路。

## 决策

1. **移动端悬浮球物理尺寸正向区域保底**：
   - 调整扣减公式为：
     `visible.bottom = Math.max(visible.top + this.ballSize, visible.bottom - inset("--sw-fab-safe-bottom") - 48);`
     `visible.right = Math.max(visible.left + this.ballSize, visible.right - inset("--sw-fab-safe-right"));`
   - 确保无论安全区多大，活动视口物理宽度和高度永远不会低于一个球体的尺寸，从根源上杜绝视口倒置与坐标抖动；
2. **`onunload` 生命周期回收链路梳理**：
   - 清理重复的 `mobileSwitcherDialog` 销毁调用，保证各个 Dialog 与各全局监听器的单次析构契约清晰明确；
3. **版本升级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.14` -> `0.48.15`，并在 GitHub 发布 Release `v0.48.15`，确保集市爬虫准时索引。

## 证据与验证

1. **定向契约测试**：`tests/floating-ball-bounds-and-history-cleanup.test.cjs` 3/3 通过；
2. **悬浮球几何测试**：`tests/floating-ball-geometry.test.cjs` 通过；
3. **全量单测与审计**：9095+ 项测试全绿，四大批量审计全部 PASS。
