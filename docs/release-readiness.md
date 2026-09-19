# Release readiness

<!-- Current artifact snapshot: dist/index.js 823437 bytes; dist/index.css 150880 bytes; package.zip 387668 bytes; icon.png 160x160 18376 bytes; mobile self-regulation line 832 KiB (ADR 0062); archive ceiling 512 KiB. -->

Current build: `dist/index.js` 823437 bytes; `dist/index.css` 150880 bytes; `package.zip` 387668 bytes (本地构建实测；T-6675~T-6684 批次：版本下限抬升、存储版本戳、actionEffects、自建审批管线与确认弹窗撤除、执行链 propose/execute 双能力入图、note-stats 写作强度、写作活跃度年历网格)；`icon.png` 160x160 18376 bytes.

评估日期：2026-09-20（v0.23.5 发布后开发头，T-6307~T-6684 增量）；真实宿主补充验收仍按兼容性任务持续跟进。

| 检查项 | 状态 | 证据/剩余动作 |
| --- | --- | --- |
| TypeScript、自动测试、UI smoke | 已通过 | 完整测试 **6300/6300**（211 个测试文件，2026-09-19 复核；T-6348~T-6454 已完成 58 个组件深度优化，其中 51 个组件完成完整评分卡、7 个打卡桥接组件按用户口径完成桥接渲染增强；二轮增量已覆盖倒数日/年度进度等候选；T-6476~T-6663 完成宿主契约化、生命周期收口、选择器截断提示、三套本地质量审计、分支/双构建审计、发布指标与版本契约收口）；TypeScript、移动端 smoke、布局 smoke、Chromium smoke、生产图隔离测试通过 |
| 组件来源体系（ADR 0057） | 已通过 | 协议 v2.4 的 `source` 白名单、7 个小驴打卡桥接组件（含 v0.23.4 原生桥接的打卡摘要 `checkin-summary`）、商店按来源插件成组与待安装区按 provider 聚合、**组内卡片按 `source.order` 升序**（同序按组件 id，映射不完整时回退原序）；负向验证 5/5（精确 FAIL + 兄弟不波及 + md5 还原）；perf 自检改 best-of-N 重测后另补 2/2 负向验证（等规模夹具重测 3 次仍 FAIL、预算回退仍 FAIL） |
| 生产产物与包体 | 已通过 | 当前构建 `dist/index.js` 823437 bytes（832 KiB 自律线内，余量 28531 bytes，ADR 0062）；`dist/index.css` 150880 bytes；`package.zip` 387668 bytes（512 KiB 硬上限余量 136620 bytes）；zip 单条目压缩预算 180→192→224→256 KiB（T-6357/T-6400 / ADR 0059 / ADR 0065，当前 `index.js` 压缩后 218343 bytes，余量 43801 bytes）；预算、余量和快照漂移统一由 `scripts/release-readiness-metrics.cjs` 提供；负向验证临时回退 190 KiB 时目标门禁精确 FAIL，恢复 256 KiB 后通过且 SHA-256 一致。后续以功能、性能和交互为优先，体积仅防失控增长 |
| 集市图标规范 | 已通过 | `icon.png` 160x160、18376 bytes，符合思源官方「推荐 160x160、不超过 20 KB」规范（此前 256x256、44720 bytes 超标 2.2 倍）；`preview.png` 53.1 KiB 亦在 200 KB 内 |
| 归档可复现性 | 已通过 | `pnpm run repro:audit` 连续执行两次生产构建，并对 `dist/index.js`、`dist/index.css`、`package.zip` 做字节数与 SHA-256 比对，当前 3/3 一致；ZIP 条目时间戳 = 发版提交时间（SOURCE_DATE_EPOCH 模式，T-6474：1980 纪元曾致集市安装的文件 mtime 比云同步索引旧、版本被同步回滚） |
| 版本元数据 | 已通过 | `0.23.5` 已同步 `package.json`、`plugin.json`、中英文 README |
| 真实桌面/侧栏验收 | 待处理 | T-107：路径端点能力、窄侧栏宽度、最新 UI 生命周期 |
| Android 真机验收 | 后置 | 按 D-042；当前环境无 `adb`、`java` 与设备 |
| GitHub 发布动作 | 已通过 | `v0.23.5` 已于 2026-09-19 发布（Release 资产 `package.zip` 382231 bytes；Release workflow run #73 与 CI run #101 均 completed/success）。推送方式：`https://github.com:443` 间歇不可达，改走 SSH over 443（`ssh.github.com`）一次性 URL 推送 `HEAD:main`（`34a7bb8..8d2e498` 纯 fast-forward）与 `v0.23.5` 标签，未使用 force push、远端历史无损；本地 7 个提交已 rebase 到 `origin/main` 之上，此前的"同步提交"已丢弃 |

## 建议发布顺序

1. `v0.23.5` 已完成发布；后续本地提交继续沿用双构建、版本/tag preflight 和三套 50/50 审计门禁。
2. 在真实思源桌面会话中补做 T-107 路径筛选、窄侧栏宽度和最新 UI 生命周期的只读验收；当前 API 证据已具备，剩余是 UI 度量与安全会话边界。
3. Android 真机验收按 D-042 后置，不以浏览器 smoke 替代真实设备证据。
