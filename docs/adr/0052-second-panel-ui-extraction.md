# ADR 0052：第二面板 UI 外迁（P1-1b）

- 日期：2026-09-17
- 状态：已接受（T-6295）
- 范围：`src/index.ts` → 新增 `src/second-panel-ui.ts`；`index.ts` 8702 → 8104 行（-598）

## 背景

ADR 0048 将 `openSecondPanel`（601 行体）列为"未完成"：其 `this.*` 依赖面达
9 个 home 运行时状态字段（`homeRuntime`/`homePanelSnapshots`/`homeModuleOpens` 等），
与当年迫使 R5 先拆状态宿主的搜索群同型，裁定"先拆状态宿主或先补渲染契约测试，二者择一后才可立项"。

本批重新评估后**改判**：先补状态宿主会把 9 个字段连同其写入方（约 11 个方法）一起卷入
一次超大批次，风险高于收益；而 `openSecondPanel` 是**纯读**这些字段的单入口装配方法，
无自递归、外部调用点仅 4 处——`this` 参数模式的宽宿主接口（Host 接口声明全部依赖）
即可零漂移搬移，状态宿主是否立项留待真实需求出现再判。

## 决定

- `openSecondPanel` 按 R5b/ADR 0048 范式搬为
  `export function openSecondPanel(this: SecondPanelUiHost)`；**方法体 599 行换行归一后
  逐行完全相等**（自证脚本双源提取 + 括号深度定位 + md5 对比），仅含 2 处授权替换。
- 宿主接口 `SecondPanelUiHost`：9 个状态字段 + `i18n`/`isMobile` + 11 个方法签名，
  全部由勘察实证（20 处 `this.` 成员逐一归位），不做"顺手"增删。
- **类静态成员障碍**：体内 2 处 `SpeedSwitchPlugin.HOME_ACCENTS` 在 `this` 参数函数中
  不可达（`private static` 不经实例）。不改 constants（constants.test.cjs 锁定）、
  不搬常量本体，而是 `index.ts` 加转发字段
  `private readonly homeAccents = SpeedSwitchPlugin.HOME_ACCENTS;`，体内替换为
  `this.homeAccents`——替换处数 2，由自证脚本断言。
- 类型修正：宿主接口 `eventBus: EventBus`（`TEventBus` 是事件名联合
  `keyof IEventBusMap`，不是总线对象）。
- `index.ts` 4 处调用点 `this.openSecondPanel();` → `openSecondPanel.call(this);`；
  import 置于 mobile-switcher-ui 之后。

## 契约同步

按 ADR 0048 教训执行：先勘察全部 17 个读取 index.ts 的测试文件，再逐条验证
"模式在新模块存在且在 index.ts 残部不存在"才改指——**零个人工裁定项，每条改指均有实证**。
改指面：`store-mobile-layout-contract`（23 锚点）、`home-store-contract`（5）、
`store-preview-lifecycle-contract`（1）、`mobile-card-smoke`（17）、
`external-widget-model`（2 个时钟块）、`home-store-guide`（单列块）、
`host/release-quality`（尾部读取块）、`insight-widgets`（日历钳制断言）、
`production-graph-isolation`（模块清单 + `'second-panel-ui'`，天花板 45 → 46）。
保留在 index.ts 的既有锚点一律不动。

## 验证

- `tsc --noEmit` 0 错误；全量 5879/5879。
- 负向抽样两组全 PASS（每例：还原旧指向 → **精确**失败数与改指锚点数一致、
  同文件其余用例不波及、md5 字节级还原、复跑全绿）：
  - `store-mobile-layout-contract`：23 FAIL / 640 pass（恰等于 23 个改指锚点）；
  - `external-widget-model`：2 FAIL（恰为两个时钟块用例）/ 933 pass。
- `verify:release` 全链绿（tsc → build → test → 三套 smoke）。
- 产物快照同步（记在最后一次构建之后）：`dist/index.js` 631453 → **631445**（-8，
  拆分后 webpack 输出变化）、`package.zip` 321070 → **320546**、`index.css` 145577 不变；
  双语 README + release-readiness 三处对齐，余量数字同步重算。

## 教训

- **自证脚本也会骗人**：第一版自证用 `max(i for … == "}")` 反向找闭合行，
  在 CRLF `newline=""` + `split("\n")` 口径下切片错位，报出"搬移体 1 行 / 空 md5"的
  伪失败——与 P0-2 负向验证脚本的 `for … fails in results` 影子绑定同族。
  修正为自签名行 `{` 起的正向括号深度计数后，逐字节比对通过。
  → **凡涉及多行切片的验证脚本，切片方式本身要有第二信源（行数/md5 双断言）。**
- Git Bash heredoc 会吃掉正则里的 `\)`（`/tmp` 路径转换同一族问题）：
  注入/对比脚本里的正则尽量退化为字符串 `find`，或落盘执行而非 heredoc。
