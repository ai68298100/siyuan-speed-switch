# ADR 0182：加载骨架使用明确的动效时长

## 背景

工作台和第一面板搜索的加载骨架把 `1$sw-dur-slow` 写在 Sass 动画速记中。生产构建后该表达式展开为 `1 .2s`，浏览器无法把它解析为合法的动画声明，于是加载骨架失去渐变反馈；这类问题不会被只检查源码关键字的契约测试发现。

## 决策

新增独立的 `$sw-dur-skeleton: 1s` 动效变量，并让两个加载骨架直接使用它。骨架在普通模式保持 1 秒无限脉冲，在 `prefers-reduced-motion: reduce` 和 `prefers-reduced-data: reduce` 下继续关闭动画。

## 验证

- 编译 CSS 包含 `sw-home-skeleton-pulse 1s ... infinite` 与 `sw-doc-skeleton-pulse 1s ... infinite`。
- Chromium 计算样式确认工作台骨架普通模式为 `animationName=sw-home-skeleton-pulse`、`animationDuration=1s`、`iterationCount=infinite`。
- Chromium `prefers-reduced-motion: reduce` 确认动画为 `none`、`0s`、`1`。
- `tests/compiled-css-contracts.test.cjs`、`tests/doc-search-state.test.cjs`、`tests/home-view.test.cjs`、`tests/home-controller.test.cjs` 共 70 项通过。

## 影响

只修复加载反馈的 CSS 解析，不改变数据请求、布局、交互或面板状态语义。
