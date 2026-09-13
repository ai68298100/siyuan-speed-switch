# 进度

补充（2026-09-13）：完成组件商店逐项可用性审计（T-263）。`docs/component-availability-audit.md` 覆盖 28 个内置组件与 1 个第三方目录组件；当前自动测试 667/667 全绿。审计确认两处 `YYYYMMDD` 日期标签正则展示缺陷（T-264），并将第三方/命名协议/活动文档依赖与正常空数据分开分级；下一步优先修复正则、补商店依赖提示并安排真实桌面逐项验收（T-265~T-266）。

补充（2026-09-13）：T-264/T-265 完成。修正 `recent-writing-activity` 与 `today-reservations` 日期显示正则，新增回归测试；商店中英文描述补充任务扫描、日记标题、预约属性、剪藏标签、活动文档、闪卡和插件命令等前置条件。661/661 自动测试通过，生产包 `dist/index.js` 353208 bytes、`package.zip` 301884 bytes，仍低于包体门禁。

补充（2026-09-13）：T-267 完成。新增组件可用性审计门禁，自动检查 27 个内置组件与 runtime adapter 一一对应、第三方目录组件必须由 provider 提供、SQL adapter 使用白名单 `stmt` 参数，并区分正常空态和未注册状态；当前 `pnpm test` 为 666/666 全绿。

补充（2026-09-13）：T-268 完成。`journal-calendar` 现支持可选笔记本范围，月份可在当前月前后 24 个月内双向切换；导航会持久化并强制刷新当前实例，667/667 自动测试全绿。

补充（2026-09-13）：T-269 完成。adapter 快照新增有界 `emptyHint` 通道，首页空态优先显示组件自己的引导文案；插件命令在无可执行命令时提示安装/启用相关插件，669/669 自动测试全绿。

补充（2026-09-13）：T-270 完成。组件定义新增受限 `availability` 等级（ready/conditional/external），商店卡片对条件依赖和外部插件显示本地化徽标；671/671 自动测试全绿。

补充（2026-09-13）：T-271/T-272 完成。商店新增“条件”筛选，并改为只展示当前设备支持的组件；待安装第三方项继续标记 external，避免跨设备误添加。

补充（2026-09-13）：T-273 完成。商店筛选现在会同步隐藏无可见卡片的功能分组标题与网格，避免条件筛选后出现空分组。

补充（2026-09-13）：T-274 完成。首次添加条件组件后显示一次性前置条件提示，已存在组件仅调整尺寸时不重复提示。

补充（2026-09-13）：T-275 完成。商店中已添加且支持声明式配置的组件新增独立“配置”按钮，复用既有有界表单，保存后同步刷新商店和首页；671/671 自动测试、生产构建和 smoke 门禁通过，`dist/index.js` 355527 bytes、`package.zip` 302800 bytes。

补充（2026-09-13）：T-276 完成。商店卡片新增支持表面提示（主面板/侧栏/移动端），与当前设备过滤保持一致；671/671 自动测试和 TypeScript 通过，`dist/index.js` 355933 bytes、`package.zip` 303049 bytes。

补充（2026-09-13）：T-277 完成。商店尺寸按钮打开时会高亮当前应用尺寸（未添加组件则高亮默认尺寸），进一步明确“先选尺寸、再点击添加/应用”的交互；671/671 自动测试、TypeScript 与生产构建通过，`dist/index.js` 355965 bytes、`package.zip` 303050 bytes。

补充（2026-09-13）：T-278~T-281 完成。第三方组件目录新增 ready/unavailable/missing 三态；已添加组件在 provider 卸载后保留配置并显示可清理的失效卡，重新注册后即时恢复商店与面板。同步修复“条件”页签分类冲突，新增“已添加”筛选、筛选状态保持和无结果提示；27 个内置组件现完整进入本地化功能分组。面板重渲染会回收旧 observer、idle timer 与事件订阅；provider 热替换不会保留旧跳转回调。`pnpm verify:release` 全绿：673/673 自动测试、TypeScript、移动端和 Chromium smoke 通过；`dist/index.js` 358133 bytes、`package.zip` 304225 bytes。

补充（2026-09-13）：T-282~T-283 完成。声明式配置新增严格 `date` 与 `document` 字段：倒数日使用原生日期控件，指定文档提供当前打开文档的 datalist 建议；笔记本下拉增加明确空选项并保留已失效值提示，所有控件关联 label，保存前执行原生有效性校验。Agent 配置归一化同步支持新字段；`pnpm verify:release` 全绿，674/674 自动测试、TypeScript、移动端和 Chromium smoke 通过；`dist/index.js` 360409 bytes、`package.zip` 305091 bytes。

补充（2026-09-13）：T-284~T-285 完成。空组件面板新增独立“打开组件商店”CTA，配置表单新增“恢复默认”按钮，仅重置 schema 声明字段并保留未知配置；异步笔记本选项加载与重置状态安全协同。`pnpm test` 674/674 全绿，TypeScript 与生产构建通过；最新产物 `dist/index.js` 361378 bytes、`package.zip` 305399 bytes，raw bundle 自律线校准至 353 KiB。

补充（2026-09-13）：T-286~T-287 完成。组件商店无结果状态新增一键清除搜索/页签筛选；页签采用标准 tablist/tab 语义，尺寸选择同步暴露 `aria-pressed`，键盘与读屏操作反馈更清晰。`pnpm test` 674/674、TypeScript 与生产构建通过；最新产物 `dist/index.js` 362169 bytes、`package.zip` 305564 bytes，raw bundle 自律线校准至 354 KiB。

补充（2026-09-13）：T-271 完成。商店新增“条件”筛选，按 `availability` 精确过滤条件依赖组件，待安装的第三方卡片标记为 external；自动门禁复跑中。

补充（2026-09-13）：T-260~T-262 增加 diagnostics 联合恢复取消/超时入口与只读 handler；661/661 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-258~T-259 增加 diagnostics 联合恢复结果归一化与 queue/snapshot 联合 coordinator；661/661 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-254~T-257 增加 diagnostics replay 取消/超时边界、恢复结果归一化与 coordinator；660/660 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-251~T-253 增加 diagnostics 独立事件队列、snapshot diff 入队、replay/ack 与溢出恢复；658/658 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-248~T-250 增加 diagnostics snapshot 五类差异计算、变化事件构建与归一化；657/657 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-246~T-247 增加统一 diagnostics snapshot version=1、归一化与兼容/一致性校验；656/656 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-243~T-245 增加 definitions/lifecycle 诊断归一化、生命周期摘要及联合只读诊断包；655/655 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-241~T-242 增加注册失败原因归一化/lifecycle failureStatus，以及 definitions 矩阵 diagnostics 摘要；654/654 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-239~T-240 增加 capability definitions 批量矩阵校验，并以独立 `handleStatus()` 暴露 opaque/invalid 句柄计数，保持既有 runtime snapshot 兼容；652/652 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-237~T-238 增加 capability schema 矩阵校验与 lifecycle opaque/invalid 句柄统计；652/652 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-233~T-236 增加 diagnostics 定义工厂、输入归一化、生命周期自定义注册与 capability 完整性校验；651/651 测试、TypeScript 与 diff 检查通过。

补充（2026-09-13）：T-232 修复 diagnostics capability spec 初始化顺序，并以直接 `require` 自检确认模块可加载；T-233~T-235 增加 diagnostics 定义工厂、输入归一化与 lifecycle 自定义定义注册；651/651 测试、TypeScript 与 diff 检查通过。

本轮新增（2026-09-13）：T-150 为 workspace bridge 增加显式过期计划回收 `prune(now)`，T-151 增加 capability 注册句柄卸载回收，T-152 增加 bridge 销毁态隔离，T-153 增加 capability lifecycle facade，T-154 增加有界 lifecycle status 快照，T-155 增加 bridge status 快照，T-156 增加无副作用宿主 capability 探测，T-157 增加注册句柄归一化与 unmanaged 计数，T-158 增加 lifecycle.probe() 只读入口，T-159 增加 lifecycle.snapshot() 统一状态快照，T-160 增加 runtime 组合快照，T-161 增加 runtime 快照版本化与归一化，T-162 增加版本兼容门禁，T-163 增加 runtime 一致性校验，T-164 增加 runtime 状态转移 diff，T-165 增加 runtime 状态事件，T-166 增加 runtime 事件归一化，T-167 增加 runtime 事件队列，T-168 增加 runtime 事件游标，T-169 增加 runtime diff 入队桥接，T-170 增加 runtime 事件安全回放，T-171 增加 runtime 快照恢复流程，T-172 增加 runtime 恢复确认，T-173 增加 runtime 恢复提交门面，T-174 增加恢复并发协调器，T-175 增加恢复协调器销毁态，T-176 增加协调器队列绑定销毁，T-177 增加恢复取消边界，T-178 增加恢复超时边界，T-179 增加恢复结果归一化，T-180 增加恢复安全出口，T-181 增加 coordinator/queue 运行快照，T-182 增加 runtime session facade，T-183 增加 session 快照版本化，T-184 增加 session registry，T-185 增加 registry 快照，T-186 增加 registry 回收，T-187 增加 registry 快照归一化，T-188 增加 registry 事件通知，T-189 增加 registry 空闲回收，T-190/191 增加 registry 事件游标与归一化，T-192~194 增加 registry 事件回放/确认/快照恢复，T-195~196 增加 registry 回放取消/超时边界，T-197 增加 registry 恢复确认门面，T-198 增加 registry 恢复并发协调器，T-199 增加 registry 异常隔离，T-200~201 增加 registry 恢复结果归一化与安全门面，T-202 增加 coordinator signal/deadline 入口，T-203~204 增加 signal/deadline 提交门面，T-205~207 增加 registry 快照校验、差异计算与归一化，T-208~209 将一致性校验接入 snapshot recovery 并固定 invalid_snapshot 终态，T-210 增加 registry 快照版本构建与兼容门禁，T-211 增加跨 session 摘要，T-212~213 增加 registry 专用差异队列与入队桥接，T-214~216 增加 diff queue 安全回放、确认与快照恢复，T-217~218 增加 diff replay 取消/超时边界，T-219~220 增加 diff recovery 归一化与确认门面，T-221 增加 diff recovery coordinator，T-222 增加 diff coordinator 快照，T-223 增加 registry 联合诊断摘要，T-224~225 增加 registry/diff 双游标联合恢复与原子确认，T-226~227 增加联合恢复取消/超时边界，T-228 增加联合诊断归一化，T-229~230 增加 Agent diagnostics capability 契约与异常隔离 handler，T-231 增加 diagnostics canonical effects 安全注册适配器；649/649 自动测试、TypeScript 与 diff 检查通过。生产 bundle 暂不接入该独立模块。

当前基线：`v0.16.39`（发布提交 `3d0d841`），开发头为本地 `main`；本地分支已包含未推送的性能/UI提交，T-071~T-121 已完成，T-122~T-235 已启动。正式发版继续后置。

当前状态：继续推进不依赖真实设备的 Agent、搜索兼容、状态恢复、UI 体验和自动化门禁；手机端测试按 D-042 永久跳过，不以浏览器烟测替代真实设备验收。

已完成：

- 桌面端真实宿主验收、内核端点兼容修复和 stale-while-revalidate 韧性增强。
- 分层搜索、最近打开/关闭恢复、收藏、文档集、三端快捷入口、第二面板和 28 个内置组件。
- 11 项 Agent 能力：导航、搜索、组件快照、组件诊断、大纲、工作区上下文、单篇/批量打开及受控写操作。
- Agent `navigation-state` 新增有界 `closed` 最近关闭列表；`workspace-context` 同步提供 `closedTabs`，均为只读快照。
- Agent 导航与工作区快照现在以当前打开页签优先，自动排除同 rootId 的陈旧关闭记录，避免模型误判可恢复状态。
- 已记录 D-010：去重只发生在 Agent 输出边界，不修改持久化关闭历史，等待后续事件同步自然收敛。
- Agent 标题搜索复用兼容提取器，支持 `data.files`、`data.documents`、`result.records` 等旧宿主包装，避免合法标题结果被误判为空。
- 状态文档已统一到 v0.16.38，T-023 完成。

验证基线：T-066~T-121 后 `pnpm verify:release` 全绿，包含 TypeScript、生产构建、609/609、移动烟测和 Chromium 样式烟测；raw bundle 自律预算 345 KiB，压缩包约 294.6 KiB，条目级差异与硬上限余量均由 diagnostic 持续观测。T-122~T-156 先以独立契约模型推进，暂不增加生产 bundle。

待处理：

1. 继续保持完整自动门禁和 300 KiB 压缩包硬上限。
2. 下一候选：观察路径筛选端点兼容性并在真实桌面节点验证侧栏最小 chip 实验；T-103 生产入口仍需能力探测与至少 2 KiB 包体余量，真实窄屏验收按 D-042 后置。
3. 用户明确确认后，才执行 push、打 tag、创建 Release 等正式发版动作。

本轮新增（2026-09-13）：T-144 为 workspace bridge 增加两个 data-driven handler 工厂，输出结构化与 JSON 序列化双通道；T-145 将两项 capability 的 spec/effects/handler 组合为可注册定义数组；T-146 在 bridge 暴露不含正文的 `preview` 审批预览；T-147 为工厂增加同步/异步异常隔离；T-148 增加按 capability 名称固定 effects 的安全注册适配器；T-149 增加 canonical spec 对象防伪校验；605/605 自动测试、TypeScript 与 diff 检查通过。下一候选为整理正式 `addAgentCapability` 注册定义，但需先释放生产包体余量，避免将独立 bridge 执行链直接塞入当前入口。

2026-09-13 只读宿主探测：本机 6806 端口返回思源访问授权页，未找到可复用的已认证会话；未调用受保护路径端点，T-107 继续等待合法桌面验收会话。

当前外部限制已归档为 B-005（非工程阻塞）；在获得合法已认证桌面会话前，不重复启动宿主或猜测认证信息。

接手并行会话（2026-09-12 晚）：18 commit（智能体快照/封闭历史/发现扩展/诊断加固/3 新组件等）+ 未提交的 D-040 搜索分页功能已代为提交（5073a9c/92279f4），548/548 测试全绿、预算校准 328KiB。远端同步与 v0.16.39 发布待用户指令。
open-documents 真机点击测试暂缓（2026-09-12 晚）：检测到用户正活跃使用机器（微信/ZCode 输入中），继续 GUI 自动化会干扰实时操作——依据事故教训主动中止。该测试待用户空闲时自测（AI 面板一句话即可），或下次会话确认空闲后代测。
商店 UI 升级（本轮）：默认对话框 680×560 → 最大 960×720；内置组件按功能分 7 组（日记与日程/任务与清单/文档与导航/数据洞察/学习与记忆/采集与速记/系统与工具），插件组件按来源作者分组，组头带数量；每卡片加迷你骨架预览（stat 大数字型 / list 列表型）；搜索过滤跨组生效。548/548 全绿，已提交未推送（801319f）。
本轮新增（2026-09-13）：journal-calendar 日历月视图（第 27 个内置）与 writing-streak（第 28 个内置，协议 v2.3 `viewType=weekdays`）；完成 `stat.arc` 进度环渲染器、面板首开延迟首读、卡片配色预设和可选农历次级文本；D-042 已录（跳过常规设备测试）。
UI 打磨（本轮）：折叠按钮文字→箭头图标；空状态淡色前缀；日历格悬停反馈；条目悬停左侧强调色条；stat hero 数字加大加粗；面板内嵌套外壳已去除（上轮）。本地开发提交待推送。
性能+交互优化（本轮）：组件面板打开时前两项立即读取、其余按空闲回调/80ms 阶梯延迟，且销毁时清理尾部任务；折叠体 max-height+opacity 平滑动画；进度条圆角端点；条目悬停过渡；新增进度环按需渲染；月历支持可关闭农历次级文本、前后 24 个月导航和笔记本筛选。后续候选：缩略图缓存按需降载。
关键经验：SiYuan 3.8.x 查询参数使用 `stmt`；`getTag/getBookmark` 返回裸数组；全文搜索空 `types` 表示不搜索任何类型；前端 Agent 能力只能经宿主内部 AI 通道分发；真实宿主验收不可由 mock 或浏览器模拟替代。
2026-09-12 续接开发：完成 10 个第三方插件的静态调研并记录于 `docs/plugin-research.md`；新增 `recent-writing-activity`（按日创建内容块统计）与 `recent-daily-notes`（只读近期已存在日记）两个内置组件，支持三端、配置边界、缓存/超时/取消协议。更新双语 i18n 与 home model，自动测试 532/532 通过，`pnpm verify:release` 全绿。下一步：轻量文档关系摘要与预约块格式调研，Android 真机回归仍等待用户设备。
2026-09-12 后续推进：环境核验确认 Node/pnpm/TypeScript/Webpack/GitHub CLI/自动测试可用，`adb` 与 Java 不可用，Android 真机回归继续保持独立阻塞。新增 `document-relations-summary` 内置只读组件：按当前活动文档查询直接子块与有限引用，不引入关系图引擎；测试与构建门禁继续保持绿色。下一步为预约块格式调研及 Agent 取消/超时边界回归。
2026-09-12 继续完成 T-028：基于 dailynote-today 源码确认预约块稳定契约为 `attributes.name=custom-reservation`、`value=YYYYMMDD`，新增 `today-reservations` 只读组件（未来 0–14 天、最多 12 条）。
2026-09-12 T-029 完成：Agent 搜索现在统一归类取消、超时和普通失败，避免旧 WebView/宿主异常名称差异泄漏；新增回归测试，自动测试 533/533。下一步推进 T-030 组件可观测性。
2026-09-12 T-030 完成：新增 `home-adapter-diagnostics` 只读 Agent 能力，复用现有有界诊断环，返回最多 32 条安全摘要；533 项自动测试通过，正在复跑完整发布门禁。
2026-09-12 T-031~T-033 完成：搜索响应提取器支持已知字段的两层嵌套包装，并加入循环对象、未知字段和深度上限回归；Agent 诊断输出统一经纯函数与 JSON Schema 约束；Agent 搜索截止时间不再依赖 `AbortController`，超时与取消可区分。TypeScript 与专项测试通过；生产 bundle 经等价压缩保持 317 KiB 原预算。
2026-09-12 T-034~T-035 完成：`home-adapter-diagnostics` 新增 1–1440 分钟时间窗口及按原因/设备聚合，输出仍基于最多 32 条安全记录；搜索宿主包装回归改为数据驱动矩阵并固定首个非空数组优先级。新增汇总使 raw bundle 自律线调整为 319 KiB，package.zip 仍为约 291 KiB。
2026-09-12 T-036~T-038 完成：新增 11 项 Agent 能力的 effects/注册/schema 一致性矩阵；`home-widget-snapshot` 目录支持按设备与只读属性筛选，输出声明支持端和只读状态，并以 24 条单页、64 条扫描上限提供 offset/total/truncated。raw bundle 自律线合并调整为 321 KiB，压缩包继续守住 300 KiB。
2026-09-12 T-039~T-040 完成：内置组件增至 25 个，新增当前活动文档大纲（原生 outline 端点、共享扁平化、最多 12 个标题、三端点击定位）；Agent 组件目录新增 `builtin/external` 安全来源字段，不暴露 adapter 执行函数或第三方私有数据。
2026-09-12 T-041~T-042 完成：`recent-writing-activity` 与 `recent-daily-notes` 均增加可选笔记本配置；只接受规范思源笔记本 ID 并通过 `blocks.box` 限定 SQL，空配置保持原有全库只读查询，近期日记仍不创建缺失日记。TypeScript 与 23 项专项测试通过。下一步推进 Agent 组件目录来源筛选和重复项收敛。
2026-09-12 T-043~T-044 完成：`home-widget-snapshot` 发现模式新增 `builtin/external` 来源筛选，输入 schema 与运行时一致；目录在设备、只读和来源筛选前按合法 `moduleId` 保留首个注册项，重复项不再扭曲总数和分页。TypeScript 与 27 项 Agent 专项测试通过，正在执行完整发布门禁。
2026-09-12 T-045~T-046 完成：组件目录越界 `offset` 统一钳制到筛选后 `total`，空页元数据可继续用于稳定分页；可选笔记本 SQL 条件抽为 `buildNotebookBoxScope` 纯函数，仅合法思源 ID 能生成 `blocks.box` 片段。32 项专项测试与生产构建通过，`index.js` 328479 字节、`package.zip` 298930 字节。
2026-09-12 T-047~T-050 完成：`recent-edits` 新增 1–20 条与笔记本配置，`today-writing`、`note-stats`、`random-review` 新增可选笔记本范围；六组统计/列表 SQL 统一复用安全 `blocks.box` 片段，空配置保持既有全库结果。TypeScript、24 项专项测试和生产构建通过；`index.js` 329127 字节，原始自律线校准为 322 KiB，`package.zip` 298977 字节且 300 KiB 硬上限不变。
2026-09-12 T-051~T-054 完成：往年今日新增条数/笔记本配置，剪藏待读和近期预约新增笔记本范围，本月日记新增条数/笔记本配置并以 `action:journal:<notebookId>` 定向打开或创建今日日记；联表 SQL 仅允许内部 `b/B` 别名。同期修复预约 `days=0` 被错误回退到 3 的边界。TypeScript、53 项专项测试与生产构建通过；`index.js` 330085 字节、`package.zip` 299104 字节。
2026-09-12 T-055 完成：ROADMAP 同步为 25 个内置组件、11 项 Agent 能力和 544 项验证基线；已完成任务表收敛到 T-054，并明确继续开发本地只读组件/Agent 边界、真实设备验收后置的当前口径。
2026-09-12 T-056~T-057 完成：Agent 组件目录为每项公开最多 8 个重新清洗的 `configFields`（类型、范围、选项、默认值）；组件快照调用按目标 configSchema 丢弃未知字段、钳制数字并验证枚举/笔记本 ID，不再透传任意配置对象。TypeScript 与 29 项 Agent 专项测试通过，生产 `index.js` 332102 字节、`package.zip` 299687 字节。
2026-09-12 T-058~T-061 完成：Agent 组件快照新增有界 `stat`、条目 `count/done`、`cached/updatedAt`，并让 moduleId 模式复用 `offset` 返回 `device/total/offset/truncated`；总数按清洗后的有效条目计算。TypeScript、30 项 Agent 专项测试和生产构建通过；`index.js` 333732 字节、`package.zip` 300058 字节。
2026-09-12 T-062~T-065 完成：Agent 组件快照回显最多 8 项 `appliedConfig`，新增稳定 `retryable`，支持 `refresh=true` 绕过短缓存；合法但未注册或读取异常的 moduleId 改为符合 outputSchema 的 `unregistered/failed` 快照。TypeScript、31 项 Agent 专项测试与生产构建通过；`index.js` 334701 字节、`package.zip` 300270 字节。
