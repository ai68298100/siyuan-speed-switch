# 平台、版本与能力支持清单

日期：2026-10-06。任务：T-7167。

这张表描述当前仓库能够证明的支持范围。`已验证`只表示表中链接所对应的真实运行或自动化证据；`部分验证`表示有宿主/API 证据但还缺最终人工观感、读屏或设备验收；`待验证`不等于不可用。没有把浏览器夹具、受控响应或历史发布资产当作真实 Android、外部服务或云端 Actions 证据。

## 入口与宿主

| 平台/入口 | 版本依据 | 当前能力 | 证据与限制 |
| --- | --- | --- | --- |
| 思源桌面主窗口 | `plugin.json` 最低 3.8.0；真实隔离宿主 3.8.6 | 切换器、文档卡片搜索/预览、收藏/最近、日记、工作台、片段实验室、悬浮球 | 3.8.6 隔离桌面 E2E 7/7：`.artifacts/t7115-desktop/results.json`；最终主题、读屏、长会话仍归 T-7115/B-005 |
| 思源桌面右侧 Dock | 最低 3.8.0；真实隔离宿主 3.8.6 | 紧凑切换器/工作台、搜索和筛选、焦点与名称、窄宽度降级 | 3.8.6 Dock 340px→245px partial：[`docs/native-sidebar-host-evidence.md`](native-sidebar-host-evidence.md)；最窄可用宽度、主题、读屏待 T-7115 |
| 思源独立窗口/浏览器桌面 | `plugin.json.frontends` 声明 `desktop-window`/`browser-desktop` | 复用桌面命令和布局适配；独立窗口能力取决于宿主是否提供对应入口 | 代码和兼容探针覆盖 API 形状；没有独立窗口真实人工结果，不能标记 verified |
| 思源 Android/移动 WebView | `plugin.json.frontends` 声明 `mobile`/`browser-mobile`；最低 3.8.0 | 手机切换器、收藏/最近、日记、排序与分组浮层、移动工作台；块定位和桌面全屏不声明可用 | 移动浏览器 DOM 行为 11/11，真实 Android 安装/升级/IME/旋转/Back/手势仍受 B-004，归 T-7116 |

## 思源版本探针

| 版本 | 已验证内容 | 仍需注意 |
| --- | --- | --- |
| 3.8.4-beta.2 | 笔记本和路径只读 API 响应：`data.box`、`data.path`、`data.files[]`；路径不存在时返回空列表 | 这是宿主 API 证据，不替代完整 UI 和升级验收；详见 [`docs/path-filter-host-evidence.md`](path-filter-host-evidence.md) |
| 3.8.6 | 标题搜索、路径筛选字段、卸载公开钩子；真实桌面/Dock 隔离 E2E | 不能据此推断 Android、其他未来小版本或外部 provider 质量；详见 [`docs/siyuan-compatibility-matrix.md`](siyuan-compatibility-matrix.md) |
| 低于 3.8.0 | 不在插件 manifest 声明范围内 | 不提供兼容承诺；不要通过修改 manifest 绕过宿主能力缺失 |

## 能力边界

| 能力 | 桌面主窗 | Dock | 移动 | 证据/限制 |
| --- | --- | --- | --- | --- |
| 页签切换、收藏、最近 | 已验证 | 部分验证 | 浏览器已验证，Android 待验证 | 共享领域命令；宿主事件时序仍需真实移动验收 |
| 文档标题/受限全文搜索 | 已验证 | 部分验证 | 根文档打开；块定位待 Android | [`docs/siyuan-compatibility-matrix.md`](siyuan-compatibility-matrix.md) 与搜索契约测试 |
| 路径筛选 | API/浏览器已验证 | UI partial | 不声明移动路径树 | 路径端点白名单和降级见 [`docs/path-filter-desktop-plan.md`](path-filter-desktop-plan.md) |
| 工作台只读组件 | 已验证 | 部分验证 | 组件按 provider 能力决定 | 组件缺 provider 时显示 unavailable，不伪装 ready |
| 片段实验室 | 桌面已验证 | 代码边界已接入 | 移动入口不声明 | JS runner 关闭；编辑器和片段外 AI 后置 |
| Agent 能力 | 支持宿主 capability 的桌面/移动按检测注册 | 同上 | 按宿主检测缩减 | 只读导航/搜索/工作区快照已有真实 3.8.6 受控证据；取消、权限拒绝和手机矩阵仍后置 |
| 外部 provider | 本地协议可装配 | 按端侧声明 | 按 provider 声明 | ActivityWatch、Gist、在线 AI、家族插件和社区渠道分别受 B-007～B-011 约束 |

## 维护规则

- 新增宿主能力时，先在本表增加“能力 + 证据 + 限制”，再修改 README 或集市介绍。
- 真实设备、账号或云端运行尚未取得时，保留 `待验证/部分验证`，不把 fixture 结果改成全兼容。
- `plugin.json` 的最低版本和 frontends 是安装声明；它们不等同于每个平台已经完成验收。
- 下一次复核至少检查 `plugin.json`、`docs/siyuan-compatibility-matrix.md`、`BLOCKERS.md` 和 `docs/current-status-index.json` 是否仍一致。
