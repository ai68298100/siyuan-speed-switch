# 路径筛选真实宿主能力证据（T-107）

> 采集日期：2026-09-16　宿主：SiYuan 内核 **3.8.4-beta.2**（本机已认证会话，`127.0.0.1:6806`）
> 关联：T-103、T-107、B-005、D-357、`docs/path-filter-desktop-plan.md`
> 采集方式：**只读** API 调用。本文档不记录任何笔记本名称、文档标题或路径内容（仅结构与字段名）。

## 结论

**路径筛选依赖的端点可用，且响应结构与 `src/path-filter-model.js` 的既有假设完全一致。**
T-107 的三项要求中，"端点可用性"与"响应结构"两项**已取得真实证据**；"最窄侧栏宽度"属 UI 层，需另行取证。

因此 `tests/path-filter-ui-contract.test.cjs` 所要求的"宿主端点获批"这一前提，**在 API 层面已成立**。

## 一、端点可用性

| 端点 | 认证 | 状态 | 延迟 | `code` |
| --- | --- | --- | --- | --- |
| `/api/system/version` | 不需要 | 200 | — | 0 |
| `/api/notebook/lsNotebooks` | 需要 Token | 200 | 63ms | 0 |
| **`/api/filetree/listDocsByPath`** | 需要 Token | **200** | **22ms** | **0** |

- 内核版本 **3.8.4-beta.2**，高于插件 `minAppVersion` 3.1.20。
- 未认证访问返回 `401 {"code":-1,"msg":"Auth failed [session]"}`，与 B-005 描述一致；使用工作空间 `conf.json` 中的 API token 后正常。

## 二、响应结构（与模型假设逐项对照）

实测响应字段：`box`、`path`、`files`、`effectiveSortMode`

`files[]` 单项字段（按内核返回顺序）：`path, name, titleEmpty, icon, name1, alias, memo, bookmark, id, count, size, hSize, mtime, ctime, hMtime, hCtime, sort, subFileCount, childrenSortMode, newFlashcardCount, dueFlashcardCount, flashcardCount`

模型仅消费其中 4 个，均存在：

| `path-filter-model.js` 使用 | 真实响应 | 结论 |
| --- | --- | --- |
| `file.id` | `id` | ✅ |
| `file.name` | `name` | ✅ |
| `file.path` | `path` | ✅ |
| `file.subFileCount` → `hasChildren` | `subFileCount` | ✅ |

模型的响应校验分支（`normalizePathFilterListResponse`）逐条对照：

```js
data.box !== request.body.notebook          → 实测 box 回显等于请求值      ✅ 通过
normalizeTreePath(data.path) !== req.path   → 实测 path 回显等于请求值      ✅ 通过
!Array.isArray(data.files)                  → 实测为数组                    ✅ 通过
```

**未发现会导致 `mismatch` 误判的情况。**

## 三、边界行为（本轮额外汇总）

| 场景 | 内核行为 | 对插件的含义 |
| --- | --- | --- |
| 根路径 `/` | `code:0`，返回顶层项 | 正常 |
| 下钻子层级 | `code:0`，`box`/`path` 回显均一致 | 逐级浏览可行 |
| **不存在的路径** | **`code:0`，`path` 回显等于请求值，`files` 为空数组** | **语义为"空目录"而非错误**，模型返回 `{ok:true, items:[]}`，符合预期 |
| 不存在的 notebook | `code:-1`，`data:null` | 被正确识别为失败 |
| 缺少 `notebook` 参数 | `code:-1`，`msg:"Field [notebook] is required"` | 内核自带参数校验 |
| `maxListCount` | 请求 3 返回 3 | **模型的 `limit + 1` 截断探测机制成立** |

其中"不存在的路径返回成功 + 空数组"是本轮最值得记录的发现：它意味着路径筛选**不需要**为"用户选了已删除的路径前缀"设计专门的错误分支，空结果即可表达。

## 四、尚未取得的证据

| 项 | 原因 | 归属 |
| --- | --- | --- |
| **最窄可用侧栏宽度** | 属 UI 层度量，API 不提供 | T-107 剩余部分 / T-080 / T-093 |
| 侧栏与移动端的实际渲染表现 | 同上 | 同上 |
| 大目录下的截断真实触发 | 测试笔记库目录规模不足 | 可在含 100+ 文档的目录复测 |

## 五、复核方式

证据可随时复现（**只读**）：

```
GET  http://127.0.0.1:6806/api/system/version
POST http://127.0.0.1:6806/api/notebook/lsNotebooks        Authorization: Token <token>
POST http://127.0.0.1:6806/api/filetree/listDocsByPath     Authorization: Token <token>
     body: {"notebook":"<id>","path":"/"}
```

采集脚本未写入仓库（含本机路径假设），如需固化为可重复流程，建议改为读取环境变量注入 token。

## 六、对 B-005 与 T-103 的影响

- **B-005 部分解除**：已获得**可用的已认证会话**（本机内核 + token），API 层证据不再是阻塞项；仍缺的是**侧栏宽度**这类纯 UI 度量。
- **T-103 可推进**：`docs/path-filter-desktop-plan.md` 中的方案前置条件（端点获批）已满足，接入后应以本轮证据作为放宽 `path-filter-ui-contract.test.cjs` 的正式依据。
