# 第二面板与小组件画廊系统级重构规范与代码改造映射 (Widget & Glance System Spec)

- 日期：2026-10-17
- 目标：彻底解决第二面板“又大、又丑、不像小组件”、商店像 CMS 审批表、组件头部堆砌技术噪音的核心痛点
- 涉及模块：`src/second-panel-ui.ts`、`src/home-store-ui.ts`、`src/home-view.js`、`src/styles/_12-r54-surface-adapter.scss`
- 对应高保真原型：[`docs/design/widget-gallery-glance-prototype-2026-10-17.html`](design/widget-gallery-glance-prototype-2026-10-17.html)

---

## 一、 核心设计系统与布局模数规范

### 1. 物理网格系统（12-Column Bounding Grid）
- **桌面模式（宽度 >= 760px，默认 920×390px 紧凑窗口）**：
  - 基底网格：`grid-template-columns: repeat(12, minmax(0, 1fr))`
  - 严格行高：`grid-auto-rows: 28px`
  - 间距节奏：`gap: 6px 8px`
  - 瓦片尺寸标准：
    - **`span-xs`（Micro-Metric，单值微瓦片）**：`grid-column: span 3; grid-row: span 2;`（实测约 220×62px）
    - **`span-small`（Compact-Row，微型信息条）**：`grid-column: span 6; grid-row: span 2;`（实测约 448×62px）
    - **`span-medium`（Dense-Card，中型密度卡）**：`grid-column: span 6; grid-row: span 4;`（实测约 448×130px）
    - **`span-wide`（Full-Strip，全宽信息条）**：`grid-column: span 12; grid-row: span 2;`（实测约 904×62px）
- **窄 Dock 模式（容器宽度 <= 280px，思源侧栏）**：
  - 强制一维流：`grid-template-columns: 1fr`
  - 所有小组件强制：`grid-column: 1 / -1`
  - 高度由内容自适应撑开，横向绝不出现水平滚动条。

### 2. 状态机规范（State Machine）
- **`view` 查看模式（日常 95% 时间）**：
  - 顶栏高度死锁至 **36px**；
  - 隐藏上下文面包屑行；
  - 隐藏 `.sw-home__bar`（编辑布局/刷新全部/组件商店等按钮组）；
  - 隐藏底部 `.sw-home__receipt` 健康回执；仅在存在 `error` 或 `stale` 异常时，以微弱的悬浮胶囊自底端浮现；
  - 卡片内部绝不渲染折叠箭头、齿轮按钮、Live 状态字样；
  - 待办任务允许直接点击原生复选框就地打勾。
- **`edit` 编排模式（用户主动点击笔形图标或右上菜单）**：
  - 顶栏下方滑出 32px 的次级工具条：呈现“+ 添加小组件”与“完成”按钮；
  - 画布显露 16px 点阵参考网格；
  - 卡片右上角浮现微型把手：`[↔ 切换尺寸]` 与 `[× 移除]`；
  - 点击“+ 添加小组件”时，呼出内嵌式画廊抽屉（Widget Gallery Sheet）。

---

## 二、 生产代码逐模块改造映射表 (Production Code Mapping)

### 1. `src/second-panel-ui.ts` 改造映射

| 现有逻辑 / 痛点 | 重构改造方案 | 预期收益 |
| :--- | :--- | :--- |
| **每次渲染均注入完整平台 Chrome 与面包屑**（约第 337-370 行） | 在 `sw-home--compact` 且非编辑模式下，跳过面包屑与冗余副标题挂载，将顶栏高度锁定为 36px。 | 节省 60px+ 宝贵垂直空间。 |
| **常驻渲染 `.sw-home__bar` 按钮组**（约第 445-575 行） | 将工具栏由常驻 DOM 改为条件挂载：`if (editing) { mountEditSubbar(); }`，日常查看态彻底隐藏。 | 消除工业机械感，纯净看盘。 |
| **常驻渲染 `.sw-home__receipt` 底部栏**（约第 1459-1465 行） | 改造为静默状态机：仅在 `failures > 0` 或 `hasStale` 时，作为悬浮绝对定位胶囊显示，正常时完全不占用文档流高度。 | 增加 28px 内容区。 |
| **商店调用打开全屏独立 Dialog**（`openHomeWidgetStore`） | 改为直接在第二面板根容器内嵌呼出 `GallerySheet` 抽屉元素，不弹出破坏工作流的新窗口。 | 操作连贯，如丝般顺滑。 |

### 2. `src/home-view.js` 改造映射

| 现有逻辑 / 痛点 | 重构改造方案 | 预期收益 |
| :--- | :--- | :--- |
| **强制塞入 `.sw__home-module-header` 7个元素**（约第 273-348 行） | 引入**轻量排版槽位（Lightweight Tile Slot）**机制：对于 `external-local-time`、`external-weather-open-meteo`、`recent-documents`、`today-tasks` 等高频组件，废除通用头部，直接由模板直出大数字与紧凑内容。 | 彻底消灭卡片标题与状态堆叠。 |
| **常驻折叠按钮与配置齿轮**（约第 312-346 行） | 配置和尺寸切换按钮抽离至 `.tile-handles`，在 `options.editing` 为 true 时才渲染，平时绝对不可见。 | 彻底杜绝 1×1 瓦片被控制按钮撑爆。 |
| **待办任务仅展示静态文本** | 在 `today-tasks` 模板中引入原生交互复选框，直接绑定 `options.onToggleItem` 回调，实现原地打勾并即时更新样式。 | 免去点进日记的割裂，交互效率提升数倍。 |

### 3. `src/home-store-ui.ts` 改造映射

| 现有逻辑 / 痛点 | 重构改造方案 | 预期收益 |
| :--- | :--- | :--- |
| **弹出 86vw × 84vh 全屏独立 Dialog** | 重构为 `renderGallerySheet(container, onClose)`：在当前面板右侧滑出 440px 半透明抽屉，带 15% 柔和背景毛玻璃遮罩。 | 摆脱后台 CMS 感，跃迁为 iOS/macOS Widget Gallery 质感。 |
| **复杂的三栏详情与技术参数堆砌**（权限、本地桥接、体积、隐私级别） | 剥离非必要技术参数，重构为**画廊卡片流（Gallery Card Stream）**：<br>1. 大类胶囊药丸横滑筛选；<br>2. 真实 1:1 组件动态渲染小样；<br>3. 一句话中文大白话功能说明；<br>4. 尺寸分段切换器（1×1 / 2×1 / 2×2）；<br>5. 醒目的 `[+ 添加到看板]` 主按钮。 | 从“审查代码”变为“挑选好看小挂件”，心智完全顺畅。 |

### 4. `src/styles/_12-r54-surface-adapter.scss` 改造映射

- 建立全新的 `.sw-home--glance` 样式作用域：
  - 锁定 12 列基底与 `grid-auto-rows: 28px`；
  - 预设 `.span-xs`、`.span-small`、`.span-medium`、`.span-wide` 四档类名；
  - 引入 1px 亚光微边缘（Subtle Rim Light）高光阴影；
  - 引入双层发光焦点环（Glow Focus Ring）；
  - 定义抽屉滑入滑出的平滑贝塞尔动效：`transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1)`。

---

## 三、 四阶段小步落地实施路线 (Phased Implementation Plan)

按照仓库严格的开发纪律（每次改动独立验证、不破坏全量门禁、负向测试自查），分四阶段施工：

### 第一阶段：面板层瘦身与查看/编辑态解耦 (P0)
1. 在 `second-panel-ui.ts` 中根据 `editing` 变量控制 `.sw-home__bar` 与底部健康回执的渲染；
2. 紧凑模式顶栏收缩至 36px，彻底隐藏上下文面包屑行；
3. **验收标准**：桌面紧凑窗口垂直可用高度由现在的不足 200px 恢复至 **300px 以上**，没有多余的空闲按钮抢占视线。

### 第二阶段：核心高频小组件“去壳化”直出 (P0)
1. 在 `home-view.js` 中重写 `local-time`、`weather`、`recent-documents`、`today-tasks` 的紧凑渲染模板；
2. 待办任务增加原地打勾支持；
3. 将配置与删除按钮收进编辑把手；
4. **验收标准**：时钟、天气以大数字与温度为主体，近期文档无多余外框，待办任务可直接勾选。

### 第三阶段：小组件商店升级为“画廊抽屉 (Gallery Sheet)” (P1)
1. 在 `home-store-ui.ts` 中重构弹窗形式为右侧 440px 内嵌抽屉；
2. 提供组件大类横滑筛选与 1:1 真实大小切换预览；
3. 点击一键添加平滑追加至网格末端；
4. **验收标准**：不再跳出全屏大弹窗，添加流程一气呵成。

### 第四阶段：多端与无障碍全面回归验证 (P0)
1. 验证 245px 真实窄 Dock 单列流布局与 600px 短屏弹性压缩；
2. 跑通全量 `pnpm verify:release` 8749 项测试套件；
3. 确保 WCAG 2.2 AA 文本对比度与纯键盘 Tab 导航完全合规。
