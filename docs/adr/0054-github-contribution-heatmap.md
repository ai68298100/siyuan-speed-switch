# ADR 0054：GitHub 贡献格点热力图渲染（P3-1）

- 日期：2026-09-17
- 状态：已接受（T-6297）
- 范围：`github-model` / `life-widget-model` / `home-model` / `home-view` / `home-external-adapters` / 样式切片 08 / i18n 双语

## 背景

v0.21 生活信息支线交付的 GitHub 组件是**周汇总列表**（最近 6 周 + 主页链接），
而 `buildContributionGrid`（`github-model.js`）当时就已产出 `cells/weeks/total/activeDays`
与 0~4 档 level——**数据层早于渲染层完成，格点一直没被用起来**。
dev-plan 的 P3 首项即"GitHub 贡献格点热力图渲染"。

## 决定

新增第四个视图类型 `viewType: "heatmap"`，沿用既有的 viewType 分派机制（calendar / weekdays / media）：

1. **模型层**：`buildGithubContribSnapshot` 增加 `config.layout === "grid"` 分支，
   输出格点条目 `{label: 日期, count, level, outside}` + `stat`（窗口内贡献总数），
   标题附带用户名（`GitHub 贡献 · torvalds`，经 `contextTitle` 显示在模块头部）。
   **缺省与 `layout` 非 grid 时行为一字不变**——周汇总路径由既有契约测试钉住，保持可用。
2. **视图层**：`home-view.js` 新增热力图渲染分支（列=周、行=周日~周六），
   格点强弱**直接取模型层的 `level`**，视图不重写量化阈值，避免第二事实源。
3. **目录层**：`external-github-contrib` 定义加 `viewType: "heatmap"`；
   `home-model.js` 与 `home-view.js` 两处 viewType 白名单**同步**加入（双向契约）。
4. **适配器**：传 `{...normalized, layout: "grid"}` 与 `title/stat` 文案。
5. **样式**：切片 08 追加 `.sw__home-heatmap`（格点 10px、`grid-auto-flow: column`、
   7 行固定、周数多时横向滚动而非压缩格点）；仅用 CSS 自定义属性，不引入 SCSS 变量依赖。
6. **i18n**：双语成对新增 `homeGithubStat`。

## 搬移/接线中发现的三个硬约束（不改就渲染不出来）

| 约束 | 位置 | 处置 |
|---|---|---|
| 条目硬顶 42（`Math.min(CALENDAR_MAX_ITEMS, …)`） | `normalizeHomeViewResult` | 硬顶提到 `HARD_ITEM_CEILING = 400`，热力图按 `HEATMAP_MAX_ITEMS = 371`（366 天 → 53 周 × 7）取用；**列表/日历上限不变**（有专门测试钉住 24 / 42） |
| 条目字段白名单无 `level` | `normalizeHomeViewResult` | 透传并钳制到 `-1..4`（`-1` = 窗口外），不在视图层重算档位 |
| 空条目会被 `keepEmptyItems` 过滤 | `buildHomeModuleView` | 热力图与日历同等待遇：保留空条目，否则周日对齐的占位格会被吃掉 |

## 验证

- `tsc --noEmit` 0 错误；新增 5 项契约测试（快照格点 2 / 视图渲染与上限 2 / 目录 viewType 1）。
- **负向验证 4 组全 PASS**（每组：基线 0 失败 → 注入后**精确** 1~2 项失败、同文件其余用例不波及 →
  md5 字节级还原 → 复跑 0 失败）：
  白名单摘掉 heatmap、硬顶退回 42、关闭 grid 分支、目录去掉 viewType。
- `verify:release` 全链绿（含三套 smoke）。

## 教训（本轮当场踩中，均已修正）

1. **负向验证脚本第三次出现自身缺陷**（与 P0-2 的影子绑定、P1-1b 的 CRLF 切片同族）：
   首版把"基线跑"写在注入**之后**，导致 `base_fails` 实为注入态、判定全反。
   → 基线/注入/还原三次运行的**先后顺序**本身就是断言对象，写错脚本会得到"看起来很合理"的结论。
2. **注入锚点命中 2 次**：`config.layout === "grid"` 同时存在于代码与注释里。
   → 注入锚点必须**断言命中恰 1 次**；"命中 0/2"都是可疑信号，不能靠肉眼判断哪一处是目标。
3. **i18n 插入漏尾逗号**导致 JSON 解析失败（插入点后面还有其它键）。
   → 结构化文件（JSON）的插入必须**当场解析校验**，不能只看行插入成功。
