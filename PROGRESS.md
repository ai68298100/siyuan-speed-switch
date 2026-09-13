# 进度

当前基线：`v0.16.39`（发布提交 `3d0d841`），开发头为本地 `main`；本地分支已包含未推送的性能/UI提交，T-071~T-110 已完成。正式发版继续后置。

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

验证基线：T-066~T-114 后 `pnpm verify:release` 全绿，包含 TypeScript、生产构建、577/577、移动烟测和 Chromium 样式烟测；raw bundle 自律预算 345 KiB，压缩包约 294.6 KiB，条目级差异与硬上限余量均由 diagnostic 持续观测。

待处理：

1. 继续保持完整自动门禁和 300 KiB 压缩包硬上限。
2. 下一候选：观察路径筛选端点兼容性并在真实桌面节点验证侧栏最小 chip 实验；T-103 生产入口仍需能力探测与至少 2 KiB 包体余量，真实窄屏验收按 D-042 后置。
3. 用户明确确认后，才执行 push、打 tag、创建 Release 等正式发版动作。

接手并行会话（2026-09-12 晚）：18 commit（智能体快照/封闭历史/发现扩展/诊断加固/3 新组件等）+ 未提交的 D-040 搜索分页功能已代为提交（5073a9c/92279f4），548/548 测试全绿、预算校准 328KiB。远端同步与 v0.16.39 发布待用户指令。
open-documents 真机点击测试暂缓（2026-09-12 晚）：检测到用户正活跃使用机器（微信/ZCode 输入中），继续 GUI 自动化会干扰实时操作——依据事故教训主动中止。该测试待用户空闲时自测（AI 面板一句话即可），或下次会话确认空闲后代测。
商店 UI 升级（本轮）：默认对话框 680×560 → 最大 960×720；内置组件按功能分 7 组（日记与日程/任务与清单/文档与导航/数据洞察/学习与记忆/采集与速记/系统与工具），插件组件按来源作者分组，组头带数量；每卡片加迷你骨架预览（stat 大数字型 / list 列表型）；搜索过滤跨组生效。548/548 全绿，已提交未推送（801319f）。
本轮新增（2026-09-13）：journal-calendar 日历月视图（第 27 个内置）与 writing-streak（第 28 个内置，协议 v2.3 `viewType=weekdays`）；完成 `stat.arc` 进度环渲染器、面板首开延迟首读、卡片配色预设和可选农历次级文本；D-042 已录（跳过常规设备测试）。
UI 打磨（本轮）：折叠按钮文字→箭头图标；空状态淡色前缀；日历格悬停反馈；条目悬停左侧强调色条；stat hero 数字加大加粗；面板内嵌套外壳已去除（上轮）。本地开发提交待推送。
性能+交互优化（本轮）：组件面板打开时前两项立即读取、其余按空闲回调/80ms 阶梯延迟，且销毁时清理尾部任务；折叠体 max-height+opacity 平滑动画；进度条圆角端点；条目悬停过渡；新增进度环按需渲染；月历支持可关闭农历次级文本。后续候选：月历翻月按钮、可见性驱动读取、缩略图缓存按需降载。
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
