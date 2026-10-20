# ADR 0246：T-7353 主界面快捷键免呼出直达执行次级动作

日期：2026-10-20  
状态：accepted  
任务：T-7353  

## 背景

T-7344 为切换器卡片提供了 `⌘K` / `Ctrl+K` 呼出次级动作画板（Action Palette）的能力。然而，对于熟练使用键盘的高频用户，每次分屏、复制链接或置顶收藏都需要先按 `⌘K` 呼出画板、再搜索或选择动作、再回车执行，存在额外的交互步骤（两级操作成本）。

借鉴 Raycast 与 VS Code 的动作快捷设计，高频动作应当允许在卡片聚焦时通过特定修饰键组合**“单键直达”**，无需展开画板即可瞬间执行。

## 决策

1. **建立卡片级免呼出快捷键调度体系（`src/index.ts / buildCardItem`）**：
   - 监听聚焦卡片上的键盘事件，为高频操作绑定专属单键直达组合：
     - `Ctrl+Enter` / `⌘Enter` $\to$ 执行 `open-right`（右侧分屏打开）；
     - `Alt+Enter` / `⌥Enter` $\to$ 执行 `open-bottom`（下方分屏打开）；
     - `Alt+C` / `⌥C` $\to$ 执行 `copy-block-link`（复制思源块链接）；
     - `Alt+M` / `⌥M` $\to$ 执行 `copy-markdown-link`（复制 Markdown 格式链接）；
     - `Alt+P` / `⌥P` $\to$ 执行 `toggle-pin`（切换当前卡片置顶）；
     - `Alt+D` / `⌥D` $\to$ 执行 `toggle-fav`（切换当前卡片收藏）；
2. **复用统一调度管线 `executePaletteAction`**：
   - 单键直达动作与画板选择动作调用完全相同的 `executePaletteAction` 执行器；
   - 保证关闭弹窗、气泡提示、写剪贴板或分屏打开的逻辑单一事实源，零重复实现；
3. **修饰键隔离与防冲突**：
   - 严格判定 `isCtrlOrCmd` 与 `event.altKey`，避免普通按键被误拦截；
   - 触发时调用 `preventDefault()` 与 `stopPropagation()`，杜绝事件冒泡至思源宿主。

## 证据与验证

1. **定向测试**：`tests/highlight-and-direct-shortcut-contract.test.cjs` 包含对所有 6 组单键直达快捷键绑定的静态与行为断言并通过；
2. **负向注入验证**：伪造不存在的快捷键分支进行负向探测，断言精准失败；
3. **全量通过**：`pnpm exec tsc --noEmit` 0 错误。
