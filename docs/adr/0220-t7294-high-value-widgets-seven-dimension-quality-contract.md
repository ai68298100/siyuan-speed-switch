# ADR 0220：8 大高价值核心小组件 7 维价值密度与端侧适配契约

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7294（Phase B 工作台价值密度收敛）
- 依据：[`docs/product-direction-2026-10-16.md`](../product-direction-2026-10-16.md) 阶段 B、[`docs/t7144-candidate-matrix-2026-10-16.md`](../t7144-candidate-matrix-2026-10-16.md)、ADR 0206/0207/0208

## 背景

在 Phase B 中，工作台生态与价值密度要求针对精选出的 5～8 个高频高价值组件进行二轮精修。根据规划定义，不能仅停留在静态样式或单一测试上，必须对每个核心组件建立 7 个维度的完整行为契约：
1. **默认内容 (Default Content)**：首开无空难，数据结构合法有界；
2. **配置前置 (Config Prerequisites)**：依赖、前置参数与默认值经过模式校验；
3. **可解释空态 (Empty State)**：零数据时不伪装成报错，必须带有清晰的空提示（`emptyHint`）；
4. **陈旧指示 (Stale Indicator)**：数据超时或后台不可达时保持展示旧现场，并附带 tooltip 与 `aria-describedby`；
5. **失败重试 (Failure & Retry)**：网络或读写失败时提供 `retryable` 元数据与强制刷新（`force: true`）绕过退避入口；
6. **点击语义 (Click Semantics)**：点击条目直接定位文档/块，点击操作触发受控动作；
7. **三端密度 (Three-Surface Density)**：在宽桌面（920px）、窄侧栏（245px）与手机端（<=560px 双拼 Bento）自适应布局。

候选矩阵已锁定的 8 大核心组件为：
- `bookmarks`（书签）
- `tags`（标签）
- `current-document-outline`（当前文档大纲）
- `note-stats`（笔记统计）
- `recent-edits`（近期编辑）
- `document-relations-summary`（文档关系摘要）
- `weather`（天气小组件）
- `today-tasks`（今日待办）

## 决策

1. **统一 7 维度断言规范 (Seven-Dimension Contract Specifications)**：
   为上述 8 大组件建立统一的自动化验证规范，要求在模型与适配层同时满足：
   - 零条目产生有界 snapshot，且 `empty` 布尔值与 `emptyHint` 文案存在；
   - 异常不抛出未捕获错误，网络型组件必须输出 `retryable: true`；
   - 块 ID / 根 ID 映射使用归一化安全字段（`id -> blockId -> blockID -> block_id`；`rootID -> rootId -> root_id`）；
   - 在窄屏或紧凑模式下满足高度与行预算，避免单卡挤占全局视口。

2. **跨端视觉与交互守卫 (Cross-Surface Invariants)**：
   - 宽桌面保持紧凑微信息条或混合拼贴（ADR 0202/0206）；
   - 窄侧栏（245px）中控件保持 24px～28px 可达，不发生横向文字截断或容器溢出；
   - 移动端（<=560px）遵循 2 列双拼 Bento（ADR 0217），微瓦片 50% 并排，列表卡 100% 展开。

## 证据与验证

- 定向契约测试：[`tests/high-value-widgets-seven-dimension-contract.test.cjs`](../../tests/high-value-widgets-seven-dimension-contract.test.cjs)；
- 负向违规注入：故意注入缺失 `emptyHint` 或破坏 `retryable` 标记，确保契约测试精确失败拦截并复绿；
- 门禁自查：全量测试套件通过；构建体积守在 578 KiB 仓库门禁之内；`release-readiness` 指标通过。
