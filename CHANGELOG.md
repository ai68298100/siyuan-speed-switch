# 小驴雷切（Lv Speed Switch）更新日志

完整中英文版本更新历史请参阅：
- 中文完整日志：[docs/CHANGELOG.md](docs/CHANGELOG.md)
- 英文完整日志：[docs/CHANGELOG.en-US.md](docs/CHANGELOG.en-US.md)

---

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
