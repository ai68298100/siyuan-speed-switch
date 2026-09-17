# ADR 0056：语义搜索第三方法（P3-3 搜索第二批）

- 日期：2026-09-17
- 状态：已接受（T-6299）
- 范围：`search-model` / `types.ts` / `index.ts` / `doc-search-ui` / i18n 双语

## 背景

dev-plan P3 收尾项："第二批搜索筛选（查询语法/正则/语义），且仅当宿主能力明确支持"。
勘察发现**查询语法与正则此前已交付**（doc-search 筛选菜单的 method 子菜单已含
keyword/query/regexp，模型层枚举与透传齐全），真正的缺口是**语义搜索**：
模型层早已铺好 `method: 4` 与 `/api/search/semanticSearchBlock` 端点路由
（`buildFullTextSearchRequest` 的 `capabilities.semanticSearch` 门），但生产代码
**没有任何调用方确认过该能力**——语义路径实际不可达。

## 宿主能力勘察结论（2026-09-17，思源源码 v3.7.1 / v3.8.4 / master 三点核查）

1. `/api/search/semanticSearchBlock` 于 2026-06-30~07-02 落地内核
   （"Semantic search using AI embeddings" 提交序列，v3.7.x era）；
   **用户宿主 v3.7.1 已注册**，v3.8.4 与 master 均在。
2. 请求契约与 `fullTextSearchBlock` 共用 `parseSearchBlockRequest`
   （query/paths/types/subTypes/page/pageSize），**忽略 method/orderBy/groupBy**。
3. 未配置 AI embedding 时内核**静默返回空结果**（HTTP 200 + 空 blocks、无错误码，
   `kernel/model/embedding.go` 的 `!embeddingTableOk || !isEmbeddingEnabled()` 守卫）——
   运行时无法区分"未配置"与"无命中"。
4. 因此能力判定的唯一可靠信号是 `window.siyuan.config.ai.embedding`
   （`enabled === true && apiKey` 非空）——与内核 `isEmbeddingEnabled()` 精确镜像；
   且该配置项与端点**同版本落地**，配置存在即代表端点存在，无需额外网络探针。

## 决定

1. **纯函数** `isSemanticEmbeddingConfigured(config)`（`search-model.js`）：
   输入宿主配置对象，输出能力布尔；可独立测试。
2. **宿主方法** `isSemanticSearchAvailable()`（`index.ts`）：读
   `getSiyuan()?.config` 后委托纯函数。**实时读取不缓存**——用户中途启用
   AI 配置无需重载插件即可生效。
3. **UI 门控**：`DocSearchUiHost` 契约加该方法；能力为 true 时 method 菜单
   才追加"语义搜索"选项；筛选摘要标签同步支持。能力不可用时已选中的
   `filters.method = "semantic"` 由模型层**静默降级 keyword**（既有契约测试钉住）。
4. **三条请求路径透传 `capabilities`**：全文回退、打开文档扇出
   （模型层 `buildOpenedDocumentSearchRequest(s)` 新增透传）、原生搜索标签页配置。
5. i18n 双语成对新增 `searchMethodSemantic`。
6. **Agent 面不扩**：`SEARCH_METHODS` 保持 keyword/query/regexp——Agent 能力
   审计与协议文档需另行走账，语义暂为 UI 专属。

## 验证

- `tsc --noEmit` 0 错误；新增 4 项模型测试（能力门纯逻辑 / 单请求路由 /
  打开文档扇出透传 / 原生标签页配置跟随能力）。
- `verify:release` 全链绿（EXIT=0）。

## 教训

1. **网络探针必须区分"请求失败"与"确认不存在"**：勘察时 curl 静默失败返回
   空体，被误判为 v3.8.4 无 semanticSearchBlock（0 命中）；带 EMPTY_BODY
   检测重试后实为 2 处命中。"命中 0 当可疑信号"纪律同样适用于探针脚本自身。
2. **UI 选项缺失优于静默空结果**：内核对未配置 embedding 静默返回空，若无条件
   展示语义选项，用户会得到"永远搜不到"的模式且无任何提示——宁缺毋滥，
   能力不明确就不提供入口。
