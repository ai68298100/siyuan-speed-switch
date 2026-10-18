# ADR 0218：全表面渐进式质感升级与典藏版平台演进

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7291 延展与全表面质感统一
- 对应高保真原型：[`docs/design/platform-ui-masterpiece-2026-10-17.html`](../design/platform-ui-masterpiece-2026-10-17.html)

> **2026-10-18 落地范围勘误（T-7303）**：本文决策同时包含方向与原型；不能据此把全部效果视为已实现。生产编辑器是 textarea + 行号，无语法高亮；微噪点开关、Spotlight/3D tilt、晴朗呼吸光晕仍是原型专属；商店为独立 Dialog，未交付内嵌 Gallery Sheet。秒级时钟/等宽数字、待办交互、切光/焦点和流光样式已部分落实。逐项状态以 [最新审计](../status-audit-2026-10-18.md) 为准。

## 背景

用户在深入体验高保真原型后给出明确指导：“第二面板和商店照着最现代化、最科技感进行优化。其他面板要确保原有功能不变的情况下，渐进式提升，不要把原有功能给优化没有了。可以优化而不是另行打造。”
在此前探索中，过度追求单列或极简曾导致第一面板和第三面板部分成熟功能在原型中被弱化。本决策旨在确立“最小变动原则（Minimal Delta Principle）”，原汁原味继承成熟生产结构，仅在视觉表面层做无损质感加法。

## 决策

1. **第一面板、第三面板、悬浮球与设置页零功能裁剪**：
   - 第一面板完整保留 8 张页签卡网格、缩略图、数字键帽 1~8、分类行、快捷动作列表、以及右侧 34% 完整阅览窗格；
   - 第三面板完整保留专业三栏结构（左代码库、中专业编辑器带行号语法高亮、右真实网页预览画布与 AI 建议）；
   - 设置页完整保留 10 标签导航并新增可选微噪点开关；
   - 悬浮球完整保留 2×2 上下文动作网格。
2. **全表面渐进式质感加成 (Progressive Sensory Polish)**：
   - 在 `src/styles/_11-ui-polish.scss` 中为第一面板卡片 `.sw__card` 注入 `box-shadow: var(--sw-rim-light, none)`（1px 纯白晶体微切光倒角）；
   - 在 `src/styles/_06-widgets-store.scss` 中为商店卡片 `.sw-home-store__card` 注入同款微切光与悬停微抬升；
   - 在 `src/styles/_07-sidebar-panel-store.scss` 中为进度条 `.sw__home-progress-fill` 注入 `sw-progress-shimmer` 2.8s 循环科技流光微脉冲，并为待办复选框 `.sw__home-module-item-check` 注入 `:active { transform: scale(0.9); }` 弹簧微动效；
   - 升级全局机械键帽 `.sw-platform-kbd` 与双层发光微环焦点 `--sw-platform-focus`。
3. **第二面板与商店最现代化科技感飞跃**：
   - 第二面板融入等宽秒表实时跳秒走时、晴朗呼吸光晕、待办原地打勾；
   - 组件商店彻底打造成沉浸式画廊大厅，支持 1:1 动态多尺寸预览与一键添加。

## 证据

- 样式契约测试：`tests/compact-workbench-style-contract.test.cjs` 5/5 全部通过（覆盖第一面板切光、商店卡片切光与流光进度条）；
- 负向违规注入：临时移除 `.sw__card` 的 `sw-rim-light` 声明，测试精确报错拦截（`ERR_ASSERTION: first panel switcher cards must consume sw-rim-light without breaking legacy DOM`），还原后 100% 复绿；
- TypeScript 与构建：`npx tsc --noEmit` 0 错误；Webpack 生产构建打包成功，`package.zip 575 KiB` 处于 578 KiB 门禁以内；
- 全功能典藏版原型：[`docs/design/platform-ui-masterpiece-2026-10-17.html`](../design/platform-ui-masterpiece-2026-10-17.html) 在 `http://127.0.0.1:8765/` 实时可预览。
