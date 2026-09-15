# Release readiness

<!-- Current artifact snapshot: dist/index.js 557857 bytes; dist/index.css 142699 bytes; package.zip 318488 bytes; mobile self-regulation line 545 KiB. -->

Current build: `dist/index.js` 557857 bytes; `dist/index.css` 142699 bytes; `package.zip` 318488 bytes.

评估日期：2026-09-15（v0.17.0 发布后开发头）；真实宿主补充验收仍按兼容性任务持续跟进。

| 检查项 | 状态 | 证据/剩余动作 |
| --- | --- | --- |
| TypeScript、自动测试、UI smoke | 已通过 | 专项 `home-store-model` 402/402；完整测试既有发布契约通过；TypeScript、移动端 smoke、Chromium smoke 与 31 模块生产图通过 |
| 生产产物与包体 | 已通过 | 当前构建 `dist/index.js` 557279 bytes（545 KiB 自律线内）；`dist/index.css` 142699 bytes；`package.zip` 318314 bytes（320 KiB 硬上限余量 9366 bytes） |
| 归档可复现性 | 已通过 | 连续构建 SHA-256 一致；ZIP 条目固定为 1980-01-01 00:00 |
| 版本元数据 | 已通过 | `0.17.0` 已同步 `package.json`、`plugin.json`、中英文 README |
| 真实桌面/侧栏验收 | 待处理 | T-107：路径端点能力、窄侧栏宽度、最新 UI 生命周期 |
| Android 真机验收 | 后置 | 按 D-042；当前环境无 `adb`、`java` 与设备 |
| GitHub 发布动作 | 已通过 | `v0.17.0` 已推送；Release workflow run `34830768353` 成功，Release 资产 `package.zip` 277316 bytes |

## 建议发布顺序

1. 已完成 `v0.17.0` 标签推送与 GitHub Actions Release 上传：[`v0.17.0`](https://github.com/ai68298100/siyuan-speed-switch/releases/tag/v0.17.0)。
2. 在真实思源桌面会话中补做路径筛选、窄侧栏和安装升级检查。
3. Android 真机验收按 D-042 后置，不以浏览器 smoke 替代真实设备证据。
