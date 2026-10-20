# ADR 0248：T-7355 今日待复习闪卡卡片装配与一键复习直达

日期：2026-10-20  
状态：accepted  
任务：T-7355  

## 背景

T-7337 建立了闪卡间隔重复复习模型（`flashcard-review-model.js`），支持基于 SuperMemo-2 算法推演每日队列、到期分布与掌握度统计。在第二面板中，用户需要直观看到今日待复习卡片数量，并能一键进入思源原生复习界面。

## 决策

1. **闪卡复习小组件装配（`src/index.ts`）**：
   - 注册 `"flashcard-review"` 模块（`moduleId: "flashcard-review"`）；
   - 请求端点复用白名单只读端点 `/api/riff/getNotebookRiffDueCards`（全局场景并发聚合多笔记本，限定场景按 notebookId 过滤），遵循内核 API 契约；
   - 调用 `buildFlashcardReviewSnapshot` 产出包含今日队列、到期数量与掌握度的标准快照；
2. **一键复习动作协议闭环（`action:riffCard`）**：
   - 快照首项输出固定协议 `value: "action:riffCard"`；
   - 工作台点击分发器 `handleHomeItemAction` 捕获 `action:riffCard` 后，关闭工作台并调用全局快速动作 `global-riff-card`，直接打开思源闪卡复习浮层；
3. **只读本地推演**：
   - 仅对到期卡片在前端推演 SM-2 调度，不改动思源内核真实闪卡掌握因子，杜绝状态副作用。

## 证据与验证

1. **定向测试**：`tests/av-board-and-flashcard-wiring.test.cjs` 包含闪卡快照构建、`action:riffCard` 动作协议与 `handleHomeItemAction` 分发断言并通过；
2. **负向注入验证**：伪造错误动作协议探测，断言精准拦截；还原后复绿；
3. **全量通过**：`pnpm exec tsc --noEmit` 0 错误。
