# ADR 0219：核心高频小组件内容直出与查看态解耦

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7144 高频组件精修
- 对应原型：[`docs/design/platform-ui-masterpiece-2026-10-17.html`](../design/platform-ui-masterpiece-2026-10-17.html)

## 背景

在第二面板（工作台看板）推进最现代化、最科技感重构时，用户明确指示：“第二面板和商店照着最现代化、最科技感进行优化。其他面板保持原有不变的情况下渐进式提升质感。”
在既有渲染管线中，时钟与天气等单值微卡片常驻带有 `h3.sw__home-module-title`（“时刻”或“天气”），在紧凑模式下占用了整整一行（24px+），挤占了大号时间与温度的排版空间，未能实现 Apple 小组件“内容即界面（Content-as-Interface）”的极致纯净感。

## 决策

1. **时钟去标题化直出与等宽排版**：
   在 `src/styles/_12-r54-surface-adapter.scss` 中针对紧凑非编辑态（`sw-home--compact:not(.is-editing)`）下的 `external-local-time`：
   - 隐蔽多余的文字标题 `.sw__home-module-header .sw__home-module-title`，实现大字时间、周几日期与日进度细线的一体化直出；
   - 声明 `font-variant-numeric: tabular-nums` 与 `letter-spacing: -0.03em`，消灭秒针跳动时的布局抖动；
   - 保持 DOM 树上的 `h3` 节点不被销毁，确保读屏软件无障碍访问（a11y）与历史测试契约不受破坏。
2. **天气气温数字科技感精工排版**：
   在 `external-weather-open-meteo` 中声明 `font-variant-numeric: tabular-nums`，确保温度大字与温差范围排版稳定。
3. **编辑态与查看态智能联动**：
   当用户主动点击“✎ 编排布局”进入编辑态时，时钟标题与把手自动复原，方便用户识别与拖拽排序。

## 证据

- 样式契约测试：`tests/compact-workbench-style-contract.test.cjs` 6/6 全部通过（追加针对时钟去标题化与等宽数字的断言）；
- 负向违规注入：临时注释掉时钟去标题化 `display: none` 规则，测试精确红屏拦截（`ERR_ASSERTION: local time widget in view mode must hide redundant title for content-first glance layout`），还原后 100% 复绿；
- 单元与逻辑测试：`tests/home-view.test.cjs` 34/34、`tests/home-controller.test.cjs` 28/28 通过；`npx tsc --noEmit` 0 错误；
- 生产构建与门禁：Webpack 生产构建打包成功，`package.zip 575 KiB` 处于 578 KiB 门禁以内。
