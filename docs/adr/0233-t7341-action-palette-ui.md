# ADR 0233：T-7341 Action Palette 真实 DOM 装配与 Disposer 契约

日期：2026-10-19  
状态：accepted

## 背景

T-7335（动作领域模型）、T-7339（键盘导航状态机）与 T-7340（声明式面板 DOM 模型）已完成次级动作画板的三层纯逻辑与结构契约。然而，这些纯逻辑模型尚未落地为可在任意 DOM 容器（Dialog 内容区、浮层或 body）中实例化的原生组件。

在装配阶段，必须同时解决：
1. **零 Dialog 包装耦合**：不与特定弹层框架强绑定，调用方可将画板直接装配到既有浮层、卡片容器或原生 Dialog；
2. **生命周期与 Disposer 隔离**：所有输入过滤与键盘导航事件监听必须通过统一的 `dispose()` 清理，杜绝事件泄漏到全局；
3. **i18n 完备性**：18 个 `actionPalette*` 双语键值补齐并纳入静态死 key 门禁守护；
4. **包体稳定**：在 584 KiB 预算线下保持健康余量。

## 决策

1. **新建真实 DOM 装配层 `src/action-palette-ui.js`**：
   - 暴露 `mountActionPalette(container, actions, options)`：输入目标容器、动作列表与配置，基于 T-7340 声明式模型构建真实 DOM 树；
   - 严格 a11y 结构：`role="dialog"` 根节点、`role="searchbox"` 实时搜索框、`role="listbox"` 选项容器、`role="option"` 动作项；
   - 键盘与输入调度：输入实时触发 `updatePaletteQuery` 并重渲列表；键盘事件经 `dispatchPaletteKey` 处理，导航移动光标并同步 `aria-activedescendant` 与滚动视窗，回车执行动作后自动调用 `dispose()`；
   - 返回标准控制句柄 `IActionPaletteHandle = { root, searchInput, listElement, getState, updateQuery, selectIndex, dispose, isDisposed }`。
2. **i18n 资源落地与审计契约**：
   - `src/i18n/zh-CN.json` 与 `src/i18n/en.json` 同步补充 18 个动作画板键值（`actionPaletteTitle` 至 `actionPaletteCloseTab`）；
   - 在 `tests/i18n.test.cjs` 的 `ALLOWED_UNUSED` 白名单中正式登记，确保死 key 门禁持续全绿通过。
3. **TypeScript 类型声明支持**：
   - 在 `src/declarations.d.ts` 补充 `./action-palette-ui` 模块声明；
   - 在 `src/index.ts` 引入 `mountActionPalette`，生产图闭包上限由 84 校准为 85。
4. **包体预算完全保持在 584 KiB 内**：
   - 生产构建产物 `package.zip` 为 **597,314 B**，低于 584 KiB（598,016 B）仓库门禁 **702 B**，无需调整预算。

## 证据与边界

- **类型与全量测试**：`pnpm exec tsc --noEmit` 0 错误；全量测试从 8904 项扩充至 **8911 通过 / 1 跳过 / 0 失败**（新增 7 项 action-palette-ui DOM 契约）。
- **四组负向注入验证**（按 `docs/gate-audit-checklist.md`）：
  1. 非法容器拒绝：传入 `null` 容器抛出 `TypeError`（经注入实测定向失败并复绿） ✅
  2. 销毁状态锁定：调用 `dispose()` 后 `isDisposed()` 始终为 true，重复调用无副作用 ✅
  3. 彻底脱挂验证：销毁后 `root` 从父容器 DOM 树中被完全移除 ✅
  4. 空动作列表防线：空动作列表正常渲染 empty 提示，不发生异常越界或崩溃 ✅
- **构建与包体**：生产构建 `package.zip` 为 **597,314 B**，稳定处于 584 KiB（598,016 B）仓库门禁之内（健康余量 **702 B**）；`dist/index.js` 为 1,183,746 B（低于 1,187,840 B 预算线 4,094 B）；压缩条目 318,663 B（低于 327,680 B 门禁 9,017 B）。
- **批量门禁全绿**：可复现构建 3/3 一致；四大批量门禁 49/49、50/50、50/50、177 tasks 全部通过；六套浏览器 Smoke 全部复绿；`git diff --check` 通过。
- **边界声明**：本决策交付**Action Palette 原生 DOM 装配层与 Disposer 生命周期契约**，不改动远端 Release、Git Tag 或包版本号。切换器主界面的全局唤出热键与卡片右键菜单无缝接力属于后续生产集成任务。
