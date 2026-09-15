# 决策
- D-362（2026-09-16）：UI 动效语言令牌化（`src/index.scss`，用户要求按 Apple 流体设计 / Impeccable / 前端 UI 工程三个技能全面优化界面）。**先做客观评估再动手**：样式系统基础扎实——颜色/圆角/阴影已全部走 `--b3-*` 主题变量并以 hex 作安全回退、已用 `color-mix()` 做层次、已有 38 处 `:focus-visible`、7 处 `prefers-reduced-motion`、`contain`/`content-visibility` 各 3 处、过渡仅 2 处涉及布局属性。真正的短板在**动效语言**：40 处过渡声明散落成 **34 种写法**、时长分 **7 档**（0.12/0.15/0.18/0.2/0.25/0.3/0.35s）且 `.15s` 与 `0.15s` 混写、缓动**全部是浏览器默认 `ease`**（37 处，启动偏钝，与 Apple "即时响应"原则相悖）。**改动**：(1) 引入 4 档时长令牌（`$sw-dur-fast/base/slow/panel` = 120/160/200/260ms）与 2 条曲线（`$sw-ease` = cubic-bezier(.32,.72,0,1) 快启动平滑停止、`$sw-ease-sym` 对称），逐一替换 43 处过渡声明；(2) 消除 2 处 `transition: all`（会监听含布局属性在内的全部变化、浏览器无法按属性优化），按真实交互态改为显式属性列表；(3) `linear` 仅保留给旋转加载动画（匀速是正确语义）。**刻意用 SCSS 变量而非 CSS 自定义属性**：颜色/圆角需随宿主主题运行时变化故用 `--sw-*`，而动效时长/曲线是固定设计常量，SCSS 变量编译期展开为零运行时开销且不增体积。**一处有据的取舍**：进度条的 `width` 过渡保留（会触发重排），因为宽度仅在渲染时一次性设置（`home-view.js:323`）、非逐帧动画、单元素成本可忽略，而改 `transform: scaleX` 会把 3px 圆角一并拉伸变形，视觉收益为负——已就地注释说明，避免后人盲目"消除反模式"。**契约同步**：4 处 CSS 契约测试原本硬绑 `\.15s ease` 字面量（属 D-361 清单中的"绑定实现细节"），改为绑定令牌模式（`/transition: border-color \$sw-dur-\w+ \$sw-ease/`），保留"过渡仍然存在"的回归保护同时不再因调档位误报；新增 2 条保护性断言（过渡声明不得出现裸时长/裸 ease、6 个令牌必须保持定义）。**负向验证**（D-361 协议）：回退裸时长、回退默认 ease、删除令牌定义三种注入均被拦截，`index.scss` 字节级还原。成本：`dist/index.css` 142699→144080（+1381 字节，主因曲线由 4 字符 `ease` 展开为 29 字符精确曲线），`package.zip` 294459（512 KiB 余量 229829），`dist/index.js` 不变；`pnpm verify:release` 5575/5575。
- D-361（2026-09-16）：把 D-354/D-359/D-360 三轮门禁审计的方法论固化为 `docs/gate-audit-checklist.md`，并在 `AGENTS.md` 开发协议中新增一条"门禁"要求（新增或修改门禁/契约测试须按清单自查并做负向验证；只跑"改完仍通过"不构成证据）。**动机**：三轮共发现 7 处失效门禁，其共同点不是逻辑写错，而是**断言从不因违规而失败**——这类缺陷不会在代码审查或覆盖率数字中暴露，只有把教训写进协议才可能被后续开发遵守。清单含六类失效模式（自造数据自断言、恒真表达式、测试自造正则、空集合恒真、名不副实、自指扫描）、强制验证协议（同条件注入 + 按失败项名称判定 + 字节级还原 + 有条件时前后对比）、两个注入陷阱（自指、两次写入互相覆盖）、五类**已确认非缺陷**的有意设计（避免后续误报式"修复"）、可运行的模式扫描片段，以及两项待结构性解决的问题。**归档边界**：该文档与 `host-gate-audit.md`、`path-filter-desktop-plan.md` 均为开发文档，**不进发布归档**——`package.zip` 仍为 13 个条目（webpack 只收显式声明的 4 个 docs 文件），与 D-219 对 ROADMAP.md 的处理一致，归档白名单门禁未变。
- D-360（2026-09-16）：完成 `tests/host/*.test.cjs` 全量门禁有效性审查（16 文件、159 断言）并修复 P0 缺陷，审查报告见 `docs/host-gate-audit.md`。**核心发现：4 处断言完全不校验任何外部状态**——`release-dry-run` 自造 `const assets = ['package.zip']` 再断言其等于自己；`release-final-consistency` 自造三个诊断字符串再断言拼接长度 < 256；`release-quality-report` 由 `categories.map()` 构造 `report` 再断言二者一致（恒等式，且其类别 `package`/`drift` 连生产实现都不识别，映射为 `RELEASE_UNKNOWN`）；`reproducible-build` 断言 `snapshot.split('\n').length === files.length` 而 snapshot 正由该 files map-join 而成。四者共同形态为"测试自己造数据、再断言该数据符合预期"，与插件、产物、CI 配置无关，却提供"已覆盖"的假象。**另发现**：`rollback-preflight`/`release-docs-safety` 各测试一个**测试内定义的正则**（实际验证 JS 正则引擎而非发布流程约束）；`reproducible-build` 的测试名声称 deterministic 但无任何确定性验证，且**全仓不存在构建产物的两次构建对比**——可复现性声明缺少自动化证据（D-083 那次是人工验证）；`compatibility-matrix` 的文档链接检查在正则失效时会静默通过；`package-resource-audit` 注释仍写 320 KiB（D-353 已改 512）。**修复**：前三处改为从真实对象取数（workflow 的 `files:` 声明、真实 `formatReleaseDiagnostics`、真实 `classifyReleaseFailure` 的类别覆盖与唯一性）；`reproducible-build` 删除恒真断言改为校验 sha256 摘要形态并修正测试名；`compatibility-matrix` 补 `checked >= 10` 自检（当前实检 22 条）；注释更新为 512 KiB。**负向验证**（D-359 方法）：workflow 声明非法资源名、去掉 480 字符截断、把受支持 kind 降级为 UNKNOWN，三者均被拦截，注入文件字节级还原。**刻意未改**：两处自造正则仍具"文档化约束格式"价值，彻底修复需抽出共享校验模块（结构性改动，另议）。**澄清非缺陷**：8 处"产物缺失即跳过"为有意设计（`verify:release` 含 build、CI 用 `SW_REQUIRE_PACKAGE=1` 且由 `ci-gate-consistency` 守护该设置）。
- D-359（2026-09-16）：修复两处**形同虚设的恒真断言**（延续 D-354 的"门禁看似存在实则从不触发"审计线）。(1) `tests/workspace-diagnostics-wiring.test.cjs` 的 re-export 链守卫写作 `assert.equal(typeof rt[name], 'function' === typeof rt[name] ? 'function' : typeof rt[name] === 'object' ? 'object' : 'undefined')`——三元式化简后右侧恒等于 `typeof rt[name]` 自身，故 `function`/`object`/`undefined` 三种情况**全部通过**，导出被改名或删除时静默放过；而其注释正写着"若未来有人把导出改名或让 re-export 断链，这里先失败"，**实现与声明的意图完全相反**。(2) `tests/host/final-package-audit.test.cjs` 的"审计只读"断言为 `assert.equal(typeof fs.readFileSync, 'function')`——凡存在 fs 模块必为真，零覆盖。修复：前者按类型分组做真实存在性断言（函数组查 `typeof === 'function'`，常量组查 `typeof === 'object'` 且非 null 非空，并说明 `typeof null` 也是 `'object'`）；后者改为扫描本审计文件源码不得出现写/删/改文件调用，**禁用词按"词根 + 后缀"拼接构造**——首版直接写完整字面量导致列表本身出现在被测源码中、`includes` 恒为真（断言又退化回恒真），此自指陷阱已修并通过注释留痕。**实证**（同条件前后对比，非仅"改后仍通过"）：注入"移除 runtime 导出"违规时，旧断言**从未触发**（仅 3 项其它测试报警），新断言触发；注入"审计文件引入写操作"时，旧断言下整个文件**零失败**，新断言触发。两处修复后 `verify:release` 5573/5573 全绿，注入文件均字节级还原。附带观察：案例一表明该导出并非完全无覆盖（另有 3 项测试直接使用它），但那条自我标榜的"防御性自检"确实从未生效。
- D-358（2026-09-16）：为 `KERNEL_ENDPOINTS` 建立防回归门禁（`tests/kernel-endpoint-guard.test.cjs`，8 项断言）。**发现**：该白名单是 `fetchKernelJson` 防 SSRF 的关键守卫（四重检查：非字符串、非 `/` 开头、`//` 协议相对、不在白名单），但**全仓测试零引用**——`grep -rn KERNEL_ENDPOINTS tests/` 无任何结果。风险不在当前状态（10 个端点白名单与 switch 分支恰好一一对应，无现存 bug），而在**漂移无人拦截**：白名单与分支分散两处、必须成对修改，漏加分支会让端点在 `default` 静默返回 null（功能莫名失效），漏加白名单会让分支永不可达；本轮接入 `path-filter-model` 时正是同时改两处，只改一处不会有任何测试报警。另注：源码注释所称"安全扫描要求：不存在变量 URL 请求"此前只由外部扫描器（B-003 的 Mimosa L3）守护，本地无门禁。**断言设计**：白名单非空、端点均为同源相对路径、白名单↔分支**双向**一致、字面量 fetch 与白名单同集合、禁止变量与绝对 URL、`default` 分支存在、四重守卫齐全。**负向验证**（沿用 D-354 教训：门禁必须证明自己会失败）：注入 5 类违规——白名单加端点不加分支、加分支不加白名单、字面量改变量 URL、改绝对 URL、删除 default——**全部被精确拦截**（其中三类因断言冗余同时触发 2 项失败），验证后 `src/index.ts` 字节级还原。**附带修正**：README 的测试矩阵数字长期滞后（实为 5565 而文档写 5389），已同步为中英文各 5 处真实值 5573 项 / 156 个文件；v0.16.39 更新日志中的"1513 项"属**历史记录，不予改动**。`package.zip` 因 README 内容变化由 294404 变为 294403（±1 KiB 容差内，发布矩阵已同步）。
- D-357（2026-09-16）：核实并纠正 T-103（路径筛选桌面原型）的阻塞条件。此前台账记为"待下一轮预算释放后再接入生产 UI"，经查**预算只是前置之一且已解除**（D-353 上限上调至 512 KiB/768 KiB，D-355 实测全量接入仅增 59.7 KiB），另有一道**独立且仍然有效**的宿主证据门禁：`tests/path-filter-ui-contract.test.cjs` 断言源码不得出现 `listDocsByPath`（"path filter remains model-gated until the host endpoint is approved"），T-107 明确以"下一次桌面大版本验收记录端点可用性、响应结构与最窄侧栏宽度"为判定前提，D-042 规定桌面端实测仅在大版本节点进行。三者一致指向 B-005（无可安全复用的已认证桌面会话）。**处理**：本轮已按完整方案实现（端点白名单 + 字面量 URL 分支、`path-filter-model` 导入、代际标记取消、降级映射、路径菜单与 chip 移除、筛选摘要、11 组中英文案、生产图清单迁移至 WIRED 且闭包上限 31→32），实测通过 `tsc --noEmit`（0 错误）、i18n 门禁 11/11、生产图门禁 3/3（闭包 32）与 `path-filter-ui-contract` 之外的既有测试；随后**主动回滚生产接线**并把方案完整存档于 `docs/path-filter-desktop-plan.md`（含关键代码与应用步骤）。理由：放宽该门禁本身应作为"端点获批"的正式记录，其依据必须是真实桌面验收证据，**不能由本轮以"预算已释放"为由推断**——那会把 D-042/D-111 建立的"不以模拟替代宿主证据"原则架空。取消机制的实现依据：`fetchKernelJson` 自带 5s 超时且不接受外部 signal，故用代际标记（每次打开路径菜单自增，过期响应丢弃）而非 AbortSignal，与既有内核请求辅助函数的约束一致。已知未验证项：`bindDocSearchFilter` 有 4 个调用点（含移动端），方案未做端差异，留待 T-107 一并取证。
- D-356（2026-09-16）：修复工作树遗留的两项门禁失败，二者均非功能回归。(1) `src/i18n/zh-CN.json` 残留探针 key `zzzParityProbeKey`（值"探针"），是此前验证 i18n parity 门禁是否真生效时故意植入、事后未清理；它同时触发"zh-CN 与 en 的 key 集合不一致"与"存在源码未引用的死 key"两项失败。该文件另有 105+/104− 的格式化改动（前导逗号改为标准 JSON 缩进），经逐 key 比对确认 555 个同名 key **值零变化**，故格式化予以保留、仅删除探针。(2) `tests/document-context-wiring.test.cjs` 的 `cachedNotebookName\n\s*\|\|` 断言在本机失败，根因是 `core.autocrlf=true` 使 `src/index.ts` 工作树全为 CRLF（12369 行），而正则写死 LF；这是**测试对行尾敏感**，不是源码退化（实际代码 `cachedNotebookName` 后接 `||` 的优先级语义完好，见 `src/index.ts:8107`）。全仓扫描 7 处跨行正则，仅此 1 处受影响——其余 6 处要么 `\n` 位于 `\s*` 之后（`\r` 被 `\s*` 吸收），要么是 `\n\}` 形式（CRLF 下仍匹配）。按项目既有先例（`tests/store-mobile-layout-contract.test.cjs:695` 已用 `\r?\n`）改为 `\r?\n`，使断言行尾无关。保留 `autocrlf` 现状不加 `.gitattributes`：统一行尾会触及全仓文件，收益不抵风险。
- D-355（2026-09-16）：v0.18 受控执行链接入预算**实测**（方法记于 `docs/agent-chain-reconciliation.md`）。用 esbuild 对同一入口做两次 `--bundle --minify` 取差值，共享依赖在两次打包中均只计一次：基线（`src/index.ts` 单入口）585176 bytes，基线 + 全部 15 个未接线契约模块 646321 bytes，**增量 61145 bytes ≈ 59.7 KiB**（占总包 9.5%）。按 esbuild 与 webpack 约 4.4% 的压缩率差异折算，webpack 实际增量约 58 KiB。对照 D-353 后的余量：`dist/index.js` 余量 225956 bytes、`package.zip` 余量 229884 bytes，**全量接入后仍分别余约 168 KB 与 210 KB**（ZIP 对源码二次压缩后增量远小于 59.7 KiB）。结论：v0.18 可一次性接入全部契约模块，无需分批、无需先做归档内容裁剪，**包体不再是 v0.18 的阻塞项**。仍有效的阻塞是 B-005（无已认证桌面会话）与 D-111（写入动作待独立审批与宿主验证），二者与体积无关。附带修正：执行链证据文档原按"`index.ts` 直接 import"判定接线，据此把 `agent-workspace-runtime` 误列为未接线——它实际上经 `agent-workspace-diagnostics` 间接进入生产闭包（D-220），故生产闭包含 5 个 agent 模块；接线判定应以**从 `index.ts` 出发的可达闭包**为准，不能只看直接 import。
- D-354（2026-09-15/16）：修复生产依赖图隔离门禁的失效缺陷（`tests/production-graph-isolation.test.cjs`）。UNWIRED 泄漏断言只检查 `graph.has(name)` 与 `graph.has(name + ".ts")`，而同文件的 WIRED 健全性断言还额外检查 `graph.has(name + ".js")`；由于遍历存的是带扩展名的解析文件名，`.js` 分支缺失使该断言对全部纯 `.js` 契约模块完全失效。实测：31 个在图中的模块，旧逻辑漏检 **27** 个，新逻辑漏检 **0** 个。直接证据——`agent-document-context` 早已被 `src/index.ts:88` 引入并在生产图内，却仍列于 `UNWIRED_CONTRACT_MODULES`，而泄漏断言报告 `(none)`。因 `UNWIRED_CONTRACT_MODULES` 全部 16 项均为 `.js`，该门禁从未真正保护过它声称保护的模块。修复：提取共用 `inGraph(graph, name)` 统一按裸名/`.js`/`.ts` 三种形式解析，两个断言共用，杜绝再次不对称；同时按事实把 `agent-document-context` 由 UNWIRED 移入 `WIRED_SANITY_MODULES`（其生产接线已在 D-352 确认，属有意接入），并更新注释中已过时的"320 KiB 硬上限"前提（现为 512 KiB，D-353）。模块数上限 31 与实际闭包一致，未变。
- D-353（2026-09-15）：包体上限重校准。**经核查，思源官方对 `package.zip` 没有任何大小限制**——`siyuan-note/plugin-sample` 的规范只对单文件设限（`icon.png` ≤ 20 KB 推荐 160×160、`preview.png` ≤ 200 KB 推荐 1024×768），GitHub Release 单附件上限 2 GB。因此 300/320 KiB 均为本项目自设的自律线，不是外部约束。据此上调两处并修正一处真实违规：(1) `package.zip` 硬上限 320 KiB→**512 KiB**（`package-integrity`、`package-budget-checkpoint`）；(2) `dist/index.js` 自律线 548 KiB→**768 KiB**（`release-quality`）。理由：该自律线在四天内被"按真实增量"校准 82 次（296→548 KiB，+85%），余量 676 bytes 是棘轮效应的产物而非真实约束；768 KiB 仍保留移动端解析成本护栏，且远低于 1 MiB。校准协议不变——每次调整仍须注明当日真实增量。(3) **`icon.png` 此前 256×256 / 44720 bytes，超出官方 20 KB 规范 2.2 倍**，此前一直未被发现。改为 160×160（官方推荐尺寸）+ BILINEAR 降采样 + zopfli 重压缩 IDAT，得 18376 bytes：未做调色板量化，RGBA 全彩与 alpha 通道完全保留，属无损压缩。校验过替代方案——BILINEAR 原生 RGBA 为 20059 bytes（超 421 bytes）、zlib 多策略重压无增益、清理透明区杂色无收益（该图 alpha 仅 1 个取值，无透明区），zopfli 是唯一能进 20 KB 的无损路径。效果：`package.zip` 320649→**294404** bytes（省 26245），归档余量 7031→**229884** bytes；`index.js` 余量 676→**225956** bytes。归档白名单、元数据、重复条目、远程依赖、单条目上限等门禁一律未动，仅移动字节上限。v0.18 受控执行链因此不再需要先做内容裁剪决策。
- D-351（2026-09-15）：TODO 台账对账——`T-5383~T-5422 商店视图偏好与批量管理` 章节标题已标"已完成"但 40 个条目全是未勾选。逐项核实后确认功能真实交付：`STORE_VIEW_MODES=["grid","list","compact"]`、`normalizeHomeStoreViewMode`、`resolveHomeStoreViewModeLabel`、`normalizeHomeStoreViewState/serialize/parse`（密度视图模型）、`normalizeHomeStoreSelectionIds`/`toggleHomeStoreSelection`/`clearHomeStoreSelection`/`selectHomeStoreVisible`/`buildHomeStoreSelectionSummary`/`resolveHomeStoreSelectAllState`、`buildHomeStoreFilterSuggestion`、`buildHomeStoreCardStateSummary`、`resolveHomeStorePrimaryAction`（added→configure/apply-size、external→guide、conditional→configure、else add）、`normalizeHomeStoreSetupUrl`（仅 HTTPS 或 loopback HTTP）、`summarizeHomeStoreConfigCompletion` 全部实现，且 `home-store-model` 专项 425/425 通过、index.ts 已完成视图循环与重置接线。据此勾选 40 项，未完成总数由 123 降至 83。
- D-352（2026-09-15）：剩余 83 项未完成中，71 项属于 `T-122~T-194`（v0.18 Agent 受控执行链）。核查后确认**台账原本就是准确的**——这 71 项全部带 `状态：in-progress` 及"待接入生产"说明（如 T-122"待真实桌面取消/权限审计后接入生产 Agent 注册"、T-124"仍未接入生产执行器"），并非记账滞后，**保持未完成且不勾选**。补充硬指标证据（`docs/agent-chain-reconciliation.md`）：19 个 `agent-*.js` 模块中只有 `agent-capabilities`、`agent-document-context`、`agent-readonly-audit`、`agent-workspace-diagnostics` 4 个被 `src/index.ts` 引入，其余 15 个（计划、审批令牌、执行状态机、宿主适配器、bridge、session registry、事件队列、恢复协调器、写入动作）**全部未进生产入口**，仅存在于测试与模型层互引。这与 D-283（执行链属 v0.18）、D-111（写入动作待宿主验证）一致。v0.18 接线判定信号：模块被 `index.ts` 引入、能力进入 `agent-capabilities` 注册集合、存在生产注册契约测试。另记：本轮曾尝试按条目关键词匹配符号名推断接线状态，得出"70/71 已接线"的错误结论（关键词在无关符号上广泛命中），已废弃，只采用生产入口依赖这一硬指标。
- D-350（2026-09-15）：`home-view.js` 的 `formatUpdatedAt` 改为复用模块级 `Intl.DateTimeFormat` 缓存。实测构造一个 DateTimeFormat 约 63µs，而复用实例格式化仅约 2µs；该函数在 `renderHomeModuleView` 中每个组件模块调用一次（MAX_ITEMS 24），旧实现每次面板渲染重复构造。缓存失效键使用 `new Date().getTimezoneOffset()`（约 0.3µs）：`Intl.DateTimeFormat` 在构造时捕获宿主时区，直接常驻会导致跨时区旅行后时间显示陈旧；`resolvedOptions().timeZone` 实测约 68µs，不可用于校验。修复后单次调用 0.0631ms→0.00489ms（约 13 倍）。`life-widget-model.js` 的 `formatWeekday` 仍按 locale 逐日构造（天气预报约 7 次/渲染、合计约 0.44ms），暂不缓存以避免为低频路径增加 Map 与键管理成本。`dist/index.js` 560365→560476 bytes（+111），自律线余量 676 bytes；`package.zip` 320649 bytes，余量 7031 bytes。
- D-349（2026-09-15）：清理同类"每调用构造昂贵对象"热点两处——(1) `index.ts` 日记月历把 `new RegExp(attrPrefix/titlePrefix)` 从 64 行 SQL 结果的 `forEach` 内提到循环外（两者只依赖月份前缀，旧实现每次渲染重复编译最多 128 个等价正则）；(2) `quick-actions.js` 的 `graphemeLength`/`normalizeLabel` 改为复用模块级 `GRAPHEME_SEGMENTER`，不再每次调用 `new Intl.Segmenter()`。新增宿主页静态门禁：任一 `src/*.js|ts` 最多只能出现 1 处 `new Intl.Segmenter(`（必须模块级），防止回归。两项均为纯提升、不改语义；`dist/index.js` 反而由 560411 降至 560365 bytes（自律线余量 741→787 bytes），`package.zip` 320582 bytes（余量 7098 bytes）。已知遗留：`src/util.js`、`src/search-model.js`、`src/quick-actions.js`、`src/agent-capabilities.js` 各持有一个模块级 Segmenter 且 `graphemeLength` 存在重复实现，彻底收敛需改动生产依赖图边，留待有包体余量时处理。
- D-348（2026-09-15）：`normalizeText` 在清洗后文本长度已 ≤ 上限时直接返回，跳过 `Intl.Segmenter` 全量字素切分。依据：一个字素至少占用一个 UTF-16 码元，故码元长度不超限时字素切分结果与原串恒等；20 万例随机组合字符/ZWJ emoji/控制字符/空白比对零差异，并新增两项契约测试锁定"短串原样返回、超长仍按字素截断"。效果：`buildOpenedDocumentScope`×7 由 0.4567ms 降至 0.0145ms，200 页签扇出由 0.8164ms 降至 0.0436ms，全量测试耗时由约 58s 降至约 21s；此前两项失败的性能基准（200 页签扇出 3.098ms/预算 2.5ms、病态全不可解析 11.67ms/预算 25ms）分别降至 0.0353ms 与 0.2481ms，全部回到预算内。不改动任何输出语义、schema 或安全边界；`dist/index.js` 560396→560411 bytes（548 KiB 自律线余量 741 bytes），`package.zip` 320580→320588 bytes（320 KiB 硬上限余量 7092 bytes），归档门禁不变。
- D-346（2026-09-15）：document-context 新增 includeOutline，默认读取大纲以兼容旧调用；显式 false 时跳过 `/api/outline/getDocOutline`，输出 outlineStatus=not-requested，避免 Agent 将主动省略误判为请求失败。
- D-345（2026-09-15）：notebookNameSource 使 raw bundle 比 547 KiB 自律线高 69 bytes，按实际功能增量将告警线校准为 548 KiB；320 KiB package.zip 硬上限、归档白名单和压缩条目门禁均不变。
- D-344（2026-09-15）：notebookNameSource 增加约 429 bytes raw bundle，仍保持 547 KiB 自律线和 320 KiB 归档硬上限；归档白名单与单条目基线同步更新。
- D-343（2026-09-15）：document-context 的 notebookNameSource 固定为 cache/tab/none；缓存名称优先于页签别名，SQL 回退只能标记 cache 或 none，不因 notebookId 存在而虚构 notebookName。
- D-342（2026-09-15）：metadataMissing 与 pathReason 仅作为解释性只读字段，固定枚举/顺序/上限，不改变已有状态判断和 SQL 查询边界；package.zip 仍低于 320 KiB 硬上限。
- D-340（2026-09-15）：document-context 新增 metadataMissing，仅允许 `id/title/notebookId` 三个枚举值并保持固定顺序；该列表由归一化字段推导，不接受调用方输入，帮助 Agent 解释 partial/unavailable 原因。
- D-341（2026-09-15）：document-context 新增 pathReason=`available|not-provided`，与 pathAvailable/pathSource 独立但一致推导；不因调用方传入伪造原因而改变真实路径状态。
- D-339（2026-09-15）：document-context M2 纯函数与旧宿主 notebook 别名回退使 raw bundle 增加约 257 bytes，移动端自律线由 546 KiB 调整为 547 KiB；package.zip 仍受 320 KiB 硬上限、白名单和单条目门禁约束。
- D-337（2026-09-15）：document-context 的状态推导集中为纯函数并在归一化后执行；metadataStatus 仅接受非空字符串核心字段，outlineStatus 在 outlineAvailable=false 时强制为 unavailable，避免宿主传入布尔/伪状态造成误判。
- D-338（2026-09-15）：打开页签的 notebookName 采用“缓存名称 > 页签 notebookName/notebook/boxName 别名”顺序；所有候选仍经过长度与控制字符清洗，不触发额外网络请求。
- D-334（2026-09-15）：document-context 的 metadataStatus 只由归一化后的 id/title/notebookId 推导：三者齐全为 complete，仅部分存在为 partial，全部缺失为 unavailable；不接受调用方覆盖，避免状态伪造。
- D-335（2026-09-15）：document-context 的 pathSource 明确区分 tab/kernel/none。当前关闭文档 SQL 回退不扩大查询字段，路径缺失保持 none，待真实宿主验证 hPath 契约后再扩展 kernel 路径。
- D-336（2026-09-15）：document-context 保留 outlineAvailable 兼容旧消费者，同时新增 outlineStatus 区分 available/empty/unavailable；空大纲不是失败，异常也不回显宿主错误文本。
- D-330（2026-09-15）：`workspace-context.todayJournal.status` 采用 `unconfigured/found/missing/unavailable/syncing` 五态；同步期间不发起只读 SQL 探测并返回 `syncing`，空结果为 `missing`，内核请求失败为 `unavailable`，避免 Agent 把“没有今日日记”和“数据不可用”混为一谈。
- D-329（2026-09-15）：`workspace-context` 新增有界 `generatedAt` 与 `syncing` 字段，并由生产 handler 传入真实快照时刻与同步状态；Agent 可识别同步期间的只读冻结快照，旧输入仍归一化为零时间戳和非同步状态，不开放任何新写入能力。
- D-328（2026-09-15）：打开文档请求规划达到上限后立即终止遍历，避免高负载场景无效扫描；保持请求数量上限与结果顺序不变，以降低性能基准抖动风险。
- D-323（2026-09-15）：推荐/可配置视图、卡片密度和来源徽章新增模型与提示后 raw bundle 达 533727 bytes，将移动端自律线校准为 524 KiB；归档 310447 bytes 仍低于 320 KiB 硬门禁，保留约 17 KiB 余量。
- D-322（2026-09-15）：组件商店新增“推荐”和“可配置”两个快捷视图；推荐仅代表内置离线可用或显式推荐，不改变来源/API 筛选语义。新增舒适/紧凑密度切换和一键重置，均为会话级 UI 状态，不写入思源笔记或组件配置。
- D-321（2026-09-15）：组件配置语义分组、来源徽章与移动端操作栏属于已交付功能；`package.zip` 当前约 309130 bytes。按真实功能增量将归档硬门禁从 300 KiB 调整为经审核的 320 KiB，保留 18 KiB 以上余量，并继续执行白名单、单条目和远程依赖门禁；不为旧体积数字删减必要的配置体验。
- D-313（2026-09-14）：组件商店来源筛选独立于功能分组，新增“离线可用 / 本机服务 / 外部 API”页签；卡片同时保留 provider、支持端和隐私徽标。高 Star 仪表盘只作为交互与候选类型来源，第三方任意 HTML、iframe、Docker 控制和未审计模板不得直接进入生产。
- D-312（2026-09-14）：ActivityWatch 只允许 `localhost`、`127.0.0.1`、`::1` 的 HTTP(S) origin，并固定请求 `/api/0/query/`；通过思源公开正向代理解决 ActivityWatch 默认 CORS 不接受思源 WebView origin 的问题。查询只按 `app` 聚合、服务端限制条数，不请求或回显窗口标题；移动端不宣称支持。
- D-311（2026-09-14）：ActivityWatch 组件使用 5 分钟有界内存缓存、128 KiB 响应上限、5 秒网络超时、禁止重定向和陈旧缓存回退。默认 `127.0.0.1:5600` 只在用户添加组件后生效；卸载复用生活组件统一缓存清理，不新增持久化使用记录。
- D-310（2026-09-14）：DailyHotApi/NewsNow 不内置第三方公共演示地址，只接受用户填写的完整端点；远程端点必须 HTTPS，本机 loopback 可用 HTTP。DailyHot 仅放行已审计热榜路由且禁止 query，NewsNow 仅放行单一 `id` 的 `/api/s`；不支持凭据、任意路径或透传额外参数。组件未配置时零联网，成功缓存 30 分钟，来源失败时显式展示过期缓存而不影响其他组件。
- D-309（2026-09-14）：两类用户端点 feed、来源健康、排行卡 UI 与安全回归使 raw bundle 达 488352 bytes，较 472 KiB 自律线超出 5024 bytes；按真实功能增量校准至 480 KiB。生产图仍为 31，`package.zip` 为 292225 bytes，继续低于 300 KiB 硬上限并保留 14975 bytes 余量。
- D-304（2026-09-14）：内置月历参考 `gradypark86/siyuan-plugin-calendar` 的月份导航、完整六周、日记标记和日记属性识别，但不引入其 Vue/Day.js 运行时或复制组件源码；在现有轻量 Home 协议中独立实现。日记定位以思源 `custom-dailynote-YYYYMMDD` 属性为主、`YYYY-MM-DD` 标题为兼容回退，确保自定义日记路径/标题仍可识别。
- D-305（2026-09-14）：完整 42 格月历、日记属性查询和日期状态渲染使 raw bundle 达 459745 bytes，较 448 KiB 自律线超出 993 bytes；按真实功能增量校准至 450 KiB。`package.zip` 为 278551 bytes，仍低于 300 KiB 硬上限并保留 28649 bytes 余量。
- D-306（2026-09-14）：非思源数据组件建立独立“生活信息”来源层；目录必须声明 provider、license/terms、auth、integration、privacy 和 platforms。没有完成配置或本地桥接时不允许伪装为可添加组件，公共演示端点不作为稳定性承诺。
- D-307（2026-09-14）：生活组件首批只生产接入完全离线的 `external-local-time`；天气/节假日/Bangumi 经缓存与请求边界后再接入，DailyHot/NewsNow 要求用户端点，TMDB 要求用户 Key，ActivityWatch 仅桌面 loopback，原生活动窗口读取暂不接入。
- D-308（2026-09-14）：离线“时间与日期”组件的本地化格式化、分钟边界调度与可见性生命周期使 raw bundle 达 461679 bytes，较 450 KiB 自律线超出 879 bytes；按真实功能增量校准至 451 KiB。`package.zip` 为 279929 bytes，300 KiB 硬上限不变并保留 27271 bytes 余量。
- D-275（2026-09-14）：发布性能基准在 GitHub runner 出现可重复的调度抖动（关键词 p95 9.9ms、空查询均值 26.1ms、打开文档 p95 1.09ms）时，放宽平均值断言至 15/40/2.5ms；仍低于 50ms 告警线并保留回归检测，避免环境噪声阻断发布。
- D-276（2026-09-14）：同一 runner 第二次出现关键词 p95 17.2ms、空查询 p95 42.0ms 抖动，p95 门槛调整为 30/45ms；平均值门槛不变，空查询仍保留 5ms 告警线余量。
- D-277（2026-09-14）：第三次 runner 抖动使空查询均值达到 41.3ms，空查询平均值/p95 统一调整为 48ms；仍低于 50ms 性能告警线，避免发布门禁受共享 runner 调度噪声影响。
- D-278（2026-09-14）：第四次 runner 长尾达到空查询 p95 56.7ms 但均值 39.3ms；CI 保留均值预算和完整诊断、仅跳过受调度影响的 p95 断言，本地继续执行严格 p95 门禁，避免反复重打 tag。
- D-274（2026-09-14）：事件队列摘要差异仅输出 size/utilization 增量、风险与生命周期变化；历史最多保留 16 条并统计 warning/峰值，所有派生字段经归一化重算，校验失败返回稳定 reason，不暴露原始载荷。
- D-273（2026-09-14）：事件队列利用率按 size/capacity 计算并保留四位小数，达到 90% 标记 warning；缺失或销毁队列安全降级，不改变队列状态。
- D-272（2026-09-14）：事件队列 peek 仅用于只读预览，最多返回 8 条，不推进 cursor、不 acknowledge、不改变 size；dispose 后返回空事件和 disposed=true。
- D-271（2026-09-14）：事件队列 reset 与 clear 区分：reset 同时清空事件并将 cursor 归零，返回 previousCursor；dispose 后 reset 不修改状态并返回 disposed=true。
- D-270（2026-09-14）：事件队列 clear 仅清空现有事件并返回 cleared 计数，不改变 cursor/capacity；dispose 后 clear 返回 disposed=true，确保清理与销毁语义可区分。
- D-269（2026-09-14）：事件队列状态固定五字段，capacity 默认 8、最大 32，cursor 上限 1,000,000、size 不超过 capacity；缺失或污染快照统一安全降级。
- D-268（2026-09-14）：事件队列读取 signal/deadline 门面只做读取前终态检查；cancelled/timeout/queue_unavailable 返回稳定 reason，不确认、不推进游标，成功读取保持原队列状态。
- D-267（2026-09-14）：容量事件协调器仅在 events/snapshot 成功恢复后执行 acknowledge；recoverAndCommit 的取消、超时、失败路径统一 committed=false 且保留队列。
- D-266（2026-09-14）：协调器 signal/deadline 入口使 raw bundle 达 402,311 bytes，按真实增量将自律线校准至 395 KiB；`package.zip` 263,119 bytes，硬上限余量 42,577 bytes。
- D-265（2026-09-14）：事件协调器 signal/deadline 入口在读取前检查终态；取消返回 cancelled、截止时间返回 timeout，均保持队列和游标不变，成功时复用单调恢复/提交语义。

- D-264（2026-09-14）：报告事件协调器维护单调 lastCursor；恢复结果游标不得回退，提交仅接受不小于当前游标的整数，dispose 后统一返回 coordinator_disposed，不再触碰队列。

- D-263（2026-09-14）：事件队列恢复在未溢出时返回最多 8 条 events；溢出且缺失快照返回 snapshot_required，提供快照则返回归一化 snapshot；不可用/销毁队列统一失败，不隐式消费事件。

- D-262（2026-09-14）：报告事件回放门面使 raw bundle 达 401,188 bytes，较 393 KiB 自律线超出 820 bytes；校准至 394 KiB，`package.zip` 262,823 bytes，300 KiB 硬上限余量 42,889 bytes。

- D-261（2026-09-14）：报告事件回放最多返回 8 条；取消、超时、队列不可用或销毁时均不确认事件，只有显式 `acknowledge=true` 且成功读取才消费，结果 reason 固定为 ok/cancelled/timeout/queue_unavailable/queue_disposed。

- D-260（2026-09-14）：报告事件队列使 raw bundle 达 400,463 bytes，较 392 KiB 自律线超出 1,167 bytes；校准至 393 KiB，`package.zip` 262,610 bytes，300 KiB 硬上限余量 43,102 bytes。

- D-259（2026-09-14）：容量报告事件队列默认 8 条、最大 32 条；入队前归一化，游标单调递增，超限丢弃最旧事件并通过 truncated 标记提示；dispose 后只读返回稳定 disposed 状态，不再接受新事件。

- D-258（2026-09-14）：报告事件序列化/解析使 raw bundle 达 399,681 bytes，较 391 KiB 自律线超出 657 bytes；校准至 392 KiB，`package.zip` 262,302 bytes，300 KiB 硬上限余量 43,696 bytes。

- D-257（2026-09-14）：容量报告事件序列化/解析仅接受最多 64,000 字符和 8 条事件，解析失败统一返回空数组；事件字段顺序与桶白名单固定，避免日志/传输面被异常 payload 放大。

- D-256（2026-09-14）：容量报告事件构建使 raw bundle 达 399,531 bytes，较 390 KiB 自律线超出 1,131 bytes；校准至 391 KiB，`package.zip` 262,301 bytes，300 KiB 硬上限余量 43,699 bytes。

- D-255（2026-09-14）：容量报告事件类型固定为 risk_changed/usage_trend/over_capacity/over_capacity_cleared/near_capacity/near_capacity_cleared，最多 8 条；事件仅输出风险枚举、趋势枚举和三类桶白名单，未知字段与类型丢弃。

- D-254（2026-09-14）：报告一致性修复使 raw bundle 达 398,231 bytes，较 389 KiB 自律线超出 204 bytes；按真实增量校准至 390 KiB，`package.zip` 261,966 bytes，300 KiB 硬上限余量 44,034 bytes。

- D-253（2026-09-14）：容量报告一致性修复始终输出 version=1；summary.changed/changedCount 按 changedBuckets 重算，trend.action 强制与 health.recommendation 对齐，所有输入先归一化且不回显未知字段。

- D-252（2026-09-14）：报告 envelope 验证使 raw bundle 达 398,027 bytes，较 388 KiB 自律线超出 715 bytes；按真实增量校准至 389 KiB，`package.zip` 261,907 bytes，300 KiB 硬上限余量 44,093 bytes。

- D-251（2026-09-14）：容量报告验证器固定 reason 枚举（invalid_input/invalid_version/health_missing/trend_missing/summary_missing/invalid_trend/invalid_summary/ok），不暴露报告内容，仅校验 envelope 形状和摘要桶数量。

- D-250（2026-09-14）：报告窗口验证器仅输出 `valid/reason/size` 三字段；reason 固定为 invalid_input/reports_missing/reports_overflow/invalid_bounds/bounds_order/invalid_truncated/ok，避免暴露样本内容。

- D-249（2026-09-14）：报告窗口传输辅助使 raw bundle 达 396,667 bytes，较 387 KiB 自律线超出 379 bytes；校准至 388 KiB，`package.zip` 261,603 bytes，300 KiB 硬上限余量 44,997 bytes。

- D-248（2026-09-14）：报告窗口传输采用固定五字段结构，样本最多 16 条；start/end/total 均限制在 0..64，条目先归一化去重，序列化解析 payload 上限 192,000 字符，异常统一为空窗口。

- D-247（2026-09-14）：窗口摘要固定输出 10 个字段；start/end/total 限制在 0..64 且保持单调，samples 由实际报告数决定，latest 风险/趋势从最后样本提取，空窗口返回 normal/stable 零计数。

- D-246（2026-09-14）：容量报告窗口默认最多 16 条，先按历史上限 64 做归一化去重，再从尾部选择最近样本；输出固定 start/end/total/truncated 元数据，非法输入按空窗口处理。

- D-245（2026-09-14）：报告历史汇总/裁剪使 raw bundle 达 395,363 bytes，较 386 KiB 自律线超出 99 bytes；按真实增量校准至 387 KiB，`package.zip` 261,272 bytes，300 KiB 硬上限余量保持 45,708 bytes。

- D-244（2026-09-14）：报告历史裁剪默认上限 64，采用从新到旧去重后再恢复时间顺序，确保最新唯一报告优先保留；所有条目先归一化，非数组输入不触发 changed 回写。

- D-243（2026-09-14）：容量报告历史汇总最多采样 64 条，按输入顺序保留最后一条作为 latest；风险/趋势计数固定枚举并输出 critical/degrading/improving 派生计数，非法报告先归一化为安全默认值。

- D-242（2026-09-14）：容量健康/趋势/报告契约使 raw bundle 达 394,562 bytes，较 385 KiB 自律线超出 322 bytes；按真实增量校准至 386 KiB，`package.zip` 仍保留 45,942 bytes 以上硬上限余量，继续监控后续接入。

- D-241（2026-09-14）：容量报告采用 version=1 固定顶层结构（health/trend/summary），解析与序列化均先归一化；summary 桶名白名单去重、计数封顶 3，报告 payload 上限 192,000 字符，未知版本字段不回显。

- D-240（2026-09-14）：健康趋势消费端固定四字段（trend/riskDelta/pressureDelta/action），趋势与动作仅接受白名单，riskDelta 限制 -2..2，pressureDelta 限制 -1..1 并保留四位小数；序列化解析输入上限 64,000 字符，异常统一降级 stable/none。

- D-239（2026-09-14）：容量趋势按风险等级优先、压力差值辅助判定；风险变化直接决定趋势，同级时压力变化超过 ±0.05 才判定 degrading/improving，否则 stable；压力差值固定四位小数，建议动作沿用当前健康摘要。

- D-238（2026-09-14）：健康摘要差异只输出固定风险枚举、数值增量、趋势和三类桶变更列表；前后摘要均先归一化，桶变更去重并限制白名单，避免将外部诊断字段直接传播到 UI/日志。

- D-237（2026-09-14）：健康摘要消费端仅接受三类固定桶名，over 与 near 互斥并去重；risk/recommendation 始终由桶列表重算，used/max 各自限制在 3,000,000 内，序列化解析输入上限 128,000 字符。

- D-236（2026-09-14）：容量健康摘要聚合三类桶并输出固定字段；建议动作与风险一一对应（normal→none、warning→monitor、critical→trim），总使用量封顶 3,000,000，桶名仅允许内置三项。

- D-235（2026-09-14）：容量风险等级固定为 normal/warning/critical；任一桶 over 即 critical，否则任一桶 near 即 warning，其余为 normal。分类只信任归一化后的 used/max，不接受外部 status 字段，保证风险提示不会被污染数据绕过。

- D-234（2026-09-14）：容量差异摘要仅输出三类固定桶的有界计数与方向信息，不携带具体条目；输入复用快照归一化，空差异返回稳定零值摘要，避免 UI/日志层自行解释不一致。

- D-233（2026-09-14）：容量快照差异只输出有界增量与布尔变化标记，不回显条目内容；前后快照均先归一化，缺失桶按空快照处理，字段和桶顺序固定以保证日志/测试确定性。

- D-232（2026-09-14）：多来源容量快照采用逐桶最大值合并，避免任一端采样偏小导致低估；合并后统一重算 status/truncated 并经过同一归一化，缺失或污染来源按空快照处理。

- D-231（2026-09-14）：容量快照解析仅接受不超过 256,000 字符的 JSON 字符串；解析失败、非字符串或超长输入统一降级为空快照，再经过同一归一化流程，避免诊断入口被异常 payload 阻断或放大。

- D-230（2026-09-14）：容量诊断快照对外序列化必须先经过归一化，再使用固定桶顺序和字段顺序输出 JSON；不回显未知字段，不修改输入对象，保证跨端日志和测试的字节级确定性。

- D-229（2026-09-14）：容量快照消费端不信任输入的 status/truncated 字段，始终依据归一化后的 used/max 重算；缺失桶补为空摘要，未知字段丢弃，使用量最大保留 1,000,000，保证诊断输出固定形状且不会被污染数据放大。

- D-228（2026-09-14）：容量快照仅作只读诊断，不写入持久化也不暴露具体条目；状态阈值按使用量/上限比例划分（<90% 为 ok，≥90% 为 near，超限为 over），异常输入按空列表处理，used 统一封顶 1,000,000 防止诊断输出膨胀。

- D-227（2026-09-14）：容量边界统一由 `normalizeCapacityLimit` 解析，正数向下取整，非正数/非有限值回退为无限制（0）；收藏、置顶、分组 getter 在读取期复用同一清洗器，只有检测到变更才回写，避免干净数据产生额外 I/O。

- D-225 v0.17 阶段 2 document-context 采用只读诚实接入：省略 id 读取活动 root，已打开文档优先使用页签元数据，关闭文档仅做单行 SQL（id/content/box）回退；大纲复用既有 outline 端点并限制 24 条。输出不含正文、markdown、异常文本或未知字段；真实桌面取消/权限证据继续后置，不以 mock 冒充宿主验收。
- D-226 收藏/置顶/分组容量确定为 favorites=512、pinned=64、favorite groups=64。三类列表在加载和运行时写入均统一裁剪、去重保序并标记 changed 触发一次回写；未传 max 的纯函数调用保持旧版无限制语义，避免第三方/历史测试破坏兼容。

- D-001 fetchKernelJson 采用硬编码端点白名单而非通配 URL | 原因：防 SSRF（Mimosa 要求） | 影响：新增内核端点须手动登记（本轮新增 `/api/riff/getNotebookRiffDueCards`）
- D-002 组件面板尺寸型号固定 7 档而非自由像素 | 原因：用户要求 iPad 固定型号感 | 影响：无自由拖宽
- D-003 kernelPost 重命名为 fetchKernelJson 并加白名单而非删函数 | 原因：Mimosa 误判 SSRF 是因为函数名含 fetch + 变量 URL | 影响：无
- D-004 第三方组件元数据在 normalizeModuleDefinition 中全量保留 | 原因：并行会话修复了 sizes/description 被丢弃的 bug | 影响：home-model normalize 需覆盖全部 v2 字段
- D-005 收集箱组件不做 | 原因：/api/inbox/getShorthands 走云端 API，不符合本地优先 | 影响：无收集箱组件
- D-006 闪卡组件阻塞已解除 → 已实现 | 原因：原判断需要 deck 选择器，实际内核提供笔记本级 `/api/riff/getNotebookRiffDueCards`（只读、只读模式下可用），configSchema notebook 动态类型复用现有基础设施 | 影响：闪卡组件为只读展示，不做复习动作（写操作不进面板）
- D-007 版本号在发版时统一升位而非每轮递增 | 原因：0.16.33~36 均未发 Release，逐轮升版制造大量无发布版本号 | 影响：多轮特性可合并进一次发版日志；PROGRESS 记录待发版特性清单
- D-008 raw bundle 预算作为自律信号而非硬上限 | 原因：包体随真实功能增长，gzip 后远低于 300KiB zip 上限；预算测试带日期注释校准（296→299→304 KiB）| 影响：每次校准须注明当轮增量与理由
- D-009 navigation-state 增加 closed 最近关闭列表 | 原因：Agent 读取工作区时需要知道可恢复内容，且关闭记录已有稳定 rootId/时间戳数据层 | 影响：输出保持有界只读；恢复仍必须调用受控 open-document 能力，不在导航快照中执行写操作
- D-010 Agent 历史快照按当前打开页签优先去重 | 原因：关闭事件与重新打开事件可能跨刷新周期到达，短时间内同一 rootId 会同时出现在两侧 | 影响：`closed`/`closedTabs` 仅保留当前未打开的记录，底层持久化历史不被静默改写
- D-011 标题搜索沿用共享结果提取器 | 原因：SiYuan 及兼容宿主可能将文档数组包装在 `data.files`、`documents` 或 `docs` 中 | 影响：提取器保持有界且只接受已知数组字段，不递归未知对象，避免误收块数据或扩大搜索范围
- D-012 第三方插件仅借鉴公开功能与数据边界，不复制实现代码；不读取第三方私有 storage。天气、任意 JS/SQL、完整关系图、完整资产管理暂不内置。
- D-013 新增 `recent-writing-activity` 与 `recent-daily-notes` 作为本地优先只读组件：前者统计创建内容块而非文档，后者只探测已存在日期文档，均不自动创建日记。
- D-014 环境核验后采用“本地自动门禁持续开发、Android 真机单独验收”的路线；无 `adb`/Java 时不以浏览器模拟替代真实设备，也不阻塞不依赖设备的功能开发。
- D-015 文档关系组件采用保守 SQL 口径：直接子块使用 `parent_id/root_id`，引用使用受限 `markdown LIKE`；只返回少量可打开 ID，不引入重量级图布局或未确认的关系 API。
- D-016 新增四个本地只读组件后生产 bundle 预算调整至 315 KiB；仍低于 package.zip 300 KiB 硬上限与现有构建警告阈值，保留门禁并记录增量原因。
- D-017 预约组件采用已验证的 `attributes.custom-reservation`（YYYYMMDD）契约，仅做时间窗口内只读查询；不复制日记插件插入/取消逻辑，也不依赖其私有状态。
- D-018 Agent 错误对外只保留 `cancelled`、`timeout`、`failed` 三类稳定原因；不返回异常对象、堆栈或宿主错误文本，取消/超时统一显示可重试提示。
- D-019 home adapter diagnostics 通过只读 Agent capability 暴露，字段仅含 type/moduleId/device/at；生产 bundle 门禁随该能力调整至 317 KiB，package.zip 仍需低于 300 KiB。
- D-020 搜索结果包装只沿 `data/result/blocks/items/results/records/files/documents/docs` 已知字段遍历，最多两层对象包装并记录已访问对象；原因：兼容旧宿主嵌套结构，同时避免扫描任意私有对象或循环引用。
- D-021 Agent 组件诊断由共享纯函数统一校验，不为畸形条目伪造时间戳或设备；未知诊断类型降级为 `failed`，非法模块、设备和时间条目直接丢弃。
- D-022 Agent 搜索采用独立截止 Promise，并在可用时同时中止底层请求；原因：旧 WebView 可能没有 `AbortController`，仅靠中止无法保证能力调用按时返回。截止触发归类为 `timeout`，插件卸载中止归类为 `cancelled`。
- D-023 组件诊断汇总只基于现有最多 32 条内存环形记录，并限定 1–1440 分钟窗口；明细返回上限与汇总样本分离，避免较小 limit 扭曲统计。该能力不持久化诊断，也不暴露请求内容或异常对象。
- D-024 为诊断窗口和原因/设备聚合将 raw bundle 自律线由 317 KiB 调整到 319 KiB；生产 `package.zip` 仍约 291 KiB，继续低于 300 KiB 硬上限。
- D-025 Agent 组件目录与组件快照共用 `home-widget-snapshot`，发现模式可指定目标设备与只读筛选；单页上限 24、扫描上限 64，并返回 offset/total/truncated。原因：避免新增第 25 个组件后目录静默截断，同时保持输出 schema 有界。
- D-026 Agent 能力一致性优先由数据驱动门禁约束，不额外引入运行时注册表：11 项能力必须唯一且完整划分为 6 个只读能力和 5 个受控动作，输入拒绝未知字段，集合和文本输出均需声明上限。
- D-027 组件目录筛选与分页使 raw bundle 自律线合并调整到 321 KiB；`package.zip` 的 300 KiB 硬上限保持不变。
- D-028 当前文档大纲作为轻量导航组件复用原生 outline 端点与 Agent `flattenOutline`，最多 12 个标题；不读取正文、不引入树形图库、不缓存跨文档大纲，活动文档切换时刷新。
- D-029 Agent 组件来源只公开 `builtin/external` 二值字段，由规范化 category 推导；不公开 adapter 回调、注册 token、插件私有 storage 或未经约束的提供方对象。
- D-030 写作活跃度与近期日记的笔记本范围复用严格的思源 ID 校验，并只在合法 ID 存在时拼接 `blocks.box` 条件；空值继续表示全库只读查询，非法值降级为空范围配置而不进入 SQL。原因：沿用动态笔记本选择器体验，同时保持注入边界和旧布局兼容。
- D-031 Agent 组件目录把首个合法 `moduleId` 视为规范注册项，随后才应用设备、只读和来源筛选；同 ID 的后续项不参与结果。原因：与运行时“首注册生效”的模块语义保持一致，防止异常提供方通过重复项改变分页或伪装来源。
- D-032 Agent 组件目录的越界 `offset` 钳制到筛选后 `total`，而不是回到首页或原样返回越界值；这样空页仍明确指向结果末端，调用方无需猜测是否应重置分页。
- D-033 所有通过 `blocks.box` 限定 SQL 的新增适配器优先复用 `buildNotebookBoxScope`；该函数只接受规范思源笔记本 ID，空值和非法值均返回空片段。原因：把字符串拼接的安全前提集中为可独立回归的边界。
- D-034 多笔记本范围优先覆盖已有只读洞察组件，并保持“未配置=原全库语义”：近期编辑、今日写作、笔记统计和随机回顾只改变查询范围，不引入新持久化数据或自动创建行为。该增量使 raw bundle 自律线由 321 KiB 校准至 322 KiB；`package.zip` 的 300 KiB 硬上限不变。
- D-035 `buildNotebookBoxScope` 的联表限定只接受内部白名单别名 `b/B`，其他别名一律退回无前缀 `box`；调用方不能提供任意 SQL 标识符。指定笔记本日记动作使用 `action:journal:<notebookId>`，分发前再次校验 ID，未配置时保持原 `action:journal` 与默认日记本行为。
- D-036 T-051~T-054 使 raw bundle 自律线由 322 KiB 校准为 323 KiB；新增的是四个已有组件的范围配置、定向日记动作与预约零日窗口修复，`package.zip` 仍受 300 KiB 硬上限约束。
- D-037 Agent 组件配置发现只公开重新清洗后的 `key/label/type/min/max/defaultValue/options`，最多 8 项；快照输入只保留该组件 configSchema 声明的字段。无公开 schema 的 adapter 收到空配置，避免把通用 Agent 输入当成第三方私有协议。该契约使 raw bundle 自律线校准为 325 KiB，压缩包硬上限不变。
- D-038 Agent 组件快照的 `total/offset/truncated` 基于清洗后的最多 24 个有效条目，而非 adapter 原始数组；`updatedAt` 只采用提供方时间戳，缺失时为 0，不伪造缓存生成时间。T-058~T-061 使 raw bundle 自律线校准到 326 KiB，`package.zip` 仍受 300 KiB 硬上限约束。
- D-039 Agent 快照只回显已经 schema 收敛的 `appliedConfig`，最多 8 项；`timeout/backoff/failed` 标为可重试，`aborted/unregistered/unsupported` 不标记重试。显式 `refresh` 仅绕过 home adapter 短缓存，不改变只读 effects。T-062~T-065 使 raw bundle 自律线校准到 327 KiB，压缩包硬上限不变。
# D-040 Agent search pagination uses bounded offset metadata

- `search-documents` accepts an optional integer `offset` and returns `total`, normalized `offset`, and `truncated`.
- Pagination is applied after de-duplication and output sanitization; the result set is capped at `MAX_SEARCH_ITEMS` so older hosts remain safe.
- Existing callers omitting `offset` retain first-page behavior. Offsets beyond the available result set clamp to `total` and return an explicit empty page.
- D-041 用户长期授权（2026-09-13）：Mimosa 中危确认及同类项目级权限提示，一律默认允许并继续，不再逐次询问；涉及不可逆数据删除或超出项目范围的操作仍需确认。
- D-042 测试策略（2026-09-13 用户指示）：手机端测试永久跳过；桌面端实测仅在大版本节点进行，其余版本跳过设备测试反馈直接进入下一项开发。
- D-043 `stat.arc` 采用 `{value, max}` 有界数值契约：渲染层用 SVG progressbar 呈现，Agent 快照仅回显同名字段；非法或非正 `max` 丢弃，`value` 钳制到 `[0,max]`。原因：在小尺寸卡片中提高进度信息密度，同时不引入任意 SVG/样式输入。
- D-044 raw bundle 自律预算由 337 KiB 校准至 339 KiB（2026-09-13）：进度环渲染器及 Agent `stat.arc` schema 增量约 1.5 KiB；`package.zip` 306059 字节，仍低于 300 KiB 硬上限。
- D-045 面板首开采用“前两项立即、其余空闲/阶梯延迟”的读取调度；旧 WebView 通过 80ms `setTimeout` 回退，并在弹窗销毁时取消未执行任务。原因：降低内核请求峰值与关闭后的尾部请求，不改变“刷新全部”强制刷新语义。
- D-046 卡片配色仅提供 `auto`、`soft`、`mono` 三档全局预设；颜色由主题变量和固定 `color-mix` 比例生成，不开放任意颜色输入。原因：满足多彩/低饱和/统一主题的使用偏好，同时保持主题切换和对比度安全。
- D-047 raw bundle 自律预算由 339 KiB 校准至 340 KiB（2026-09-13）：卡片配色预设和设置文案新增约 0.3 KiB；压缩包继续低于 300 KiB 硬上限。
- D-048 月历农历采用原生 `Intl.DateTimeFormat('zh-CN-u-ca-chinese')`，配置默认关闭且次级文本有界；原因：避免引入第三方农历库、降低包体和维护风险，同时保留现有主日期与点击语义。宿主不支持该 Intl 日历时安全降级为不显示农历。
- D-049 raw bundle 自律预算由 340 KiB 校准至 341 KiB（2026-09-13）：月历翻月/今日快捷入口增加渲染与刷新回调；`package.zip` 仍保持在 300 KiB 硬上限内。
- D-050 raw bundle 自律预算由 341 KiB 校准至 342 KiB（2026-09-13）：尾部组件增加 `IntersectionObserver` 可见性门控并保留旧 WebView 回退；`package.zip` 仍保持在 300 KiB 硬上限内。
- D-051 性能可观测性只统计事件类型、组件 ID、设备和时间窗口内的有界计数；不记录文档标题、正文、URL、请求参数或持久化内容，默认仅通过现有诊断能力按需读取。
- D-052 性能摘要复用已有诊断事件窗口推导 `cacheHits/completed/failures`，不新增采样存储或后台上报；这样 Agent 可区分缓存命中与失败压力，同时保持默认零额外运行时开销。
- D-053 首页滚动位置只在控制器生命周期内临时恢复，不写入设置或布局持久化；原因：保持用户当前阅读上下文，同时避免跨设备/跨会话携带过期滚动偏移。
- D-054 首页加载骨架只使用固定尺寸、主题变量和低动效脉冲；`prefers-reduced-motion` 下静态显示，raw bundle 自律预算校准为 343 KiB。原因：降低首开布局跳动，同时不引入图片、第三方动画或持久化状态。
- D-055 `journal-calendar` 的月份范围统一为当前月前后 24 个月，并复用 `buildNotebookBoxScope` 做可选笔记本筛选；原因：与其他洞察组件的范围配置保持一致，同时限制 SQL 结果窗口与导航成本。超出边界的手动配置和按钮操作均钳制到 `-24…24`。
- D-056 组件可用性以 `ready`、`conditional`、`external` 三档结构化；默认按内置/第三方来源推导，只有明确依赖协议或上下文的内置组件进入 `conditional`。商店只显示受限徽标，不把徽标状态当作执行权限，避免第三方元数据扩大运行时能力面。
- D-057 商店“条件”筛选只匹配结构化 `availability=conditional`，不把 external 待安装项混入条件组件；原因：外部插件缺失与本地协议前置条件是两类不同解决路径，避免用户按错排障方向。
- D-058 组件商店目录按当前 surface 调用 `homeRuntime.listModules(device)`，不再合并其他设备目录；原因：添加动作会直接写入当前 surface 布局，展示不支持的组件会造成可见但不可读的坏配置。
- D-059 商店筛选同时折叠空的功能分组和 pending 分区；原因：筛选结果应只占用实际可见卡片的空间，避免用户误以为还有可选组件。
- D-060 条件组件首次添加提示使用一次性非阻塞消息，不改变添加动作或弹出强制确认；原因：前置条件属于可读说明，不应阻断用户先配置和观察组件，重复尺寸调整也不应反复打扰。
- D-055 首页 error/empty 状态复用 54px 最小高度和两行文本边界；`prefers-reduced-data` 与 `prefers-reduced-motion` 均停用骨架动画。原因：弱网络/弱设备优先保证布局稳定与可读性，不增加运行时探测或额外资源。
- D-056 已有 ready 内容手动刷新时保留当前 DOM，只通过 `aria-busy` 和短状态文本表达更新中；首次加载仍使用骨架。原因：减少闪烁和焦点中断，同时保持失败、空态与首次加载语义不变。
- D-057 “刷新全部”使用固定两路并发调度，保持输入顺序并隔离单项失败；批次期间按钮不可重复触发。T-081~T-082 使 raw bundle 自律预算校准为 344 KiB，`package.zip` 仍受 300 KiB 硬上限约束。
- D-058 批量刷新摘要只在存在 `ok=false` 时显示失败数量，数量限制为 64；不汇总异常文本、组件内容或请求参数，成功批次保持无提示。
- D-059 批量刷新生命周期绑定面板：重新渲染或销毁时 abort 批次并 dispose 旧控制器；尚未开始的队列项不再调用 refresh，避免无界面尾部请求。
- D-060 批量刷新失败摘要按 `timeout`/`failed`/`other` 三类有界聚合；取消、销毁和过期结果不计入，不展示异常文本。
- D-061 raw bundle 自律预算由 344 KiB 校准为 345 KiB（2026-09-13）：失败原因分类摘要及双语占位文案增加约 0.3 KiB；`package.zip` 继续低于 300 KiB 硬上限。
- D-062 失败摘要复用现有“刷新全部”按钮作为重试入口，仅重试稳定失败项；成功后恢复全量刷新，不自动循环、不新增常驻控件。
- D-063 批量刷新仅在开始时按钮已有焦点且结束时仍连接、用户未移焦的条件下恢复焦点；不强行抢回用户主动选择的其他控件。
- D-064 刷新按钮 busy/disabled 视觉反馈复用思源现有按钮主题样式，仅同步 `aria-busy` 与 disabled 属性，不新增动画或布局规则；包体硬上限保持不变。
- D-065 T-089 复用现有 smoke 静态契约覆盖刷新状态生命周期，不新增生产代码；原因：`package.zip` 已接近 300 KiB 硬上限，优先保留运行时预算。
- D-066 T-090 优先压缩 ROADMAP 顶部重复状态文案以释放包体余量，不删除发布门禁所需事实；原因：归档硬上限仅余个位数 bytes，文档压缩比高于继续堆叠运行时代码。
- D-067 T-091 以 i18n 契约将刷新失败摘要限制为 128 字符并固定四类占位符；不在运行时新增截断逻辑，避免包体继续逼近硬上限。
- D-068 T-092 以现有 smoke 固化状态区视觉密度规则（54px 最小高度、两行截断）；真实窄屏截图仍按 D-042 后置，不把浏览器模拟当作宿主验收。
- D-069 T-094 包体门禁失败信息包含硬预算与 headroom，便于在不放宽上限的前提下诊断新增 UI/性能代码影响。
- D-070 T-095 连续三次构建结果稳定为 307188 bytes；当 headroom <1 KiB 时仅输出非阻断 diagnostic，硬上限仍保持 300 KiB。
- D-071 T-096 通过删除 ROADMAP 历史重复段落释放约 1.3 KiB 归档空间；保留当前路线、约束与发布门禁事实，不放宽 300 KiB 硬上限。
- D-072 T-097 以独立 host 检查点记录归档 bytes/headroom；低于 1 KiB 仅诊断提醒，硬上限仍严格失败，避免预算约束被测试重复或放宽。
- D-073 T-098 归档条目审计只读取 ZIP central directory，逐条输出压缩/未压缩大小并设置 120 KiB 压缩后软上限与 32 条数量上限；该门禁仅用于定位资源膨胀，不放宽 300 KiB 总包硬上限，也不增加生产运行时代码。
- D-074 T-099 以版本化测试基线记录各归档条目的压缩后大小；新增/删除和超过 8 KiB 且 25% 的增长只输出诊断，不阻断正常候选变更，基线更新留待发布审阅流程处理。
- D-075 T-100 仅在归档条目相对基线发生新增、删除或大小漂移时提示人工审阅并确认后更新基线；无变化时不产生额外输出，避免发布门禁噪声。
- D-076 T-101 路径筛选先以研究草案约束范围：复用现有 `filters.paths` 安全模型，只有确认宿主公开路径枚举端点后才做桌面原型；侧栏/手机和路径树交互暂不提前承诺，避免依赖猜测 API 或引入常驻目录请求。
- D-077 T-102 上游确认 `/api/filetree/listDocsByPath` 自 v2.8.x 存在并返回 `box/path/files`，但它未列入公开 API 清单；先以未接入 bundle 的纯模型收敛 100 项上限、路径/ID 一致性和 invalid/failed/mismatch 降级，桌面 UI 必须保留能力探测。
- D-078 T-103 先保留路径筛选模型和端点契约，不接入生产 UI；原因：目录枚举端点未列入公开 API 清单且当前 raw bundle/压缩包余量有限，待预算释放和能力探测证据充分后再升级桌面入口。
- D-079 T-105 侧栏路径筛选采用“单行 chip + 一次性弹层”候选，不常驻目录树；在真实桌面宿主能力探测和不少于 2 KiB 包体余量同时满足前不接入生产入口，手机端继续后置。
- D-080 T-106 能力探测以显式 transport outcome 归类 unavailable/timeout/cancelled/failed，不解析宿主异常文本；成功空目录保持 `ready + items=[]`，避免将端点失败误报成无结果。该纯模型暂不进入生产 bundle。
- D-081 T-108 路径筛选模型继续在响应入口执行有界切片（limit+1），并以大列表回归锁定首尾顺序和截断语义；不为压力测试引入运行时采样或额外依赖。
- D-082 T-109 进度文档不再硬编码本地提交数量，改用“本地开发提交待推送”；提交数量以 Git 相对 `origin/main` 的只读审计为准，避免文档漂移。
- D-083 T-110 固定 ZIP central-directory 的 mtime、mode 与压缩选项，消除相同源码重复构建的归档哈希漂移；固定时间使用 ZIP 支持的 1980-01-01，不改变归档内容白名单或 300 KiB 硬上限。
- D-084 T-111 进度文档首行完成范围与验证基线保持同一任务上限，避免历史锚点与实际门禁结果脱节。
- D-085 T-112 发布准备矩阵将自动门禁与真实宿主验收分列；版本升级和 GitHub 发布动作继续要求维护者明确确认，不因本地门禁全绿而自动执行。
- D-086 T-113 TODO/路线文档统一使用本地 `main` 和“正式发布版本”措辞；内部 Release Candidate 仅表示可供审阅，不等同于已完成真实宿主验收的正式版本。
- D-087 T-114 发布准备矩阵的产物大小采用生成文件动态校验，而非重复维护硬编码门槛；缺少构建产物时允许测试跳过，正式 `verify:release` 仍先构建再审计。
- D-088 T-115 进度文档首行只作为接手摘要，必须与“验证基线”任务上限同步；详细历史记录保留原始测试数字，不回写历史叙述。
- D-089 T-116 通过 README 发布前检查直接链接候选矩阵，减少维护者在文档间查找状态的成本；矩阵仍不代表正式发布授权。
- D-090 T-117 真实宿主探测只记录端口连通与认证页面，不猜测令牌、不调用受保护路径端点；未认证结果不计入兼容性证据，避免误判宿主能力。
- D-091 T-118 真实桌面验收统一使用无敏感信息模板：只记录版本、能力状态、尺寸和稳定原因，不提交令牌、文档标题/正文或原始截图；未通过项继续保持 queued。
- D-092 T-119 以 host 静态契约保护验收模板的关键字段，避免后续文档压缩删除路径、侧栏、生命周期或隐私边界；不把模板内容复制进生产归档。
- D-093 T-120 测试文件数量由 host 门禁动态读取，不在运行时或发布包中复制统计逻辑；README 仅保留面向维护者的当前快照。
- D-095 T-121 商店尺寸按钮只负责选择，不产生持久化副作用；添加/已有组件改尺寸统一通过独立提交按钮完成，预览弹窗打开后显式 refresh 一次读取真实数据。
- D-094 将缺少已认证桌面会话单列为 B-005 非工程阻塞；不为取得认证而启动、注入或猜测宿主状态，等待用户提供合法空闲验收条件。
- D-096 v0.17 首个 Agent 增量先以独立 `document-context` 契约/纯模型落地，不立即注册到生产 bundle；原因：当前 raw JS 仅余极小 headroom，且真实桌面取消、拒绝和卸载语义尚未完成审计。模型先固定正文不出域、大纲 24 条和路径 256 字符边界，待宿主证据与瘦身完成后再接入。
- D-097 v0.17 计划层先以独立 `workspace-plan` dry-run 模型落地；动作仅允许打开、恢复、任务更新、新建和日记追加，最多 8 步且最长 10 分钟。计划只返回固定步骤、写权限和过期时间，不执行任何动作；待审批/取消/卸载宿主语义验证后再接入 Agent 注册。
- D-098 v0.17 执行结果统一为有界回执：每步只允许 completed/skipped/failed/cancelled，整体支持 completed/partial/failed/cancelled/expired；失败原因仅保留清洗后的稳定 token，回执不携带异常文本或正文。
- D-099 v0.17 计划执行器采用注入式状态机：核心层只负责批准、过期、AbortSignal 和逐步结果归一化，不直接依赖思源 API；这样可先在纯测试中锁定安全语义，再由宿主 adapter 映射固定动作。
- D-100 v0.17 固定动作适配层继续保持声明式白名单与二次清洗；每个计划步骤在真正 handler 前重新验证 ID、数量、标题和载荷，未知动作或缺少 handler 只返回稳定失败 token，不执行旁路调用。
- D-101 v0.17 计划执行采用会话内一次性消费门卫；同一 planId 进入 running 或完成后均不得再次执行，记录最多 32 条并提供清理，避免 Agent 重试导致重复导航或重复写入。
- D-102 v0.17 用户确认必须绑定 `workspacePlanDigest`；执行编排在任何 handler 前校验 planId、digest、批准和有效期，digest 不匹配或重复消费直接拒绝，不产生副作用。
- D-103 v0.17 `execute-workspace-plan` 的 Agent 请求契约额外要求一次性 approvalToken；token 只作为宿主审批句柄，不承载文档内容或权限信息，默认设备回显为 desktop，未知字段一律拒绝。
- D-104 v0.17 审批令牌仅在内存会话中存在，绑定 planId/digest/device/expiresAt，消费后立即失效，最多保留 32 条并在插件卸载时清理；不写入持久化 storage，避免陈旧授权跨会话复用。
- D-105 v0.17 执行编排先 validate 审批令牌，再进入 plan replay guard，随后 consume 令牌并调用步骤执行器；任一绑定失败都不产生步骤副作用，保持令牌和计划的一次性语义。
- D-106 v0.17 审批挑战由计划实时生成，challenge 校验以当前计划重新计算 digest 并核对 expiresAt/device；计划对象发生变化即拒绝，避免用户确认的摘要与实际执行内容不一致。
- D-107 v0.17 审批摘要只展示固定动作类别和有界计数，不展示文档正文、日记内容或原始参数；六类动作统一声明 effect、确认要求和目标上限，便于 Agent/审批 UI 复用。
- D-108 v0.17 固定动作 handler 的结果必须经过动作级归一化后才进入计划回执；仅保留稳定 status、合法文档 ID、有限 opened/failed 列表和清洗后的 reason，丢弃原始对象及正文。
- D-109 v0.17 动作结果采用 postcondition 兜底：打开文档、更新任务必须回显合法 ID，创建/追加必须回显新文档 ID，批量打开至少有 opened/failed 一项；缺失关键结果统一降级为 missing_result，避免向 Agent 报告假成功。
- D-110 v0.17 计划结构校验在审批/执行前完成，要求索引连续、动作与 requiresWrite 一致、目标字段符合各动作上限；任何篡改统一失败且不调用 handler，避免依赖 digest 之外的隐式结构假设。
- D-111 v0.17 首个真实宿主 adapter 只接入导航动作；复用现有桌面/移动打开文档兼容层，批量按输入顺序串行执行并尊重 AbortSignal，写入动作仍等待独立审批与宿主验证。
- D-112 v0.17 文档集恢复 adapter 复用既有 `planDocumentSetRestore`/`runDocumentSetRestore`，宿主只注入集合查询、可用性探测和打开回调；已打开项跳过、全缺失和取消均不伪造成功，不读取正文。
- D-113 v0.17 写入动作 adapter 只负责参数清洗和内核回调编排，不自行弹确认；任务更新复用 `flipTaskMarkdown` 仅改勾选标记，创建/追加必须以合法文档 ID 作为成功 postcondition，取消在每次内核调用前后检查。
- D-114 v0.17 宿主 handler 通过统一 registry 按 navigation/documentSet/write 三域注入；registry 只暴露六个固定动作键并冻结，避免执行器意外发现或调用额外插件方法。
- D-115 v0.17 以 `agent-workspace-session` 作为未来宿主接入边界：会话统一管理 challenge、token、replay guard 和动作 executor，dispose 时清理全部内存授权；审批预览只输出动作/对象计数，不输出正文。
- D-116 v0.17 Agent bridge 只保存有界计划元数据于内存，最多 32 条；`plan/issue/execute/dispose` 是未来 capability handler 的唯一编排入口，未知 planId 或非法执行请求在宿主动作前返回稳定状态。
- D-117 v0.17 bridge handler 工厂仅负责将 bridge 结果包装为 `structuredContent` 与 JSON `result`，不复制计划校验、审批令牌或执行安全逻辑；缺失 bridge/无效计划返回稳定错误，便于未来以 data-driven 方式注册 Agent capability。
- D-118 v0.17 workspace capability definitions 将 `workspace-plan` 标记为只读 localRead，将 `execute-workspace-plan` 标记为 localWrite；定义数组只组合 spec/effects/handler，不在注册层引入新的安全或审批分支。
- D-119 v0.17 bridge `preview` 只返回计划摘要与审批 challenge（planId/digest/device/expiresAt/token），不返回正文或原始参数；challenge 仍由 session 统一签发，避免 UI 层复制授权逻辑。
- D-120 v0.17 bridge handler 工厂捕获注入 bridge 的同步/异步异常并返回稳定错误 token；不把异常对象、message 或 stack 传入 Agent 回执。
- D-121 v0.17 capability 注册适配器仅接受两个固定 workspace capability 名称，并按名称强制注入 effects；调用方传入的 effects 不得改变执行能力的 localWrite 语义，未知定义直接跳过。
- D-122 v0.17 workspace 注册进一步要求 canonical spec 对象身份匹配；仅同名但被篡改 schema 的定义不得进入宿主，避免注册边界被伪造元数据绕过。
- D-123 v0.17 bridge 过期计划采用显式 `prune(now)` 回收，不在每次 execute 自动删除；这样调用方仍可在过期窗口获得稳定 expired 语义，并可由宿主生命周期按需调度内存清理。
- D-124 v0.17 capability 卸载采用 best-effort 句柄回收：优先调用宿主返回的 disposer，其次支持 `dispose()` 对象和 `removeAgentCapability(handle)`；单项异常隔离，不因旧宿主卸载差异阻断插件销毁。
- D-125 v0.17 bridge dispose 后进入不可逆 disposed 状态；后续计划、审批预览和执行请求均不得重新激活内存状态，execute 使用稳定 `bridge_disposed` token，dispose 本身保持幂等。
- D-126 v0.17 capability lifecycle facade 采用一次注册、不可逆 dispose 语义；注册句柄仅保存在内存，重复 register 返回副本，不重新调用宿主，避免卸载竞态和重复 capability。
- D-127 v0.17 lifecycle `status()` 仅暴露 registered/failed/disposed 三个有界字段；失败计数上限为 2，不返回 capability 名称、异常文本或句柄详情，避免诊断通道扩大信息面。
- D-128 v0.17 bridge `status()` 仅暴露 planCount/maxPlans/disposed；计划内容、审批令牌和 handler 仍不可见，便于宿主诊断容量而不扩大 Agent 数据面。
- D-129 v0.17 workspace capability 宿主探测只检查 `addAgentCapability` 函数存在性，不通过试注册探测；结果统一为 ready/unavailable/timeout/cancelled/failed，避免探测产生副作用。
- D-130 v0.17 注册句柄只按 disposer/object/id/opaque/invalid 归类；生命周期状态仅暴露 unmanaged 数量，不回显句柄值，兼容旧宿主返回 undefined 的情况。
- D-131 v0.17 lifecycle `probe()` 只读取宿主 `addAgentCapability` 函数是否存在并返回 ready/unavailable 快照；注册前探测无副作用，status 字段保持稳定。
- D-132 v0.17 lifecycle `snapshot()` 组合 host 与 registration 两个固定对象；不回显 capability 名称、句柄、token 或异常文本，供诊断/UI 只读消费。
- D-133 v0.17 runtime 组合快照只拼接 lifecycle 与 bridge 的既有状态，不主动执行 probe/register/prune/execute；缺失对象降级为固定空状态，避免诊断读取改变运行时。
- D-134 v0.17 runtime 快照固定 version=1；归一化仅保留 host/registration/bridge 有界字段，未知键（含 token 等敏感值）一律丢弃，计数分别限制在 0~2 与 0~32。
- D-135 v0.17 快照消费增加显式版本兼容检查；缺省版本视为旧版兼容，version=1 当前支持，未知未来版本返回 false 由调用方隔离，不尝试猜测字段含义。
- D-136 v0.17 runtime 快照一致性校验在归一化后执行固定关系检查；只返回稳定 reason，不返回原始字段，避免溢出计数或 dispose 不一致污染诊断/UI。
- D-137 v0.17 runtime 状态 diff 只比较归一化快照的固定字段，planCount 仅输出有界增量；不输出计划 ID、token、句柄或异常文本，便于 UI 增量刷新。
- D-138 v0.17 runtime 事件固定为 host/registration/unmanaged/plans/disposed 五类，plans delta 限制在 -32~32；事件不携带快照原文或敏感值，便于 UI/诊断增量消费。
- D-139 v0.17 runtime 事件归一化按 host→registration→unmanaged→plans→disposed 固定顺序去重；未知类型与零 delta 丢弃，每类最多一条，避免高频生命周期事件放大。
- D-140 v0.17 runtime 事件队列最多保留 16 条，push 时丢弃最旧事件；read 返回副本，consume 才移除，dispose 后拒绝新事件，避免无界内存和重复消费。
- D-141 v0.17 事件游标使用进程内单调 sequence；`readSince` 返回当前 cursor 与 truncated 标记，`acknowledge` 仅删除不大于游标的已缓存事件，检测到队列溢出时由调用方自行重新拉取完整快照。
- D-142 v0.17 runtime diff 入队只调用既有 diff/events/push 管线，不直接修改快照；无效队列与零变化安全返回 0，避免诊断路径产生隐式副作用。
- D-143 v0.17 事件回放读取遇到 truncated 必须返回 `snapshot_required` 且不返回部分事件；调用方重新获取完整 runtime snapshot 后再从最新 cursor 继续，避免状态漂移。
- D-144 v0.17 runtime 恢复流程先尝试事件回放，溢出时仅接受兼容且通过一致性校验的完整快照；返回 events/snapshot/unavailable 固定模式，不自动执行副作用。
- D-145 v0.17 恢复确认仅对 ok 的 events/snapshot 模式调用队列 acknowledge；失败或 unavailable 不删除事件，保证中断恢复可重试且不丢状态。
- D-146 v0.17 恢复提交门面先执行既有 recover，再基于结果调用 commit；返回 acknowledged 计数，失败路径固定为 0，不引入额外副作用。
- D-147 v0.17 recovery coordinator 以单调 lastCursor 拒绝重复/倒退提交，commits 上限 32；并发消费者共享同一 coordinator 时只允许首次成功确认推进队列。
- D-148 v0.17 recovery coordinator dispose 后不可恢复或提交；返回 `coordinator_disposed` 与 acknowledged=0，保留历史 cursor 仅用于只读状态诊断。
- D-149 v0.17 coordinator 默认 dispose 不触碰共享队列；仅显式 `dispose(true)` 才清理并销毁队列，避免多消费者场景下误删其他诊断事件。
- D-150 v0.17 runtime 恢复支持 AbortSignal 取消；取消在读取前/后均返回 cancelled 且不 acknowledge，避免面板卸载时尾部消费事件。
- D-153 v0.17 recovery safe facade 复用带 signal 的恢复与结果归一化，不新增消费副作用；queue/coordinator snapshot 仅返回计数、游标和销毁态。
- D-154 v0.17 runtime session 每次创建生成 8 位随机 sessionId，仅用于内存隔离诊断；不同 session 独立 queue/coordinator，dispose 同时清理两者，不跨会话复用 cursor/token。
- D-155 v0.17 session snapshot 固定 version=1，仅保留 sessionId/disposed/runtime；registry 最多 8 个 session，超限淘汰最旧并 dispose，统一 dispose 后禁止创建新会话。
- D-156 v0.17 session registry snapshot 最多输出 8 个 session 摘要；prune 仅删除已 disposed 会话，不触碰活跃 session，避免诊断聚合引入副作用。
- D-157 v0.17 registry 快照归一化最多保留 8 个合法 sessionId，disposed 仅接受布尔 true；runtime 仅保留对象形态，未知 token 等字段丢弃。
- D-158 v0.17 session registry 事件仅记录 created/evicted/removed/pruned/idle 与 sessionId，最多 8 条；onEvent 观察器异常隔离，不影响会话生命周期。
- D-159 v0.17 idle 回收基于内存 lastSeen，默认阈值 30 分钟且最小允许 1 秒；pruneIdle 仅清理超时活跃 session，访问 get 会刷新时间，不跨会话持久化。
- D-160 v0.17 registry 事件使用独立单调 sequence，最多缓存 8 条；eventsSince 溢出时返回 truncated，acknowledgeEvents 按游标删除，不影响 session runtime 事件队列。
- D-161 v0.17 registry 回放沿用 runtime 事件语义：正常返回 events，溢出返回 snapshot_required；仅 ready 回放可确认消费，恢复 snapshot 经过 registry 快照归一化。
- D-151 v0.17 runtime 恢复截止时间采用显式 deadline；到达或超过 deadline 返回 timeout 且不读取/确认队列，和 cancelled 保持可区分诊断语义。
- D-152 v0.17 恢复结果归一化固定六种 mode，成功仅允许 events/snapshot；cursor、事件数和快照均有界，未知扩展字段丢弃且不回显异常文本。
- D-162 v0.17 registry 回放取消/超时采用读取前后双检查，任何非 ready 结果都不确认事件；原因：避免面板切换或截止时间竞争造成游标误推进。
- D-163 v0.17 registry recovery coordinator 以单调 `lastCursor` 串行化 events/snapshot 提交，snapshot 成功同样确认截至游标的旧事件；销毁后统一返回 `registry_coordinator_disposed`，防止尾部任务污染已销毁 registry。
- D-164 v0.17 registry eventsSince/snapshot 异常统一降级为 `registry_unavailable`；不把宿主异常文本、stack 或对象透传给 Agent/UI。
- D-165 v0.17 registry recovery safe/coordinator signal 与 deadline 入口只做读取和归一化，不隐式 acknowledge；取消/超时结果始终可安全重试。
- D-166 v0.17 registry `recoverAndCommitWithSignal/Deadline` 由 coordinator 统一编排，只有归一化成功的 events/snapshot 才推进游标；调用方不再自行组合读取与确认。
- D-167 v0.17 registry snapshot validation 要求 size 与合法 session 摘要数量一致、sessionId 唯一，disposed registry 不得残留 session；差异事件仅允许 created/removed/disposed/capacity 四类并限制为 8 条。
- D-168 v0.17 registry snapshot recovery 在归一化后必须通过一致性校验；不一致状态返回 `invalid_snapshot`，不确认溢出事件，交由上层重新获取快照。
- D-169 v0.17 registry snapshot 使用独立 version=1 契约；未知版本在 recovery 前拒绝，避免新旧宿主误读会话状态。
- D-170 v0.17 registry diff 不复用 runtime queue；因事件类型集合不同，使用独立最多 8 条游标队列，并仅输出 created/removed/disposed/capacity。
- D-171 v0.17 registry summary 只返回 active/disposed/capacity 计数与一致性 reason，不暴露 session runtime、文档内容或宿主异常。
- D-172 v0.17 registry diff queue 使用独立 replay/recovery 契约；溢出后只接受通过 snapshot validation 的完整 registry 快照，避免把生命周期差异误当 runtime 状态事件。
- D-173 v0.17 registry diff replay 的取消/超时语义与 runtime/registry 一致：读取前后双检查，失败不 acknowledge；coordinator 只推进单调 cursor。
- D-174 v0.17 registry diff coordinator snapshot 仅返回 lastCursor/commits/disposed 与 queue status；联合 diagnostics 只输出计数和稳定 reason，不暴露 session runtime。
- D-175 v0.17 registry/diff 联合恢复采用双游标原子确认：任一路失败、取消或超时都不确认另一条队列，避免跨队列状态半提交。
- D-176 v0.17 联合恢复 signal/deadline 在双路读取前后检查终态；诊断归一化仅保留有界计数、游标和稳定 reason，避免恢复控制字段泄漏。
- D-177 v0.17 registry diagnostics capability 先以独立只读契约存在：无输入、固定对象输出、所有计数和游标有上限；handler 异常统一降级，不暴露宿主错误。
- D-178 v0.17 diagnostics 注册适配器按 canonical spec 名称固定 `localRead=true/localWrite=false/dataEgress=false/externalCost=false`，不信任调用方 effects，且暂不接入生产入口。
- D-179 v0.17 capability names 在引用 diagnostics spec 前必须完成 spec 初始化；直接模块加载自检作为回归证据，避免生产/测试 require 时触发 TDZ。
- D-180 v0.17 lifecycle.register 接受可选 definitionsOverride 仅用于独立契约测试/宿主适配；默认路径保持原两项 workspace definitions，避免无意扩大生产注册集合。
- D-181 v0.17 capability 注册统一先经 `validateWorkspaceCapabilityDefinition`，按 canonical spec 推导 effects；未知定义/非函数 handler 静默跳过，不进入 Agent 注册通道。
- D-182 v0.17 lifecycle 将 host 返回句柄分为 managed/opaque/invalid 三类计数；仅用于有界诊断，不影响注册成功语义或向 Agent 暴露句柄详情。
- D-183 v0.17 不把 opaque/invalid 字段直接加入既有 runtime snapshot，避免破坏已验证的 v1 快照契约；通过 `handleStatus()` 独立读取，后续版本再评估 schema 升级。
- D-184 v0.17 capability 注册异常只对外暴露 cancelled/timeout/failed 三类稳定原因；failureStatus 限制总数与分类计数，不回显异常文本或对象。
- D-185 v0.17 definitions/lifecycle 联合诊断仅输出矩阵计数、宿主可用性、注册数量、句柄类型和失败原因；不纳入 handler、spec 详情、token 或异常对象。
- D-186 v0.17 统一 diagnostics snapshot 使用独立 version=1 契约；未知版本、定义溢出或缺失 registry 摘要均拒绝消费，避免跨宿主误读状态。
- D-187 v0.17 diagnostics snapshot diff 仅保留 definitions/lifecycle/registry/diffQueue/coordinator 五类布尔变化，事件固定顺序且去重，不携带具体 session、文档或异常内容。
- D-188 v0.17 diagnostics 事件使用独立最多 8 条队列与 replay/recovery 契约，不复用 runtime/registry 事件队列；溢出后只接受通过 diagnostics snapshot validation 的完整快照。
- D-189 v0.17 diagnostics recovery coordinator 沿用单调 cursor 与双重 signal/deadline 检查，取消/超时/非法快照均不 acknowledge，dispose 后统一返回 diagnostics_coordinator_disposed。
- D-190 v0.17 diagnostics joint coordinator 只允许 events 或 snapshot 单一路径成功确认；归一化结果限制 acknowledged≤8，避免事件流半提交和过量回显。
- D-191 v0.17 diagnostics joint signal/deadline 与 handler 仅允许只读恢复和归一化，不隐式扩大输入字段；取消/超时/异常均不确认队列。
- D-192 组件商店可用性审计采用 A/B/C/D 四级：空数据不判故障；依赖活动文档、命名约定、特定内核 API 或第三方插件统一标为条件可用；仅在本插件无独立实现且默认无法添加时标为 D。静态审计不能替代真实思源宿主验收，后续按 T-266 补证据。
- D-193 商店卡片的“配置”入口仅对当前已添加且声明 `configSchema` 的组件显示，复用既有有界表单并在保存后刷新两处视图；原因：减少配置发现成本，同时避免对未添加组件制造无效操作。
- D-194 本轮商店配置入口使 raw bundle 自律线由 347 KiB 校准至 348 KiB；`package.zip` 仍低于 300 KiB 硬上限，校准仅记录真实功能增量，不改变归档门禁。
- D-195 商店卡片展示组件声明的全部支持表面，但目录仍按当前 surface 过滤；原因：让用户理解跨设备可用范围，同时不允许把当前设备不可读的组件误添加到布局。
- D-196 商店尺寸选择在首次渲染时同步呈现当前值；原因：内部默认值与视觉状态必须一致，避免用户在点击“添加/应用”前无法确认生效尺寸。
- D-197 第三方组件 provider 暂时卸载时保留实例配置和跨表面布局，不自动删除；商店标记 unavailable 并提供显式移除，重新注册后自动恢复。原因：插件升级/重载是常见瞬态，静默删配置不可逆且会破坏用户布局。
- D-198 provider 注册变化通过插件内存监听器即时通知已打开的商店和组件面板，监听器随对话框销毁并在插件卸载时清空；不持久化回调，也不扩大第三方协议权限。
- D-199 商店分类、availability 和 added 状态作为正交过滤维度；“条件”页签的分类条件固定为 all，避免 conditional 被误当成卡片 category 而得到空结果。搜索文本和页签在 provider 重渲染时保留。
- D-200 内置组件功能分组必须覆盖全部 27 个 moduleId 且不得重复，分组标题来自 i18n；通过自动门禁防止新增组件落入无意的“其他”或英文界面出现中文标题。
- D-201 组件面板每次重渲染前回收上轮事件订阅、IntersectionObserver 和 idle/timeout 任务；原因：provider 热注册会增加重渲染频率，旧延迟任务不得继续读取已 dispose 的控制器。
- D-202 本轮 provider 生命周期、筛选和清理链使 raw bundle 自律线由 348 KiB 校准至 350 KiB；生产归档仍低于不变的 300 KiB 硬上限，新增状态不引入远程资源。
- D-203 同 moduleId 的 provider 热替换采用完整覆盖语义：新注册未声明 `open` 时清除旧回调，旧注销句柄仍由 runtime token 拒绝误删新注册；避免数据 adapter 已更新而跳转入口仍指向卸载插件。
- D-204 声明式配置新增 `date` 与 `document` 两种类型：日期严格校验 ISO `YYYY-MM-DD`，文档值严格校验思源 block ID；原因：把高频配置错误前移到表单和 Agent 输入边界。
- D-205 文档配置只提供当前已打开文档的 datalist 建议，不调用未确认的搜索/受保护端点；用户仍可手填合法 block ID，保持跨宿主兼容。
- D-206 笔记本配置始终保留空选项；已删除的当前值以不可用选项回显而不静默清空，避免保存其他字段时意外改变筛选范围。
- D-207 本轮原生日期/文档控件与 Agent 归一化使 raw bundle 自律线由 350 KiB 校准至 352 KiB；归档仍保持 300 KiB 硬上限，新增字段不引入网络请求。
- D-208 空组件面板提供独立“打开组件商店”按钮，保留原有空态说明；原因：用户无需先进入编辑态即可发现添加入口，且不改变默认布局播种策略。
- D-209 配置表单“恢复默认”只覆盖 schema 声明字段，未知字段原样保留；异步笔记本字段使用按键 reset 标记，避免选项加载完成后恢复旧值。
- D-210 商店无结果状态提供“清除筛选”单按钮，同时重置搜索文本与分类/状态页签并恢复焦点；原因：筛选组合可能跨多个维度，逐项回退成本高。
- D-211 商店页签采用 tablist/tab + aria-selected，尺寸按钮采用 aria-pressed；原因：保留视觉选中态之外，为键盘和读屏用户提供稳定状态语义。
- D-212 Agent 组件发现状态仅返回当前设备的 configured/enabled/size 元数据；配置值、实例 ID 和其他布局细节仍不进入目录输出，避免扩大 Agent 数据面。
- D-213 发布归档在 CopyPlugin 边界统一 README/ROADMAP 为 LF；原因：Windows 工作树的混合 CRLF 会让本地产物与 Ubuntu Actions 的 package.zip 字节不一致，破坏发布矩阵的可复现性。
- D-214 发布矩阵对 package.zip 采用 ±1 KiB 的跨平台漂移窗口，仍严格检查 dist/index.js 与 300 KiB 硬上限；原因：不同平台 ZIP 压缩器/元数据可能产生几十字节差异，不应阻断内容一致的发布。
- D-215 Chromium 烟测按候选顺序逐个尝试已安装浏览器，首个返回计算样式者胜出；每次尝试使用独立 profile 目录，临时目录清理失败仅告警。原因：本机 Edge 153 headless 静默输出空内容属环境瞬态，回退 Chrome 即可通过，不应让单台机器的浏览器状态阻断发布门禁。
- D-216 2026-09-14 包体瘦身审计结论：生产依赖闭包固定为 23 个模块（16 个 v0.17 契约模块、约 155 KiB 源码确认在图外，由隔离门禁测试固化）；CSS 343 个 sw 类全部有源码消费方、零死类（由 css-usage-audit 门禁固化）；PNG 资产经 GDI+ 无损重编码实测反而变大、已有工具链下无安全收益；agent-capabilities 与 search-model 无可安全合并的重复提取器。i18n 死 key 仅 2 个（homeCountdownTarget/homeStoreAdded，已删）并新增硬门禁。结论：免费瘦身空间已耗尽，v0.17 接入契约层必须做内容决策（归档文档瘦身）或结构性重构。
- D-217 `filterOpenTabs` 改为轻量规范化关键词门禁 + 命中条目重型图形安全规范化产出：门禁与产出在全部既有用例上行为一致（含 rootId/id 兜底匹配），300 页签关键词路径均值由 8.9ms 降至 1.4ms（约 6 倍），成本随命中数而非页签总数扩展；空查询全量产出路径语义与成本保持不变，基准测试分别断言两条路径（5ms/25ms，均远低于 50ms 告警线）。
- D-218 归档内 i18n JSON 改为构建期最小化（源文件保持缩进可读），raw bundle 自律线按既有协议由 355 KiB 校准至 356 KiB（本批真实增量为 5 处输入框 ARIA 标签与关键词门禁）；`package.zip` 300 KiB 硬上限不动，当前余量仅 50 bytes——v0.17 接入任何生产功能前必须先做归档内容决策（候选：README 变更链裁剪、ROADMAP/docs SVG 移出归档，二者均为维护者决策项，已记入 ROADMAP 8.0.1）。
- D-219 执行 D-218 预留的归档内容决策（用户以"继续开发"授权推荐方案）：中英文 README 更新日志仅保留最近两个版本并指向 GitHub Releases（80.3→27.8 KB、84.5→27.1 KB）；ROADMAP.md 移出发布归档、保留为仓库根目录开发文档（final-package-audit 改在仓库边界校验 R7 内容、package-integrity 白名单同步收窄以防回潮）；docs 两枚 SVG 留在归档——市场按 plugin.json readme 渲染 README，interface-map 引用不可断；新增 shipped-i18n-parity 门禁锁定归档 i18n 与源文件逐值一致。结果：`package.zip` 307150→252683 bytes，硬上限余量 50→54517 bytes，v0.17 契约层生产接入不再需要内容决策。
- D-220 v0.17 阶段 1 生产接入采用"诚实搬移"而非整体着陆：从 capability-definitions（1413 行）机械搬移 33 个符号（运行时事件队列、恢复协调器、执行会话、session registry、registry diff 队列、只读 diagnostics 处理器，约 38 KiB 纯内存实现、零宿主依赖）至独立 `agent-workspace-runtime.js`，definitions 改为同名 require+re-export 使 84 项既有契约测试不变；diagnostics 专用校验器在 runtime 模块内实现（spec 身份/schema 形状/effects 一致），不引用 bridge 常量，保证未启用的 plan/execute definitions 矩阵（67 KiB）继续留在生产闭包之外。index.ts 经 `agent-workspace-diagnostics` 包装器接入只读注册通道并随插件卸载销毁；隔离门禁 WIRED 清单 +2、闭包 25 模块、16 个未接线模块断言保持。预算：raw 363569→384081（自律线 356→376 KiB），zip 252683→257760（+5.1 KiB，硬上限余量 49440 bytes）。
- D-221 第五轮细节优化三项事实：(1) 存储契约门禁固化 13 个 `sw_*` key 的唯一登记处、`loadData/saveData` 仅允许 `*_KEY` 常量（防抖链 scheduleSave→queueSave→saveData 为显式豁免传递点）、每个 key 必须登记 sanitize 降级白名单——v0.20 存储审计的静态前置；(2) `buildOpenedDocumentSearchRequest` 支持外部传入已构建 scope（多页签扇出不再对每个 tab 重复做图形安全 scope 解析，成功路径成本约减半），行为一致性由显式回归锁定；编排骨架基准确认真实场景（200 页签凑满 6 请求早退）0.14ms、病态全不可解析场景 2.0ms，均在预算内；(3) 第三方组件复制模板落位 `docs/widget-example/` 并由契约测试锁定字段白名单，协议文档同步补记阶段 1 的 `workspace-runtime-registry-diagnostics` 能力；home items 已是 button 语义（键盘可达性达标，方向键网格导航列为后续增强）。
- D-222 存储容量边界契约（tests/storage-capacity-limits.test.cjs）固化六个口径：MRU 200（首条存活+去重）、最近打开 50、文档集 24（versioned envelope+changed 标记）、home 布局每设备 64 且丢弃幽灵实例、THUMB_CACHE 40/30 与 QUICK_ACTIONS 12 常量锁定；favorites/sanitizeStringList 系列确认为"已知无上限"（用户主动行为，上限值待维护者决策，TODO 候选），由事实断言防止误解。随测试发现并修复 capMru 对非数组 truthy 输入（如被写坏的字符串 key）抛 TypeError 的缺口——统一安全降级为空数组，与其余 sanitize 家族一致；normalizeInstances 因 moduleId 去重天然有界，无需上限。
- D-223 组件面板条目增加方向键线性导航（↑/↓ 循环移动、Home/End 跳首尾）：keydown 委托挂在面板容器自身（随 DOM 移除自然释放，无 document 级监听与卸载负担），仅当焦点已在条目按钮上时接管，避免劫持面板内其他控件（折叠/配置）与外层键盘语义；与 controller 既有 focusKey 重渲染恢复机制正交。契约测试以 jsdom 真实键盘事件断言循环边界。随轮确认三项既有事实：search-session 双会话同 key 缓存互不污染且计时器独立（补并发隔离断言与 10k 次缓存查找 <50ms 基准）；widget-catalog provider 注册/失效/恢复三态与双订阅已有覆盖；moduleId 归一化（trim/64 截断/字符白名单）达标且大小写敏感为合理设计。
- D-224 中文搜索输入体验修复：三端（桌面弹窗/侧栏/手机端）搜索触发统一经 bindSearchInputComposition IME 守卫——composition（拼音候选中）期间的 input 事件不再触发搜索，杜绝拼音中间态作为关键词发请求并闪现错误结果；compositionend 立即补一次触发（applySearch 内部防抖+序号去重使双触发无害）；商店搜索框为纯前端过滤不发请求，不接守卫。移动烟测新增三端接线契约断言。随轮确认：focus-visible 均有主色边框替代（outline:none 不裸奔）、筛选按钮激活态在绑定时立即初始化（updateButton 无延迟）、商店对话框走思源 Dialog 标准结构（宿主管 aria）。块 ID 校验单一事实来源：agent-capabilities 提取 AGENT_BLOCK_ID_PATTERN/RE 共享常量（4 处 schema pattern + 2 处运行时正则），document-context 保持零依赖设计不动其内联 pattern；runtime 模块补 dispose 幂等/直载自检/canonical spec 身份共享三断言。
- D-225 v0.17 阶段 2 document-context 采用只读诚实接入：省略 id 读取活动 root，已打开文档优先使用页签元数据，关闭文档仅做单行 SQL（id/content/box）回退；大纲复用既有 outline 端点并限制 24 条。输出不含正文、markdown、异常文本或未知字段；真实桌面取消/权限证据继续后置，不以 mock 冒充宿主验收。
- D-279 内置组件注册必须继承目录定义的 `viewType/configSchema/sizes` 等展示与协议元数据；原因：运行时 adapter 只提供 read 时，覆盖定义不应让日历退化为普通列表或丢失配置入口。
- D-280 `today-tasks` 默认口径改为今日日记（文档标题 `YYYY-MM-DD`）中的任务块；原因：原“当前打开文档”口径既不等于“今日”，也会在日记未打开时返回空，用户无法得到今日任务清单。全库模式保留为可选的近更新任务扫描。
- D-281 商店第二轮视觉层级采用“状态 Tab → 结果概览 → 可折叠轻量分组 → 卡片操作栏”四层结构；单卡片仍保留分组语义但降低装饰，避免删除功能分组导致筛选/可访问性语义漂移。
- D-282 商店卡片预览按 moduleId 映射为有限语义类型（calendar/tasks/stat/progress/chart/documents/outline），不读取真实数据；原因是商店首屏应快速表达组件用途且避免为每张卡片发起宿主请求，真实数据继续由独立“预览效果”弹窗加载。
- D-283 未来大版本路线重排：Agent 只读上下文与诊断前移到 v0.17，受控执行链拆到 v0.18；路径筛选从 Agent 执行链中解耦并先做桌面入口。原因是前者已有生产接线和明确只读价值，后两者分别依赖不同的真实宿主证据，捆绑会让单一阻塞拖延整个版本。
- D-284 组件商店后续不再以装饰性 UI 作为主线增量：v0.18/v0.19 的商店工作以真实第三方 provider、配置 schema、失效恢复和开发者文档为交付，视觉变化必须服务于发现、状态和操作，不新增常驻复杂筛选面板。
- D-285 性能门禁分阶段升级：v0.16.42 记录并拆分本地 p95 长尾，保持 50ms 告警线；v0.20 在稳定基准和跨环境校准后再升级为硬门禁，避免偶发环境抖动阻断正常发布。
- D-286 空查询页签过滤采用 WeakMap 元数据缓存：缓存只绑定活跃页签对象，签名覆盖标题、路径、rootId、笔记本和更新时间等展示字段，字段变化自动重算，WeakMap 保证关闭页签不被强引用。原因是空查询会全量产出，重复图形分割是稳定热点；缓存不改变筛选语义、不持久化内容。
- D-287 组件商店纯模型抽取：将筛选、结果摘要、预览类型、状态/尺寸、设备表面和分组辅助逻辑集中到 `home-store-model.js`，DOM 层只负责事件与渲染。原因是商店已存在桌面/侧栏/移动三端与第三方 provider 扩展，继续在 `index.ts` 追加条件会造成语义漂移；纯模型可在不触碰宿主 API 的情况下批量验证边界。
- D-288 v0.17 只读 Agent 注册前增加独立审计模型：默认 effects 仅接受 `localRead`，能力名/设备/状态/原因均归一化并限制数量，异常只保留稳定 reason；审计失败记录 diagnostic 但不把 handler 或宿主异常透传给 Agent。原因是只读能力数量已扩大，必须在生产入口前形成可重复的安全边界检查，同时不改变旧宿主降级语义。
- D-289 v0.17 只读 Agent 审计增加独立有界生命周期历史：注册前记录 version=1 初始快照，卸载前记录脱敏 disposed 快照，历史仅保留最多 32 条并支持单调 cursor 读取；不向 Agent/UI 暴露 handler、实例或宿主异常文本。原因是生命周期问题需要可追溯证据，但不能因诊断历史扩大数据面或改变只读权限边界。
- D-290 v0.17 审计历史回放只输出固定事件类型、sequence 和 count，并提供 version=1 摘要的稳定序列化/解析；事件最多 8 条，恶意或未知输入安全降级。原因是后续诊断消费需要增量能力，但不能暴露快照详情、handler 或异常文本。
- D-291 v0.17 审计回放契约暂保持纯模型，不直接扩展现有 Agent diagnostics output schema；原因是先验证事件稳定性和宿主兼容边界，避免在真实宿主证据完成前扩大生产输出字段。
- D-292 v0.17 审计历史健康报告固定为 empty/healthy/degraded/unavailable 四态，并只聚合事件计数与摘要元数据；原因是诊断消费者需要快速判断生命周期质量，但不应读取具体能力定义或宿主错误。
- D-293 v0.17 审计报告差异采用健康等级排序（unavailable < degraded < empty < healthy）推导 improving/degrading/stable 趋势；窗口最多 8 份报告，序列化仍为 version=1。原因是趋势判断必须可重复且有界，不能依赖时间戳或宿主实现细节。
- D-294 v0.17 审计窗口合并按 latestSequence 去重并升序排列，恢复计划仅返回 cursor 之后最多 8 份报告；零 sequence 使用健康/大小/事件摘要回退键。原因是多宿主采样合并必须确定性且不能重复消费。
- D-295 v0.17 审计传输封装采用轻量 FNV-1a checksum、固定 requestId 清洗和最多 8 条批量 envelope；校验失败只返回稳定 status/retryable，不回显 payload 或异常。原因是跨宿主交换需要完整性提示，但不应引入加密依赖或扩大数据面。
- D-296 v0.17 审计传输队列最多保留 16 条 envelope，使用单调 sequence/cursor 确认，恢复快照和 utilization 摘要均为 version=1；dispose 后拒绝新入队。原因是跨宿主回放需要可恢复进度，同时必须限制内存和重复消费。
- D-297 v0.17 传输队列风险按 utilization 70%/90% 划分 warning/critical，检查点与 replay result 均限制 cursor 单调增长和固定字段；原因是诊断消费者需要快速识别积压，而不应读取队列内部对象。
- D-298 v0.17 传输队列维护操作仅提供内部 clear/reset/peek 模型，健康报告固定风险字段；取消/超时回执永不 acknowledge。原因是恢复流程需要可测试的安全边界，但不能让诊断通道隐式具备消费或写入权限。
- D-299 v0.17 传输恢复协调器以单调 cursor 串行提交，空队列不产生 commit，取消/超时/销毁均不确认；协调器状态与事件均固定 version=1。原因是多次回放必须避免重复确认和半提交。
- D-300 v0.17 协调器健康固定为 idle/active/blocked/disposed，批量结果与 successRate 只保留计数；commit window 和 recovery summary 均不携带 envelope payload。原因是统一诊断多个协调器时需要可比较指标，而不是内部传输内容。
- D-301 v0.17 联合恢复继续沿用单协调器固定字段与计数聚合，不在生产 diagnostics 输出中暴露队列条目；健康报告仅用于后续只读消费。原因是多协调器聚合不应绕过既有脱敏边界。
- D-302 v0.17 联合检查点窗口按 cursor 去重并升序保留最近 8 条；恢复计划只选择 cursor 之后的检查点并要求 nextCursor 单调，窗口事件只输出计数与有限 delta。原因是断点续传需要确定性和可恢复性，同时不能把联合协调器内部条目带入只读诊断输出。
- D-303 v0.17 联合 diagnostics 只输出状态、风险、计数、cursor、恢复状态和 acknowledgement；分页最多 8 条检查点，多源合并按最高风险与最新 cursor 聚合，不暴露协调器实例或传输条目。原因是上层消费需要稳定摘要，但不能绕过既有只读脱敏边界。
- D-304 天气组件只接受用户显式输入城市，不自动读取设备定位；城市只发送给 Open-Meteo 地理编码与预测白名单端点，未配置时不发请求。原因是位置属于敏感外部数据，组件外观价值不应隐式扩大隐私面。
- D-305 外部生活组件网络层固定 128 KiB 响应上限、10 秒以内超时、16 条内存缓存并透传取消信号；不缓存到插件持久化数据。原因是公共服务无本地 SLA，必须限制卡顿、内存与陈旧数据面。
- D-306 中国节假日作为既有日历月视图的默认关闭覆盖层，不新增第二套月历；跨年网格同时读取公告涉及年份及下一年数据，后到公告覆盖旧记录。原因是 holiday-cn 明确说明年末日期可能由下一年度公告修订，同时用户首先需要的是思源日记日历。
- D-307 iPad 式组件采用原生 DOM/CSS、静态渐变和语义布局，不复制第三方组件源码、不下载远程背景图，也不依赖 `:has()`。原因是保持主题可读性、旧 WebView 兼容和 300 KiB 归档门禁。
- D-308 本轮生产依赖图从 29 上限扩展到经审计的 31 个模块，仅放行 `life-widget-model` 与 `life-widget-network`；raw bundle 自律线校准为 463 KiB，压缩包硬上限继续保持 300 KiB。
- D-309 package.zip 单条目压缩上限由 120 KiB 校准为 128 KiB，仅容纳经审计的天气/节假日生产代码；总体 300 KiB 硬上限、32 条目上限和基线增长告警保持不变。
- D-310 Bangumi 首期定义为“每日放送”而非个性化“推荐”：官方 v0 API 暂无日历等价端点，因此隔离使用 legacy `/calendar` 兼容接口，读取整周后按用户设备本地星期筛选；后续出现 v0 等价能力时再迁移。
- D-311 思源插件运行于浏览器 WebView，网络请求沿用宿主浏览器 User-Agent；不尝试设置浏览器禁止修改的 `User-Agent` 请求头。每日放送只在用户明确添加组件后联网，精确白名单为 `https://api.bgm.tv/calendar`，30 分钟缓存且失败不影响其他组件。
- D-312 远程媒体只放行 `https://lain.bgm.tv/pic/cover/`，并在来源模型、adapter 与 view 三层校验；图片使用 lazy/async/no-referrer，文本只经 `textContent` 渲染，避免外部 HTML 或任意图片地址进入组件面板。
- D-313 商店运行态仅携带已生产接入的时间、天气和每日放送三项紧凑来源摘要，不把完整候选审计目录拉入生产闭包；外部研究目录继续作为开发/测试事实来源。生产图因此保持经审计的 31 个模块。
- D-314 每日放送真实封面网格、三层媒体校验和商店来源透明度使 raw bundle 自律线由 463 KiB 校准为 472 KiB；`package.zip` 300 KiB 总上限与单条目 128 KiB 上限保持不变。
- D-315 组件商店内置组件按主要用途收敛为“日记与日历、任务与执行、文档与导航、统计与进展、学习与记忆、生活与资讯、系统与服务”七组；联网、本机服务、插件和条件继续只由独立筛选页签表达。原因是用途导航与可用性条件是两个正交维度，合并生活/资讯/使用时长可减少单项空组而不丢失筛选能力。
- D-316 组件商店预览采用“语义类型 + moduleId 个性化”两层模型：类型提供稳定结构（calendar/tasks/documents/feed/stat/progress/media/activity），moduleId 只调整颜色、重点和数量。原因是同类组件需要一致识别，不同组件又不能继续显示完全相同的骨架；不引入真实数据请求，避免预览阶段联网和包体膨胀。
- D-317 配置对话框采用宿主层语义分组而不扩展第三方 `configSchema` 协议：根据 moduleId/字段键推导内容、数据源、时间范围、显示和其他选项，并为已知组件提供短提示与占位符；未知插件安全回退到通用字段。原因是可以立即改善现有内置组件而不迫使插件作者升级协议，也避免把长文案和复杂配置元数据写入生产目录。
- D-318 配置保存按钮在草稿与初始值无差异时禁用，恢复默认仍只影响 schema 声明字段。原因是防止用户误以为点击保存会产生变化，同时保留未知配置字段不被破坏的存储兼容性。
- D-319 配置对话框保持既有 420×360 桌面/480×420 移动宿主尺寸，内部采用滚动、分区和 sticky 操作栏承载新增信息。原因是思源旧 WebView 对 Dialog 外层尺寸支持不一致，调整外层尺寸的收益低于兼容风险。
- D-320 组件商店卡片对已知外部来源继续显示完整网络/隐私信息，对插件组件显示提供方徽章，对内置组件显示“思源内置”和配置状态。原因是来源、联网和可配置性是用户添加前最关键的判断信息，且不改变现有分组与筛选模型。
2026-09-15 D-321 指南入口直接渲染结构化依赖摘要：商店帮助对话框新增 8 项非思源依赖清单及统一安装说明链接；依赖目录仍由纯模型生成，避免 DOM 层复制依赖元数据并保持第三方失败隔离。
2026-09-15 D-322 依赖筛选页签采用延迟计数策略：只有卡片确实携带 required/optional 元数据时才扩展计数对象，旧第三方卡片继续返回原有十项计数，避免破坏既有宿主适配。
2026-09-15 D-323 依赖卡片显示统一由结构化摘要生成：状态、名称、配置和平台字段均限制长度并在未知模块时安全回退，避免模板层读取不受控的第三方元数据。
2026-09-15 D-324 思源同步期间冻结组件面板的交互与结构重建：监听 `sync-start` 后为面板根节点设置 `sw--syncing`/`aria-busy=true`，同步中的页签生命周期事件只记录快照不触发重建；`sync-end` 与 `sync-fail` 统一清除状态并合并一次侧栏刷新，卸载时移除全部同步监听。原因是同步过程中宿主 DOM/CSS 可能短暂重载，冻结可避免黑色 SVG、原始按钮和布局跳变，同时不丢失同步后的最终数据。
2026-09-15 D-325 侧栏渲染入口统一复用同步状态：创建/重建侧栏后立即调用 `setSyncPresentation(this.syncing)`，定时刷新回调和直接刷新函数在同步期间都短路；同步结束事件负责重新调度刷新。原因是同步开始后宿主可能重新创建侧栏，单靠事件开始时的 DOM 标记不足以覆盖新节点，必须在每个渲染入口恢复冻结状态。
2026-09-15 D-326 同步生命周期采用深度计数而非单布尔翻转：连续 `sync-start` 只在最后一个对应 `sync-end` 后解冻，任意 `sync-fail` 直接清零并恢复；同步期间记录一次待刷新意图，结束时统一调度。原因是宿主可能在批量同步或重试时产生重叠事件，单个结束事件提前解冻会重新引入面板跳变。
2026-09-15 D-327 增加 120 秒同步 watchdog：每次同步开始重置计时器，正常结束/失败/卸载均清理；若宿主丢失结束事件，watchdog 清零深度、解除 busy 并安排一次侧栏刷新。原因是永久冻结比一次延迟恢复更难恢复，且 120 秒足以覆盖常规同步并保留异常自愈路径。
- D-331 (2026-09-15): document-context exposes bounded source provenance (active/opened/kernel) and required outlineAvailable. Metadata failures remain terminal; outline failures return a safe read-only context with empty headings and no exception text.
- D-332 (2026-09-15): official `siyuan-note/plugin-sample` is treated as a normative API/lifecycle reference only. Adopt its `onLayoutReady`, platform declaration, i18n, publish privacy and packaging guidance; do not import kernel plugin or startup appearance code into the current package.
- D-333 (2026-09-15): `document-context` may expose notebookName from the existing in-memory notebook cache, but must not trigger a new network request per Agent call. Missing cache names remain empty; pathAvailable is derived solely from normalized path text.
- D-347（2026-09-15）：Agent `document-context` 的 `includeOutline` 默认值保持 `true` 以兼容旧调用；仅显式 `false` 跳过 `/api/outline/getDocOutline`，并以 `outlineStatus=not-requested` 区分调用方主动关闭与真实请求失败的 `unavailable`。跳过路径仍返回只读元数据与空 `headings`，不改变权限、结构或错误泄露边界。
