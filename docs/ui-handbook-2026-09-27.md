# 小驴雷切 UI 研究与实现交接手册（2026-09-27，T-6930）

> 面向"没参与过之前对话的 Agent"：**先读这一份**。它回答五个问题：这个项目在做什么 UI 研究、做了哪些决策和为什么、代码与界面怎么对应、已经完成了什么、下一步从哪里开始以及哪些坑必须避开。
>
> 事实源关系（不要越权改）：方向 = `ROADMAP.md`；阻塞 = `BLOCKERS.md`；决策 = `docs/adr/`；当期任务账本 = `docs/dev-plan-*.md`；**UI 设计唯一事实源 = `docs/design-system-v1-2026-09-27.md`（ADR 0084）**；**原型审查与待办 = `docs/design-review-2026-09-27.md`**。本手册是索引与导航，不替代它们。
>
> 写这份文档的起因：2026-09-27 完成了 UI 设计规范 v1.0（T-6928）与原型五维审查（T-6929），结论分散在规范、审查报告、两份原型 HTML 与若干 ADR 中。为避免后续 Agent 重复考古、或按过期原型实现，把结论、决策理由、待办与坑集中到这里。

---

## 1. 研究背景与目标

### 1.1 产品是什么

**小驴雷切（siyuan-speed-switch）是思源笔记的统一切换与工作上下文平台。** 一句话：一个入口切换内容，一个工作台切换现场，一个实验室切换界面。

| 表面 | 对外称呼 | 用户要完成的事 | 表面 ID | 主要入口文件 |
| --- | --- | --- | --- | --- |
| 第一面板 | **切换器** | 找到并回到内容、动作或工作现场 | `switcher` | `src/index.ts`、`src/doc-search-ui.ts`、`src/search-model.ts`、`src/mobile-switcher-ui.ts` |
| 第二面板 | **工作台** | 查看、刷新和编排信息组件（58 内置组件 + 组件商店） | `workbench` | `src/second-panel-ui.ts`、`src/home-view.js`、`src/home-model.js`、`src/home-store-ui.ts` |
| 第三面板 | **片段实验室** | 管理、编辑与安全预览 CSS/JS 片段（桌面专属） | `studio` | `src/snippet-studio-ui.js`、`src/snippet-studio-*.js` |
| 全局触发器 | **悬浮球** | 在宿主任意位置呼出平台、执行高频动作（**不是第四个表面**） | — | `src/floating-ball-ui.ts` 及其 model/layout/panel/actions/setettings-model |

### 1.2 这一轮 UI 研究要解决什么

2026-09-25 之前，三个面板各自为政：第一面板有平台雏形但第二/第三面板没有同一外壳；片段实验室有独立的 `--studio-*` 变量与独立选择器；悬浮球按 provider 分组看不出层次。**首要问题是入口、外壳与状态协议断裂，不是缺少颜色或装饰。**

研究目标（T-6866 立项，三条）：

1. **统一平台骨架**：一个外壳（平台头 / 上下文栏 / 表面体 / 回执条）+ 一套对象-动作-状态语义。
2. **保住各自的工作方式**：搜索要有键盘优先与预览密度，网格要有拖动与编辑布局，编辑器要有安全预览与 AI 审核，悬浮球要有小目标与手势分流。统一的是"骨架与交互合同"，不是把所有内容压成同一种卡片。
3. **不建立第二套视觉系统**：颜色唯一来源是宿主 `--b3-*`，插件只做作用域别名 + `color-mix` 派生。

T-6870/R2 补第二轮：把"每个面板、每个设置"做成逐屏原型，并按用户反馈重排布局（第一面板给已开页签充分位置 → 默认全屏 + 4 列大卡；第二面板给已打开组件充分位置；第三面板吸收原始开发框架：预览为主区、目录为浮层）。

### 1.3 2026-09-27 的两项工作

| 任务 | 产出 | 状态 |
| --- | --- | --- |
| T-6928 UI 设计规范 v1.0 | `docs/design-system-v1-2026-09-27.md`（事实源）、`docs/design/design-system-gallery-2026-09-27.html`（令牌+组件画廊，明暗双主题） | 完成（ADR 0084） |
| T-6929 原型五维审查 | `docs/design-review-2026-09-27.md`：38 条建议（高 11 / 中 18 / 低 9），按页面列出理由与优先级 | 完成（含 2 处待用户裁决） |
| T-6930 落地与沉淀 | 状态屏包 `docs/design/ui-states-2026-09-27.html`、规范 v1.1 修订、本手册、docs/README 地图、README 双语更新、源码交叉注释 | 本任务 |

---

## 2. 关键决策与理由（为什么长这样）

| 决策 | 记录 | 理由（一句话） |
| --- | --- | --- |
| 三个表面共享一个外壳，浮球不是第四表面 | ADR 0079、T-6866 | 统一感来自"进入/对象/状态/返回"四件事同构，不是涂同一种颜色 |
| 颜色只从 `--b3-*` 派生，禁硬编码色值 | ADR 0079、规范 §3.1 | 宿主主题与皮肤才能零成本生效；任何自有色值都会让主题失真 |
| 皮肤用"根容器作用域重定义 `--b3-*` 别名 + `data-palette`" | ADR 0073 | 换皮肤只换变量与质感层，零组件选择器改写（已在小驴打卡插件实证） |
| 三表面默认全屏 | ADR 0080 | 用户反馈要求"高频内容给足位置"；`updateSettings` 全量落盘 → 默认值只影响新装用户 |
| 悬浮球撤出侧栏端 | ADR 0072 | 侧栏空间不足以承载球体且不产生收益；旧配置仍可读（保留三面 schema） |
| 片段：CSS 沙箱预览、JS 禁执行、AI 只出待审核草稿、保存走原生 | ADR 0078 | 安全边界优先；不替宿主持久化第二份副本，不假装能预览任意 JS |
| AI 改动 = 本地摘要 + 确定性审查 + 逐 hunk 接受 | ADR 0083 | 可信度来自"检验产出"而非"相信模型"；不 vendor stylelint（包体自律） |
| 第一面板预览三类结果共享同一 `doc-preview` | ADR 0082 | 预览是同一件事的三处落点，不应有三套实现 |
| 设计规范 v1.0 为 UI 唯一事实源 | ADR 0084 | 收敛散落在设计文档/ADR/SCSS 的结论，评审有统一口径 |

**明确不做**（避免后续 Agent 好心办坏事）：不一次性重写 `src/index.ts`；不建立第二套颜色体系；不把工作台做成泛化主页；不让 JS 片段在实验室里执行；不用浏览器模拟冒充真机证据（B-004/B-005）。

---

## 3. 架构与模块划分

### 3.1 运行时分层

```text
平台外壳层  platform-surface-model.js / platform-dom.ts  —— 表面 ID、路径语义、DOM 原语（kbd/seg）
     │
领域层      搜索编排 search-model.ts / doc-search-ui.ts
            领域命令 document-actions.js favorite-actions.js recent-closed.js journal-actions.js
            动作管线 quick-action registry + executor（内建 / 思源命令 global / 第三方 provider）
            片段 snippet-studio-model / preview / ai / diff / lint
            悬浮球 floating-ball-model / layout / panel / actions
     │
宿主适配层  index.ts（桌面装配）/ mobile-switcher-ui.ts（移动）/ 侧栏分支
     │
样式层      src/index.scss → styles/_00-tokens（动效常量）+ 15 个顺序切片
            _platform-shell.scss = 平台 token 与 sw-platform-* 原语（推荐面）
```

要点：**CSS 顺序即层叠顺序**，样式只能顺序切片，不能按域名聚类；`tests/source-scan.cjs` 的 `readStyleSource()` 会把切片合成为逻辑视图，因此物理拆分对既有断言透明。

### 3.2 样式切片地图（`src/styles/`）

| 切片 | 负责 | 备注 |
| --- | --- | --- |
| `_00-tokens.scss` | 动效四档与曲线（SCSS 编译期常量） | 120/160/200/260ms；颜色/圆角/阴影走运行期 `--sw-*` |
| `_01-base-controls` `_02-settings` `_05-settings-widgets` | 基础控件、设置页布局与 visual 契约 | 设置行/组卡在这里 |
| `_03-switcher-mobile` | 切换器弹窗 + 手机端全局 | — |
| `_04-fab-fullscreen-soft` `_floating-ball-more` | 悬浮球、全屏、柔和视觉层 | — |
| `_06/_07/_08/_09` | 小组件画布、商店画廊、侧栏表单、商店预览抛光 | 工作台与商店 |
| `_10-skins` | 可选皮肤层（ADR 0073） | 变量限于插件根容器 |
| `_snippet-studio` | 片段实验室 | `--studio-*` 过渡别名，不再新增 |
| `_platform-shell` | **平台 token 与原语**（本项目推荐面） | 见 §3.3 |

### 3.3 平台 token 与原语（实现新 UI 优先用它们）

- 令牌（运行期）：`--sw-platform-accent/accent-soft/accent-pressed/bg/surface/surface-muted/surface-raised/line/text/text-muted/text-on-accent/success/warning/error/radius-sm|md|lg|pill/space-1..5/shadow-card|floating/focus/header-height`。
- 原语类：`sw-platform-shell`、`sw-platform-chrome`、`sw-platform-header*`、`sw-platform-context*`、`sw-platform-surface-nav*`、`sw-platform-status`（六态徽标）、`sw-platform-kbd`、`sw-platform-seg`、`sw-platform-action`（`--primary/--soft/--quiet/--pill/--danger`）、`sw-platform-preview*`。
- 提案层 `rz-*` 只活在原型 HTML 里，**不进生产**；实现时映射为上述 `sw-platform-*`。

### 3.4 测试与门禁分层

`pnpm test` = `node tests/run-tests.cjs`（全量自动发现，2026-09-27：**6288 项**）。类型：`*.test.cjs`（单元/模型）、`*-contract.test.cjs`（契约，含 DOM/数值断言）、`tests/host/*`（发布质量与包体审计）、`scripts/*-audit.cjs`（release/quality/integration 三审计）、冒烟四套（mobile-card / layout / chromium-style / floating-ball）。

---

## 4. 已完成工作（可直接依赖）

| 范围 | 状态 | 证据/位置 |
| --- | --- | --- |
| 平台外壳与表面导航（三表面） | ✅ | T-6866~T-6869；`src/platform-surface-model.js` |
| 平台 token 与原语组件化（RZ-1） | ✅ | T-6871；`_platform-shell.scss` |
| 设置页分组卡片 + 枚举分段化 + 行描述（RZ-2） | ✅ | T-6872（悬浮球标签 T-6782 先行） |
| 切换器细节：角标 kbd 化 / 图标容器 / 预览徽标（RZ-3） | ✅ | T-6873；预览范围收口 T-6895/T-6900/T-6901（ADR 0082） |
| 工作台编辑横幅与商店动作胶囊（RZ-4） | ✅ | T-6874；健康徽标管道 T-6874b 候补 |
| 快速捕获对话框统一（RZ-5） | ✅ | T-6875 |
| 移动端底栏与 sheet（RZ-6） | ✅ | T-6876；真机对齐修复 T-6925 |
| 片段实验室平台化 | ✅ | T-6902~T-6908（token/回执/AI 状态/五条可见能力边界） |
| AI 摘要 + 行级 diff + 确定性审查 + 逐 hunk 接受 | ✅ | ADR 0083、T-6914~T-6916、`snippet-diff.js`、`snippet-lint.js` |
| 悬浮球手势纵深（单击/双击/长按独立绑定）、工作区恢复 2.0、分屏键盘等价 | ✅ | v0.40.0（T-6919~T-6926） |
| 文档预检超时必须 abort（R12 吸收） | ✅ | T-6927 |
| UI 设计规范 v1.0 + 组件画廊 | ✅ | T-6928 / ADR 0084 |
| 原型五维审查与落实第一批（状态屏包） | ✅ | T-6929 → T-6930 |

真机验收（B-004 Android / B-005 桌面）仍为后置项，不把浏览器模拟当证据。

---

## 5. 待办清单（下一步做什么）

来源：`docs/design-review-2026-09-27.md`（完整条目含理由与优先级；该文件 §10 有落实追踪表）。

### 5.1 待用户裁决（不要擅自决定）

| 编号 | 议题 | 建议 | 影响面 |
| --- | --- | --- | --- |
| P1 | 设置页是否补第 11 个"组件面板"标签（原型有、生产 `panelKeys` 只有 10 个） | 补实现（记住面板状态/默认视图/失败重试三行，成本低） | 设置页结构与 i18n |
| S1 | 行级结果是否保留数字直达（当前与页签网格数字撞号） | 不保留；若保留需改 Alt+数字 | 切换器键盘语义与行结构简单改造 |

### 5.2 第一批：补齐缺失的异常态（优先）

已在 `docs/design/ui-states-2026-09-27.html` 给出视觉规格，实现时可分批：

- S4 切换器四态：三层全空无结果、内核断开降级、全库加载骨架、全库失败保留上层结果
- S4-4 预览 blocked（非文档页签）、100+ 页签分组折叠默认策略
- W1 空工作台（含推荐组件与商店入口）
- W2 组件失败卡（error + 内联重试 + 复制诊断；依赖 T-6874b 健康数据管道）
- L2 脏稿守卫确认对话框（默认聚焦"取消"）
- L3 JS 片段预览 blocked 态
- L6 保存冲突状态（外部版本 vs 本地草稿）
- F4 悬浮球更多面板：执行失败不关闭面板、能力不可用行
- P4 文档集恢复预览确认 / D2 配置包导入确认（任一失败零写入）
- M2 移动端：无结果、加载骨架、空收藏 sheet

### 5.3 第二批：原型对齐生产（防漂移）

G1 平台头统一关闭按钮 · G2 尺寸模式控件位置与选项集统一（工作台头部缺"固定"） · G7 切换器补回执条 · S3 过滤 chips（T-6809 已交付）进基线 · F2 悬浮球设置屏反映三手势绑定 · P2 快捷键展示统一为生产真实默认（`Alt+Shift+S`）并标注"仅展示"。

### 5.4 第三批：交互补强（随功能批捎带）

S1 数字直达语义 · P3 收藏改搜索选择器 · G3 规范补"行级主色"例外条款 · G4 kbd 提示三表面化 · G5 圆角例外收敛 · G6 徽标语义纠偏（"联网"是能力不是 loading） · W3 缓存新鲜度合并到回执 · L4 片段名称单一编辑源 · M1 移动端快捷条文案统一 · P7 设置搜索评估。

### 5.5 既有候补池（非本次产生）

皮肤首批色板渐进落地（ADR 0073，T-6796~T-6798） · 悬浮球外拨 sticky targeting（T-6785/T-6786） · C-3 反馈条目（随 v0.41.0 攒版）。

---

## 6. 后续开发的切入点

### 6.1 开始之前（读的三份 + 跑的一条）

1. 读 `docs/design-system-v1-2026-09-27.md`（令牌、界面规范、**§11 扩展性指南**：新增设置项/组件/动作/表面的 checklist）。
2. 读 `docs/design-review-2026-09-27.md`（待办条目与优先级，§9.3 待裁决项）。
3. 读对应原型：`platform-ui-redesign-r2-2026-09-26.html`（整机布局）、`design-system-gallery-2026-09-27.html`（零件与状态）、`ui-states-2026-09-27.html`（异常态）。
4. 先跑一次全量建立基线：`pnpm test`（约数十秒至两分钟，输出结尾会给出项数）。

### 6.2 每个新 UI 动作的标准姿势

① 原型/规范有构思 → ② 用既有 `sw-platform-*` 原语组装（缺 parameterized gap 才加 token，且先进规范）→ ③ i18n 双语成对加 key → ④ 契约测试 + **负向验证**（注入违规必须精确失败：目标测试失败、兄弟测试不受波及、还原后全绿）→ ⑤ 明暗主题 + reduced-motion 抽样 → ⑥ i18n/存储/包体余量复核。

### 6.3 环境命令（本机可用组合，已验证）

```bash
export PATH="/c/Users/Admin/.workbuddy/binaries/node/versions/22.22.2-3:/c/Users/Admin/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin:/c/Users/Admin/.workbuddy/binaries/PortableGit/versions/1.2.0/bin:$PATH"
cd "D:/思源插件/小驴雷切"
pnpm exec tsc --noEmit     # 类型检查
pnpm test                  # 全量（6288 项）
pnpm run build             # 产出 dist/ 与 package.zip
pnpm run verify:release    # 全链门禁（独占运行，勿并行）
node scripts/readiness-snapshot.cjs   # build 之后同步产物快照
node scripts/design-screenshots.cjs   # 原型重放截图（可选）
```

---

## 7. 注意事项与坑（踩过的代价）

1. **宿主变量是唯一颜色来源**：写死色值即使"看起来对"，也会在皮肤/暗色下失真。需要新色 → 先进规范 token，再落地。
2. **`rz-*` 不进生产**：它是原型提案层类名；生产用 `sw-platform-*` / 表面 BEM。
3. **CRLF 纪律要逐文件判定**：`src/`、`AGENTS.md`、`README*.md` 为 CRLF；`docs/dev-plan-*.md` 为 LF。插 CRLF 到 LF 文件同样是损坏；已 CRLF 文本再 `replace('\n','\r\n')` 会双重损坏且工具不可见。含反斜杠/`$'…'` 的检查写脚本落盘执行。
4. **README 与 zip 的耦合**：README 被打进 `package.zip`，改 README 必须**先 build 再同步** `docs/release-readiness.md` 的产物快照，快照不能早于最后一次构建。
5. **根目录 Markdown 受预算门禁约束**（数量 8 / 单文件 150 KiB / 合计 300 KiB，见 `tests/root-doc-budget.test.cjs`）：新文档一律放 `docs/`。
6. **慎写"只读契约 … 向后兼容 vX"字样**：`tests/protocol-compat-claim.test.cjs` 扫描 `docs/**`（排除 `docs/archive/`）并要求版本声明唯一一致、不高于当前版本；写错会红且表述会被读成对外承诺。
7. **源码扫描会剥注释**：读源码走 `tests/source-scan.cjs` 的 `readSourceText/readSourceFile`；注释不是契约，契约要落在可读扇区或断言里。
8. **包体预算**：zip 上限与余量见 `docs/release-readiness.md` 最新快照；UI 增量按批复核，超线先复核再动。
9. **i18n 与存储**：key 必须 zh-CN/en 成对加且被 src 引用（死 key 门禁）；持久化 key 总数 18（`KEY_ORDER` 字面量钉住，逐项见 `docs/storage-compatibility-matrix.md`），新增 key 按 D-401 仪式走迁移+矩阵登记。
10. **原型落后于生产是常态**：实现前用生产代码核实（例：三手势绑定、过滤 chips、设置标签数），别把原型当现状。
11. **样式只能顺序切片**：新主题域开新切片并在入口 `@use` 清单登记。
12. **提交前 `git status --short` 逐行核对**（临时脚本曾被 `git add -A` 误提交）。

---

## 8. 文档与资产地图

| 想看什么 | 去哪里 |
| --- | --- |
| 项目方向、发展计划 | `ROADMAP.md`；阻塞见 `BLOCKERS.md` |
| 当期任务账本 | `docs/dev-plan-2026-09-22.md`（最新）；更早见 09-18/09-19 |
| 决策记录 | `docs/adr/`（最新 0084） |
| UI 规范（实现依据） | `docs/design-system-v1-2026-09-27.md` |
| UI 待办与优先级 | `docs/design-review-2026-09-27.md` |
| 交接手册（本文） | `docs/ui-handbook-2026-09-27.md` |
| docs 目录导航 | `docs/README.md` |
| 令牌/组件画廊 | `docs/design/design-system-gallery-2026-09-27.html` |
| 三表面逐屏原型 | `docs/design/platform-ui-redesign-r2-2026-09-26.html`（+ R1 26 屏 `platform-ui-redesign-2026-09-26.html`） |
| 异常与边界状态屏 | `docs/design/ui-states-2026-09-27.html` |
| 皮肤四版原型 | `docs/design/skin-prototypes.html` / `.png` |
| 悬浮球专项规格 | `docs/floating-ball-ui-spec.md` |
| 发布就绪快照 | `docs/release-readiness.md` |

## 9. 大库性能三模式（T-6977，2026-09-30；新列表型组件与改造必须遵循）

来源：T-6977（竞品 sidebar-hub 调研吸收）。三条模式是**大库（100+ 页签 / 千级文档）场景下列表型组件的规范条款**，与 §7 注意事项同效力：新增或改造组件时逐条对照，缺失即审计缺口。

### 9.1 异步计数补齐（列表先出，计数后到）

- **现状锚点**：有界聚合与 `truncated` 传导已在册（T-6478：SQL 外层 LIMIT + 截断标记；笔记统计/数据库组件沿用）。
- **规范条款**：需要额外查询的计数（总量、未读数、跨笔记本统计）**不得阻塞列表首屏渲染**——列表先出；计数请求未返回前以「…」占位并明确**不等于零**（视觉占位 `…`、读屏 aria-label 带「计数未确认」字样）；返回后原位补齐，失败显示「未知」而非 0。禁止：先查计数再渲染列表；用 0 冒充未确认。
- **验收要点**：大库夹具下列表首帧不含计数；计数到达前后列表滚动位置与焦点不变；计数失败显示「未知」；明暗主题与读屏语义同步。

### 9.2 虚拟滚动预案（上限放宽前的前置工程）

- **现状锚点**：当前策略 = 条目硬上限封顶（列表流首屏 ≤5 / L 档 ≤8，SQL 侧 LIMIT 200 级有界），无虚拟化——上限内直接渲染是**既定选择**，不是欠账。
- **规范条款**：当某组件需要把可见条目放宽到 100+ 时，**必须先落虚拟化方案再放宽**：窗口化渲染（仅可视区±缓冲挂 DOM）、固定行高或可测高度、滚动位置锚定；并交付验收证据——滚动帧预算基准、焦点保持、T-7010/T-7009 重绘现场事务在虚拟化下不丢选中卡。竞品虚拟视口的递归重渲染缺陷是前车之鉴：**虚拟化必须带验收证据，禁止裸放上限**。
- **验收要点**：1000 条夹具滚动帧预算达标；快速滚动无空白闪烁；键盘导航与焦点恢复通过；异步重绘后视口锚定（T-6825 语义）不回跳。

### 9.3 刷新期列表保持可见 + 行级局部更新

- **现状锚点**：框架级「失败保留旧值快照」、时钟行级局部补丁（T-6935）、卡片更新徽标局部刷新（refreshCardUpdatedBadges）、健康详情行级 busy（T-7011）均已在册。
- **规范条款**：刷新期间**旧内容保持可见**（不清空、不闪骨架屏遮挡全部内容——首屏骨架仅服务首次加载）；刷新完成只更新**发生变化的行**（行级局部更新），未变化行不动（避免图标/缩略图重载闪动）；失败保留旧值并按既有语义标注（stale/失败 chip），不弹全局错误遮断列表。
- **验收要点**：刷新期间旧列表可见且可滚动；完成后仅变化行发生 DOM 变动；失败路径旧值保留 + 标注；行级 busy 态防重复触发（T-7011 语义）。
