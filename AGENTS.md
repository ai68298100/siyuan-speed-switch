# 自主开发协议

- 目标：持续推进方向（`ROADMAP.md`）。
- 每轮：读 `ROADMAP.md`（方向）→ `BLOCKERS.md`（阻塞）→ `docs/adr/`（已有取舍）→ `docs/dev-plan-*.md`（当期账本）→ 选任务 → 计划 → 实现 → 验证 → 更新文件 → 下一个。
- 历史检索：追溯旧任务/旧决策读 `docs/archive/`（**只读，不追加**，见 `docs/archive/README.md`）。
- 任务号：T-xxxx 继续单调递增；当期任务记 `docs/dev-plan-*.md` 与对应 ADR，不回写归档账本。
- 决策：小歧义自决并记当期 `docs/dev-plan-*.md`；非显然取舍写 ADR（`docs/adr/NNNN-*.md`）。
- 提交：不频繁 commit，不 push；每阶段/里程碑或 3-5 个相关任务本地 commit 一次。
- 阻塞：大阻塞记 `BLOCKERS.md`，能跳过就跳过。
- 停止：只有所有可做任务都阻塞或必须我决策时才停。
- 汇报：任务ID | 状态 | 证据 | 下一步。
- 门禁：新增或修改任何门禁/契约测试，须按 `docs/gate-audit-checklist.md` 自查，并做负向验证（注入违规确认它真的失败）；只跑"改完仍通过"不构成证据。
- 续跑：上下文将满先落盘并输出续跑口令。
