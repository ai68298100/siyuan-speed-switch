# ADR 0217：多端自适应双拼 Bento 架构与前端 GPU 性能护栏

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7291 延展与多端自适应收敛
- 对应规范：[`docs/multi-device-adaptive-and-performance-spec-2026-10-17.md`](../multi-device-adaptive-and-performance-spec-2026-10-17.md)

## 背景

在推进第二面板小组件看板的现代化与极质感重构时，用户明确提出：“继续优化 UI，也要保证性能。可以再进行下调研，包括 iPad 上、各手机上等的显示等。”
此前手机端（`sw-home--mobile` 或 `<= 560px`）简单粗暴地将所有组件强制设为单列占满（`grid-column: 1 / -1`），导致一个极小的时钟或天气卡片独占一整行，信息密度极低；同时，桌面端的高频光标 3D 微倾斜和聚光算法若未加节制地在移动端或低功耗设备上运行，会引起不必要的重绘开销和触控卡顿。

## 决策

1. **手机端与窄视口升级为 2 列双拼 Bento 网格**：
   在 `src/styles/_12-r54-surface-adapter.scss` 的 `@container sw-r54-surface (max-width: 560px)` 作用域下：
   - 将网格定义为 `grid-template-columns: repeat(2, minmax(0, 1fr))`；
   - `xs` 单值微卡片（时钟、天气）声明 `grid-column: span 1`，在手机顶部实现 50% 优雅并排，一屏尽览；
   - 列表卡片（近期文档、今日待办）与大卡片声明 `grid-column: 1 / -1` 占满整行，保证阅读舒展与标题不被折断。
2. **指针与触控物理隔离性能护栏 (Pointer & Touch Isolation)**：
   通过 `@media (hover: hover) and (pointer: fine)` 将鼠标 3D 微倾斜与 Spotlight 仅绑定在桌面环境；在移动端与 iPad 触控屏上（`pointer: coarse`），JavaScript 层面完全跳过事件监听（0% CPU 占用），改用纯 CSS 的硬件加速触控反馈（`:active { transform: scale(0.985); }`）。
3. **GPU 合成层隔离与 0 重排 (Composite-Only & Zero Reflow)**：
   强制将 `.sw-home .sw-home__cell` 提升至 GPU 硬件加速合成层（`transform: translateZ(0); will-change: transform;`），杜绝在卡片交互时触发全局回流重排（Reflow = 0）。
4. **多端交互画廊抽屉自适应**：
   在桌面/iPad 宽屏下表现为右侧滑出的 440px 半透明 Side Sheet；在手机端自动降级为自屏幕底部向上滑出的 Bottom Sheet，符合移动端大拇指单手操作习惯。

## 证据

- 样式契约测试：`tests/compact-workbench-style-contract.test.cjs` 追加双列 Bento 与 GPU 性能护栏断言（4/4 全部通过）；
- 负向违规注入：
  - 临时注释掉 `repeat(2, minmax(0, 1fr))`，测试精确红屏拦截（`ERR_ASSERTION: narrow container must use a 2-column mobile dual bento grid instead of full row stacking`），还原后 100% 复绿；
- 生产构建与移动端测试：`tests/mobile-toolbar-layout.cjs` PASS；`npx tsc --noEmit` 0 错误；`package.zip 577 KiB` 处于 578 KiB 发布门禁之内；
- 全设备可交互原型：[`docs/design/cyber-tactile-glance-prototype-2026-10-17.html`](../design/cyber-tactile-glance-prototype-2026-10-17.html)（在 `http://127.0.0.1:8765/` 运行，支持 桌面 920px、iPad 834px、iPhone 393px、Android 412px、Dock 245px 一键切换验证）。
