# 重构候选清单（按代码行数排序）

> 2026-09-16 生成。依据「攒批发版」工作流：确定下一重构批次前，先列出按代码行数排序的待优化清单。
> 数据基线：三批外部组件扩充（T-6177~T-6228）全部交付后，`index.js` 601480 bytes、测试 5691 项全绿。
> 本清单只排序与评估，不动代码；选定批次后按既有流程立项（ADR 立项 → 实现 → 门禁 → verify:release）。

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
| | | | | |
| > **R3 执行记录（2026-09-16，D-377，T-6241~T-6244）**：实际搬移 openHomeConfigForm 方法体 324 行（候选清单 329 系误计入 openHomeWidgetStore 前置注释），字节原样迁入 `src/home-config-form.ts`（this 参数模式，HomeConfigFormHost 仅 7 成员——依赖面三批最小）；附带收纳 `src/store-labels.ts`（resolveStoreNetworkLabel/resolveStorePrivacyLabel，两处消费的纯函数）。index.ts 11458→11126 行。契约同步 100+ 条方法体断言经"真实正则匹配判定"脚本自动分流（store-mobile-layout 97 条、home-store-contract 8 条改指 configFormSource，保守保留 66 条两边命中者）+ 5 条调用点断言同步 `.call(this` 形态；生产闭包 36→38。负向验证：删 reportValidity 行 → 精确 1 项失败 → 字节级还原。index.js 601057、package.zip 308125；verify:release 独占全绿。R5 候选顺位递补。 | | | | |
| **R4：设置页拆分** | `buildSettingsDocumentSets`(315) + `buildSettingsQuickActions`(221) + `buildSettings*` 系列 → `settings-sections.ts` | ~800 | 低-中（各节相对独立） | index.ts 减约 6% |
| **R5：搜索链路拆分** | `bindDocSearchFilter`(317) + `runDocSearchFetch`(117) → `doc-search-ui.ts`（`path-filter-model` 已独立） | ~500 | 中（D-366/D-365 的门禁测试锁定接线形态，搬移须同步契约） | 搜索 UI 与模型解耦 |
| | | | | |
| > **R5 勘察修订（2026-09-16，D-378）**：实际风险高于本表预估——搜索方法群实为 15 个方法约 730 行（bindDocSearchFilter/runDocSearchFetch/runFullTextSearchFallback/renderDocResults/ensureDocResultsBox 等），深度共享 6 个实例级状态字段（docSearchSessions/docSearchFilters/docSearchNotebookNames/docSearchPathGeneration/docSearchPathTitles/activeDocSearchSessions，WeakMap/Set 形态、与面板生命周期绑定），且 applySearch 主流程横跨其上。按"共享机制留宿主"裁定，状态必须留宿主而仅方法体可搬，host 接口将膨胀至 20+ 状态透传成员——收益不抵割裂风险。**正确前置**：先拆状态宿主（6 个字段收进 search-state 模块并接管生命周期）或先补搜索渲染契约测试，二者择一后再立项。 | | | | |
| **R6：util.js 去重** | graphemeLength/normalizeLabel 重复实现收敛（D-349 已知遗留） | n/a（跨文件） | 低（生产依赖图有边变化，包体需复核） | 消除 4 处 Segmenter 重复持有 |
| | | | | |
| > **R6 执行记录（2026-09-16，D-378，T-6245~T-6247）**：全仓 `new Intl.Segmenter` 私有持有 4→1（仅 util.js）——util 新增导出 graphemeSlice（前 n 字素截断，含短路优化）与 graphemeSliceByCodePoints（码点预算截断）、graphemeLength 补导出；quick-actions 删本地实现改 re-export（测试导入零变化）、normalizeLabel 改调 graphemeSlice；search-model 的 normalizeText 截断段、agent-capabilities 的 asText 循环分别改调 util。生产依赖图边 +2（search-model/agent-capabilities → util，util 本在图中，闭包 38 不变）。门禁升级：Segmenter 测试由"每文件 ≤1 处"收紧为"全仓恰 1 处且必须在 util.js"，负向验证（注入第二持有点 → 精确失败 → 字节级还原）。index.js 601057→600923（-134）、package.zip 308190；verify:release 独占全绿。 | | | | |

## 4. 建议批次顺序与理由

1. ~~**先做 R2（外部组件注册外迁）**~~：✅ 已交付（2026-09-16，D-375）。风险最低、契约测试最完备（三批扩充的 11 个组件全部有 availability-contract 行锁定接线形态），且直接服务后续扩充节奏——新组件不再让 index.ts 增长。可独立成一个批次先行验证搬移流程。
2. ~~**再做 R4（设置页拆分）**~~：✅ 已交付（2026-09-16，D-376，T-6236~T-6240）。各节独立、互不纠缠，作为搬移流程的第二次演练。**执行记录**：实际外迁 16 个构建函数共 984 行（超 ~800 预估，因区域 A 内夹带 buildFavGroupRowActions、区域 B 内夹带 buildQuickActionsTransferControls 两处依赖），index.ts 12442→11458 行；`src/settings-sections.ts` 1068 行（this 参数模式 + SettingsSectionsHost 38 成员）；类型经 `import type` 从 "./index" 引用（10 个类型加 export，编译期擦除零运行时循环）；4 个共享数据方法（getDocumentSets 等）按边界裁定留宿主。契约同步：home-store-guide 1 条改指、mobile-card-smoke 33 条断言按归属分流（18 留 index / 15 改指）、生产闭包 35→36。负向验证 3 轮（含 1 次注入无效自纠：子串包含使改名注入失效，改删行验证）。index.js 601102、package.zip 307961；verify:release 干净全绿。教训：两次 verify:release 并发运行会产生构建竞争假失败，须独占运行。
3. ~~**R1（商店拆分）**~~：✅ 已交付（2026-09-16，D-379，T-6248~T-6250）。**立项前提核实**：D-374"需先补商店渲染快照类契约"已过时——store-* 契约群（store-mobile-layout 467 + store-preview-lifecycle 76 + home-store-contract 66 + store-mobile-external 10 条）全是真实维护的源码正则契约，搬移只需同步改指。**执行记录**：openStoreWidgetPreview（125 行）+ openHomeWidgetStore（995 行，含前置注释）字节原样搬移至 `src/home-store-ui.ts`（this 参数模式，HomeStoreUiHost 13 成员，历批最干净）；store 内互调改模块内 .call(this)，外部调用点 2 处；index.ts 11126→10007 行。契约同步 22 个测试文件约 1028 条断言逐位置判定分流（v1 行号偏移事故与修复见 D-380）；storeSource 切片改读新模块；生产闭包 38→39；负向验证 2 例精确拦截；index.js 600911、package.zip 307699；verify:release 独占全绿 5691/5691。
4. **R2/R4/R3/R6/R1/R5a/R5b 均已交付**（R5b 见第 6 节执行记录，2026-09-16，D-383）。R5 全链收口后搜索链路为「doc-search-state（状态）+ doc-search-ui（UI 方法群）+ search-model/path-filter-model（纯模型）+ 宿主 applySearch 主流程」四层结构。：6 个状态字段收拢至 `src/doc-search-state.ts`（33 处使用点纯引用改写，闭包 39→40），孙堃在二选一中拍板方案 A。**R5 本体现在可立项**：搜索方法群 ~840 行（loadDocSearchPathChildren → openDocSearchResult 等 15 方法）搬移至 doc-search-ui.ts，host 预期 ~14 成员（docSearchState + 少量字段方法），无过渡态透传。

## 5. 不建议动的部分

- `agent-*.js` 系列（1221/929/901/618 行）：v0.18 契约模块，多数尚未接线生产（D-352），重构无收益且增加归档漂移面。
- `external-widget-model.js`（935）：纯数据目录，行数增长是登记面扩大的自然结果，无重复逻辑。
- `life-widget-model.js`（866）：函数级最大仅 75 行（buildActivityWatchSnapshot），结构健康；行数增长同样来自三批扩充。

## 6. R5b 执行记录（2026-09-16，D-383，T-6256）

搜索方法群 20 方法 + 1 模块级函数（loadDocSearchPathChildren → buildDocResultItem，区间 4773~5659 共 887 行）字节原样搬移至 `src/doc-search-ui.ts`（919 行；this 参数模式，DocSearchUiHost 12 成员：docSearchState/i18n/app/isMobile/fetchKernelJson/loadNotebooks/escapeAttr/applySearch/filterCards/getMobileTabs/rootIdOf/mobileOpenDoc，与 D-381 预估 ~14 吻合）。群内互调改模块内 .call(this)，host 成员保留 this.；index.ts 外部调用点 19 处改指。index.ts 10021→9156 行（六轮重构累计 -27.8%）。

契约同步：path-filter-ui-contract 3 项断言改指 docSearchUiSource + 只读负向断言扩为双文件；代际契约负向验证发现断言弱点（删自增行后 uses≥3 仍通过）→ 补 `++this.docSearchState.pathGeneration` 自增锁定断言；production-graph-isolation sanity 加 doc-search-ui、闭包上限 40→41；store-focus-navigation-contract 1 项改指；mobile-card-smoke 9 个 search 契约约 30 子句按归属逐句分流（host 子句留 source）。

新发现：strictBindCallApply 关闭时 `.call()` 返回 any，noImplicitAny 在依赖返回类型推断的位置爆错（.then 回调参数、泛型 DOM 查询）——以最小显式注解修复（DocSearchPathProbe = Awaited<ReturnType<...>> 别名 + box nullable 注解），不开 strictBindCallApply（影响全部既有 .call 调用点）。

负向验证 2 例：删代际自增行 → 补强后精确 FAIL → cmp 字节级还原；删 doc-search-ui import 块 → sanity 精确 FAIL → 还原。发布矩阵：index.js 601563→600715、package.zip 307859→307941；tsc 0 错误、全量 5693/5693、test:smoke 70/70、verify:release 独占全绿。
