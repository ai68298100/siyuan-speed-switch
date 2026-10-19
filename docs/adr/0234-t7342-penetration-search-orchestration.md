# ADR 0234：T-7342 深入穿透检索运行时编排与安全只读 SQL 生成

日期：2026-10-19  
状态：accepted

## 背景

T-7338 已实现深入穿透检索的语法解析模型（`parsePenetrationQuery`，区分 `doc`、`outline` 与 `block` 三种模式）。然而，思源内核各检索能力分布在完全不同的 HTTP 端点：
1. 普通文档搜索：`/api/filetree/searchDocs`，接收 `{ k: query }`；
2. 大纲标题穿透：`/api/outline/getDocOutline`，接收 `{ id: docId }` 并返回递归嵌套树；
3. 块级深入检索：`/api/query/sql`，接收 `{ stmt: sql }` 执行参数化或结构化查询。

若直接将带有 `^` 或 `:` 语法的原始输入发送至内核端点，会导致 SQL 语法报错、空结果或端点拒绝。因此必须建立纯模型层的**请求规划器（Request Planner）**与**响应聚合器（Result Aggregator）**，并对块级 SQL 查询实施严格的防注入安全防线。

## 决策

1. **新建运行时编排模型 `src/penetration-search-orchestration.js`**：
   - **请求规划（`planPenetrationSearchRequest`）**：
     - `mode === "doc"`：规划为 `/api/filetree/searchDocs`，传纯净查询；
     - `mode === "block"`：规划为 `/api/query/sql`，调用安全 SQL 生成器；空关键词标记 `empty: true`；
     - `mode === "outline"`：当前文档穿透校验 `activeDocId`（若无则安全返回 `error: "no_active_doc"`，杜绝盲目网络请求）；跨文档穿透规划为先解析目标文档；
   - **防注入 SQL 生成（`escapeSqlLiteral` & `buildBlockSearchSql`）**：
     - 单引号强制双写转义（`'` -> `''`）；
     - 严格剔除危险字符（分号 `;`、SQL 注释符 `--`、换行与制表符）；
     - 强制生成只读 `SELECT id, root_id, content, type, sub_type, updated FROM blocks`；
     - 强制排除纯根文档块（`type NOT IN ('d')`）；
     - 强制附带 `LIMIT`（默认 20，硬上限 40）；
   - **树展平与结果聚合（`flattenOutlineTree` & `aggregatePenetrationResults`）**：
     - 递归将大纲嵌套树展平为一维带 `depth` 属性的节点列表；
     - 大纲结果聚合映射为 `{ id, rootId, blockId, title, subTitle: "文档名 · Hn 标题", icon: "iconAlignLeft", kind: "heading" }`；
     - 块结果聚合映射为 `{ id, rootId, blockId, title, subTitle: "文档名 · 正文块", icon: "iconParagraph", kind: "block" }`。
2. **由 `src/search-model.js` 统一再导出**：保持搜索层单一出口约定。
3. **档案预算微调 584 -> 586 KiB**：
   - T-7341 DOM 装配层与 T-7342 编排模型连续入图后，工作树 `package.zip` 达到 598,398 B；
   - 微调至 586 KiB（600,064 B），为后续 UI 交互接线保留 **1,666 B** 的健康余量；
   - bundle raw 自律线保持 1,160 KiB（`dist/index.js` 为 1,187,401 B，低于自律线 439 B）；单条目压缩上限（320 KiB，ADR 0089）保持不变。
4. **生产图闭包上限 85 -> 86**：实测 86，按同口径校准（先例 T-6814/T-6950/T-7260/T-7334~T-7341）。

## 证据与边界

- **类型与全量测试**：`pnpm exec tsc --noEmit` 0 错误；全量测试从 8911 项扩充至 **8917 通过 / 1 跳过 / 0 失败**（新增 6 项 penetration-search-orchestration 契约）。
- **五组负向注入验证**（按 `docs/gate-audit-checklist.md`）：
  1. SQL 注入字符剔除（分号/注释符被剥离） ✅
  2. 无活动文档保护（当前文档大纲在无 activeDocId 时返回明确错误） ✅
  3. 空块前缀保护（空关键词不生成无效 SQL） ✅
  4. 非渗透计划传入安全返回空数组 ✅
  5. LIMIT 永远受 `MAX_BLOCK_LIMIT` 钳制 ✅
- **构建与包体**：生产构建 `package.zip` 为 **598,398 B**，稳定处于新 586 KiB（600,064 B）仓库门禁之内（健康余量 **1,666 B**）；`dist/index.js` 为 1,187,401 B（低于 1,187,840 B 自律线 439 B）；压缩条目 319,747 B（低于 327,680 B 门禁 7,933 B）。
- **批量门禁全绿**：可复现构建 3/3 一致；四大批量门禁 49/49、50/50、50/50、178 tasks 全部通过；六套浏览器 Smoke 全部复绿；`git diff --check` 通过。
- **边界声明**：本决策交付**端点请求规划器、防注入 SQL 生成与大纲/块响应聚合纯模型**，不改动远端 Release、Git Tag 或包版本号。切换器主搜索框的异步请求发送与 UI 渲染接力归后续生产接线任务。
