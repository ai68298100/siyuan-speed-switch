# ADR 0151：T-7153 provider 缓存计数与清理代次

- 日期：2026-10-08
- 状态：已采纳
- 任务：T-7201

## 背景

资源趋势需要确认 provider 卸载后缓存和 pending 读取是否归零，但不能把缓存 key、配置或条目内容带出生产模块。原有全局清理会直接清空 generation 表；若旧 pending 读取随后完成，generation 可能与清理后的新读取重用，迟到结果有机会写入新缓存。

## 决策

1. `getHomeAdapterResourceStats()` 只返回各类运行时 Map 的数量，不返回 key、snapshot 或 provider payload。
2. `clearHomeSnapshotCache()` 清理快照和退避，同时为仍在进行的读取推进 generation 并保留 in-flight；旧回包必须返回 `stale`。没有 pending 读取的代次表直接清理。
3. provider 卸载继续清理模块前缀状态；读取完成后仅在没有更新代次的情况下移除 generation tombstone，避免覆盖同 key 的新读取。

## 后果

隔离 E2E 可以观测缓存是否持续增长并验证公开 provider 的卸载/重试；统计边界不会暴露内容。该决策仍不等价于全插件 heap 无泄漏，也不主动 abort provider 自身无法取消的底层 Promise。
