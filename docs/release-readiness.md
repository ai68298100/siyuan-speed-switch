# Release readiness

<!-- Current artifact snapshot: dist/index.js 614064 bytes; dist/index.css 145665 bytes; package.zip 313084 bytes; icon.png 160x160 18376 bytes; mobile self-regulation line 768 KiB; archive ceiling 512 KiB. -->

Current build: `dist/index.js` 614064 bytes; `dist/index.css` 145665 bytes; `package.zip` 313084 bytes; `icon.png` 160x160 18376 bytes.

评估日期：2026-09-15（v0.17.0 发布后开发头）；真实宿主补充验收仍按兼容性任务持续跟进。

| 检查项 | 状态 | 证据/剩余动作 |
| --- | --- | --- |
| TypeScript、自动测试、UI smoke | 已通过 | 完整测试 5777/5777（含 14 项手机端图标兜底与布局契约、4 项文档集恢复报告契约、16 项缩略图缓存读取侧归一化契约：9 项纯函数 + 7 项演练管道/分类、6 项存储兼容矩阵文档契约、2 项对外文档版本承诺一致性契约、3 项源码扫描剥注释覆盖率门禁 + 1 项债清单理由标签内容判据门禁（T-6282）、14 项 CSS 块级作用域断言辅助自测）；TypeScript、移动端 smoke 70 项、Chromium smoke、手机布局门禁（3 断言，含宿主兜底探针）、生产图隔离测试与 6 项注释剥离辅助自测通过 |
| 生产产物与包体 | 已通过 | 当前构建 `dist/index.js` 614064 bytes（768 KiB 自律线内，余量 172368 bytes）；`dist/index.css` 145665 bytes；`package.zip` 313084 bytes（512 KiB 硬上限余量 211204 bytes） |
| 集市图标规范 | 已通过 | `icon.png` 160x160、18376 bytes，符合思源官方「推荐 160x160、不超过 20 KB」规范（此前 256x256、44720 bytes 超标 2.2 倍）；`preview.png` 53.1 KiB 亦在 200 KB 内 |
| 归档可复现性 | 已通过 | 连续构建 SHA-256 一致；ZIP 条目固定为 1980-01-01 00:00 |
| 版本元数据 | 已通过 | `0.17.0` 已同步 `package.json`、`plugin.json`、中英文 README |
| 真实桌面/侧栏验收 | 待处理 | T-107：路径端点能力、窄侧栏宽度、最新 UI 生命周期 |
| Android 真机验收 | 后置 | 按 D-042；当前环境无 `adb`、`java` 与设备 |
| GitHub 发布动作 | 待维护者确认 | 当前工作树为本地开发提交，未执行新的 GitHub push；上一正式版 `v0.17.0` 记录保持不变 |

## 建议发布顺序

1. 已完成 `v0.17.0` 标签推送与 GitHub Actions Release 上传：[`v0.17.0`](https://github.com/ai68298100/siyuan-speed-switch/releases/tag/v0.17.0)。
2. 在真实思源桌面会话中补做路径筛选、窄侧栏和安装升级检查。
3. Android 真机验收按 D-042 后置，不以浏览器 smoke 替代真实设备证据。
