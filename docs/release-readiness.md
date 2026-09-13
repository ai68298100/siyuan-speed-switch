# Release readiness

评估日期：2026-09-13。当前仓库可以生成内部 Release Candidate，但正式发布仍需维护者确认并完成真实宿主步骤。

| 检查项 | 状态 | 证据/剩余动作 |
| --- | --- | --- |
| TypeScript、自动测试、UI smoke | 已通过 | `pnpm verify:release`；675/675 |
| 生产产物与包体 | 已通过 | `dist/index.js` 363031 bytes；`package.zip` 305870 bytes |
| 归档可复现性 | 已通过 | 连续构建 SHA-256 一致；ZIP 条目固定为 1980-01-01 00:00 |
| 版本元数据 | 待处理 | 当前仍为 `0.16.39`；新版本需同步 `package.json`、`plugin.json`、README 更新日志 |
| 真实桌面/侧栏验收 | 待处理 | T-107：路径端点能力、窄侧栏宽度、最新 UI 生命周期 |
| Android 真机验收 | 后置 | 按 D-042；当前环境无 `adb`、`java` 与设备 |
| GitHub 发布动作 | 待处理 | 需明确确认后才 push、打 `v*` tag、创建 Release |

## 建议发布顺序

1. 维护者确认发布范围，决定是否接受 Android 与路径筛选宿主验收后置。
2. 将版本号升级到新的 patch 版本，补齐中英文更新日志并重新运行 `pnpm verify:release`。
3. 审阅 `package.zip` 条目、哈希和工作区差异；确认后再 push、打 tag 并创建 Release。
