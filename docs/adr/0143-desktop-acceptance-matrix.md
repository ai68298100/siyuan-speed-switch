# ADR 0143：真实桌面与最窄侧栏验收矩阵

- 状态：已接受，已实施本地准备部分
- 日期：2026-10-05
- 任务：T-7115

## 背景

路径筛选的真实 API 结构已有证据，普通桌面和 Chromium 也有大量结构测试，但最窄原生侧栏的宽度、视觉层级和读屏行为仍不能从浏览器模拟推导。若继续只维护散落的测试链接，后续真实走查容易把“本地通过”误记为“宿主通过”。

## 决策

1. 用 JSON 固定路径筛选、桌面表面、主题、键盘、读屏、响应式、生命周期和失败降级的必测项。
2. 每项分别记录 local 与 host 状态；host 的 pending 必须绑定 `BLOCKERS.md` 中的阻塞项。
3. `chromium` 证据只能作为 local 证据，不能单独把 host 标记为 verified；真实 API 和真实思源 E2E 可以记录为 partial，但不覆盖窄侧栏走查。
4. 矩阵审计接入发布门禁，并通过负向测试验证错误状态会失败。

## 证据

- `pnpm run desktop:acceptance` 校验 11 项矩阵、8 个验收区域、10 项本地 verified、4 项 host partial 和 7 项 host pending。
- `tests/desktop-acceptance-matrix.test.cjs` 覆盖正常矩阵、Chromium 冒充 host 和缺失 B-005 两个负向场景。
- `docs/path-filter-host-evidence.md` 已证明 3.8.4-beta.2 的端点和响应字段；最窄可用侧栏宽度仍属于 B-005。

## 边界

矩阵就绪不等于真实桌面验收完成。没有真实宿主窗口、最窄侧栏尺寸和读屏工具时，相关项目保持 pending；不修改路径生产门禁，不向个人安装写入，也不合并主线。
