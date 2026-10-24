# ADR 0267：T-7368 代码潜在 Bug 深度排查与边界隐患加固 (v0.48.10)

日期：2026-10-24  
状态：accepted  
任务：T-7368  

## 背景

用户指令专项排查与优化代码中的潜在 Bug 与边界隐患。在对近期引入的生态桥熔断器、事件总线、模式药丸栏及第三方插件调用的深度审计中，发现若干防御隐患：
1. `wrapEcosystemModuleRead` 在 Promise 正常提前完成时未在 `finally` 中显式清除 `timeoutPromise` 的定时器句柄，存在未决定时器导致事件循环悬挂和内存引用的隐患；同时 `cacheKey` 生成时缺少对非标准/循环引用对象的防御；
2. `setupSearchModeChips` 在模式药丸切换前缀时，未包含全角与半角冒号（`:` / `：`）大纲符号，导致从冒号大纲模式点选其他模式药丸时残留冒号前缀；同时缺少 W3C ARIA 推荐的标准 `Home` / `End` 首末快捷键导航；
3. `bindEcosystemEventSubscriptions` 在重新注册前未执行幂等清理，且广播刷新时单个监听器抛错可能会中断整个刷新链条；
4. 动作画板中思阅与思播专有调用此前直接读取硬编码属性名，未统一消费 `getBridgeSafely` 多别名容错解析。

## 决策

1. **800ms 熔断器定时器句柄显式清除与安全序列化**：
   - 在 `wrapEcosystemModuleRead` 结算后于 `finally` 块中严格执行 `clearTimeout(timer)`，杜绝事件循环定时器悬挂；
   - 增加 `try-catch` 保护 `JSON.stringify(config)`，在遭遇循环引用时安全降级为 `String(config)`；
2. **模式药丸栏符号剥离与 Home/End 键盘导航**：
   - 模式切换前缀正则扩展为 `/^[@^#!>?？》！:：]/`，全面覆盖半角与全角冒号；
   - 模式按钮 `keydown` 事件追加 `Home`（聚焦第 1 个药丸）与 `End`（聚焦最后 1 个药丸），达成标准的键盘工具栏（Roving Toolbar）体验；
3. **生态事件总线幂等绑定与单监听器隔离**：
   - `bindEcosystemEventSubscriptions` 注册前先调用 `this.unbindEcosystemEventSubscriptions()` 确保全局事件监听无冗余；
   - 广播刷新遍历 `homeModuleChangeListeners` 时，每个监听器调用均置于独立 `try-catch` 内，防止单个外部组件异常破坏整个工作台重绘；
4. **思阅与思播专有动作多别名兼容**：
   - 动作画板执行 `open-in-reader` 与 `open-in-media` 时统一调用 `getBridgeSafely("sireader")` 与 `getBridgeSafely("simedia")`，全面覆盖所有已登记别名；
5. **版本升级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.9` -> `0.48.10`，并在 GitHub 发布 Release `v0.48.10`，确保集市爬虫准时索引。

## 证据与验证

1. **定向契约测试**：`tests/bug-audit-and-robustness-contract.test.cjs` 5/5 通过；
2. **全量单测与审计**：9080+ 项测试全绿，四大批量审计全部 PASS。
