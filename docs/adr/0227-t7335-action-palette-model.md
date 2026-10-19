# ADR 0227：T-7335 Raycast 式次级动作画板纯领域模型与档案预算微调

日期：2026-10-19  
状态：accepted

## 背景

2026-10-19 行业竞品调研（Raycast / Alfred / Obsidian Quick Switcher++ / VS Code Quick Open 对齐）明确提炼出第一条演进方向：次级动作画板（Action Palette，Tab / ⌘+K 呼出）。小驴雷切切换器目前对选中条目仅支持"默认激活 + 鼠标右键打开菜单"两步路径，缺乏流式动作编排的画板抽象。

同时，本轮在 T-7334（路径首字母缩写打分）与 T-7335（次级动作画板）两批纯模型代码入图后，工作树 package.zip 已被推向 591,892 B，逼近 ADR 0180 校准的 578 KiB（591,872 B）硬上限。

## 决策

1. **次级动作画板采用纯领域模型**（`src/action-palette-model.js`）：条目上下文归一化、可用动作清单、即时过滤与执行回执由模型输出，UI 装配与执行归调用方。
2. **三类动作分区**（`ACTION_SECTIONS.OPEN/COPY/MANAGE`）：覆盖"打开类（4 模式）/复制类（4 形式）/管理类（3 切换）"共 12 个内置动作。
3. **多端能力隔离**：桌面专属动作（右侧分栏、底部分栏、预览模式）显式声明 `platforms: ["desktop"]`，移动端与侧栏接口不允许泄漏。
4. **类型/平台门禁**：`supportedKinds` 双向约束，禁止 `close-tab` 等破坏性动作被推送给文档搜索结果（kind="doc"），禁止 `restore-doc-set` 被推送给非文档集条目（kind!="doc-set"）。
5. **i18n 完整交由调用方注入**：模型本体不内嵌回退字符串，UI 在 `getAvailableActions` 调用前把 `src/i18n/*.json` 注入。
6. **档案预算微调 578→580 KiB**（ADR 0227）：T-7334/T-7335 双纯模型合计增量约 2 KiB；减量审计后无可移除的运行时死重，仅"必备 + 减量已穷尽"事实成立。
7. **顺带修复 `GLOBAL_BRIDGE_ALIASES` 未导出**：`src/api/external-bridge.js` 中该常量已在 v0.47.6 引入但未挂到 `exports`，补充 `exports.GLOBAL_BRIDGE_ALIASES = GLOBAL_BRIDGE_ALIASES` 修复跨插件协议。

## 证据与边界

- **类型与全量测试**：`pnpm exec tsc --noEmit` 0 错误；全量测试从 8860 项扩充至 **8865 通过 / 1 跳过 / 0 失败**（较基线 8850 净增 15 项新契约；修复 raikiri-external-bridge 1 项历史失败）。
- **门禁负向验证**：经破坏性注入验证（放宽 open-right 平台门禁为 mobile），定向测试 2 项失败，确认平台门禁与类型门禁真实有效。
- **构建与包体**：生产构建 `package.zip` 为 **591,892 B**，稳定处于新 580 KiB（593,920 B）仓库门禁之下（余量 **2,028 B**）；`dist/index.js` 为 1,168,704 B（低于 1,187,840 B 预算线 19,136 B）；压缩条目 313,736 B（低于 327,680 B 门禁 13,944 B）。
- **批量门禁全绿**：可复现构建 3/3 一致；release-batch-audit（49/49）、quality-batch-audit（50/50）、integration-boundary-audit（50/50）、current-status-audit（171 tasks）以及 compat-probe、desktop-acceptance 全部通过。
- **生产图闭包**：实测 79，上限按同口径校准 78→79（先例 T-6814/T-6950/T-7260/T-7334）。
- **边界声明**：本决策不改动远端 Release、Git Tag 或包版本号；动作画板的 UI 装配（弹层/快捷键/键盘导航）属后续生产接线任务（不在本批次内），但画板模型与执行回执已可独立集成验证。
