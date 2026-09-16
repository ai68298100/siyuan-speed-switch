# 批量验收 Runbook（v0.21 真机/真实宿主集中执行清单）

> 本文档把 TODO 中 11 个分散的真机/真实宿主验收任务整合为**按会话类型分组**的批量执行清单。
> 每一项都标注：验证点、来源任务、对应自动化门禁、通过标准。
> 执行环境与证据边界遵守 `docs/desktop-acceptance-template.md`：不记录令牌/文档正文，浏览器模拟不算设备证据。

## 0. 准备（一次）

- 记录环境：SiYuan 版本、插件版本（当前 main 头 = 5827 项测试 / 169 文件）、操作系统与缩放、主题、端口与认证状态（只记"已认证/未认证"）。
- 从 `main` 构建一次 `pnpm build`，确认 `package.zip` 尺寸与 `docs/release-readiness.md` 快照一致（当前 313758 bytes）。
- 每完成一组就在对应 TODO 条目勾选并在 `PROGRESS.md` 追加不含敏感内容的摘要。

## 1. 桌面会话 A：路径筛选证据链（T-107 → 解锁 T-103/T-1220）

来源：T-107（真实宿主能力证据）、T-103（原型已存档于 `docs/path-filter-desktop-plan.md`）。

| # | 验证点 | 通过标准 |
| --- | --- | --- |
| 1.1 | `/api/filetree/listDocsByPath` 能力探测 | 返回 `通过 / 缺失 / 未认证 / 超时` 四态之一，与 `docs/search-path-filter-sidebar-evaluation.md` 的准入矩阵一致 |
| 1.2 | 成功响应结构 | 包含 `data.box` / `data.path` / `data.files` |
| 1.3 | 取消语义 | 取消请求后保留原筛选结果（对应 `normalizePathFilterProbeOutcome` 的 cancelled） |
| 1.4 | 失败降级 | 失败显示非阻塞降级而非"空目录" |

通过后：按 `docs/path-filter-desktop-plan.md` 直接应用已存档实现（tsc 已实测 0 错误），解锁 T-103/T-1220。

## 2. 桌面会话 B：Agent 只读诊断与执行闭环前置（T-1218/T-1219）

| # | 验证点 | 通过标准 |
| --- | --- | --- |
| 2.1 | `workspace-runtime-registry-diagnostics` capability 在真实宿主可调用（T-1218） | 只读输出 summary/registry/diffQueue/diffCoordinator 四段，无文档内容泄漏 |
| 2.2 | open-documents 确认弹窗真机点击（T-1219 前置） | 确认弹窗渲染、取消路径无副作用 |
| 2.3 | `document-context` 只读接入的取消/权限行为（D-377 后置项） | 大纲 ≤24 条、路径 ≤256 字符、请求可取消 |

通过后：解锁 T-1219（open/open-batch 最小执行闭环，实现件已在 `agent-workspace-plan/execution/approval-token` 就位）。

## 3. 手机 / 窄屏会话（T-093/T-080 + 本会话两个产品修复验证）

| # | 验证点 | 通过标准 |
| --- | --- | --- |
| 3.1 | 最窄可用侧栏宽度（T-080/T-107 侧栏项） | 记录 px；路径 chip、清除按钮、键盘焦点可见 |
| 3.2 | 首页刷新摘要窄屏布局（T-093） | 长文案不遮挡重试/折叠控件 |
| 3.3 | **size tile 触控**（本会话修复：`touch-action: manipulation` 补齐） | 连续点击尺寸按钮无双击缩放延迟/页面缩放 |
| 3.4 | **card 减弱动效**（本会话去重后仅一份覆盖） | 系统开启"减弱动态效果"时卡片过渡完全禁用 |
| 3.5 | 图标兜底（`resolveIconReference`） | 插件缺图标时回退 iconFile，不渲染未注册符号 |

## 4. 生命周期会话（T-1216/T-266 部分）

安装 → 升级（从 v0.17.0 覆盖安装）→ 重启 → 卸载。每步检查：

- 组件面板与商店可重新打开；
- `sw_thumb_cache` 等存储 key 在升级后可被读取侧归一化接受（对照 `docs/storage-compatibility-matrix.md`）;
- 卸载后无残留面板 DOM。

## 5. 组件逐项矩阵（T-366/T-266 主体）

- 29 个内置组件逐项记录：首读、刷新、空态、点击、配置、失败重试。
- 优先：今日日记任务、月历（含农历/月度导航）、联网天气、Bangumi、DailyHot/NewsNow、Uptime Kuma、Frankfurter、Miniflux。
- 记录表格沿用 `docs/desktop-acceptance-template.md` 的证据边界。

## 6. 第三方端到端（T-1221）

- 使用 `docs/widget-example/example-module.js` 作为最小样例，以真实插件宿主走通：注册 → 商店展示 → 配置表单 → 跨表面布局 → 失效/恢复。
- 通过后按 T-1221 勾选并补真实插件链接。

## 7. Android（D-042 后置）

- 无 adb/设备时保持"后置"事实；不以浏览器模拟冒充。

## 执行顺序建议

1. 桌面会话 A + B（一次认证覆盖 7 项）
2. 手机/窄屏会话（一次覆盖 5 项，含本会话 2 个产品修复的验证）
3. 生命周期 + 组件矩阵（时间最长，可分多次）
4. 全部通过后：解锁 T-103/T-1219/T-1220 的存档实现，规划 v0.18+ 发布
