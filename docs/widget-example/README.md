# 第三方组件最小示例

本目录是 `docs/widget-protocol.md` 的配套复制模板：

- [`example-module.js`](./example-module.js) — 完整可运行的 `registerHomeModule` 接入模板，标注了三处业务点（read 快照 / open 跳转 / onunload 注销），演示协议 v2 的 `configSchema`（notebook + number 字段）、`refreshOn`、`sizes` 与条目级 `command`/块 ID/`href` 三种点击语义。
- `tests/widget-example-contract.test.cjs` — 契约测试，保证示例使用的字段、配置类型与点击前缀始终与生产协议白名单一致；模板漂移会在 CI 直接失败。
- `tests/widget-example-e2e.test.cjs` — 端到端运行时测试，把本模板当作真实第三方插件跑通生产 homeRuntime 链路（注册 → 设备清单 → 有界读取 → 视图构建 → 注销），并断言运行时 token 安全、幂等注销与快照缓存清除生命周期。

接入步骤：把 `example-module.js` 复制进你的插件 → 替换三处业务点 → `onload` 中调用 `registerExampleHomeModule(this.app.plugins.find((p) => p.name === "siyuan-speed-switch"), this)` → `onunload` 中调用返回的 `unregister()`。生命周期语义（失效恢复、热替换、注销句柄）见协议文档"生命周期与失效恢复"一节。
