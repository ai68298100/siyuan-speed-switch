# 外部生活组件数据源审计

> 审计日期：2026-09-14。目标是为组件商店增加独立的“生活信息”能力，不把外部网络组件伪装成思源本地组件，也不把公共演示服务当成稳定基础设施。

## 结论

首批采用分层接入：本地时间、Open-Meteo 天气已经内置，holiday-cn 已作为日历可选覆盖层接入；Bangumi 仍处于候选阶段；热榜和新闻要求可配置/自部署端点；TMDB 要求用户 API Key；使用时长仅连接用户本机 ActivityWatch。活动窗口读取暂不接入生产。

| 候选组件 | 来源 | 许可/条款 | 凭据 | 建议状态 | 关键边界 |
| --- | --- | --- | --- | --- | --- |
| 时间与日期 | 浏览器 `Intl.DateTimeFormat` | 平台能力 | 无 | 已内置 | 完全离线，每分钟刷新，页面隐藏时暂停 |
| 近期天气 | [Open-Meteo](https://github.com/open-meteo/open-meteo) | API 数据 CC BY 4.0；免费公共 API 受非商业条款约束 | 无 | 已接入 | 只发送用户手填城市与解析坐标；天气缓存 15 分钟、地点缓存 24 小时；不读取设备定位并显示署名 |
| 热搜事件 | [DailyHotApi](https://github.com/imsyy/DailyHotApi) | MIT | 用户端点 | 候选 | 公共演示服务不保证可用；优先自建端点；来源故障必须逐源隔离 |
| 实时新闻 | [NewsNow](https://github.com/newsnext/newsnow) | MIT | 用户端点 | 候选 | 自部署可获得缓存与来源管理；禁止后台高频抓取 |
| 中国节假日 | [holiday-cn](https://github.com/NateScarlet/holiday-cn) | MIT | 无 | 已接入 | 默认关闭；每年静态 JSON 内存缓存 24 小时；年份交界同时检查下一年度公告 |
| 电影推荐 | [TMDB API](https://developer.themoviedb.org/docs) | TMDB API 条款 | API Key | 条件组件 | Key 只存插件私有配置；必须展示 attribution；首期只做趋势/发现，不声称个性化推荐 |
| 番剧推荐 | [Bangumi API](https://github.com/bangumi/api) | API 使用约定 | 无 | 下一批 | 使用明确 User-Agent；限制频率；不抓取网页 DOM |
| 使用时长 | [ActivityWatch](https://github.com/ActivityWatch/activitywatch) | MPL-2.0 | 本地服务 | 桌面候选 | 只连接 loopback；默认只显示应用级汇总，不暴露窗口标题；移动端不支持 |
| 当前应用状态 | [get-windows](https://github.com/sindresorhus/get-windows) | MIT | 本地原生能力 | 仅参考 | 需要原生 Node/系统权限，思源插件沙箱与移动端无法可靠承诺 |

## 实际连通性抽查

2026-09-14 从开发机进行只读请求：Open-Meteo、holiday-cn CDN 与 Bangumi API 返回 HTTP 200；DailyHotApi 公共演示端点出现 TLS 连接失败。这只是一次开发环境抽查，不构成长期 SLA，但足以说明热榜必须允许用户自建端点，且 UI 要显示来源健康状态与缓存时间。

## 商店信息架构

生活组件不混入“思源数据”分组。商店后续采用一级来源分组和二级主题分组：

```text
思源数据 | 生活信息 | 插件扩展 | 已添加
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
- 不引入整套仪表盘或图表框架；优先原生 DOM/CSS，守住 300 KiB 包体门禁。

## 建议实施顺序

1. 已完成：外部来源纯模型、可用性/凭据/平台/隐私契约，以及离线时间组件。
2. 已完成：Open-Meteo 天气采用城市手选、15 分钟缓存和三端响应式卡片渲染。
3. 已完成：holiday-cn 节假日/调休标记复用现有月历，不新增第二套月历。
4. Bangumi：每日一部/本周热门的轻量海报卡，图片懒加载。
5. DailyHot/NewsNow：用户端点、来源健康、缓存时间与逐源失败隔离。
6. ActivityWatch：桌面实验开关、loopback 白名单、应用级聚合和隐私说明。
7. TMDB：API Key 安全存储、attribution 和趋势发现；个性化推荐另行评估。
