# 小驴雷切（Lv Speed Switch）更新日志

完整中英文版本更新历史请参阅：
- 中文完整日志：[docs/CHANGELOG.md](docs/CHANGELOG.md)
- 英文完整日志：[docs/CHANGELOG.en-US.md](docs/CHANGELOG.en-US.md)

---

### v0.48.15 (2026-10-24)
- **悬浮球极端视口边界防倒置与生命周期清理加固（Floating Ball Bounds & Cleanup）**：
  - 修复移动端在横屏或软键盘、导航栏高度占用极大场景下，安全区扣减导致 `visible.bottom < visible.top` 产生的视口倒置与坐标抖动 Bug，加入 `Math.max(visible.top + this.ballSize, ...)` 物理尺寸保底；
  - 优化 `onunload` 生命周期回收链路，剔除重复引用清理，确保各 Dialog、全局监听器与定时器严格注销。
- **文档预览内容提取容错与标题兜底强化**：无 contenteditable 节点回退与 dataset.title 兜底。

### v0.48.14 (2026-10-24)
- **文档预览内容提取容错与标题兜底强化（Doc Preview Robustness & Fallback）**：
  - 修复 `extractDocPreviewBlocks` 在段落、代码、引用或列表块缺少 `contenteditable="true"` 属性时（如静态只读或导出视图）内容被静默丢弃的问题，增加回退至节点自身的保护；
  - 增强 `docPreviewItemTitle` 标题获取：优先支持从 `item.dataset.title` 获取标题兜底，杜绝预览头部在非标准卡片上出现空标题。
- **移动端长按防抖容差与动作画板输入法守卫**：10px touch slop 容差与拼音候选期间 NOOP 拦截。

### v0.48.13 (2026-10-24)
- **移动端触控容差防抖与动作画板输入法守卫（Touch Slop & Action Palette IME Guard）**：
  - 修复移动端卡片长按（`bindCardLongPress`）与历史条目长按手势因缺少微颤容差导致长按难以触发的问题，引入业界标准的 10px `touch slop` 防抖容差，手指微小抖动不打断长按计时；
  - 修复次级动作画板（`Action Palette`）键盘调度逻辑：在中文/日文拼音候选期间（`isComposing || keyCode === 229`）严格返回 `NOOP`，彻底杜绝回车确认拼音时意外触发动作执行的 Bug；
  - 增强动作画板自动聚焦定时器生命周期管理，在 `dispose` 时主动清理 `focusTimer`，消除事件循环悬挂隐患。
- **跨区域键盘连续导航与无 offsetParent 视口滚动**：绝对视口滚动坐标修复、卡片至文档结果平滑过渡。

### v0.48.12 (2026-10-24)
- **跨区域键盘连续导航与无 offsetParent 视口滚动（Cross-Boundary Navigation & Scroll）**：
  - 重构 `scrollIntoView`：改用 `getBoundingClientRect()` 相对视口绝对差值滚动，彻底消除嵌套相对定位容器（`position: relative` / 网格 / 流式分组）导致的滚动跳动 Bug；
  - 实现卡片区与文档结果区键盘焦点无缝穿透：在卡片末行按 `ArrowDown` 自动平滑过渡聚焦至首条文档结果项，在结果行首项按 `ArrowUp` 自动平滑回焦至卡片末项或搜索框；
  - 强化 `activateCardByElement` 空值防御：严格拦截 `!card` 与 `!tabId`，杜绝数字键越界时向底层传入 `undefined` 引发偶发误匹配。
- **第二轮代码潜在 Bug 排查与交互边界防御**：输入法拼音候选阶段 Escape 保护、空态近期搜索动态上下文定位、Windows 驱动器盘符排除与 SQL 防空。

### v0.48.11 (2026-10-24)
- **第二轮代码潜在 Bug 排查与交互边界防御（Deep Bug Audit & Robustness Round 2）**：
  - 修复中文/日文输入法拼音候选阶段（`composing`）按 Escape 误清空整输入框的体验缺陷，仅关闭候选窗而不丢弃文字；
  - 修复空态近期搜索 Chip 点击时因静态空上下文绑定导致无法准确找到弹窗搜索框的问题，升级为运行时动态最近上下文定位（`targetSurface`）；
  - 增强穿透检索冒号语法：智能识别并排除 Windows 驱动器盘符路径（如 `C:\Users`、`d:/notes`），避免误判为大纲模式；
  - 修复块搜索 SQL 生成时空白笔记本 ID（如 `"   "`）产生空条件导致零结果的边界 Bug。
- **代码潜在 Bug 深度排查第一批**：定时器悬挂清除、循环引用防御、模式药丸冒号剥离与 Home/End 导航。

### v0.48.10 (2026-10-24)
- **代码潜在 Bug 深度排查与边界隐患加固（Bug Audit & Robustness Defense）**：
  - 修复 `wrapEcosystemModuleRead` 早期解析结算时未释放超时定时器导致的事件循环悬挂隐患，并增加非标准/循环引用配置的序列化防御保护；
  - 增强 `setupSearchModeChips` 模式药丸栏前缀自适应，补齐对全半角冒号（`:` / `：`）大纲穿透符号的平滑剥离与切换，并遵循 W3C 规范补齐 `Home` / `End` 首末快捷键导航；
  - 强化生态事件总线调度：重绑前严格执行幂等解绑，并在广播刷新时对每个监听器执行独立 `try-catch` 保护，防止单个第三方模块抛错破坏总线；
  - 动作画板思阅/思播专有调用升级为全别名安全探测（`getBridgeSafely`）。
- **思阅与思播深度联动升级**：工作台组件接入（`sireader-recent` 与 `simedia-active`）与全生态总线事件实时刷新。

### v0.48.9 (2026-10-23)
- **思阅（SiReader）与思播（SiMedia）深度联动升级**：
  - 工作台接入「思阅 · 最近阅读（`sireader-recent`）」与「思播 · 正在播放（`simedia-active`）」小组件，实时显示书架在读书目进度与正在播放的音视频标题；
  - 动作画板 `open-in-reader`（在思阅中阅读）与 `open-in-media`（在思播中打开）优先唤起上游专有播放/阅读入口，并自带 `openTab` 优雅降级。
- **小驴全生态总线事件实时刷新联动（Ecosystem Event Bus Integration）**：雷切工作台聚合监听小驴打卡（`checkin:event-recorded`）、闪卡（`lv-cards:reviewed`）、考试（`lv-exam:session-ended`）、管家（`lv-home:data-changed`）与思播/思阅事件，一旦兄弟插件产生数据变动，雷切工作台组件实时自动无感重绘！
- **第一面板门面专项深度打磨**：模式药丸全键盘循环导航、卡片操作把手平滑微动效与双色能量微光指示条。

### v0.48.8 (2026-10-23)
- **模式药丸栏键盘循环导航与输入框焦点互通（Mode Chips Keyboard Navigation）**：支持在药丸栏内通过键盘 `ArrowLeft` / `ArrowRight` 循环切换模式，按 `ArrowDown` 快速切回搜索框；在搜索框起始位置按 `ArrowUp` 智能回焦至当前模式药丸，打造纯键盘操作流。
- **卡片操作把手丝滑悬浮微交互（Card Action Buttons Smooth Transition）**：置顶（`.sw__pin`）、收藏（`.sw__fav-btn`）与关闭（`.sw__close`）把手升级为平滑微缩放与颜色过渡，彻底消除卡片悬停时的生硬闪烁感。
- **第一面板门面专项深度打磨（First Panel Masterpiece Polish）**：双色能量微光指示条（紫金渐变）、圆角胶囊分组计数与 1-9 直达立体机械键帽。

### v0.48.7 (2026-10-23)
- **第一面板门面专项深度打磨（First Panel Masterpiece Polish）**：
  - 页签卡片（`.sw__card`）与文档搜索结果行（`.sw__doc-item`）激活指示微条升级为**星际深紫至钛金雷刃能量双色渐变光芒**（`linear-gradient`）并带有柔和的辉光光晕（ambient glow），与小驴雷切品牌深度共鸣；
  - 组头标签计数（`.sw__group-count`）升级为品牌色圆角胶囊标签，增强分组层次感；
  - 卡片与文档结果行的 1-9 键盘直达角标（`[data-sw-digit]::after`）升级为立体 2px 物理机械键帽质感，键帽立体感与动作画板保持一致。
- **命令模式全生态插件动作接入（Ecosystem Commands Discovery）**：切换器命令模式（`>` 或 `》`）在既有内建动作与思源命令基础上，正式接入生态与已安装插件命令检索组（`.sw__command-group`），全面支持快门（QuickGate）、打卡（Checkin）、考试（Exam）等插件命令一键检索与回车执行。
- **中文全角穿透符号自适应（Chinese Full-Width Punctuation Adaptive Routing）**：穿透检索模型全面支持中文全角标点符号智能映射（`！` $\to$ 书签模式、`》` $\to$ 命令面板、`：` $\to$ 大纲穿透、`？` $\to$ 符号速查），桌面端与移动端模式药丸栏与输入框实时响应。

### v0.48.6 (2026-10-23)
- **命令模式全生态插件动作接入（Ecosystem Commands Discovery）**：切换器命令模式（`>` 或 `》`）在既有内建动作与思源命令基础上，正式接入生态与已安装插件命令检索组（`.sw__command-group`），全面支持快门（QuickGate）、打卡（Checkin）、考试（Exam）等插件命令一键检索与回车执行。
- **中文全角穿透符号自适应（Chinese Full-Width Punctuation Adaptive Routing）**：穿透检索模型全面支持中文全角标点符号智能映射（`！` $\to$ 书签模式、`》` $\to$ 命令面板、`：` $\to$ 大纲穿透、`？` $\to$ 符号速查），桌面端与移动端模式药丸栏与输入框实时响应，彻底解决中文输入法下符号误输入无法触发模式的体验痛点。
- **全表面 Dialog 统一品牌标题栏规范（Unified Dialog Titlebar）**：实现 `mountPlatformDialogTitleWrap`，桌面端与移动端切换器、小组件工作台、代码片段实验室与设置大窗全面装配 22×22 星际深紫底白标 + 标题文字 + 紧凑版本胶囊 + Esc 退出按键提示（`.lv-dialog-title-wrap`）。
- **工作台深空黑金星芒卡片美学落地（Midnight Black Gold Hero Tiles）**：工作台本地时钟（`external-local-time`）、世界时钟（`external-world-clock`）与深色材质（`mat-dark`）小组件全面接入午夜深空黑金底色（`.sw-home__cell--midnight`）、钛金雷刃金色微光边框与星芒反光阴影，忠实呈现参考图高能质感。

### v0.48.5 (2026-10-23)
- **中文全角穿透符号自适应（Chinese Full-Width Punctuation Adaptive Routing）**：穿透检索模型全面支持中文全角标点符号智能映射（`！` $\to$ 书签模式、`》` $\to$ 命令面板、`：` $\to$ 大纲穿透、`？` $\to$ 符号速查），桌面端与移动端模式药丸栏与输入框实时响应，彻底解决中文输入法下符号误输入无法触发模式的体验痛点。
- **全表面 Dialog 统一品牌标题栏规范（Unified Dialog Titlebar）**：实现 `mountPlatformDialogTitleWrap`，桌面端与移动端切换器、小组件工作台、代码片段实验室与设置大窗全面装配 22×22 星际深紫底白标 + 标题文字 + 紧凑版本胶囊 + Esc 退出按键提示（`.lv-dialog-title-wrap`）。
- **工作台深空黑金星芒卡片美学落地（Midnight Black Gold Hero Tiles）**：工作台本地时钟（`external-local-time`）、世界时钟（`external-world-clock`）与深色材质（`mat-dark`）小组件全面接入午夜深空黑金底色（`.sw-home__cell--midnight`）、钛金雷刃金色微光边框与星芒反光阴影，忠实呈现参考图高能质感。

### v0.48.4 (2026-10-23)
- **全表面 Dialog 统一品牌标题栏规范（Unified Dialog Titlebar）**：实现 `mountPlatformDialogTitleWrap`，页签切换器、小组件工作台、代码片段实验室与设置大窗全面装配 22×22 星际深紫底白标 + 标题文字 + 紧凑版本胶囊 + Esc 退出按键提示（`.lv-dialog-title-wrap`），彻底统一各表面弹窗视觉层级与品牌辨识度。
- **工作台深空黑金星芒卡片美学落地（Midnight Black Gold Hero Tiles）**：工作台本地时钟（`external-local-time`）、世界时钟（`external-world-clock`）与深色材质（`mat-dark`）小组件全面接入午夜深空黑金底色（`.sw-home__cell--midnight`）、钛金雷刃金色微光边框与星芒反光阴影，忠实呈现参考图高能质感。
- **小驴生态 Epoch 6 联邦规范全方位升级**：引入 `src/api/ecosystem-bridge-kit.ts`，强化第三方小组件 800ms 超时熔断与 3s 快照缓存，全链路 try-catch 单向异常隔离，绝不拖垮宿主工作台；预置打卡、考试、闪卡、拾遗、管家、人脉、常用等 7 大标准小组件；顶栏单色矢量图标升级为 `iconLvSpeedSwitch`。

### v0.48.3 (2026-10-23)
- **小驴生态 Epoch 6 联邦规范全方位升级**：引入 `src/api/ecosystem-bridge-kit.ts`，强化第三方小组件 800ms 超时熔断与 3s 快照缓存，全链路 try-catch 单向异常隔离，绝不拖垮宿主工作台；维护好 `siyuanSpeedSwitch`、`xiaolvSpeedSwitch`、`xiaolvRaikiri`、`lvRaikiri` 四别名挂载与卸载解绑。
- **预置全生态 7 大标准小组件**：内置小驴打卡习惯连击、小驴考试概览、小驴闪卡到期、小驴拾遗稍后读、小驴管家效期、小驴人脉跟进与小驴常用语，支持命令模式（`>`）快门生态命令与常用语直达搜索。
- **顶栏单色矢量图标升级**：`CARD_ICON_SPRITE` 注入与 Logo 1:1 对齐的 `iconLvSpeedSwitch`（32×32 矢量三层阶梯页签 + 穿透利落雷刃 + 能量金核点），顶栏注册图标全面对齐。
- **星际紫+午夜黑金美学 Token 注入**：引入 `--lv-brand`、`--lv-brand-soft`、`--lv-accent-gold`、`--lv-midnight-card`，工作台支持午夜深空黑金卡底色质感，按钮支持 1.5px 物理微触感，弹窗标题规范统一。
- **深层工程规范与历史排雷**：块属性收敛为命名空间前缀 `custom-lv-raikiri-*`，`plugin.json` 英文名规范为 `Lv Speed Switch`，开启 `settingsWindow: true`，最低宿主版本提升至 `3.8.4`，TypeScript 编译目标升级至 `ES2022`，补齐根目录 `CHANGELOG.md` 与 `SECURITY.md`，保持 256×256 殿堂级 `icon.png` 绝对一致。

### v0.48.2 (2026-10-22)
- **顶栏点击秒开与大长文档首屏浅克隆**：彻底废除 `wysiwyg.cloneNode(true)` 全文深拷贝，改用 `cloneNode(false)` + 仅深拷贝首屏前 6 个子块，克隆时间恒定在 0.1ms；桌面端弹窗配置 `disableAnimation: true` 消除 50ms 延时停顿，点击顶栏瞬间秒出。
- **消除全卡片二次搬迁与强制同步 Reflow**：重构 `renderList` 流式装配，直接装入 `contentHost` 容器，消除了旧代码在挂载后又拔插所有卡片的二次循环（`while (scrollElement.firstChild)`）与 `clientWidth` 引起的强制重排。
- **微任务分层调度与 Petal Lifecycle / URL Scheme 闭环**：清理缩略图孤儿缓存（`pruneThumbCache`）与零词条工作台（`renderWorkbench`）以异步微任务挂载；补齐官方 `uninstall()` 钩子，`addTopBar` 注入稳定唯一 ID，`onunload` 注销顶栏；接入 `open-siyuan-url-plugin` 外部协议路由。
