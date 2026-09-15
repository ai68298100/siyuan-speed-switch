# 路径筛选桌面接入方案（T-103，待宿主证据后应用）

> 记录日期：2026-09-16　状态：**方案已验证可行，暂缓应用**
> 关联：T-103、T-107、B-005、D-042、D-353、D-357

## 结论

T-103（路径筛选桌面原型）的阻塞条件**不止包体预算**。

| 前置条件 | 状态 |
| --- | --- |
| 包体预算释放 | ✅ 已满足（D-353 上调至 512 KiB / 768 KiB；D-355 实测全量接入仅增 59.7 KiB） |
| 宿主端点获批 | ❌ **未满足**——须经桌面大版本验收（T-107），其前置为 B-005 |

因此 T-103 在 B-005 解决前**不应接入生产**。

## 依据（三道独立证据）

1. **契约门禁** `tests/path-filter-ui-contract.test.cjs` 断言源码中不得出现 `listDocsByPath`：

   ```js
   test("path filter remains model-gated until the host endpoint is approved", () => {
       assert.match(source, /delete next\.paths/);
       assert.doesNotMatch(source, /listDocsByPath/);
   });
   ```

   即该端点**在宿主批准前保持模型门控**，只保留 `path-filter-model` 的契约与测试。

2. **T-107 路径筛选真实宿主能力证据**：*"在下一次桌面大版本验收中记录端点可用性、响应结构和最窄侧栏宽度，再决定是否拆分 T-103a/T-105a 生产入口"*——明确以真实桌面节点为判定前提。

3. **D-042 测试策略**：桌面端实测仅在大版本节点进行，不以浏览器模拟替代宿主证据。

## 已就绪的部分（无需改动）

`IDocSearchFilters` 的 `paths` 字段及其上下游早已铺好：

| 能力 | 位置 |
| --- | --- |
| `paths?: string[]` 字段 | `src/index.ts` `IDocSearchFilters` |
| 筛选计数计入 paths | `getDocSearchFilterCount` |
| 切换到笔记本时清空 paths | 笔记本子菜单 `delete next.paths` |
| 结果按路径过滤 | `filterDocSearchResults` |
| Agent 能力路径参数 | `normalizeAgentSearchPaths`（上限 8） |
| 模型层 | `src/path-filter-model.js`（5/5 测试通过） |

**缺口正是 T-103 的三件事**：桌面路径前缀选择、chip 移除、请求取消与 API 缺失降级。

## 应用方案（已实测通过 tsc 与全部门禁）

以下改动在 2026-09-16 已完成并通过 `tsc --noEmit`（0 错误）、i18n 门禁（11/11）、生产图门禁（32 模块，3/3），但因上述门禁约束而回滚，待 T-107 通过后直接应用。

### 1. 端点白名单与请求分支

```ts
private static KERNEL_ENDPOINTS = new Set([
    // ...既有端点
    "/api/filetree/listDocsByPath",
]);
```

switch 内必须使用**字面量 URL**（安全扫描要求：不存在变量 URL 请求）：

```ts
case "/api/filetree/listDocsByPath":
    response = await fetch("/api/filetree/listDocsByPath", init);
    break;
```

### 2. 导入与代际标记

```ts
import {MAX_PATH_ITEMS, buildPathFilterListRequest, normalizePathFilterProbeOutcome} from "./path-filter-model";
```

```ts
private docSearchPathGeneration = 0;
private docSearchPathTitles = new WeakMap<HTMLElement, Map<string, string>>();
```

**取消机制**：`fetchKernelJson` 自带 5s 超时且不接受外部 signal，因此用**代际标记**实现取消——每次打开路径菜单自增，过期响应直接丢弃。

### 3. 路径加载方法

```ts
private async loadDocSearchPathChildren(notebook: string, path: string, generation: number) {
    const input = {notebook, path, limit: MAX_PATH_ITEMS};
    const request = buildPathFilterListRequest(input);
    const cancelled = () => normalizePathFilterProbeOutcome({kind: "cancelled"}, input);
    if (!request) return normalizePathFilterProbeOutcome({kind: "response", payload: null}, input);
    if (generation !== this.docSearchPathGeneration) return cancelled();
    let payload: unknown = null;
    try {
        payload = await this.fetchKernelJson("/api/filetree/listDocsByPath", request.body);
    } catch (_) {
        payload = null;
    }
    if (generation !== this.docSearchPathGeneration) return cancelled();
    if (payload === null || payload === undefined) {
        return normalizePathFilterProbeOutcome({kind: "unavailable"}, input);
    }
    return normalizePathFilterProbeOutcome({kind: "response", payload}, input);
}
```

**降级说明**：内核辅助函数在守卫失败、超时、非 2xx 时统一返回 `null`，无法区分"端点不存在"与"网络失败"，故一律按 `unavailable` 降级提示，且不阻塞其他筛选维度。

### 4. 路径菜单（`bindDocSearchFilter` 内）

- `openPathMenu(notebook, path)`：先展示"正在加载"，异步完成后按结果重建菜单
- 导航项：返回上级（`path !== "/"`）、筛选此路径、分隔线
- 列表项：`hasChildren` 者有子菜单（筛选此路径 / 浏览路径…），否则点击即选
- 降级项：`unavailable` → `searchPathUnavailable`，其余失败 → `searchPathFailed`
- 截断提示：`truncated` → `searchPathTruncated`

主菜单入口（紧随笔记本之后，因路径依赖笔记本；未选笔记本时给前置提示而非隐藏）：

```ts
const currentNotebook = typeof current.notebook === "string" ? current.notebook : "";
const pathSub: IMenu[] = [];
if (!currentNotebook) {
    pathSub.push({label: this.i18n.searchPathPickNotebook, disabled: true});
} else {
    pathSub.push({label: this.i18n.searchAllPaths, checked: (current.paths || []).length === 0,
        click: () => commitFilters((next) => delete next.paths)});
    // chip 移除：逐项显示已选路径，点击移除
    (current.paths || []).forEach((value) => pathSub.push({
        label: /* 标题或末段 */ value,
        icon: "iconTrashcan",
        click: () => commitFilters((next) => {
            const rest = (next.paths || []).filter((entry) => entry !== value);
            if (rest.length > 0) next.paths = rest;
            else delete next.paths;
        }),
    }));
    pathSub.push({type: "separator"});
    pathSub.push({label: this.i18n.searchPathBrowse, icon: "iconFolder",
        click: () => openPathMenu(currentNotebook, "/")});
}
menu.addItem({type: "submenu", label: this.i18n.searchFilterPath, icon: "iconFolder", submenu: pathSub});
```

> 注意：`next.paths = Object.freeze([...])` 会得到 `readonly string[]`，无法赋给 `string[]`（TS4104）。外层已对整体 `next` 做 `Object.freeze`，内部数组直接赋普通数组即可。

### 5. 筛选摘要

```ts
const pathCount = filters.paths?.length || 0;
if (pathCount > 0) parts.push(`${this.i18n.searchFilterPath}: ${pathCount}`);
```

### 6. i18n（中英各 11 项，须保持 key 集合一致）

`searchFilterPath`、`searchAllPaths`、`searchNoPaths`、`searchPathPickNotebook`、
`searchPathLoading`、`searchPathUnavailable`、`searchPathFailed`、`searchPathUp`、
`searchPathHere`、`searchPathBrowse`、`searchPathTruncated`

### 7. 生产图门禁同步

- `UNWIRED_CONTRACT_MODULES` 移除 `path-filter-model`
- `WIRED_SANITY_MODULES` 加入 `path-filter-model`
- 闭包上限 `31 → 32`

## 应用前置条件

1. **B-005 解决**：取得已认证的思源桌面会话；
2. **T-107 完成**：记录 `/api/filetree/listDocsByPath` 的端点可用性、响应结构与最窄侧栏宽度；
3. 依据验收结果更新 `tests/path-filter-ui-contract.test.cjs`——**该门禁的放宽本身就是"端点获批"的正式记录**，须在提交信息与 DECISIONS 中引用验收证据。

## 已知未验证项

- 移动端行为：`bindDocSearchFilter` 有 4 个调用点（桌面弹窗、移动端等），共用同一绑定路径。方案未对移动端做差异化处理，与笔记本筛选保持一致；移动端表现留待 T-107 一并取证。
- 图标名 `iconUp` / `iconFolder` / `iconTrashcan` 为思源内置图标名，未在真实宿主确认渲染。
