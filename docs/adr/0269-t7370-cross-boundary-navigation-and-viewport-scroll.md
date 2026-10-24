# ADR 0269：T-7370 跨区域键盘连续导航、无 offsetParent 视口滚动与空卡片防御 (v0.48.12)

日期：2026-10-24  
状态：accepted  
任务：T-7370  

## 背景

持续推进切换器键盘操作流与 DOM 视口滚动的深层隐患排查：
1. **嵌套定位下 `scrollIntoView` 坐标跳动**：此前 `scrollIntoView` 采用 `card.offsetTop` 与 `container.scrollTop` 进行比较，但在网格（`.sw__grid`）、分组（`.sw__group`）或分栏布局中，`card.offsetParent` 经常是指向直接网格容器而非可滚动根节点（`scrollElement`），导致计算出来的 `cardTop` 与 `scrollTop` 并非同一坐标系，引发卡片滚入视口时的剧烈跳跃甚至死循环抖动；
2. **卡片区与文档结果区键盘割裂**：此前在卡片网格最末行按 `ArrowDown` 会卡在卡片区，无法顺畅向后移动到全库文档结果；而在全库结果区首行按 `ArrowUp` 也会卡在首行，无法回焦到上方卡片或搜索框；
3. **数字键直达越界空指针隐患**：`activateCardByElement` 在传入未定义卡片或卡片无 `dataset.tabId` 时，原代码直接执行 `getAllTabs().find(item => item.id === tabId)`，存在传入 `undefined` 引发无意识误匹配的隐患。

## 决策

1. **绝对视口差值滚动重构**：
   - `scrollIntoView` 全面转向 `getBoundingClientRect()`：
     - 若 `cardRect.top < containerRect.top`，说明卡片高于可视区上边界，执行 `container.scrollTop -= (containerRect.top - cardRect.top)`；
     - 若 `cardRect.bottom > containerRect.bottom`，说明卡片低于可视区下边界，执行 `container.scrollTop += (cardRect.bottom - containerRect.bottom)`；
   - 彻底摆脱对 `offsetParent` 的脆弱假设，在任何深层嵌套的 `position: relative` 容器中均能逐像素平滑滚动；
2. **跨区域键盘连续焦点穿透流**：
   - 在卡片网格末行按 `ArrowDown` 时，检测下方首个可见文档结果（`.sw__doc-grid .sw__doc-item:not(.fn__none)`），若存在则平滑过渡聚焦并滚入视口；
   - 在文档结果区首项按 `ArrowUp` 越界时，优先回焦到上方最后一个可见页签卡片；若无卡片则顺畅回焦到搜索框（`.sw__search`），形成完全连贯的无缝循环键盘流；
3. **`activateCardByElement` 严格空值拦截**：
   - 在函数头部严格执行 `if (!card) return; const tabId = card.dataset.tabId; if (!tabId) return;` 保护，杜绝越界数字键触发空查询；
4. **版本升级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.11` -> `0.48.12`，并在 GitHub 发布 Release `v0.48.12`，确保集市爬虫准时索引。

## 证据与验证

1. **定向契约测试**：`tests/cross-boundary-navigation-and-scroll.test.cjs` 5/5 通过；
2. **全量单测与审计**：9085+ 项测试全绿，四大批量审计全部 PASS。
