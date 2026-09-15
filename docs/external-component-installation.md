# 非思源本体组件安装与服务说明

以下组件不是仅靠思源本体数据即可完整运行。组件商店应将它们标记为“需要前置依赖”或“可选数据源”，并提供本页入口。

| 组件 | 依赖类型 | 必须安装/配置 | 安装或项目地址 | 使用前说明 |
| --- | --- | --- | --- | --- |
| 近期天气 | 外部公共 API | 是：填写城市并允许联网；无需安装软件或 API Key | [Open-Meteo](https://open-meteo.com/) · [源码](https://github.com/open-meteo/open-meteo) | 仅发送城市和解析坐标；使用公网 HTTPS |
| 每日放送 | 外部公共 API | 是：允许联网；无需 API Key | [Bangumi API](https://github.com/bangumi/api) | 读取公开节目表和官方封面，不是个性化推荐 |
| 热搜事件 | 自建 API 服务 | 是：部署 DailyHotApi 并填写完整 HTTPS 接口 | [安装与源码](https://github.com/imsyy/DailyHotApi) | 本插件不内置公共演示端点；只读取公开榜单 |
| 实时资讯 | 自建 API 服务 | 是：部署 NewsNow 并填写 `/api/s?id=...` 地址 | [安装与源码](https://github.com/ourongxing/newsnow) | 本插件不内置公共演示端点；只读取标题、来源和时间 |
| 使用时长 | 本机软件与服务 | 是：安装并启动 ActivityWatch | [官方下载](https://activitywatch.net/downloads/) · [源码](https://github.com/ActivityWatch/activitywatch) | 默认地址 `127.0.0.1:5600`；只支持桌面/侧栏；不读取窗口标题 |
| 日历月视图：中国节假日 | 可选远程数据 | 否：只有开启“显示中国节假日”才联网 | [holiday-cn](https://github.com/NateScarlet/holiday-cn) | 日历本身可离线使用；覆盖层按年度读取静态 JSON |
| 打卡摘要 | 其他思源插件 | 是：安装并启用提供 `checkin-summary` 的 `siyuan-checkin` 插件 | 优先在思源集市搜索“小驴打卡”；协议说明见 [组件协议](./widget-protocol.md) | 当前仓库没有可核实的独立发布地址，因此不伪造 GitHub 仓库链接 |
| 插件命令 | 其他思源插件 | 否：至少一个已启用插件公开兼容命令时才有内容 | [思源社区集市](https://github.com/siyuan-note/bazaar) | 命令行为、联网和权限由对应插件决定 |

## 特别提醒

- “外部公共 API”不等于长期稳定服务；网络错误会限制在单个组件内，并优先显示缓存或重试入口。
- “自建 API 服务”不会自动部署。必须由用户自行安装服务并填写端点；不要将陌生公共演示地址填入配置。
- “本机服务”仅允许回环地址，不应改成公网 ActivityWatch 地址。
- “其他思源插件”卸载或停用后，组件配置会保留但会显示不可用；重新启用提供方后可恢复。
- 所有远程组件均不发送笔记正文。各组件具体的响应上限、超时和缓存策略见 [外部来源审计](./external-widget-source-audit.md)。
