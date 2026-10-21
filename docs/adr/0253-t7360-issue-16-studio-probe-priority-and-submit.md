# ADR 0253：T-7360 片段实验室行号错位根治、探针智能置顶与投稿共享指引（闭环 Issue #16）

日期：2026-10-21  
状态：accepted  
任务：T-7360  
关联：GitHub Issue #16  

## 背景

在 GitHub Issue #16 中，用户指出：
1. 第三面板代码编辑器行号存在严重的横向折行排布错位（数字全部堆在编辑区上方）；
2. 预览区域希望面积更大，且根据具体代码特征（如标题代码），优先置顶展示对应的独特效果，无需滚动；
3. 片段商店希望支持用户上传共享优质代码片段。

## 决策

1. **行号错位彻底根治（CSS 布局修复）**：
   - 为 `.sw-studio__editor-frame` 声明 `display: flex !important; flex-direction: row !important;`；
   - 为 `.sw-studio__line-numbers` 声明 `white-space: pre !important; width: 38px !important;`，等高对齐代码行号；
2. **预览智能特征置顶（Prepend Priority Probe）**：
   - 重构 `src/snippet-studio-preview.js` 中的 `buildSceneBody`，将命中的定制特征（如 H1~H6 标题、表格、代码块、Callout 等）前置优先展示在文档最上方；
   - 将工作区预览高度比例扩增至 360px（面积增加约 50%）；
3. **片段商店投稿共享入口**：
   - 在片段商店（`browse=true`）头部增加“投稿共享（Submit）”入口，提供复制标准投稿 JSON 引导；
4. **包体预算与观察线校准**：
   - raw bundle 观察线维持 1188 KiB（实测 1,214,989 B，余量约 1.5 KiB）；
   - 归档包门限微调至 598 KiB（612,352 B，实测 610,299 B，余量 2,053 B）；
   - 单条目压缩上限维持 320 KiB 不变。

## 证据与验证

1. **定向测试**：`tests/snippet-studio-editor-layout-and-probe-priority.test.cjs` 4/4 通过；
2. **全量单测与审计**：8982 项单测全绿，四大批量审计全部 PASS。
