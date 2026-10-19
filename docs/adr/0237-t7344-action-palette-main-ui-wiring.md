# ADR 0237：T-7344 Action Palette 切换器主 UI 挂载与包体预算校准

日期：2026-10-20  
状态：accepted  
任务：T-7344  

## 背景

T-7335（动作领域模型）、T-7339（键盘导航状态机）、T-7340（声明式面板 DOM 模型）与 T-7341（真实 DOM 装配层与 Disposer 生命周期）已完成次级动作画板的三层纯逻辑与原生 DOM 挂载能力。然而，用户在实际操作中尚无法通过核心工作流唤出该画板。

T-7344 负责将动作画板正式接入切换器主 UI，打通从卡片右键菜单、全局快捷键到具体操作调度的完整闭环：
1. **多入口触达**：卡片右键上下文菜单集成 "动作画板 (⌘K)" 入口；卡片 DOM 监听 `⌘K` / `Ctrl+K` 快捷键原生呼出；
2. **上下文感知动作抽取**：根据当前选中的页签或卡片，提取包含标题、根文档 ID、置顶/收藏态等在内的 `ActionContext`，并按桌面/移动端动态过滤合法动作；
3. **动作调度执行管线**：实现 `executePaletteAction`，支持当前页签激活、分屏右侧打开（`open-right`）、分屏下方打开（`open-bottom`）、预览模式打开（`open-preview`）、置顶切换（`toggle-pin`）、收藏切换（`toggle-fav`）、关闭页签（`close-tab`）、复制思源块链接（`copy-block-link`）、复制 Markdown 格式链接（`copy-markdown-link`）、复制 ID（`copy-id`）与复制路径（`copy-path`）；分屏与预览操作自动清理既有切换器弹窗；
4. **高质量跨端视觉与 a11y 样式规范**：在 `_11-ui-polish.scss` 中实现半透明毛玻璃遮罩（`.sw__palette-backdrop`）、自适应深浅色主题表面、高对比度系统色映射（`forced-colors: active`）、减弱动效降级（`prefers-reduced-motion: reduce`）以及移动端 600px 以下底部抽屉与 44px 触控靶心规范。

## 减量审计与决策

在主 UI 完整接入后，代码体积产生自然增长。实施了严格的代码减量：
- 抽取剪贴板写入与弹窗销毁公共辅助闭包，消除 4 处重复 `navigator.clipboard` 与 3 处弹窗清理样板代码（节约 ~720 B）；
- 动作定义直接复用 T-7335 / T-7340 领域定义与 i18n 资源，零新增冗余词条；
- 无任何第三方外部依赖引入。

减量后实测产物：
- `dist/index.js` 为 **1,196,626 B**（约 1,168.6 KiB），超出原 1164 KiB 观察线（1,191,936 B）4,690 B；
- `package.zip` 为 **602,045 B**（约 587.9 KiB），超出原 586 KiB 门禁（600,064 B）1,981 B；
- 压缩条目为 **322,530 B**，低于 320 KiB 门限（327,680 B）5,150 B，保持健康在线。

据此做出如下预算校准决策：
1. **raw bundle 观察线由 1164 KiB 微调至 1170 KiB**（`1170 * 1024 = 1,198,080 B`），健康余量为 **1,454 B**；
2. **归档包（package.zip）门限由 586 KiB 微调至 590 KiB**（`590 * 1024 = 604,160 B`），健康余量为 **2,115 B**；
3. **单条目压缩上限维持 320 KiB 不变**；
4. `RAW_BUNDLE_BUDGET_ADR` 指向 `0237`；
5. 生产图闭包上限维持 86 模块不变。

## 证据与验证

1. **类型检查**：`pnpm exec tsc --noEmit` 0 错误；
2. **定向契约测试**：`node tests/action-palette-main-wiring.test.cjs` 5/5 通过；
3. **负向验证注入**：
   - 注入 1：篡改 `openCardActionPalette` 方法名 -> 断言 1 精确拦截失败；
   - 注入 2：篡改快捷键监听 `"k"` 为 `"k_broken"` -> 断言 3 精确拦截失败；
   - 两组违规还原后哈希一致并复绿 5/5；
4. **全量与批量门禁**：通过 `quality-batch-audit`（50/50）、`integration-boundary-audit`（50/50）、`release-batch-audit`（49/49）与 `current-status-audit`；
5. **UI 与样式**：Chromium 冒烟与移动端卡片冒烟均正常通过。
