# Release readiness

<!-- Current artifact snapshot: dist/index.js 653949 bytes; dist/index.css 147573 bytes; package.zip 330184 bytes; icon.png 160x160 18376 bytes; mobile self-regulation line 768 KiB; archive ceiling 512 KiB. -->

Current build: `dist/index.js` 653949 bytes; `dist/index.css` 147573 bytes; `package.zip` 330184 bytes; `icon.png` 160x160 18376 bytes.

评估日期：2026-09-15（v0.17.0 发布后开发头）；真实宿主补充验收仍按兼容性任务持续跟进。

| 检查项 | 状态 | 证据/剩余动作 |
| --- | --- | --- |
| TypeScript、自动测试、UI smoke | 已通过 | 完整测试 **5959/5959**（2026-09-17 复核；含 14 项手机端图标兜底与布局契约、4 项文档集恢复报告契约、16 项缩略图缓存读取侧归一化契约：9 项纯函数 + 7 项演练管道/分类、6 项存储兼容矩阵文档契约、2 项对外文档版本承诺一致性契约、3 项源码扫描剥注释覆盖率门禁 + 1 项债清单理由标签内容判据门禁（T-6282）、14 项 CSS 块级作用域断言辅助自测、4 项根目录文档体积与归档契约门禁、**小驴打卡桥接 15 项 + 组件协议 v2.4 来源字段 17 项 + 来源分组模型 13 项 + 打卡注册模板 10 项（T-6298 / ADR 0057）**）；TypeScript、移动端 smoke 70 项、Chromium smoke、手机布局门禁（3 断言，含宿主兜底探针）、生产图隔离测试与 6 项注释剥离辅助自测通过 |
| 组件来源体系（ADR 0057） | 已通过 | 协议 v2.4 的 `source` 白名单、5 个小驴打卡桥接组件、商店按来源插件成组与待安装区按 provider 聚合、**组内卡片按 `source.order` 升序**（同序按组件 id，映射不完整时回退原序）；负向验证 5/5（精确 FAIL + 兄弟不波及 + md5 还原）；perf 自检改 best-of-N 重测后另补 2/2 负向验证（等规模夹具重测 3 次仍 FAIL、预算回退仍 FAIL） |
| 生产产物与包体 | 已通过 | 当前构建 `dist/index.js` 653949 bytes（768 KiB 自律线内，余量 132483 bytes）；`dist/index.css` 147573 bytes；`package.zip` 330184 bytes（512 KiB 硬上限余量 194155 bytes）；zip 单条目压缩预算 168→180 KiB（T-6298 / ADR 0057：`index.js` 压缩后 164015→175727 bytes，纯本地只读增量，按 D-353/D-366/D-386 先例上调，负向验证回退到 168 KiB 仍精确 FAIL） |
| 集市图标规范 | 已通过 | `icon.png` 160x160、18376 bytes，符合思源官方「推荐 160x160、不超过 20 KB」规范（此前 256x256、44720 bytes 超标 2.2 倍）；`preview.png` 53.1 KiB 亦在 200 KB 内 |
| 归档可复现性 | 已通过 | 连续构建 SHA-256 一致；ZIP 条目固定为 1980-01-01 00:00 |
| 版本元数据 | 已通过 | `0.21.0` 已同步 `package.json`、`plugin.json`、中英文 README |
| 真实桌面/侧栏验收 | 待处理 | T-107：路径端点能力、窄侧栏宽度、最新 UI 生命周期 |
| Android 真机验收 | 后置 | 按 D-042；当前环境无 `adb`、`java` 与设备 |
| GitHub 发布动作 | 已通过 | `v0.21.0` 已于 2026-09-17 发布：16 个提交经 REST Git Data API 完整保留推送（main `7f7bb4a6`，tag 指向 release 提交 `942fe12e`），Actions Release 工作流 completed/success，附件 `package.zip` 330169 bytes |

## 建议发布顺序

1. 本轮发布 `v0.21.0`：标签推送与 GitHub Actions Release 上传见 [`v0.21.0`](https://github.com/ai68298100/siyuan-speed-switch/releases/tag/v0.21.0)。
2. 在真实思源桌面会话中补做路径筛选、窄侧栏和安装升级检查。
3. Android 真机验收按 D-042 后置，不以浏览器 smoke 替代真实设备证据。
