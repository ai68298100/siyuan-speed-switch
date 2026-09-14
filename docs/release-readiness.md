# Release readiness

评估日期：2026-09-14（v0.17.0 发布候选）；真实宿主补充验收仍按兼容性任务持续跟进。

| 检查项 | 状态 | 证据/剩余动作 |
| --- | --- | --- |
| TypeScript、自动测试、UI smoke | 已通过 | `pnpm verify:release`；1509/1509 |
| 生产产物与包体 | 已通过 | `dist/index.js` 457913 bytes；`package.zip` 277331 bytes（300 KiB 硬上限余量 29869 bytes，跨平台允许 ±1 KiB） |
| 归档可复现性 | 已通过 | 连续构建 SHA-256 一致；ZIP 条目固定为 1980-01-01 00:00 |
| 版本元数据 | 已通过 | `0.17.0` 已同步 `package.json`、`plugin.json`、中英文 README |
| 真实桌面/侧栏验收 | 待处理 | T-107：路径端点能力、窄侧栏宽度、最新 UI 生命周期 |
| Android 真机验收 | 后置 | 按 D-042；当前环境无 `adb`、`java` 与设备 |
| GitHub 发布动作 | 待执行 | 推送 `v0.17.0` 标签后由 Release workflow 构建并上传 `package.zip` |

## 建议发布顺序

1. 本地门禁通过后提交并推送 `v0.17.0` 标签，由 GitHub Actions 自动构建与 Release 上传。
2. 在真实思源桌面会话中补做路径筛选、窄侧栏和安装升级检查。
3. Android 真机验收按 D-042 后置，不以浏览器 smoke 替代真实设备证据。
