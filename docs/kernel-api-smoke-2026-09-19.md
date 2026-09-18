# 内核只读 API 冒烟证据（数据库表格 av 形状专项）

> 取证日期：2026-09-19　方式：对运行中的本机内核（127.0.0.1:6806，已认证 Token，只读请求）逐端点探针
> 关联：T-6305 必验项 5b.8、T-6330/ADR 0058、T-6369、docs/acceptance-runbook.md
> 隐私：仅记录形状/计数/字段名与 ID 前缀；任何笔记内容与完整 ID 均未落盘。

## 环境

- 工作区：本机（D:\小飞驴的SIYUAN），内核 127.0.0.1:6806（SiYuan-Kernel.exe）
- 探针期间思源被正常重启过一次（ECONNREFUSED 窗口后同端口恢复）

## 逐端点结果（形状摘要）

| 端点 | 结果 |
| --- | --- |
| /api/notebook/lsNotebooks | 200 / code 0，13 个笔记本 |
| /api/filetree/listDocsByPath | 200 / code 0；file 含 `subFileCount`（置顶文档组件的子文档数假设成立） |
| /api/asset/getMissingAssets | 200 / code 0；元素字段 = **`item` \| `name` \| `blockIDs`**（数组）；**无 `path` 字段**；`blockIDs[0]` 为标准块 ID 格式 |
| /api/storage/getRecentDocs | 200 / code 0；元素字段 = `rootID\|title\|viewedAt\|openAt`；`viewedAt` 为**秒级**数字 |
| /api/inbox/getShorthands | 200 / code 1 / data null（未登录思源云）→ 组件的确定空态路径成立 |
| /api/storage/getCriteria | 200 / code 0；本工作区 count=0（无已存筛选） |
| /api/av/renderAttributeView | 200 / code 0；见下 |

## 关键发现 1：renderAttributeView 在 3.8.4 内核上返回 rows=0

- 对本工作区 3 个真实 av（含含数据的表）调用 `{id}` → `data.view.rows=[]`、`rowCount=0`。
- 追加 `pageSize=50/100`、`viewID=<真实 viewID>` 均仍为 0 行——不是分页问题。
- view 形态为**扁平结构**：`view = {id, viewType:"table", columns:[...], rows:[], rowCount, filters, sorts, group, ...}`，无旧 `view.table` 子对象。
- 含义：ADR 0058/模型 T-6369 假设的“renderAttributeView 返回行数据”在本机 3.8.4 内核上**不成立**——数据库表格组件在此内核上会显示空表。这正是 T-6305 把 av JSON 列为最高优先的原因。

## 关键发现 2：3.8.4 的真实数据形态在 getAttributeView

- `/api/av/getAttributeView {id}` → `data.av`：
  - `av.keys = spec|id|name|customColors|keyValues|keyIDs|viewID|views`
  - **值存放在 `av.keyValues`（按键聚合），行清单在 `view.rowIds`**——旧 `view.table.rows[].cells[].value.keyID` 结构在本内核不存在。
  - `view.table = {spec, id, showIcon, wrapField, columns, rowIds}`：columns 只有定义（id|wrap|hidden|pin|width…），行以 `rowIds` 有序清单表达。
- 结论：**T-6470 数据库表格数据源重构**——从 renderAttributeView 切换到 getAttributeView（或两者结合），按 `rowIds × columns × keyValues` 组装有界投影；`value` 的取值字段（content/type 等）在实现时用真实响应再核对一次。

## 关键发现 3：getMissingAssets 无 path，但有 blockIDs → data-health 修正项

- 真实元素 = `{item, name, blockIDs}`：模型当前读取的 `path` 恒为空（T-6434 的 showPath 显示恒空，无害但无效）。
- `blockIDs[0]` 是标准块 ID → 正确的“入口”是**点击缺失项跳转到引用它的文档块**（value=blockID 走面板既有点击打开语义），替代当前无动作的行。

## 附带发现

- 本工作区数据库 `content` 字段包含全表拼接文本（含敏感信息）——任何探针/日志不得输出该字段；本轮一次探针曾在本地终端输出过（未落盘、未外传），此后探针已收紧为只输出键名与计数。
- CI 镜像漂移（T-6464）与本文件发现共同指向同一结论：**凡未经真实宿主核对的响应形状假设，都应在接线上视为待验证项**。

## 追加探针（同日第二轮）：块 ID ≠ 数据库 ID——T-6470 根因确认

- 内核版本实测：**3.8.4**（/api/system/version）。
- 工作区 data/storage/av/ 下有 **119 个库文件**（最大 ~30 KB），远多于 SQL blocks type='av' 可见的块。
- 用**库 ID**（而非块 ID）调用两个接口均正常：getAttributeView(库ID) → keyValues 5 条、
  valuesSum=115、view rowIds=37；renderAttributeView(库ID, viewID, pageSize=100) → rows=31 /
  rowCount=31，row[0].cells[0].value 含 {keyID, blockID, type, block, createdAt, updatedAt}——经典形状完整可用。
- **根因定案**：嵌入/镜像形态下 av 块 ID ≠ 数据库 ID（块 IAL 里只有 view 引用），以块 ID 调
  renderAttributeView/getAttributeView 得到空定义或 null。T-6330/T-6369 的模型假设在“块 ID=库 ID”
  的直连库上成立，在嵌入库上不成立——这就是真机显示空表的完整解释。
- **T-6470 实施规格（据实确定）**：
  1. 发现层：SQL blocks type='av' 之外，补充“库 ID 直查”——对用户选定的库 ID 直接
     renderAttributeView(库ID, viewID, pageSize)；配置选择器允许手填/粘贴库 ID。
  2. 取数层：renderAttributeView 带 viewID + pageSize=100；rows/rowCount/cells/value{keyID,blockID,type}
     形状已实证，模型按此投影（隐藏列、行帽 12、点击行块 ID 打开沿用 ADR 0058）。
  3. 兼容层：块 ID 调用返回 0 行时不判定为空表，改为提示“该嵌入库需以库 ID 绑定”（诚实降级）。
- 数据健康（T-6471）：getMissingAssets 元素含 blockIDs 数组（标准块 ID），点击跳转方案确认可行；
  无 path 字段，showPath 相关说明需修正。