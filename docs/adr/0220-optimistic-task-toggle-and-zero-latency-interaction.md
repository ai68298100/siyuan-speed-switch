# ADR 0220：待办任务 0ms 乐观更新微交互与异常回滚契约

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7144 高频核心小组件精修
- 对应模块：`src/home-view.js`、`src/second-panel-ui.ts`、`src/styles/_07-sidebar-panel-store.scss`

## 背景

在第二面板（工作台看板）的小组件交互中，用户点击待办任务复选框时，原本的处理逻辑是直接发起异步调用（`options.onToggleItem(item, view)`），待思源底层完成 SQL 更新并触发整面板重新渲染后，DOM 才会更新打勾状态。在网络慢或内核并发写操作时，往往存在 50ms~300ms 的延迟，导致用户在这期间看不到任何视觉反馈，误以为点击未生效。

## 决策

1. **0ms 乐观 UI 即时更新 (Optimistic UI Update)**：
   在 `src/home-view.js` 的任务复选框点击事件中，在发起后台异步请求的第 0 毫秒：
   - 立即切换复选框类名 `check.classList.toggle("is-done", nextDone)`；
   - 立即更新无障碍状态 `check.setAttribute("aria-pressed", String(nextDone))` 与 `aria-label`；
   - 立即切换内部对勾 SVG 节点；
   - 立即将兄弟文本按钮的划线类名切换 `button.classList.toggle("is-done", nextDone)`，配合 CSS 的 140ms 平滑过渡衰减（`opacity: 0.72` 与 `text-decoration: line-through`）；
   - 内存态立即反转 `item.done = nextDone`。
2. **异步失败优雅回滚机制 (Defensive Rollback on Error)**：
   监听 `options.onToggleItem` 的 Promise 执行结果与同步异常；一旦发生网络超时、内核写锁或异常报错，在 `catch` 闭包中立即将类名、对勾、划线及 `item.done` 状态无缝回滚至点击前状态，并保留错误提示。
3. **物理按压弹簧回弹 (Tactile Spring Bounce)**：
   在 `src/styles/_07-sidebar-panel-store.scss` 中为 `.sw__home-module-item-check` 声明 `:active { transform: scale(0.9); }` 弹簧微动效，打勾后带有主题色发光微阴影。

## 证据

- 单元测试：`tests/home-view.test.cjs` 追加专门测试用例 `home view task checkbox executes 0ms optimistic UI updates and handles rollbacks (T-7144)`，35/35 全部通过；
- 负向违规注入：临时注释掉 `src/home-view.js` 中的类名即时切换逻辑，测试精确红屏拦截（`AssertionError: Expected values to be strictly equal: false !== true`），还原后 100% 复绿；
- 控制器与样式契约：`tests/home-controller.test.cjs` 28/28、`tests/compact-workbench-style-contract.test.cjs` 6/6 通过；
- 生产构建与体积：Webpack 生产构建打包成功，`package.zip 575 KiB` 处于 578 KiB 仓库发布门禁以内。
