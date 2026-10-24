# ADR 0273：T-7374 组件商店搜索框输入法守卫与性能优化 (v0.48.16)

日期：2026-10-24  
状态：accepted  
任务：T-7374  

## 背景

在第二面板（工作台）的组件商店（`home-store-ui`）进行使用排查时发现：
1. 商店搜索输入框此前仅挂载了直接的 `input` 事件，缺少中文/日文等输入法的合成状态守卫（`compositionstart` / `compositionend`）；
2. 用户在拼音打字时，每个击键（拼音字母）都会同步触发 `applyFilter`，对上百张小组件卡片、分类分组与统计摘要进行高频遍历计算，产生不必要的 CPU 开销与卡顿感；
3. 用户在拼音候选状态下按下 Escape（用于取消输入法候选窗）时，未受保护的 `keydown` 监听器会拦截该按键并清空整个搜索框，导致正在输入的词汇丢失。

## 决策

1. **输入法合成状态监听与中间态阻断**：
   - 监听 `compositionstart` 标记 `isComposing = true`；
   - 监听 `compositionend` 重置 `isComposing = false`，并在拼音最终上屏后补发一次精准的 `applyFilter()`；
   - `input` 事件在 `isComposing === true` 期间直接返回，彻底阻断拼音中间态触发的高频全量计算；
2. **Escape 候选状态防误清空保护**：
   - 在 `keydown` 中增加 `if (isComposing || event.keyCode === 229) return;` 保护，确保候选期间 Escape 只作用于操作系统输入法窗口；
3. **版本升级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.15` -> `0.48.16`，并在 GitHub 发布 Release `v0.48.16`，确保集市爬虫准时索引。

## 证据与验证

1. **定向契约测试**：`tests/home-store-ime-composition-guard.test.cjs` 4/4 通过；
2. **全量单测与审计**：9100+ 项测试全绿，四大批量审计全部 PASS。
