# 外部生活组件数据源审计

> 审计日期：2026-09-14。目标是为组件商店增加独立的“生活信息”能力，不把外部网络组件伪装成思源本地组件，也不把公共演示服务当成稳定基础设施。

## 结论

采用分层接入：本地时间、Open-Meteo 天气、Bangumi 每日放送、DailyHotApi 热榜、NewsNow 资讯和 ActivityWatch 应用使用时长已经内置，holiday-cn 已作为日历可选覆盖层接入；热榜和新闻必须由用户填写可配置/自部署完整端点；TMDB 要求用户 API Key。活动窗口标题与原生活动窗口读取暂不接入生产。

| 候选组件 | 来源 | 许可/条款 | 凭据 | 建议状态 | 关键边界 |
| --- | --- | --- | --- | --- | --- |
| 时间与日期 | 浏览器 `Intl.DateTimeFormat` | 平台能力 | 无 | 已内置 | 完全离线，每分钟刷新，页面隐藏时暂停 |
| 近期天气 | [Open-Meteo](https://github.com/open-meteo/open-meteo) | API 数据 CC BY 4.0；免费公共 API 受非商业条款约束 | 无 | 已接入 | 只发送用户手填城市与解析坐标；天气缓存 15 分钟、地点缓存 24 小时；不读取设备定位并显示署名 |
| 热搜事件 | [DailyHotApi](https://github.com/imsyy/DailyHotApi) | MIT | 用户端点 | 已接入 | 不内置公共演示服务；仅接受已知热榜路由；30 分钟缓存并显示来源健康 |
| 实时资讯 | [NewsNow](https://github.com/ourongxing/newsnow) | MIT | 用户端点 | 已接入 | 仅接受 `/api/s?id=来源`；30 分钟缓存、逐组件失败隔离并显示过期缓存 |
| 中国节假日 | [holiday-cn](https://github.com/NateScarlet/holiday-cn) | MIT | 无 | 已接入 | 默认关闭；每年静态 JSON 内存缓存 24 小时；年份交界同时检查下一年度公告 |
| 电影推荐 | [TMDB API](https://developer.themoviedb.org/docs) | TMDB API 条款 | API Key | 条件组件 | Key 只存插件私有配置；必须展示 attribution；首期只做趋势/发现，不声称个性化推荐 |
| 每日放送 | [Bangumi API](https://github.com/bangumi/api) | API 使用约定 | 无 | 已接入 | legacy `/calendar` 整周读取后按本地星期筛选；30 分钟缓存；WebView 使用宿主浏览器 UA；仅加载官方封面域名，不抓取网页 DOM |
| 使用时长 | [ActivityWatch](https://github.com/ActivityWatch/activitywatch) | MPL-2.0 | 本地服务 | 已接入（桌面/侧栏） | 只连接 loopback 固定 Query API；经思源正向代理规避 CORS；服务端按应用聚合且不查询标题；5 分钟缓存；移动端不支持 |
| 当前应用状态 | [get-windows](https://github.com/sindresorhus/get-windows) | MIT | 本地原生能力 | 仅参考 | 需要原生 Node/系统权限，思源插件沙箱与移动端无法可靠承诺 |

## 实际连通性抽查

2026-09-14 初次只读抽查中 Open-Meteo、holiday-cn CDN 与 Bangumi API 返回 HTTP 200，DailyHotApi 公共演示端点出现 TLS 连接失败；本轮再次检查 Bangumi 时开发机到 `api.bgm.tv:443` 连接超时。两次结果共同说明任何公共来源都不能被视为长期 SLA：UI 必须显示来源/联网/隐私信息，运行时必须超时、缓存并把失败限制在单一组件。

ActivityWatch 本轮开发机 `127.0.0.1:5600` 未启动，因此完成了模型、固定路由、思源代理、缓存和 DOM/Chromium 自动门禁，但不把它冒充真实服务验收；安装 ActivityWatch 的桌面环境仍需补一次现场读数核对。

## GitHub 高 Star 仪表盘复核

这些项目用于发现成熟的信息架构和候选数据类型，不直接复制其前端或把整套运行时塞入插件：

| 项目 | 抽查热度 | 可借鉴内容 | 本项目处理 |
| --- | ---: | --- | --- |
| [Glance](https://github.com/glanceapp/glance) | 约 37k stars | RSS、Hacker News、天气、视频、市场行情；轻依赖和多列布局 | 作为 v0.21 候选池；优先审计 RSS/HN，市场接口先查条款 |
| [Homepage](https://github.com/gethomepage/homepage) | 约 31.9k stars | 信息组件/服务组件分层、后端代理隐藏凭据、100+ 服务接入 | 已借鉴“离线/本机服务/外部 API”分层；不引入 Docker 服务控制 |
| [Dashy](https://github.com/Lissy93/dashy) | 高 Star 自托管仪表盘 | RSS、汇率、公共假日、体育、股票、服务状态和丰富主题 | 仅借鉴组件类型与配置透明度；禁止任意 HTML/iframe 组件 |
| [Homarr](https://github.com/ajnart/homarr) | 约 7.2k stars（历史仓库） | 拖拽网格、密钥管理、服务状态与媒体服务集成 | 借鉴配置/密钥分层；控制类集成不进入当前只读路线 |
| [Glance community widgets](https://github.com/glanceapp/community-widgets) | 约 868 stars | GitHub 贡献图、iCal、Lichess、Bilibili 等长尾组件 | 仅作为发现索引，逐项重新审计来源和许可，不信任任意模板代码 |

下一批优先级：① 无 Key 的 Hacker News / 安全 RSS；② 用户自建 iCal 只读日程；③ TMDB 趋势电影（完成 Key 撤销与 attribution 后）；④ GitHub 贡献热力图。股票、加密货币和体育比分涉及不稳定/商业接口，暂不承诺生产接入。

## GitHub 高 Star 候选组件池（2026-09-15）

以下项目通过 GitHub Repository API 按 stars 排序抽查（星数为抽查时的约值），用于寻找可拆成轻量只读卡片的来源。候选必须重新审计 API、许可、隐私和端侧边界，不能直接复制其代码或把完整服务打包进插件。

| 候选组件 | GitHub 项目（约 Star） | 许可 | 适合的小组件形态 | 联网/前置条件 | 处理结论 |
| --- | --- | --- | --- | --- | --- |
| Hacker News 热门 | [glanceapp/glance](https://github.com/glanceapp/glance)（37.0k） | AGPL-3.0 | 热门标题、分数、评论数 | Hacker News API；HTTPS | v0.21 P0，仅读取公开字段 |
| RSS 阅读 | [FreshRSS/FreshRSS](https://github.com/FreshRSS/FreshRSS)（16.0k） | AGPL-3.0 | 用户自建 RSS 源列表 | 用户实例或 RSS URL | v0.21 候选，需明确 AGPL/源条款 |
| RSS 聚合 | [miniflux/v2](https://github.com/miniflux/v2)（9.7k） | Apache-2.0 | Miniflux 未读计数与最新条目 | 用户实例 Token | v0.21 候选，凭据仅存私有配置 |
| 服务状态 | [louislam/uptime-kuma](https://github.com/louislam/uptime-kuma)（91.4k） | MIT | 在线/离线、延迟、最近检查 | 用户自建 Uptime Kuma API | v0.21 候选；只读，不提供启停控制 |
| 系统资源 | [nicolargo/glances](https://github.com/nicolargo/glances)（33.6k） | LGPL/项目条款 | CPU、内存、磁盘摘要 | 本机或自建 API；可能需认证 | 仅审计；先验证移动端和凭据隔离 |
| 服务器监控 | [henrygd/beszel](https://github.com/henrygd/beszel)（25.4k） | MIT | 主机在线、CPU、内存趋势 | 自建 Hub/Agent Token | v0.22 候选；只做摘要，不拉历史大图 |
| 个人财务 | [actualbudget/actual](https://github.com/actualbudget/actual)（28.8k） | MIT | 月度预算/余额摘要 | 本机服务或导出 API；用户授权 | v0.22 候选；默认不读取交易明细 |
| 记账概览 | [mayswind/ezbookkeeping](https://github.com/mayswind/ezbookkeeping)（5.6k） | MIT | 本月收支汇总 | 自建服务 Token | 仅候选，先确认公开 API 和隐私最小化 |
| 影视媒体 | [jellyfin/jellyfin](https://github.com/jellyfin/jellyfin)（57.1k） | GPL-2.0 | 最近播放、媒体库计数 | 用户 Jellyfin URL/API Key | 仅候选；不嵌入播放器、不暴露媒体路径 |
| 照片回忆 | [immich-app/immich](https://github.com/immich-app/immich)（114k） | AGPL-3.0 | 今日回忆数量/日期 | 用户 Immich 服务和 Token | 仅候选；不下载原图，需严审 AGPL 与缩略图权限 |
| 直播状态 | [owncast/owncast](https://github.com/owncast/owncast)（11.5k） | MIT | 是否直播、观看人数、标题 | 用户 Owncast 状态端点 | v0.22 候选；只读公开状态 |
| 音乐播放 | [koel/koel](https://github.com/koel/koel)（17.2k） | MIT | 正在播放、播放列表计数 | 用户 Koel API Token | 仅候选；不自动播放或控制队列 |
| 日历/预约 | [calcom/cal.com](https://github.com/calcom/cal.com)（48.5k） | AGPL-3.0 | 未来预约数量、最近预约 | 用户 ICS/API；明确时区 | v0.22 候选；仅读取聚合数据 |
| 开放数据分析 | [OpenBB-finance/OpenBB](https://github.com/OpenBB-finance/OpenBB)（73.0k） | 多许可证 | 市场摘要、指数涨跌 | 多个外部数据源/API Key | 仅研究；不承诺实时行情，不接交易操作 |
| 文件同步状态 | [Syncthing/syncthing](https://github.com/syncthing/syncthing)（88.6k） | MPL-2.0 | 设备在线、同步错误数 | 本机 REST API/API Key | v0.22 候选；只读且仅回环/用户端点 |

优先落地顺序为 Hacker News、用户自建 RSS/Miniflux、Uptime Kuma 状态和 iCal 聚合。所有带 AGPL/GPL 或凭据的候选均先停留在“候选”状态；未完成真实 API、许可和隐私复核前，不出现在“可添加”列表。

## 手机品牌小组件候选池（2026-09-15）

品牌商店的实时“排名”会按地区、机型、系统版本和时间变化，因此本表采用各品牌官方小组件说明中反复出现的高频系统组件类型作为候选，不声称固定名次。视觉上优先借鉴 iOS/HyperOS/HarmonyOS/ColorOS 的卡片、圆角、紧凑信息层级；数据和权限仍按本项目的来源分类重新实现。

| 候选组件 | 品牌/官方依据 | 适合的组件卡片 | 来源分类 | 前置条件与边界 | 处理结论 |
| --- | --- | --- | --- | --- | --- |
| 天气与空气质量 | [Apple iPhone Widgets](https://support.apple.com/en-us/HT207122) | 当前温度、体感、空气质量 | 外部 API | 城市手选；不读取定位 | 已有天气卡片可吸收空气质量字段 |
| 电池与设备 | [Apple iPhone Widgets](https://support.apple.com/en-us/HT207122) | 电量、充电状态、设备列表 | 离线/本机服务 | 浏览器只能读取当前设备有限电量；不伪造跨设备数据 | v0.21 候选，优先本机可用字段 |
| 日历与下一事件 | [Apple iPhone Widgets](https://support.apple.com/en-us/HT207122) | 今日日期、未来事件 | 离线/条件 | 先支持 iCal/思源日记，只读、时区明确 | v0.21 P1 |
| 提醒事项/今日待办 | [Apple iPhone Widgets](https://support.apple.com/en-us/HT207122) | 勾选进度、今日任务 | 离线 | 复用思源任务查询，不接触系统提醒私有数据库 | 已有今日待办可采用该视觉 |
| 时钟与世界时间 | [Apple iPhone Widgets](https://support.apple.com/en-us/HT207122) | 多城市时间、时区 | 完全离线 | `Intl.DateTimeFormat`；城市由用户选择 | v0.21 P0 |
| 照片回忆 | [Apple iPhone Widgets](https://support.apple.com/en-us/HT207122) | 今日照片、相册计数 | 条件/本地服务 | 只显示缩略图或计数，不上传原图 | 仅候选，需本地图库 API |
| 股票/指数 | [Apple iPhone Widgets](https://support.apple.com/en-us/HT207122) | 指数涨跌、市场摘要 | 外部 API | 数据源和许可波动，禁止交易操作 | 仅研究，不承诺实时性 |
| 健身活动环 | [Apple iPhone Widgets](https://support.apple.com/en-us/HT207122) | 今日步数/活动环 | 条件/本机服务 | 思源 WebView 无系统 HealthKit 权限 | 暂不接入，保留设计参考 |
| 日历月视图 | [Huawei Support](https://consumer.huawei.com/en/support/content/en-us15876340/) | 月历网格、节假日、事件点 | 离线/条件 | 复用现有 42 格月历；事件仅读 | 已有日历可吸收品牌布局 |
| 备忘录/便签 | [Huawei Support](https://consumer.huawei.com/en/support/content/en-us15876340/) | 最近笔记、快速记录 | 离线/受控写 | 只读取思源文档；写入必须确认 | v0.21 候选，沿用受控写边界 |
| 快捷联系人 | [Huawei Support](https://consumer.huawei.com/en/support/content/en-us15876340/) | 联系人头像与快捷操作 | 条件/权限 | 不读取通讯录；可改为思源快捷入口 | 暂不接入，避免个人数据权限 |
| 屏幕使用时间 | [Huawei Support](https://consumer.huawei.com/en/support/content/en-us15876340/) | 应用时长排行、目标进度 | 本机服务 | ActivityWatch 回环服务；不读取标题 | 已有 ActivityWatch 可采用该表现 |
| 音乐控制 | [OPPO Support](https://support.oppo.com/en/answer/?aid=neu1175) | 正在播放、封面、进度 | 条件/本机服务 | 需要媒体会话权限；不自动播放 | 仅候选，先做 Koel/Jellyfin只读 |
| 快捷设置/扫码 | [OPPO Support](https://support.oppo.com/en/answer/?aid=neu1175) | Wi-Fi、扫码、系统开关 | 条件/系统权限 | 插件无法安全控制系统开关 | 不接入，仅借鉴入口布局 |
| 设备管家状态 | [Xiaomi HyperOS](https://www.mi.com/global/hyperos) | 存储、清理、网络状态 | 本机服务 | 官方能力按地区/机型差异；只读取公开本机指标 | 仅候选，需真实 HyperOS 能力验证 |
| 主题/个性化卡片 | [Xiaomi HyperOS](https://www.mi.com/global/hyperos) | 壁纸、主题、快捷样式 | 离线 | 只实现 CSS 主题，不下载品牌资源 | 可直接转化为商店视觉预设 |

品牌候选优先级：① 时钟/世界时间、日历/事件、提醒事项视觉；② 天气与空气质量；③ 屏幕使用时间；④ 用户自建媒体/照片服务。涉及系统权限、通讯录、HealthKit、系统开关和交易操作的组件不进入默认商店。

## 商店信息架构

商店已提供来源维度的一级筛选和主题分组：

```text
全部 | 内置 | 离线可用 | 本机服务 | 外部 API | 插件 | 条件 | 已添加
            ├─ 时间与日历
            ├─ 天气与环境
            ├─ 热点与阅读
            ├─ 影视与娱乐
            └─ 数字健康
```

每张生活组件卡片必须明确展示：数据来源、联网状态、是否需要 Key/服务、支持端、隐私摘要、最近更新时间和缓存状态。没有配置完成时只提供“配置来源”，不显示可误解为安装完成的“添加”按钮。

## 统一适配器要求

- 网络组件默认关闭，用户主动添加或配置后才请求。
- 请求必须有超时、取消、响应大小上限、并发上限和缓存 TTL。
- 旧请求不得覆盖新配置；面板不可见、卸载或组件移除时停止刷新。
- 凭据不得进入日志、Agent 快照、URL 查询历史或商店预览。
- 跨域/网络失败显示上次成功缓存和明确来源状态，不伪造空数据。
- 商店骨架预览不发网络；真实预览与安装后的组件共用同一渲染器。
- 外部链接使用 `noopener`；远程文本统一清洗并限制长度；不渲染来源返回的任意 HTML。
- 不引入整套仪表盘或图表框架；优先原生 DOM/CSS，守住经审核的 512 KiB 包体门禁（2026-09-15 由 320 KiB 上调，见 D-353）。

## 建议实施顺序

1. 已完成：外部来源纯模型、可用性/凭据/平台/隐私契约，以及离线时间组件。
2. 已完成：Open-Meteo 天气采用城市手选、15 分钟缓存和三端响应式卡片渲染。
3. 已完成：holiday-cn 节假日/调休标记复用现有月历，不新增第二套月历。
4. 已完成：Bangumi 每日放送按本地星期展示 3:4 官方封面卡，支持今日/明日/本周、图片懒加载和 30 分钟缓存；不宣称个性化推荐。
5. 已完成：DailyHot/NewsNow 用户端点、来源健康、30 分钟缓存与逐源失败隔离；未配置时保持零网络请求。
6. 已完成：ActivityWatch 桌面/侧栏组件、loopback 白名单、固定 Query API、应用级聚合、思源本机代理、5 分钟缓存和隐私说明。
7. 下一步：Hacker News/RSS/iCal 契约审计，以及 TMDB API Key 安全存储、attribution 和趋势发现；个性化推荐另行评估。
