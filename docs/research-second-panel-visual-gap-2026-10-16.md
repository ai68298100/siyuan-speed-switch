# 第二面板视觉差距复核：原型、生产候选与 Obsidian 参考

- 日期：2026-10-16
- 范围：T-7274/T-7275 之后的生产候选实现复核；本记录只做视觉证据和施工建议，不改代码。
- 结论：当前实现已经把窗口缩到约 920×390px，但“紧凑小组件”原型的关键视觉关系没有完整落到生产界面。生产界面仍像带平台壳层的组件管理页，卡片尺寸档位在非全屏模式下也被压成近似同高的列表卡。

## 证据

### 1. 原型与真实宿主不是同一个视觉模型

原型 `docs/design/second-panel-compact-widget-prototype-2026-10-16.html` 只保留一行轻标题和添加入口；卡片以内容决定形状：时钟、横向热力图、窄高倒数、宽列表和日历同时出现。原型的 `grid-auto-rows` 为 96px，卡片圆角 8px、单层细边线，桌面面板约 920×390px。

真实宿主探针 `.artifacts/e2e-compact-host-7/compact-host-probe.json` 记录：

| 指标 | 实际值 |
| --- | ---: |
| surface | 918×388px |
| 网格 | 866×178px |
| `recent-documents` | 575×78px，`wide` |
| `favorites` | 285×78px，`small` |
| `today-journal` | 285×78px，`small` |
| `today-tasks` | 285×78px，`small` |

这说明窗口预算已经接近原型，但网格可视高度只有 178px，四张卡实际全部 78px 高；默认首屏没有出现原型所要求的最小、横向、窄高三种明显形状。真实宿主截图还显示平台品牌栏、表面导航、上下文面包屑、文字工具栏和健康回执，壳层高度明显高于原型。

### 2. 紧凑 CSS 直接抹平了尺寸档位

`src/styles/_12-r54-surface-adapter.scss:328-336` 在 `sw-home--compact` 下设置：

- `grid-auto-rows: auto`
- `.sw-home__cell { max-height: 68px; grid-row: auto !important; overflow: auto; }`

但渲染层仍按 `HOME_WIDGET_SIZES` 写入 `data-size`、`--sw-home-span` 和 `gridRow`（`src/second-panel-ui.ts:789-815`）；尺寸模型仍声明 `xs=2×3`、`small=4×3`、`medium=4×4`、`wide=8×3`（`src/constants.ts:220-231`）。因此生产候选只保留了宽度差异，`h` 差异在紧凑模式被 CSS 强制抹掉，`medium/tall/large` 不能在画面上形成视觉层次。

这是和用户“不像小组件”的直接可复现差距，比单纯颜色或圆角不合适更值得优先施工。

### 3. 壳层和状态元数据占据了小组件预算

`src/second-panel-ui.ts:337-368` 每次重绘都会挂载完整 `sw-platform-chrome`；`src/index.ts:664-829` 的平台壳层包含品牌、三表面导航、连接状态、设置、帮助、关闭和上下文栏。`src/second-panel-ui.ts:445-575` 的 `sw-home__bar` 又保留“编辑布局 / 刷新全部 / 小组件商店”文字按钮，底部还保留 `.sw-home__receipt` 健康回执（`src/second-panel-ui.ts:1459-1465`）。

这些功能有交互价值，但它们不是小组件本体；在 920×390px 预算内，它们挤压了卡片高度，并使面板看起来像工作台而不是组件集合。原型明确移除了这些层，只保留轻标题和添加入口（`docs/research-second-panel-2026-10-15.md:62-68`）。

### 4. Obsidian 参考只证明“空间关系”，不证明未知插件实现

已有调研确认用户提供的是 ObsidianArchive 视频页单帧，不是可核验的插件规格；社区和 GitHub 搜索也没有找到正式 `ObsidianArchive` 条目。可复用的视觉证据只有：暖白画布、约 10～16px 卡片间距、内容类型对应不同宽高、轻材质和低饱和强调色（`docs/research-second-panel-2026-10-15.md:19-31`）。

因此应吸收“不同内容不同形状、轻壳层、紧凑间距”这三个关系，不应复制未知插件的画布、归档、缩放或小地图行为。

## 最小施工建议（按收益排序）

### P0：恢复紧凑模式的可见尺寸差异

保留当前 12 列布局和数据协议，只移除紧凑模式对 `gridRow` 的强制 `auto`，给紧凑桌面设置一个较小但固定的网格行高（建议 28～32px）并继续使用渲染层的 `span h`。这样 `small=3 行`、`medium=4 行`、`tall=6 行`、`wide=3 行` 能形成可见高低关系，同时比原 40px 行高更省空间。`max-height:68px` 应改为按档位或内容类型设置的上限；否则 `tall/large` 仍会被截断。

验收：默认四卡中至少保留宽卡与窄卡的宽度差；加入一个 `xs` 或 `medium` 组件后，高度差可见；不出现横向滚动；小卡标题、主值和一行状态完整可读。

### P1：让 compact 壳层只承担“返回/关闭 + 添加”

在 `sw-home--compact` 下隐藏三表面导航和上下文面包屑，平台品牌栏压到约 36～40px；把“刷新全部”和“组件商店”改成图标按钮（保留 `aria-label/title`），编辑布局收进一个更多菜单或只在编辑态出现。健康回执可收为一枚状态点/短文本，错误和过期时再展开。

这一步不删除能力，只改变紧凑表面的默认显露层级；全屏工作台和设置/商店表面继续使用完整平台壳层。

验收：920×390 桌面首屏至少留下两行不同高度卡片；打开、设置、关闭和错误详情仍可键盘访问；700px/375px 不横向溢出。

### P1：把来源健康 chip 变成轻量状态标记

`.sw__home-source-health` 当前是带边框的文字胶囊（`src/styles/_06-widgets-store.scss:586-599`），真实截图中的“Live source”占据标题行宽度。compact 默认只显示 6px 状态点和 tooltip/无障碍文本；`stale`/`failed` 保留文字和颜色通道。这样能恢复原型的轻标题层级，同时不牺牲异常可发现性。

### P2：只给内容类型增加“小组件排版”，不新增数据

沿用已有模块：`recent-documents` 作为宽列表；`external-local-time`/`year-progress` 作为 xs 主值；`countdown` 作为窄高主值；`recent-writing-activity` 或已有日历作为 medium/wide 视觉锚点。每类只调整标题、主值、meta 和行数，不引入 Obsidian 的任意 HTML、iframe、查询 DSL 或未知归档协议。

## 是否值得立项

值得新开一个小任务，但范围应限定为 **compact surface visual parity**：先做 P0 尺寸档位和 P1 壳层/状态显露层级，再用真实宿主截图复核。不要扩展为自由画布、拖放重写、归档恢复或新增组件目录。当前 T-7144 没有生产缺陷证据时，可把该任务登记为独立的视觉回归缺口，避免继续向 58 个组件逐个猜测式改样式。

