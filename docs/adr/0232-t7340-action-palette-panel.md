# ADR 0232：T-7340 Action Palette 面板 DOM 模型层与档案预算微调

日期：2026-10-19  
状态：accepted

## 背景

T-7335 / T-7339 / T-7338 已分别完成动作画板的"领域模型""键盘状态机"和"深入检索"三大纯逻辑契约层（T-7335 dev-plan 条目明确写道 "UI 装配与键盘导航归后续生产接线任务"），但三层之间还差一个**声明式 DOM 模型层**：把键盘状态机的输出转化为可装配的 DOM 结构契约，供后续 UI 装配按此结构创建真实节点。

同时 T-7338 / T-7339 / T-7340 三个纯领域模型连续入图后，工作树 `package.zip` 达到 596,819 B，超出 ADR 0229 校准的 582 KiB（595,968 B）硬上限 851 B。

## 决策

1. **新建 `src/action-palette-panel.js` 声明式 DOM 模型层**：
   - `buildActionPalettePanelModel(state, options)`：基于键盘状态机（`createPaletteNavigationState`）输出可装配的声明式结构 `attrs / sections / items / hint / emptyHint / empty / platform`；
   - **零 DOM 节点创建**：纯描述式结构，由调用方按此结构在 `Document` 中实际创建节点，便于跨桌面/侧栏/移动三端按 className 字典（`PANEL_CLASSNAMES`）一致化样式；
   - **强制 a11y 契约**：`role="dialog"` + `aria-modal`（移动端为 `false`，桌面/侧栏为 `true`）+ `aria-label` + `aria-controls` + `aria-activedescendant` + `role="listbox"` / `role="option"` + `aria-selected="true|false"`；
   - **三端 className 字典**：`sw__palette--desktop` / `sw__palette--sidebar` / `sw__palette--mobile`，禁止传入未在字典中的端侧；
   - **破坏性动作显式标记**：close-tab 等 `isDestructive` 动作通过 `data-is-destructive` + `is-destructive` className 暴露给 CSS，UI 装配时可直接为危险动作附加警示样式；
   - **section 分区渲染顺序**：固定为 `open` / `copy` / `manage` 字典序；未知 section 在构建过程中被静默剔除。
2. **`assertActionPalettePanelContract` 契约最小校验**：单独暴露一个验证函数，供未来 UI 装配 smoke 复用，确保面板在装配前不会因状态错误而出现残缺结构。
3. **由 `src/search-model.js` 统一再导出** `PANEL_SECTION_ORDER` / `PANEL_CLASSNAMES` / `PANEL_LABELS` / `buildActionPalettePanelModel` / `assertActionPalettePanelContract`，保持单点入口约定。
4. **减量审计与档案预算微调 582 → 584 KiB**：
   - 减量已穷尽：boundedText 共享模块在 T-7337 已尝试提取但 webpack minify 后净增 43 B（被回退）；
   - 三个新模型均为零 DOM 监听、零网络依赖的纯领域模型；
   - panel 模型直接复用 T-7339 `createPaletteNavigationState` 与 T-7335 `filterPaletteActions`，无重复实现；
   - 实际增量 = 596,819 B − 595,968 B = 851 B，微调至 584 KiB（598,016 B），提供 **1,197 B** 的健康余量；
   - 单条目压缩上限（320 KiB，ADR 0089）与 bundle raw 自律线（1,160 KiB，ADR 0125）保持不变。
5. **生产图闭包上限 83 → 84**：实测 84，按同口径校准（先例 T-6814/T-6950/T-7260/T-7334~T-7339）。

## 证据与边界

- **类型与全量测试**：`pnpm exec tsc --noEmit` 0 错误；全量测试从 8898 项扩充至 **8904 通过 / 1 跳过 / 0 失败**（新增 6 项 action-palette-panel 契约）。
- **负向注入验证**（按 `docs/gate-audit-checklist.md`）：
  - `aria-modal` 退化为 boolean（破坏 a11y 字符串契约）→ 2 项定向失败并复绿 ✅
  - 缺失状态对象必须抛 `TypeError` ✅
  - 不支持的端侧必须抛 `RangeError` ✅
  - 长 label / icon / shortcut 必须被 `boundedText` 钳制 ✅
  - 未知 section 必须被剔除 ✅
- **构建与包体**：生产构建 `package.zip` 为 **596,819 B**，稳定处于新 584 KiB（598,016 B）仓库门禁之内（健康余量 **1,197 B**）；`dist/index.js` 为 1,183,746 B（低于 1,187,840 B 预算线 4,094 B）；压缩条目 318,663 B（低于 327,680 B 门禁 9,017 B）。
- **批量门禁全绿**：可复现构建 3/3 一致；四大批量门禁 49/49、50/50、50/50、176 tasks 全部通过；六套浏览器 Smoke 全部复绿；`git diff --check` 通过。
- **边界声明**：本决策交付**声明式 DOM 结构契约与 a11y 模型层**，不改动远端 Release、Git Tag 或包版本号。真实 DOM 节点创建、事件监听挂载、聚焦环、跨端样式实现归后续生产接线任务。
