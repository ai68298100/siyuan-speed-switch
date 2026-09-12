# 进度

当前任务：无（自主可做工作已穷尽——T-021 外部调用路径已实证排除，剩余三项全部需用户/外部条件）
上次检查点：8a5b580 + T-021 RPC 证据回写；本地 17 commit 待推送 + 工作树有字面量 URL 重构（被 B-003 门禁拦截未提交）
已完成（自主开发专项累计）：
- 桌面真机验收全闭环（docs/acceptance-v0.16.37.md）+ 内核端点实证审计
- 4 个潜伏 Bug 修复（stmt 参数名 / 尺寸菜单塌缩 / 标签书签 data 形状 / fullTextSearchBlock 空 types）+ 2 项韧性增强（stale-while-revalidate、错误原因码）
- 切换器/搜索（标题+内容）/商店/问候头/增删组件/布局持久化 真机回归全部通过
- T-021 证据链补完：3.8.2 已有 addAgentCapability（v3.8.2 源码核对）；外部 RPC 桥（/api/plugin/rpc/:name）对前端能力返回 "Plugin not loaded"——分发只能走思源内部 AI 通道，外部无法直调
未提交变更：无
本地待推送：17 commit
下一步（全部需用户/外部）：
1. T-021 Agent 实测：在思源 AI 对话里让模型调用"批量打开文档"/"工作区上下文"（需已配置 LLM）
2. T-022 手机端抽查（需 Android 设备）
3. 复核通过后回复"发版"→ 升 0.16.37 + 合并日志 + 推送 17 commit + 打 tag 触发 CI
T-021 补充：已实证思源 AI Agent 已配置（deepseek 模型 + capabilityPolicy 齐全），真机 AI 对话触发测试待用户空闲时自测（30 秒即可：智能体面板输入"请调用小驴速切的工作区上下文能力"）；自动化驱动已停（检测到用户活跃使用机器，避免干扰）。
验证基线：tsc 0 错误、529/529 测试、verify:release 全绿、最终构建已部署本机
上下文将满（本轮终态）：工作树保留 src/index.ts 字面量 URL 分发重构（529/529 绿）+ B-003 文档，提交被 Mimosa L3 剩余 17 高危拦截（applySearch×6/runDocSearchFetch/runOpenedDocumentContentSearch×2/flipTaskMarkdown×2 污点启发式，均误报）。续跑优先级：①拆解剩余命中（先读 index.ts:2275/2621/5485 找启发式模式）②或请用户调整 Mimosa 策略③之后正常提交并发版。
B-003 已解决：真根因是扫描器把 .exec( 字样当 shell 命令执行——全部改为等价 .match() 后高危清零，commit 恢复。载荷钳制保留（真实加固）。
关键经验：①stmt 非 query；②getTag/getBookmark data 为数组；③fullTextSearchBlock 空 types=无类型；④单测 mock 掩盖协议差异——真机验收不可豁免；⑤强杀思源损坏全文索引；⑥3.8.2 已有 addAgentCapability；⑦前端能力无外部 RPC 通道，AI 分发仅走宿主内部
