# ADR 0270：T-7371 移动端长按防抖容差与动作画板输入法守卫 (v0.48.13)

日期：2026-10-24  
状态：accepted  
任务：T-7371  

## 背景

持续推进交互鲁棒性、手势可用性与键盘输入法防御：
1. **移动端卡片长按微颤误取消**：此前 `bindCardLongPress` 与历史条目长按手势直接在 `touchmove` 事件中无条件清空定时器，导致真机触控时手指天然的 0.5px～2px 微颤频繁打断长按计时，长按呼出操作菜单的成功率低下；
2. **动作画板（Action Palette）回车确认拼音误触发动作**：此前在动作画板搜索框输入中文时，拼音候选阶段按下回车（用于将输入法拼音提交至文本框）直接被画板的全局 `onKeydown` 拦截并判定为 `PALETTE_KEY_ACTIONS.EXECUTE`，导致用户尚未完成中文选择即误执行了列表首项动作；
3. **动作画板聚焦定时器缺少清理保护**：`mountActionPalette` 在初始化时使用 `setTimeout` 执行聚焦，但在组件提早销毁时未清除定时器。

## 决策

1. **移动端 10px Touch Slop 触控微颤容差**：
   - 记录 `touchstart` 时的起始坐标 `startX` 与 `startY`；
   - 在 `touchmove` 中计算绝对位移 `dx = Math.abs(clientX - startX)` 与 `dy = Math.abs(clientY - startY)`；
   - 仅当位移 `dx > 10 || dy > 10` 时判定为真实滑动操作并取消长按计时；微小颤动不再打断手势，大幅提升触控成功率；
2. **动作画板输入法候选状态全链路守卫**：
   - 在纯领域状态机 `dispatchPaletteKey` 中判定 `event.isComposing || event.keyCode === 229` 时立即返回 `PALETTE_KEY_ACTIONS.NOOP`；
   - 在 UI 容器层 `action-palette-ui.js` 的 `onKeydown` 头部严格拦截输入法候选事件并提早返回，彻底杜绝回车确认拼音时意外触发动作执行；
3. **动作画板 `focusTimer` 生命周期销毁保护**：
   - 记录自动聚焦定时器句柄，在 `dispose()` 执行时严格调用 `clearTimeout(focusTimer)`；
4. **版本升级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.12` -> `0.48.13`，并在 GitHub 发布 Release `v0.48.13`，确保集市爬虫准时索引。

## 证据与验证

1. **定向契约测试**：`tests/touch-slop-and-action-palette-ime.test.cjs` 4/4 通过；
2. **全量单测与审计**：9090+ 项测试全绿，四大批量审计全部 PASS。
