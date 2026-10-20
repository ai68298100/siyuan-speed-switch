# ADR 0240：T-7347 版本就绪审查与全表面交互验收

日期：2026-10-20  
状态：accepted  
任务：T-7347  

## 背景

自基线版本 `v0.47.6` 发布以来，小驴雷切在主分支上自驱推进并完成了累计 13 项核心特性的研制与契约落地：
1. **T-7334**：路径首字母缩写打分与模糊匹配排序（`path-acronym-model.js`，ADR 0226）；
2. **T-7335**：Raycast 式次级动作画板领域模型（`action-palette-model.js`，ADR 0227）；
3. **T-7336**：思源原生属性视图（AV）轻量只读看板模型（`av-board-model.js`，ADR 0228）；
4. **T-7337**：闪卡复习与 SM-2 间隔重复推演模型（`flashcard-review-model.js`，ADR 0229）；
5. **T-7338**：Obsidian 风格深入穿透检索语法模型（`penetration-search-model.js`，ADR 0230）；
6. **T-7339**：动作画板键盘导航与循环状态机（`action-palette-navigation.js`，ADR 0231）；
7. **T-7340**：动作画板声明式面板 DOM 模型与 a11y 契约（`action-palette-panel.js`，ADR 0232）；
8. **T-7341**：动作画板真实 DOM 装配层与 Disposer 生命周期（`action-palette-ui.js`，ADR 0233）；
9. **T-7342**：深入穿透检索运行时编排与防注入安全 SQL（`penetration-search-orchestration.js`，ADR 0234）；
10. **T-7343**：深入穿透检索运行时管线接入与去重锚定修正（`doc-search-ui.ts` / `search-model.js`，ADR 0236）；
11. **T-7344**：动作画板挂载至切换器主 UI 与执行管线闭环（`index.ts` / `_11-ui-polish.scss`，ADR 0237）；
12. **T-7345**：动作画板与穿透检索多端端到端交互契约断言（`tests/action-palette-e2e-interaction.test.cjs`，ADR 0238）；
13. **T-7346**：极限窄侧栏自适应防溢出与中英文文档对账（`_11-ui-polish.scss` / `README.md` / `README.en-US.md` / `CHANGELOG.md` / `CHANGELOG.en-US.md`，ADR 0239）。

在进入版本发布筹备或下一阶段深度扩展前，必须对全表面交付资产、接口聚合度、多端交互状态及包体预算进行系统审查与契约固化。

## 决策

1. **核心交付物物理完整性与统一门面聚合审计**：
   - 9 个纯领域与装配源码模块全部完备存在，无外部破坏性依赖；
   - 13 个独立契约测试套件全部完备存在且可独立高速运行；
   - `src/search-model.js` 统一聚合导出穿透检索与动作画板的全部 17 个关键接口函数。
2. **三表面与全局悬浮球多端连贯性核验**：
   - **第一面板（切换器）**：支持 `:标题`、`文档名:标题`、`^正文块` 深入穿透检索，支持右键菜单与 `⌘K` / `Ctrl+K` 唤出动作画板，支持分屏打开（`open-right` / `open-bottom`）、预览、关闭与块链接精准复制；
   - **第二面板（工作台）**：支持原生属性视图轻量看板与闪卡复习模型，默认 7 核心卡片紧凑排版，支持健康回执与内联重试；
   - **第三面板（片段实验室）**：支持 3 模式增量导入（Merge / Fork / Overwrite）、Stylus UserCSS 导出、CSS 沙箱与 JS 禁执行安全规则；
   - **全局悬浮球**：支持单击/双击/长按/四向快滑自由绑定与任意停放，防误触手势隔离；
   - **端侧适配**：桌面主窗、窄侧栏 Dock（245px～340px，具备 `min-width: 0` 弹性收缩）与移动端（自适应底部抽屉，44px WCAG 触控靶心）表现稳定。
3. **固化包体预算与生产指标**：
   - `dist/index.js` 为 1,196,626 B（在 1170 KiB 自律线内，健康余量 1,454 B）；
   - `package.zip` 为 602,668 B（在 590 KiB 仓库门禁内，健康余量 1,492 B）；
   - 压缩条目为 322,530 B（低于 320 KiB 门禁 5,150 B）；
   - 生产图闭包稳定于 86 模块；
   - 全量自动化测试套件扩充至 **8935 项全部通过**。
4. **新建审查契约门禁（`tests/release-readiness-batch-review.test.cjs`）**：
   - 自动化断言交付模块存在性、统一门面导出函数、预算上限及负向探针防线。

## 证据与验证

1. **定向测试**：`node tests/release-readiness-batch-review.test.cjs` 4/4 通过；
2. **负向注入验证**：
   - 注入违规导出名 `extractActionContext_BROKEN` $\to$ 用例 2 精确拦截报错（pass 3 / fail 1）；
   - 还原后字节 SHA-256 恢复一致并全绿复测；
3. **可复现构建审计**：`pnpm run repro:audit` 跨两次独立生产构建 3/3 产物（index.js / index.css / package.zip）SHA-256 绝对一致；
4. **批量门禁审计**：`quality-batch-audit`（50/50）、`integration-boundary-audit`（50/50）、`release-batch-audit`（49/49）与 `current-status-audit` 全绿；
5. **全套浏览器 Smoke**：六套 Smoke 测试全部正常通过。
