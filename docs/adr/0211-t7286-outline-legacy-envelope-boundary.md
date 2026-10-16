# ADR 0211：当前文档大纲旧宿主包装与无活动文档边界

- 日期：2026-10-16
- 状态：accepted
- 任务：T-7286
- 相关：T-7144、ADR 0194、ADR 0209

## 背景

当前文档大纲和 Agent 大纲都复用思源的嵌套节点投影。已知 3.8.x 响应是 `data` 数组，节点可能混用 `name`、`content`、`blocks` 和 `children`；候选矩阵仍把旧版本包装字段和无活动文档列为未证边界。仓库没有可核验的旧宿主样本，直接猜测 `data.outline` 或 `data.blocks` 会扩大支持声明并可能把错误响应显示成空大纲。

## 决策

1. 工作台大纲只有在存在合法活动文档根 ID 时请求 `/api/outline/getDocOutline`；没有活动文档时立即返回 `homeCurrentDocumentMissing` 空态。
2. 当前接线只接受 `json.data` 为数组，其他包装或非数组响应抛出 `invalid_document_outline`，不猜测字段并展开。
3. `flattenOutline` 对未归一化 envelope、`null` 和其他非数组输入返回空数组；已知节点字段和深度/数量上限继续由既有模型负责。
4. 只有取得可核验旧宿主 fixture 后，才允许新增包装归一化；本轮不改生产协议。

## 验证

- Agent 大纲定向测试覆盖已知嵌套、HTML 实体、坏节点、上限以及 `{data: [...]}`、`{outline: [...]}`、`null` 的安全拒绝。
- 工作台接线契约冻结无活动文档分支、`Array.isArray(json?.data)` 守卫和 `flattenOutline(json.data, 64)` 有界入口。
- 两路负向注入（移除空态分支、移除响应形状守卫）均使目标测试精确失败，并恢复 `src/index.ts` 原始 SHA-256。

## 边界

本任务没有宣称兼容任何未取证的旧版本包装，也没有改变大纲查询、节点上限或 UI 文案。无活动文档仍是可解释空态；未知响应仍进入失败回执，由统一组件错误边界处理。
