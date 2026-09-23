# 调研-吸收循环 · 第 5 轮报告（2026-09-23）

> 用户指令触发：重新梳理 UI/功能/定位多维度方向，全网搜索可吸收的优秀功能与想法，并结合当轮 Codex 会话反馈（大胆推进、门禁从简、需真机的后置）。三路并行：①Obsidian 生态 + Notion/Craft ②启动器/浏览器/编辑器/手机广域 ③思源生态 + 新兴笔记软件。
> 与 R4 的分工：R4 是战略层（15 个方向 → ADR 0076 五阶段路线）；R5 是**机制层**——给既定方向注入具体可实现的交互与数据源，并补 R1 标记的盲区（Notion/Craft、Android 启动器、Obsidian 2025-2026 新星）。关键宿主 API 声明已对上游源码逐项核实。

## 0. 本轮执行原则（承接 Codex 会话用户反馈）

1. 北极星不变：**本地优先工作上下文切换器**。围绕"回到、找到、恢复、继续"大胆推进；数量类自设门禁已降级为观测指标，不因内部预算停滞合理功能。
2. 需要用户真机/人工判断的项只登记不阻塞；本地可完成的实现与验证全速推进。
3. 门禁只保留：宿主兼容、数据安全、无障碍/触控、真实回归、集市合规。

## 1. 定位梳理：两处强化，骨架不变

- **生态出口（新增）**：内核已提供插件 RPC 网关（`POST /api/plugin/rpc/:name` + WS，`router.go:688` 已核实），速切的只读 Agent 能力（workspace-context/document-context）可注册为 RPC 方法，被外部 Agent/MCP 直连消费——速切从"宿主能力的消费者"升级为"能力节点"，这是 D6 的出口侧延伸，集市尚无先例。
- **开源窗口确认**：直接竞品 sy-quickswitch 2025-10 起停更且实际闭源（README 标 MIT 但仓库无源码）；叠加 R3 记录的番茄工具箱转专有，思源"导航/切换器"品类出现开源真空，速切是事实上的开源标杆。README 卖点候补（延续 R3 结论，不单独发版）。
- 不变的边界：不做主页大屏、不做第二个搜索页、不做云同步/行为追踪、不做系统级跨应用浮窗。

## 2. 机制级发现（已交叉去重，按价值排序）

### 2.1 宿主新能力（最硬的机会，全部已核实）

| # | 发现 | 机制级吸收点 | 证据 |
| --- | --- | --- | --- |
| H1 | `openTab` 新选项 | `keepCursor`（打开后不抢焦点）、`removeCurrentTab`（替换当前页签）、`afterOpen` 回调、`doc.mode` 预览模式——文档集批量恢复可静默不抢焦点；预览（T-6816）获得宿主级支撑；能力检测+旧版降级 | API.ts 已核实 |
| H2 | `/api/history/` 域 | `getHistoryItems`/`searchHistory`/`rollbackDocHistory` 等 13 端点：官方文档历史比 SQL 扫 blocks.updated 可靠，可升级"只看有改动"（T-6799b）数据源并新增历史回滚入口 | router.go 已核实 |
| H3 | 插件 RPC 网关 | 速切只读能力注册为 JSON-RPC 方法，外部 Agent/MCP 直连（见 §1 生态出口） | router.go 已核实 |
| H4 | `Plugin.addBreadcrumbButton` | 每个文档面包屑挂速切按钮（id/icon/title/callback(protyle)），轻量入口补全入口矩阵 | Plugin 类已核实 |

### 2.2 搜索与排序机制

| # | 发现 | 机制级吸收点 |
| --- | --- | --- |
| S1 | fzf `--track` 结果身份锚定（v0.71+） | 异步刷新/分区追加时按"条目身份"钉住选中行与视口，不因结果插入跳动——直接适用于三层搜索异步返回与统一索引刷新 |
| S2 | fzf v0.74 CJK/首字符分层扫描 | 中文标题+拼音是速切主路径；对首字符查询做候选集预分层（单字符 2.4x、CJK 12x 的思路），数据支撑后再做 |
| S3 | JetBrains Search Everywhere 兜底化重组（IJPL-181860） | 精确命中 contributor 排前、文本块沉底不混排——速切"全库内容层"显式降为兜底块：标题/别名命中足够时折叠，为空才展开 |
| S4 | Raycast `useFrecencySorting` API | frecency 合成分作为可复算、可诊断的显式输出（呼应 T-6813 排序可解释；T-6808 解冻时的实现范式） |
| S5 | Zed 最近项目排序 | 最近视图搜索时匹配分 > 时间序 |
| S6 | iOS 26 Spotlight 第三方转发 | 三层全空时末行给"在思源全局搜索 'xxx'"带 query 兜底转发（现有"查看全部"出口的增强，先查重） |

### 2.3 工作区与恢复机制

| # | 发现 | 机制级吸收点 |
| --- | --- | --- |
| W1 | Workspace++ 布局会话版本历史 | 场景预设/文档集覆盖保存自动留 N 版、可回滚；本地 JSON 即可实现，防误覆盖 |
| W2 | Context Workspaces Live/Snapshot 双模式 | 速切 T-6800"离开自动快照"即 Live 模式；补纯 Snapshot 手动档开关，语义对齐 |
| W3 | Open Tab Settings 打开策略 | 按来源配置"复用 vs 新开"：收藏→复用、搜索结果→新开，防重复页签 |
| W4 | Vertical Tabs 临时页签 | 阅读型打开可标记"临时"，切走即关（配合 H1 `removeCurrentTab`/`afterOpen`） |

### 2.4 入口与动作机制

| # | 发现 | 机制级吸收点 |
| --- | --- | --- |
| E1 | Another Quick Switcher 自定义搜索命令化（v13.24/v14） | 把当前查询+筛选固化为命名命令，进全局命令注册表（速切动作已接 `addCommand` 白得命令面板）、可绑悬浮球/数字槽——与动态收藏组（标签驱动）互补的"查询驱动"入口 |
| E2 | Craft Quick Entry 键盘捕获流 | 捕获窗 ⌘1-4 切类型 + 键盘二级选目的地——T-6818 快速捕获的交互范式 |
| E3 | Kvaesitso 空态活动流 | 空查询=时间线（今天打开/最近编辑/待恢复文档集）——T-807 零词条工作台的深化方向 |
| E4 | Kvaesitso 条目级自定义 | 结果条目隐藏/置顶/改名（排序诊断支持按条目覆盖） |
| E5 | Smart Random Note 作用域随机 | "随机回顾"动作，作用域=当前文档集/收藏组/搜索结果 |
| E6 | Zen Glance 预览不打开 | Alt+点击预览不切换——T-6816 预览的交互变体（桌面悬停/长按） |

## 3. 集市竞品与上游动态

| 动态 | 判断 | 应对 |
| --- | --- | --- |
| **Panda Navigation**（2026-09 活跃）：悬浮导航球、文档级前进/后退、预设=场景切换、滚动收起、Skill+MCP 生成按钮 | 定位最重叠的同质竞品，但功能面窄于速切（无统一搜索编排/文档集恢复/三端/皮肤层） | 差异化已成立：其"前进/后退"= T-6806 已交付，"滚动收起"= B6 已交付，"预设"= T-6803 已交付；观察其 MCP 按钮生态，不响应 |
| sy-quickswitch：停更 + 实际闭源 | 竞品退出 | 开源窗口确认（§1），README 卖点候补 |
| 3.8.6 传递反链 + 全局引用排序（#19781） | 官方强化反链域 | T-6814 关联内容立项时对齐差异化：插件层价值=跨面板有界编排+可解释来源，不重复官方反链面板 |
| 3.8.6 移动端父文档导航（#19752/#19705） | 官方补齐手机层级导航 | 速切手机层保持"统一入口"差异，不重做层级浏览 |
| 官方窗口布局保存/恢复（#10809 已关闭） | 官方"多套布局"方向 | 与文档集互补：布局+文档集=完整工作区快照，落地版本待核实后接入 T-6815 |
| "最近文档"场景被 recent-timeline、oh-my-siyuan 蚕食 | 轻度重叠 | 速切优势=编排进统一索引；"文档即 Dashboard"偏离定位不吸收（其"配置存块自定义属性"技巧记录在案） |

## 4. 吸收批 R5-A 立项（T-6825~T-6831；T-6832 评估池）

| 任务 | 内容 | 来源 | 归位 |
| --- | --- | --- | --- |
| T-6825 | 搜索结果身份锚定：异步层返回/分区刷新时选中行与视口钉住（S1） | fzf --track | §8.0.16 P0 可靠性，紧跟 T-6813 |
| T-6826 | openTab 新选项接入：`keepCursor`/`removeCurrentTab`/`afterOpen`/`doc.mode`，能力检测+旧版降级（H1） | 上游 API.ts | P0，支撑 T-6815 恢复链不抢焦点与 T-6816 预览 |
| T-6827 | 保存的搜索命令化：查询+筛选存为命名命令，进全局命令注册表/悬浮球/数字槽（E1） | Another Quick Switcher | P1 动作生态（T-6818~T-6821 邻域） |
| T-6828 | `/api/history/` 域接入：官方历史作"只看有改动"数据源升级 + 文档历史回滚入口（H2） | 上游 router.go | P0 工作上下文，T-6799b 数据源替换 |
| T-6829 | 文档集/场景预设版本历史：覆盖保存自动留 N 版可回滚；Snapshot 手动档开关（W1/W2） | Workspace++、Context Workspaces | P1 |
| T-6830 | 打开策略层：按来源配置复用 vs 新开页签（W3，W4 临时页签并入） | Open Tab Settings | P1 |
| T-6831 | 面包屑入口按钮：`addBreadcrumbButton` 一键进速切/关联内容（H4） | 上游 Plugin 类 | P1 动作生态 |
| T-6832（评估池） | 插件 RPC 网关：只读能力注册为 RPC 方法供外部 Agent/MCP 消费（H3） | 上游 router.go | 依赖 D6 provider 协议与 D14 进入条件，不抢跑 |

执行归位：T-6825 排 T-6813（当前 WIP）之后同批收口；T-6826/T-6828 并入 P0 工作上下文批与 T-6814~T-6816 衔接；其余按表归位。每项走"纯模型 → 生产接线 → 门禁（负向验证）"推进。

## 5. 候补池更新（随反馈取用）

兜底转发带 query（S6，先与"查看全部"查重）；CJK 首字符分层扫描（S2，等性能数据）；最近视图匹配分>时间序（S5）；空态活动流时间线（E3）；条目级置顶/隐藏（E4）；作用域随机回顾（E5）；空闲 N 秒自动打开 top1（fzf idle，做成可选项）；捕获窗键盘类型切换（E2，并入 T-6818 设计）；marks 书签（既有）。frecency（T-6808）解冻时按 S4 范式实现。

## 6. 不值得吸收（防反复）

Multi-Vault Navigator（跨 vault 场景不成立）；Notebook Navigator/访达列视图（文件树替代品，偏离导航器定位；列视图仅吸收"标题级搜索+结果恢复真实层级"思想）；Notion Workspace Switcher（云账号模型）；Chrome 式页签分组（思源无页签分组 API，纯视觉模仿）；Scroller/打字机滚动（编辑器内导航）；Bases kanban/折叠分组（动态收藏组等价）；webview 内嵌浏览器（资源重、偏离本地优先）；temp-edit（非定位）；Raycast AI Agents/Memory/云同步、VertiTab AI 分组（违背零云定位）；Reflect/Anytype/AppFlowy/AFFiNE（未见机制级导航创新，待核实项不再跟踪）；Edge Workspaces（官方渐进移除，反向印证本地快照方向正确）。

## 7. 主要参考来源

- 上游（已核实）：[router.go](https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go)、[API.ts](https://github.com/siyuan-note/siyuan/blob/master/app/src/plugin/API.ts)、[Plugin 类](https://github.com/siyuan-note/siyuan/blob/master/app/src/plugin/index.ts)、[issue #17523](https://github.com/siyuan-note/siyuan/issues/17523)、[#19781](https://github.com/siyuan-note/siyuan/issues/19781)、[#10809](https://github.com/siyuan-note/siyuan/issues/10809)、[bazaar plugins.json](https://github.com/siyuan-note/bazaar)
- 竞品：[Panda Navigation](https://github.com/hqweay/siyuan-panda-navigation)、[sy-quickswitch](https://github.com/asdfcyt/sy-quickswitch-release)、[oh-my-siyuan](https://github.com/Husense6/oh-my-siyuan)、[recent-timeline](https://github.com/lovelife88/siyuan-plugin-recent-timeline)
- Obsidian：[Another Quick Switcher](https://github.com/tadashi-aikawa/obsidian-another-quick-switcher)、[Contexts](https://github.com/ba2slk/obsidian-contexts)、[Context Workspaces](https://github.com/JinmuGo/obsidian-context-workspaces)、[Vertical Tabs](https://github.com/oxdc/obsidian-vertical-tabs)、[Open Tab Settings](https://github.com/jesse-r-s-hines/obsidian-open-tab-settings)、[Smart Random Note](https://github.com/erichalldev/obsidian-smart-random-note)、[Obsidian changelog](https://obsidian.md/changelog/)
- 广域：[fzf releases](https://github.com/junegunn/fzf/releases)、[Kvaesitso](https://github.com/MM2-0/Kvaesitso)、[Kvaesitso filters](https://kvaesitso.mm20.de/docs/user-guide/search/filters.html)、[IJPL-181860](https://youtrack.jetbrains.com/issue/IJPL-181860)、[Raycast 开发者文档](https://developers.raycast.com)、[Zen Browser](https://zen-browser.app)、[Heptabase changelog](https://wiki.heptabase.com/changelog)
- 部分发现（Workspace++ 仓库链接、Zed 排序、Notion 结构化搜索 UI）标注待核实，仅作候补参考，不作为立项唯一依据。

## 8. 循环状态

R5 完成。结论：**R4 骨架（ADR 0076 五阶段）不变，本轮注入 7+1 项机制级吸收（R5-A）**，其中 4 项直接以新核实的宿主 API 为地基。下一触发：R5-A 消化完毕、真机反馈、上游 3.9/4.0 发布，或新的高价值生态信号。
