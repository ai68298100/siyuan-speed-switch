# 进度

当前任务：无（桌面端真机验收完成；SQL 参数名与尺寸菜单两个真 Bug 已修复并实测）
上次检查点：真机验收完成（见 docs/acceptance-v0.16.37.md 顶部结论）；527/527 测试；verify:release 全绿；dist 308,851 字节已部署回本机思源
已完成（本轮自主循环 = 真实宿主验收）：
- 备份本机 0.16.32 插件目录（Temp/speed-switch-0.16.32-bak）→ 部署 RC → 重启思源完成 GUI 验收
- 🐛 Bug 1（重大）：/api/query/sql 参数名内核要求 `stmt`，插件一直传 `query`——所有 SQL 类组件在真实宿主静默失败（至少自 v0.16.32 起）。修复 16 处调用点
- 🐛 Bug 2：内置适配器注册未传 sizes → 注册定义覆盖默认后尺寸菜单塌缩为仅 medium。修复：home-runtime.registerAdapter 继承内置默认 sizes + 回归测试
- 加固：尺寸菜单视口钳制（不再弹出屏外）
- GUI 实测通过：刷新全部/闪卡/随机回顾/尺寸瓦片/问候头/商店页签/增删组件/布局还原
- 验收结果已写回 docs/acceptance-v0.16.37.md
未提交变更：src/index.ts（stmt 16 处 + 菜单钳制）、src/home-runtime.js（sizes 继承）、tests/home-runtime.test.cjs、docs/acceptance-v0.16.37.md
本地待推送：8 commit + 本轮 bugfix（commit 后 9）
下一步：用户可复核桌面验收结论；剩余待测 = Agent 能力实测（需 AI 宿主）+ 手机端；之后即可升 0.16.37 发版
验证基线：tsc 0 错误、527/527 测试、verify:release 全绿
关键经验：内核 SQL 端点参数名是 stmt 不是 query；单测 mock 掩盖了真实协议差异——真机验收不可豁免
