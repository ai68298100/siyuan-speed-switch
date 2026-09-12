# TODO

> 当前基线：v0.16.38（`935a917`），其上本地 `main` 已有 7 个未推送开发提交。继续开发优先于正式发版；发版需维护者明确确认。

## P0

- [x] T-001~T-004 前轮已完成（组件面板入口/商店分区/受控写/大纲能力）
  - 状态：done
- [x] T-018 组件面板"刷新全部"按钮（v0.16.36，已推送 2b792ce）
  - 状态：done
- [x] T-019 桌面端真实宿主验收（v0.16.37 RC，本机思源 v3.8.2）
  - 验收：刷新全部/闪卡待复习/随机回顾/尺寸预览瓦片/问候头/商店页签/增删组件/布局还原 全部通过
  - 战果：抓出 3 个潜伏 Bug（stmt 参数名 16 处、尺寸菜单塌缩、标签书签 data 形状）全部修复
  - 结果：docs/acceptance-v0.16.37.md
  - 状态：done
- [x] T-020 韧性改进：读取失败时回退陈旧快照 + 错误态原因码
  - 验收：同步高峰期超时不再整块报错，展示旧数据并标"缓存"；错误态附原因码可自诊
  - 状态：done

## P1

- [x] T-021 Agent 能力真机实测（open-documents / workspace-context 等）
  - 验收：在配置了 AI 的思源里让模型调用能力，确认确认弹窗与输出
  - 验收：在配置了 AI 的思源里让模型调用能力，确认确认弹窗与输出
  - 依赖：已实证 3.8.2 即有 addAgentCapability（10 项能力应已注册）；外部 RPC 桥探测返回 Plugin not loaded——前端能力只能经思源内部 AI 通道分发，无法绕过 AI 直调，必须用户在有 LLM 配置的环境里以对话触发
  - 状态：done（2026-09-12 真机验证：workspace-context 全链路调用成功，证据见验收文档 3.5 节）
- [ ] T-022 手机端回归抽查（Android 真机）
  - 依赖：需要 Android 设备
  - 状态：blocked on user

## P2

- [x] T-016 收集箱组件
  - 状态：won't-do（D-005：云端 API 不符合本地优先）

## P3（持续开发）

- [ ] T-023 状态文档与发布基线同步
  - 目标：让 PROGRESS/TODO/BLOCKERS/ROADMAP 明确反映 v0.16.38，避免把历史发布记录当作当前状态
  - 状态：done（2026-09-12）
- [ ] T-024 Agent 与搜索兼容性增量
  - 目标：在不依赖 Android 真机的前提下，继续补充能力边界、宿主返回结构兼容和回归门禁
  - 验收：每个增量包含单测/类型检查，并保持 `pnpm verify:release` 全绿
  - 进展：已完成 Agent 导航/工作区快照的打开优先去重，以及标题搜索 `files/documents/docs` 包装兼容；继续处理取消/超时边界
- [x] T-025 第三方插件调研与内置组件决策
  - 证据：`docs/plugin-research.md`，覆盖 10 个仓库的功能、可借鉴点、许可与安全边界
  - 状态：done
- [x] T-026 内置 `recent-writing-activity` 与 `recent-daily-notes`
  - 证据：home model/adapters 注册、双语 i18n、配置范围与测试通过
  - 状态：done
- [ ] T-027 轻量文档关系摘要组件
  - 目标：仅显示当前文档父/子/反链的有限摘要，不引入图布局库
- [ ] T-028 今日预约块格式调研
  - 目标：确认思源预约块稳定格式；不稳定时仅记录结论
- [ ] T-029 Agent 取消/超时回归
  - 目标：覆盖 capability handler 的 AbortSignal、超时、旧响应丢弃与稳定错误码
- [ ] T-030 组件可观测性
  - 目标：提供只读诊断摘要、缓存命中/失败原因和设备维度统计，不暴露异常对象或敏感数据
- [x] T-027 轻量文档关系摘要组件
  - 证据：新增 `document-relations-summary`，仅查询活动文档直接子块/引用，条数上限 12，三端只读
  - 状态：done（完整关系图布局不做）
- [x] T-028 预约块格式调研与只读组件
  - 证据：`siyuan-dailynote-today` 使用 `attributes.name='custom-reservation'`、`value=YYYYMMDD`；新增 `today-reservations`，限制未来 0–14 天和 12 条
  - 状态：done；不执行插入、取消或创建操作
