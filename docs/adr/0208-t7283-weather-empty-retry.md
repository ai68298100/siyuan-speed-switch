# ADR 0208：天气网络失败空态提供可达重试

- 日期：2026-10-16
- 状态：accepted
- 任务：T-7283
- 相关：ADR 0008、ADR 0207

## 背景

天气适配器为了保留“可解释空态”会把网络异常转成带 `emptyHint` 的空快照。此前这条路径没有把失败入口渲染成按钮，用户只能看到“加载失败 · 重试”文字；同时适配器缓存了空快照，重复点击也需要绕过短缓存和失败退避。

## 决策

1. 延续 ADR 0008 的空态边界：天气网络异常返回 `items: []`、`emptyHint` 和 `retryable: true`，仍作为可解释的空快照，不改成通用 `error`。配置缺失、城市不存在继续使用原有空态，`aborted` 继续抛出并保持取消语义。
2. `home-adapters` 只透传布尔 `retryable`；`home-view` 将它透传到视图并在空态中渲染可访问的重试按钮。其他空态和 blocked 状态不增加按钮。
3. 控制器的卡内重试调用 `refresh(undefined, {force: true})`，同时绕过成功缓存和失败退避；重试仍沿用当前配置、焦点恢复和 stale 保留规则。

## 验证

- 定向测试共 **199/199**：天气外部契约 65、适配器 72、视图 34、控制器 28。
- 三路负向注入均精确失败并恢复：移除天气 `retryable`、移除空态按钮条件、移除 `force` 选项；日志见 `.artifacts/T-7283-negative-weather.log`。
- Chrome 隔离思源 3.8.8-alpha.1 1/1：首读显示“加载失败 · 重试”，点击后第二次读取携带 `force: true` 并恢复天气数值；截图、调用参数和 Playwright JSON 见 `.artifacts/T-7283-weather-retry/`，运行日志见 `.artifacts/T-7283-weather-retry-run.log`。
- 最终生产构建 `package.zip` 为 **591864 B**，低于 591872 B 门禁，余量 8 B；构建日志见 `.artifacts/T-7283-build.log`。

## 边界

本任务只闭合天气网络异常的空态重试入口，不改变天气请求白名单、缓存 TTL、城市解析、取消协议或其他外部组件的错误契约。完整发布门禁在账本中记录。
