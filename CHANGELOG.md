# 小驴雷切（Lv Speed Switch）更新日志

完整中英文版本更新历史请参阅：
- 中文完整日志：[docs/CHANGELOG.md](docs/CHANGELOG.md)
- 英文完整日志：[docs/CHANGELOG.en-US.md](docs/CHANGELOG.en-US.md)

---

### v0.48.2 (2026-10-22)
- **顶栏点击秒开与大长文档首屏浅克隆**：彻底废除 `wysiwyg.cloneNode(true)` 全文深拷贝，改用 `cloneNode(false)` + 仅深拷贝首屏前 6 个子块，克隆时间恒定在 0.1ms；桌面端弹窗配置 `disableAnimation: true` 消除 50ms 延时停顿，点击顶栏瞬间秒出。
- **消除全卡片二次搬迁与强制同步 Reflow**：重构 `renderList` 流式装配，直接装入 `contentHost` 容器，消除了旧代码在挂载后又拔插所有卡片的二次循环（`while (scrollElement.firstChild)`）与 `clientWidth` 引起的强制重排。
- **微任务分层调度与 Petal Lifecycle / URL Scheme 闭环**：清理缩略图孤儿缓存（`pruneThumbCache`）与零词条工作台（`renderWorkbench`）以异步微任务挂载；补齐官方 `uninstall()` 钩子，`addTopBar` 注入稳定唯一 ID，`onunload` 注销顶栏；接入 `open-siyuan-url-plugin` 外部协议路由。
