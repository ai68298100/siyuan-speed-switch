# ADR 0048：移动端切换器 UI 群外迁（P1-1a）

- 日期：2026-09-17
- 状态：已接受（T-6291）
- 范围：`src/index.ts` → 新增 `src/mobile-switcher-ui.ts`

## 背景

`index.ts` 在六轮重构（R1~R6、R5a/R5b）后仍有 9226 行、380 个成员。规划文档 P1-1 建议把
「端侧界面装配」整体外迁。本次勘察（`this.*` 依赖面）改写了执行顺序：

| 群 | 字段依赖 | 判定 |
|---|---|---|
| `openSecondPanel` (602 行) | **9 个**，含 `homeRuntime`/`homePanelSnapshots`/`homeModuleOpens` 等 Loaf-cycle 状态 | 与当年迫使 R5 先拆状态宿主的搜索群同型，**不先做** |
| 移动端切换器群 (525 行) | 每个方法仅 1~3 个，多为 `i18n` | 本批最干净的外迁靶点，**先行** |

即：**先搬依赖面最浅的群，把 9 字段的深耦合留给单独的「状态宿主」批次。**

## 决定

按 R5b（D-383）既定范式搬移 4 个成员共 525 行，方法体字节原样：

- `openMobileSwitcherDialog` (161)、`bindMobileSwitcherToolbarActions` (176)、
  `renderMobileList` (109)、`openMobileGroupActions` (79)
- `this` 参数模式 + `MobileSwitcherUiHost` 接口；群内互调改模块内 `.call(this, ...)`，
  留宿主的成员保持 `this.xxx`；`index.ts` 的 4 处外部调用点改 `method.call(this, ...)`。
- 类型 beta：`ITabGroupRenderCtx`、`IGroupedTab` 补 `export`（类型层，运行时擦除）。
- `index.ts` 9226 → 8701 行（-525）。

## 搬移中发现的真实缺陷

**同名局部闭包导致无限自递归。** `renderMobileSwitcherList` 内存在
`const renderMobileList = () => { this.renderMobileList(...) }`。机械替换
`this.X(` → `X.call(this, ` 之后，该调用落到**局部常量自身**而非迁出的方法上，
运行时将立即爆栈——且 TypeScript **完全不会报错**（局部闭包类型自洽）。

处置：局部闭包改名 `refreshMobileList`，对外返回对象的属性名
`renderMobileList` 保持不变，行为零漂移。

**教训：`.call(this, ...)` 的机械替换在同作用域存在同名绑定时是静默致命的。**
后续任何采用本范式的批次，搬移脚本必须做「影子绑定」扫描，且不能只依赖 `tsc`。

## 契约同步

契约同步分三轮才收干净（教训：`includes('..')` 之外还有**双引号字符串**与
**`match` 计数式**断言，自动化脚本按单一形式扫描必然漏）：

1. 单元/契约层 4 处：`updateSortButton` 签名、`cancel.textContent` 文案、
   `event.key !== "Escape"`、生产依赖图天花板按惯例上调（闭包 44 → 45）。
2. `mobile-card-smoke.cjs` 全量重分配：仅把「index.ts 中已不存在、新模块中存在」的
   模式改指新模块，计 5 条；**保留在 index.ts 的 144 条一律不动**，避免削弱既有锚点。
3. 同上补两条特殊形式：双引号书写的 `sortButton.innerHTML`；以及
   `this.bindSearchInputComposition(searchInput` 的三端计数式断言改为**两源合计**，
   实测合计仍为 3（覆盖要求未降低）。

改指前均先在新模块中验证目标模式确实存在——拒绝搬错文件后留下假绿。

## 验证

- `tsc --noEmit` 0 错误；全量测试 5872/5872；移动端 smoke 70/70；
  `verify:release`（含 layout / Chromium smoke）全链绿。
- 负向验证四例全 PASS（每条契约还原旧指向 → 精确 1 项失败、同文件其余用例不波及、
  md5 字节级还原）：证明本次改指是**承重的**，没有把门禁改瞎。
- 收尾固定动作已执行：产物快照同步（README 双语 + release-readiness）
  `index.js 631610→631453`、`package.zip 318095→321072`，测试项数 5827→5872。

## 未完成

`openSecondPanel`（602 行）**未动**。它需先拆出 home 运行时状态宿主，或先补
第二面板渲染契约测试——二者择一后才可立项（沿用 ADR/R5 的裁定口径）。
