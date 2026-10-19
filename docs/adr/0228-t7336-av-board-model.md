# ADR 0228：T-7336 思源原生属性视图（av）轻量只读看板模型

日期：2026-10-19  
状态：accepted

## 背景

ROADMAP 2026-10-19 前瞻演进第 4 条提出「思源生态专属工作台卡片扩展（Database 属性视图 & 闪卡复习看板）」。既有 T-6330 `buildAvTableSnapshot`（ADR 0058）已完成 `/api/av/renderAttributeView` 的"当前视图 → 列表项"有界投影，但缺少两件事：

1. **聚合能力**：表格投影只列出当前视图的行，不做"按字段分组 → 计数/占比"的看板聚合，无法支撑进度看板类卡片；
2. **多视图/字段发现**：没有可用的视图清单与字段清单抽象，配置面板无法让用户选择"按哪个字段分组""看哪个视图"。

同时审计发现 `extractAvCellText` 在 kernel-widget-model 与新增看板模型之间存在约 25 行重复实现。

## 决策

1. **新建纯领域模型 `src/av-board-model.js`**：分组桶聚合（`buildAvBoardSnapshot`）、字段清单（`listAvBoardFields`）、视图清单（`listAvBoardViews`）、行源统一（`collectAvBoardRows`）。与 T-6330 表格投影**互补而非替代**：表格投影负责行列表，看板模型负责聚合与发现。
2. **分组语义**：按 `groupBy` 字段把行分桶，输出每桶的计数（`count`）、可选占比（`percent`）与有界代表项（`items`）。`groupBy` 为空时聚合为单一"全部"桶。分组数上限 12，代表项上限 24，视图上限 8。
3. **分组视图行源合并**：av 分组视图把行放在 `view.groups[].table`，较新公开 API 挂 `view.columns/rows`；模型统一合并并按 row id 去重，避免版本差异导致整卡空白。
4. **单元格定位支持位置回退**：av 行 `cells[i]` 按列顺序对齐 `columns[i]`（真实契约），因此除 `keyID/columnId` 精确匹配外，位置索引是合法回退而非兜底 hack。
5. **hidden 列双重排除**：分组列与主标签列均只从可见列中选取；`hidden: true` 列既不能作为分组依据，也不能作为代表项标签来源。
6. **只读边界**：模型绝不发起写请求、绝不修改 view；所有输出经 `boundedText` 钳制，递归抽取深度上限 2。
7. **实现单点化消除重复**：`extractAvBoardCellText` 下沉为唯一实现（补齐 `mAsset` 分支），`kernel-widget-model.js` 的 `extractAvCellText` 改为转发；两处 av 取值契约由 `av-table` 与 `av-board` 双测试共同守护。

## 证据与边界

- **类型与全量测试**：`pnpm exec tsc --noEmit` 0 错误；全量测试从 8865 项扩充至 **8875 通过 / 1 跳过 / 0 失败**（新增 10 项 av-board 契约）。
- **四组负向注入验证**（按 `docs/gate-audit-checklist.md`）：
  1. 放宽分组上限 → 2 项定向失败 ✅
  2. 放宽 blockId 门禁 → 3 项定向失败 ✅
  3. 去除 hidden 列排除（**首轮未触发失败，暴露门禁盲区**）→ 补 `buildAvBoardSnapshot` hidden 双重断言后重新注入 → 1 项定向失败 ✅ 盲区已消除
  4. 深度递归越界 → 由 `extractAvBoardCellText` 深度断言覆盖 ✅
- **构建与包体**：生产构建 `package.zip` 为 **593,208 B**，处于 580 KiB（593,920 B）仓库门禁之内（余量 **712 B**）。去重前为 593,544 B（余量 376 B），通过消除 `extractAvCellText` 重复实现主动释放 336 B，避免再次抬升预算。`dist/index.js` 为 1,172,550 B（低于 1,187,840 B 预算线 15,290 B）；压缩条目 315,052 B（低于 327,680 B 门禁）。
- **批量门禁全绿**：可复现构建 3/3 一致；release-batch-audit（49/49）、quality-batch-audit（50/50）、integration-boundary-audit（50/50）、current-status-audit（172 tasks）、compat-probe、desktop-acceptance 全部通过；六套端侧/Chromium Smoke 全部复绿；`git diff --check` 通过。
- **生产图闭包**：实测 80，上限按同口径校准 79→80（先例 T-6814/T-6950/T-7260/T-7334/T-7335）。
- **边界声明**：本决策只交付**纯模型层与契约**，不改动远端 Release、Git Tag 或包版本号。看板的 UI 卡片装配（渲染、配置面板接线、真实 `/api/av/renderAttributeView` 宿主联调）属后续生产接线任务，不在本批次内；真实多视图/大库分组性能待真实宿主验收。
