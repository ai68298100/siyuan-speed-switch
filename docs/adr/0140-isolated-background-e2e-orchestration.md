# ADR 0140：多插件隔离后台 E2E 编排

- 状态：已接受，已实施
- 日期：2026-10-05
- 任务：T-7112

## 决策

每个插件的真实思源 E2E 使用独立的工作区、端口和产物目录，并由独立的思源内核进程运行。测试前先完成一次构建并复制固定产物快照；E2E 期间禁止并发改写共享 dist/。每个实例使用独立日志、结果、截图和 trace，结束时通过内核退出接口和超时强制清理。

## 原因

当前 E2E 已支持 SWSS_E2E_WORKSPACE、SWSS_E2E_PORT 和 SWSS_E2E_ARTIFACT_DIR，工作区还必须带有安全标记文件，因此多个插件可以并行测试。端口、工作区或产物目录复用会造成内核锁、插件数据污染、报告覆盖或安装包竞态，不能依靠人工约定长期规避。

## 边界

独立实例不能隔离 CPU、内存、浏览器进程、网络出口、外部 API 限流和同一内核安装目录；在线测试仍需分别控制频率。此方案也不把 Chromium 仿真当作 Android 真机证据。

## 验收

- 两个或更多实例可同时启动，端口、工作区、插件数据和产物互不覆盖。
- 任一实例失败或超时都能清理自己的内核与浏览器进程，并保留独立日志。
- 共享构建快照的哈希一致；测试运行期间改写 dist/ 能被拒绝或明确报告。

## 实施与证据

- `scripts/e2e/background-orchestrator.mjs` 提供任务配置、端口租约、构建快照、独立工作区/产物目录、超时和 PID 树清理；`pnpm run test:e2e:background` 为入口。
- `scripts/e2e/lib.mjs`、`tests/e2e/global-setup.mjs` 支持从 `SWSS_E2E_PLUGIN_SOURCE` 固定快照安装，并记录内核 PID；Windows PowerShell-only 环境通过 Corepack `pnpm.js` 启动。
- 编排器契约 **4/4**；快照被修改时精确失败，端口租约重复占用和释放均有测试。
- 真实思源双实例：`speed-switch-a@19300` 与 `speed-switch-b@19301` 并行执行桌面 smoke，均退出码 0；共享快照 SHA-256 为 `4f39ef6fa20f7e136c7f44729d627c4fd69f8aaef217891c6269ce70b8934d93`，独立结果见 `.artifacts/t7112-background/20261004180200-17436-e43ae9`。

## 使用

```powershell
pnpm run test:e2e:background -- --count 2 --remove-workspaces
pnpm run test:e2e:background -- --jobs-file .tmp/t7112-jobs.json --remove-workspaces
```

`jobs` 中每项可指定 `id`、`repoRoot`、`distDir`、`pluginName`、`command` 和 `env`。编排器会把 `SWSS_E2E_WORKSPACE`、`SWSS_E2E_PORT`、`SWSS_E2E_ARTIFACT_DIR`、`SWSS_E2E_PLUGIN_SOURCE` 和实例标识注入该命令。实例之间的数据和端口隔离，但 CPU、内存、浏览器进程、网络出口及外部 API 限流仍是共享资源。
