# ADR 0231：T-7339 次级动作画板键盘导航状态机

日期：2026-10-19  
状态：accepted

## 背景

T-7335 已完成次级动作画板纯领域模型（条目上下文/可用动作/过滤与执行回执，ADR 0227），但 T-7335 自身的 dev-plan 条目明确写道："UI 装配与键盘导航归后续生产接线任务"。ROADMAP 2026-10-19 前瞻演进第 2 条同时强调 Raycast / Alfred 式次级动作画板的**键盘流与状态机**是用户感知最强烈的体验关键。

目前切换器的搜索面板与已有右键菜单是两条独立路径，动作画板如不建立独立的键盘交互状态机，要么会与现有 `Tab` / `⌘+K` 快捷键冲突，要么会把 `keydown` 副作用泄漏进搜索框输入流。

## 决策

1. **新建纯函数式键盘导航状态机** `src/action-palette-navigation.js`：
   - 状态对象 `createPaletteNavigationState`：持有 `isOpen` / `query` / `allActions` / `filteredActions` / `selectedIndex` / `targetContext` 六个字段；
   - 查询更新 `updatePaletteQuery`：复用 T-7335 `filterPaletteActions`，查询变化时强制重置光标到 0 或 -1（空集）；
   - 循环滚动光标 `movePaletteSelection`：支持 wrap-around（首项上移 → 末项，末项下移 → 首项），空动作列表保底返回 -1；
   - 核心调度 `dispatchPaletteKey` 把标准化的 `event = { key, ctrlKey, metaKey, shiftKey, altKey }` 转为确定性的 `intent`（`noop` / `toggle` / `close` / `navigate` / `execute`）。
2. **快捷键语义严格遵守 Raycast / Alfred 约定**：
   - 唤出 / 收起：`Tab` 或 `⌘+K` / `⌃+K`；
   - 关闭画板：`Escape` 或画板打开时的 `Tab`；
   - 向下：`ArrowDown` 或 `⌃+N`；
   - 向上：`ArrowUp` 或 `⌃+P` 或 `Shift+Tab`；
   - 执行：`Enter`。
3. **隔离副作用边界**：
   - 画板未打开时，`dispatchPaletteKey` 对其余方向键、字母键等一律返回 `noop`，不拦截全局 keydown；
   - 非法 / `null` 事件必须安全返回 noop；
   - 空动作列表按 `Enter` 不触发 `EXECUTE`，光标保持在 -1；
   - 状态机只读不修改外部状态，所有更新通过返回值（新对象）传递。
4. **复用既有导出**：`src/search-model.js` 统一再导出 `PALETTE_KEY_ACTIONS` / `createPaletteNavigationState` / `updatePaletteQuery` / `movePaletteSelection` / `dispatchPaletteKey`，保持搜索架构单点入口约定。
5. **生产图闭包上限 82 → 83**：实测 83，按同口径校准（先例 T-6814/T-6950/T-7260/T-7334~T-7338）。

## 证据与边界

- **类型与全量测试**：`pnpm exec tsc --noEmit` 0 错误；全量测试从 8892 项扩充至 **8898 通过 / 1 跳过 / 0 失败**（新增 6 项 action-palette-navigation 契约）。
- **负向注入验证**（按 `docs/gate-audit-checklist.md`）：
  - 空动作按下 Enter 仍触发 `EXECUTE`（注入代码实测） → 探针 2 定向失败并复绿 ✅
- **构建与包体**：生产构建 `package.zip` 为 **595,653 B**，稳定处于 582 KiB（595,968 B）仓库门禁之内（健康余量 **315 B**）；`dist/index.js` 为 1,180,651 B（低于 1,187,840 B 预算线 7,189 B）；压缩条目 317,497 B（低于 327,680 B 门禁 10,183 B）。
- **批量门禁全绿**：可复现构建 3/3 一致；四大批量门禁 49/49、50/50、50/50、175 tasks 全部通过；六套浏览器 Smoke 全部复绿；`git diff --check` 通过。
- **边界声明**：本决策交付**纯函数式键盘交互状态机与意图契约**，不改动远端 Release、Git Tag 或包版本号。UI 装配（弹层渲染、快捷键全局监听、键盘焦点环）与真实宿主执行归后续生产接线任务。
