# 第三方（非思源插件）组件扩充路线图

> 起草：2026-09-16。承接 `docs/external-widget-source-audit.md` 的既有候选池，把调研渠道从"GitHub 高 Star 仪表盘 + 手机品牌"扩展为多渠道，并给出分批落地路线。本文档为开发文档，不进发布归档。

## 0. 范围与登记语义

本文讨论的候选全部是**非思源插件**的第三方信息来源：公开数据 API、用户自建服务、离线本机能力，以及 Obsidian/Notion 等其他生态的组件形态。与 `widget-catalog.js`（思源插件 provider 登记表，三态 ready/unavailable/missing）无关；外部来源的登记面是 `external-widget-model.js` 的 `EXTERNAL_WIDGET_CATALOG`（availability/auth/integration/privacy 契约）+ `home-store-model.js` 的 SOURCE_INFO/DEPENDENCY_INFO + `home-model.js` DEFAULT_MODULES。三处必须成对登记，由组件可用性审计测试守护。

## 1. 多渠道调研结论

| 渠道 | 抽查方式 | 本轮收获 | 对本项目的价值 |
| --- | --- | --- | --- |
| 公开无 Key API（HN Algolia 等） | 实测文档与连通性 | `hn.algolia.com/api/v1/search?tags=front_page` 免 Key、CORS 开放、约 1 万次/小时、单请求拿首页 | **P0 可直接生产**：固定端点白名单 + 内核代理即可，模式同 Bangumi |
| 汇率（Frankfurter） | 文档核实 | 无 Key、CORS、ECB 日频参考价、`api.frankfurter.dev`，可自建 | P1 候选；仅展示参考汇率，不承诺实时、不接交易 |
| 自托管服务（Uptime Kuma） | 官方 wiki 核实 | 状态页 `/api/status-page/{slug}` 与 `/heartbeat/{slug}` 免认证只读 JSON | P1 候选；契合"用户端点 + 已知路由"白名单先例（DailyHot/NewsNow） |
| 自托管服务（Miniflux） | 官方 api.md 核实 | `X-Auth-Token` 头 + `GET /v1/entries?status=unread`，Apache-2.0 | P2 候选；凭据走内核代理头，不进 URL/日志 |
| Obsidian 仪表盘生态（Homepage/Dataview 模块化主页） | 社区与仓库抽查 | 高频模块：时段问候、习惯热力图、笔记统计、年度进度、随机名言、最近修改 | 仅作**类型灵感**；多数可用思源本地数据复刻（统计/最近编辑已有），名言/问候为低成本候选 |
| Notion 小组件生态（Indify/Apption/WidgetBox/Nodi） | 多方列表交叉 | 高频类型：世界时钟、倒计时、引言、计数器、生命进度条、番茄钟 | **嵌入方式不可用**（iframe 违反本项目"禁止任意 HTML/iframe"门禁）；类型中世界时钟、倒计时已有，引言待评估 |
| 公开名言语录 API | 初步扫描 | 免 Key 源（如 ZenQuotes）存在但 SLA/条款参差 | P2 观察；先确认条款与 CORS 再登记，不承诺 |
| GitHub 高 Star 仪表盘（Glance/Homepage/Dashy/Homarr） | 前轮已审计（见 source-audit） | HN/RSS/iCal/服务状态优先级已定 | 本路线图继承其优先级并落成批次 |
| 手机品牌小组件池 | 前轮已审计 | 世界时钟/电池/日历为 P0 | 世界时钟本批落地；电池待 Chromium API 实测 |

## 2. 准入门槛（继承 source-audit 统一适配器要求）

1. 固定端点进 `allowedLifeWidgetUrl` 精确白名单（协议+主机+路径+参数全匹配）；用户端点走"已知路由"模式（如 Uptime Kuma 的 `/api/status-page/{slug}`），不接受任意透传。
2. 超时 ≤10s、响应 ≤128 KiB、禁止重定向、有界缓存 TTL、面板隐藏暂停、失败显示陈旧缓存。
3. 凭据（若有）仅存插件私有配置，经内核代理头传递，不进日志/Agent/URL 历史。
4. 许可/条款须可展示；远程文本只做纯文本清洗，不渲染 HTML。
5. 新组件须：DEFAULT_MODULES + EXTERNAL_WIDGET_CATALOG + SOURCE_INFO(+DEPENDENCY_INFO) 三处成对登记；功能分组恰好入组；商店预览不发网络。

## 3. 分批路线

### 第一批（本批交付，2026-09-16）
- **世界时钟（external-world-clock）**：完全离线，`Intl.DateTimeFormat` 按用户配置的 IANA 时区列表渲染多城市时间；空配置回退本地+UTC；三端。渠道：Notion/手机品牌池 P0 类型。
- **Hacker News 热门（external-news-hackernews）**：无 Key 公开 API，固定端点白名单 + 思源内核代理，30 分钟缓存，排序列表卡；三端。渠道：GitHub 高 Star 池 P0。
- 同时把 P1/P2 候选写入本路线图（不登记生产目录，防止"可添加但不可用"误导）。

### 第二批（P1，已交付，2026-09-16）
- **Uptime Kuma 服务状态（external-status-uptimekuma）**：用户端点 + `slug` 配置；只读状态页 JSON（monitorList + heartbeat + uptimeList）；来源健康与陈旧缓存。实现要点：slug 字符集约束 `/^[a-z0-9][a-z0-9-]{1,63}$/`、状态页与心跳双 envelope 健康取较差者、5 分钟缓存。
- **汇率参考（external-fx-frankfurter）**：基准货币 + 目标货币配置，ECB 日频；卡片标注"参考汇率，非实时"。实现要点：实测弃用 v1 域名（301）改用 `api.frankfurter.dev/v2/rates`（返回数组）；货币代码在配置层即过滤 ECB 白名单，避免生成注定被网络门禁拦截的请求；12 小时缓存。
- 两项均只需现有网络层，无需新基础设施；目录新增 `finance` 分类（7 个语义分组）。

### 第三批（P2，部分交付，2026-09-16）
- **每日引言（external-quote-daily，已交付）**：采用零风险替代方案——完全离线的内置语录集（48 条公有领域中国古籍原文，逐条标注篇目），按本地日期确定性哈希稳定轮换；自定义语录（多行 textarea，`——`/`|` 分隔出处）整体替换内置集；无网络请求、无白名单需求。在线引言渠道（ZenQuotes/Quotable 等）的条款与 CORS 复核未完成前不接入在线版。
- **电池/设备状态（external-device-battery，已交付）**：浏览器 Battery Status API，完全本地；能力探测在宿主层，宿主不支持时显示诚实降级文案；移动端 WebView 普遍不支持，故仅声明桌面/侧栏；level 0 视为已知的 Chromium 实现缺陷而非真实电量，降级处理。
- **Miniflux 未读（external-rss-miniflux，已交付）**：用户实例 + API Token；`/v1/entries?status=unread&limit=N`（N=1-50）。凭据设计：Token 只经 `X-Auth-Token` 请求头传递（不进 URL/缓存 key/错误消息/快照），配置层清洗（拒绝 CR/LF/控制字符/超 128 字符，防 header 注入）；URL 走"已知路由"白名单（恰两个受控参数）；缓存 key 基于 URL 天然不含凭据；Token 仅出现在发往本机内核（127.0.0.1:6806）的代理请求体中，内核侧日志行为不可控已在组件描述中声明。
- **iCal 只读日程（external-schedule-ical，不接入）**：解析器体积与 CORS（任意主机）两个未决点仍未解决；若走内核代理需先评估任意域名放行策略，**不达门槛不接入**。

### 仅研究（不承诺）
TMDB 趋势（Key 撤销 + attribution 方案已定，执行顺位低）、Jellyfin/Immich/Koel（GPL/AGPL 与凭据）、股票/加密/体育（不稳定接口）、Owncast/Syncthing/Beszel（v0.22 后按需求拉取）。

## 4. 与既有门禁的衔接

- `component-availability-audit`：内置组件计数断言随每批递增（本批 33→35）；分组恰好覆盖一次。
- `life-widget-network` 契约：新固定端点的白名单接受/拒绝用例成对新增（含参数注入拒绝）。
- `home-store-model` 契约：PREVIEW_KINDS/SOURCE_INFO/DEPENDENCY_INFO 随模块成对登记。
- 包体：512 KiB 硬上限 + 768 KiB 自律线不变；每批以真实增量校准，不做预防性扩容。
