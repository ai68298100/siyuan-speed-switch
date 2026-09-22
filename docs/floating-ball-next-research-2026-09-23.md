# 悬浮球增量功能调研（2026-09-23）

> 调研方式：浅克隆官方 `siyuan-note/siyuan` 逐文件核对源码（证据均标路径），叠加 FV/fooView、iOS AssistiveTouch、OPPO 智能侧边栏、三星 Edge Panel、小米/华为同类与桌面软件参照的功能分类学。结论只收"符合思源实际"的候选；本报告不含已交付项（B0~B7、P0、P1、设置美化、侧栏撤出、自由停放评估见各 ADR 与账本）。

## 1. 最大的增量发现：官方命令系统 `globalCommand`

思源 3.8.3 起建立统一命令注册表（桌面 68 条 + 移动 27 条母表，`app/src/command/nativeCatalog.ts`），并**官方导出给插件**：`api.globalCommand(command, app)`（`app/src/plugin/API.ts:435` → `app/src/boot/globalEvent/command/global.ts:58`）。这意味着一批原本要自绘 UI 的动作变成一行命令：

- 可直接动作化的命令：`riffCard`（闪卡复习）、`outline`、`backlinks`、`bookmark`、`tag`、`inbox`（收集箱）、`recentDocs`/`recentClosed`、`syncNow`、`dataHistory`、`editReadonly`、`lockScreen`、`newFile`、`globalSearch`、`goBack/goForward`、字号三件套等；手机分支另有 `fileTree/mainMenu` 等。
- **版本边界**：命令系统为 v3.8.3+（移动端命令面板 v3.8.4）。本项目 minAppVersion=3.8.0（ADR 0064），因此必须**能力检测**（`typeof api.globalCommand === "function"`），缺失时动作标记不支持/隐藏，不抬最低版本。

## 2. 其他核实过的宿主能力（悬浮球可用而未用）

| 能力 | 证据 | 可达性 | 用途 |
| --- | --- | --- | --- |
| `openTab({card})` 闪卡复习页签 | `app/src/plugin/API.ts:83-200` | 桌面稳定；**移动端 openTab 为空实现（TODO）** | 桌面走 openTab，手机走 globalCommand `riffCard` |
| `getActiveEditor` + `Protyle.insert` 光标插入 | `API.ts:239-287`、`app/src/protyle/index.ts:684` | 官方 API，稳定 | 模板插入当前文档/光标、外部内容回写 |
| `/api/template/render` | `kernel/api/router.go:460`、`kernel/api/template.go:62-118`（模板必须在 `<data>/templates/` 内） | 稳定 | 与上条配合："按模板插入"动作 |
| `/api/sync/performSync` + `sync-start/end` 事件 | `router.go:367`、`app/src/types/index.d.ts`（TEventBus） | 稳定（只读/发布模式被拒） | 一键同步 + 状态徽标；`syncNow` 命令会弹确认框，直调 API 不弹 |
| `openWindow({doc:{id}})` 新窗口 | `API.ts:53-81` | 桌面稳定 | "当前文档抛独立小窗"（桌面差异化动作） |
| `platformUtils.sendNotification` 系统通知 | `app/src/plugin/platformUtils.ts:29-80`（三平台自动分派） | 官方导出，稳定 | 跨端系统通知/延时提醒 |
| 移动端原生桥 | `window.JSAndroid.returnDesktop/hideKeyboard`、iOS `webkit.messageHandlers.vibrate` 等（`platformUtils.ts`、`keyboardToolbar.ts`、`MobileFiles.ts`） | **裸内部桥**：可用但需判空+降级标注 | 手机专属小动作：回桌面、收起键盘、iOS 震动反馈；**分享/截屏无桥通道，不可做** |
| `addFloatLayer` 浮动引用层 | `app/src/plugin/index.ts:694` | 稳定（插件未用过） | "浮动引用当前块"（差异化，中优先级） |
| 事件总线 | `app/src/types/index.d.ts:10-37`（`sync-*`、`mobile-keyboard-show/hide` 等） | 稳定 | 键盘弹出时球体避让、同步状态刷新 |
| `data-prevent-swipe` 官方通道 | `app/src/mobile/util/touch.ts:353-357`（消费点唯一，思源日历/脑图同用） | 稳定 | T-6778 方案 A 的正确性再次确认；侧滑激活区实测为 `clientX ∈ [8, innerWidth-8]` |
| 不建议投入 | 导出为图片（`protyle/export/util.ts:38` 为内部函数）；护眼/全屏（无命令无 API）；AI 选区问答（`/api/ai/*` 稳定但强依赖付费开关+需自建流式面板） | — | 记入评估池，不排期 |

## 3. 竞品功能分类学 → 思源适配粗分

竞品维度全景（触发器/面板形态/动作内容/状态呈现/个性化/差异化亮点）已存档于调研底稿（FV 二维手势=方向×短长滑、drag-to-target、任务分享平台；AssistiveTouch 三槽位+自定手势；OPPO 场景化智能建议；三星 App Pairs；vivo 原子组件）。按"单应用笔记软件"过滤后：

- **适合**：多手势槽位绑定笔记动作（P2 路线）、drag-to-target（拖球到块上触发块级动作，候选池）、闲置半透明/贴边半隐（已有）、场景预设（P2）、配置导出分享（P2/P3）、剪贴板类动作（走思源剪贴板封装，候选池）。
- **不适配**：系统截屏/录屏/锁屏（锁屏除外，思源有 lockScreen）、分屏浮窗/原子组件（无多应用语义）、当前应用感知推荐（无多应用上下文，只能退化为"当前文档类型感知"）、背面敲击/压力感应（WebView 不暴露）、全局悬浮于其他应用（插件只能存活于思源窗口内）。

## 4. 增量功能分期建议

### 近批（官方 API、高性价比，随下个功能版本）

| 任务 | 内容 | 实现要点 |
| --- | --- | --- |
| T-6789 | 命令类动作底座 | executor 增加 `globalCommand` 分支 + 能力检测（3.8.3+），缺失时动作不可用并给原因；目录/设置页呈现"宿主命令"来源 |
| T-6790 | 首批命令类动作 | 闪卡复习、当前文档大纲、反链、收集箱、最近文档、最近关闭、只读切换（桌面 openTab 优先、手机命令分支回退） |
| T-6791 | 一键同步动作 | `/api/sync/performSync` 直调（只读/发布模式降级提示）+ `sync-start/end` 事件做执行态 |
| T-6792 | 模板插入/快速记录升级 | `template/render` + `getActiveEditor().protyle.insert`；模板路径安全边界沿用内核校验 |

### 次批（差异化亮点）

| 任务 | 内容 |
| --- | --- |
| T-6793 | 桌面"当前文档抛独立窗口"（openWindow） |
| T-6794 | 手机端系统动作包：系统通知（官方封装）+ 收起键盘/回桌面/iOS 震动（裸桥判空降级，设置页标注"内部桥接口"） |
| T-6795 | 键盘避让（`mobile-keyboard-show/hide` 事件调整球位置，服务外拨展开与整体观感） |

### 评估池（不排期，等反馈或前置条件）

- drag-to-target（拖球到块上执行块级动作）：交互新颖但与现有拖动/吸附语义冲突大，等 P2 触发器稳定后评估；
- AI 选区问答：等思源 AI 开关普及与用户明确需求；
- `addFloatLayer` 浮动引用、字号调节、数据历史、配置分享（FV 任务分享平台式）：随用户反馈插入；
- 导出为图片、护眼/全屏：**不可稳定达，明确不做**。

## 5. 与既有路线的衔接

- 自由停放+外拨展开（T-6784~T-6787，已评估可行）：本报告不改变其结论；命令类动作入目录后，外拨展开的面板内容自动受益。
- 侧栏撤出（ADR 0072/T-6788 已完成）：本报告所有候选只需覆盖 desktop/mobile 两端。
- 版本策略：一切 3.8.3+ 能力走能力检测，minAppVersion 维持 3.8.0（ADR 0064 不变）。
- 门禁口径：命令类动作的能力检测分支、模板路径边界、裸桥判空均按 `docs/gate-audit-checklist.md` 负向验证。
