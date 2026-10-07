# T-7133 任务式轻量上手：本地脱敏自检

日期：2026-10-07
范围：本地代码、现有契约测试和脱敏任务脚本
结论：未复现需要新增产品引导的工程卡点；T-7168 真人成效仍未执行。

## 判断边界

T-7133 是条件审计，不以新增教程为默认结果。检查目标是确认已有入口、空态、失败回退、取消和恢复路径是否存在且可再次查阅；本记录不把自动化测试或维护者走查写成用户成功率，也不替代真实思源、Android 或读屏验收。

## U1–U6 对照

| 任务 | 已检查入口/状态 | 证据 | 本地判断 |
| --- | --- | --- | --- |
| U1 切换到目标文档 | 切换器搜索、已打开页签、卡片打开动作 | `src/index.ts`、`tests/keyboard-navigation-contract.test.cjs`、`tests/e2e/open-flow.spec.mjs` | 已有主路径；未发现需要常驻教程的缺口 |
| U2 无命中后继续 | 空态说明、清除条件、原生搜索出口、失败重试 | `src/doc-search-ui.ts:1664`、`tests/doc-search-fetch-behavior.test.cjs`、`tests/doc-search-state.test.cjs` | 已有下一步和回退出口；未发现死路 |
| U3 收藏/最近关闭后再找 | 收藏入口、最近关闭记录、关闭后恢复 | `src/index.ts`、`tests/favorite-actions.test.cjs`、`tests/recent-closed.test.cjs` | 已有恢复路径；未发现需新增解释层 |
| U4 恢复文档集 | 预览、取消、跳过/失败计数和恢复回执 | `tests/document-sets.test.cjs`、`tests/document-set-diff.test.cjs`、`tests/agent-outline.test.cjs` | 状态与取消契约已有；未发现需改产品逻辑的卡点 |
| U5 片段取消/保存 | 脏稿守卫、预览、保存、恢复 | `tests/snippet-leave-intent.test.cjs`、`tests/snippet-backup-restore.test.cjs`、`tests/snippet-studio-mount.test.cjs` | 已有安全退出与回读路径；桌面真实走查仍按既有边界后置 |
| U6 首次添加工作台组件 | 空工作台分层、最多三项推荐、恢复默认、打开组件商店、使用说明 | `src/second-panel-ui.ts:470`、`src/index.ts:2596`、`tests/home-empty-guide.test.cjs`、`tests/home-store-discovery.test.cjs` | 已有可跳过入口和再次查阅说明；未发现需要强制引导的卡点 |

## 结果与后续

- 本地结构和契约检查支持“已有路径完整”的判断，因此不新增遮挡首屏的教程、宣传卡或自动联网步骤。
- `README.md` 已提供快速上手，组件商店保留独立使用说明；两者都不强迫第三方服务配置。
- `docs/usability-tasks-2026-10-06.md` 的 U1–U6 仍是后续真人观察脚本。真人反馈、首次动作、耗时和恢复卡点归 T-7168；若出现具体可复现问题，再按最小范围修改对应表面。

## 验证命令

```text
pnpm exec node --test tests/home-empty-guide.test.cjs tests/home-store-discovery.test.cjs tests/doc-search-fetch-behavior.test.cjs tests/doc-search-state.test.cjs tests/favorite-actions.test.cjs tests/recent-closed.test.cjs tests/document-sets.test.cjs tests/document-set-diff.test.cjs tests/agent-outline.test.cjs tests/snippet-leave-intent.test.cjs tests/snippet-backup-restore.test.cjs tests/snippet-studio-mount.test.cjs
pnpm run current-status:audit
```

浏览器首帧基准 `tests/e2e/first-open.spec.mjs` 只证明首帧可交互预算，不被用作真人上手成效证据。
