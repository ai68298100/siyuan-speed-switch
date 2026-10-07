# 组件就绪、来源与故障边界审计（2026-10-06）

这是对当前工作树的只读审计，不代表 v0.44.1 已发布包已经包含本地未发布改动，也不把浏览器夹具当作真实思源桌面、最窄侧栏或 Android 证据。审计目的，是把组件商店中的“能否添加”“需要什么前置”“数据从哪里来”“失败时用户看见什么”分开记录。

## 盘点口径

组件定义来自 `src/home-model.js` 的 `DEFAULT_MODULES`（定义起点见 `src/home-model.js:3-14`，条件组件集合见 `src/home-model.js:7-11`），并通过 `normalizeModuleDefinition` 归一化后统计。2026-10-06 本地只读统计结果如下：

| 维度 | 当前事实 | 证据/边界 |
| --- | --- | --- |
| 内置工作台定义 | 58 个 | `DEFAULT_MODULES`；不是“58 个都离线可用” |
| 归一化就绪级别 | 23 `ready`、13 `conditional`、22 `external` | `AVAILABILITY_LEVELS` 与条件集合；`external` 只表示有外部/桥接前置，不保证服务在线 |
| 表面支持 | 桌面 58、侧栏 58、手机 56 | 手机不支持 `external-device-battery` 与 `external-activitywatch-time`；`supportedDevices` 是可见边界 |
| 来源/隐私登记 | 23 个 moduleId 有 `SOURCE_INFO`/依赖信息 | `src/home-store-model.js:33-57`、`:58` 起；`inbox-shorthands` 当前为 external 但没有对应来源摘要或依赖登记，列为已知缺口 |
| 外部候选目录 | 20 个：builtin 4、external 14、conditional 1、reference 1；9 个需要凭据/端点/本机服务等配置 | `src/external-widget-model.js:8-22`、`EXTERNAL_WIDGET_CATALOG`；目录本身不发网络请求 |
| 第三方插件目录 | 2 个：小驴打卡 `checkin-summary`、Calendar `calendar-recent-periodic` | `src/widget-catalog.js:12-35`；目录状态为 `missing`、`unavailable`、`ready`，取决于真实注册/已配置 moduleId |

“就绪”在本审计中是模型状态，不是网络探针结果。比如天气目录项的状态可以是 `external` 且可添加，但首次读取仍可能为空、超时或进入退避；ActivityWatch 只声明桌面/侧栏，不能在手机端宣传可用。第三方目录中的“已登记”也不等于提供方已经安装或已在当前宿主注册。

## 来源、隐私和配置前置

商店来源模型把集成分为 `direct`、`http`、`local-bridge` 等，把隐私摘要分为 `local-only`、`location-only`、`endpoint-only` 等。`src/home-store-model.js:33-57` 是现有生产来源真源；`src/store-labels.ts:3-14` 将这些值映射成用户可见的网络与隐私徽标。外部候选目录进一步声明 `auth`（`none`、`api-key`、`user-endpoint`、`local-service`）、平台、来源 URL、许可证和隐私级别，定义见 `src/external-widget-model.js:8-22`，字段归一化见 `src/external-widget-model.js:350-420`。

当前可按以下类别理解，而不应把所有外部组件都称作“开箱即用”：

| 类别 | 典型组件 | 添加/使用前置 | 用户可见边界 |
| --- | --- | --- | --- |
| 本地直接读取 | 时间与日期、世界时钟、每日引言、设备电量 | 无网络；设备电量仅桌面/侧栏 | 可直接使用；设备电量不得在手机端显示为可用 |
| 思源条件数据 | 今日待办、书签、本月日记、当前文档大纲、日历月视图等 13 项 | 依赖日记/文档/宿主数据，或可选数据源 | 可以添加，但空数据应解释为“暂无/未配置”，不能写成网络故障 |
| 公网 API | 天气、空气质量、Bangumi、Hacker News、Frankfurter | 网络、端点白名单或城市/货币等配置；Bangumi 当前已做真实链路复核，但长期可用性仍受网络环境影响 | 显示“需联网”、来源和隐私范围；失败保留可见错误与重试，不宣称服务 SLA |
| 自建/用户端点 | DailyHotApi、NewsNow、Uptime Kuma、RSS/iCal | 用户先填写可信 HTTPS/本机订阅地址；Miniflux 还需 Token | 端点/凭据应在设置中明确；请求失败归端点或网络问题，不归咎思源笔记内容 |
| 本机服务 | ActivityWatch | 启动 `127.0.0.1:5600`，仅桌面/侧栏；不读取窗口标题 | 服务未启动时显示本机服务不可用及下一步；不能把回环地址改写成公网服务 |
| 生态插件 | 小驴打卡、剪藏、其他插件命令 | 提供方安装、启用并按公开协议注册；注册顺序可能需要有界重试 | 提供方缺失时保留“需安装/当前不可用”目录项；不得伪造已注册成功 |
| 仅参考 | `external-active-window` | 不进入可添加生产列表 | 只显示说明或学习入口，不能显示“添加” |

组件商店预览在 `src/home-store-ui.ts:83-141` 写入来源、网络、隐私、表面和尺寸元数据，并将正文标为 `role=status`、`aria-live=polite`；配置/读取通过 `homeRuntime.read`（`:143-163`）。现有开发指南也明确状态应区分“可直接使用、需要配置、需要本机服务、暂不可用、仅供参考”（`docs/component-store-guide.md:51`），以及未配置外部组件不发网络请求、失败可重试和缓存边界（`:81-87`）。

## 读取与故障状态

内置适配器的统一读取门由 `src/home-adapters.js` 提供：默认单项超时 800 ms、快照缓存 3 s、单次快照最多 24 条；异常归一为 `timeout`、`aborted`、`failed`，另有 `backoff`、`cache`、`empty`、`stale` 诊断。缓存命中、失败退避和卸载清理都在同一适配器层处理（`src/home-adapters.js:20-31`、`:225-320`）。`src/home-external-adapters.ts` 对配置缺失、城市不存在、空 feed、HTTP 错误和取消分别返回有界 `emptyHint` 或抛出取消信号；例如天气配置/城市/失败分支在 `:67-93`，Bangumi 与资讯端点在 `:140-197`。

外部候选模型还维护健康态 `unknown`、`healthy`、`cached`、`stale`、`offline`、`error`，错误分类包括 `network`、`timeout`、`configuration`、`service`、`response`、`unknown`（`src/external-widget-model.js:8-22`）。商店状态的当前决策在 `:446-495`：

- `conditional` 未配置 → `needs-config`、动作 `configure`、不可添加；配置后才变为 `ready`。
- `bridge` 未检测到服务 → `needs-local-service`、动作 `start-service`。
- `reference` → `reference`、动作 `learn-more`，不可添加。
- `error`/`stale` → 可重试；`offline` 显示 `unavailable` 并保留重试语义。
- `external` 默认显示“需联网”；这表示来源类别，不等于当前请求健康。

组件卡和预览可以显示缓存/过期/失败提示，但目前模型与 UI 仍允许“external + offline”保留可添加状态；这属于现状边界，后续若产品希望禁止离线新增，应单独设计并补宿主证据，不能在文档中提前宣称已阻止。

## 第三方生命周期与真实证据边界

`src/widget-catalog.js:12-35` 登记了两个可发现的第三方组件。`resolveWidgetCatalogState` 按“当前活跃 moduleId / 已配置 moduleId / 目录登记”计算 `ready`、`unavailable`、`missing`；目录外但已配置的孤儿实例会进入 `unavailable` 并提供清理依据。`docs/widget-protocol.md:22-54` 规定注册、来源、尺寸和卸载语义，`:55-93` 说明配置、失败重试、缓存和移动端边界。

本次审计只证明模型、适配器和用户文案边界。它不证明：

1. 每个公网端点长期可访问或其服务条款/许可证永久不变；
2. 用户填写的自建端点、Token、API Key 在其环境中真实可用；
3. 每个第三方插件在所有思源版本、桌面/侧栏/手机端都按协议注册；
4. 浏览器或受控响应等价于真实 Android 触控、真实窄侧栏或提供方卸载/重载；
5. `inbox-shorthands` 已完成与其他 external 组件同等级的来源/隐私明示。

## 已知缺口与后续任务

| 缺口 | 影响 | 建议验收 |
| --- | --- | --- |
| `inbox-shorthands` 为 external 定义但缺 `SOURCE_INFO`/`DEPENDENCY_INFO` | 商店可能回退为 direct/none，用户无法看到准确来源和网络边界 | 补齐真实来源和数据边界，或把它归回正确 availability；增加正反向覆盖测试 |
| 内置 58 定义、external 20 候选和第三方 2 项目录各自维护 | 同一 moduleId 可能在定义、商店、来源、目录中漂移 | 建立生成/审计索引，要求 moduleId 双向一致；外部新增必须同时写来源、隐私、平台和失败路径 |
| “external + offline”仍可添加 | 用户可能在离线时创建必然失败实例 | 先通过真实产品决策确定“可添加”与“可运行”是否分离，再针对该状态做 UI/迁移验收 |
| 来源徽标已有模型，但 Release README 只给聚合说明 | 普通用户仍需打开商店才知道每个组件的数据边界 | 在用户文档加入可复制的来源/联网/凭据表，保持中英文和包内资源一致 |
| ActivityWatch、第三方插件、API Key/Token 缺真实宿主矩阵 | 本地模型通过不等于环境就绪 | 按 `BLOCKERS.md` 的设备/真实宿主前置批量取证，单项记录 endpoint、平台、失败、卸载恢复 |

契约测试 `tests/host/component-readiness-contract.test.cjs` 只读取并调用现有模型，冻结上述数量、枚举、已知缺口、状态动作和目录生命周期；它没有修改生产代码，也没有把网络成功伪装成就绪证据。
