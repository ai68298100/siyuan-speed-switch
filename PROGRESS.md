# 进度

当前任务：无（真机验收闭环完成：3 个潜伏 Bug + 韧性改进全部落地并实测）
上次检查点：stale-while-revalidate（失败回退陈旧快照+缓存标记）已实测；最终构建已部署本机思源；本地 11 commit 待推送
已完成（连续三轮自主循环 = 真实宿主验收专项）：
- 桌面真机验收（备份 0.16.32 → 部署 RC → GUI 逐项实测 → 还原布局），结果在 docs/acceptance-v0.16.37.md
- 🐛 Bug 1（重大）：/api/query/sql 参数名 stmt 非 query——SQL 组件真机一直静默失败，修复 16 处
- 🐛 Bug 2：适配器注册缺 sizes → 尺寸菜单塌缩 medium-only，registerAdapter 继承内置默认
- 🐛 Bug 3：3.8.x getTag/getBookmark data 直接为数组 → 标签/书签恒显 0，已兼容，实测"剪藏 (25)"
- 🔧 尺寸菜单视口钳制；错误态附原因码（timeout/backoff 等可自辨）
- 🔧 stale-while-revalidate：读取失败且有上次好数据时展示旧快照+缓存标记，不再整块报错（同步高峰期体验修复）
- 内核端点实证审计：全部白名单端点直连验证，无更多参数名错配
未提交变更：src/home-controller.js（stale 回退）、tests/home-controller.test.cjs（+1 测试）、TODO.md
上次提交：683e2a0 fix: tags/bookmarks data shape on 3.8.x + error reason codes
本地待推送：11 commit
下一步（需用户）：复核 → Agent 能力实测（T-021，需 AI 宿主）→ 手机端（T-022，需设备）→ 升 0.16.37 发版
验证基线：tsc 0 错误、528/528 测试、verify:release 全绿
关键经验：①内核 SQL 端点参数名是 stmt 不是 query；②3.8.x getTag/getBookmark 的 data 直接是数组；③单测 mock 掩盖真实协议差异——真机验收不可豁免；④同步高峰期组件瞬时超时属正常，现已优雅降级为陈旧数据+缓存标记

