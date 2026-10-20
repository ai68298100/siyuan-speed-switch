# ADR 0239：T-7346 窄侧栏自适应、对外文档与多语言对账

日期：2026-10-20  
状态：accepted  
任务：T-7346  

## 背景

随着 T-7334～T-7345 连续交付路径缩写打分、次级动作画板（模型/状态机/DOM/UI装配/主接线）与深入穿透检索（语法/编排/端点/锚定），新功能在桌面主窗与移动端已具备完整交互链路。然而在生产收口阶段，仍需解决以下边缘自适应与文档对账事项：
1. **极限窄宽侧栏（Dock 表面 245px～340px）自适应**：
   - 切换器在侧边栏 Dock 极窄宽度下挂载动作画板或穿透检索结果时，长标签与快捷键徽标可能因为 flex 默认最小尺寸限制产生横向滚动条或布局折叠溢出；
   - 必须通过 CSS 弹性收缩声明（`min-width: 0`、`flex-shrink: 0` 与 `text-overflow: ellipsis`）提供数学确定性防溢出保障；
2. **对外中英文文档对账（README & CHANGELOG）**：
   - `README.md` 与 `README.en-US.md` 缺少深入穿透检索语法（`:大纲`、`文档:大纲`、`^正文块`）与次级动作画板（`⌘K` / `Ctrl+K`）的说明；
   - 快捷键速查表缺少 `⌘K` / `Ctrl+K` 键位定义；
   - `docs/CHANGELOG.md` 与 `docs/CHANGELOG.en-US.md` 需同步记录开发增量；
3. **i18n 完整性与死 key 零泄漏**：
   - 必须确保 `src/i18n/zh-CN.json` 与 `src/i18n/en.json` 的 key 集合 1:1 对齐，所有 18 个动作画板键值合法消费或在保留列表中受控白名单覆盖。

## 决策

1. **窄容器弹性防溢出加固（`_11-ui-polish.scss`）**：
   - `.sw__palette-item-label` 显式增加 `min-width: 0;`，重置 flex 容器默认 `min-width: auto` 造成的文本无法收缩截断缺陷；
   - `.sw__palette-item-shortcut` 显式增加 `flex-shrink: 0;`，确保在 245px 极限窄宽下按键提示徽标保持紧凑不被压缩变形；
2. **中英文 README 与 CHANGELOG 完备同步**：
   - 中英文 README 的分层卡片搜索章节增补 Obsidian 风格深入穿透检索语法说明；
   - 工作上下文与命令章节增补 Raycast 风格次级动作画板说明；
   - 快捷键表格增加 `⌘K` / `Ctrl+K` 唤出动作画板定义；
   - 中英文 CHANGELOG 同步登记当前阶段开发增量；
3. **契约测试守护（`tests/narrow-sidebar-action-palette-contract.test.cjs`）**：
   - 4 项自动化契约断言，并在 245px 真实 DOM 容器中实例化挂载验证结构与防溢出样式；
   - 内置负向探针覆盖缺失语法断言或缺失样式声明时的确定性拦截；
4. **包体预算复核**：
   - README 增补微量文字说明后，`package.zip` 仍稳定处于 590 KiB（604,160 B）门限之内。

## 证据与验证

1. **定向契约测试**：`node tests/narrow-sidebar-action-palette-contract.test.cjs` 4/4 通过（含负向注入验证）；
2. **多语言与死 key 测试**：`node tests/i18n.test.cjs` 11/11 通过；
3. **TypeScript 编译检查**：`pnpm exec tsc --noEmit` 0 错误；
4. **批量审计门禁**：`quality-batch-audit`（50/50）、`integration-boundary-audit`（50/50）、`release-batch-audit`（49/49）与 `current-status-audit` 全绿；
5. **UI 冒烟**：`mobile-card-smoke`、`mobile-toolbar-layout`、`chromium-style-smoke`、`floating-ball-browser-smoke` 与 `surface-switch-browser-smoke` 全绿。
