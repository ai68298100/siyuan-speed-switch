# ADR 0274：T-7375 第二面板小组件商店全新重构与生态专区落地 (v0.48.17)

日期：2026-10-24  
状态：accepted  
任务：T-7375  

## 背景

在第二面板（工作台）演进至午夜深空黑金、双拼 Bento 瓦片与小驴全生态（Epoch 6 联邦规范）联动的最新架构背景下，此前的组件商店（`home-store-ui`）存在以下严重脱节：
1. **统一品牌标题栏缺失**：切换器、工作台、片段实验室与设置窗口均已装配 22×22 星际深紫底白标的 `mountPlatformDialogTitleWrap`，唯独组件商店缺少品牌标题栏；
2. **小驴生态与联动组件无法专区发现**：打卡、考试、闪卡、管家、人脉、常用、拾遗、思阅、思播等 9 大核心生态组件此前混杂在普通分类或依赖项中，用户难以直观发现生态联动；
3. **实时预览未渗透黑金美学**：商店右侧现场预览区对时钟（`external-local-time`、`external-world-clock`）与深色材质组件仅以普通灰色背景呈现，无法体现工作台黑金卡片（`.sw-home__cell--midnight`）真实质感；
4. **精选推荐（Featured）列表滞后**：未包含本周打卡胶囊轴、闪卡复习队列、思阅在读书架与思播正在播放。

## 决策

1. **装配统一品牌弹窗标题栏**：
   - 在 `openHomeWidgetStore` 中调用 `mountPlatformDialogTitleWrap(storeDialog.element, this.i18n.homeStoreTitle || "组件商店", "v0.48.17", "iconPlugin")`，补齐最后一块品牌标题栏拼图；
2. **全新「小驴生态」专属分类 Tab**：
   - 在商店分类栏（`tabs`）中正式注册 `{key: "ecosystem", label: "小驴生态", category: "ecosystem"}`；
   - 自动识别所有 `checkin-*`、`exam-*`、`cards-*`、`glean-*`、`home-expiry-*`、`contacts-*`、`common-*`、`sireader-*`、`simedia-*` 等组件，支持一键切换发现生态组件；
3. **午夜黑金 Hero Tile 沉浸式实时预览**：
   - 在 `buildInlinePreview` 中为时钟与深色模块挂载 `.sw-home__cell--midnight`，100% 还原工作台真实美学；
4. **黄金精选推荐列表同步**：
   - 将 `checkin-weekly`、`cards-due-summary`、`sireader-recent` 等最新高能组件纳入 `HOME_FEATURED_MODULE_IDS`，商店卡片点亮金色推荐徽章；
5. **版本升级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.16` -> `0.48.17`，并在 GitHub 发布 Release `v0.48.17`，确保集市爬虫准时索引。

## 证据与验证

1. **定向契约测试**：`tests/home-store-redesign-and-ecosystem.test.cjs` 5/5 通过；
2. **商店模型测试**：`tests/home-store-model.test.cjs` 427/427 通过；
3. **全量单测与审计**：9105+ 项测试全绿，四大批量审计全部 PASS。
