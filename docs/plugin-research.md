# 第三方插件调研与内置组件决策（2026-09-12）

本次静态阅读了用户提供的 10 个思源插件。调研仅记录公开功能、API 模式和数据边界，不复制第三方代码，也不读取第三方私有 storage。

| 插件 | 主要能力 | 可借鉴点 | 本项目决策 |
| --- | --- | --- | --- |
| [sy-query-view](https://github.com/frostime/sy-query-view) | 嵌入块 JS/SQL 查询与 DataView 渲染 | 查询/视图分层、结果裁剪、Agent 文档 | 不开放任意 JS/SQL；仅实现受限只读查询组件 |
| [siyuan-plugin-weather](https://github.com/haoge321/siyuan-plugin-weather) | 高德天气、状态栏、slash 插入 | 外部服务失败状态与刷新周期 | 天气需 API key/网络，暂不作为默认内置组件 |
| [siyuan-plugin-graph-enhance](https://github.com/shenjinglei/siyuan-plugin-graph-enhance) | Dagre/ECharts 关系图与 Dock | 节点上限、跟随当前文档、点击跳转 | 不引入重量级图引擎；保留轻量关系摘要方向 |
| [sy-tomato-plugin](https://github.com/IAliceBobI/sy-tomato-plugin) | 番茄钟、快速记录、AI、复习等 | 受控确认 UI、计时状态机、快速捕获 | 继续增强快速记录；完整计时器另立任务 |
| [siyuan-dailynote-today](https://github.com/frostime/siyuan-dailynote-today) | 日记创建/浏览、预约块、跨笔记本 | 日期×笔记本浏览、只浏览不创建模式 | 已加入 `recent-daily-notes`；不自动创建缺失日记 |
| [Calendar-heatmap](https://github.com/svtardust/Calendar-heatmap) | 近 12 个月每日创建块热力图 | 明确“创建块”统计口径、时间窗口 | 已加入 `recent-writing-activity`，仅数值/条形列表 |
| [siyuan-homepage](https://github.com/Glaube-TY/siyuan-homepage) | 30+ 首页组件与自由布局 | 组件分类、三端能力矩阵、失败状态 | 保持轻量 home adapter，不照搬大型首页 |
| [highlight-search](https://github.com/TCOTC/highlight-search) | 当前文档全文高亮、替换 | 当前文档范围、修改白名单 | 可参考搜索语义；替换必须受控确认，暂不内置 |
| [siyuan-lumina](https://github.com/LunaNorth/siyuan-lumina) | Flomo 随手记、日历、标签云、热力图 | 快速捕获、日期/标签筛选、移动端弹层 | 不读取 Lumina 私有数据；复用本项目快速记录 |
| [siyuan-plugin-asset-management](https://github.com/DilyarEziz/siyuan-plugin-asset-management) | 资产生命周期、到期提醒、报表、Agent | capability 注册、生命周期卸载、队列/失败恢复 | 不内置完整资产域；未来可做独立到期提醒数据源 |

## 已实现的内置组件

- `recent-writing-activity`：配置 7–30 天及可选笔记本；SQL 按 `blocks.created` 的日期聚合，最多返回配置天数，明确统计的是内容块数量。
- `recent-daily-notes`：配置回看天数、条数及可选笔记本；仅查询日期格式标题且已存在的文档，不调用创建日记 API。

两者均注册到统一 home adapter，支持桌面/侧栏/移动端，沿用缓存、超时、取消、stale 快照和只读协议。

## 安全与许可边界

第三方插件的许可证和实现细节仅用于设计参考；Graph Enhance 为 AGPL-3.0，其余仓库以各自 LICENSE 为准。除非明确兼容并完成许可证审查，本项目不复制代码。外部 API、第三方私有 storage、任意 JS 执行均不作为默认数据源或能力。
