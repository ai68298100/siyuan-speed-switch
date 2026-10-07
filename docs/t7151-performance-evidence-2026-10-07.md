# T-7151～T-7153 性能与资源趋势核对

日期：2026-10-07。本文只记录当前工作区已有的性能基准、一次真实思源内核试跑和证据缺口；不把浏览器夹具或纯函数基准当成 Android、发布版或两小时资源稳定性证明。

## 当前任务定义

任务定义来自 `docs/dev-plan-2026-10-06.md` 与 `docs/current-status-index.json`：

| 任务 | 目标 | 当前状态 | 依赖 |
| --- | --- | --- | --- |
| T-7151 | 扩展真实端到端首开、输入过滤、选择激活和慢/失败样本；冷/热与宿主可支持页签上限（当前 32）要有 p50/p95 和环境记录，100/500 另作为文档搜索规模 | completed；首开、过滤、激活和 32 页签上限均有独立真实内核样本，慢/失败保留受控回执样本 | T-7131 |
| T-7152 | 只根据 T-7151 profile 优化一个已证实的热点 | completed；纯函数与复杂度基准在预算内，E2E 尾延迟不能归因出生产热点，按条件任务销号 | T-7151 |
| T-7153 | 真实持续会话中的监听器、timer、请求、缓存、DOM/内存趋势 | planned；已补浏览器 probe 契约和 Playwright 接线，但尚未运行真实持续会话采样 | T-7151 |

## 已有基准和证据

### 真实内核首开

入口是 `tests/e2e/first-open.spec.mjs`，由 `playwright.e2e.config.mjs` 启动独立工作区、真实 SiYuan Kernel、打包后的插件，并在页面内用 `performance.now()` 计时。当前首开用 1 次冷启动 + 20 次热启动，只有不少于 20 个样本才计算 p95，首开测试的门限是热启动 p50 ≤ 300ms。

2026-10-07 本次试跑（SiYuan 3.8.6、插件 v0.44.1、127.0.0.1:6837）结果：

```text
coldMs=327
warm sampleCount=20, p50=44ms, p95=50ms, min=36ms, max=50ms
```

首开测试通过。原始结果在 `.artifacts/t7151-probe/results.json`，不是 Android 或最终原生侧栏证据。

### 搜索交互端到端

同一 spec 目前创建 2 个临时文档，测量输入过滤、选择激活、受控 250ms 慢响应和 503 失败回执。样本汇总函数会在样本不足 20 时把 p95 置空，这一点是正确的；当前夹具的过滤、激活、慢响应和失败样本都不足以宣称 p95。

首次试跑曾因关闭临时页签时选择器抓到隐藏/已卸载按钮而超时，重试时内核退出并报 `ECONNREFUSED`。随后将清理动作限定为当前文档对应的可见卡片和可见关闭按钮，并重新执行当前版本，结果为：

```text
filter: sampleCount=2, p50=320ms, p95=null, min=280ms, max=320ms
activation: sampleCount=1, p50=271ms, p95=null
controlledRemote: slowMs=1119, failedMs=339, sampleCount=1, p95=null
```

该次真实内核测试通过，环境为 SiYuan 3.8.6、插件 v0.44.1、Chromium/Playwright 单 worker；结果说明清理竞态已暂时解除，但不构成 100/500 页签规模或稳定 p95 证据。失败原始产物仍在 `.artifacts/t7151-probe/test-results/`，通过试跑的产物在 `.artifacts/t7151-pass/`。

### 最新无重试复跑

使用 `--retries=0` 再次重跑同一 spec，2/2 通过：首开 cold **157ms**，warm 20 次 p50 **22ms**、p95 **29ms**；过滤 2 样本 p50 **346ms**、激活 1 样本 p50 **273ms**，受控慢/失败 **976ms/319ms**。过滤与激活样本仍不足 20，因此没有输出 p95；这次复跑也没有改变 100/500 页签缺口。

### 隔离桌面 32 页签真实 UI 基准

2026-10-07 使用背景编排器运行 `tests/e2e/t7151-scale.spec.mjs`，环境为 SiYuan 3.8.6、插件 v0.44.1、Chromium/Playwright 单 worker；工作区和端口由编排器独立分配，个人内核端口 `6806` 未使用。测试创建 32 篇临时文档，逐篇通过切换器搜索、点击和编辑器加载打开，并独立计时过滤与激活。

```text
run=20261007112850-7332-4e7505
port=6837
maxOpenTabCount=32
final cards=32, fixtureCards=32, protyleTitles=32
sampleCount=32, p50=1815ms, p95=2536ms, min=1187ms, max=2562ms
filter sampleCount=32, p50=376ms, p95=496ms, min=239ms, max=628ms
activation sampleCount=32, p50=358ms, p95=526ms, min=245ms, max=563ms
pageErrors=0
```

每次采样的页签卡片数均未超过 32，最终 32 篇夹具文档均存在真实页签卡片和编辑器标题；测试结束恢复原 `maxOpenTabCount` 并删除临时笔记本。完整结构化结果保存在 `.artifacts/e2e-background/20261007112850-7332-4e7505/artifacts/t7151-scale-32/results.json`。这证明了桌面 32 页签连续打开、过滤和激活的 UI 路径及宿主上限；p95 含真实宿主等待、浏览器协议往返和当前机器环境，不构成 Android、主题或最窄原生侧栏证据。

### 现有纯函数性能门禁

以下测试可重复通过，但它们回答的是算法成本和复杂度问题，不是首开或资源泄漏问题：

- `tests/search-filter-perf.test.cjs`：300 个合成页签，关键词、空查询和文档范围过滤；本次定向运行全部通过，关键词 CPU 均值 0.8575ms，空查询均值 1.1300ms，文档范围均值 0.4700ms。
- `tests/search-orchestration-perf.test.cjs`：受限 6 请求扇出、120 条合并、1200 条命中/300 根文档聚合；本次大库聚合 best-of-3 CPU 均值 8.7250ms、p95 16ms，低于 40ms 病理线。
- `tests/perf-complexity-gate.test.cjs`：排序、收藏清洗、缓存键、分页和聚合的倍增门；本次聚合 600→1200 命中比 1.90×，其余门禁通过。
- `tests/tab-pipeline-perf.test.cjs`：300 页签排序/分组管线；本次通过。

以上基准已有门禁和负向验证，适合检测算法回退；目前没有把真实 E2E 的 p50/p95 结果自动归档成稳定的历史趋势表。

## 关键缺口

### 隔离规模探针启动前检查

已用 `pnpm run test:e2e:background -- --count 1 --dry-run --remove-workspaces` 生成一轮计划，确认规模测试会使用带 `swss-e2e.json` 保护的临时工作区、独占端口租约、独立产物目录和固定 dist 快照。该 dry-run 不启动内核、不发送 API 请求，也没有创建或删除笔记本；真实探针仍必须在启动后核实端口监听者属于本轮内核进程，再执行任何写请求。详见 T-7196。

1. **T-7151 规模与主路径证据已闭合**：隔离桌面 32 页签连续打开、输入过滤和结果激活均有 32 个有效样本，综合打开 p95 2536ms、过滤 p95 496ms、激活 p95 526ms；慢/失败仍是受控单样本回执，按样本不足规则不输出 p95。不得把 100/500 篇文档、搜索结果或合成 DOM 记成 100/500 页签。决策见 ADR 0149。
2. **`release-readiness-metrics.cjs` 不是性能指标采集器**：它只解析 `dist/index.js`、`package.zip` 等包体快照和预算，不能读取首开或搜索 E2E 输出。
3. **T-7152 已按条件销号**：纯函数和复杂度基准在既有预算内；E2E p95 包含真实宿主等待、浏览器协议往返和当前机器环境，没有可归因的生产热点，因此没有修改装配、过滤、缩略图或布局。
4. **T-7153 的真实趋势证据仍缺**：本轮已增加 `tests/resource-trend-probe.browser.js`、`tests/e2e/resource-trend.cjs` 和 `tests/resource-trend-probe.test.cjs`，可在页面安装后采集观察到的 listener、timer、RAF、fetch、DOM 和可用的 `performance.memory`，并明确安装前活动与不可用 memory 的边界；当前只有 2/2 jsdom 契约通过，尚未采集真实思源持续会话，也没有反复打开搜索/切面板/商店预览/provider 卸载重试的 2 小时等价压力。
5. **现有 E2E 结果与纯函数结果应分层报告**：浏览器真实内核可以说明桌面 Chromium 下的行为；它不能替代 Android 真机、最窄原生侧栏、主题/读屏或发布包安装后的证据。

## 建议续跑顺序

1. 按现有隔离边界定期复跑 `tests/e2e/first-open.spec.mjs` 与 32 页签基准，保留 trace、截图和内核日志。
2. 继续把 E2E 报告输出为结构化 JSON；样本数不足时继续输出 `p95: null`。
3. 运行 T-7153 的真实持续会话基准：在页面导航前安装 probe，执行固定的开关切换器、搜索、切面板、商店预览、provider 卸载/重试动作序列，周期保存 listener/timer/request/DOM/可用内存快照；先用浏览器证据定位持续增长，再安排真实宿主复核。
