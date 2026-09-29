# 第三面板 R3 原型 ↔ 生产对照矩阵（T-7013，2026-09-29）

R3 原型画面清单见 [统一体验优化计划](ui-ux-improvement-plan-2026-09-28.md) §4；本矩阵逐屏对照生产实现与证据，**只审计不新增实现**。状态口径：✅ 已实现（有任务/测试锚点）｜🟡 部分（余项有归属）｜⏸ 后置（归 B-004/B-005 或 T-7015）。安全近似口径与安全边界见 [ADR 0096](adr/0096-snippet-studio-product-scope-and-preview.md)。

| R3 画面 | 生产实现 | 锚点（任务 / 测试 / 文件） | 状态 |
| --- | --- | --- | --- |
| 全屏 / 自适应 / 固定尺寸 | `studioSizeMode` 三模式（默认全屏），adaptive/custom 走 `resolvePanelSize` 同一管线；设置页「面板」标签实验室窗口组（桌面专属 + 预览入口） | T-6986（D1=A）；`tests/kernel-widgets-wiring.test.cjs`（T-6877/T-6986 块）；`tests/panel-size-settings-contract.test.cjs` | ✅ |
| CSS 预览（场景/宽度/主题） | 三场景四宽度 + 明暗 + 基线对照；容器不足回退单视图 | T-6960；`tests/snippet-preview-scenes.test.cjs` | ✅ |
| 能力回执（场景/宽度/主题/探针/脚本/网络/语义/token） | 冻结纯模型回执 + 回执行（role=status） | T-6987；`tests/snippet-preview-contract-v2.test.cjs` | ✅ |
| 覆盖诊断（命中/可能未命中/未知 + 错误行列） | 有界 selector 分层分析 + details 折叠面板 | T-6988；`tests/snippet-preview-contract-v2.test.cjs` | ✅ |
| 内容扩展（Callout/列/公式/属性/数据库/媒体占位/文档标题） | 探针特征 17 项 + 静态夹具；媒体 blocked 占位（无真实媒体元素、零远程） | T-6989；`tests/snippet-preview-content-theme.test.cjs` | ✅ |
| 主题桥接（token 快照） | 只读内置 light/dark 快照单源渲染；外部注入被无视；回执标注只读 | T-6990；`tests/snippet-preview-content-theme.test.cjs` | ✅ |
| JS blocked | 片段脚本不执行预览；run 按钮禁用 + 可见文案；能力说明常驻 | T-6963（D3 关闭 T-6996 复议）；`tests/snippet-preview-mount.test.cjs`（sandbox/CSP 挂载断言） | ✅ |
| 脏稿守卫（保存并继续/放弃/取消） | 七条离开路径统一走待执行意图协调器；同步阻止 + 只导航一次 | T-6956；`tests/snippet-leave-wiring.test.cjs` | ✅ |
| 冲突 diff 与保留副本 | 差异预览 + 四出口（继续编辑/禁用副本/放弃重载/取消） | T-6958；`tests/snippet-conflict-wiring.test.cjs` | ✅ |
| AI 待审核（diff/hunk 人工接受） | AI SSE 生成/优化/解释 + diff/lint/hunk 审核 + 手动接受事务 | T-6862/T-6905/T-6907；`tests/snippet-studio-ai.test.cjs` | ✅ |
| 保存回执与未保存徽标 | 唯一底部保存 + 脏稿徽标 + 保存后回读核对 | T-6943/T-6944；snippet 模型/宿主测试 | ✅ |
| 撤销重做 / 查找替换 | 统一草稿历史（50 步/512KiB 预算、IME 边界）+ 字面查找替换两步确认 | T-6957/T-6959；`tests/snippet-draft-history-wiring.test.cjs`、`tests/snippet-find-replace-wiring.test.cjs` | ✅ |
| 目录 / 原生管理 / 导入导出 | 目录浮层 + 原生读写/冲突 + UserCSS 导入导出 + 最近片段 | T-6860/T-6979；snippet 模型/宿主测试 | ✅ |
| 边界能力说明（五条常驻） | CSS 沙箱/JS 禁执行/AI 仅草稿/AI 上下文/原生唯一保存源 | T-6908/T-6909；snippet-studio-ui 能力清单 | ✅ |
| 入口与加载闭环 | 平台导航/工作台对象动作/悬浮球/公开命令四入口 + chunk 失败回退 | T-6894；`tests/kernel-widgets-wiring.test.cjs` | ✅ |
| 尺寸/预览/诊断 mount 级行为 | jsdom 挂载：sandbox/CSP/referrer、宽度回退、主题快照、基线探针关闭、dispose | T-6995a；`tests/snippet-preview-mount.test.cjs` | ✅ |
| 视觉矩阵（明暗/窄窗/高对比截图） | 自动化部分= mount 测试 + 对比度采样门禁（既有）；**浏览器截图矩阵归 T-7015 全页面验收** | T-6995（部分）；T-7015 承接 | ⏸ T-7015 |
| 真实桌面观感 / 真实主题渲染 | 安全近似口径既定（ADR 0096）——预览不代表当前笔记，回执常驻说明 | ADR 0096；B-005 | ⏸ B-005 |

## 结论

- R3 第三面板画面 **15/17 已实现且有测试锚点**；2 项后置（截图矩阵 → T-7015；真实桌面观感 → B-005），无未登记缺口。
- T-6986~T-6990 合同已全部被生产消费，无重复实现；本矩阵未产生生产代码变更。
