# 重构候选清单（按代码行数排序）

> 2026-09-16 生成。依据「攒批发版」工作流：确定下一重构批次前，先列出按代码行数排序的待优化清单。
> 数据基线：三批外部组件扩充（T-6177~T-6228）全部交付后，`index.js` 601480 bytes、测试 5691 项全绿。
> 本清单只排序与评估，不动代码；选定批次后按既有流程立项（TODO 立项 → 实现 → 门禁 → verify:release）。

## 1. 文件级行数排序（src/ 全量，2026-09-16）

| # | 文件 | 行数 | 说明 |
|---|------|-----:|------|
| 1 | index.ts | 12681 | 巨型主类（286 个方法约 12006 行）+ 38 个 register |
| 2 | agent-capabilities.js | 1221 | Agent 能力注册（v0.18 契约模块） |
| 3 | util.js | 1160 | 通用工具（已知遗留：graphemeLength 重复实现，见 D-349） |
| 4 | home-store-model.js | 977 | 商店模型 |
| 5 | external-widget-model.js | 935 | 外部组件目录（三批扩充后持续增长） |
| 6 | agent-workspace-capability-definitions.js | 929 | v0.18 |
| 7 | search-model.js | 918 | 搜索模型 |
| 8 | agent-readonly-audit.js | 901 | v0.18 |
| 9 | life-widget-model.js | 866 | 生活组件模型（三批扩充 488→866） |
| 10 | agent-workspace-runtime.js | 618 | v0.18 |
| 11 | home-view.js | 578 | 视图渲染 |
| 12 | life-widget-network.js | 410 | 网络白名单层（三批扩充 190→410） |
| 13 | home-model.js | 386 | 组件注册模型 |
| 14 | home-adapters.js | 285 | 适配器 |
| 15 | quick-actions.js | 248 | 快捷操作 |

其余文件均 < 250 行，暂无结构性问题。

## 2. index.ts 内部结构（最大问题域）

index.ts 12681 行中，主类方法约 12006 行、286 个方法。**按方法行数排序的 Top 15**：

| # | 方法 | 起始行 | 行数 | 职责 |
|---|------|-------:|-----:|------|
| 1 | openHomeWidgetStore | 4989 | 995 | 组件商店弹层（渲染 + 事件 + 筛选状态） |
| 2 | registerBuiltinHomeAdapters | 3633 | 769 | 全部 38 个组件的 register 调用（外部组件 11 个共 242 行） |
| 3 | openSecondPanel | 5984 | 586 | 二级面板 |
| 4 | registerAgentCapabilities | 8377 | 346 | Agent 能力接线 |
| 5 | openHomeConfigForm | 4660 | 329 | 配置表单（含新增 textarea 分支） |
| 6 | bindDocSearchFilter | 7451 | 317 | 文档搜索筛选 |
| 7 | buildSettingsDocumentSets | 7117 | 315 | 文档集设置页 |
| 8 | buildSettingsQuickActions | 6777 | 221 | 快捷操作设置页 |
| 9 | onload | 676 | 211 | 插件生命周期 |
| 10 | openSetting | 1855 | 181 | 设置入口 |
| 11 | bindMobileSwitcherToolbarActions | 11665 | 175 | 移动端工具栏 |
| 12 | searchAgentDocuments | 8723 | 159 | Agent 文档搜索 |
| 13 | openMobileSwitcherDialog | 11458 | 159 | 移动端切换器 |
| 14 | openStoreWidgetPreview | 1546 | 125 | 商店预览 |
| 15 | runDocSearchFetch | 7854 | 117 | 搜索取数 |

## 3. 重构批次候选（按预期削减行数排序）

| 批次候选 | 内容 | 预期从 index.ts 移出 | 风险 | 收益 |
|---------|------|--------------------:|------|------|
| **R1：商店拆分** | `openHomeWidgetStore`(995) + `openStoreWidgetPreview`(125) + 相邻辅助 → `home-store-ui.ts` | ~1200 | 中（商店状态机与事件绑定交织；契约测试 store-* 会锁定行为） | index.ts 减约 10%；商店独立可测 |
| **R2：外部组件注册外迁** | 11 个 `external-*` register 块（242 行）→ 与 `home-adapters.js` 合并或新建 `home-external-adapters.ts`；`lifeModuleIds`/`clockModuleIds`/`BUILTIN_GROUPS` 常量随迁 | ~300 | 低（纯搬移，外部组件契约测试直接锁定） | 生活组件接线与业务代码解耦，后续扩充不再进 index.ts |
| | | | | |
| > **R2 执行记录（2026-09-16，D-375，T-6232）**：实际搬移为 13 个外部组件注册（11 个直接 `register` + 2 个 `registerExternalFeed`，原清单低估了 feed 助手拆分），共 243 行（含成对注释）按字节原样迁入 `src/home-external-adapters.ts`（273 行，`this` 参数模式绑定宿主 i18n 与内核代理 fetch，块内接线形态零漂移）。index.ts 12681 → 12442 行。`lifeModuleIds`/`clockModuleIds`/`BUILTIN_GROUPS` 属于运行时行为逻辑（心跳、移动端尺寸、商店分组），按语义保留在 index.ts。契约同步：component-availability-audit 双文件扫描、external-widget-availability-contract 28 条断言改指新文件、external-widget-model 6 处改指、生产闭包 34→35。负向验证 2 轮（删 register → audit/contract 精确失败 → 字节级还原）。`index.js` 601480 → 601526 bytes。R4 候选顺位递补。 | | | | |
| **R3：配置表单拆分** | `openHomeConfigForm`(329) + renderField 相关 → `home-config-form.ts` | ~400 | 中（controls Map 类型与 placeholder token 耦合 i18n） | 配置渲染独立；字段类型可继续扩展 |
| **R4：设置页拆分** | `buildSettingsDocumentSets`(315) + `buildSettingsQuickActions`(221) + `buildSettings*` 系列 → `settings-sections.ts` | ~800 | 低-中（各节相对独立） | index.ts 减约 6% |
| **R5：搜索链路拆分** | `bindDocSearchFilter`(317) + `runDocSearchFetch`(117) → `doc-search-ui.ts`（`path-filter-model` 已独立） | ~500 | 中（D-366/D-365 的门禁测试锁定接线形态，搬移须同步契约） | 搜索 UI 与模型解耦 |
| **R6：util.js 去重** | graphemeLength/normalizeLabel 重复实现收敛（D-349 已知遗留） | n/a（跨文件） | 低（生产依赖图有边变化，包体需复核） | 消除 4 处 Segmenter 重复持有 |

## 4. 建议批次顺序与理由

1. ~~**先做 R2（外部组件注册外迁）**~~：✅ 已交付（2026-09-16，D-375）。风险最低、契约测试最完备（三批扩充的 11 个组件全部有 availability-contract 行锁定接线形态），且直接服务后续扩充节奏——新组件不再让 index.ts 增长。可独立成一个批次先行验证搬移流程。
2. ~~**再做 R4（设置页拆分）**~~：✅ 已交付（2026-09-16，D-376，T-6236~T-6240）。各节独立、互不纠缠，作为搬移流程的第二次演练。**执行记录**：实际外迁 16 个构建函数共 984 行（超 ~800 预估，因区域 A 内夹带 buildFavGroupRowActions、区域 B 内夹带 buildQuickActionsTransferControls 两处依赖），index.ts 12442→11458 行；`src/settings-sections.ts` 1068 行（this 参数模式 + SettingsSectionsHost 38 成员）；类型经 `import type` 从 "./index" 引用（10 个类型加 export，编译期擦除零运行时循环）；4 个共享数据方法（getDocumentSets 等）按边界裁定留宿主。契约同步：home-store-guide 1 条改指、mobile-card-smoke 33 条断言按归属分流（18 留 index / 15 改指）、生产闭包 35→36。负向验证 3 轮（含 1 次注入无效自纠：子串包含使改名注入失效，改删行验证）。index.js 601102、package.zip 307961；verify:release 干净全绿。教训：两次 verify:release 并发运行会产生构建竞争假失败，须独占运行。
3. **R1（商店拆分）单独立项**：预期削减最大但状态机交织最深，建议在 R2/R4 验证搬移方法后进行，且需要先补商店渲染快照类契约测试再动手。
4. **R3/R5 随后**；**R6** 独立小批次（涉及生产依赖图与包体复核）。

## 5. 不建议动的部分

- `agent-*.js` 系列（1221/929/901/618 行）：v0.18 契约模块，多数尚未接线生产（D-352），重构无收益且增加归档漂移面。
- `external-widget-model.js`（935）：纯数据目录，行数增长是登记面扩大的自然结果，无重复逻辑。
- `life-widget-model.js`（866）：函数级最大仅 75 行（buildActivityWatchSnapshot），结构健康；行数增长同样来自三批扩充。
