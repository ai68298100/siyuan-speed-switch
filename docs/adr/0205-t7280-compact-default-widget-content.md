# ADR 0205：默认四组件的紧凑内容层级

- 日期：2026-10-16
- 状态：已完成
- 任务：T-7280
- 相关：T-7278、T-7279、ADR 0202～0204

## 背景

T-7279 稳定 Chrome 截图已确认壳层收紧和高度档位有效，但默认四卡仍有内容层级问题：常驻完整更新时间挤压日记标题，近期文档首条内容被卡片内多层留白裁切；今日待办没有条目时，组件保持 ready 并提供 emptyHint，现有渲染却只显示零计数，遗漏了提示。

## 决策

1. 桌面 compact 的 `recent-documents`、`favorites`、`today-journal`、`today-tasks` 单独收紧内容层。卡片 body 为上下 4px、左右 6px，header 最小高度 24px、标题 12px；配置和折叠按钮通过共用 toggle 类保持 24px 目标，统计值采用既有 `--sw-font-xl` 刻度 17px、摘要最小高度 22px，列表动作最小高度 24px。用明确作用域覆盖既有多层 body padding 和字号规则。
2. 这四卡的正常更新时间与 fresh/cached 来源状态从可视排版中收起，保留 DOM 文本、更新时间 `aria-describedby` 和完整标题 tooltip。stale 元信息与来源状态继续明文显示，使异常来源可以直接发现。
3. ready 列表没有条目且已有 emptyHint 时，呈现该提示并添加 `is-empty-content`，继续保留 ready 状态。今日待办的空内容在既有高度内居中，沿用原有布局尺寸。

## 取舍

默认四卡优先为标题、统计摘要和首条操作留出空间。正常更新时间需要通过 tooltip 或可读描述获取，过期和刷新失败文字继续常显。此规则限定桌面 compact 默认四卡，其他类型按其内容形状继续分别验证。

## 验证

- Chrome 隔离宿主最终 2/2，通过日志 `.artifacts/T-7280-visual-run.log`：内核 `3.8.8-alpha.1`，1440×900、700×900、375×812 三档记录 body `4px 6px`、header 24px、标题 12px，计数摘要 22px、首条动作 24px、配置/折叠目标 24×24px；已有首条内容和空提示均完整位于各卡 body 内。保留 tall 档位的夹具在 375px 需要滚动画布，700px 高卡底部亦需滚动；默认四张 small 摘要卡另测桌面首屏容纳，截图 `.artifacts/T-7280-visual/t7280-default-four.png`。前后对照见 `.artifacts/T-7280-visual/compact-before-after.png`。
- 控制数据经真实 controller 注入 12 条近期文档，外层 body 高 86px、内容高 357px，滚到 271px 后最后一条完整可见，module 内层没有产生第二个滚动区。stale 来源文字 10px 且 `clip-path:none`，过期元信息明文保留；编辑开关、健康详情及工具入口可聚焦均通过。证据：`.artifacts/T-7280-visual/metrics.json`、`scroll-stale.json`、`results.json`。
- 渲染层四项负向验证已精确触发指定失败：ready 空提示、元信息描述、完整标题 tooltip、stale 可见性钩子；源码恢复后的 SHA-256 与注入前一致，日志 `.artifacts/T-7280-negative-renderer.log`。
- 最终样式契约 21 条负向注入全部精确触发目标失败且无其他失败，前后 MD5 一致（`.artifacts/T-7279-negative-shell-contract.log`）。统计字号从门禁不允许的 18px 改用既有 17px 刻度，根文档超预算通过精简重复摘要解决，均未放宽门禁。
- 完整 `pnpm verify:release` 通过：8715 通过、1 跳过、0 失败；可复现双构建 3/3，TypeScript、全部审计与 mobile/browser/floating-ball 25 场景/surface-switch smoke 全绿。日志：`.artifacts/T-7280-verify-release-final.log`。

## 完成边界

本任务处理默认四组件的内容层级和已提供空提示的渲染，保留组件协议、ready 状态语义及用户布局数据。版本号不变，不发布、不 push。

下一批按 ADR 0202 调整时钟、天气与倒数的 compact 摘要瓦片，效果组件的视觉收敛仍待单独实施和验证。
