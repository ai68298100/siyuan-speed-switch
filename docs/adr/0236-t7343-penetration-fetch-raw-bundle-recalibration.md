# ADR 0236：深入穿透检索运行时接线后的 raw 包体自律线校准

- 状态：已采纳
- 日期：2026-10-20
- 任务：T-7343

## 背景

ADR 0125（2026-10-04）把 `dist/index.js` 的 raw 观察线校准到 1160 KiB，
归档包（`package.zip`）与压缩入口上限维持 586 KiB / 288 KiB 不变。

T-7343 把深入穿透检索的**运行时接线**接入切换器主搜索管线，这是 T-7338
（穿透语法模型）、T-7340（穿透编排与穿透检索纯模型）之后的生产兑现：

1. `runDocSearchFetch` 新增穿透分流分支：`^块内容` 走 `/api/query/sql`，
   `:标题` 走 `/api/outline/getDocOutline`，`文档名:标题` 走两段式
   （先 `/api/filetree/searchDocs` 定位文档，再取大纲）。
2. `buildDocResultItem` 新增 heading/block 图标分支（`#iconAlignLeft` /
   `#iconParagraph`）与 `subTitle` 副标题行。
3. `resolveDocSearchResultId` 补齐蛇形 `root_id` 兼容（内核 `searchDocs`
   返回下划线字段），并让 heading/block 条目以 `blockId` 作为去重键，
   避免同一文档的多个标题被折叠成一条。

## 决策

raw 产物从 1,181,840 B 增长到 **1,189,884 B**（净增 8,044 B ≈ 7.9 KiB），
超出 1160 KiB 观察线 2,044 B。减重复核结论：

- 穿透分流是对既有纯模型契约的生产接线，不是新增功能堆叠；
- 新增分支全部在既有函数体内，未引入新依赖、新 vendor、新入口；
- 无可剥除的死重代码（穿透端点聚合复用 `aggregatePenetrationResults`）。

据此把 raw 观察线由 **1160 KiB 校准到 1164 KiB**（`RAW_BUNDLE_BUDGET_BYTES`），
`RAW_BUNDLE_BUDGET_ADR` 指向 0236。**归档包 586 KiB 与压缩入口 288 KiB 上限不变**
——`package.zip` 当前 599,002 B，仍在 600,064 B 门限内。

## 验证

1. `pnpm exec tsc --noEmit` 0 错误；
2. `node tests/penetration-search-fetch.test.cjs` 6/6 通过，含一组负向注入门禁
   （`blockId` 缺失时锚定断言失败）与一组去重键回归锁（注入 `if (false)`
   关闭 blockId 去重键后用例变红，还原后复绿）；
3. `node scripts/readiness-snapshot.cjs` 重生成产物快照；
4. 全量测试、生产图隔离、`release-quality` 预算门禁重新通过。

## 后续

穿透检索的剩余接线（动作画板挂载 T-7344、多端 e2e T-7345）若再推高包体，
须各自重复本校准流程，不得静默抬高归档包上限。
