# ADR 0216：T-7291 紧凑工作台查看态解耦与壳层收口

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7291
- 相关：T-7290、ADR 0202～0205、ADR 0215

## 背景

在前期 T-7278～T-7283 的工作台收口后，第二面板虽然引入了 28px 网格行高，但真实宿主反馈依然显示：日常打开查看时，工具栏按钮（编辑布局/刷新全部/组件商店）与底部整行健康回执依然挤占了紧凑窗口（920×390px）宝贵的可视高度，卡片呈现出“后台管理系统感”，日常查看态与编辑编排态没有彻底解耦。

## 决策

1. **容器状态机显式解耦**：
   在 `src/second-panel-ui.ts` 中，`renderPanel` 挂载时显式注入 `root.dataset.mode = editing ? "edit" : "view"` 并动态切换 `is-editing` 类名；底部健康回执 `receipt` 显式设置 `dataset.state = "ready" | "error" | "loading" | "blocked"` 及失败/陈旧计数。
2. **compact 查看态壳层收敛与隐性把手**：
   在 `src/styles/_12-r54-surface-adapter.scss` 中收窄紧凑桌面非编辑态下的 `.sw-home__bar` 间距（`margin-bottom: var(--sw-space-2xs, 2px)`），优先保障首屏小组件的可视高度；日常查看态（`:not(.is-editing)`）下隐藏折叠与配置把手，仅在鼠标悬停（Hover）或焦点选入时优雅浮现，实现真正的“内容即界面”；
3. **高频组件现代科技感与物理质感升级**：
   在 `src/styles/_00-tokens.scss` 中建立 `--sw-rim-light` 与 `--sw-focus-glow`，让小组件消费 1px 亚光微切光倒角；为时钟组件引入等宽精密工整排版，为待办任务勾选框引入紧凑方形与物理按压弹簧回弹微动效；
4. **健康回执轻量静默化**：
   紧凑桌面下，正常就绪态（`[data-state="ready"]`）的健康回执行将边框设为透明、明度降低至 80%，退化为低干扰状态行；发生 `error` 或超时异常时保持显眼警示边框与背景。
5. **既有自动化契约与无障碍保留**：
   保留原有工具条按钮（`data-home-action="edit" | "refresh-all" | "add"`）的 DOM 节点与键盘聚焦入口，确保 `preventScroll` 事务与自动化测试不被破坏。

## 证据

- `tests/compact-workbench-style-contract.test.cjs`：追加 T-7291 契约测试（验证 `dataset.mode`、`is-editing` 切换、查看态边距收紧以及就绪态透明边框与错误态显眼边框）；
- 负向违规注入：
  1. 临时移除 `dataset.mode` 赋值，测试精确失败（`ERR_ASSERTION: second panel must explicitly set dataset.mode for view/edit decoupling`），还原后复绿；
  2. 临时将 `border-top-color: transparent` 注入为 `red`，测试精确失败（`ERR_ASSERTION: compact receipt must reduce to a lightweight status row when all modules are ready`），还原后复绿；
- TypeScript 类型检查：`npx tsc --noEmit` 0 错误通过；
- 单元与契约套件：`compact-workbench-style-contract` 3/3 通过，`home-view` 34/34 通过，`home-controller` 28/28 通过；
- Webpack 生产构建：产物正常打包，`package.zip 577 KiB` 处于 578 KiB 发布门禁之内。

## 后续

第二面板架构规范与画廊商店抽屉原型已落盘至 `docs/widget-glance-system-spec-2026-10-17.md` 与 `docs/design/widget-gallery-glance-prototype-2026-10-17.html`，后续按计划推进 T-7163 FAQ 与脱敏反馈材料。
