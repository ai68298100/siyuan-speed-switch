# 同类产品深度调研报告（2026-09-19，T-6433）

> 目的：为组件商店逐组件深度优化、已完成组件的二轮增量、以及插件本体（切换器/面板）的
> UI 与交互升级，系统性吸收同类与形似产品的已验证设计。
> 时序说明：调研期间并行会话已交付队列 #32~#35 基础四组件（年度进度/数据健康/倒数日/
> 时间与日期，T-6433~T-6436，账本 §30）；本调研登记为 **T-6437**，其 §11.1 相应改为
> 「研究输入 vs 已交付」对照复核，未覆盖项转入 §11.2 候选池；剩余队列 #36~#58。
> 边界（用户口径，2026-09-19 确认）：**打卡内容归「小驴打卡」外部插件**，速切只保留
> checkin-* 桥接渲染（队列 #52~#58），不新增内置打卡逻辑；打卡类调研成果整理为
> §7「给小驴打卡的建议」。
> 方法与渠道：GitHub API（gh search / repo view）、思源集市官方索引
> （siyuan-note/bazaar `stage/plugins.json`，509 个插件全量扫描）、Web 检索（厂商官方文档、
> 应用商店与评测）。star 数为 2026-09-19 检索时点。源码克隆在仓库外
> `D:/AI/Codex/research-clones/`（不进入本仓库 git）。

## 0. 许可纪律（先于一切结论）

ROADMAP §6 既有约束：**不直接复制 GPL 项目实现；外部项目只用于理解交互理念和验证兼容性**。
本轮按许可分三档执行：

| 档 | 许可 | 项目 | 用法 |
| --- | --- | --- | --- |
| 仅理念 | GPL/AGPL/其他 | uhabits(GPLv3)、habitica(GPLv3+CC)、tabliss(GPLv3)、rofi、Wox(GPLv3)、Ulauncher(GPL)、Kvaesitso(GPL)、Lawnchair、HabitTrove(AGPL) | 只看设计与算法思想，公式重写、实现自研 |
| 算法可参考 | Apache/BSD/MIT | mhabit(Apache-2.0)、beaverhabits(BSD-3)、Flow Launcher(MIT)、Cerebro(MIT)、obsidian-dataview(MIT)、obsidian 打卡插件(MIT) | 可细读算法与数据结构；实现仍保持本仓库独立，不移植代码 |
| 闭源特征 | — | Days Matter、TickTick、Streaks、HabitKit、Habitify、小日常、Raycast、uTools、Momentum | 产品级功能与交互分析 |

## 1. 产品定位 → 参照系两条轴

小驴速切 = **思源笔记的页签/文档导航器 + 58 组件的组件商店**。由此映射出两条参照轴：

- **轴 A（内容轴）**：组件承载的信息域有哪些成熟产品？
  - 习惯/打卡：uhabits(Loop)、mhabit(Table Habit)、habitica、beaverhabits、Obsidian 打卡插件、TickTick/Streaks/HabitKit/Habitify/小日常；
  - 倒数日/纪念日：Days Matter 及其模仿者（开源侧无高 star 实现，见 §4）；
  - 仪表盘组件套件：Tabliss、Momentum；
  - 笔记生态统计：思源集市同类（思源洞察仪表盘等）。
- **轴 B（形态轴）**：插件本体（快速切换 + 组件面板）像谁？
  - 启动器/命令面板：Raycast、rofi、uTools、Flow Launcher、Wox、Cerebro、Ulauncher、Kvaesitso；
  - 手机厂商小部件系统：iOS WidgetKit/Smart Stack、鸿蒙服务卡片、OriginOS 原子组件、MIUI 小部件；
  - 新标签页/桌面看板：Tabliss（源码级）。

## 2. 轴 A 深读一：uhabits / Loop Habit Tracker（10,255★，GPLv3，Kotlin）

打卡品类公认的数据模型标杆，Android 端最成功的开源习惯应用。

**数据模型（`uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models/`）**

- **Entry 五态**（`Entry.kt`）：`YES_MANUAL=2 / YES_AUTO=1 / NO=0 / SKIP=3 / UNKNOWN=-1`。
  切换环支持两种开关：`isSkipEnabled`（手动/自动勾选→跳过→未做）与
  `areQuestionMarksEnabled`（未做→问号→勾选）。**"跳过/豁免日"是一等公民**——这是全部
  竞品中唯一把"今天有意不做"从"失败"里解放出来的设计。
- **Frequency = n/m**（`Frequency.kt`）：numerator/denominator 两整数表达"每 m 天至少 n 次"，
  预设（每日、每周 3 次…）只是语法糖；n==m 时归一为每日。
- **滑动窗口完成率 + 指数衰减评分**（`ScoreList.kt` + `Score.kt`）：
  - 完成率：以 m 为窗长滚动求和 `YES_MANUAL`，`percentage = min(1, rollingSum/n)`；
  - 衰减：`multiplier = 0.5^(sqrt(freq)/13)`，`score = prev×multiplier + pct×(1−multiplier)`
    ——**半衰期 ∝ 13/√freq**：高频习惯约 13 天半衰期，低频习惯更宽容；
  - **SKIP 日评分冻结不衰减**（`if (value != SKIP)` 才推进）；
  - 非每日布尔习惯把 n、m 同时 ×2 平滑不规则节奏（如"每周任意 3 天"）；
  - 数值习惯（`NumericalHabitType.AT_LEAST/AT_MOST` + `targetValue` + `unit`）：
    AT_MOST（如"抽烟 ≤ 5 支"）默认满分起步，超标按比例扣。
- **Streak**（`StreakList.kt`）：连续 `value > 0` 的日期段——**YES_AUTO 与 SKIP 都延续连续
  记录**，只有显式未做才断档；数值习惯按达标值折算。另有 `getBest(limit)` 取历史最佳。
- **Habit 字段**（`Habit.kt`）：name/question、color、frequency、type(布尔/数值)、
  targetType/targetValue/unit、reminder(含 WeekdayList)、position、archived。

**形态**：9 种桌面小组件（Checkmark/Score/Streak/Frequency/History/Target/Stack/Empty，
`uhabits-android/.../widgets/`）。**CheckmarkWidget 点击即切换**（数值习惯点击弹数字录入），
组件是动作不是链接；StackWidget 把多个习惯翻页进一个桌面位。

**优缺点**：离线优先、零账号、零广告、算法可解释（半衰期公式可直接口述）；
缺点是无官方云同步（靠第三方）、仅 Android、频率/目标编辑偏 geek。

## 3. 轴 A 深读二：mhabit / Table Habit（1,575★，Apache-2.0，Flutter）

**许可档位最高的高 star 打卡应用**（Apache-2.0，算法可细读）。

- **频率四型**（`lib/models/habit_freq.dart`）：daily / weekly(n 次/周) / monthly(n 次/月) /
  custom(n 天里 m 次)，工厂函数自动钳制 `freq≤days`。
- **正向/负向习惯**（`lib/models/habit_daily_goal.dart`）：`HabitType.normal/negative`
  两族目标数据，负向习惯（如戒烟）目标语义整体翻转；每日目标 = `dailyGoal + dailyGoalUnit +
  dailyGoalExtra`——**Extra 是"拉伸目标"**（达标后再冲的加分档），即其 README 所称
  "smart scoring" 的输入之一。
- **评分器**（`lib/models/_score/calculator.dart`）：0–100 分，按距上次记录的天数线性衰减
  （`duringDays × calcDecreasedPrt()`），与 uhabits 的指数衰减互为印证：**"强度分"应随
  空窗平滑回落，而不是一夜清零**。
- 工程面：WebDAV 同步、本地优先、多端（Android/iOS/桌面）、CSV/EP 导出。
- 优缺点：统计维度最全（目标/单元/拉伸/正负向）；代价是配置项多、首启心智重——
  对我们的启示是**高级口径必须折叠在默认简单路径之后**。

## 4. 轴 A 深读三：habitica（14,158★，GPLv3 系，JS monorepo）

游戏化打卡鼻祖。计分核心在 `website/common/script/ops/scoreTask.js`：

- **自适应难度**：任务有动态 `value`，连续完成使 value 走高、长期搁置走低，奖励
  `delta` 从 value 派生——"困难的事坚持更久回报更高"由数据自然涌现，无需手工调权。
- **奖励公式**：`exp += delta × intBonus × priority × crit × 6`；金币
  `= delta × priority × crit × perBonus × streakBonus`，其中
  **`streakBonus = currStreak/100 + 1`（线性、可解释，1 天 = ×1.01）**（scoreTask.js:141-150）；
- **惩罚有下限**：漏掉 daily 扣 HP `= delta × conBonus × priority × 2`，
  且单次最少 1 点（`hpMod > -1` 时仍扣 1），**死亡惩罚存在但不至于一击致命**；
  cron 结算漏打即 `streak = 0`（除非有保签 buff）；
- 暴击 3% 起步（`fns/crit.js`）。
- 优缺点：游戏化留存被市场验证；但概念负担（职业/装备/任务四类）极重，**只适合作为
  "激励层"参考，不适合搬进效率工具**。打卡归小驴打卡后，此处结论全部转入 §7。

## 5. 轴 A 深读四：beaverhabits（1,837★，BSD-3，Python/NiceGUI）与 Obsidian 插件

- **beaverhabits**：反方向的最小化——"self-hosted habit tracking **without Goals**"。
  数据模型退到极致：一个习惯就是 `ticked_days` 日期集合（`storage/`），展示就是
  **逐年 53 周热力图分页 + 48 个月 history + 每日 notes**（`frontend/streaks.py`：
  `WEEKS_TO_DISPLAY = 53`，按年翻页渲染）。证明热力图本身就是合格的产品形态。
  对 `checkin-year-heatmap`（渲染侧）与 `recent-writing-activity` 的启示：**大跨度回看按年
  分页、色阶配文字图例**（GitHub 热力图同款可及性做法）。
- **Obsidian 打卡插件**（duoani/obsidian-habit-tracker 58★、yirsi heatmap 27★，均 MIT）：
  `main.ts` 用 ```habitt``` 代码块 DSL（`[month: 2021-01]` + `(1)(3,标签)` 标记）在笔记里
  渲染月网格——**"笔记内数据 → 结构化视图"** 与速切的 SQL 投影路线同构；弱点是数据
  散落笔记、无独立状态机（没有 SKIP/频率语义），印证速切把打卡数据留在专职插件的分工。

## 6. 轴 A 品类补充：倒数日、TickTick 与集市同类

**倒数日**：GitHub 检索无高 star 开源实现（最高 7★，多为课程作业级）；品类原型是闭源的
**Days Matter/倒数日**。产品级特征清单（来自官方商店页与评测）：① **倒数/累计双模式**
（"还有 N 天"与"已经 N 天"同一数据结构）；② 分类（"倒数本"）；③ **置顶事件放大显示**；
④ 重复事件（生日/纪念日年循环）；⑤ 提醒；⑥ 单/多事件多尺寸 widget。→ 这就是
`countdown` 组件深优化的对标清单。

**TickTick/滴答清单**：习惯模块亮点是 **60+ 习惯模板库**（降低建卡冷启动）、灵活打卡方式、
"数据回顾"月报、与任务/日历同源一体，另有"倒数纪念日"独立模块。模板库思路可给小驴打卡（§7）。

**思源集市同类**（509 插件全量扫描）：与我们重叠最高的第三方是**思源洞察仪表盘**
（笔记统计+年度进度+写作热力图+最近修改）、**Oh My SiYuan**、**文档活跃统计**（热力图）；
打卡侧有片趣(21★)、任务助手内嵌习惯打卡、凡人修仙传：打卡；**AI 时间块日历已内置倒数日/
纪念日**。结论：① `year-progress`/写作热力必须按队列深优化保持规格领先（第三方已有同题材）；
② 速切的差异化在"58 组件统一协议 + 切换器一体"，继续做深不做宽。

## 7. 打卡类成果 → 给小驴打卡的建议（速切不做内置）

以下内容不进入速切内置组件，按用户口径转给「小驴打卡」（siyuan-checkin）：

1. **数据模型**：采用 Entry 五态（含 **SKIP 豁免日**，参考 uhabits `Entry.kt`），频率用
   n/m 二元组而非枚举；可选数值型习惯（AT_LEAST/AT_MOST + 目标 + 单位）。
2. **断签规则**："连续"应把豁免日算作延续（uhabits StreakList 语义），漏打才断；
   评分/强度用平滑衰减（mhabit 线性或 uhabits 指数），**不要一夜清零**。
3. **激励层**（如做）：habitica 的线性 `streakBonus = streak/100 + 1` 简单可解释；
   惩罚务必设下限（单次最少 1 点 HP 的做法）。游戏化概念负担重，慎入。
4. **冷启动**：TickTick 式习惯模板库（预设"喝水/阅读/早睡"+推荐频率）。
5. **工程**：离线优先、导入导出（Loop 兼容 HabitBull CSV 的迁移思路）、WebDAV 备份
   （mhabit 先例）、提醒可靠性优先级最高。
6. **桥接协议增强建议**：向速切 checkin-* 桥接组件暴露 skip/pause 语义字段、n/m 频率
   元数据与目标值，使渲染层能正确显示"豁免/暂停不断签"，避免速切侧只能按二值勾选渲染。

## 8. 轴 B 深读五：Tabliss（2,781★，GPLv3，TypeScript）——组件套件架构对照

与我们组件商店形态最接近的开源实现（新标签页 = 背景 + 组件层）：

- **组件注册**（`src/plugins/types.ts`）：每个组件一个 `Config { key, name, description,
  dashboardComponent, settingsComponent }`，目录在 `widgets/index.ts` 显式聚合——与速切
  `home-model.js` catalog + configSchema 同构，验证了我们的协议形态是行业常规解。
- **状态键空间**（`src/db/state.ts`）：`background` / `widget/<id>`（id+key+order+display）/
  `data/<id>` 三区分离，且**全插件持久化数据显式标注 100KB 上限**——数据与配置分键、
  容量显式化，值得我们在设置页做"存储用量"展示时参考。
- **九宫格位置模型**（`src/views/dashboard/Widgets.tsx`）：组件按 `position`（topLeft…
  bottomCentre 九槽）+ 槽内 `order` 排布——速切用 xs~full 尺寸槽解决同一问题；可借鉴的
  增量是 **每组件独立 display 覆盖**（`WidgetDisplay`: colour/fontFamily/fontSize/
  fontWeight），即"单组件字号/颜色微调"作为配置深度的下一个统一维度（受 ADR 0061
  12 字段上限约束，需白名单挑选）。
- 组件 API 三件套 `Data / Cache / Loader`（远端数据时 loader 计数驱动全局加载指示）——
  与我们"短缓存 + 陈旧回退 + 有界超时"一致；背景层与组件层分离（我们无背景概念，不适用）。
- 该项目 2024 年后维护放缓、社区存在活跃 fork——**组件套件类产品长期风险是组件间
  质量漂移**，这正是我们队列化逐组件深优化在防的事。

## 9. 轴 B：启动器/命令面板（切换器本体参照）

GitHub 检索（2026-09-19）：Wox 27,410★(Go 重写，GPLv3)、rofi 16,4xx★(C，"窗口切换器 +
应用启动器 + dmenu 替代")、Flow Launcher 15,5xx★(C#，MIT)、Cerebro 8,562★(JS，MIT)、
Ulauncher 4,512★(Python)、Kvaesitso 5,130★(Kotlin，搜索中心启动器)、Lawnchair 13,550★(Java)；
闭源：Raycast、uTools、Alfred、PowerToys Run、Listary。

对速切切换器/命令路径的可借鉴点（多数我们已有，列出是为校验差距）：

- **rofi 的窗口切换器语义**：MRU 排序、模糊匹配、激活窗口标识、纯键盘循环选择——速切
  第一面板已实现同套语义（R0~R4），无差距项；rofi 的 **modi（模式）概念**（窗口/应用/
  脚本同一界面切换数据源）对应我们"页签/文档/日记"分区，形态一致。
- **Raycast Action Panel**：列表项 Enter=主行为、**Tab/⌘K 唤出"针对选中项的动作面板"**，
  次级动作不散落在界面各处。速切卡片已有右键/菜单，增量点是**交互措辞统一**：
  所有卡片"点击=打开，菜单=动作集"，并在焦点态提供显式动作面板键（键盘可发现性）。
- **Raycast Quicklinks / 别名**：高频目标一键直达且可自定义别名——对应速切"收藏+文档集"，
  可借鉴其**别名直呼**（输入别名即回车直达）作为搜索模型的可选排序权重，属低成本增量。
- **uTools 超级面板**：鼠标选区→上下文面板（鼠标流）；速切手机端长按 sheet 已覆盖，
  桌面端选区联动越界不做。
- **Flow Launcher/Wox 的插件协议**：第三方插件以独立进程/JSON 契约接入，主程序只管
  聚合与安全边界——与我们 widget-protocol 同思路，再次验证"渲染在宿主、数据在 provider"
  分工（checkin-* 桥接即此模式）。

## 10. 轴 B：手机厂商小部件系统（组件面板参照）

共同背景：自 iOS 14（2020）把小组件重新做成"规范品"后，各厂商两年内全部跟进，趋势是
**"桌面即服务"：不打开 App 完成核心操作 + 统一视觉规范**（anzuo.cn 对比稿、厂商开发者文档）。

- **iOS WidgetKit**：① **时间线预算**——系统每日仅给约 40~70 次刷新，官方要求"能预测的
  更新点预先批量生成 timeline"，而非高频轮询；② **iOS 17 交互组件**——按钮/开关通过
  App Intents **免打开 App 原位执行**；③ **glanceable 密度准则**——小尺寸=1 个数据点、
  禁滚动、更新频率与内容相关度对齐（日历在事件边界更新而非每 5 分钟）。
  → 对速切的直接映射：**时钟/年进度类组件按"下一个边界时刻"调度重绘**（分→时→日），
  xs/small 尺寸严格执行"单指标"评审（已列入队列评分卡"信息层级"维度，此为权威出处）。
- **鸿蒙服务卡片**：2×2/2×4/4×4 **按内容"量体裁衣"的尺寸族**、**卡片上滑动切换多样式**、
  上滑图标呼出、负一屏中枢、跨设备流转。→ 对应我们的 sizes 梯度（xs~full）：
  **同一组件不同尺寸应是不同信息形态，而非等比缩放**（评分卡第 4 维度再获权威支撑）；
  "滑动切换样式"在我们面板中可映射为**尺寸/密度切换的手势化**（低成本候选）。
- **OriginOS 原子组件**：长按图标即展开组件（组件与入口合一）、桌面直操作、
  动效统一可打断。→ 可借鉴"交互可打断"原则：长任务（全库扫描/刷新）必须可打断且不打断动画帧。
- **MIUI/澎湃小部件**：13 起统一视觉规范 + "智能服务类组件"（快递追踪等绑定即用）；
  评测共识"Google 没做好的小组件，MIUI 做对了"——**统一规范本身就是卖点**，
  支持我们继续用统一评分卡而非零散美化。

## 11. 行动清单

### 11.1 基础四组件：研究输入 vs 已交付对照（T-6433~T-6436，2026-09-18 并行批次）

四组件深度优化已由并行会话交付（账本 §30，全量 6209/6209）。调研结论逐项对照：

| 组件 | 研究输入（本报告 §6/§10） | 已交付（T-6433~T-6436） | 差口（转候选池） |
| --- | --- | --- | --- |
| `year-progress` | WidgetKit"预计算边界更新"；xs=单指标；周/季/自选起止日 | 纯模型抽取、UTC 日历差防 DST、闰年精确、已过/剩余开关、xs 只留主进度 | 周/季进度与自选起止日未做 → §11.2 |
| `data-health` | 严重度分级；修复入口指向原生；有界大清单 | 名称/路径检索、排序、有界 512 扫描"已显示/总数"、≥10 转"较多"严重度、1.2s 超时 | 内核无修复端点，不伪造入口（正确取舍）；全量清单出口未做 → §11.2 |
| `countdown` | Days Matter 六件套：双模式/重复/置顶/到期态/分类 | 每年重复（月末钳制+2/29 平年落 2/28）、目标日期开关、严格日历校验 | 倒数/累计双模式（"已经 N 天"）、置顶放大、分类未做 → §11.2 |
| `external-local-time` | 重绘频率分层；样式梯度（模拟/数字/自定义格式） | 12/24h、秒显示（仅秒实例走秒级心跳、页面隐藏暂停）、日期行 | 模拟表盘/自定义格式串未做 → §11.2 |

对照结论：已交付部分与行业实践方向一致（尤其 T-6436 的"按需秒级心跳+隐藏暂停"正是
WidgetKit 时间线预算思想的本地版）；差口均为增量特性而非缺陷，统一转入 §11.2 候选池，
不改变既有验收口径。

### 11.2 二轮增量候选池（已完成 35 组件 + §11.1 差口，按队列消化，不翻烧饼）

- `countdown` 倒数日：补"累计/正向"双模式（"已经 N 天"）与置顶事件放大（Days Matter 对标，
  §11.1 差口）；
- `year-progress` 年度进度：周进度/季进度与自选起止日（§11.1 差口）；
- `writing-streak` 写作打卡：引入 n/m 口径（"每周至少 N 天"）与**豁免日不断签**文案/语义
  （uhabits SKIP 思想，渲染侧纯模型可做）；
- `recent-writing-activity`：回看上限 90 天→可议 12 个月 + 逐年分页（beaverhabits 53 周分页）；
  热力图色阶补文字图例与色盲替代刻度（GitHub/beaverhabits 可及性做法）；
- `note-stats`/`today-writing`：可选"习惯强度分"次指标（半衰期公式纯前端实现，零新增 SQL）；
- `checkin-*` 桥接渲染族：等小驴打卡协议补充 skip/pause/频率元数据后，渲染侧跟进（§7.6）；
- 通用配置维度：**每组件 display 覆盖（字号/强调色）**作为下一个统一配置族（受 ADR 0061
  上限与白名单约束，先做时间/倒数/引言三个纯展示组件试点）；
- 通用透明度：设置页展示 8 个数据 key 的存储用量（Tabliss 100KB 显式化思路）；
- 切换器键盘可发现性：焦点卡片显式"动作面板"键（Raycast Action Panel 心智），先做桌面端。

### 11.3 明确不采纳（记录理由，防反复）

- 组件自动轮换/情境智能排序（Smart Stack 类）：撞 ROADMAP 暂缓清单"AI 智能排序"；
- 动态取色主题（Material You 类）：违反"优先复用思源主题变量，不建第二套视觉系统"；
- 插件自建云同步/账号体系：暂缓清单既有项；
- 游戏化 HP/金币/暴击层：打卡归小驴打卡，且概念负担与速切定位冲突（§4）；
- 把倒数日/打卡做成速切内置数据域：与 §0 用户口径冲突，速切保持渲染/桥接分工。

## 12. 附录：克隆清单与关键源码索引

克隆位置 `D:/AI/Codex/research-clones/`（仓库外）：uhabits、mhabit、habitica(sparse)、
tabliss、beaverhabits、obsidian-habit-tracker、obsidian-habit-heatmap。

| 结论 | 源码位置 |
| --- | --- |
| Entry 五态与切换环 | `uhabits/uhabits-core/.../core/models/Entry.kt` |
| 半衰期评分公式 | `uhabits/uhabits-core/.../core/models/Score.kt`（compute） |
| 滑窗完成率与 SKIP 冻结 | `uhabits/uhabits-core/.../core/models/ScoreList.kt`（recompute） |
| 连续记录判定 | `uhabits/uhabits-core/.../core/models/StreakList.kt` |
| 9 种桌面组件 | `uhabits/uhabits-android/.../widgets/`（CheckmarkWidget 点击即切换） |
| 频率四型 | `mhabit/lib/models/habit_freq.dart` |
| 目标/拉伸目标/正负向 | `mhabit/lib/models/habit_daily_goal.dart` |
| 0-100 线性衰减评分 | `mhabit/lib/models/_score/calculator.dart` |
| streak 加成与 HP 下限 | `habitica/website/common/script/ops/scoreTask.js`（:141-150、_subtractPoints） |
| 逐年热力图分页 | `beaverhabits/frontend/streaks.py` |
| 组件注册/状态键空间/九宫格 | `tabliss/src/plugins/types.ts`、`src/db/state.ts`、`src/views/dashboard/Widgets.tsx` |
| 笔记内 DSL 渲染打卡 | `obsidian-habit-tracker/main.ts` |

主要外部来源：GitHub API 检索快照（2026-09-19）；[siyuan-note/bazaar plugins.json](https://github.com/siyuan-note/bazaar)；
[Apple: Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)；
[Apple: Adding interactivity to widgets](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)；
[鸿蒙服务卡片/负一屏（华为开发者）](https://developer.huawei.com)；
[小米小部件技术规范](https://dev.mi.com)；[vivo OriginOS](https://www.vivo.com.cn)；
[Raycast Action Panel 手册](https://manual.raycast.com)；[uTools 超级面板](https://www.u-tools.cn)；
Days Matter 商店页与少数派/知乎评测；TickTick 官网与滴答清单帮助中心。
