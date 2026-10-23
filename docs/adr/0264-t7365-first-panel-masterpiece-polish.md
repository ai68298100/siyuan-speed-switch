# ADR 0264：T-7365 第一面板门面专项深度打磨与 v0.48.7 发版

日期：2026-10-23  
状态：accepted  
任务：T-7365  

## 背景

第一面板（页签切换器与快速跳转）是小驴雷切的核心门面与用户高频交互窗口。依指令要求持续对第一面板进行视觉质感精雕与交互微反馈打磨，并严格执行小版本递增与 GitHub Release 发版交付，确保思源集市（Bazaar）爬虫准时索引。

## 决策

1. **第一面板卡片激活能量双色光芒（Dual-Color Energy Glow Stripe）**：
   - 页签卡片（`.sw__card`）与全库文档搜索结果行（`.sw__doc-item`）激活时，左侧指示条升级为星际深紫至钛金雷刃渐变光效（`linear-gradient(180deg, var(--lv-brand, var(--b3-theme-primary)) 0%, var(--lv-accent-gold, #FACC15) 100%)`）；
   - 附带柔和环境发光光晕（`box-shadow: 0 0 8px color-mix(...)`），与小驴雷切品牌定位深度共鸣；
2. **分组标签计数胶囊化（Group Header Accent Badge）**：
   - 窗口分组与分类分组标签计数（`.sw__group-count`）升级为品牌色圆角胶囊标签与等宽数字（tabular-nums），强化信息层级；
3. **1-9 键盘直达机械键帽微质感（Tactile Mechanical Keycap Badges）**：
   - 卡片与文档结果行的 1-9 直达角标（`[data-sw-digit]::after`）升级为立体 2px 物理机械键帽质感（带 2px 底边厚度与轻量内嵌高光阴影），与次级动作画板机械键帽风格统一；
4. **版本升级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.6` -> `0.48.7`，并在 GitHub 发布 Release `v0.48.7`，确保集市爬虫准时索引。

## 证据与验证

1. **定向测试**：`tests/first-panel-masterpiece-polish-contract.test.cjs` 4/4 通过；
2. **样式三大门禁**：`spacing-token-migration` 3/3、`radius-scale-gate` 6/6、`font-scale-gate` 6/6 全数通过；
3. **全量单测与审计**：9060+ 项测试全绿，四大批量审计全部 PASS。
