# 进度

当前任务：无（真机验收专项完全闭环：4 个潜伏 Bug 全修，核心搜索链路真机打通）
上次检查点：types 修复已部署真机并复验（"腾讯会议"返回 12 篇命中）；本地 13 commit 待推送
已完成（连续五轮自主循环 = 真实宿主验收专项）：
- 真机桌面验收（备份 0.16.32 → 部署 RC → GUI 逐项实测 → 还原布局），结果在 docs/acceptance-v0.16.37.md
- 🐛 Bug 1（重大）：/api/query/sql 参数名 stmt 非 query——SQL 组件真机一直静默失败，修复 16 处
- 🐛 Bug 2：适配器注册缺 sizes → 尺寸菜单塌缩 medium-only，registerAdapter 继承内置默认
- 🐛 Bug 3：3.8.x getTag/getBookmark data 直接为数组 → 标签/书签恒显 0，实测"剪藏 (25)"
- 🐛 Bug 4（重大，本轮）：fullTextSearchBlock 空 types = 不搜任何类型 → 全文内容搜索回退从未命中。修复：无类型筛选时显式声明 document/heading/paragraph/codeBlock。真机"腾讯会议"返回 12 篇
- 🔧 尺寸菜单视口钳制；错误态原因码；stale-while-revalidate（失败回退旧快照+缓存标记）
- 🔧 环境修复：强杀导致的宿主全文索引损伤随重建自愈（B-002 关闭）
- 内核端点实证审计全部通过；切换器/搜索/商店/问候头真机回归全部通过
未提交变更：无（全部已提交）
上次提交：56a991f docs: live-host regression（types 修复在下一次 commit 或已包含——见 git log）
本地待推送：13 commit
下一步（需用户）：①复核（搜索/组件面板已可直接体验）；②Agent 实测（需 AI 宿主，3.8.2 可能低于 addAgentCapability 要求）；③手机端 → 升 0.16.37 发版
验证基线：tsc 0 错误、529/529 测试、verify:release 全绿
关键经验：①stmt 非 query；②getTag/getBookmark data 为数组；③fullTextSearchBlock 空 types=无类型（需显式默认四类型）；④单测 mock 掩盖协议差异——真机验收不可豁免；⑤强杀思源损坏全文索引——环境操作一律优雅退出
