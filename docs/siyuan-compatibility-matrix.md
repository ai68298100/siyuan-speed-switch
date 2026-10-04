# 思源 3.8.x 兼容探针矩阵

任务：T-7114。本文记录可复现的响应形状和生命周期边界；生产代码通过归一化器兼容形状，不按小版本增加分支。

## 已覆盖形状

| 版本 | 证据 | 标题搜索 | 路径筛选 | 版本差异保留 |
| --- | --- | --- | --- | --- |
| 3.8.4-beta.2 | `docs/path-filter-host-evidence.md`，真实只读 API | 路径记录形状进入夹具，根文档 ID 从合法 `.sy` 路径推导 | `data.box`、`data.path`、`data.files[]`，文件项含 `id/name/path/subFileCount` | 记录了 `effectiveSortMode` 与 `childrenSortMode` 等原生字段，插件只取有界子集 |
| 3.8.6 | 本轮真实隔离 E2E：`.artifacts/t7114-compatibility/compatibility-probe.json` | 实测记录只有 `path/hPath/box/name/alias/boxIcon`，不依赖 `id/rootId` | 实测 `data.box/path/files`，文件项包含原生元数据与 `id/name/path/subFileCount` | 标题记录增加 `boxIcon`，插件继续只投影 ID、标题、路径和 notebook 来源 |

## 归一化规则

- 标题搜索只接受合法 `.sy` 路径或明确的根文档 ID；路径缺失或不安全时丢弃记录。
- notebook 来源接受 `box`、`notebookId`、`notebookID` 和 `notebook_id`，筛选时没有明确来源不会扩大匹配范围。
- 根文档路径接受 `path`、`hPath`、`rootPath` 和 `root_path`；根 ID 别名接受 `rootId`、`rootID`、`root_id`、`documentId`、`documentID`、`docId` 和 `doc_id`。
- 路径筛选只接受回显一致的 `data.box`、`data.path` 和数组 `data.files`；文件项只读取合法 `id/name/path/subFileCount`，超出上限截断。
- 生命周期要求 `onload`、`onLayoutReady`、`onunload` 三段存在；公开 `whenReady` 只在布局就绪后暴露，卸载必须删除 `window.siyuanSpeedSwitch`。

## 验证方式

纯探针：

```text
pnpm run compatibility:probe
```

真实宿主探针（新建隔离工作区，默认 3.8.6）：

```text
pnpm exec playwright test tests/e2e/compatibility-probe.spec.mjs --config playwright.e2e.config.mjs
```

该命令记录版本、标题搜索原始字段、路径筛选原始字段和卸载后的公开钩子状态到独立产物目录；本轮实际结果为 `3.8.6`、标题字段 6 个、路径数据字段 4 个、文件字段 21 个、卸载后 `whenReady` 不存在。不把浏览器模拟或受控响应当作 Android/外部服务验收。
