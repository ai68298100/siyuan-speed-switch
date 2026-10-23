# ADR 0261：T-7362 全表面 Dialog 统一品牌标题栏、工作台深空黑金星芒卡片与 v0.48.4 发版

日期：2026-10-23  
状态：accepted  
任务：T-7362  

## 背景

依据快门中枢统领指令（`ECOSYSTEM-INTEGRATION-DIRECTIVE.md`）要求持续深化多表面质感，并在每次迭代中严格执行小版本递增与 GitHub Release 发版交付，以确保思源集市（Bazaar）爬虫能及时抓取与索引新版本。

## 决策

1. **全表面 Dialog 统一品牌标题栏规范（Unified Dialog Titlebar）**：
   - 在 `src/platform-dom.js` 中新增并导出 `mountPlatformDialogTitleWrap(dialogElement, titleText, badgeText, iconName, doc)`；
   - 切换器（`createSwitcherDialog`）、工作台（`openSecondPanel`）、代码片段实验室（`openSnippetStudio`）与设置弹窗（`openSetting`）全量装配 22×22 星际深紫底白标 + 标题文字 + 紧凑版本胶囊 + Esc 退出按键提示（`.lv-dialog-title-wrap`），彻底统一各表面弹窗视觉层级与品牌辨识度；
   - 内置严格的重复调用幂等性守卫，避免宿主重构时 DOM 重复追加。
2. **工作台深空黑金星芒卡片美学落地（Midnight Black Gold Hero Tiles）**：
   - 在 `src/second-panel-ui.ts` / `src/second-panel-ui.js` 中，当小组件为 `external-local-time`、`external-world-clock`、`external-quote-daily` 或材质为 `dark` 时，自动挂载 `.sw-home__cell--midnight`；
   - 在 `src/styles/_11-ui-polish.scss` 中增强 `.sw-home__cell--midnight` 与 `.sw-home .sw-home__cell.mat-dark`，使其具备星芒反光与深邃质感，忠实呈现参考图顶部的“午夜深黑金卡片”高能质感；
   - 标题、数值与状态徽章自动继承高对比度钛金黄与高亮反光。
3. **版本升级与集市爬虫对齐**：
   - 严格执行小版本递增：`0.48.3` -> `0.48.4`，发布 GitHub Release `v0.48.4`，确保集市生态爬虫及时抓取更新。

## 证据与验证

1. **定向测试**：`tests/dialog-title-wrap-and-midnight-tile-contract.test.cjs` 4/4 通过；
2. **全量单测与审计**：9058+ 项测试全绿，四大批量审计全部 PASS。
