# 小驴雷切完整状态审计（2026-10-18）

任务：T-7303。审计对象为当前工作树；正式安装基线仍是 GitHub `v0.47.5`。本文取代 10 月 7 日审计中的“当前状态”，不覆盖历史验收记录。

## 结论与证据等级

插件核心路径已接入生产，但不能宣称全部功能、全部端侧及原型效果均已交付。本轮发现并修复待办目标态、移动 CSS 层叠、拖拽/拉伸生命周期、格式化器、JSON 导入和 Agent 计划执行接线问题。修复尚未发布。

| 标签 | 含义 |
| --- | --- |
| implemented | 可从生产入口到达，有实现；不自动等于真实环境可用 |
| locally tested | 类型、模型、真实生产函数隔离回归或构建通过 |
| browser tested | Chrome 受控 UI/模拟 store 验证；不是思源写入或 Android 证据 |
| real host partial | 有指定版本的隔离思源证据；不代表最新 UI、全部主题或长期工作区验收 |
| blocked / conditional | 依赖设备、真实账号、服务、提供方或配置 |
| prototype only / model only | 只有演示或纯模型，无对应生产交互 |

本轮采用源码、生产依赖图、单元/行为测试、Chrome 受控点击及 GitHub API 对账。没有在日常工作区执行写入验收，也没有把历史截图当作本轮修复后的最终宿主截图。

## 版本、源码与发布分界

- 本地 `main`：`f0046c06`，领先 `origin/main` 15 个提交；还有未提交修改。全部保留，本轮未 commit、push、merge 或发布。
- 远端 main：`2935818bb800b97c3ce52045d214e40fa21dc997`；正式 tag `v0.47.5` 解析为 `889de0d771dbd634723158962fa47d939f6f562a`。
- 正式资产：591,166 B；SHA-256 `74255348edf6da2f87b779835436f4a1fe5fc85588f0cd161f5703caa3f088b4`。
- 当前 metadata 仍为 `0.47.5`，不能据此把本地修复认作已在 Release 中。当前本地产物数值见 [readiness](release-readiness.md) 顶部快照。
- 集市同步、另一台电脑安装、个人安装更新仍未完成。

## 逐功能可用性

| 功能 | 当前状态 | 使用前置或未完成部分 |
| --- | --- | --- |
| 桌面切换器、数字直达、MRU/六种排序、置顶、分栏 | implemented / locally tested / real host partial | 最新主题、200% 缩放、人工最窄 Dock 与读屏仍待验收 |
| 收藏/分组、最近打开/关闭、日记入口、文档集保存恢复 | implemented / locally tested / real host partial | 写入、恢复与返回现场已有隔离思源证据（含 document-sets.spec.mjs、favorites-flow.spec.mjs 与 recent-closed-flow.spec.mjs 闭环）；长期大工作区现场仍待持续观测 |
| 已开页签→已开文档内容→全库标题/受限全文 | implemented / locally tested / real host partial | API 缺失时降级；不替代原生搜索，也不承诺全库无限结果 |
| 笔记本、类型、方式、排序与路径筛选、保存筛选 | implemented / locally tested / real host partial | 桌面路径端点已有 200/22ms 及防御契约，245px 最窄 Dock 控件可达已取证（T-7311）；移动块定位及未知旧宿主语义继续待证 |
| 右侧内容预览、预览内查找、取消/失败重试 | implemented / locally tested | 预览窗格长内容截断防溢出与读屏 aria-live 回执契约已加固（T-7316）；当前真实主题仍待持续复验 |
| 移动切换器、排序/分组 sheet、焦点恢复 | implemented / locally tested | 底部 Sheet 模态声明（role=dialog、aria-modal）、Escape/Backdrop 拦截及焦点安全恢复契约已加固（T-7319）；真实 Android 触控仍按 B-004 后置 |
| 工作台查看/编辑、尺寸、重排/长按、拉伸、撤销重做 | implemented / locally tested | 七档 Bento 尺寸归一化、X 英雄位与焦点环契约已固化（T-7314）；真实 Android 手势待验收 |
| 工作台空态、缓存/陈旧、失败/重试、健康诊断 | implemented / locally tested / real host partial | 服务在线与数据健康取决于每个组件，健康诊断与定向重试过滤契约已加固（T-7320） |
| 组件商店搜索、来源、预览、配置、尺寸、添加/移除 | implemented / locally tested | 生产仍为独立 Dialog；440px 内嵌 Gallery Sheet 未实现 |
| 第三方 provider 注册、卸载占位、恢复、孤儿配置 | implemented / locally tested / browser tested（受控 Chrome 9/9） | 7 阶段全生命周期状态机、白名单约束与孤儿配置/布局协同隔离契约已加固（T-7323）；至少一个真实提供方跨表面全生命周期验收仍不足；B-010 |
| 来源/网络/鉴权三维统计与过滤扩展（T-7293 / T-7309） | implemented / locally tested | 已在商店根节点及卡片 dataset 贯通来源、网络与鉴权三维元数据及聚合统计；已有来源组/徽标可用 |
| 桌面片段目录、分组、草稿、查找替换、撤销、冲突 | implemented / locally tested | 编辑器为 textarea + 行号；完整语法高亮/CodeMirror 未交付 |
| CSS 格式化与光标映射 | implemented / locally tested | 轻量零依赖格式化与光标追踪，@keyframes/变量/嵌套伪类契约已加固（T-7321）；JS 格式化未开放 |
| CSS 预览、已保存/草稿对照、AI 候选差异 | implemented / locally tested | 沙箱预览禁止 JS 与外部网络；不表示保存到宿主后的原生片段也处于该沙箱 |
| CSS/JS 文件导入、导出、回收站、备份/恢复 | implemented / locally tested | 单文件进入禁用草稿；备份恢复按预览确认及读回合同运行 |
| JSON Merge/Fork/Overwrite | implemented / browser tested / real host partial | 直接写原生列表；Merge 保留已有启用状态、新条目采用导入状态；Fork 禁用；Overwrite 替换集合并采用导入状态。已有 snippet-import-save.spec.mjs 隔离宿主闭环证据 |
| Gist 预览/导入/发布 | implemented / conditional | 受控响应与宿主交互有证据；真实 GitHub 账号写权限及回执仍 B-008，unlisted 不等于 private |
| 片段 AI 上下文授权、SSE、取消、候选接受/导出 | implemented / conditional | 受控 SSE 已验证；真实 provider、费用、配额、在线质量仍 B-011 |
| 移动片段实验室 | 未开放 | 生产入口直接返回；原型手机视图不代表可用功能 |
| JS 预览运行器 | blocked（产品安全边界） | 不提供执行；原生启用/导入 JS 与预览运行器是两条不同路径 |
| 悬浮球、动作网格、拖动/贴边、更多、设置 | implemented / locally tested | 自由停放、视口几何越界收敛与动作网格调度契约已加固（T-7322）；Android 与真实 provider 生命周期待验收 |
| 设置搜索、十标签、当前值/回执、配置包 | implemented / locally tested | 多 key 应用逐项回执，白名单清洗与防原型污染已加固（T-7315）；真实读屏与跨设备升级待验收 |
| 存储净化、18 key 迁移/容量、防抖与卸载 flush | implemented / locally tested | 存储迁移管道容灾演练、18 Key 形状分类与疑似降级保护契约已加固（T-7317）；长期同步待持续观测 |
| Agent 只读上下文、搜索、组件/诊断快照 | implemented / locally tested | 需宿主支持 Agent API；不具备 API 的宿主不可用 |
| Agent 单文档/批量打开、计划生成/执行及受控写入 | implemented / locally tested | `agentActionsEnabled` 与宿主确认控制；创建文档已实现内核原生 ID 直读与同名防御闭环；真实批准/拒绝/权限/超时仍需专门验收 |
| 社区片段目录、家族快速捕获 | conditional / blocked | B-009 缺真实目录与维护者；B-010 缺提供方稳定接收命令；不伪造入口成功 |

## UI 一致性与原型映射

检查维度包括入口、前置条件、点击回执、空态、错误与重试、取消、长内容、焦点/禁用、响应布局和持久化。源码及现有回归覆盖这些合同；本轮 Chrome 受控点击覆盖 JSON 导入 7/7，以及第三方组件商店/工作台生命周期 9/9。两者都使用隔离或高保真桩，不是思源写入、Android 或真实 provider 证据。视觉和无障碍结论不扩大为全页面人工验收或 WCAG 合规认证。

| 项目 | 生产情况 | 审计判断 |
| --- | --- | --- |
| 平台导航、上下文、关闭/返回、状态语言 | 三表面复用 PlatformShell 与领域命令；思源 token + 平台别名 | 已实现；旧/新 SCSS 多层覆盖仍需以计算样式核验 |
| 切换器网格、数字键帽、预览窗格 | 保留生产结构和宿主行为 | 已体现；不因原型极简演示删除成熟能力 |
| compact 查看/编辑分离、Bento 多尺寸 | 已实现；本轮解除旧 `!important` 单列覆盖 | locally tested；最新真实窄屏/主题待验收 |
| 待办即时勾选、划线、失败回滚 | 已修复目标态双重取反与 Promise 回滚 | locally tested；保持 14px 内芯，触控命中 44×44px |
| 等宽时钟与可选跳秒 | `showSeconds`、秒级心跳及 tabular-nums 已实现 | 部分体现；晴朗呼吸光晕仍 prototype only |
| 晶体微切光、机械键帽、焦点光环、流光进度 | 对应生产 token/样式已落地，有 reduced-motion 与高对比度（T-7318）合同 | 已实现；不将静态规则通过当作所有主题视觉通过 |
| 噪点开关、Spotlight 鼠标跟随、3D tilt | 原型有实现，生产无对应设置/追踪处理器 | prototype only，未交付 |
| 沉浸式画廊/Gallery Sheet | 商店预览与卡片已优化；生产仍 new Dialog | partial；440px 内嵌抽屉未开发 |
| 移动极简顶栏 | 当前保留 header/context/navigation 各层 | partial；与原型并非像素级一致 |
| 三栏片段编辑器、语法高亮 | 三栏、行号和安全预览已实现；textarea 无语法着色 | 结构已体现，高亮未实现 |

ADR 0218 与 T-7298 原先把“带语法高亮”“新增噪点开关”“晴朗光晕”等方向写在完成叙述中；本轮已补生产落地范围说明。它们不能继续被用作这些效果已交付的证据。T-7293 纯模型及 T-7309 UI 元数据接线已实现。

Chrome 证据：[JSON 导入 7 项结果](../.artifacts/ui-audit-json-import/results.json)、[导入覆盖确认截图](../.artifacts/ui-audit-json-import/overwrite-dialog.png)和 `tests/third-party-lifecycle-browser-smoke.cjs` 的受控 Chrome 9/9 回执。两类浏览器证据都使用假原生 store/高保真宿主桩，无思源 API 写入或真实 provider 账号。此前 375/700px compact 截图、3.8.6 dock、3.8.7 组件实测是历史 partial 证据，不覆盖本轮所有改动。

## 本轮修复与仍存在的代码边界

| 项目 | 处理 |
| --- | --- |
| 待办目标态和失败回执 | 修复双重取反；传递显式 done；false/reject 回滚，成功写入后的读回失败不误回滚 |
| 移动布局、触控与预览样式覆盖 | 修复 R54 双列被旧样式覆盖；补 44px checkbox 命中区与相应契约 |
| resize 与 drag/hold 生命周期 | pointercancel/Escape 取消；重绘/销毁清理全局监听、定时器与 RAF；finish 幂等 |
| CSS 格式化 | 保留字符串空格、声明注释、data URI 分号/大括号及 @import URL |
| JSON 导入未接生产 UI | 接入三模式选择与一次 restoreSnapshot，保留原列表顺序，遵守快照冲突保护；销毁回调不覆写宿主 destroy |
| JSON 文案误导 | 入口改“导入文件”，确认改“导入片段包”，明确启用状态与覆盖语义；成功/非法包使用专用文案 |
| Agent 计划单目标失效 | 计划输出 ids，旧处理器读 id；生产执行现经过 normalize/executor |
| Agent schema/任务读取 | 补 notebook/title/markdown/content schema 与载荷校验；任务兼容 i/p 块；本地取消 signal 从 runner 传到处理器 |
| 开发依赖漏洞 | terser-webpack-plugin 5.3.16→5.6.1；serialize-javascript 7.1.2、source-map-js 1.2.2、postcss-selector-parser 7.1.6；审计 5→0，全部是开发工具链，非已确认运行时漏洞 |
| 语言重复 key 与旧审计误判 | 原 duplicate 检查在 JSON.parse 后比较 Object.keys，恒真；改为解析源属性后识别重复，发现并清除中文 snippetProbeTagC 和英文 quickCaptureUnknown 重复定义。release 审计改读当前账本；diff --check 不再误称“工作树干净” |

仍需跟踪：入口文件体积与多层 SCSS 带来的维护成本；真实长期会话、内存趋势、大库尾部性能和提供方生命周期不能由单测数量代替。

旧 integration/quality 批次脚本中仍有大量文件存在/关键词清单检查；本轮已取消“包含 consume 就证明一次执行”的错误命名。它们通过只表示结构清单满足，不能证明重放保护、凭据绝不泄露或所有边界正确；关键行为须依赖实际函数回归及宿主证据。

## GitHub 未处理项

| 项目 | 当前事实与下一步 |
| --- | --- |
| Issues | 开放 0；这不等于本地审计无缺口 |
| [PR #14](https://github.com/ai68298100/siyuan-speed-switch/pull/14) | actions/setup-node v4→v6，OPEN、MERGEABLE/CLEAN；仅 10 月 8 日旧基线检查成功。需要更新到当前 main、重跑 CI 后评估合并，本轮未合并 |
| [main CI](https://github.com/ai68298100/siyuan-speed-switch/actions/runs/39007110919) / [Release](https://github.com/ai68298100/siyuan-speed-switch/actions/runs/39006792463) | 均成功；只覆盖远端对应提交，不覆盖本地 15 提交和未提交修复 |
| main 保护 | protection API 404、rulesets=[]；尚无强制状态检查/禁止 force-push 与删除规则，建议在当前协作发布策略下单独配置 |
| 私密漏洞报告 | enabled:false；SECURITY 已纠正文案，开启仍是远端治理事项 |
| 依赖安全 | 本地 pnpm audit 现为 0；修复未推送，远端仍需随候选整体验证交付 |
| 包体 | 正式包距 591,872 B 仓库线仅 706 B；本地快照独立测量，不能按旧余量持续堆功能 |

## 剩余验收与执行顺序

1. P1：将当前修复作为独立候选，在隔离思源补五条主路径：切换/收藏再找/搜索失败回退/文档集恢复/片段导入与取消、安全保存。JSON 与 Agent 写回尤其需要真实宿主证据。
2. P1：完成 B-005 最新浅深主题、200% 缩放、最窄 Dock、读屏及动态播报；B-004 Android 安装升级、Back/软键盘/旋转/拖动仍 blocked。
3. P1：处理 PR #14 当前基线 CI、分支保护及私密报告设置；按授权的发布流程交付当前修复。当前不自动 push/merge/改仓库远端设置。
4. P2：补 `inbox-shorthands` 来源事实与至少一个真实 provider 的跨表面生命周期；B-007 ActivityWatch、B-008 Gist、B-011 AI 真实服务按环境单项验收。
5. P2：把噪点/Spotlight/3D、Gallery Sheet、高亮等原型差距转成有验收标准的候选；先有任务价值与预算依据，再实施。T-7144 保持进行中，不以装饰效果数量宣布阶段完成。

## 验证回执

最终命令结果、产物与负向验证汇总见当期账本 T-7303。新增或修改契约遵循 [门禁审查](gate-audit-checklist.md)，进行了真实违规注入、精确失败和字节恢复。局部测试、Chrome 夹具与真实宿主证据分开记录。

## 附：58 项生产组件逐项登记

下表由当前 `DEFAULT_MODULES → normalizeModuleDefinition` 生成。ready 表示本地/宿主可运行实现，仍可能需要用户数据或基础配置；conditional 需要宿主上下文/配置；external 需要网络、服务或提供方。模型支持端不等于该端真实验收。所有 58 项都有本地契约，未逐项获得真实端到端认证。

| 组件 | moduleId | 模型就绪 | 声明支持端 | 当前可用前置/证据 |
| --- | --- | --- | --- | --- |
| 近期文档 | `recent-documents` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 今日日记 | `today-journal` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 今日待办 | `today-tasks` | conditional | 桌面/侧栏/手机 | 需日记/任务数据；本轮目标态修复未做真实写回复验 |
| 指定文档 | `fixed-document` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 收藏 | `favorites` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 文档集 | `document-sets` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 标签 | `tags` | ready | 桌面/侧栏/手机 | 已有 3.8.7 隔离宿主证据；只打开原生标签入口，不保证精确选中 |
| 书签 | `bookmarks` | conditional | 桌面/侧栏/手机 | 已有 3.8.7 隔离宿主证据；需要书签数据 |
| 本月日记 | `journal-monthly` | conditional | 桌面/侧栏/手机 | 需对应配置/活动上下文/宿主数据，未配置时应显示空态 |
| 笔记统计 | `note-stats` | ready | 桌面/侧栏/手机 | 已有 3.8.7 隔离宿主证据；含合法零值 |
| 年度进度 | `year-progress` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 时间与日期 | `external-local-time` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 世界时钟 | `external-world-clock` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 近期天气 | `external-weather-open-meteo` | external | 桌面/侧栏/手机 | 需真实网络/端点/凭据或 provider；逐端在线验收未完成 |
| 空气质量 | `external-air-quality` | external | 桌面/侧栏/手机 | 需真实网络/端点/凭据或 provider；逐端在线验收未完成 |
| 每日放送 | `external-anime-bangumi` | external | 桌面/侧栏/手机 | 既有 3.8.6 在线 partial 证据；非长期服务保证 |
| 热搜事件 | `external-hot-news-dailyhot` | external | 桌面/侧栏/手机 | 需真实网络/端点/凭据或 provider；逐端在线验收未完成 |
| Hacker News 热门 | `external-news-hackernews` | external | 桌面/侧栏/手机 | 需真实网络/端点/凭据或 provider；逐端在线验收未完成 |
| 服务状态 | `external-status-uptimekuma` | external | 桌面/侧栏/手机 | 需真实网络/端点/凭据或 provider；逐端在线验收未完成 |
| 汇率参考 | `external-fx-frankfurter` | external | 桌面/侧栏/手机 | 需真实网络/端点/凭据或 provider；逐端在线验收未完成 |
| 未读文章 | `external-rss-miniflux` | external | 桌面/侧栏/手机 | 需真实网络/端点/凭据或 provider；逐端在线验收未完成 |
| RSS 订阅 | `external-rss-subscription` | external | 桌面/侧栏/手机 | 需真实网络/端点/凭据或 provider；逐端在线验收未完成 |
| iCal 日程 | `external-ical-events` | external | 桌面/侧栏/手机 | 需真实网络/端点/凭据或 provider；逐端在线验收未完成 |
| GitHub 贡献 | `external-github-contrib` | external | 桌面/侧栏/手机 | 需真实网络/端点/凭据或 provider；逐端在线验收未完成 |
| 每日引言 | `external-quote-daily` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 设备电量 | `external-device-battery` | ready | 桌面/侧栏 | 取决于宿主 Battery API；手机不支持 |
| 实时资讯 | `external-news-newsnow` | external | 桌面/侧栏/手机 | 需真实网络/端点/凭据或 provider；逐端在线验收未完成 |
| 使用时长 | `external-activitywatch-time` | external | 桌面/侧栏 | 需本机 ActivityWatch；B-007 未启动，真实使用未验收 |
| 近期编辑 | `recent-edits` | ready | 桌面/侧栏/手机 | 已有 96 文档隔离规模观测；大库/真人频率未证明 |
| 闪卡待复习 | `flashcard-due` | conditional | 桌面/侧栏/手机 | 需对应配置/活动上下文/宿主数据，未配置时应显示空态 |
| 随机回顾 | `random-review` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 快速记录 | `quick-capture` | conditional | 桌面/侧栏/手机 | 需对应配置/活动上下文/宿主数据，未配置时应显示空态 |
| 剪藏待读 | `clipped-unread` | external | 桌面/侧栏/手机 | 需剪藏插件/adapter；提供方缺失时不可运行 |
| 往年今日 | `on-this-day` | conditional | 桌面/侧栏/手机 | 需对应配置/活动上下文/宿主数据，未配置时应显示空态 |
| 今日写作 | `today-writing` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 近期写作活跃度 | `recent-writing-activity` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 近期日记 | `recent-daily-notes` | conditional | 桌面/侧栏/手机 | 需对应配置/活动上下文/宿主数据，未配置时应显示空态 |
| 文档关系摘要 | `document-relations-summary` | conditional | 桌面/侧栏/手机 | 需活动文档；轻量摘要，非完整反链图 |
| 当前文档大纲 | `current-document-outline` | conditional | 桌面/侧栏/手机 | 需活动文档；已有 3.8.7 隔离证据 |
| 近期预约 | `today-reservations` | conditional | 桌面/侧栏/手机 | 需对应配置/活动上下文/宿主数据，未配置时应显示空态 |
| 日历月视图 | `journal-calendar` | conditional | 桌面/侧栏/手机 | 需对应配置/活动上下文/宿主数据，未配置时应显示空态 |
| 写作打卡 | `writing-streak` | conditional | 桌面/侧栏/手机 | 需对应配置/活动上下文/宿主数据，未配置时应显示空态 |
| 倒数日 | `countdown` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 插件命令 | `plugin-commands` | conditional | 桌面/侧栏/手机 | 需对应配置/活动上下文/宿主数据，未配置时应显示空态 |
| 打卡摘要 | `checkin-summary` | external | 桌面/侧栏/手机 | 需小驴打卡真实 provider；跨端完整生命周期待验收 |
| 今日打卡 | `checkin-today` | external | 桌面/侧栏/手机 | 需小驴打卡真实 provider；跨端完整生命周期待验收 |
| 连续记录 | `checkin-streak` | external | 桌面/侧栏/手机 | 需小驴打卡真实 provider；跨端完整生命周期待验收 |
| 打卡热力图 | `checkin-year-heatmap` | external | 桌面/侧栏/手机 | 需小驴打卡真实 provider；跨端完整生命周期待验收 |
| 本周打卡 | `checkin-weekly` | external | 桌面/侧栏/手机 | 需小驴打卡真实 provider；跨端完整生命周期待验收 |
| 近期事项 | `checkin-occasions` | external | 桌面/侧栏/手机 | 需小驴打卡真实 provider；跨端完整生命周期待验收 |
| 本月打卡 | `checkin-monthly` | external | 桌面/侧栏/手机 | 需小驴打卡真实 provider；跨端完整生命周期待验收 |
| 置顶文档 | `pinned-docs` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 收集箱 | `inbox-shorthands` | external | 桌面/侧栏/手机 | 依赖思源云端收集箱（siyuan-cloud / remote / host auth）；元数据已在 T-7305 对齐 |
| 最近更新 | `recent-updates` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 数据健康 | `data-health` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 数据库 | `database-list` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 已存筛选 | `saved-searches` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
| 数据库表格 | `database-table` | ready | 桌面/侧栏/手机 | 实现可用；需要相应配置或数据，真实端侧完整验收未完成 |
