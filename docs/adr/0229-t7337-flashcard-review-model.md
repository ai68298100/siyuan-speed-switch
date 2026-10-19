# ADR 0229：T-7337 闪卡间隔重复复习纯领域模型与档案预算微调

日期：2026-10-19  
状态：accepted

## 背景

ROADMAP 2026-10-19 前瞻演进第 4 条后半提出「思源生态专属工作台卡片扩展（闪卡复习看板）」。既有 T-6409~T-6416 `buildFlashcardDueSnapshot`（`flashcard-due` 组件）已完成 `/api/riff/getNotebookRiffDueCards` 的"当前到期数量/列表投影"，但只回答"现在有多少张待复习"，缺少：
1. **间隔重复调度推演**：用户在完成卡片复习时，缺乏 SM-2（SuperMemo 2）算法支持的下次排期间隔推演与掌握度判定；
2. **每日复习队列**：大量到期卡片缺乏按每日上限平摊到未来日期桶的队列切片；
3. **掌握度分层进度**：没有未学习、新学（young）与已掌握（mature）的分层统计与百分比看板。

同时，在 T-7334（路径首字母）、T-7335（次级动作画板）、T-7336（av 看板）与 T-7337（闪卡复习）四个纯领域模型连续入图后，工作树 `package.zip` 达到 594,381 B，超出 ADR 0227 校准的 580 KiB（593,920 B）硬上限 461 B。

## 决策

1. **新建纯领域模型 `src/flashcard-review-model.js`**：
   - SM-2 调度推演（`scheduleSm2Review`）：严格实现标准 SuperMemo 2 状态机；评分 <3 清零连续次数并重置间隔为 1 天；评分 >=3 递进（1 天 → 6 天 → interval * ease）；ease 钳制在 [1.3, 2.5]；最大间隔上限 365 天；
   - 每日复习队列（`buildDailyReviewQueue`）：按每日上限（`dailyLimit`，默认 20）将到期卡片切片到未来日期桶，超出预测天数（`horizonDays`，默认 14）的卡片计入 `remaining`，绝不静默丢弃；
   - 掌握度分层（`buildMasteryProgress`）：按复习间隔与连续次数将卡片分层为 learning / young / mature，并安全计算各层百分比（空列表百分比保底为 0，杜绝 NaN）；
   - 进度看板快照（`buildFlashcardReviewSnapshot`）：首项挂载 `action:riffCard` 动作（UI 契约），其后组合预测桶与掌握度提示，统计呈现“今日/待复习”。
2. **纯推演与只读安全边界**：本模型所有调度推演纯属本地状态机推演，不向思源内核发起写请求、不破坏真实复习进度；复用既有只读端点 `/api/riff/getNotebookRiffDueCards`，不引入新依赖。
3. **由 `src/kernel-widget-model.js` 统一再导出**：复现既有内核组件架构，保持调用方无缝集成。
4. **档案预算微调 580 -> 582 KiB**：T-7334~T-7337 四个领域模型连续入图，累计增加真实生产代码 ~4 KiB；经审查无冗余运行时死重（av cell 提取已单点去重释放 336 B）；微调至 582 KiB（595,968 B），为工作树提供 **1,587 B** 的健康发布余量。单条目压缩上限（320 KiB，ADR 0089）与 bundle raw 自律线（1,160 KiB，ADR 0125）保持不变。

## 证据与边界

- **类型与全量测试**：`pnpm exec tsc --noEmit` 0 错误；全量测试从 8875 项扩充至 **8885 通过 / 1 跳过 / 0 失败**（新增 9 项 flashcard-review 契约）。
- **四组负向注入验证**（按 `docs/gate-audit-checklist.md`）：
  1. 未掌握重置被旁路 → 3 项定向失败 ✅
  2. ease 钳制被移除 → 2 项定向失败 ✅
  3. 间隔一年上限被移除 → 2 项定向失败 ✅
  4. 超窗卡片静默丢弃（去 remaining 记账） → 2 项定向失败 ✅
- **构建与包体**：生产构建 `package.zip` 为 **594,381 B**，处于新 582 KiB（595,968 B）仓库门禁之内（健康余量 **1,587 B**）；`dist/index.js` 为 1,176,091 B（低于 1,187,840 B 预算线 11,749 B）；压缩条目 316,225 B（低于 327,680 B 门禁 11,455 B）。
- **批量门禁全绿**：可复现构建 3/3 一致；release-batch-audit（49/49）、quality-batch-audit（50/50）、integration-boundary-audit（50/50）、current-status-audit（173 tasks）、compat-probe、desktop-acceptance 全部通过；六套端侧/Chromium Smoke 全部复绿；`git diff --check` 通过。
- **生产图闭包**：实测 81，上限按同口径校准 80→81（先例 T-6814/T-6950/T-7260/T-7334/T-7335/T-7336）。
- **边界声明**：本决策交付**纯模型层、SM-2 调度与契约门禁**，不改动远端 Release、Git Tag 或包版本号。UI 卡片渲染与真实宿主闪卡交互归后续生产接线任务。
