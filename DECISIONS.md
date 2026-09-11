# 决策

- D-001 fetchKernelJson 采用硬编码端点白名单而非通配 URL | 原因：防 SSRF（Mimosa 要求） | 影响：新增内核端点须手动登记（本轮新增 `/api/riff/getNotebookRiffDueCards`）
- D-002 组件面板尺寸型号固定 7 档而非自由像素 | 原因：用户要求 iPad 固定型号感 | 影响：无自由拖宽
- D-003 kernelPost 重命名为 fetchKernelJson 并加白名单而非删函数 | 原因：Mimosa 误判 SSRF 是因为函数名含 fetch + 变量 URL | 影响：无
- D-004 第三方组件元数据在 normalizeModuleDefinition 中全量保留 | 原因：并行会话修复了 sizes/description 被丢弃的 bug | 影响：home-model normalize 需覆盖全部 v2 字段
- D-005 收集箱组件不做 | 原因：/api/inbox/getShorthands 走云端 API，不符合本地优先 | 影响：无收集箱组件
- D-006 闪卡组件阻塞已解除 → 已实现 | 原因：原判断需要 deck 选择器，实际内核提供笔记本级 `/api/riff/getNotebookRiffDueCards`（只读、只读模式下可用），configSchema notebook 动态类型复用现有基础设施 | 影响：闪卡组件为只读展示，不做复习动作（写操作不进面板）
- D-007 版本号在发版时统一升位而非每轮递增 | 原因：0.16.33~36 均未发 Release，逐轮升版制造大量无发布版本号 | 影响：多轮特性可合并进一次发版日志；PROGRESS 记录待发版特性清单
