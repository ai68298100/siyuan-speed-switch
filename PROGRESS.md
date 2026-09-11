# 进度

当前任务：无（真机验收 + 端点审计 + 三连 Bug 修复完成）
上次检查点：错误原因码 + 标签/书签 data 形状修复已实测（标签显示"剪藏 (25)"）；本地 10 commit 待推送
已完成（上轮 + 本轮自主循环）：
- 真机桌面验收完成（备份 0.16.32 → 部署 RC → GUI 逐项实测 → 还原布局）
- 🐛 Bug 1（重大）：/api/query/sql 参数名内核要求 `stmt`，插件一直传 `query`——所有 SQL 类组件在真实宿主静默失败（至少自 v0.16.32 起）。修复 16 处调用点
- 🐛 Bug 2：内置适配器注册未传 sizes → 注册定义覆盖默认后尺寸菜单塌缩为仅 medium。修复：home-runtime.registerAdapter 继承内置默认 sizes + 回归测试
- 🔧 尺寸菜单视口钳制（不再弹出屏外）
- 🐛 Bug 3（本轮）：getTag/getBookmark 的 data 在 3.8.x 直接是数组，适配器读 data.tags/data.bookmarks 恒 undefined → 标签/书签组件恒显 0。已兼容两种形状，实测"剪藏 (25)"出数据
- 🔧 错误态附原因码（"暂时无法加载 · timeout"）——诊断出此前"全灭"现象 = 云同步窗口期瞬时超时（退避+重试设计内的正常现象，非缺陷）；编辑模式双切换复验稳定
- 内核端点实证审计：getDocOutline/getDoc/searchDocs/getTag/getBookmark/lsNotebooks/riff 全部直连 3.8.2 内核验证通过——无更多参数名错配
未提交变更：src/home-view.js（原因码）、src/index.ts（标签/书签形状）、tests/home-controller.test.cjs + tests/home-view.test.cjs（断言更新）、docs/acceptance-v0.16.37.md（结果回写）
上次提交：1ce6589 fix: real-host acceptance found two latent bugs
本地待推送：10 commit（51ee5d1 → … → 1ce6589 → 本轮 fix）
下一步（需用户）：复核桌面验收 → Agent 能力实测（需 AI 宿主）→ 手机端 → 升 0.16.37 发版
验证基线：tsc 0 错误、527/527 测试、verify:release 全绿
关键经验：①内核 SQL 端点参数名是 stmt 不是 query；②3.8.x getTag/getBookmark 的 data 直接是数组；③单测 mock 掩盖真实协议差异——真机验收不可豁免；④同步高峰期组件瞬时超时属正常，原因码可自辨
