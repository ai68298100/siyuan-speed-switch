# ADR 0271：T-7372 预览窗格无 contenteditable 节点回退与 dataset.title 兜底 (v0.48.14)

日期：2026-10-24  
状态：accepted  
任务：T-7372  

## 背景

持续优化第一面板与文档检索预览窗格（`sw__tab-preview`）的内容解析鲁棒性：
1. **静态/只读导出视图下预览内容丢失**：此前 `extractDocPreviewBlocks` 在解析 `/api/filetree/getDoc` 返回的 HTML 块时，严格依赖 `node.querySelector('[contenteditable="true"]')`，而在思源某些只读视图、静态发布模式或特殊块类型中，节点并不会渲染 `contenteditable="true"` 属性，导致这些块的文字被误判为空并静默丢弃；
2. **预览头部文档标题偶发缺失**：此前 `docPreviewItemTitle` 仅在 DOM 子树中查找 `.sw__doc-title` 或 `.sw__title`，若项元素属于自定义结构或尚未渲染标题文本节点，会导致预览窗口顶部呈现空标题。

## 决策

1. **富文本块 `contenteditable` 缺省回退**：
   - 在 `extractDocPreviewBlocks` 中调整为：`add(node.querySelector('[contenteditable="true"]') || node, kind)`；
   - 列表/任务项中调整为：`const textNode = item.querySelector('[contenteditable="true"]') || item;`；
   - 优先读取 `contenteditable` 内部干净文本，在无此属性时平滑回退至节点自身文本，确保任何模式下的富文本块均能正确提取并预览；
2. **`docPreviewItemTitle` 首选 `dataset.title` 兜底**：
   - 调整为 `return item.dataset.title || item.querySelector(...)?.textContent?.trim() || "";`；
   - 保证只要条目在渲染时挂载了 `dataset.title`，预览头部就能立刻呈现完整、准确的文档名称；
3. **版本升级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.13` -> `0.48.14`，并在 GitHub 发布 Release `v0.48.14`，确保集市爬虫准时索引。

## 证据与验证

1. **定向契约测试**：`tests/preview-contenteditable-and-dataset-title.test.cjs` 3/3 通过；
2. **预览行为测试**：`tests/doc-preview-behavior.test.cjs` 12/12 通过；
3. **全量单测与审计**：9095+ 项测试全绿，四大批量审计全部 PASS。
