# ADR 0263：T-7364 命令模式全生态插件动作接入与 v0.48.6 发版

日期：2026-10-23  
状态：accepted  
任务：T-7364  

## 背景

依小驴快门中枢统领指令（`ECOSYSTEM-INTEGRATION-DIRECTIVE.md`）要求，切换器命令模式（`>`）应能完整读取思源命令注册表中的快门及其他生态插件命令，并持续以确定性小版本递增正式发布 Release 供集市索引。

## 决策

1. **命令模式插件动作发现（Ecosystem & Plugin Commands Discovery）**：
   - 在 `src/index.ts` 的 `renderCommandList` 中，调用 `this.getPluginCommands()` 动态检索思源宿主中所有已安装并启用的插件命令；
   - 过滤用户输入 `q` 并生成第 3 个独立折叠组：`{key: "plugins", label: this.i18n.commandGroupPlugins, actions}`；
   - 单击或回车即可调用 `this.executeQuickAction`，通过 `createFloatingBallActionExecutor` 的 `invokeCommand` 调度在思源客户端内安全执行对应插件命令；
2. **多语言词条对齐**：
   - 在 `src/i18n/zh-CN.json` 与 `src/i18n/en.json` 中统一注入 `commandGroupPlugins`；
3. **版本晋级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.5` -> `0.48.6`，并在 GitHub 发布 Release `v0.48.6`，确保集市爬虫准时索引。

## 证据与验证

1. **定向测试**：`tests/command-palette-ecosystem-contract.test.cjs` 4/4 通过；
2. **全量单测与审计**：9060+ 项测试全绿，四大批量审计全部 PASS。
