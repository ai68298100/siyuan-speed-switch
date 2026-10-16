# ADR 0204：compact 壳层显露层级

- 日期：2026-10-16
- 状态：已完成
- 任务：T-7279
- 相关：T-7278、ADR 0203

## 背景

T-7278 恢复了组件的 `span h` 高度差，但 Chrome 隔离宿主截图仍显示 compact 面板的主要高度被完整平台壳层、文字工具栏和健康回执占用，组件因此像缩小的工作台，首屏内容被压低。本任务的几何数据统一在有限动画结束后读取，避免把打开动画期间的缩放尺寸当作稳定布局。

## 决策

1. 只在桌面 compact 工作台收起重复上下文面包屑，平台头部设为 36px 最小高度；品牌副标题隐藏，设置、帮助和关闭仍保留带 `aria-label/title` 的键盘可达按钮。760px 以下容器恢复两行头部，窄容器规则使用与桌面规则一致的作用域优先级，确保导航不会被桌面单行规则覆盖。
2. 刷新全部和组件商店在 compact 中保留图标和原生标签，隐藏重复文字；组件商店按钮补齐 `aria-label/title`。移动端保留原有触控尺寸和完整文字。
3. 健康回执采用 24px 最小高度；桌面 compact 的 fresh/cached 来源健康 chip 显示为状态点，并保留 `aria-label/title` 文本。fresh 使用实心点，cached 使用空心虚线边框，stale 保留原文字，异常状态不只依赖颜色表达。
4. 不删除任何动作、组件协议、保存布局或数据源；全屏工作台、商店和设置继续使用完整壳层。

## 取舍

compact 首屏可见的说明文字减少，低频解释通过原生 tooltip 和无障碍名称保留。移动端不消费桌面紧凑规则，避免触控目标被压缩。过期来源仍显示文字，健康回执详情按钮继续可达。

## 验证

- `tests/compact-workbench-style-contract.test.cjs`：高度档位与壳层显露层级定向契约通过；最终负向注入覆盖 21 条块级断言（T-7278 14 条、T-7279 7 条），全部精确触发目标用例失败且无其他失败，注入前后 MD5 一致，详见 `.artifacts/T-7279-negative-shell-contract.log`。注入工具明确使用 TAP reporter，保证 Node 默认 reporter 变化后仍能解析目标失败。
- `tests/home-view.test.cjs`：来源健康点的 `aria-label/title` 回归通过。
- Chrome 隔离思源真实宿主 1/1，实际内核 `3.8.8-alpha.1`：`.artifacts/T-7279-visual/results.json`、`.artifacts/T-7279-visual/metrics.json`、`.artifacts/T-7279-visual-run.log`。等待有限动画结束后，1440×900 下实测 chrome 38px、工具栏 37px、回执 29px，`span 3/6` 组件高度为 96/198px；上下文 `display:none`、刷新/商店文字隐藏，`scrollWidth === clientWidth === 916`。
- 700×900、375×812 下恢复两行导航，chrome 分别为 73/71.5px，滚动宽与可用宽分别为 612/612、326/326px，无横向溢出。三种宽度均核对刷新、商店、编辑、健康详情和关闭入口可见且可聚焦；编辑开启/完成、健康详情已实际点击。截图分别为 `.artifacts/T-7279-visual/t7279-compact-shell-1440.png`、`t7279-compact-shell-700.png`、`t7279-compact-shell-375.png`。
- T-7280 收口后完整 `pnpm verify:release` 通过：测试 8715 通过、1 跳过、0 失败，可复现双构建 3/3，TypeScript、全部审计及 mobile/browser/floating-ball 25 场景/surface-switch smoke 全绿。日志：`.artifacts/T-7280-verify-release-final.log`。版本号不变、不发布、不 push。

## 完成边界

本任务只调整桌面 compact 的壳层显露层级和可访问标签，继续沿用 T-7278 的网格与组件尺寸协议。后续若仍觉得卡片内容过重，应按组件类型提供独立排版证据，不再扩大平台壳层范围。
