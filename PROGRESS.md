# 进度

当前基线：`v0.16.38`（提交 `935a917`）。本地 `main`、GitHub `origin/main` 与 tag `v0.16.38` 已同步；当前工作树包含后续开发改动，正式发版继续后置。

当前状态：继续推进不依赖真实设备的 Agent、搜索兼容、状态恢复和自动化门禁；Android 真机回归由 T-022 跟踪，不以浏览器烟测替代。

已完成：

- 桌面端真实宿主验收、内核端点兼容修复和 stale-while-revalidate 韧性增强。
- 分层搜索、最近打开/关闭恢复、收藏、文档集、三端快捷入口、第二面板和 20 个内置组件。
- 10 项 Agent 能力：导航、搜索、组件快照、大纲、工作区上下文、单篇/批量打开及受控写操作。
- Agent `navigation-state` 新增有界 `closed` 最近关闭列表；`workspace-context` 同步提供 `closedTabs`，均为只读快照。
- Agent 导航与工作区快照现在以当前打开页签优先，自动排除同 rootId 的陈旧关闭记录，避免模型误判可恢复状态。
- 已记录 D-010：去重只发生在 Agent 输出边界，不修改持久化关闭历史，等待后续事件同步自然收敛。
- Agent 标题搜索复用兼容提取器，支持 `data.files`、`data.documents`、`result.records` 等旧宿主包装，避免合法标题结果被误判为空。
- 状态文档已统一到 v0.16.38，T-023 完成。

验证基线：`pnpm verify:release` 全绿，包含 TypeScript 检查、生产构建、532 项自动测试、移动端烟测和 Chromium 样式烟测；生产构建已生成 `package.zip`。

待处理：

1. T-022：Android 真机回归（需要用户设备与空闲时间）。
2. T-024：继续补 Agent/搜索兼容性增量；已完成跨来源历史去重和标题搜索包装兼容，后续继续处理取消/超时边界。
3. 用户明确确认后，才执行 push、打 tag、创建 Release 等正式发版动作。

关键经验：SiYuan 3.8.x 查询参数使用 `stmt`；`getTag/getBookmark` 返回裸数组；全文搜索空 `types` 表示不搜索任何类型；前端 Agent 能力只能经宿主内部 AI 通道分发；真实宿主验收不可由 mock 或浏览器模拟替代。
