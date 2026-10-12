# ADR 0175：提供方接入文档与可选家族入口边界

日期：2026-10-13  
状态：已接受（T-7146）

## 背景

组件提供方文档已经覆盖注册、读取和卸载，但复制示例与当前 API 出现了可执行层面的漂移：宿主现在返回函数式注销句柄，部分示例仍按对象调用；面板配置表单最多 12 个字段，而 Agent 只读投影最多 8 个字段，旧文档把两者混成一个上限；运行时向 `read` 传递第三参 `{size, signal}`，公开 TypeScript 签名却没有表达它。普通用户还缺少一张表来判断小驴打卡、剪藏、Calendar、人脉、拾遗和 Task Horizon 的真实前置与未承诺边界。

## 决策

- 以 `registerHomeModule()` 当前返回的幂等函数作为规范示例；文档可额外说明旧宿主对象句柄的兼容归一化，但不得把对象写成默认 API。
- 将面板配置和 Agent 只读投影明确拆开：面板最多 12 字段；Agent 最多投影 8 字段；协议文档列出当前生产接受的 11 种配置类型，并保留各字段的清洗边界。
- 导出 `HomeModuleReadOptions`，让第三参的尺寸提示和取消信号成为公开 TypeScript 合同；提供方是否实际支持取消由其自身请求层决定。
- 家族入口只写已在本仓库有桥接或协议证据的事实。人脉、拾遗和 Task Horizon 继续标为待核验/依赖配套插件与设备，不以目录登记、受控响应或旧版本记录冒充当前已接入。
- 将用户与作者说明集中放在 `docs/provider-integration-guide-2026-10-06.md`，避免修改会进入归档的 `docs/component-store-guide.md` 或额外 README 文本；当前发布归档仅剩约 37 bytes 余量。

## 验证

- `pnpm exec tsc --noEmit` 通过。
- `tests/widget-example-e2e.test.cjs`、`tests/home-protocol-v2.test.cjs` 与 `tests/current-status-index.test.cjs` 定向 **16/16** 通过。
- `release:check`、`current-status:audit` 与 `git diff --check` 通过；没有新增入包资源。
- 真实外部 provider、Android、最窄原生侧栏和账号状态仍按 `BLOCKERS.md` 后置，不由文档或浏览器夹具替代。
