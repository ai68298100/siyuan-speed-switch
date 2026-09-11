# 进度

当前任务：无（v0.16.37 全部开发与验收准备完成，等待用户实测）
上次检查点：90e6e60（本地 7 commit 未推送，verify:release 全绿，package.zip 289,440 字节与 HEAD 同步）
已完成（本轮自主循环）：
- docs/acceptance-v0.16.37.md 验收清单：覆盖 6 个功能 commit 的逐项手动测试步骤 + 回归抽查 + 已知边界 + 安装指引
- README 能力表补全：中文表自 v0.16.25 起就漏了 append-to-journal 且写着"四项"，现补全为十项并修正类型标注；英文 README 两处过期段落同步
- 远端 CI 确认：origin/main (2b792ce) 最近 5 次 CI 全部 success
未提交变更：无
上次提交：90e6e60 docs: acceptance checklist for v0.16.37
本地待推送：7 个 commit（51ee5d1 → f02a00d → edf26aa → a925a2d → 5acd542 → 878319b → 90e6e60）
下一步（需用户）：按 docs/acceptance-v0.16.37.md 实测（装根目录 package.zip）→ 通过后回复"发版"→ 升 0.16.37 写合并日志推送打 tag；第四层等待 task-horizon#94 / docktomato#4 作者回复
验证基线：tsc 0 错误、526/526 测试、verify:release 全绿、dist/index.js 308,564 字节（304KiB 预算内）
续跑口令：读取 PROGRESS.md 恢复；本地领先远端 7 commit，网络恢复后可推送

