# ADR 0183：第一面板排序与全屏控件状态同步

日期：2026-10-13
状态：已接受，T-7255

## 背景

第一面板排序浮层已经支持鼠标、键盘方向键、Escape 和焦点回收，但触发按钮没有同步 `aria-expanded`，导致读屏和样式层无法知道浮层是否打开。全屏切换只更新了 `aria-label`，悬停提示会在切换后继续显示旧动作。

## 决策

- 排序触发器装配时声明 `aria-haspopup="menu"` 和 `aria-expanded="false"`；打开浮层时设为 `true`，通过选择、外部点击、Escape 或释放链关闭时恢复为 `false`。
- 全屏切换同时更新按钮的 `aria-label` 与 `title`，让辅助技术名称和可视悬停提示都反映下一步动作。
- 不改变排序、搜索、预览取数、关闭路由或焦点回收逻辑。

## 验证

- `tests/switcher-feedback-contract.test.cjs` 定向合同通过 **8/8**；新增合同分别覆盖排序初始/打开状态和全屏进入/退出提示。
- 删除排序打开态的负向注入按预期使 T-7255 失败；随后按注入前快照逐字恢复生产源文件。
- 第一面板相关定向回归（搜索会话、编排、预览行为/查找、工具栏）通过 **45/45**，完整日志见 `.artifacts/T-7255-first-panel-contract.log`；`pnpm exec tsc --noEmit`、`pnpm run build`、`node scripts/current-status-audit.cjs`（123 tasks valid）和 `git diff --check` 通过。浏览器 E2E 因共享 E2E 工作区被其他思源内核锁定而未启动，不作为产品失败证据；与 T-7256 的后续移动入口/筛选恢复任务并行记录。

## 边界

这是 DOM 状态和反馈修复，不等同于真实读屏器验收；NVDA、最窄原生侧栏和 Android 仍按 `BLOCKERS.md` 后置。
