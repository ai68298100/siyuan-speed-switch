# 第三方组件最小示例

本目录是 `docs/widget-protocol.md` 的配套复制模板：

- [`example-module.js`](./example-module.js) — 完整可运行的 `registerHomeModule` 接入模板，标注了三处业务点（read 快照 / open 跳转 / onunload 注销），演示协议 v2 的 `configSchema`（notebook + number 字段）、`refreshOn`、`sizes` 与条目级 `command`/块 ID/`href` 三种点击语义。
- `tests/widget-example-contract.test.cjs` — 契约测试，保证示例使用的字段、配置类型与点击前缀始终与生产协议白名单一致；模板漂移会在 CI 直接失败。
- `tests/widget-example-e2e.test.cjs` — 端到端运行时测试，把本模板当作真实第三方插件跑通生产 homeRuntime 链路（注册 → 设备清单 → 有界读取 → 视图构建 → 注销），并断言运行时 token 安全、幂等注销与快照缓存清除生命周期。

接入步骤：把 `example-module.js` 复制进你的插件 → 替换三处业务点 → `onload` 中调用 `registerExampleHomeModule(this.app.plugins.find((p) => p.name === "siyuan-speed-switch"), this)` → `onunload` 中调用返回的 `unregister()`。生命周期语义（失效恢复、热替换、注销句柄）见协议文档"生命周期与失效恢复"一节。

## 真实插件样例：小驴打卡（siyuan-checkin）

[`siyuan-checkin-home-modules.js`](./siyuan-checkin-home-modules.js) 是**提供方自行注册**路径的
完整参考实现——5 个只读组件、带 `source` 来源声明、按能力门控注册、有界重试应对加载顺序。
`tests/widget-example-checkin.test.cjs` 钉住它与速切侧桥接实现的 moduleId 一致性。

### 与速切内置桥接的分工（ADR 0057）

速切已经用同样的 5 个 `moduleId` 内置了桥接组件（`src/checkin-bridge-model.js` 直接读打卡
公开的生态 API v4），所以用户装了小驴打卡就能用，不必等打卡插件适配。打卡若日后自行注册
**相同的 moduleId**，速切 runtime 的 token 覆盖会让原生实现接管，用户配置不漂移——
这也是模板里 id 必须与速切侧保持一致的原因。

### 数据契约（生态 API v4）

| 能力 | API | 返回要点 | 用于 |
| --- | --- | --- | --- |
| 项目 | `getItems()` | `{id, name, icon, kind, target, unit, schedule, group?, priority?, archived?}` | 今日打卡、连续排行 |
| 事件 | `getEvents()` | `{id, itemId, occurredAt, localDate, value, unit, source}` | 热力图、连续计算 |
| 分析快照 | `getAnalyticsSnapshot()` | `{asOf, weekly/monthly/daily/yearly: {title, unit, points[]}}` | 本周概览 |
| 分析摘要 | `getAnalyticsSummary()` | `{asOf, weeklyCurrent, monthlyCurrent, activeDays, yearlyCurrent}` | 英雄区 |
| 日期事项 | `getTodayOccasions()` | `{name, kind, occurrenceDate, daysUntil, completedDates[]}` | 近期事项（只读投影） |

握手：`whenReady()` → `hasCapability("items.read" | "analytics.read" | "occasions.read")` → 读数。
不用插件版本号猜能力；能力缺失时对应组件不注册。

### 诚实声明

- 连续天数、今日计划命中是**按 events 推导**的简化口径，权威实现在打卡内部（quota/rules）；
  后续换成内部函数时保持 `moduleId` 不变。
- 日期事项只做只读投影，不提供完成动作（写入必须经用户确认）。
- 热力图色阶阈值沿用打卡公开的 `≥2 / ≥max(3, 0.5max) / ≥max(6, 0.75max)`。
