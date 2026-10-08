# R15 全面功能、界面、交互与流程复核（2026-09-30）

> 本轮只读复核生产源码、当期账本、ADR、迁移兼容记录和 R13/R14 证据。用户尚未说“开始开发”，因此只登记待办，不修改生产代码、测试或发布包。

## 复核范围与去重

- 功能路径：三面板打开、返回、关闭、懒加载、搜索预览、路径筛选、组件商店重试、工作台布局持久化和存储迁移。
- UI 与交互：桌面排序/分组浮层、折叠组、页签卡片、三面板 Dialog 名称与 landmark、第一面板高对比模式。
- 数据与异步：七档尺寸归一化、缓存键、迁移动点、请求取消、旧现场恢复。
- R13/R14 已登记的预览取消、缩略图取消、设置控件名称、移动排序 sheet、回收站和图标选择器不重复立项。
- 代码扫描和 Node 只读探针用于定位可复现行为；没有把真实 SiYuan、Android 或屏幕阅读器结果写成已验证故障。

## 新增待办

| 任务 | 优先级 | 待办 | 证据与验收边界 |
|---|---|---|---|
| T-7186 | P1 | **工作台布局尺寸 schema 与迁移七档闭环**：让 `normalizeLayout`、旧宽高迁移、移动端布局、英雄位约束、商店添加和保存回读统一支持 `xs/small/medium/wide/large/tall/full`；非法值仍安全回退；覆盖七档 roundtrip、旧数据迁移和负向验证 | `src/home-model.js:440-447` 只保留 `small/medium/wide/large`；生产 `HOME_WIDGET_SIZES` 和组件声明含七档。只读 Node 探针确认 `xs/tall/full` 会被清空；与 T-7151/T-7157 的视觉/规范对账分工，本项是数据合同 |
| T-7187 | P1 | **回收站与关联 SWR 迁移的深比较和启动写回**：清洗后按字段/排序/过期状态判断 changed，迁移报告不得把同数量但内容已变的数据报为 kept；启动归一结果要有明确写回策略、幂等证据和跨设备回读边界 | `src/storage-migration.js:199-224` 只比较 entries 数量与 version；只读探针确认字段清洗后仍返回 `kept`。不替代 `sw_settings/sw_home_state` 的 inspect 前置，需保留写回失败回执 |
| T-7188 | P2 | **存储兼容矩阵与代码登记数单一事实源对账**：修正文档中 handled/inspect/meta 分类和总数的矛盾，改为从 `KEY_ORDER`/常量生成或门禁校验；同步迁移表、快照上限、Agent 摘要和新增 key 的说明 | `docs/storage-compatibility-matrix.md:44` 仍写 `13+2+1=16`，当前代码已是 17 个 key 且表格列出 `sw_snippet_recycle`；该项只做文档/门禁规划，不把文字修订当迁移完成 |
| T-7189 | P1 | **片段实验室懒加载的可退出加载态、超时、重试和上下文保留**：动态 chunk 未完成时显示可理解状态并允许关闭；失败后支持重试或回到来源；回退必须保留 query、objectId、focusSource 和 returnTo，避免空 Dialog 或现场丢失 | `src/index.ts:3754-3803` 使用 `disableClose=true`，import 期间没有工作室 chrome；`3851-3862` 失败只回切换器且未透传 context/query/focus；与 T-7163 的正常往返恢复分工，专门覆盖 lazy-load error path |
| T-7190 | P1 | **第一面板预览错误恢复与部分成功回执**：区分 outline/getDoc 全失败、单路失败和旧缓存可读；预览窗格提供局部重试、保留已成功内容和失败原因，重试不得覆盖新目标或固定现场 | `src/doc-search-ui.ts:1511-1535` 两路请求并行，单路失败仍可能显示部分 snapshot，但预览 pane 没有显式 retry；T-7165 管取消，T-7114 管内容深度，本项管恢复路径 |
| T-7191 | P2 | **路径筛选请求的底层取消与队列回收**：快速切换路径、关闭面板或换查询时 abort 旧 `listDocsByPath`，保留代际检查作为最后防线；记录在途上限和取消失败回执，兼容无 AbortController 的 WebView | `src/doc-search-ui.ts:51-69/123-139` 只有 generation 丢弃，旧内核请求仍会完成；与 T-7165 文档预览、T-7172 缩略图回源是不同端点和状态链 |
| T-7192 | P1 | **桌面排序/分组浮层键盘与 ARIA 合同**：触发器补 `aria-haspopup/expanded/controls`，打开后把焦点送入 portal；`menuitemradio` 支持方向键、Home/End、单 Tab 停靠、Esc/外点关闭并回焦，排序与分组语义一致 | `src/index.ts:4266-4372` 目前只有 click 和 `aria-checked`，无焦点进入/方向键/回焦；移动排序已在 T-7176，不能用该任务替代桌面路径 |
| T-7193 | P1 | **分组折叠的读屏、隐藏和焦点迁移**：组头与 grid 建立 `aria-controls`/稳定 id；折叠状态同步 `hidden/inert` 或等价不可达语义；焦点在折叠时回到组头，键盘可展开、移动和定位 | `src/index.ts:10414-10456`、`src/mobile-switcher-ui.ts:482-506` 只切 class/`aria-expanded`，网格无关联控制且 CSS 仅 `display:none`；与 T-7175/T-7176 的分段/排序控件分工 |
| T-7194 | P1 | **页签卡片嵌套控件结构重构**：将卡片主打开动作与置顶、收藏、关闭等动作拆成合法的 listitem/主按钮/动作组结构，明确 Enter/Space、点击冒泡、长按拖拽和读屏名称；保持桌面、侧栏、移动端功能一致 | `src/index.ts:10717-10737` 卡片自身为 `tabindex=0 role=button`，`10849-10887` 内嵌多个原生 button，存在嵌套交互语义冲突；T-7145 只做可发现性横审，不覆盖结构合同 |
| T-7195 | P1 | **三面板 Dialog 可访问名称与导航 landmark**：为切换器、工作台、片段实验室提供唯一表面标题、`aria-labelledby`、导航区域名称和内容 landmark；平台头、ContextBar 与宿主 Dialog 名称不得重复或为空 | `src/index.ts:3714-3718`、`src/second-panel-ui.ts:88-97` Dialog title 为空；`index.ts:642-654` header 复用平台上下文名称，缺少表面唯一导航标识；区别于 T-7144 的关闭入口和 T-7166 的普通控件名称 |
| T-7196 | P2 | **第一面板 forced-colors/high-contrast 回归**：验证卡片、预览、数字角标、搜索 chips、移动 sheet 的边框、焦点、空态和错误态在系统强制配色下仍可辨；补主题 token 和降级规则，记录真实系统与浏览器夹具边界 | `_platform-shell.scss:491-501` 只有 prefers-contrast token，`_03-switcher-mobile.scss` 没有 forced-colors 专项，仍有 `color-mix` 透明边框；T-7153 只覆盖第二面板视觉矩阵 |
| T-7197 | P2 | **搜索结果打开失败的现场保留与可重试**：native search/文档打开前不要不可逆地丢掉当前面板；失败时保留查询、筛选、滚动和预览对象，提供重试或重新打开出口，成功后只关闭一次 | `src/doc-search-ui.ts:1659-1667/1853-1869` 先 `onClose()` 再异步 `openTab`，失败仅 toast；与 T-7145 可发现性和 T-7163 跨面板现场分工，专门覆盖打开失败回退 |

## 归回既有任务的补强项

以下发现已有明确承接任务，不另占编号：

- SurfaceNav 的 `available` 在 `index.ts:3821`、`second-panel-ui.ts:255-256` 仍硬编码全量表面，禁用模块会先展示入口再由 `openPlatformSurface` 拒绝；并入 T-7026 模块可见性后续。
- 跨面板导航先销毁来源再路由，目标并发禁用时可能落入无面板；并入 T-7026 与 T-7143 的失败回退验收。
- 商店键盘卡片 Enter/Space 与鼠标点击语义不一致、移动详情返回只删状态不重绘/回焦、目录重试未重新枚举 provider；分别补强 T-7126、T-7143、T-6967/T-7125。
- 悬浮球恢复只传 `{entry: "fab"}`，没有消费已记录的 query/objectId/focus；补强 T-7163。
- `home-adapters.js` 配置对象按插入顺序生成 cache key，等价对象会失去 TTL/in-flight 去重；provider 注销也未主动 abort 在途 read；补强 T-7164 的 canonical key、调用者取消和 unregister 验收。

## 验证边界

- 本轮证据来自源码静态检查、现有纯模型/夹具结构和只读 Node 探针；没有声称真实宿主已发生或已修复这些问题。
- 真实桌面 Dialog、屏幕阅读器、forced-colors、Android 触控和内核慢请求仍按 B-004/B-005 分账。实施时新增门禁或契约测试必须执行 `docs/gate-audit-checklist.md` 并做违规注入负向验证。
- 所有任务等待用户明确说“开始开发”后再按依赖施工。
