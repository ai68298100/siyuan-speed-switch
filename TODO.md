# TODO

> 当前基线：v0.16.38（`935a917`）；本地 `main` 保留未推送开发线及本轮工作区增量。继续开发优先于正式发版；发版需维护者明确确认。

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

- [x] T-023 状态文档与发布基线同步
  - 目标：让 PROGRESS/TODO/BLOCKERS/ROADMAP 明确反映 v0.16.38，避免把历史发布记录当作当前状态
  - 状态：done（2026-09-12）
- [x] T-024 Agent 与搜索兼容性增量
  - 目标：在不依赖 Android 真机的前提下，继续补充能力边界、宿主返回结构兼容和回归门禁
  - 验收：每个增量包含单测/类型检查，并保持 `pnpm verify:release` 全绿
  - 进展：已完成 Agent 历史去重、已知字段嵌套包装兼容、循环/深度边界，以及无 `AbortController` 宿主的截止时间；状态转为 done，后续增量拆分为独立任务
  - 状态：done（2026-09-12）
- [x] T-025 第三方插件调研与内置组件决策
  - 证据：`docs/plugin-research.md`，覆盖 10 个仓库的功能、可借鉴点、许可与安全边界
  - 状态：done
- [x] T-026 内置 `recent-writing-activity` 与 `recent-daily-notes`
  - 证据：home model/adapters 注册、双语 i18n、配置范围与测试通过
  - 状态：done
- [x] T-027 轻量文档关系摘要组件
  - 证据：新增 `document-relations-summary`，仅查询活动文档直接子块/引用，条数上限 12，三端只读
  - 状态：done（完整关系图布局不做）
- [x] T-028 预约块格式调研与只读组件
  - 证据：`siyuan-dailynote-today` 使用 `attributes.name='custom-reservation'`、`value=YYYYMMDD`；新增 `today-reservations`，限制未来 0–14 天和 12 条
  - 状态：done；不执行插入、取消或创建操作
- [x] T-029 Agent 取消/超时回归
  - 证据：新增统一 `normalizeAgentFailureReason`，覆盖 AbortError/ABORT_ERR/TimeoutError/普通异常，并接入 Agent 搜索错误返回；533 项自动测试通过
  - 状态：done
- [x] T-030 组件可观测性
  - 证据：新增只读 Agent capability `home-adapter-diagnostics`，返回受限设备/模块/时间/稳定原因字段；不暴露异常对象或敏感数据
  - 状态：done
- [x] T-031 搜索宿主嵌套包装兼容
  - 证据：`extractSearchRecords` 仅沿已知字段遍历两层对象包装，支持 `result.data.documents` / `data.result.records`，循环对象安全并拒绝未知或过深字段
  - 状态：done
- [x] T-032 Agent 诊断输出规范化
  - 证据：新增 `buildAgentHomeDiagnostics` 纯函数，限定类型、设备、模块 ID、时间戳和 32 条上限；输出通过 capability JSON Schema 校验
  - 状态：done
- [x] T-033 Agent 搜索跨宿主截止时间
  - 证据：搜索截止 Promise 不再依赖 `AbortController`，标题与全文请求共用 5 秒截止时间，并区分 `timeout` / `cancelled`
  - 状态：done
- [x] T-034 组件诊断统计摘要
  - 证据：`home-adapter-diagnostics` 支持 1–1440 分钟窗口，返回按六类原因和三种设备聚合的有界 summary；明细 limit 不影响窗口总计
  - 状态：done
- [x] T-035 搜索结果包装兼容矩阵
  - 证据：六种已知包装与首个非空数组优先级改为数据驱动回归矩阵，另有未知字段、过深包装和循环对象反例
  - 状态：done
- [x] T-036 Agent 能力一致性矩阵
  - 证据：自动测试严格划分 6 个只读能力和 5 个动作能力，校验 11 个唯一名称、effects、handler，以及所有输入未知字段和输出字符串/数组上限
  - 状态：done
- [x] T-037 组件目录能力增强
  - 证据：`home-widget-snapshot` 发现模式支持 `device` / `readOnly` 筛选，返回 `supportedDevices` / `readOnly` 元数据；目录上限固定为 24
  - 状态：done
- [x] T-038 组件目录有界分页
  - 证据：发现模式新增 `offset`、`total`、`truncated`，单页最多 24、扫描最多 64，外部组件增多时仍可继续发现后续条目
  - 状态：done
- [x] T-039 当前文档大纲组件
  - 证据：新增 `current-document-outline`，复用 `/api/outline/getDocOutline` 与 `flattenOutline`，仅取活动文档最多 12 个标题，三端只读且标题块可点击定位
  - 状态：done
- [x] T-040 Agent 组件目录来源元数据
  - 证据：组件目录每项新增 `source: builtin|external`，只依据规范化 category 推导，不输出插件状态、回调或私有存储
  - 状态：done
- [ ] T-041 写作活跃度笔记本范围
  - 目标：为 `recent-writing-activity` 增加可选笔记本过滤，保持 7–30 天、只读聚合和 SQL 参数边界
- [ ] T-042 近期日记笔记本范围
  - 目标：为 `recent-daily-notes` 增加可选笔记本过滤，支持多日记本用户定向浏览且仍不创建缺失日记
