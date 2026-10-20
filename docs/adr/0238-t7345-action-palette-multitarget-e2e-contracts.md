# ADR 0238：T-7345 动作画板与深入穿透检索多端端到端交互契约

日期：2026-10-20  
状态：accepted  
任务：T-7345  

## 背景

在 T-7335 至 T-7344 的连续推进中，次级动作画板（Action Palette）与深入穿透检索（Penetration Search）完成了从纯逻辑模型、键盘状态机、声明式面板契约、真实 DOM 装配到切换器主 UI 挂载的全部生产落地。

然而，跨桌面端与移动端存在多项关键的交互与无障碍差异：
1. **桌面端**：依赖 `⌘K` / `Ctrl+K` 快捷键、全键盘输入过滤、上下方向键循环滚动与回车确认执行，并要求 `aria-modal="true"` 约束焦点；
2. **移动端**：自适应为底部抽屉（Bottom Sheet）布局，按移动端无障碍规范声明 `aria-modal="false"`，并保证列表项满足 44px WCAG 触摸靶心；
3. **穿透检索与动作画板联动**：大纲标题（`heading`）与正文块（`block`）必须无损透传 `blockId`，使得动作画板执行复制时能够精准生成 `siyuan://blocks/{blockId}` 与 Markdown 锚定格式，绝不退化为根文档 ID；同文档内多标题去重键必须保持严格独立。

为确保上述集成流转不发生静默回归，必须建立高保真的端到端交互契约套件。

## 决策

1. **新建自动化端到端交互契约 `tests/action-palette-e2e-interaction.test.cjs`**：
   - 采用纯 JSDOM 构造无外部网络依赖的确定性测试沙箱；
   - **桌面端完整交互闭环**：验证卡片上下文抽取、DOM 挂载、搜索过滤（输入 "分栏" 过滤到分屏动作）、ArrowDown 选中行、回车执行 `onExecute` 并脱挂销毁遮罩；
   - **移动端抽屉与 a11y 契约**：验证 `sw__palette--mobile` 样式类、`aria-modal="false"` 声明、点击外部遮罩触发关闭；
   - **穿透检索与动作画板端到端联动**：
     - 验证 `aggregatePenetrationResults` 生成的标准 14 位 + 7 位思源块条目；
     - 验证 `resolveDocSearchResultId` 针对多标题独立生成 blockId 去重键；
     - 验证通过 `extractActionContext` 提取到的 `blockId` 在生成块链接与操作回执时精准绑定目标块。
2. **负向注入验证机制（AGENTS 门禁要求）**：
   - 探针 1：传入 `null` 容器必须抛出 `TypeError`；
   - 探针 2：空状态调用 `buildActionPalettePanelModel` 必须输出 `empty: true` 且 `sections.length === 0`；
   - 探针 3：不支持的端侧必须抛出 `RangeError`，非法契约对象返回 `false`；
   - 探针 4：非法/未定义上下文安全回退为 `unknown` 兜底结构。
3. **资源与包体预算零影响**：
   - 本任务为测试与交互断言套件，未修改 `src/` 下任何生产代码；
   - raw bundle 观察线（1170 KiB）、归档包上限（590 KiB）、压缩单条目上限（320 KiB）与生产图闭包上限（86 模块）全部维持不变。

## 证据与验证

1. **定向测试**：`node tests/action-palette-e2e-interaction.test.cjs` 4/4 通过；
2. **两组负向探针验证**：
   - 注入 1：篡改类名断言为 `sw__palette--desktop-broken` -> 用例 1 精确拦截失败；
   - 注入 2：强制要求同文档多标题去重键相等 -> 用例 3 精确拦截失败；
   - 还原后字节比对一致并全绿复测；
3. **全量套件验证**：全量测试套件通过，无任何破坏或状态漂移。
