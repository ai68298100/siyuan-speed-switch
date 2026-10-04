# ADR 0142：思源 3.8.x 响应形状与插件生命周期兼容探针

- 状态：已接受，已实施
- 日期：2026-10-05
- 任务：T-7114

## 背景

标题搜索和路径筛选已经分别处理了思源原生记录的字段差异，但版本证据分散在历史文档、模型测试和真实 E2E 中。缺少统一探针时，新增响应字段、路径记录缺少 `id`、或插件卸载没有清理公开钩子，都可能只在宿主里晚发现。

## 决策

1. 用 `tests/fixtures/siyuan-compatibility-probes.json` 保存 3.8.4-beta.2 与 3.8.6 的最小响应形状、关键别名和生命周期要求。
2. `scripts/siyuan-compatibility-probe.cjs` 直接调用现有 `normalizeTitleSearchDocuments` 与 `normalizePathFilterListResponse`，并读取生产 `src/index.ts` 校验 `onload`、`onLayoutReady`、`onunload` 和公开钩子清理；探针接入 `verify:release`。
3. 真实宿主使用独立工作区和端口运行 `tests/e2e/compatibility-probe.spec.mjs`，记录原始字段和卸载后的状态。版本差异写入证据，不为每个小版本增加生产分支。

## 证据

- 纯探针输出：2 个版本形状、2 个别名用例、5 个生命周期断言通过。
- 定向回归：兼容探针、路径筛选、标题搜索和搜索模型共 **113/113**。
- 负向验证：移除标题记录安全路径、移除卸载公开钩子清理，分别精确触发对应断言；生产文件字节未改写。
- 真实思源 3.8.6 隔离 E2E：**1/1**；原始标题记录字段为 `alias/box/boxIcon/hPath/name/path`，路径响应为 `data.box/path/files`，卸载后 `whenReady` 不存在且主题/密度标记清理。产物见 `.artifacts/t7114-compatibility/compatibility-probe.json`。
- 3.8.4-beta.2 路径端点真实只读证据沿用 `docs/path-filter-host-evidence.md`。

## 边界

3.8.4 的标题搜索原始抓包没有在历史取证中保留，因此夹具只记录归一化所需的最小路径形状，不把它写成新的真实宿主抓包。真实 Android、最窄原生侧栏和外部 provider 继续按 B-004、B-005、B-007～B-011 验收。
