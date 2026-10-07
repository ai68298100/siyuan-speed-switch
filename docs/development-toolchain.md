# 开发工具链与持续集成

T-7130 / T-7131，2026-10-06。本说明只约束插件的开发、测试和打包环境；思源宿主兼容边界仍由 `plugin.json` 的 `minAppVersion` 定义。

## 支持的 Node 与 pnpm

`package.json` 声明 Node `^22.22.2 || ^24.15.0 || >=26.0.0`：Node 22 至少 22.22.2，Node 24 至少 24.15.0，或 Node 26 及以上。Node 18、20、23、25，以及低于上述补丁下限的 Node 22/24，不属于本仓支持的开发环境。

这个范围来自当前锁定的 `jsdom@30.1.1`，并与全部已安装的直接开发依赖取交集核对；其中 `sass-loader@17.0.1` 要求 Node >=22.11.0。之前的 Node >=18 声明会让不兼容环境被误认为可用。本次保留现有依赖和锁文件，不通过降级 DOM/Sass 工具绕过环境要求。

pnpm 版本由 `package.json` 的 `packageManager` 固定为 `pnpm@12.5.1`。准备环境后先检查版本，再按锁文件安装：

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
node --test tests/host/development-toolchain.test.cjs
pnpm exec tsc --noEmit
```

专属测试读取实际 workflow 的事件、任务与 setup-node 步骤作用域，检查范围边界、全体直接依赖的真实 engines，并实际启动 JSDOM 和编译一段 Sass。它使用 Webpack 已锁定的 semver 实现；不新增 YAML/semver 依赖，也不把注释里的配置当作有效声明。

升级开发依赖时，需要重新核对支持范围与实际运行结果；更宽的范围不能仅凭安装成功宣称兼容。最低支持版和 CI 主版本的实运行证据分别记录，配置检查不替代多版本实测。

## CI 覆盖

截至本轮只读仓库查询，GitHub 默认开发分支为 `dev/thispc-1002`。CI 对 `main`、`master`、`dev/thispc-1002` 的 push 及 pull request 触发；保留原有只读权限、并发取消和类型检查/可复现构建/完整测试/基础 smoke 流程。

CI 与 Release 都选择完整版本 `24.15.0`，它属于声明范围且与本机已验证主版本一致。开发机也可以使用满足声明的 Node 22 或 Node 26+；CI 的单一主版本不是额外缩小 `engines` 的依据。

Release 继续只由 `v*` 标签触发，保留统一发布门禁、Chromium 准备、版本预检与包完整性检查。本轮不修改远端默认分支、不推送、不建 tag、不发版。

## 证据边界与门禁自查

- 基线：新增专属测试在旧配置上发现开发分支漏触发、Node 范围过宽以及 workflow 仅声明主版本。
- 契约取数来自真实 JSON、workflow 作用域和已安装依赖，不由测试自造配置；分支与版本检查均检查非空且唯一的目标。
- 按 `docs/gate-audit-checklist.md` 对删除开发分支、放宽 engines、设置不兼容 Node 做负向注入。每次只修改目标声明，恢复后校验文件 SHA-256，保留失败断言与日志。
- 本地绿色仅说明配置契约及选定 Node 的本地工具链可运行。云端触发、GitHub runner 安装、完整门禁耗时与成功结果需在获得推送/发版授权后由实际 Actions run 补证，不能把原默认分支的 0 runs 写成已修复后的云端成功。
