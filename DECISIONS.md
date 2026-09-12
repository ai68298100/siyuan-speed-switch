# 决策

- D-001 fetchKernelJson 采用硬编码端点白名单而非通配 URL | 原因：防 SSRF（Mimosa 要求） | 影响：新增内核端点须手动登记（本轮新增 `/api/riff/getNotebookRiffDueCards`）
- D-002 组件面板尺寸型号固定 7 档而非自由像素 | 原因：用户要求 iPad 固定型号感 | 影响：无自由拖宽
- D-003 kernelPost 重命名为 fetchKernelJson 并加白名单而非删函数 | 原因：Mimosa 误判 SSRF 是因为函数名含 fetch + 变量 URL | 影响：无
- D-004 第三方组件元数据在 normalizeModuleDefinition 中全量保留 | 原因：并行会话修复了 sizes/description 被丢弃的 bug | 影响：home-model normalize 需覆盖全部 v2 字段
- D-005 收集箱组件不做 | 原因：/api/inbox/getShorthands 走云端 API，不符合本地优先 | 影响：无收集箱组件
- D-006 闪卡组件阻塞已解除 → 已实现 | 原因：原判断需要 deck 选择器，实际内核提供笔记本级 `/api/riff/getNotebookRiffDueCards`（只读、只读模式下可用），configSchema notebook 动态类型复用现有基础设施 | 影响：闪卡组件为只读展示，不做复习动作（写操作不进面板）
- D-007 版本号在发版时统一升位而非每轮递增 | 原因：0.16.33~36 均未发 Release，逐轮升版制造大量无发布版本号 | 影响：多轮特性可合并进一次发版日志；PROGRESS 记录待发版特性清单
- D-008 raw bundle 预算作为自律信号而非硬上限 | 原因：包体随真实功能增长，gzip 后远低于 300KiB zip 上限；预算测试带日期注释校准（296→299→304 KiB）| 影响：每次校准须注明当轮增量与理由
- D-009 navigation-state 增加 closed 最近关闭列表 | 原因：Agent 读取工作区时需要知道可恢复内容，且关闭记录已有稳定 rootId/时间戳数据层 | 影响：输出保持有界只读；恢复仍必须调用受控 open-document 能力，不在导航快照中执行写操作
- D-010 Agent 历史快照按当前打开页签优先去重 | 原因：关闭事件与重新打开事件可能跨刷新周期到达，短时间内同一 rootId 会同时出现在两侧 | 影响：`closed`/`closedTabs` 仅保留当前未打开的记录，底层持久化历史不被静默改写
- D-011 标题搜索沿用共享结果提取器 | 原因：SiYuan 及兼容宿主可能将文档数组包装在 `data.files`、`documents` 或 `docs` 中 | 影响：提取器保持有界且只接受已知数组字段，不递归未知对象，避免误收块数据或扩大搜索范围
- D-012 第三方插件仅借鉴公开功能与数据边界，不复制实现代码；不读取第三方私有 storage。天气、任意 JS/SQL、完整关系图、完整资产管理暂不内置。
- D-013 新增 `recent-writing-activity` 与 `recent-daily-notes` 作为本地优先只读组件：前者统计创建内容块而非文档，后者只探测已存在日期文档，均不自动创建日记。
- D-014 环境核验后采用“本地自动门禁持续开发、Android 真机单独验收”的路线；无 `adb`/Java 时不以浏览器模拟替代真实设备，也不阻塞不依赖设备的功能开发。
- D-015 文档关系组件采用保守 SQL 口径：直接子块使用 `parent_id/root_id`，引用使用受限 `markdown LIKE`；只返回少量可打开 ID，不引入重量级图布局或未确认的关系 API。
- D-016 新增三个本地只读组件后生产 bundle 从 312 KiB 预算增至 313 KiB；仍低于 package.zip 300 KiB 硬上限与现有构建警告阈值，保留门禁并记录增量原因。
