# ADR 0144：发布门禁显式准备 Chromium 运行时

- 状态：已接受，已实施
- 日期：2026-10-05
- 任务：T-7121

## 背景

`verify:release` 包含 Chromium CSS、悬浮球和表面切换 smoke。开发机上的 Edge 或 Chrome 不能代表 GitHub Ubuntu runner 的运行环境，而 smoke 脚本只在固定系统路径或 `BROWSER_PATH` 中查找浏览器。发布 workflow 如果没有准备这个依赖，完整门禁会在云端因找不到浏览器失败。

## 决策

1. 发布 workflow 在依赖安装后执行 `pnpm exec playwright install --with-deps chromium`，由 Playwright 同时准备浏览器和 Linux 运行库。
2. 使用 Playwright 的 `chromium.executablePath()` 取得当前安装的实际可执行文件，检查它可执行后写入 `$GITHUB_ENV` 的 `BROWSER_PATH`。
3. 浏览器安装步骤必须位于 `verify:release` 之前，发布 workflow 继续只调用一次完整门禁；不把 smoke 拆成绕过环境准备的局部步骤。
4. 契约测试读取真实 workflow，验证安装命令、路径导出和步骤顺序；删除安装或路径导出后必须精确失败。

## 证据

- `tests/host/release-dry-run.test.cjs` 覆盖安装、可执行性检查、`BROWSER_PATH` 导出和门禁顺序。
- 本地负向验证分别删除 Chromium 安装命令与 `GITHUB_ENV` 导出，契约测试均命中对应断言；恢复后文件字节一致。
- 本地 `pnpm verify:release` 使用现有浏览器通过；云端实际 runner 执行仍以 GitHub Actions 结果为准。

## 边界

该步骤只提供浏览器 smoke 所需的 CI 运行时，不把 Chromium 证据写成真实思源桌面、最窄原生侧栏或 Android 真机验收；这些边界继续由 B-004/B-005 负责。
