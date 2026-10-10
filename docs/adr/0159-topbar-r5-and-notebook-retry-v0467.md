# ADR 0159：R5 顶栏原型与配置加载失败回执（v0.46.7）

- **日期**：2026-10-09
- **状态**：accepted
- **关联任务**：T-7232

## 决策

1. 共用顶栏采用三段稳定结构：桌面为身份 / 居中导航 / 右侧动作；窄侧栏和移动端把导航放到动作区下方，关闭保持动作区最右侧。
2. 245px 侧栏按真实容器宽度验证，隐藏图标但保留完整标签、48px 导航命中区和可点击坐标；原型示例不得用父级窄缩来代替真实侧栏。
3. 当前表面保留 `aria-current`、主色和底部强调线；切换反馈只描述当前标记与上下文更新，不承诺焦点停留在已替换节点上。
4. 笔记本加载失败与空列表分离，配置表单读取带 `failed` 的详细结果；失败显示重试，成功恢复选项/原值/按钮状态，销毁后忽略迟到回包。

## 验证

- `tests/platform-topbar-layout-contract.test.cjs`：桌面、窄屏、侧栏 CSS 块级合同。
- `tests/surface-switch-browser-smoke.cjs`：245px 真实侧栏夹具、标签无溢出、关闭/设置几何和坐标点击。
- `tests/home-config-notebook-retry-behavior.test.cjs` 与 `tests/notebook-failure-contract.test.cjs`：失败、重试成功、空列表和销毁竞态；成功态禁用按钮的负向注入已确认会失败。
- 真实宿主的读屏、Android 和长期侧栏观感继续按 `BLOCKERS.md` 后置。
