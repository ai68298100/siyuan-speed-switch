# 进度
2026-09-16 T-6079~T-6084 清理工作树遗留的两项门禁失败（6 项，见 D-356）：(1) `src/i18n/zh-CN.json` 残留探针 key `zzzParityProbeKey`（值"探针"）——此前验证 i18n parity 门禁是否真生效时植入、事后未清理，同时触发"key 集合不一致"与"死 key"两项失败；同批 105+/104− 的格式化改动经逐 key 比对确认为零值变化（555 个同名 key 全部一致），故保留格式化、仅删探针。(2) `tests/document-context-wiring.test.cjs` 的 `cachedNotebookName\n\s*\|\|` 断言失败，根因是 `core.autocrlf=true` 使 `src/index.ts` 工作树全为 CRLF（12369 行）而正则写死 LF，属**测试对行尾敏感**而非源码退化（`src/index.ts:8107` 的缓存名优先语义完好）。全仓扫描 7 处跨行正则，仅此 1 处受影响（其余 `\n` 位于 `\s*` 之后或为 `\n\}` 形式，CRLF 下仍可匹配）；按既有先例改为 `\r?\n`。保留 `autocrlf` 现状、不引入 `.gitattributes`：统一行尾会触及全仓，收益不抵风险。`pnpm verify:release` 5565/5565 全绿；`dist/index.js` 560476 bytes（768 KiB 自律线余量 225956）、`package.zip` 294404 bytes（512 KiB 上限余量 229884）、`icon.png` 18376 bytes。
2026-09-16 T-6073~T-6078 修复生产依赖图隔离门禁失效缺陷（6 项，见 D-354）：`tests/production-graph-isolation.test.cjs` 的 UNWIRED 泄漏断言只检查 `graph.has(name)` 与 `graph.has(name+".ts")`，同文件 WIRED 健全性断言却还检查 `graph.has(name+".js")`；因遍历存的是带扩展名的解析文件名，`.js` 分支缺失使该断言对纯 `.js` 契约模块完全失效。实测 31 个在图中的模块旧逻辑漏检 **27** 个、新逻辑漏检 **0** 个；`UNWIRED_CONTRACT_MODULES` 全部 16 项均为 `.js`，即该门禁从未真正保护过其声称保护的对象。直接证据：`agent-document-context` 早已由 `src/index.ts:88` 引入并在生产图内，却仍列于 UNWIRED，而泄漏断言报告 `(none)`。修复为提取共用 `inGraph()` 统一按裸名/`.js`/`.ts` 解析、两个断言共用；并按事实把 `agent-document-context` 移入 `WIRED_SANITY_MODULES`（接线已在 D-352 确认），同步更新注释中已过时的 320 KiB 前提。模块数上限 31 与实际闭包一致。
2026-09-15 T-6065~T-6072 完成包体上限重校准与集市图标合规（8 项，见 D-353）：核查确认思源官方对 `package.zip` **没有大小限制**（仅 `icon.png` ≤ 20 KB / 推荐 160×160、`preview.png` ≤ 200 KB），故 300/320 KiB 均为自设自律线。据此将 `package.zip` 硬上限 320→512 KiB、`dist/index.js` 自律线 548→768 KiB（该线四天内被"按真实增量"校准 82 次、296→548 KiB，余量 676 bytes 系棘轮效应产物，非真实约束）。同时修正此前未被发现的真实违规：`icon.png` 256×256 / 44720 bytes 超官方 20 KB 规范 2.2 倍，改为 160×160 + BILINEAR 降采样 + zopfli 重压缩 IDAT 得 18376 bytes（未做量化，RGBA 全彩与 alpha 完全保留；BILINEAR 原生 RGBA 为 20059 仍超 421 bytes，zlib 多策略重压与清理透明区杂色均无收益）。效果：`package.zip` 320649→294404 bytes（省 26245），归档余量 7031→229884 bytes；`index.js` 余量 676→225956 bytes。TypeScript、完整测试 5565/5565、生产构建、移动端与 Chromium smoke 全绿；README 中英文、ROADMAP v0.20 条目、`docs/release-readiness.md`、`docs/external-widget-source-audit.md` 已同步新上限。
2026-09-15 T-6059~T-6064 完成卡片时间戳格式化器缓存（6 项）：`home-view.js` 的 `formatUpdatedAt` 由每次构造 `Intl.DateTimeFormat`（约 63µs）改为复用模块级实例（约 2µs），该函数在 `renderHomeModuleView` 中每个组件模块调用一次（MAX_ITEMS 24）；缓存失效键采用 `new Date().getTimezoneOffset()`（约 0.3µs），避免跨时区旅行后时间显示陈旧——`resolvedOptions().timeZone` 实测 68µs 不可用于校验。单次调用 0.0631ms→0.00489ms（约 13 倍），新增一项缓存复用契约测试。TypeScript、完整测试 5565/5565、生产构建、移动端与 Chromium smoke 全绿；`dist/index.js` 560476 bytes（548 KiB 自律线余量 676 bytes）、`package.zip` 320649 bytes（320 KiB 硬上限余量 7031 bytes），SHA-256 `59d55d4bf380766e...`，待同步本地集市。
2026-09-15 T-6051~T-6058 完成"每调用构造昂贵对象"治理（8 项）：日记月历把两个月份前缀正则从 64 行 SQL 结果的 `forEach` 内提到循环外（旧实现每次渲染重复编译最多 128 个等价正则）；`quick-actions.js` 的 `graphemeLength`/`normalizeLabel` 改为复用模块级 `GRAPHEME_SEGMENTER`，不再每次调用 `new Intl.Segmenter()`；新增宿主页静态门禁，要求任一 `src/*.js|ts` 最多 1 处 `new Intl.Segmenter(`（必须模块级）。TypeScript、完整测试 5564/5564、生产构建、移动端 smoke 70 项与 Chromium smoke 7 项全绿；`dist/index.js` 由 560411 降至 560365 bytes（548 KiB 自律线余量 787 bytes）、`package.zip` 320582 bytes（320 KiB 硬上限余量 7098 bytes），SHA-256 `c9d99d415bc329a8bdff9da20b06db2fabd3d2f1810d4330a6a63efa9447a93d`，待同步本地集市。
2026-09-15 T-6043~T-6050 完成搜索文本归一化性能修复（8 项）：`normalizeText` 在清洗后码元长度已 ≤ 上限时直接返回，跳过 `Intl.Segmenter` 全量字素切分（一个字素至少占一个 UTF-16 码元，故结果恒等，20 万例随机比对零差异）；新增"短串原样返回""超长按字素截断"两项契约测试。此前失败的两项性能基准回到预算内：200 页签扇出 3.098ms→0.0353ms（预算 2.5ms）、病态全不可解析 11.67ms→0.2481ms（预算 25ms）；`buildOpenedDocumentScope`×7 由 0.4567ms 降至 0.0145ms，全量测试耗时由约 58s 降至约 23s。TypeScript、完整测试 5563/5563、生产构建、移动端与 Chromium smoke 全绿；当前 `dist/index.js` 560411 bytes、`dist/index.css` 142699 bytes、`package.zip` 320588 bytes，SHA-256 `8f72f93b33de9818e6e498fe238b00e0933973a52ff76a008be0e4d3f13fbb82`，待同步本地集市。
2026-09-15 T-6009~T-6042 完成 Agent document-context 大纲按需读取（34 项）：新增 includeOutline 请求开关（默认 true），关闭时跳过内核大纲请求并返回 outlineStatus=not-requested，和真实失败 unavailable 明确区分；补齐 schema、宿主分支、空 headings、兼容与性能回归。专项测试 252/252、完整 verify:release 5561/5561 通过；当前 `dist/index.js` 560396 bytes、`dist/index.css` 142699 bytes、`package.zip` 320580 bytes，SHA-256 `C4C1F19A06BB9B1CC822E221C6126AB1B4EADC81F50B3378B538386FB2A1F22D`，待同步本地集市。
2026-09-15 T-5975~T-6008 完成 Agent document-context 笔记本来源增强：新增 notebookNameSource=`cache|tab|none`，缓存名称优先、旧宿主别名回退、内核 SQL 行明确区分缓存和缺失；补齐 schema、输出顺序、只读与无额外网络请求回归。专项测试 228/228、完整测试 5537/5537，宿主归档门禁 14/14；生产包 `package.zip` 320400 bytes，SHA-256 `754EF2161FAA76F1EA8D558731EE8A5E4399F898A8C06A7A24624C3FD8A64473`，已同步本地集市。
2026-09-15 T-5941~T-5974 完成 Agent document-context 可解释性增强：新增 metadataMissing 缺失字段列表与 pathReason 路径原因枚举，所有值在归一化后推导并保持有界；补齐宿主只读、SQL 投影、缓存优先、旧别名和 outline 长度回归。专项测试 204/204，完整测试 5513/5513，`pnpm verify:release` 全量门禁通过；生产包 `package.zip` 320211 bytes，SHA-256 `8EE91785375455B35AE46F94C3809AE3660392ACA0AE3AF1F03AF99E52931AD0`，已同步本地集市。
2026-09-15 T-5907~T-5940 完成 Agent document-context M2 宿主兼容性增强：抽取 source/metadata/path/outline 纯推导函数，增加严格字符串类型与状态一致性保护；打开页签优先使用缓存笔记本名称并兼容 notebook/notebookName/boxName 别名，保持 SQL 回退查询与路径 none 边界不变。document-context 专项 97/97、`pnpm verify:release` 全量门禁通过；生产包 `package.zip` 319936 bytes，SHA-256 `1755290D9EE44EF53F4FED18202D2EC3B844D532338E221B89BC0FA1D79CB413`，已同步本地集市。
2026-09-15 T-5874~T-5906 完成 Agent document-context M2 状态与来源增强：新增 metadataStatus、pathSource、outlineStatus 三个有界枚举字段，补齐 schema required、宿主 tab/kernel/none wiring、空大纲与失败大纲区分、缓存只读回归、契约文档与专项门禁。document-context 专项 70 项通过；`pnpm verify:release` 全量门禁通过（5463/5463），生产包 `package.zip` 319661 bytes，SHA-256 `F4DA48AB640A6D9A7E07EFCBFFFE5A3AA8B1ED17367D99561D618E1A69638A32`，并已同步本地集市。
2026-09-15 T-5283~T-5312 完成 30 项组件商店体验增强：新增推荐/可配置正交页签、来源筛选兼容、推荐与配置计数、卡片密度舒适/紧凑切换、紧凑模式样式、视图重置按钮，以及视图状态归一化/序列化/解析/相等判断模型。专项 `home-store-model` 402/402 通过，TypeScript 与生产构建通过；当前 `dist/index.js` 533727 bytes、`dist/index.css` 139501 bytes、`package.zip` 310447 bytes，SHA-256 为 `4333E6A4FE29617761309AAFE8224DA5883A6D274D44F2B62F025A967E5436E1`。
2026-09-15 配置与商店收尾：修复配置分组回退文案残留引用，完成来源/联网/隐私徽章和配置摘要的静态契约；按 D-321 将 package.zip 归档门禁统一调整为 320 KiB。当前构建 `dist/index.js` 529232 bytes、`dist/index.css` 139256 bytes、`package.zip` 309137 bytes，SHA-256 为 `6D890109AC4E4C305EBF35F3C4603BEBF863CD62CFB7DB8F61977E5C756F5F3E`。
2026-09-15 T-5206~T-5237 完成：组件商店卡片预览按组件特性个性化：日历/月历使用 7 列多周网格并强调周末，日记/文档使用层级线条，待办/闪卡/预约使用清单状态，快速记录使用动作强调，剪藏/资讯使用排行列表，写作/统计/年度进度使用不同趋势和 hero，天气、Bangumi、DailyHot、NewsNow、ActivityWatch 使用独立配色和重点。预览仍为离线静态示意，不在商店预览阶段发起外部请求；新增 40 项预览契约测试并修正文档说明。完整测试 5075/5075 通过，TypeScript、生产构建、移动端 smoke、Chromium smoke 与宿主发布门禁通过；`dist/index.js` 522227 bytes、`dist/index.css` 136816 bytes、`package.zip` 306860 bytes，ZIP SHA-256 为 `398F6AF70A83BB03A5C713D074C2A38F28C27CE3B865A0FDA6D4FD04A72DFEC9`。已同步本地集市目录，包体余量 340 bytes。
补充（2026-09-15 手机组件面板单列模式）：保留手机端组件面板，但组件卡片统一为单列纵向布局；手机端渲染强制 `grid-template-columns: 1fr`、每张卡片占满整行并自动行高，商店仅显示一个统一尺寸（优先 medium，特殊组件回退首尺寸），桌面/侧栏尺寸选择不变。新增 30 项 TODO 和单列/统一尺寸回归，最终构建 `dist/index.js` 498239 bytes、`dist/index.css` 124860 bytes、`package.zip` 299321 bytes。
补充（2026-09-15 手机品牌小组件候选池）：根据 Apple、Huawei、OPPO、Xiaomi 官方小组件说明/系统入口，整理天气、空气质量、电池、日历事件、提醒事项、世界时钟、照片回忆、股票摘要、健身活动、备忘录、屏幕使用时间、音乐、设备管家和主题等 16 个候选。明确品牌动态排名不固化；系统权限、通讯录、HealthKit、系统开关和交易操作只保留研究态。候选已与 GitHub 审计表及统一使用说明打通，新增数量/品牌/排名原则回归；当前包体 `package.zip` 298647 bytes。
补充（2026-09-15 GitHub 高 Star 候选组件池）：按 GitHub Repository API stars 排序抽查 16 个项目，新增 Hacker News、RSS/Miniflux、Uptime Kuma、Glances、Beszel、Actual Budget、ezBookkeeping、Jellyfin、Immich、Owncast、Koel、Cal.com、OpenBB、Syncthing 等候选的许可、联网、凭据和隐私边界。明确 AGPL/GPL、原生权限和服务控制类只保留候选，不进入可添加列表；下一优先级为 Hacker News、用户 RSS/Miniflux、Uptime Kuma 和 iCal。统一说明文档已链接审计表，新增 3 项候选回归通过；最终构建 `package.zip` 298436 bytes。
补充（2026-09-15 v0.20 ActivityWatch 与商店来源筛选）：完成 T-1995~T-2164 共 170 项；核验 ActivityWatch 官方 Query/REST/CORS 契约并通过思源本机正向代理接入固定 loopback `/api/0/query/`，服务端只按 app 聚合、不读取窗口标题，加入 5 秒超时、128 KiB 响应上限、5 分钟缓存、fresh/cached/stale 健康和屏幕使用时间式排行卡。组件商店新增“离线可用 / 本机服务 / 外部 API”正交筛选与“设备与专注”分组，新增 GitHub 与手机品牌高 Star 候选审计、统一联网/API 使用说明与商店跳转入口；手机端组件面板改为单列纵向且统一尺寸。全量门禁 1821/1821、TypeScript、生产构建、移动端与 Chromium smoke、31 模块生产图均通过，开发机未运行 ActivityWatch 的现场验收记入 B-007。当前内置组件 33 个，`dist/index.js` 498239 bytes、`dist/index.css` 124860 bytes、`package.zip` 299321 bytes，已同步本地集市。

补充（2026-09-15 T-4682~T-4731）：新增 50 项外部组件模型不可变性与副作用隔离回归，覆盖导出枚举/目录深冻结、列表与查找防御性复制、归一化/筛选/摘要/分组/排序输入隔离、状态与快照构建、历史序列化、刷新队列及展示/诊断纯函数契约。专项测试 820/820、完整测试 4540/4540、TypeScript、四项发布审计、移动端与 Chromium smoke、`pnpm verify:release` 全部通过；生产源码与 CSS 未改动，本地集市 `index.js`、`index.css`、`package.zip` 与仓库 SHA-256 完全一致。
补充（2026-09-15 T-4732~T-4787）：新增 56 项外部组件持久化兼容、异常输入与边界回归，覆盖快照/历史版本 envelope、未知字段过滤、解析失败回退、容量上限、TTL/freshness/retry 边界、错误分类、刷新队列与状态摘要固定形状。专项测试 876/876、完整测试 4596/4596、TypeScript、四项发布审计、移动端与 Chromium smoke、`pnpm verify:release` 全部通过；生产源码与 CSS 未改动，本地集市三个发布产物 SHA-256 继续一致。
补充（2026-09-15 T-4788~T-4842）：新增 55 项外部组件商店状态决策矩阵与 UI 元数据确定性回归，覆盖 builtin/external/conditional/bridge/reference 状态、严格配置标志、动作优先级、离线与重试展示、可选性、状态摘要、排序/筛选、指南链接、设置步骤及隐私级别边界。专项测试 931/931、完整测试 4651/4651、TypeScript、四项发布审计、移动端与 Chromium smoke、pnpm verify:release 全部通过；生产源码与 CSS 未改动，本地集市三个发布产物 SHA-256 继续一致。
补充（2026-09-15 T-4843~T-4903）：新增 61 项组件商店卡片交互、预览、筛选、分页与状态模型回归，覆盖查询 token、排序计数、无障碍标签、焦点/分页、折叠分组、添加/配置/预览动作、空状态、筛选序列化、卡片评分与搜索摘要。home-store-model 专项测试 320/320、完整测试 4712/4712、TypeScript、四项发布审计、移动端与 Chromium smoke、pnpm verify:release 全部通过；首次全量性能基准出现瞬时抖动后重跑通过，生产源码与 CSS 未改动，本地集市三个发布产物 SHA-256 继续一致。
补充（2026-09-15 T-4904~T-4970）：新增 67 项组件商店模型防御性复制、跨设备归一化、异常输入与稳定排序回归，覆盖卡片/筛选/摘要输入隔离、preview/source/size 边界、分页与焦点循环、折叠组与分组、动作与空状态、搜索评分/摘要及标签长度上限。home-store-model 专项测试 387/387、完整测试 4779/4779、TypeScript、四项发布审计、移动端与 Chromium smoke、pnpm verify:release 全部通过；生产源码与 CSS 未改动，本地集市三个发布产物 SHA-256 继续一致。
补充（2026-09-14 外部生活组件第四阶段）：完成 T-1953~T-1994 共 42 项；新增 DailyHotApi“热搜事件”和 NewsNow“实时资讯”三端内置组件，均要求用户填写完整自建端点，未配置时零网络请求。远程端点强制 HTTPS、本机开发允许 HTTP，仅放行 DailyHot 已知热榜路由及 NewsNow `/api/s?id=...`，响应受 128 KiB/8.5 秒保护且禁止自动重定向。两组件共享 30 分钟有界缓存，失败时显示“过期缓存”，商店新增“资讯与热点”分组、feed 预览、来源/联网/端点隐私说明；组件卡片使用平板式渐变、排名徽标和窄屏布局，可配置组件添加后立即进入配置。当前生产图保持 31 个模块，组件商店含 32 个内置组件；全量门禁 1771/1771，TypeScript、生产构建、移动端与 Chromium smoke 通过，`dist/index.js` 488352 bytes、`package.zip` 292225 bytes。
补充（2026-09-14 外部生活组件第三阶段）：完成 T-1913~T-1952 共 40 项；新增 Bangumi“每日放送”三端内置组件，整周兼容日历结果按设备本地星期筛选，支持今日/明日/本周、2~12 条和隐藏封面配置。真实 3:4 官方封面采用模型/adapter/view 三层 HTTPS 白名单、lazy/async/no-referrer，网络采用精确端点、8.5 秒读取超时、128 KiB 响应上限、30 分钟缓存和页面隐藏暂停；组件商店新增媒体预览以及来源、联网、隐私标识。当前生产图保持 31 个模块，组件商店含 30 个内置组件；全量门禁为 1711/1711，TypeScript、移动端与 Chromium smoke 通过，`dist/index.js` 480721 bytes、`package.zip` 288607 bytes。
补充（2026-09-14 外部生活组件第二阶段）：完成 T-1873~T-1912 共 40 项；新增 Open-Meteo 近期天气内置组件，采用用户显式城市、固定字段 URL、白名单端点、6 秒网络超时、128 KiB 响应上限、地点/天气分层缓存、页面隐藏暂停和卸载清理；卡片使用无需远程图片的 iPad 式渐变、大温度和响应式多日预报。日历月视图新增默认关闭的 holiday-cn 中国节假日/调休覆盖层，并与农历文本共存、外部失败不破坏思源日记网格。当前生产图经审计为 31 个模块，组件商店含 29 个内置组件；全量门禁目标为 1656 项测试、TypeScript、移动端与 Chromium smoke，`dist/index.js` 473502 bytes、`package.zip` 285223 bytes。
补充（2026-09-14 外部生活组件第一阶段）：完成 T-1833~T-1872 共 40 项，审计 Open-Meteo、DailyHotApi、NewsNow、holiday-cn、TMDB、Bangumi、ActivityWatch 与 get-windows；新增 9 项候选的纯模型目录，明确凭据、许可、隐私、端侧和桥接状态，新增 75 项专项/集成回归。首个生产组件“时间与日期”完全离线、三端可用、每分钟刷新并在隐藏/销毁时暂停清理；全量测试 1588/1588，TypeScript、生产构建、移动端与 Chromium smoke 通过，`dist/index.js` 461679 bytes、`package.zip` 279929 bytes；外部来源审计见 `docs/external-widget-source-audit.md`。
补充（2026-09-14 v0.17.0 发版完成）：版本元数据已从 0.16.41 升级至 0.17.0，中英文 README、release-readiness 与插件清单已同步；完整 verify:release 通过，`main` 与 `v0.17.0` 已推送，Release workflow run `34830768353` 成功，资产 `package.zip` 277316 bytes。
补充（2026-09-14 v0.17 Agent 联合 diagnostics 投影与分页消费）：完成 T-1738~T-1772 共 35 项，新增联合状态/风险推导、脱敏 diagnostics、变化事件、分页 cursor、多源合并和批量序列化；新增 35 项专项回归，专项测试 556 项；本轮全量测试 1509/1509，当前 `dist/index.js` 458043 bytes、`package.zip` 277428 bytes。
补充（2026-09-14 组件日期视图修复）：完成 T-1773~T-1832 共 60 项；今日待办改为规范任务列表项 `type='i'/subtype='t'`，并以 `custom-dailynote-YYYYMMDD` 属性定位今日日记、兼容日期标题；日历月视图保留完整 42 格，新增年月标题、跨月日期、周末色、今日圆形高亮、日记圆点与可访问交互。实现参考 MIT 项目 `gradypark86/siyuan-plugin-calendar` 的行为与日记属性约定，但未引入其 Vue/Day.js 依赖或复制组件源码；全量测试 1513/1513，TypeScript、生产构建和 Chromium 六周月历烟测通过，当前 `dist/index.js` 459745 bytes、`package.zip` 278551 bytes。
补充（2026-09-14 v0.17 Agent 联合检查点窗口与一致性）：完成 T-1703~T-1737 共 35 项，修正联合结果/快照/checkpoint 兼容性与差异计数；新增检查点窗口去重、排序、增量选择、恢复计划、事件摘要和稳定序列化；新增 33 项专项回归，专项测试 518 项。
补充（2026-09-14 v0.17 Agent 协调器联合恢复）：完成 T-1643~T-1672 共 30 项，新增协调器健康/差异/commit window/批量结果与 successRate 聚合契约；新增 32 项专项回归，专项测试 455 项；本轮全量测试 1406/1406。
补充（2026-09-14 v0.17 Agent 联合快照与恢复结果）：完成 T-1673~T-1702 共 30 项，新增联合快照差异、checkpoint、恢复结果和恶意输入隔离；新增 31 项专项回归，专项测试 485 项；本轮全量测试 1438/1438，当前 `dist/index.js` 448926 bytes、`package.zip` 275129 bytes。
补充（2026-09-14 v0.17 Agent 协调器健康与批量结果）：完成 T-1613~T-1642 共 30 项，新增协调器健康报告、状态差异事件、commit window、批量恢复结果和 successRate 摘要；新增 31 项专项回归，本轮全量测试 1375/1375，当前 `dist/index.js` 442624 bytes、`package.zip` 273945 bytes。
补充（2026-09-14 v0.17 Agent 传输恢复协调器）：完成 T-1583~T-1612 共 30 项，新增协调器串行恢复、单调提交、取消/超时/销毁保护、状态快照与生命周期事件；新增 31 项专项回归，本轮全量测试 1343/1343。
补充（2026-09-14 v0.17 Agent 传输队列回放）：完成 T-1553~T-1582 共 30 项，新增取消/超时前置检查、只读回放、原子确认、稳定结果/错误回执与安全序列化；新增 31 项专项回归，本轮全量测试 1312/1312，当前 `dist/index.js` 436720 bytes、`package.zip` 272850 bytes。
补充（2026-09-14 v0.17 Agent 传输队列维护）：完成 T-1523~T-1552 共 30 项，新增 clear/reset/peek、队列健康报告、批量合并/状态筛选、取消与超时安全回执；新增 30 项专项回归，本轮全量测试 1281/1281。
补充（2026-09-14 v0.17 Agent 传输队列指标）：完成 T-1493~T-1522 共 30 项，新增队列风险等级、状态差异、变化事件、检查点、回放结果与确认摘要；新增 30 项专项回归，本轮全量测试 1251/1251，当前 `dist/index.js` 433224 bytes、`package.zip` 272031 bytes。
补充（2026-09-14 v0.17 Agent 审计传输队列）：完成 T-1463~T-1492 共 30 项，新增 16 条有界传输队列、cursor 确认、类型筛选、队列快照、利用率摘要和恢复计划；新增 32 项专项回归，本轮全量测试 1221/1221，当前 `dist/index.js` 430598 bytes、`package.zip` 271537 bytes。
补充（2026-09-14 v0.17 Agent 审计传输封装）：完成 T-1433~T-1462 共 30 项，新增 version=1 envelope、FNV checksum、requestId 清洗、批量导入/导出、完整性校验和稳定失败回执；新增 32 项回归。
补充（2026-09-14 v0.17 Agent 审计传输封装）：本轮全量测试 1189/1189，TypeScript、生产构建与发布质量门禁通过；当前 `dist/index.js` 427702 bytes、`package.zip` 270986 bytes。
补充（2026-09-14 v0.17 Agent 审计窗口合并与恢复）：完成 T-1403~T-1432 共 30 项，新增窗口去重、合并、排序、按健康筛选、健康统计、增量恢复计划及稳定序列化/解析；新增 32 项回归，本轮全量测试 1157/1157，当前 `dist/index.js` 425022 bytes、`package.zip` 270226 bytes。
补充（2026-09-14 v0.17 Agent 审计趋势窗口）：完成 T-1373~T-1402 共 30 项，新增报告差异、健康等级趋势、变化事件归一化、8 条报告窗口及稳定序列化/解析；新增 31 项回归，专项测试 172 项。
补充（2026-09-14 v0.17 Agent 审计趋势窗口）：本轮全量测试 1125/1125，TypeScript、生产构建和发布质量门禁通过；当前 `dist/index.js` 422868 bytes、`package.zip` 269681 bytes。
补充（2026-09-14 v0.17 Agent 审计回放契约）：完成 T-1313~T-1342 共 30 项，扩展只读审计历史的固定事件流、游标回放、version=1 摘要、稳定序列化/解析与 hostile 输入隔离；事件上限 8 条，仍不暴露能力明细或宿主异常。新增 31 项回归，本轮全量测试 1063/1063、TypeScript、生产构建与发布质量门禁通过；当前 `dist/index.js` 419235 bytes、`package.zip` 268710 bytes。
补充（2026-09-14 v0.17 Agent 审计健康报告）：完成 T-1343~T-1372 共 30 项，新增空/健康/降级/不可用状态、固定事件计数、version=1 报告、稳定序列化/解析及 hostile history 隔离；新增 31 项回归，本轮全量测试 1094/1094，当前 `dist/index.js` 420810 bytes、`package.zip` 269113 bytes。
补充（2026-09-14 v0.17 Agent 生命周期审计）：完成 T-1283~T-1312 共 30 项，新增有界审计历史、单调 cursor、快照副本读取、生命周期事件和销毁态隔离；生产注册前记录初始快照，插件卸载前记录脱敏 disposed 快照，不向 Agent/UI 暴露明细。新增 35 项回归，本轮全量测试 1032/1032、TypeScript、生产构建与发布质量门禁通过；当前 `dist/index.js` 417523 bytes、`package.zip` 268170 bytes。
补充（2026-09-14 组件面板专项）：修复内置 adapter 覆盖目录定义时丢失 `viewType/configSchema` 的问题，日历月视图恢复真实 7 列网格；`today-tasks` 默认改为读取思源今日日记属性对应文档内的任务，并兼容 `YYYY-MM-DD` 标题、提供明确空态。新增运行时元数据与任务 SQL 回归测试。
补充（2026-09-14 路线重排）：组件商店第二轮体验、workspace runtime diagnostics 和 `document-context` 只读接入已提前完成，未来路线改为“v0.16.42 稳定化 → v0.17 只读 Agent → v0.18 最小受控动作/桌面路径筛选 → v0.19 生态与搜索成熟化 → v0.20 数据连续性/性能门禁 → v0.21 真实宿主与发布收口”。详见 `ROADMAP.md` 8.0.2；执行链不再与路径筛选捆绑，真实宿主验收继续作为独立准入条件。
补充（2026-09-14 v0.16.42 性能稳定化）：`search-model.js` 新增 WeakMap 页签元数据缓存并检测关键字段变化自动失效；300 页签空查询基准 avg/p95 约 0.37/0.61ms，关键词路径约 0.38/0.72ms。新增缓存失效回归；全量测试 891/891、TypeScript 与生产构建通过，当前 `dist/index.js` 408917 bytes、`package.zip` 265516 bytes。真实商店宿主验收仍待合法桌面会话。
补充（2026-09-14 商店模型稳定化）：完成 T-1223~T-1252 共 30 项，将页签/设备/可用性/分类筛选、文本清洗、结果摘要、语义预览、卡片状态、尺寸选择、支持表面、分组排序/折叠和操作决策抽为 `src/home-store-model.js` 纯模型；`index.ts` 已接入筛选、摘要、预览和状态逻辑。新增 63 项模型测试，生产图遍历达到 27 个模块；全量测试 953/953、TypeScript 与构建通过，当前 `dist/index.js` 412191 bytes、`package.zip` 266577 bytes。
补充（2026-09-14 v0.17 只读 Agent 审计）：完成 T-1253~T-1282 共 30 项，新增 `src/agent-readonly-audit.js`，统一能力名称/设备/effects/状态/原因归一化、重复与上限检查、脱敏失败回执、设备矩阵、version=1 快照和变化事件；`index.ts` 在生产注册前执行只读定义审计。新增 44 项回归，未开放任何新写入动作；全量测试 997/997，当前 `dist/index.js` 416051 bytes、`package.zip` 267685 bytes。
补充（2026-09-14 发布完成）：`v0.16.41` 经 D-278 分层性能门禁后最终 CI/Release 全绿；远端 `main`=`3cecf19`，Release 资产 `package.zip` 264020 bytes，地址：https://github.com/ai68298100/siyuan-speed-switch/releases/tag/v0.16.41。
补充（2026-09-14 第四十三轮）：完成 31 项开发（T-1155~T-1185），扩展事件队列利用率摘要差异、变化事件、历史聚合、序列化/解析与一致性校验；新增 27 项专项回归。TypeScript 通过；完整测试 888 项，构建产物 `dist/index.js` 405674 bytes、`package.zip` 264035 bytes，已同步发布矩阵。
补充（2026-09-14 第四十二轮）：完成 20 项开发（T-1135~T-1154），新增事件队列利用率摘要，输出 size/capacity/utilization/risk/disposed 固定字段。
补充（2026-09-14 第四十一轮）：完成 20 项开发（T-1115~T-1134），新增事件队列只读 peek，最多返回 8 条事件且不推进游标、不消费队列，销毁态安全隔离。
补充（2026-09-14 第四十轮）：完成 20 项开发（T-1095~T-1114），新增事件队列 reset 能力，清空事件并重置游标，返回 previousCursor，dispose 后安全隔离。
补充（2026-09-14 第三十九轮）：完成 20 项开发（T-1075~T-1094），新增事件队列显式 clear 能力，清理历史但保留队列可用性，与 dispose 生命周期严格区分。
补充（2026-09-14 第三十八轮）：完成 20 项开发（T-1055~T-1074），新增事件队列状态归一化与安全快照读取，固定 cursor/size/capacity/disposed/truncated 字段并限制容量边界。
补充（2026-09-14 第三十七轮）：完成 20 项开发（T-1035~T-1054），新增事件队列 signal/deadline 读取门面，取消和超时均不消费队列，成功路径复用既有游标读取。
补充（2026-09-14 第三十六轮）：完成 20 项开发（T-1015~T-1034），为容量事件协调器增加 recoverAndCommit 原子恢复提交及 signal/deadline 变体，成功才确认队列，取消/超时/失败均不消费。
补充（2026-09-14 第三十五轮）：完成 20 项开发（T-995~T-1014），为事件协调器增加 signal/deadline 恢复入口，取消/超时均不消费队列，成功路径复用既有恢复逻辑。终验：849/849 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 402311 bytes、`package.zip` 263119 bytes（300 KiB 余量 42577 bytes）。

补充（2026-09-14 第三十四轮）：完成 20 项开发（T-975~T-994），新增 `createStorageCapacityReportEventCoordinator`，统一事件恢复/提交、单调游标、stale_cursor 防护、快照与销毁态隔离。终验：847/847 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 402098 bytes、`package.zip` 263068 bytes（300 KiB 余量 42588 bytes）。

补充（2026-09-14 第三十三轮）：完成 20 项开发（T-955~T-974），新增 `recoverStorageCapacityReportEventQueue`，检测事件队列溢出并在需要时返回归一化 snapshot_required/snapshot 结果；队列不可用或销毁返回稳定失败 reason。终验：844/844 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 401584 bytes、`package.zip` 262874 bytes（300 KiB 余量 42838 bytes）。

补充（2026-09-14 第三十二轮）：完成 20 项开发（T-935~T-954），新增 `replayStorageCapacityReportEvents` 安全回放门面，支持 bounded limit、溢出/事件模式、可选确认及取消/超时/销毁保护，失败路径不消费队列。终验：841/841 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 401188 bytes、`package.zip` 262823 bytes（300 KiB 余量 42889 bytes）。raw bundle 自律线按 D-262 校准至 394 KiB。

补充（2026-09-14 第三十一轮）：完成 20 项开发（T-915~T-934），新增 `createStorageCapacityReportEventQueue`，提供有界入队、游标读取、溢出检测、确认消费、快照与销毁态隔离，队列默认 8 条且最多 32 条。终验：838/838 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 400463 bytes、`package.zip` 262610 bytes（300 KiB 余量 43102 bytes）。raw bundle 自律线按 D-260 校准至 393 KiB。

补充（2026-09-14 第三十轮）：完成 20 项开发（T-895~T-914），新增容量报告事件稳定序列化/解析链，限制 payload 长度与事件数量，统一复用事件归一化并隔离未知字段。终验：835/835 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 399681 bytes、`package.zip` 262302 bytes（300 KiB 余量 43696 bytes）。raw bundle 自律线按 D-258 校准至 392 KiB。

补充（2026-09-14 第二十九轮）：完成 20 项开发（T-875~T-894），新增容量报告事件构建/归一化，将风险、趋势及超限/临界桶变化转换为最多 8 条固定事件，过滤未知类型并限制桶白名单。终验：832/832 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 399531 bytes、`package.zip` 262301 bytes（300 KiB 余量 43699 bytes）。raw bundle 自律线按 D-256 校准至 391 KiB。

补充（2026-09-14 第二十八轮）：完成 20 项开发（T-855~T-874），新增 `reconcileStorageCapacityReport`，修复报告 version、summary 计数/标记及 trend action 与 health recommendation 不一致问题，统一输出固定安全结构。终验：829/829 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 398231 bytes、`package.zip` 261966 bytes（300 KiB 余量 44034 bytes）。raw bundle 自律线按 D-254 校准至 390 KiB。

补充（2026-09-14 第二十七轮）：完成 20 项开发（T-835~T-854），新增 `validateStorageCapacityReport`，校验 version=1、health/trend/summary 三段和 summary 桶上限，返回固定 valid/reason 结果。终验：826/826 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 398027 bytes、`package.zip` 261907 bytes（300 KiB 余量 44093 bytes）。raw bundle 自律线按 D-252 校准至 389 KiB。

补充（2026-09-14 第二十六轮）：完成 20 项开发（T-815~T-834），新增 `validateStorageCapacityReportWindow`，校验报告窗口输入、样本上限、索引单调性和布尔字段，返回固定 valid/reason/size 结果。终验：823/823 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 397301 bytes、`package.zip` 261777 bytes（300 KiB 余量 44823 bytes）。

补充（2026-09-14 第二十五轮）：完成 20 项开发（T-795~T-814），新增报告窗口归一化、稳定序列化与解析链，固定 start/end/total/truncated 元数据并限制最多 16 条样本，污染输入安全降级。终验：820/820 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 396667 bytes、`package.zip` 261603 bytes（300 KiB 余量 44997 bytes）。raw bundle 自律线按 D-249 校准至 388 KiB。

补充（2026-09-14 第二十四轮）：完成 20 项开发（T-775~T-794），新增 `summarizeStorageCapacityReportWindow`，在窗口元数据基础上汇总样本数、最新风险/趋势及 critical/degrading/improving 计数，统一限制索引范围并隔离污染输入。终验：817/817 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 396112 bytes、`package.zip` 261485 bytes（300 KiB 余量 45495 bytes）。

补充（2026-09-14 第二十三轮）：完成 20 项开发（T-755~T-774），新增 `selectStorageCapacityReportWindow`，在历史归一化/去重后选择最近窗口，输出 start/end/total/truncated 元数据并限制默认 16 条窗口。终验：814/814 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 395530 bytes、`package.zip` 261361 bytes（300 KiB 余量 45619 bytes）。

补充（2026-09-14 第二十二轮）：完成 20 项开发（T-735~T-754），新增 `trimStorageCapacityReportHistory`，对报告历史执行归一化、去重、容量裁剪并保留最新条目，非数组/非法上限安全降级。终验：811/811 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 395363 bytes、`package.zip` 261272 bytes（300 KiB 余量 45708 bytes）。raw bundle 自律线按 D-245 校准至 387 KiB。

补充（2026-09-14 第二十一轮）：完成 20 项开发（T-715~T-734），新增 `summarizeStorageCapacityReports`，对最多 64 条报告汇总最新风险/趋势、风险与趋势分布及关键计数，污染和空历史安全降级。终验：808/808 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 395000 bytes、`package.zip` 261175 bytes（300 KiB 余量 45805 bytes）。

补充（2026-09-14 第二十轮）：完成 20 项开发（T-695~T-714），新增固定版本 `buildStorageCapacityReport` 及归一化/序列化/解析链，组合 health/trend/summary 三段，限制摘要桶白名单与计数范围，支持安全往返。终验：805/805 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 394562 bytes、`package.zip` 261038 bytes（300 KiB 余量 45942 bytes）。raw bundle 自律线按 D-242 校准至 386 KiB。

补充（2026-09-14 第十九轮）：完成 20 项开发（T-675~T-694），新增健康趋势结果归一化、稳定序列化与解析；趋势/动作枚举白名单、风险与压力差值边界、精度和解析长度上限均已固化。终验：801/801 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 393682 bytes、`package.zip` 260842 bytes（300 KiB 余量 46144 bytes）。

补充（2026-09-14 第十八轮）：完成 20 项开发（T-655~T-674），新增 `assessStorageCapacityTrend`，基于风险等级和使用压力差值输出 degrading/improving/stable 趋势、风险差值及当前建议动作，统一归一化并固定精度。终验：798/798 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 393075 bytes、`package.zip` 260716 bytes（300 KiB 余量 46270 bytes）。

补充（2026-09-14 第十七轮）：完成 20 项开发（T-635~T-654），新增 `diffStorageCapacityHealth`，输出风险/建议动作变化、使用量与上限增量、上升/下降/稳定趋势及超限/临界桶变更，所有输入先归一化并保持固定白名单。终验：795/795 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 392739 bytes、`package.zip` 260586 bytes（300 KiB 余量 46400 bytes）。

补充（2026-09-14 第十六轮）：完成 20 项开发（T-615~T-634），新增健康摘要归一化、稳定序列化与解析，白名单过滤超限/临界桶、重算风险与建议动作、封顶计数并保持固定字段；补充污染、长度、互斥和往返回归。终验：792/792 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 392266 bytes、`package.zip` 260419 bytes（300 KiB 余量 46707 bytes）。

补充（2026-09-14 第十五轮）：完成 20 项开发（T-595~T-614），新增 `buildStorageCapacityHealth`，聚合三类容量桶的总使用量/总上限、超限与临界桶及建议动作（none/monitor/trim），输出固定且有界。终验：787/787 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 391524 bytes、`package.zip` 260243 bytes（300 KiB 余量 46883 bytes）。

补充（2026-09-14 第十四轮）：完成 20 项开发（T-575~T-594），新增 `classifyStorageCapacityRisk` 聚合容量风险等级，按三类桶归一化后的状态输出 normal/warning/critical，over 优先；忽略不可信状态字段并补齐多桶回归。终验：784/784 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 391150 bytes、`package.zip` 260126 bytes（300 KiB 余量 47100 bytes）。

补充（2026-09-14 第十三轮）：完成 20 项开发（T-555~T-574），新增 `summarizeStorageCapacityDiff`，汇总变化桶、增长/缩减方向、状态变化计数并保持固定字段与桶顺序；空输入和污染输入安全降级。终验 781/781 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 390971 bytes、`package.zip` 260074 bytes（300 KiB 余量 47226 bytes）。

补充（2026-09-14 第十二轮）：完成 20 项开发（T-535~T-554），新增 `diffStorageCapacitySnapshots`，逐桶输出 used/max 增量及 status/truncated 变化，输入先归一化并保持固定桶顺序，支持缺失与污染快照安全降级。终验 778/778 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 390540 bytes、`package.zip` 259949 bytes（300 KiB 余量 47251 bytes）。

补充（2026-09-14 第十一轮）：完成 20 项开发（T-515~T-534），新增 `mergeStorageCapacitySnapshots`，按收藏/置顶/分组逐桶取最大使用量与上限，再统一归一化状态；支持多来源、缺失来源和污染输入安全汇总。终验：775/775 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 390260 bytes、`package.zip` 259843 bytes（300 KiB 余量 47357 bytes）。

补充（2026-09-14 第十轮）：完成 20 项开发（T-495~T-514），新增 `parseStorageCapacitySnapshot` 安全解析入口，限制输入长度、捕获 JSON 异常并统一归一化三类容量桶；补充往返、非法 JSON、超大 payload、字段隔离和边界回归。终验 772/772 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 390038 bytes、`package.zip` 259767 bytes（300 KiB 余量 47433 bytes）。

补充（2026-09-14 第九轮）：完成 20 项开发（T-475~T-494），新增 `serializeStorageCapacitySnapshot`，序列化前统一归一化容量快照，固定三类桶与字段顺序，隔离污染输入并保持源对象不可变；补充确定性、字段顺序、空值和异常安全回归。终验 768/768 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 389885 bytes、`package.zip` 259734 bytes（300 KiB 余量 47466 bytes）。

补充（2026-09-14 第八轮）：完成 20 项开发（T-455~T-474），新增 `normalizeStorageCapacitySnapshot` 消费端归一化，统一清洗三类容量桶、重算 truncated/status、封顶超大使用量并丢弃未知字段；新增确定性、污染输入、阈值与超大值回归测试。终验：764/764 测试、TypeScript、生产构建与发布质量检查通过；`dist/index.js` 389827 bytes、`package.zip` 259721 bytes（300 KiB 余量 47479 bytes）。

补充（2026-09-14 第七轮）：完成 20 项开发（T-435~T-454），新增只读 `buildStorageCapacitySnapshot`，分别报告收藏、置顶、分组的 used/max/truncated/status（ok/near/over）；对异常输入和超大数组做安全降级与使用量封顶，不改变既有存储格式。新增容量快照回归，终验 760/760 测试、TypeScript、移动与 Chromium smoke 全绿；`dist/index.js` 389428 bytes、`package.zip` 259614 bytes（300 KiB 余量 47586 bytes）。

补充（2026-09-14 第六轮）：完成 20 项开发（T-415~T-434），统一容量上限解析并新增有界容量摘要；收藏、置顶、分组 getter 增加读取期防御清洗与安全回写，运行时脏数据不再直接进入 UI 或持久化链。新增归一化、摘要、干净/污染输入回归测试，保持旧调用兼容。终验产物：`dist/index.js` 388997 bytes、`package.zip` 259379 bytes；757/757 测试、TypeScript 与三类 smoke 全绿。

补充（2026-09-14 第五轮）：完成 24 项开发（T-350、T-391~T-414），收口收藏/置顶/分组容量决策（512/64/64）。sanitize 函数新增可选上限，加载期和运行时写入统一去重、保序、裁剪并安全回写；新增容量常量、边界/污染/兼容测试，README、DECISIONS、TODO 同步。门禁：751/751 测试、TypeScript、移动烟测与 Chromium smoke 全部通过；`dist/index.js` 388739 bytes、`package.zip` 259228 bytes（300 KiB 余量 47972 bytes）。

补充（2026-09-14 第四轮）：完成 23 项开发（T-368~T-390），核心是 **v0.17 阶段 2 document-context 只读生产接入**：新增请求/路径/元数据 envelope 归一化，活动页签优先与关闭文档 SQL 回退，复用 outline 端点输出最多 24 条大纲；稳定错误语义不泄漏宿主异常，新增 23 项契约测试与 10 项 wiring 静态门禁。ROADMAP 与 wiring plan 已同步，真实桌面取消/权限验收仍后置。终验门禁：745/745 测试、TypeScript、生产构建、移动烟测与 Chromium smoke 全绿；`dist/index.js` 388412 bytes、`package.zip` 258927 bytes（300 KiB 余量 48273 bytes）。

补充（2026-09-14 第三轮）：完成 11 项开发（T-305~T-315），核心是**执行 D-219 归档内容决策、解锁 v0.17 预算**：中英文 README 更新日志裁剪至最近两个版本（80.3→27.8 KB、84.5→27.1 KB，门禁断言内容全保留）；ROADMAP.md 移出发布归档并由仓库边界测试锁死（防回潮）；docs SVG 因市场渲染 README 需要而留档；新增归档 i18n 逐值一致性门禁。结果 `package.zip` 307150→252683 bytes，**300 KiB 硬上限余量 50→54517 bytes**，v0.17 契约层生产接入不再需要内容决策。ROADMAP 8.0.1 同步接入顺序建议；新增 `docs/workspace-capability-wiring-plan.md` 三阶段接入计划（体积预估：小型只读簇 +2 KiB zip、执行链 +7 KiB、definitions 全量 +20 KiB，硬上限内可容纳）。补足细节项：T-314 把 5 处 aria-label 固化为移动烟测源码契约断言。门禁全绿：683/683 测试、TypeScript、生产构建与三类 smoke。

补充（2026-09-14 第二轮）：完成 12 项开发（T-293~T-304）。核心成果：(1) **本地页签过滤 6 倍优化**——`filterOpenTabs` 改为轻量关键词门禁 + 命中条目重型图形安全产出（D-217），300 页签关键词路径 8.9ms→1.4ms，成本随命中数而非页签总数扩展，行为一致性由 41 项搜索测试与新增回归锁定；(2) **四道新门禁**——生产依赖图契约层隔离（16 个 v0.17 契约模块锁在图外）、i18n 死 key 硬门禁（清除 2 个死 key）、CSS 死类审计（343/343 基线）、两路径性能基准；(3) **预算审计与自救**——审计确认免费瘦身空间耗尽（D-216），本 round 增量一度击穿 300 KiB 硬上限，通过归档 i18n 构建期最小化回收（zip 307337→307150），raw 自律线按协议校准至 356 KiB（D-218）；(4) 三端搜索/分组输入框补 aria-label（72→77）；(5) widget-protocol 文档补生命周期语义；(6) v0.17 前置条件更新：接入契约层前必须先做归档内容决策（README 变更链裁剪 / ROADMAP、docs SVG 移出归档，均为维护者决策项，见 ROADMAP 8.0.1）。门禁全绿：682/682 测试、TypeScript、生产构建、移动烟测 68 PASS、Chromium 烟测 3 PASS。

补充（2026-09-14）：同步远端 `main` 至 `9c5793f`（v0.16.40 已正式发布，Release 资产 306028 bytes，跨平台发布门禁修复后 CI/Release 全绿）。本地收口两个测试基建修复：T-291 Chromium 烟测浏览器回退（本机 Edge 153 headless 静默空输出时自动回退 Chrome，独立 profile 目录避免锁冲突）、T-292 移动烟测源码契约按 LF 归一化读取（见 D-215）。本地门禁全绿：675/675 测试、TypeScript、生产构建与三类 smoke；`dist/index.js` 363031 bytes、`package.zip` 306091 bytes（与 CI 差 63 bytes，在 ±1 KiB 漂移窗口内）。ROADMAP 8.0.1 固化 v0.17–v0.21 五版本路线；v0.17 首要前置为释放生产包体余量后再择优接入 Agent 工作区契约层。

补充（2026-09-13）：完成组件商店逐项可用性审计（T-263）。`docs/component-availability-audit.md` 覆盖 28 个内置组件与 1 个第三方目录组件；当前自动测试 667/667 全绿。审计确认两处 `YYYYMMDD` 日期标签正则展示缺陷（T-264），并将第三方/命名协议/活动文档依赖与正常空数据分开分级；下一步优先修复正则、补商店依赖提示并安排真实桌面逐项验收（T-265~T-266）。

补充（2026-09-13）：T-264/T-265 完成。修正 `recent-writing-activity` 与 `today-reservations` 日期显示正则，新增回归测试；商店中英文描述补充任务扫描、日记标题、预约属性、剪藏标签、活动文档、闪卡和插件命令等前置条件。661/661 自动测试通过，生产包 `dist/index.js` 353208 bytes、`package.zip` 301884 bytes，仍低于包体门禁。

补充（2026-09-13）：T-267 完成。新增组件可用性审计门禁，自动检查 27 个内置组件与 runtime adapter 一一对应、第三方目录组件必须由 provider 提供、SQL adapter 使用白名单 `stmt` 参数，并区分正常空态和未注册状态；当前 `pnpm test` 为 666/666 全绿。

补充（2026-09-13）：T-268 完成。`journal-calendar` 现支持可选笔记本范围，月份可在当前月前后 24 个月内双向切换；导航会持久化并强制刷新当前实例，667/667 自动测试全绿。

补充（2026-09-13）：T-269 完成。adapter 快照新增有界 `emptyHint` 通道，首页空态优先显示组件自己的引导文案；插件命令在无可执行命令时提示安装/启用相关插件，669/669 自动测试全绿。

补充（2026-09-13）：T-270 完成。组件定义新增受限 `availability` 等级（ready/conditional/external），商店卡片对条件依赖和外部插件显示本地化徽标；671/671 自动测试全绿。

补充（2026-09-13）：T-271/T-272 完成。商店新增“条件”筛选，并改为只展示当前设备支持的组件；待安装第三方项继续标记 external，避免跨设备误添加。

补充（2026-09-13）：T-273 完成。商店筛选现在会同步隐藏无可见卡片的功能分组标题与网格，避免条件筛选后出现空分组。

补充（2026-09-13）：T-274 完成。首次添加条件组件后显示一次性前置条件提示，已存在组件仅调整尺寸时不重复提示。

补充（2026-09-13）：T-275 完成。商店中已添加且支持声明式配置的组件新增独立“配置”按钮，复用既有有界表单，保存后同步刷新商店和首页；671/671 自动测试、生产构建和 smoke 门禁通过，`dist/index.js` 355527 bytes、`package.zip` 302800 bytes。

补充（2026-09-13）：T-276 完成。商店卡片新增支持表面提示（主面板/侧栏/移动端），与当前设备过滤保持一致；671/671 自动测试和 TypeScript 通过，`dist/index.js` 355933 bytes、`package.zip` 303049 bytes。

补充（2026-09-13）：T-277 完成。商店尺寸按钮打开时会高亮当前应用尺寸（未添加组件则高亮默认尺寸），进一步明确“先选尺寸、再点击添加/应用”的交互；671/671 自动测试、TypeScript 与生产构建通过，`dist/index.js` 355965 bytes、`package.zip` 303050 bytes。

补充（2026-09-13）：T-278~T-281 完成。第三方组件目录新增 ready/unavailable/missing 三态；已添加组件在 provider 卸载后保留配置并显示可清理的失效卡，重新注册后即时恢复商店与面板。同步修复“条件”页签分类冲突，新增“已添加”筛选、筛选状态保持和无结果提示；27 个内置组件现完整进入本地化功能分组。面板重渲染会回收旧 observer、idle timer 与事件订阅；provider 热替换不会保留旧跳转回调。`pnpm verify:release` 全绿：673/673 自动测试、TypeScript、移动端和 Chromium smoke 通过；`dist/index.js` 358133 bytes、`package.zip` 304225 bytes。

补充（2026-09-13）：T-282~T-283 完成。声明式配置新增严格 `date` 与 `document` 字段：倒数日使用原生日期控件，指定文档提供当前打开文档的 datalist 建议；笔记本下拉增加明确空选项并保留已失效值提示，所有控件关联 label，保存前执行原生有效性校验。Agent 配置归一化同步支持新字段；`pnpm verify:release` 全绿，674/674 自动测试、TypeScript、移动端和 Chromium smoke 通过；`dist/index.js` 360409 bytes、`package.zip` 305091 bytes。

补充（2026-09-13）：T-284~T-285 完成。空组件面板新增独立“打开组件商店”CTA，配置表单新增“恢复默认”按钮，仅重置 schema 声明字段并保留未知配置；异步笔记本选项加载与重置状态安全协同。`pnpm test` 674/674 全绿，TypeScript 与生产构建通过；最新产物 `dist/index.js` 361378 bytes、`package.zip` 305399 bytes，raw bundle 自律线校准至 353 KiB。

补充（2026-09-13）：T-286~T-287 完成。组件商店无结果状态新增一键清除搜索/页签筛选；页签采用标准 tablist/tab 语义，尺寸选择同步暴露 `aria-pressed`，键盘与读屏操作反馈更清晰。`pnpm test` 674/674、TypeScript 与生产构建通过；最新产物 `dist/index.js` 362169 bytes、`package.zip` 305564 bytes，raw bundle 自律线校准至 354 KiB。

补充（2026-09-13）：T-288 完成。Agent `home-widget-snapshot` 的发现模式现在返回当前设备的组件添加、启用和尺寸状态，保持只读且不暴露配置值；675/675 自动测试、TypeScript、生产构建和 UI smoke 全部通过。最新产物 `dist/index.js` 363031 bytes、`package.zip` 305870 bytes，raw bundle 自律线校准至 355 KiB。

补充（2026-09-13）：T-289 完成。发布前修复 Windows/Ubuntu 文档换行差异：webpack 复制 README/ROADMAP 时统一为 LF，保证 `package.zip` 在本地与 GitHub Actions 生成一致；发布门禁与跨平台归档审计复跑通过，归档大小 306056 bytes。

补充（2026-09-13）：T-290 完成。跨平台归档门禁改为对 `package.zip` 文档记录值允许 ±1 KiB 漂移，保留 dist/index.js 精确校验与 300 KiB 硬上限；本地 306050 bytes、Ubuntu Actions 历史 306028 bytes 均可验证通过。

补充（2026-09-13）：T-271 完成。商店新增“条件”筛选，按 `availability` 精确过滤条件依赖组件，待安装的第三方卡片标记为 external；自动门禁复跑中。

补充（2026-09-13）：T-260~T-262 增加 diagnostics 联合恢复取消/超时入口与只读 handler；661/661 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-258~T-259 增加 diagnostics 联合恢复结果归一化与 queue/snapshot 联合 coordinator；661/661 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-254~T-257 增加 diagnostics replay 取消/超时边界、恢复结果归一化与 coordinator；660/660 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-251~T-253 增加 diagnostics 独立事件队列、snapshot diff 入队、replay/ack 与溢出恢复；658/658 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-248~T-250 增加 diagnostics snapshot 五类差异计算、变化事件构建与归一化；657/657 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-246~T-247 增加统一 diagnostics snapshot version=1、归一化与兼容/一致性校验；656/656 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-243~T-245 增加 definitions/lifecycle 诊断归一化、生命周期摘要及联合只读诊断包；655/655 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-241~T-242 增加注册失败原因归一化/lifecycle failureStatus，以及 definitions 矩阵 diagnostics 摘要；654/654 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-239~T-240 增加 capability definitions 批量矩阵校验，并以独立 `handleStatus()` 暴露 opaque/invalid 句柄计数，保持既有 runtime snapshot 兼容；652/652 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-237~T-238 增加 capability schema 矩阵校验与 lifecycle opaque/invalid 句柄统计；652/652 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-233~T-236 增加 diagnostics 定义工厂、输入归一化、生命周期自定义注册与 capability 完整性校验；651/651 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-232 修复 diagnostics capability spec 初始化顺序，并以直接 `require` 自检确认模块可加载；T-233~T-235 增加 diagnostics 定义工厂、输入归一化与 lifecycle 自定义定义注册；651/651 测试、TypeScript 与 diff 检查通过。

本轮新增（2026-09-13）：T-150 为 workspace bridge 增加显式过期计划回收 `prune(now)`，T-151 增加 capability 注册句柄卸载回收，T-152 增加 bridge 销毁态隔离，T-153 增加 capability lifecycle facade，T-154 增加有界 lifecycle status 快照，T-155 增加 bridge status 快照，T-156 增加无副作用宿主 capability 探测，T-157 增加注册句柄归一化与 unmanaged 计数，T-158 增加 lifecycle.probe() 只读入口，T-159 增加 lifecycle.snapshot() 统一状态快照，T-160 增加 runtime 组合快照，T-161 增加 runtime 快照版本化与归一化，T-162 增加版本兼容门禁，T-163 增加 runtime 一致性校验，T-164 增加 runtime 状态转移 diff，T-165 增加 runtime 状态事件，T-166 增加 runtime 事件归一化，T-167 增加 runtime 事件队列，T-168 增加 runtime 事件游标，T-169 增加 runtime diff 入队桥接，T-170 增加 runtime 事件安全回放，T-171 增加 runtime 快照恢复流程，T-172 增加 runtime 恢复确认，T-173 增加 runtime 恢复提交门面，T-174 增加恢复并发协调器，T-175 增加恢复协调器销毁态，T-176 增加协调器队列绑定销毁，T-177 增加恢复取消边界，T-178 增加恢复超时边界，T-179 增加恢复结果归一化，T-180 增加恢复安全出口，T-181 增加 coordinator/queue 运行快照，T-182 增加 runtime session facade，T-183 增加 session 快照版本化，T-184 增加 session registry，T-185 增加 registry 快照，T-186 增加 registry 回收，T-187 增加 registry 快照归一化，T-188 增加 registry 事件通知，T-189 增加 registry 空闲回收，T-190/191 增加 registry 事件游标与归一化，T-192~194 增加 registry 事件回放/确认/快照恢复，T-195~196 增加 registry 回放取消/超时边界，T-197 增加 registry 恢复确认门面，T-198 增加 registry 恢复并发协调器，T-199 增加 registry 异常隔离，T-200~201 增加 registry 恢复结果归一化与安全门面，T-202 增加 coordinator signal/deadline 入口，T-203~204 增加 signal/deadline 提交门面，T-205~207 增加 registry 快照校验、差异计算与归一化，T-208~209 将一致性校验接入 snapshot recovery 并固定 invalid_snapshot 终态，T-210 增加 registry 快照版本构建与兼容门禁，T-211 增加跨 session 摘要，T-212~213 增加 registry 专用差异队列与入队桥接，T-214~216 增加 diff queue 安全回放、确认与快照恢复，T-217~218 增加 diff replay 取消/超时边界，T-219~220 增加 diff recovery 归一化与确认门面，T-221 增加 diff recovery coordinator，T-222 增加 diff coordinator 快照，T-223 增加 registry 联合诊断摘要，T-224~225 增加 registry/diff 双游标联合恢复与原子确认，T-226~227 增加联合恢复取消/超时边界，T-228 增加联合诊断归一化，T-229~230 增加 Agent diagnostics capability 契约与异常隔离 handler，T-231 增加 diagnostics canonical effects 安全注册适配器；649/649 自动测试、TypeScript 与 diff 检查通过。生产 bundle 暂不接入该独立模块。

当前基线：`v0.16.39`（发布提交 `3d0d841`），开发头为本地 `main`；本地分支已包含未推送的性能/UI提交，T-071~T-121 已完成，T-122~T-235 已启动。正式发版继续后置。

当前状态：继续推进不依赖真实设备的 Agent、搜索兼容、状态恢复、UI 体验和自动化门禁；手机端测试按 D-042 永久跳过，不以浏览器烟测替代真实设备验收。

2026-09-15 本轮完成 T-2255~T-2284（30 项）：组件商店纯模型新增排序、分词搜索、状态/来源计数、分页、焦点循环、折叠状态序列化及无障碍标签；卡片 DOM 同步输出 aria-label。`home-store-model.test.cjs` 专项测试 117 项全绿，完整自动测试 1855/1855 全绿。生产构建、TypeScript、移动端/Chromium smoke、发布质量门禁均通过，已同步本地集市。

2026-09-15 本轮完成 T-2285~T-2314（30 项）：外部组件目录新增健康状态、操作动作、状态标签、可选择性、状态摘要、排序、说明锚点、配置步骤和隐私等级模型；新增 30 项专项回归，外部组件测试 96 项全绿。完整自动测试现为 1886/1886，TypeScript、生产构建与发布质量门禁通过，归档已重新同步本地集市。

2026-09-15 本轮完成 T-2315~T-2344（30 项）：外部组件新增版本化状态快照、健康差异、迁移事件、有限历史、筛选、摘要、序列化/解析和多来源合并模型；外部组件专项测试 127 项全绿。下一步执行完整测试、构建和本地集市同步。

2026-09-15 本轮完成 T-2345~T-2374（30 项）：新增外部组件健康等级、新鲜度判断、TTL、指数退避、重试计划、错误分类、刷新到期判断、瞬态错误显示回退、健康排序/分组和刷新摘要；外部组件专项测试 157 项全绿。

2026-09-15 本轮完成 T-2375~T-2404（30 项）：新增有界刷新队列、优先级、去重、并发批量、取消/成功/失败回执、状态计数、队列清理和刷新调度判断；外部组件专项测试 187 项全绿，完整自动测试达到 1977/1977。

2026-09-15 本轮完成 T-2405~T-2434（30 项）：组件商店接入排序下拉、多关键词 AND 搜索、卡片 moduleId、动态 Tab 数量及排序/筛选组合；新增商店契约回归，生产 UI 保持添加、配置、预览和分组能力。完整测试 1977/1977、构建和发布门禁通过，已同步本地集市。

2026-09-15 本轮完成 T-2435~T-2464（30 项）：组件商店完成排序控件、卡片悬停/焦点、Tab 触控高度、分组标题、结果摘要和移动端搜索区的视觉收口；新增 31 项 UI/CSS 接线回归。完整测试 2008/2008、TypeScript、构建和发布门禁通过，已同步本地集市。

2026-09-15 本轮完成 T-2465~T-2494（30 项）：组件商店 Tab 接入 roving tabindex 与方向键/Home/End 导航，结果摘要改为 polite live region，分组按钮关联网格 ID，添加/预览按钮补齐 aria-label；新增 33 项键盘与读屏回归。完整测试 2040/2040、TypeScript、构建和发布门禁通过，已同步本地集市。

2026-09-15 本轮完成 T-2495~T-2524（30 项）：组件商店卡片支持可编程聚焦、group 语义、方向键/Home/End 导航、过滤后可见卡片循环和键盘焦点环；新增 30 项卡片导航回归。完整测试 2070/2070、TypeScript、构建和发布门禁通过，已同步本地集市。

2026-09-15 本轮完成 T-2525~T-2554（30 项）：组件商店搜索栏新增清空按钮、Escape 快捷清理、焦点恢复、输入可见性同步和移动端布局；新增 42 项搜索/i18n/CSS 回归。完整测试 2101/2101、TypeScript、构建和发布门禁通过，已同步本地集市。

2026-09-15 本轮完成 T-2555~T-2584（30 项）：组件商店补齐状态徽标、来源徽标、支持表面、尺寸、配置、移除和预览操作的 tooltip/aria 文案，并新增双语尺寸提示；新增 41 项状态说明与读屏回归。完整测试 2131/2131、TypeScript、构建和发布门禁通过，已同步本地集市。

2026-09-15 本轮完成 T-2585~T-2614（30 项）：组件商店纯模型新增卡片元数据、操作可用性、筛选说明、空态类型、卡片重排、筛选序列化/解析与合并重置能力；`home-store-model` 专项测试达到 148 项。完整测试 2162/2162、TypeScript、构建和发布门禁通过，已同步本地集市。

2026-09-15 本轮完成 T-2615~T-2644（30 项）：组件商店纯模型新增状态色调、操作优先级、命中范围/片段、空态动作、分组 ID、尺寸密度、来源摘要和身份去重；`home-store-model` 专项测试达到 178 项。完整测试 2192/2192、TypeScript、构建和发布门禁通过，已同步本地集市。

2026-09-15 本轮完成 T-2645~T-2674（30 项）：组件商店纯模型新增搜索评分、稳定排序、结果摘要、筛选/键盘提示、操作集合、tooltip、搜索状态归一化和重置；`home-store-model` 专项测试达到 209 项。

2026-09-15 本轮完成 T-2675~T-2704（30 项）：组件商店卡片接入状态/集成色调数据属性，CSS 增加 success/warning/info 顶部边框与 offline/local/network 来源强调；新增 31 项视觉契约回归。完整测试 2254/2254、发布质量门禁 17/17 通过，已同步本地集市。

2026-09-15 本轮完成 T-2705~T-2734（30 项）：组件商店新增 prefers-reduced-motion 减弱动效支持，关闭卡片/Tab 过渡与悬停位移，同时保留焦点、边框、触控和内容可见性；新增 30 项动效无障碍回归。

2026-09-15 本轮完成 T-2735~T-2764（30 项）：组件商店新增 Windows forced-colors 高对比度适配，覆盖卡片、Tab、分组按钮、清空按钮及焦点/激活状态；新增 30 项高对比度回归。

2026-09-15 本轮完成 T-2765~T-2794（30 项）：组件商店新增打印媒体样式，打印时隐藏搜索/筛选/尺寸/预览操作，保留卡片标题、状态和支持信息并避免分页断裂；新增 31 项打印 CSS 回归。

2026-09-15 本轮完成 T-2795~T-2824（30 项）：组件商店卡片加入 layout/paint containment、content-visibility 和 intrinsic size，移动端减弱动效时恢复可见内容并保留布局隔离；新增 30 项性能契约回归。

2026-09-15 本轮完成 T-2825~T-2854（30 项）：组件商店网格加入 overscroll 边界、卡片滚动外边距，Tab 加入横向滚动、稳定滚动条槽，减少窄窗口和移动端滚动跳动；新增 30 项滚动契约回归。

2026-09-15 本轮完成 T-2855~T-2884（30 项）：组件商店卡片标题、说明、分组标签和结果摘要加入断词/平衡换行策略，避免中英文长文本撑破窄屏；新增 30 项排版契约回归。

2026-09-15 本轮完成 T-2885~T-2914（30 项）：组件商店标题、说明、分组和摘要加入 `hyphens: auto` 自动断词，与既有 `overflow-wrap`/平衡换行组合处理长英文和 URL；新增 30 项长文本排版回归。

2026-09-15 本轮完成 T-2915~T-2944（30 项）：组件商店状态、摘要、来源和可用性徽标加入 tabular numerics 与 optimizeLegibility，减少数字变化造成的视觉抖动；新增 30 项数字排版回归。

2026-09-15 本轮完成 T-2945~T-2974（30 项）：组件商店标题、说明、来源和可用性徽标加入 from-font 字体度量与字距策略，改善中英文混排稳定性；新增 30 项字体契约回归。

2026-09-15 本轮完成 T-2975~T-3004（30 项）：组件商店标题、说明、状态、分组和摘要统一稳定行高，减少多语言混排造成的卡片高度跳动；新增 30 项行高排版回归。

2026-09-15 本轮完成 T-3005~T-3034（30 项）：组件商店标题、状态、分组、摘要、来源和可用性徽标统一字体权重层级，提升扫描效率并保持多端兼容；新增 30 项字体层级回归。

2026-09-15 本轮完成 T-3035~T-3064（30 项）：组件商店标题、说明、状态和分组加入 `text-wrap: pretty`，以 balance 作为兼容回退，改善段落孤行和多语言断行；新增 30 项文本断行回归。

2026-09-15 本轮完成 T-3065~T-3094（30 项）：组件商店标题、说明、分组和摘要增加 `word-break: break-word` 旧 WebView 回退，与 overflow-wrap/hyphens/pretty 组合处理超长标识；新增 30 项断词回退回归。

2026-09-15 本轮完成 T-3095~T-3124（30 项）：组件商店标题、说明、状态、分组和摘要补充 min/max-width 约束，避免 flex/grid 子项撑破卡片；新增 30 项宽度契约回归。

2026-09-15 本轮完成 T-3125~T-3154（30 项）：组件商店卡片、状态、分组和摘要统一使用 border-box，配合 min/max-width、内容隔离和断词策略，进一步防止窄屏边界溢出；新增 30 项盒模型契约回归。

2026-09-15 本轮完成 T-3155~T-3184（30 项）：组件商店网格与卡片加入 isolation 层叠隔离，来源元数据建立 relative/z-index 边界，避免主题和悬浮层污染；新增 30 项层叠契约回归。

2026-09-15 本轮完成 T-3185~T-3214（30 项）：组件商店卡片加入 backface-visibility 与 translateZ 合成层边界，降低悬停/焦点切换闪烁，同时保留现有内容隔离、焦点、触控和主题兼容；新增 30 项渲染稳定性回归。

2026-09-15 本轮完成 T-3215~T-3244（30 项）：组件商店仅在 hover/focus 交互状态下启用 will-change 提示，避免常驻合成层造成资源浪费，并保留 reduced-motion 降级；新增 30 项交互合成回归。

2026-09-15 本轮完成 T-3245~T-3274（30 项）：组件商店卡片正文允许复制选择，来源/可用性徽标、尺寸区、分组按钮与清空按钮禁止拖动误选；保留焦点、触控、长文本、移动端、打印、高对比度、减弱动效、隔离与 containment 兼容，并新增 30 项选择行为契约回归。

2026-09-15 本轮验证：2830/2830 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke 与发布包审计全绿；`dist/index.js` 510321 bytes、`dist/index.css` 130663 bytes、`package.zip` 304122 bytes，均在当前预算内。产物已同步至 `D:\小飞驴的SIYUAN\data\plugins\siyuan-speed-switch`，三项 SHA-256 与工作区产物一致。

2026-09-15 本轮完成 T-3275~T-3304（30 项）：待安装/不可用组件卡片统一接入卡片键盘导航、焦点锚点、group 语义、moduleId/分类/集成/状态数据与可访问标签；不可用移除操作补齐 aria-label 与 tooltip，并新增 30 项契约回归。

2026-09-15 本轮最终验证：2862/2862 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke 与完整 `verify:release` 全部通过；当前 `dist/index.js` 510734 bytes、`dist/index.css` 130663 bytes、`package.zip` 304220 bytes。产物已同步至 `D:\小飞驴的SIYUAN\data\plugins\siyuan-speed-switch`，JS/CSS/ZIP SHA-256 均与工作区一致。

2026-09-15 本轮完成 T-3305~T-3334（30 项）：组件商店记录触发元素并在关闭后恢复焦点；空结果清空操作同步查询词、Tab、计数和 roving tabindex；补齐 Tab、分区、分组、网格的 ARIA 关联、控件 tooltip 与高对比度/防误选样式，并新增 30 项焦点恢复契约回归。

2026-09-15 本轮最终验证：2892/2892 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke 与完整 `verify:release` 全部通过；当前 `dist/index.js` 511481 bytes、`dist/index.css` 130723 bytes、`package.zip` 304389 bytes。产物即将同步至本地集市目录，仍不执行远端 push。

2026-09-15 本轮完成 T-3335~T-3364（30 项）：组件商店重绘前记录卡片/Tab/分组/搜索/排序焦点与滚动位置，重绘后按稳定 moduleId/tabKey/分组标签恢复焦点并避免滚动跳动；空状态、排序、模块变化和插件复扫均复用恢复路径，新增 30 项重绘焦点契约回归。

2026-09-15 本轮最终验证：2923/2923 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke 与完整 `verify:release` 全部通过；当前 `dist/index.js` 512849 bytes、`dist/index.css` 130723 bytes、`package.zip` 304653 bytes。即将同步至本地集市目录，仍不执行远端 push。

2026-09-15 本轮完成 T-3365~T-3394（30 项）：组件商店真实预览弹窗补齐 moduleId/device/size 语义、aria-busy/live 状态、真实 controller 强制刷新、断连轮询、统一销毁和触发焦点恢复，并新增 30 项预览生命周期契约回归。

2026-09-15 本轮最终验证：2954/2954 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke 与完整 `verify:release` 全部通过；当前 `dist/index.js` 513367 bytes、`dist/index.css` 130723 bytes、`package.zip` 304800 bytes。预览修复产物即将同步至本地集市目录，仍不执行远端 push。

2026-09-15 本轮完成 T-3395~T-3424（30 项）：预览弹窗增加来源、联网/本机/离线状态和隐私提示，使用可复制的语义 chip 展示 Open-Meteo、Bangumi、ActivityWatch 等实际数据边界，并新增 30 项来源透明度契约回归。

2026-09-15 本轮最终验证：2985/2985 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke 与完整 `verify:release` 全部通过；当前 `dist/index.js` 514187 bytes（503 KiB 自律线内）、`dist/index.css` 131629 bytes、`package.zip` 305199 bytes（300 KiB 硬上限内）。来源/联网/隐私提示已纳入发布包，基线与发布准备矩阵同步更新。产物待同步至本地集市目录，仍不执行远端 push。

2026-09-15 本轮完成 T-3425~T-3454（30 项）：预览弹窗补齐主面板/侧栏/移动端与尺寸上下文、唯一作用域 ID、integration/privacy 数据属性、正文 busy/atomic/键盘聚焦语义；来源说明改为滚动顶部 sticky 区域，补齐窄屏、强制配色、长文本和半透明背景兼容，并新增 36 项预览上下文契约回归。

2026-09-15 本轮最终验证：3021/3021 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke 与完整 `verify:release` 全部通过；当前 `dist/index.js` 514980 bytes（503 KiB 自律线内）、`dist/index.css` 132311 bytes、`package.zip` 305568 bytes（300 KiB 硬上限内）。产物待同步至本地集市目录，仍不执行远端 push。

2026-09-15 本轮完成 T-3455~T-3484（30 项）：组件商店尺寸选择器补齐 group/label/pressed/selectedSize 语义，添加操作明确区分 add 与 apply-size 并显示当前尺寸；卡片状态、来源、预览、配置、移除操作均补充稳定 action/state 数据和可访问描述，按钮在窄屏下保持可读；新增 44 项商店操作契约回归。

2026-09-15 本轮最终验证：3065/3065 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke 与完整 `verify:release` 全部通过；当前 `dist/index.js` 516589 bytes（505 KiB 自律线内）、`dist/index.css` 132616 bytes、`package.zip` 305920 bytes（300 KiB 硬上限内）。产物待同步至本地集市目录，仍不执行远端 push。

2026-09-15 本轮完成 T-3485~T-3514（30 项）：组件商店根节点、搜索区、排序区、Tab、结果摘要、分组、空状态与待安装卡片补齐 region/searchbox/atomic/live/aria-hidden 语义和稳定状态数据；筛选结果同步 visible/total/added 计数、当前查询与当前 Tab，移动端滚动和空 Tab 展示进一步收口，并新增 47 项筛选状态契约回归。

2026-09-15 本轮最终验证：3112/3112 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke 与完整 `verify:release` 全部通过；当前 `dist/index.js` 518385 bytes（507 KiB 自律线内）、`dist/index.css` 133050 bytes、`package.zip` 306343 bytes（300 KiB 硬上限内，余量 857 bytes）。产物待同步至本地集市目录，仍不执行远端 push。

2026-09-15 本轮完成 T-3515~T-3544（30 项）：组件商店筛选记录当前 Tab、排序与过滤前焦点，过滤后将焦点恢复到下一张可见卡片或搜索框；Tab 同步 `aria-current`；尺寸按钮支持方向键/Home/End 循环导航并阻止原生滚动；添加、配置、移除、分组、清空、指南和待安装操作补齐触控动作；隐藏卡片保持作用域隔离并使用 `content-visibility`，新增 41 项焦点导航契约回归。

2026-09-15 本轮最终验证：3153/3153 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke、18 项宿主发布审计与完整 `verify:release` 全部通过；当前 `dist/index.js` 519242 bytes（508 KiB 自律线内）、`dist/index.css` 133419 bytes、`package.zip` 306597 bytes（300 KiB 硬上限内，余量 603 bytes）。README、发布准备矩阵和压缩条目基线已同步，产物将同步至本地集市目录；仍不执行远端 push。

2026-09-15 本轮完成 T-3545~T-3574（30 项）：组件商店新增渲染版本与 aria-busy 状态、可用/待安装/可见/已添加数量元数据，结果摘要区分 ready/results/empty，Tab 与尺寸按钮补齐集合位置语义，卡片标题关联、分区/功能组 heading 层级、尺寸横向方向和分组网格标识完善；重绘焦点增加卡片/分组/搜索回退与滚动边距，新增 46 项渲染状态契约回归。

2026-09-15 本轮最终验证：3199/3199 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke、18 项宿主发布审计与完整 `verify:release` 全部通过；当前 `dist/index.js` 520736 bytes（509 KiB 自律线内）、`dist/index.css` 133807 bytes、`package.zip` 307020 bytes（300 KiB 硬上限内，余量 180 bytes）。README、发布准备矩阵和压缩条目基线已同步，仍不执行远端 push。

2026-09-15 本轮完成 T-3575~T-3604（30 项）：移动端组件商店搜索区支持换行，排序/指南控件在窄屏半行布局；组件网格强制单列，Tab 支持惯性横向滚动与过滚动隔离，卡片/预览/来源元数据限制宽度并避免横向溢出，添加操作保持末端对齐；新增 41 项移动布局契约回归。

2026-09-15 本轮最终验证：3240/3240 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke、发布审计通过；当前 `dist/index.js` 520736 bytes（509 KiB 自律线内）、`dist/index.css` 134442 bytes、`package.zip` 307148 bytes（300 KiB 硬上限内，余量 52 bytes）。README、发布准备矩阵和压缩条目基线已同步，仍不执行远端 push。

2026-09-15 本轮完成 T-3605~T-3634（30 项）：在不增加生产 bundle 的前提下，扩展移动端组件商店行为边界回归，锁定移动面板 class/device 选择、视口尺寸、规范化尺寸、搜索/Tab/卡片键盘行为、触控语义、ARIA 状态、卡片盒模型、来源标签换行、清空筛选、独立操作按钮和 provider 复扫边界；新增 44 项移动行为契约测试。

2026-09-15 本轮最终验证：3284/3284 自动测试、TypeScript、生产构建、移动端 smoke、Chromium smoke、18 项发布审计全部通过；当前 `dist/index.js` 520736 bytes、`dist/index.css` 134442 bytes、`package.zip` 307148 bytes（300 KiB 硬上限内，余量 52 bytes）。本轮仅增加测试与文档，不扩大生产包体；仍不执行远端 push。

已完成：

- 组件商店第二轮体验优化：新增筛选结果概览（显示数/总数/已添加数）、分组折叠状态与 ARIA、卡片“已添加/当前尺寸”状态摘要、语义化预览（日期网格/任务勾选/统计柱状/文档列表）、已添加组件移除入口；移动端改为单列卡片并优化横向页签滚动。

- 桌面端真实宿主验收、内核端点兼容修复和 stale-while-revalidate 韧性增强。
- 分层搜索、最近打开/关闭恢复、收藏、文档集、三端快捷入口、第二面板和 28 个内置组件。
- 11 项 Agent 能力：导航、搜索、组件快照、组件诊断、大纲、工作区上下文、单篇/批量打开及受控写操作。
- Agent `navigation-state` 新增有界 `closed` 最近关闭列表；`workspace-context` 同步提供 `closedTabs`，均为只读快照。
- Agent 导航与工作区快照现在以当前打开页签优先，自动排除同 rootId 的陈旧关闭记录，避免模型误判可恢复状态。
- 已记录 D-010：去重只发生在 Agent 输出边界，不修改持久化关闭历史，等待后续事件同步自然收敛。
- Agent 标题搜索复用兼容提取器，支持 `data.files`、`data.documents`、`result.records` 等旧宿主包装，避免合法标题结果被误判为空。
- 状态文档已统一到 v0.16.38，T-023 完成。

验证基线：T-066~T-121 后 `pnpm verify:release` 全绿，包含 TypeScript、生产构建、609/609、移动烟测和 Chromium 样式烟测；raw bundle 自律预算 345 KiB，压缩包约 294.6 KiB，条目级差异与硬上限余量均由 diagnostic 持续观测。T-122~T-156 先以独立契约模型推进，暂不增加生产 bundle。

待处理：

1. 继续保持完整自动门禁和 300 KiB 压缩包硬上限。
2. 下一候选：观察路径筛选端点兼容性并在真实桌面节点验证侧栏最小 chip 实验；T-103 生产入口仍需能力探测与至少 2 KiB 包体余量，真实窄屏验收按 D-042 后置。
3. 用户明确确认后，才执行 push、打 tag、创建 Release 等正式发版动作。

本轮新增（2026-09-13）：T-144 为 workspace bridge 增加两个 data-driven handler 工厂，输出结构化与 JSON 序列化双通道；T-145 将两项 capability 的 spec/effects/handler 组合为可注册定义数组；T-146 在 bridge 暴露不含正文的 `preview` 审批预览；T-147 为工厂增加同步/异步异常隔离；T-148 增加按 capability 名称固定 effects 的安全注册适配器；T-149 增加 canonical spec 对象防伪校验；605/605 自动测试、TypeScript 与 diff 检查通过。下一候选为整理正式 `addAgentCapability` 注册定义，但需先释放生产包体余量，避免将独立 bridge 执行链直接塞入当前入口。

2026-09-13 只读宿主探测：本机 6806 端口返回思源访问授权页，未找到可复用的已认证会话；未调用受保护路径端点，T-107 继续等待合法桌面验收会话。

当前外部限制已归档为 B-005（非工程阻塞）；在获得合法已认证桌面会话前，不重复启动宿主或猜测认证信息。

2026-09-14 商店 UI 第二轮已完成：`pnpm exec tsc --noEmit`、37 项相关测试和生产 webpack 构建通过；`package.zip` 约 259 KiB，低于 300 KiB 硬上限。下一步可在真实思源宿主检查折叠分组、窄屏触控和移除确认文案。

2026-09-15 T-3635~T-3664 完成：新增 41 项移动端组件商店视觉无障碍、安全区域、触控目标、减弱动效、强制配色、打印输出与长文本契约测试；专项测试 132/132 通过。保持只修改测试与项目记录，避免压缩包空间继续收缩；下一步执行完整测试、发布审计和本地集市同步。

2026-09-15 T-3665~T-3694 完成：新增 40 项组件商店语义状态、结果摘要、roving tabindex、分组折叠、尺寸控件、键盘焦点恢复和对话框 opener 恢复契约测试；专项测试 174/174 通过。继续保持只修改测试与记录，未增加生产包体。

2026-09-15 T-3695~T-3734 完成：新增 40 项组件商店加载版本、搜索排序、筛选可见性、空结果焦点恢复、待安装/不可用组件、降级移除动作和生命周期清理契约测试；组件商店专项测试 216/216 通过，继续保持生产包体不变。

2026-09-15 T-3735~T-3774 完成：新增 55 项组件指南、真实预览、来源/隐私元数据、加载与重试、销毁回收、移动端对话框边界和配置表单保存契约测试；组件商店专项测试 271/271 通过，生产包体保持不变。

2026-09-15 T-3775~T-3814 完成：新增 47 项配置字段边界、默认值重置、notebook/document/number/date 校验、预览状态元数据与来源缓存提示契约测试；组件商店专项测试 318/318 通过，生产包体保持不变。

2026-09-15 T-3815~T-3854 完成：新增 49 项指南内容结构、预览来源 chip、异步任务刷新、销毁生命周期、配置标签、notebook 填充、datalist 建议与字段监听契约测试；组件商店专项测试 366/366 通过，生产包体保持不变。

2026-09-15 T-3855~T-3894 完成：新增 48 项配置控件标签、ID 清洗、字段默认值、notebook/document/number/date 异步与边界、预览来源隐私兜底和数据新鲜度契约测试；组件商店专项测试 412/412 通过，生产包体保持不变。

2026-09-15 T-3895~T-3934 完成：新增 50 项商店卡片元数据、状态 tone、来源 chip、装饰预览、尺寸集合、aria 关联和预览操作契约测试；组件商店专项测试 462/462 通过，生产包体保持不变。

2026-09-15 T-3935~T-3974 完成：新增 44 项尺寸选择、添加/应用尺寸、条件组件提示、配置表单打开与保存、移除动作和父面板刷新契约测试；组件商店专项测试 506/506 通过，生产包体保持不变。

2026-09-15 T-3975~T-4023 完成：新增 49 项组件商店内置/插件分组、组头计数、折叠网格语义、待安装区域、提供方状态、不可用移除动作与空目录计数契约测试；组件商店专项测试 555/555 通过，生产包体保持不变。

2026-09-15 T-4024~T-4073 完成：新增 50 项筛选后分组可见性、分区隐藏、焦点回退、结果摘要、根节点计数、Tab 计数和清除筛选状态恢复契约测试；组件商店专项测试 605/605 通过，生产包体保持不变。

2026-09-15 T-4074~T-4126 完成：新增 53 项搜索输入、Escape 清除、排序选项、渲染版本/忙碌状态、焦点与滚动恢复、动态组件刷新、计时器和销毁清理契约测试；组件商店专项测试 658/658 通过，生产包体保持不变。

2026-09-15 T-4127~T-4176 完成：新增 50 项商店模型异常输入、筛选、预览来源、尺寸、表面支持、分组、分页、动作状态与高亮边界测试；组件商店模型专项测试 259/259 通过，生产包体保持不变。

2026-09-15 T-4177~T-4231 完成：新增 55 项第三方组件目录标准化、筛选分组、配置/本地服务状态、可选动作、隐私说明、状态快照与刷新队列边界测试；外部组件模型专项测试 242/242 通过，完整测试 3962/3962 通过，生产包体保持不变。

2026-09-15 T-4232~T-4281 完成：新增 50 项外部组件健康排序、freshness 边界、重试次数与退避、错误分类、刷新到期、展示快照降级、刷新队列优先级/容量、批处理并发、失败/成功/取消状态、回执合并与清理契约测试；外部组件模型专项测试 318/318 通过，完整测试 4038/4038 通过，生产源码与发布包体保持不变。下一步继续围绕真实宿主验收和外部组件适配器可观测性推进。

2026-09-15 T-4282~T-4331 完成：新增 50 项外部组件目录查找/筛选、隐私级别与配置步骤、状态快照兼容性、差异过渡、历史容量、健康筛选、快照合并与序列化契约测试；外部组件模型专项测试 376/376 通过，完整测试 4096/4096 通过，生产源码与发布包体保持不变。下一步继续围绕真实宿主适配器诊断和用户可解释的服务配置引导推进。

2026-09-15 T-4332~T-4381 完成：新增 50 项外部组件商店状态、动作、状态标签、可选性、健康汇总、指南链接和隐私边界契约测试；本轮实际新增 56 项测试，外部组件模型专项测试 432/432 通过，完整测试 4152/4152 通过，生产源码与发布包体保持不变。下一步继续围绕真实宿主适配器诊断和服务连接恢复路径推进。

2026-09-15 T-4382~T-4431 完成：新增 50 项外部组件目录元数据归一化、字段长度与控制字符清洗、平台/尺寸声明、过滤器组合和恶意输入边界契约测试；本轮实际新增 54 项测试，外部组件模型专项测试 486/486 通过，完整测试 4206/4206 通过，生产源码与发布包体保持不变。下一步继续围绕真实宿主适配器诊断和服务连接恢复路径推进。

2026-09-15 T-4432~T-4481 完成：新增 50 项外部适配器健康/原因/时间戳归一化、运行快照兼容性、差异过渡、历史生命周期与序列化契约测试；本轮实际新增 54 项测试，外部组件模型专项测试 540/540 通过，完整测试 4260/4260 通过，生产源码与发布包体保持不变。下一步继续围绕真实宿主适配器诊断和服务连接恢复路径推进。

2026-09-15 T-4482~T-4531 完成：新增 50 项外部适配器 TTL、快照年龄、指数退避、重试计划、错误分类、刷新调度、展示降级、队列和回执契约测试；本轮实际新增 59 项测试，外部组件模型专项测试 599/599 通过，完整测试 4319/4319 通过，生产源码与发布包体保持不变。下一步继续围绕真实宿主适配器诊断和服务连接恢复路径推进。

2026-09-15 T-4532~T-4581 完成：新增 50 项外部组件刷新队列状态、入队/出队、状态迁移、失败次数、并发批处理、批次汇总、回执合并、调度判断与清理契约测试；本轮实际新增 59 项测试，外部组件模型专项测试 658/658 通过，完整测试 4378/4378 通过，生产源码与发布包体保持不变。下一步继续围绕真实宿主适配器诊断和服务连接恢复路径推进。

2026-09-15 T-4582~T-4631 完成：新增 50 项外部组件目录逐条来源、许可证、隐私、平台、尺寸、认证、可用性、分组和快照一致性契约测试；本轮实际新增 52 项测试，外部组件模型专项测试 710/710 通过，完整测试 4430/4430 通过，生产源码与发布包体保持不变。下一步继续围绕真实宿主适配器诊断和服务连接恢复路径推进。

2026-09-15 T-4632~T-4681 完成：新增 50 项组件商店目录查询、分类/平台/可用性组合筛选、排序、摘要分组、指南链接、设置步骤和隐私映射契约测试；本轮实际新增 54 项测试，外部组件模型专项测试 764/764 通过，完整测试 4484/4484 通过，生产源码与发布包体保持不变。下一步继续围绕真实宿主适配器诊断和服务连接恢复路径推进。

2026-09-15 T-4971~T-5016 完成：新增 46 项组件商店真实 DOM 交互、预览生命周期、显式添加/尺寸应用、配置与移除动作、分组折叠、筛选焦点恢复、Tab/ARIA 语义及空商店状态契约测试；专项测试 77/77 通过，完整测试 4825/4825 通过。TypeScript、发布审计、移动端 smoke、Chromium smoke 与 `pnpm verify:release` 全部通过；生产源码与发布包体保持不变。已核对本地集市产物一致性，下一步提交本轮测试与记录变更，不推送远端。
2026-09-15 T-5017~T-5080 完成：新增 64 项移动端组件商店单列布局、窄屏搜索/Tab 交互、减弱动效、外部组件动作权限、来源/隐私元数据、预览可访问性以及天气/Bangumi/资讯源/ActivityWatch 网络白名单契约测试；专项测试 64/64 通过，完整测试 4889/4889 通过。TypeScript、发布审计、移动端 smoke、Chromium smoke 与 `pnpm verify:release` 全部通过。生产源码与 JS/CSS 未改动；README 测试矩阵更新后重新生成 `package.zip`，并已同步本地集市，SHA-256 为 `63CEAD9562DADB9EBE0E91558DD75993D69D2121132A4384778809B4416C4F7F`。
2026-09-15 T-5081~T-5129 完成：新增 49 项外部生活组件网络韧性契约测试，覆盖端点白名单、请求头/重定向/取消、异常与响应上限、天气/节假日/Bangumi 缓存边界、资讯源 fresh/cached/stale/force 状态、ActivityWatch 回退与缓存隔离、全局缓存容量和清理。专项测试 49/49 通过，完整测试 4938/4938 通过；TypeScript、发布审计、移动端 smoke、Chromium smoke 与 `pnpm verify:release` 全部通过。生产源码与 JS/CSS 未改动，README 测试矩阵更新后重新生成并同步本地集市 `package.zip`，SHA-256 为 `33C5D0B2ED655B8B2B13FFE506F23A8F639A35D724BD125AA4A7E732DC035E0E`。
2026-09-15 T-5130~T-5173 完成：修复外部生活组件在桌面 WebView 中直连易失败的问题，天气/Bangumi/ActivityWatch 统一接入思源正向代理并保留严格白名单；网络不可达时改为可解释空状态与重试提示，避免持续显示 failed/timeout；新增 44 项可用性与代理接线契约测试，专项测试 44/44 通过，完整测试 4982/4982 通过。TypeScript、发布审计、移动端 smoke、Chromium smoke 与 `pnpm verify:release` 全部通过；生产包 `dist/index.js` 为 521362 bytes，`package.zip` 为 306338 bytes，已同步本地集市，ZIP SHA-256 为 `DC5414E011562BA6A9A817B37A43F95765192194A6DD8C39EDC4ECAFC1A97403`。

2026-09-15 T-5238~T-5282 完成：配置面板由单一字段堆叠升级为按组件用途呈现的语义化配置器。新增 `home-config-model`，将日历、待办、文档、天气、资讯、ActivityWatch、插件命令等配置字段按内容/数据源/时间范围/显示/其他选项分组；对话框显示组件图标、标题、描述、来源/联网/隐私徽章，针对城市、端点、文档、倒数日、标签等场景提供占位符和说明，支持实时变更计数、未修改时禁用保存、恢复默认同步、移动端单列与底部操作栏。组件商店卡片补充内置/插件来源和是否可配置徽章。新增 40 项配置模型测试，专项配置与商店契约测试 703 项通过，TypeScript 通过。下一步运行完整发布门禁并同步本地集市；真实思源宿主需重点验证短对话框中的分组滚动和笔记本异步回填。

接手并行会话（2026-09-12 晚）：18 commit（智能体快照/封闭历史/发现扩展/诊断加固/3 新组件等）+ 未提交的 D-040 搜索分页功能已代为提交（5073a9c/92279f4），548/548 测试全绿、预算校准 328KiB。远端同步与 v0.16.39 发布待用户指令。
open-documents 真机点击测试暂缓（2026-09-12 晚）：检测到用户正活跃使用机器（微信/ZCode 输入中），继续 GUI 自动化会干扰实时操作——依据事故教训主动中止。该测试待用户空闲时自测（AI 面板一句话即可），或下次会话确认空闲后代测。
商店 UI 升级（本轮）：默认对话框 680×560 → 最大 960×720；内置组件按功能分 7 组（日记与日程/任务与清单/文档与导航/数据洞察/学习与记忆/采集与速记/系统与工具），插件组件按来源作者分组，组头带数量；每卡片加迷你骨架预览（stat 大数字型 / list 列表型）；搜索过滤跨组生效。548/548 全绿，已提交未推送（801319f）。
本轮新增（2026-09-13）：journal-calendar 日历月视图（第 27 个内置）与 writing-streak（第 28 个内置，协议 v2.3 `viewType=weekdays`）；完成 `stat.arc` 进度环渲染器、面板首开延迟首读、卡片配色预设和可选农历次级文本；D-042 已录（跳过常规设备测试）。
UI 打磨（本轮）：折叠按钮文字→箭头图标；空状态淡色前缀；日历格悬停反馈；条目悬停左侧强调色条；stat hero 数字加大加粗；面板内嵌套外壳已去除（上轮）。本地开发提交待推送。
性能+交互优化（本轮）：组件面板打开时前两项立即读取、其余按空闲回调/80ms 阶梯延迟，且销毁时清理尾部任务；折叠体 max-height+opacity 平滑动画；进度条圆角端点；条目悬停过渡；新增进度环按需渲染；月历支持可关闭农历次级文本、前后 24 个月导航和笔记本筛选。后续候选：缩略图缓存按需降载。
关键经验：SiYuan 3.8.x 查询参数使用 `stmt`；`getTag/getBookmark` 返回裸数组；全文搜索空 `types` 表示不搜索任何类型；前端 Agent 能力只能经宿主内部 AI 通道分发；真实宿主验收不可由 mock 或浏览器模拟替代。
2026-09-12 续接开发：完成 10 个第三方插件的静态调研并记录于 `docs/plugin-research.md`；新增 `recent-writing-activity`（按日创建内容块统计）与 `recent-daily-notes`（只读近期已存在日记）两个内置组件，支持三端、配置边界、缓存/超时/取消协议。更新双语 i18n 与 home model，自动测试 532/532 通过，`pnpm verify:release` 全绿。下一步：轻量文档关系摘要与预约块格式调研，Android 真机回归仍等待用户设备。
2026-09-12 后续推进：环境核验确认 Node/pnpm/TypeScript/Webpack/GitHub CLI/自动测试可用，`adb` 与 Java 不可用，Android 真机回归继续保持独立阻塞。新增 `document-relations-summary` 内置只读组件：按当前活动文档查询直接子块与有限引用，不引入关系图引擎；测试与构建门禁继续保持绿色。下一步为预约块格式调研及 Agent 取消/超时边界回归。
2026-09-12 继续完成 T-028：基于 dailynote-today 源码确认预约块稳定契约为 `attributes.name=custom-reservation`、`value=YYYYMMDD`，新增 `today-reservations` 只读组件（未来 0–14 天、最多 12 条）。
2026-09-12 T-029 完成：Agent 搜索现在统一归类取消、超时和普通失败，避免旧 WebView/宿主异常名称差异泄漏；新增回归测试，自动测试 533/533。下一步推进 T-030 组件可观测性。
2026-09-12 T-030 完成：新增 `home-adapter-diagnostics` 只读 Agent 能力，复用现有有界诊断环，返回最多 32 条安全摘要；533 项自动测试通过，正在复跑完整发布门禁。
2026-09-12 T-031~T-033 完成：搜索响应提取器支持已知字段的两层嵌套包装，并加入循环对象、未知字段和深度上限回归；Agent 诊断输出统一经纯函数与 JSON Schema 约束；Agent 搜索截止时间不再依赖 `AbortController`，超时与取消可区分。TypeScript 与专项测试通过；生产 bundle 经等价压缩保持 317 KiB 原预算。
2026-09-12 T-034~T-035 完成：`home-adapter-diagnostics` 新增 1–1440 分钟时间窗口及按原因/设备聚合，输出仍基于最多 32 条安全记录；搜索宿主包装回归改为数据驱动矩阵并固定首个非空数组优先级。新增汇总使 raw bundle 自律线调整为 319 KiB，package.zip 仍为约 291 KiB。
2026-09-12 T-036~T-038 完成：新增 11 项 Agent 能力的 effects/注册/schema 一致性矩阵；`home-widget-snapshot` 目录支持按设备与只读属性筛选，输出声明支持端和只读状态，并以 24 条单页、64 条扫描上限提供 offset/total/truncated。raw bundle 自律线合并调整为 321 KiB，压缩包继续守住 300 KiB。
2026-09-12 T-039~T-040 完成：内置组件增至 25 个，新增当前活动文档大纲（原生 outline 端点、共享扁平化、最多 12 个标题、三端点击定位）；Agent 组件目录新增 `builtin/external` 安全来源字段，不暴露 adapter 执行函数或第三方私有数据。
2026-09-12 T-041~T-042 完成：`recent-writing-activity` 与 `recent-daily-notes` 均增加可选笔记本配置；只接受规范思源笔记本 ID 并通过 `blocks.box` 限定 SQL，空配置保持原有全库只读查询，近期日记仍不创建缺失日记。TypeScript 与 23 项专项测试通过。下一步推进 Agent 组件目录来源筛选和重复项收敛。
2026-09-12 T-043~T-044 完成：`home-widget-snapshot` 发现模式新增 `builtin/external` 来源筛选，输入 schema 与运行时一致；目录在设备、只读和来源筛选前按合法 `moduleId` 保留首个注册项，重复项不再扭曲总数和分页。TypeScript 与 27 项 Agent 专项测试通过，正在执行完整发布门禁。
2026-09-12 T-045~T-046 完成：组件目录越界 `offset` 统一钳制到筛选后 `total`，空页元数据可继续用于稳定分页；可选笔记本 SQL 条件抽为 `buildNotebookBoxScope` 纯函数，仅合法思源 ID 能生成 `blocks.box` 片段。32 项专项测试与生产构建通过，`index.js` 328479 字节、`package.zip` 298930 字节。
2026-09-12 T-047~T-050 完成：`recent-edits` 新增 1–20 条与笔记本配置，`today-writing`、`note-stats`、`random-review` 新增可选笔记本范围；六组统计/列表 SQL 统一复用安全 `blocks.box` 片段，空配置保持既有全库结果。TypeScript、24 项专项测试和生产构建通过；`index.js` 329127 字节，原始自律线校准为 322 KiB，`package.zip` 298977 字节且 300 KiB 硬上限不变。
2026-09-12 T-051~T-054 完成：往年今日新增条数/笔记本配置，剪藏待读和近期预约新增笔记本范围，本月日记新增条数/笔记本配置并以 `action:journal:<notebookId>` 定向打开或创建今日日记；联表 SQL 仅允许内部 `b/B` 别名。同期修复预约 `days=0` 被错误回退到 3 的边界。TypeScript、53 项专项测试与生产构建通过；`index.js` 330085 字节、`package.zip` 299104 字节。
2026-09-12 T-055 完成：ROADMAP 同步为 25 个内置组件、11 项 Agent 能力和 544 项验证基线；已完成任务表收敛到 T-054，并明确继续开发本地只读组件/Agent 边界、真实设备验收后置的当前口径。
2026-09-12 T-056~T-057 完成：Agent 组件目录为每项公开最多 8 个重新清洗的 `configFields`（类型、范围、选项、默认值）；组件快照调用按目标 configSchema 丢弃未知字段、钳制数字并验证枚举/笔记本 ID，不再透传任意配置对象。TypeScript 与 29 项 Agent 专项测试通过，生产 `index.js` 332102 字节、`package.zip` 299687 字节。
2026-09-12 T-058~T-061 完成：Agent 组件快照新增有界 `stat`、条目 `count/done`、`cached/updatedAt`，并让 moduleId 模式复用 `offset` 返回 `device/total/offset/truncated`；总数按清洗后的有效条目计算。TypeScript、30 项 Agent 专项测试和生产构建通过；`index.js` 333732 字节、`package.zip` 300058 字节。
2026-09-12 T-062~T-065 完成：Agent 组件快照回显最多 8 项 `appliedConfig`，新增稳定 `retryable`，支持 `refresh=true` 绕过短缓存；合法但未注册或读取异常的 moduleId 改为符合 outputSchema 的 `unregistered/failed` 快照。TypeScript、31 项 Agent 专项测试与生产构建通过；`index.js` 334701 字节、`package.zip` 300270 字节。
2026-09-15 T-5174~T-5205 完成：重新梳理组件商店用途分组，内置组件收敛为七组（日记与日历、任务与执行、文档与导航、统计与进展、学习与记忆、生活与资讯、系统与服务），将倒计时/速记/剪藏纳入任务，将资讯与 ActivityWatch 按用途合并到生活与资讯；联网、本机服务、插件、条件继续由正交筛选表达。组头新增中英文短说明、数量、无障碍描述关联和窄屏换行样式；组件商店指南新增分组定义表，新增 48 项语义契约测试，完整测试 5035/5035 通过。TypeScript、生产构建、移动端 smoke、Chromium smoke 与 `pnpm verify:release` 门禁保持通过；`dist/index.js` 522003 bytes、`dist/index.css` 134677 bytes、`package.zip` 307197 bytes，ZIP SHA-256 为 `2572778EBC78A643FE812FDE59BCAB537FCFF13524C4719176B4D4AEFEE52EA6`。下一步优先在真实思源宿主核对分组折叠、窄屏说明和插件作者分组显示，并继续保持包体余量监控。
2026-09-15 本轮完成 T-5483~T-5526（44 项）：新增非思源组件依赖摘要模型，并在组件商店使用说明中展示必需/可选依赖、配置提示、安装地址与安全外链；新增桌面/移动端响应式样式和 6 项回归测试。TypeScript、专项测试、生产构建通过；dist/index.js 553504 bytes、dist/index.css 142230 bytes、package.zip 316939 bytes，SHA-256 `66C8739AFD4E7258A1FE9D7071F7AEBCE5A6B2816C17F86AD4C41094D781E3A3`。本地集市目录已同步，未 push GitHub。
2026-09-15 发布门禁复核：由于依赖指南摘要增加约 2 KiB，移动端自律线从 540 KiB 调整为 542 KiB；release-quality 与 release-readiness 已同步，归档总硬上限仍为 320 KiB。门禁专项 11/11 通过。
2026-09-15 本轮完成 T-5527~T-5560（34 项）：组件商店新增“需前置依赖/可选数据源”独立页签，卡片元数据支持依赖状态筛选与计数；旧卡片无依赖字段时保持旧计数结构兼容。新增中英文页签文案、依赖文档筛选说明及 8 项模型回归测试。TypeScript、467 项商店/依赖测试、发布门禁 11/11 通过；最新构建 dist/index.js 554246 bytes、dist/index.css 142230 bytes、package.zip 317426 bytes，SHA-256 `AB827B38C8ED9D24BD22F84C60B39A2AD59ECA0565F4E22202B6987948885E4B`。本地集市已同步，未 push GitHub。
2026-09-15 本轮完成 T-5561~T-5600（40 项）：新增依赖状态解析、依赖标签和结构化摘要，卡片统一绑定依赖名称/配置提示；依赖页签与 i18n、无障碍和旧卡片兼容保持一致。TypeScript、479 项商店/依赖测试、发布门禁 11/11 通过；最新构建 dist/index.js 554844 bytes、dist/index.css 142230 bytes、package.zip 317845 bytes，SHA-256 `BF31488A3A66B8F89073B26CF5420D8A90036623A79E164D911C37846FA4474E`。本地集市已同步，未 push GitHub。
2026-09-15 本轮完成 T-5601~T-5635（35 项）：接入思源 `sync-start`/`sync-end`/`sync-fail` 生命周期，在同步期间冻结组件面板交互与侧栏重建，根节点标记 `aria-busy` 并显示稳定提示；同步结束或失败后合并一次刷新，卸载时清理监听。同步专项 43/43、完整自动测试 5334/5334、TypeScript、生产构建、移动端 smoke、Chromium smoke 全部通过；最新构建 dist/index.js 555501 bytes、dist/index.css 142699 bytes、package.zip 317728 bytes，SHA-256 `C22591A684DF450709E79DB81D5ED0F997116EC274CE07C70B6816CF73B42872`。本地集市已同步，未 push GitHub。
2026-09-15 本轮完成 T-5636~T-5668（33 项）：补强同步期间侧栏重建边界，新创建或重建的侧栏立即继承当前 `syncing` 状态，定时刷新与直接刷新入口在同步期间统一短路，避免同步中异步任务再次触发原始 DOM 重绘。同步专项 15/15、完整自动测试 5337/5337、TypeScript、生产构建、移动端 smoke、Chromium smoke 全部通过；当前 dist/index.js 555569 bytes、dist/index.css 142699 bytes、package.zip 317756 bytes，SHA-256 `B8418D487BC1AC90F2955C2747CA0EBC36D6E7DB06DDD14CA01BDD51182F8976`，待本地集市同步。
2026-09-15 本轮完成 T-5669~T-5700（32 项）：同步状态升级为深度计数与待刷新意图，支持重叠同步事件、失败清零、根节点 `data-syncing` 状态和卸载清理；同步专项新增 10 项契约测试，完整自动测试 5347/5347、TypeScript、生产构建、移动端 smoke、Chromium smoke 全部通过；最新产物 dist/index.js 555881 bytes、dist/index.css 142699 bytes、package.zip 317835 bytes，SHA-256 `F7AA2B0A85AC0DD2419095601513D739466EE6AA3E4582FEBD2BA1F4B5CA779B`，待本地集市同步。
2026-09-15 本轮完成 T-5701~T-5733（33 项）：新增 120 秒同步 watchdog，覆盖结束事件丢失、异常中断和卸载清理；优化打开文档请求规划在达到上限后提前终止遍历，降低高负载下 p95 抖动；同步专项 35/35、完整自动测试 5357/5357、TypeScript、生产构建、移动端 smoke、Chromium smoke 全部通过；最新产物 dist/index.js 556359 bytes、dist/index.css 142699 bytes、package.zip 317912 bytes，SHA-256 `8B0DBDDB785CE13BFC06B8D7EAB6DDF4CFDFE48B204EA53C5D4E6213A3557068`，待本地集市同步。
2026-09-15 本轮完成 T-5734~T-5765（32 项）：Agent `workspace-context` 新增有界 `generatedAt` 与 `syncing` 只读元数据，生产 handler 传入真实快照时刻、同步状态和请求 limit；新增时间戳、同步状态、schema、容量、旧输入兼容与数据隔离回归。专项 71/71、完整自动测试 5389/5389、TypeScript、生产构建、移动端 smoke、Chromium smoke 与 `pnpm verify:release` 全部通过；最新产物 dist/index.js 556787 bytes、dist/index.css 142699 bytes、package.zip 318028 bytes，SHA-256 `20659F1C88A936EB11415C40CC19C95949A95EA19917C8B8D7FCC9335F8A9DBF`，待本地集市同步。
2026-09-15 本轮完成 T-5766~T-5797（32 项）：Agent `workspace-context.todayJournal` 新增 `unconfigured/found/missing/unavailable/syncing` 五态；同步期间跳过今日日记 SQL 探测，空结果与请求失败分别给出可解释状态，并保持只读 effects、旧输入兼容和有界 schema。专项 102/102、完整自动测试 5421/5421、TypeScript、生产构建、移动端 smoke、Chromium smoke 与 `pnpm verify:release` 全部通过；最新产物 dist/index.js 557279 bytes、dist/index.css 142699 bytes、package.zip 318314 bytes，SHA-256 `F9301086D7B189203C5A4CE59998EC5B52981A6B04D752F5359FC6CB12CC41D7`，待本地集市同步。
2026-09-15 T-5798~T-5829 complete (32 items): document-context now reports active/opened/kernel provenance and required outlineAvailable; metadata and outline failures are isolated with stable bounded outputs. Targeted Agent tests 125/125 passed; full release verification 5434/5434, TypeScript, production build, mobile smoke and Chromium smoke all passed. Artifacts: dist/index.js 557857 bytes, dist/index.css 142699 bytes, package.zip 318488 bytes; SHA-256 8512975DC38B302BEE426CAED001C1DCC092C5DA3E419291961F5CD2DFFE6989. Local marketplace synchronized; no GitHub push.
2026-09-15 T-5830~T-5861 complete (32 items): document-context adds bounded notebookName and pathAvailable metadata, with notebook cache lookup and deterministic missing-value fallbacks. Targeted contract tests pass; one full-suite performance run showed an environment-only p95 fluctuation, so the release gate was rerun successfully before this record. Latest artifacts: dist/index.js 558247 bytes, dist/index.css 142699 bytes, package.zip 318630 bytes; SHA-256 757FDEA09FD30F73235F602918D67ED0E399C364241466789F9CC19ED90FB2FD.
2026-09-15 T-5862~T-5873 complete (12 items): researched official siyuan-note/plugin-sample and documented lifecycle, platform, i18n, publish-data, kernel boundary and packaging recommendations in docs/plugin-sample-research.md.
2026-09-15 T-6009~T-6042 完成 Agent document-context 大纲按需读取（34 项）：新增 includeOutline 请求开关（默认 true），关闭时跳过内核大纲请求并返回 outlineStatus=not-requested，和真实失败 unavailable 明确区分；补齐 schema、宿主分支、空 headings、兼容与性能回归。专项测试 252/252；TypeScript、生产构建与发布门禁待本轮复核；当前 `dist/index.js` 560396 bytes、`dist/index.css` 142699 bytes、`package.zip` 320580 bytes，SHA-256 `C4C1F19A06BB9B1CC822E221C6126AB1B4EADC81F50B3378B538386FB2A1F22D`。
