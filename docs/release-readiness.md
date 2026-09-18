# Release readiness

<!-- Current artifact snapshot: dist/index.js 774514 bytes; dist/index.css 149249 bytes; package.zip 365808 bytes; icon.png 160x160 18376 bytes; mobile self-regulation line 768 KiB; archive ceiling 512 KiB. -->

Current build: `dist/index.js` 774514 bytes; `dist/index.css` 149249 bytes; `package.zip` 365752 bytes; `icon.png` 160x160 18376 bytes.

评估日期：2026-09-18（v0.22.0 发布后开发头，T-6307~T-6436 增量）；真实宿主补充验收仍按兼容性任务持续跟进。

| 检查项 | 状态 | 证据/剩余动作 |
| --- | --- | --- |
| TypeScript、自动测试、UI smoke | 已通过 | 完整测试 **6209/6209**（2026-09-18 复核；T-6364~T-6436 建立 58 组件优化队列，并完成前 35 个组件的配置、投影健壮性、统计和刷新时效优化）；TypeScript、移动端 smoke、布局 smoke、Chromium smoke、生产图隔离测试通过 |
| 组件来源体系（ADR 0057） | 已通过 | 协议 v2.4 的 `source` 白名单、6 个小驴打卡桥接组件、商店按来源插件成组与待安装区按 provider 聚合、**组内卡片按 `source.order` 升序**（同序按组件 id，映射不完整时回退原序）；负向验证 5/5（精确 FAIL + 兄弟不波及 + md5 还原）；perf 自检改 best-of-N 重测后另补 2/2 负向验证（等规模夹具重测 3 次仍 FAIL、预算回退仍 FAIL） |
| 生产产物与包体 | 已通过 | 当前构建 `dist/index.js` 774514 bytes（768 KiB 自律线内，余量 11918 bytes）；`dist/index.css` 149249 bytes；`package.zip` 365808 bytes（512 KiB 硬上限余量 158480 bytes）；zip 单条目压缩预算 180→192→224 KiB（T-6357/T-6400 / ADR 0059，当前 `index.js` 压缩后 204512 bytes，余量 24864 bytes）；负向验证临时回退 190 KiB 时目标门禁精确 FAIL，恢复 224 KiB 后通过且 SHA-256 一致。后续以功能、性能和交互为优先，体积仅防失控增长 |
| 集市图标规范 | 已通过 | `icon.png` 160x160、18376 bytes，符合思源官方「推荐 160x160、不超过 20 KB」规范（此前 256x256、44720 bytes 超标 2.2 倍）；`preview.png` 53.1 KiB 亦在 200 KB 内 |
| 归档可复现性 | 已通过 | 连续构建 SHA-256 一致；ZIP 条目固定为 1980-01-01 00:00 |
| 版本元数据 | 已通过 | `0.22.0` 已同步 `package.json`、`plugin.json`、中英文 README |
| 真实桌面/侧栏验收 | 待处理 | T-107：路径端点能力、窄侧栏宽度、最新 UI 生命周期 |
| Android 真机验收 | 后置 | 按 D-042；当前环境无 `adb`、`java` 与设备 |
| GitHub 发布动作 | 已通过 | `v0.22.0` 已于 2026-09-18 发布，当前 `main` 与 `origin/main` 已同步；后续 v0.23 发布仍需完成真实宿主验收 |

## 建议发布顺序

1. `v0.22.0` 已完成：修复 issue #1 加载报错、内核数据组件、RSS/空气/HN 榜单、打卡月度、顶栏菜单和命令面板入口。
2. 在真实思源桌面会话中补做验收 runbook 5b 节（内核数据组件真机核对，数据库表格的 av JSON 为最高优先）、路径筛选、窄侧栏和安装升级检查，作为 v0.23 准入证据。
3. Android 真机验收按 D-042 后置，不以浏览器 smoke 替代真实设备证据。
