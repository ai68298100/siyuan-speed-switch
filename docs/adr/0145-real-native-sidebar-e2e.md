# ADR 0145：真实 dock 侧栏的显式 opt-in E2E

- 状态：已接受，已实施 partial evidence
- 日期：2026-10-05
- 任务：T-7115

## 背景

普通 desktop bundle 的 viewport 测试不能证明思源 `addDock` 的宿主布局、分隔条宽度或 dock 控件焦点。直接把这类浏览器结果记为最窄原生侧栏通过会掩盖 B-005 仍缺少的窗口视觉和读屏证据。

## 决策

1. 新增 `tests/e2e/native-sidebar.spec.mjs`，只有 `SWSS_E2E_NATIVE_SIDEBAR=1` 才运行，避免发布门禁和多插件 E2E 无意打开真实 dock。
2. 场景必须调用生产插件实例的 `toggleSidebar()`，同时确认 `.layout__dockr`、真实 `dock__item[data-type]` 和宿主分隔条；仅改变 Playwright viewport 不构成证据。
3. 宽度通过真实宿主分隔条拖动取得，记录控件命中盒、键盘焦点、可访问名称、溢出和筛选重置；同时只截取插件侧栏根节点的窄宽度视觉快照。报告和快照只保存尺寸、选择器和状态，不保存令牌、文档标题或正文。
4. 该结果只更新 T-7115 的 host `partial` 证据；原生桌面窗口最终视觉、主题、读屏和人工最窄宽度继续受 B-005 约束。

## 验证

- 隔离思源 3.8.6 E2E：`1 passed`，dock `340px → 245px`，根/工具栏无横向溢出，内核错误日志为空。
- `tests/native-sidebar-e2e-contract.test.cjs`：opt-in、真实宿主标识、分隔条宽度、筛选重置、可访问名称和局部视觉快照断言均通过；删除各关键断言的负向注入精确失败。
