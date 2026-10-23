# ADR 0265：T-7366 模式药丸栏键盘循环导航、卡片操作把手丝滑过渡与 v0.48.8 发版

日期：2026-10-23  
状态：accepted  
任务：T-7366  

## 背景

持续优化第一面板（页签切换器门面）：
1. 模式药丸栏（`.sw__mode-chips-bar`）虽常驻顶栏，但此前只能通过鼠标点击切换模式，缺少键盘循环导航；
2. 卡片操作按钮（`.sw__pin`、`.sw__fav-btn`、`.sw__close`）悬浮出现时缺乏平滑过渡动画，视觉略显生硬；
3. 继续履行小版本递增与 GitHub Release 发版交付以确保集市爬虫准时索引。

## 决策

1. **模式药丸栏全键盘操作流与焦点互通（Mode Chips Keyboard Navigation）**：
   - 在 `setupSearchModeChips` 中为模式药丸按钮（`.sw__mode-chip`）绑定 `keydown` 监听器：
     - `ArrowRight` 循环移动焦点到下一个药丸；
     - `ArrowLeft` 循环移动焦点到上一个药丸；
     - `ArrowDown` 快速将焦点还给 `searchInput` 文本框；
   - 在 `searchInput` 上绑定 `ArrowUp` 监听（当光标处于首位 `selectionStart === 0 && selectionEnd === 0` 时），自动回焦至当前激活的模式药丸按钮，形成完整的键盘闭环；
2. **卡片操作把手丝滑微动效（Card Action Buttons Fluid Transition）**：
   - 在 `src/styles/_11-ui-polish.scss` 中增强 `.sw__card .sw__pin`、`.sw__card .sw__fav-btn`、`.sw__card .sw__close`：
     - 加入 `transition: transform $sw-dur-fast $sw-ease, color $sw-dur-fast $sw-ease, background-color $sw-dur-fast $sw-ease;`；
     - `:hover` 时赋予 `transform: scale(1.12)` 弹性微放大，`:active` 时回缩 `scale(0.95)`，与 `.sw__copy-btn` 达成相同的物理微交互质感；
3. **版本晋级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.7` -> `0.48.8`，并在 GitHub 发布 Release `v0.48.8`，确保集市爬虫准时索引。

## 证据与验证

1. **定向测试**：`tests/first-panel-chips-keyboard-and-card-actions.test.cjs` 4/4 通过；
2. **全量单测与审计**：9060+ 项测试全绿，四大批量审计全部 PASS。
