# 组件商店可用性审计（2026-09-13）

## 结论摘要

- 当前商店包含 **27 个内置组件**，另有 **1 个第三方目录组件**（`checkin-summary`）。
- 27 个内置组件都有真实 adapter 注册；`checkin-summary` 没有本插件内 adapter，必须由 `siyuan-checkin` 注册后才会进入“可用组件”。依据：`src/index.ts:3300-3739`、`src/widget-catalog.js:11-22`。
- 当前自动门禁为 **674/674 通过**。这证明协议、归一化、超时、缓存和渲染边界成立，不等同于每个组件都已在真实思源数据上验收。
- 已有思源 3.8.2 桌面实测覆盖：商店添加/尺寸、闪卡待复习（空数据态）、随机回顾、本月日记、标签；其余组件仍缺少逐项真实宿主证据（见 `docs/acceptance-v0.16.37.md`）。
- **已修复的确定缺陷（P0）**：`recent-writing-activity` 与 `today-reservations` 曾使用错误的日期正则，现已修正为匹配 `YYYYMMDD` 并显示为 `YYYY-MM-DD`，回归测试已覆盖；内置 adapter 注册丢失 `viewType/configSchema` 的问题也已修复，日历会按真实网格渲染。

## 评级定义

- **A 可直接用**：不依赖额外宿主数据或配置，读取/动作链路明确。
- **B 条件可用**：有真实内核或本地数据源；没有数据时显示空态是正常情况。
- **C 协议/上下文依赖**：依赖活动文档、严格命名约定、特定内核 API 或第三方插件，应在商店中明确提示前置条件。
- **D 当前不可独立用**：本插件没有完整实现，或在默认未安装依赖时无法添加/执行。D 不表示依赖安装后一定不可用。

## 逐组件清单

| 组件 | 评级 | 真实数据/动作 | 当前证据与问题 | 建议 |
| --- | --- | --- | --- | --- |
| `recent-documents` 近期文档 | B | 本地打开历史；点击 rootId 打开 | adapter 已注册；空历史是合法空态 | 保持；补一条“无历史”验收 |
| `today-journal` 今日日记 | B | `openJournal`，必要时选择笔记本并创建 | 动作协议真实存在；依赖日记本配置/权限 | 商店标注“可创建今日日记” |
| `today-tasks` 今日待办 | B/C | `/api/query/sql` 查询今日日记文档中的任务块，点击受控更新勾选；可选近期开启全库扫描 | 默认按文档标题 `YYYY-MM-DD` 定位今日日记，不再依赖当前页签；无今日日记时显示明确空态 | 真实验收日期标题、任务块和全库模式；后续支持显式到期日期 |
| `fixed-document` 指定文档 | B | 配置合法 block ID 后打开 | `BLOCK_ID_RE` 校验；未配置时为空态，不是故障 | 配置表单增加文档选择器，减少手填 ID |
| `favorites` 收藏 | B | 本地收藏；rootId 优先、旧 key 迁移后打开 | `jumpToFavorite` 已兼容移动/桌面和旧数据；无收藏为空态 | 补旧收藏迁移的真实回归 |
| `document-sets` 文档集 | B | 本地文档集预检、确认、逐项恢复 | 复用恢复链，缺失/取消不伪造成功 | 商店描述增加“需先创建文档集” |
| `tags` 标签 | B | `/api/tag/getTag`，点击打开标签 dock | 已兼容 3.8.x 裸数组和旧包装；桌面实测“剪藏 (25)” | 以后改用稳定 tag ID，处理重名/特殊字符 |
| `bookmarks` 书签 | B/C | `/api/bookmark/getBookmark`，点击打开书签 dock | 已兼容裸数组/包装；当前用名称作为协议值，重名或特殊字符定位不稳定 | 改用内核稳定 ID 或显式搜索参数 |
| `journal-monthly` 本月日记 | C | SQL 按 `YYYY-MM` 标题，首项打开/创建今日日记 | 桌面实测显示 2026-09-11；严格依赖标准日记标题 | 商店显示“标题需 YYYY-MM-DD” |
| `note-stats` 笔记统计 | B | SQL 聚合文档数、`length` 字数、本周新增/修改 | 查询真实存在；`length` 依赖思源 blocks 字段语义，尚无旧宿主证据 | 对空库/字段缺失增加明确降级说明 |
| `year-progress` 年度进度 | A | 纯前端日期计算 | 无内核依赖，最稳定 | 保持 |
| `recent-edits` 近期编辑 | B | SQL 文档 `updated DESC`，点击打开 | 使用 `type='d'`，数据源明确；尚未覆盖大库性能 | 增加分页/大库耗时观测 |
| `flashcard-due` 闪卡待复习 | C | `/api/riff/getNotebookRiffDueCards`；按笔记本或最多 6 本聚合 | 3.8.2 桌面已验证组件添加、空到期态、失败重试；依赖 riff API 和笔记本列表 | 商店标注“思源闪卡 API；全部模式最多 6 本” |
| `random-review` 随机回顾 | B | SQL `ORDER BY random()` 抽 3 篇旧文档 | 桌面实测真实抽出 2024 文档；空库/文档少时为空是正常 | 增加“可回顾文档不足”空态文案 |
| `quick-capture` 快速记录 | B/C | 弹窗输入，追加到今日日记 | `appendBlock` 受控写、确认和失败反馈完整；依赖可用日记本 | 商店标注“首次使用需选择日记本” |
| `clipped-unread` 剪藏待读 | C | SQL 读取 `blocks.tag` 包含配置标签 | 不是通用剪藏 API，只能识别标签约定；可能把普通标签误认为剪藏 | 改名“标签待读”或增加来源协议/插件探测 |
| `on-this-day` 往年今日 | C | SQL 匹配文档标题 `%-MM-DD` 且排除今年 | 依赖严格日期标题；没有标准日记时长期为空 | 商店显示标题格式前置条件 |
| `today-writing` 今日写作 | B | SQL 聚合今日 blocks 的 `length/created/updated` | 真实只读查询；依赖 created 格式和 length 字段 | 对字段缺失提供“暂不可统计”而非 0 |
| `recent-writing-activity` 近期写作活跃度 | B | SQL 按 `created` 的 `YYYYMMDD` 聚合；日期标签已正确格式化 | adapter 有效；自动测试覆盖格式化正则 | 保持；真实宿主验证数据时区边界 |
| `recent-daily-notes` 近期日记 | C | SQL 探测标题以 `YYYY-MM-DD` 开头的已有日记 | 只读、不创建；严格命名协议，空态常见 | 商店增加格式提示；补跨年边界测试 |
| `document-relations-summary` 文档关系摘要 | C | 活动文档直接子块 + markdown 引用 SQL | 无活动文档必为空；引用匹配为有限 LIKE，不是完整关系图，可能漏报 | 标注“轻量摘要/非完整关系图”；后续改引用解析 |
| `current-document-outline` 当前文档大纲 | C | 活动文档 `/api/outline/getDocOutline` | 端点与 Agent 共用；依赖活动文档和宿主返回结构 | 增加无活动文档和旧返回包装验收 |
| `today-reservations` 近期预约 | C | `attributes.name='custom-reservation'`、`value=YYYYMMDD` SQL；日期标签已正确格式化 | 仅兼容 dailynote-today 等插件约定，不是思源通用预约 | 商店描述已明确协议依赖；真实宿主验证第三方数据 |
| `journal-calendar` 日历月视图 | C | SQL 按 `YYYY-MM-DD` 标题生成 7 列月历，已有日期显示标记并可点击 | 过去因 adapter 元数据丢失而退化为普通列表；现已恢复 `viewType: calendar`，支持可选 notebook 过滤和前后 24 个月切换 | 标注命名规则；真实宿主验证跨月、筛选和空态 |
| `writing-streak` 写作打卡 | B/C | SQL 按 `created` 的 `YYYYMMDD` 聚合近 7 天 | 只读统计，依赖 created 格式；无写入“打卡”动作 | 名称改为“写作连续天数”或明确统计口径 |
| `countdown` 倒数日 | B | 纯前端 `YYYY-MM-DD` 计算 | 配置合法日期即可用；未配置时显示提示 | 配置控件改为日期 input，避免手填格式错误 |
| `plugin-commands` 插件命令 | C | 枚举其他插件 `commands`，执行 `plugin::command` | 仅外部插件声明 `langKey` 且有 callback/globalCallback 才出现；命令卸载/旧格式会失效；无命令时显示安装/启用引导 | 保持空态引导；后续补真实宿主验证命令执行失败反馈 |
| `checkin-summary` 打卡摘要 | D（可条件恢复） | 由 `siyuan-checkin` 外部插件注册 adapter | 本插件仅目录登记；未添加且无 provider 时显示“需安装”，已添加后 provider 卸载则显示“当前不可用”并保留配置；重新注册会即时恢复 | 保留三态生命周期；安装后做一次真实注册/读取/卸载验收 |

## 修复与验收优先级

### P0（下一次小修复）

1. 两处日期正则已修正并加入单测，确保 `YYYYMMDD → YYYY-MM-DD`。
2. 已将日记标题、预约属性、剪藏标签、活动文档、闪卡和插件命令等前置条件写入商店卡片描述，避免用户把“无数据”误认为“坏了”。

### P1（真实宿主验收）

1. 在合法已认证的思源桌面会话中，按组件逐项记录：首读、刷新、空态、条目点击、配置变更、错误重试。
2. 优先覆盖 `today-tasks`、`tags`、`bookmarks`、`flashcard-due`、`plugin-commands`、`current-document-outline`、`document-relations-summary`、`today-reservations`。
3. 单独准备有标准日期标题、任务块、预约属性、到期闪卡和外部插件命令的验收数据集。

### P2（体验与性能）

- 标签/书签条目改用稳定 ID，降低重名和特殊字符点击风险。
- 大库 SQL 增加耗时诊断和更严格的分页；今日待办默认走今日日记范围，月历按真实 7 列网格渲染，后续补真实宿主验收。
- “依赖活动文档/第三方插件/命名协议”已在商店卡片显示条件可用或外部插件徽标；后续补首次使用提示。

## 限制

当前没有可安全复用的已认证思源会话（见 `BLOCKERS.md` B-005），因此本报告不把未实机覆盖项伪装成“已验收”。Android 真机按 D-042 永久后置，不影响本次桌面组件静态审计。
