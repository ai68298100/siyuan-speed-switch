# 组件面板 · 第三方组件开发指南

「组件面板」是思源笔记插件「小驴速切 (LvSpeed Switch)」提供的聚合主页：每个插件都可以把自己的数据注册为一个**小组件**，出现在面板的组件商店里，由用户自由添加、摆放到 12 列网格画布上。

本指南面向插件开发者，说明如何让自己的插件出现在组件商店里。

## 快速接入（三步）

在你的插件 `onload()` 中调用小驴速切的公开 API：

```ts
export default class MyPlugin extends Plugin {
    async onload() {
        // 1. 拿到小驴速切插件实例
        const switcher = this.app.plugins.find((p) => p.name === "siyuan-speed-switch");
        if (!switcher?.registerHomeModule) return; // 未安装/版本过旧时安静降级

        // 2. 注册组件（只读、有界）
        const unregister = switcher.registerHomeModule({
            moduleId: "my-pomodoro-summary",          // 全局唯一，建议带插件前缀
            title: "番茄钟今日汇总",
            icon: "iconClock",                        // 思源内置图标 id，或 ≤2 字符 emoji
            category: "plugin",                       // 商店里归入"插件"分区
            supportedDevices: ["desktop", "sidebar", "mobile"],
            sizes: ["small", "medium", "wide"],       // 支持的尺寸型号（见下）
            description: "今日番茄钟专注记录与完成率",   // 商店卡片说明（≤96 字）
            read: async (config, device) => ({
                title: "今日专注",
                items: [
                    {label: "🍅 08:30 - 09:10 报告写作", value: "20260911083000"},
                    {label: "🍅 10:00 - 10:25 邮件", value: "20260911100000"},
                ],
            }),
            open: () => {                             // 可选：读取失败时"打开插件"跳转目标
                this.app.plugins.find((p) => p.name === "my-pomodoro")?.commands
                    ?.find((c) => c.langKey === "open")?.callback?.();
            },
        });

        // 3. 插件卸载时注销，面板会安全跳过已卸载的组件
        this.addUnload(() => unregister.unregister());
    }
}
```

完成后重启思源，打开小驴速切 → **组件面板 → 组件商店 → 插件** 分区即可看到你的组件。

## 字段说明

| 字段 | 必填 | 约束 |
| --- | --- | --- |
| `moduleId` | ✅ | ≤64 字符，仅 `A-Za-z0-9._:-`，建议 `插件名-功能名` |
| `title` | ✅ | ≤64 字符，商店与组件头显示 |
| `icon` | 推荐 | 思源 `icon*` 图标 id；或 1~2 个字符的 emoji |
| `category` | 推荐 | `plugin`（进商店"插件"分区） |
| `supportedDevices` | ✅ | `desktop` / `sidebar` / `mobile` 的子集 |
| `sizes` | 推荐 | 支持的尺寸型号数组（见下）；缺省为 `["medium"]` |
| `description` | 推荐 | ≤96 字，商店卡片说明 |
| `read` | ✅ | `(config, device) => 快照`，见下 |
| `open` | 可选 | `() => void`，组件读取失败时面板显示"打开插件"按钮 |
| `source` | 可选 | 结构化来源身份（v2.4）：`{pluginId, name, icon, version, homepage, collection, order}`，见「来源与商店分组」 |

## 尺寸型号

画布为 12 列网格、40px 行单元。当前提供 7 档固定型号，请在 `sizes` 中声明你的组件**支持并排好看的**子集：

| 键 | 宽×高 | 适用 |
| --- | --- | --- |
| `xs` | 2×3 | 迷你指标（一个数字 + 一句话） |
| `small` | 4×3 | 单主题摘要（3 条左右） |
| `medium` | 4×4 | 标准列表（5 条左右） |
| `tall` | 4×6 | 长列表 |
| `wide` | 8×3 | 横向列表 |
| `large` | 8×5 | 大列表 + 汇总 |
| `full` | 12×6 | 全幅看板 |

组件在不同型号下的 `read` 调用签名相同：`read(config, device, options)`，第三参 `options.size` 携带当前型号（如 `"xs"/"medium"`，未知为空串）。适配器可按尺寸裁剪条目数实现渐进披露（小尺寸少列）；不关心尺寸时忽略即可。列表内容超出门槛时面板在格子内滚动，无需自行适配高度。

## 跨表面布局（桌面 / 侧栏 / 手机端）

组件面板在三个表面各自维护**独立布局**，你的插件无需为跨表面做任何额外工作，但了解以下事实有助于设计 `read`：

- **配置全局共享，布局按表面独立**：用户添加的组件实例（含 `configSchema` 配置）只保存一份；摆放位置按 `desktop` / `sidebar` / `mobile` 三份布局各自持久化（每表面最多 64 个实例条目）。用户在桌面摆好的布局不会影响手机端。
- **`supportedDevices` 决定可出现表面**：组件只在声明的表面出现在商店与"添加组件"列表中；未声明 `mobile` 的组件在手机端完全不可见，其手机布局也不会存在。
- **手机端单列全宽**：手机画布自动把每个组件强制为全宽单列堆叠（网格坐标 `x=0, w=12`，忽略拖拽位置），因此桌面端窄尺寸型号在手机端只是"变宽"，不会布局破碎。`sizes` 里声明的高/宽型号仍影响卡片高度。
- **`device` 参数区分表面**：`read(config, device)` 的第二参为 `"desktop"` / `"sidebar"` / `"mobile"`，可据此裁剪内容（如手机端少列、侧栏精简）。侧栏宽度有限，建议同一组件在侧栏返回比桌面更少的条目。
- **布局清理语义**：用户删除组件实例时，三个表面的布局条目同时清理；provider 卸载期间实例与布局**均保留**（见下文"生命周期与失效恢复"），重新注册后原布局原样恢复。
- **外部组件侧栏可用性**：自带网络缓存的外部生活组件（天气/节假日/每日放送等）声明了 `["desktop", "sidebar"]`；第三方插件组件默认只在注册声明的表面上出现。

## `read` 数据契约

- 返回 `{title?, items: [{label, value?, href?}]}`；
- `label` ≤256 字（超出截断）；`value` 用于点击行为（见下）；`href` 为兜底外链；
- 面板平台负责：**800ms 超时**、**3s 快照缓存**、**失败指数退避**、条目上限 24 —— 你的 `read` 只需尽快返回小体量数据；
- `read` 抛错或超时不会拖垮面板，组件显示错误态与重试/打开插件按钮；
- **性能要求**：避免全库扫描；数据量大时先缓存/限量（建议 ≤12 条）。

## 协议 v2：更低的接入成本

在基础字段之上，v2（`protocolVersion: 2`）提供四组声明式能力，**全部可选**，按需取用：

### 1. 条目级命令（`command`）

`read` 返回的条目可携带 `command: "插件名::命令key"`，点击该条目时由小驴速切代为执行对应插件命令——不需要自己处理点击跳转逻辑：

```js
read: async () => ({
    items: [
        {label: "开始专注", value: "", command: "siyuan-plugin-docktomato::start"},
    ],
}),
```

### 2. 模块级 `clickCommand`（声明式跳转）

不想写 `open` 回调时，直接声明命令字符串即可；组件读取失败时面板显示"打开插件"按钮并执行它：

```js
{ moduleId: "...", clickCommand: "my-plugin::open", read: ... }
```

### 3. `configSchema`（用户可配置的组件）

声明配置字段，面板会在编辑布局模式的「配置」按钮里自动渲染表单，值经清洗后传入 `read(config)`：

```js
configSchema: [
    {key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 8},
    {key: "notebook", label: "笔记本", type: "text", defaults: ""},
    {key: "when", label: "日期", type: "date", defaults: "2026-09-13"},
    {key: "document", label: "文档", type: "document", defaults: ""},
    {key: "view", label: "视图", type: "select", options: ["日", "周", "月"], defaults: "月"},
],
```

- 最多 8 个字段；`type` 支持 `text` / `number` / `select` / `notebook` / `date` / `document`；日期字段使用严格的 `YYYY-MM-DD`，文档字段只接受思源 block ID；
- 用户配置持久化在面板实例上，`read(config)` 每次都会收到最新值。

### 4. `refreshOn`（自动刷新时机）

声明内置事件白名单，面板打开期间任一事件触发即防抖刷新（500ms）：

```js
refreshOn: ["switch-protyle", "loaded-protyle", "destroy-protyle"],
```

> 第三方插件自定义事件暂不在白名单内（思源 eventBus 为插件私有实例，跨插件事件不可达）；如有需求欢迎提 issue 讨论。

### 5. 商店元数据

`author`（≤64 字）与 `homepage`（URL）会展示在商店卡片上；`protocolVersion: 2` 会标记 Protocol v2 徽标。

### 6. Agent 发现与配置读取

如果宿主支持思源 Agent，小驴速切会把已注册且可读取的组件纳入 `home-widget-snapshot`：

- 省略 `moduleId` 可先发现当前端可查询组件的 `moduleId`、标题、描述和尺寸型号；
- 传入 `moduleId` 可读取该组件的有界快照；
- 可选传入 `config` 查询配置型组件，配置最多 16 个字段，每个字段仅接受有界字符串、数字或布尔值；
- 发现和读取均为只读操作，不会修改笔记、页签或组件配置持久化状态。

组件注册时声明的 `description`、`sizes`、`protocolVersion`、`configSchema` 和 `refreshOn` 会经过宿主归一化后用于商店和 Agent 发现，非法或超限字段会被安全丢弃。

### 7. 来源与商店分组（协议 v2.4）

`source` 回答“这个组件是谁提供的”，与 `category` 回答的“这是什么类型的组件”互为补充：

```ts
source: {
    pluginId: "your-plugin-id",   // 稳定分组键，走与 moduleId 相同的字符白名单
    name: "你的插件名",            // 展示名；与 pluginId 至少填一个，否则整个字段被丢弃
    icon: "iconPlugin",           // 可选：来源图标，显示在商店来源组头
    version: "1.2.3",             // 可选
    homepage: "https://...",      // 可选：仅 http/https
    collection: "打卡",            // 可选：同一插件内的子系列
    order: 1,                      // 可选：套件内的建议顺序，钳到 0~999
}
```

声明后，商店会发生三件事：

1. 你的多个组件**收敛进同一个来源组**（组名取 `name`），而不是散落在功能分组里；
2. 组头显示来源图标、**已添加 x/y** 计数与**全选本组 / 取消本组**；
3. 来源名与 `pluginId` 进入卡片搜索文本——用户搜插件名即可命中你的整套组件。

没有 `source` 的插件组件仍按 `author` 兜底成组，旧注册行为完全不变。
若你的插件与宿主使用**相同的 moduleId**，后注册者会完整覆盖先注册者（token 校验），
因此宿主侧可以先做桥接实现、由插件原生实现后续接管，用户配置不漂移。

自 v0.17 起，小驴速切额外注册只读能力 `workspace-runtime-registry-diagnostics`：返回有界的组件运行时计数快照（注册数/会话数/队列游标），无输入、无正文内容、无宿主异常透出；Agent 可用它在诊断对话中确认组件面板的基础设施状态。组件本身的生命周期事件（失效/恢复）不影响该计数以外的任何输出。

同时提供 `document-context` 只读能力：省略 `id` 时读取当前活动文档，指定 `id` 时优先复用已打开页签，关闭文档则回退到单行 SQL 元数据查询；结果仅包含标题、笔记本 ID、路径、活动状态和最多 24 条大纲标题，永不返回正文。该能力的取消/权限真实宿主验收仍属于 v0.17 后续兼容性工作。

## 点击行为

条目 `value` 交给小驴速切分发，按前缀识别：

| value 形式 | 行为 |
| --- | --- |
| 思源块 ID（如 `20260911…`） | 打开该块所在文档并定位 |
| `"action:journal"` | 打开/新建今日日记 |
| `"action:journal:笔记本ID"` | 打开/新建指定笔记本的今日日记（ID 非法时拒绝） |
| `"set:文档集ID"` | 恢复对应文档集 |
| 其他 | 视为纯展示；需要跳转请用 `href` |

如果这些都不够（例如你想让点击直接执行自己插件里的某个命令），推荐把 `value` 留给展示、在 `open` 回调里接管头部跳转；更细粒度的条目级回调协议在规划中，欢迎提 issue 讨论。

## 调试建议

- `read` 里 `console.log` 会在生产构建被小驴速切忽略（平台不打第三方日志），请用思源开发者工具在自己的插件里排查；
- 组件读取失败时面板显示"暂时无法加载 / 重试 / 打开插件"，可用 `open` 保证失败态仍有出路；
- 注册与注销都要走 `registerHomeModule` 返回的 `unregister`，插件 `onunload` 时务必调用，否则残留配置会在用户重建面板时以"跳过"处理。

## 生命周期与失效恢复（协议 v2.3+）

组件商店与面板对第三方 provider 的安装/卸载/重载有一套明确的持久化语义，你的插件只需遵守"注册/注销配对"这一条约定，其余状态平台负责：

- **provider 卸载 ≠ 配置删除**：你的插件被禁用、升级或重载期间，用户已添加的组件实例**不会**被自动删除——配置和跨设备布局原样保留，商店卡片标记为"当前不可用"，并提供显式清理入口；重新注册后商店与面板**即时自动恢复**，无需用户重建。
- **同 moduleId 热替换为完整覆盖**：以相同 `moduleId` 重新注册时，新声明完整替换旧声明；未再次声明 `open` 的重注册会清除旧跳转回调。请始终在每次 `onload` 里用当次注册返回的 `unregister` 注销。
- **注销句柄不可跨注册复用**：旧注册返回的 `unregister` 无法误删新一次注册（runtime token 校验），升级重载不会把新旧实例的注销关系搞混。
- **注册变化即时可见**：provider 注册/注销通过内存监听即时通知已打开的商店与组件面板（监听随对话框销毁、随插件卸载清空），不持久化任何回调。
- **可用性徽标**：商店按声明自动标注 `ready`（可直接添加）/ `conditional`（依赖活动文档、命名约定或特定 API，卡片有前置条件提示）/ `external`（待安装第三方）；首次添加 `conditional` 组件会收到一次性前置条件提示。
- **配置清理边界**：用户点"恢复默认"只重置 `configSchema` 声明的字段，你在实例配置里的未知扩展字段会被原样保留。

## 已知适配示例

- **小驴打卡 (siyuan-checkin)**：
  - 提供方注册路径：`checkin-summary`（打卡摘要），由打卡插件自己调用本协议注册；
  - 速切桥接路径：`checkin-today` / `checkin-streak` / `checkin-year-heatmap` /
    `checkin-weekly` / `checkin-occasions`，由速切内建 adapter 直接读取打卡公开的
    生态 API v4（`window.siyuanCheckin`）后注册，`source.pluginId` 仍标注为
    `siyuan-checkin`，因此商店把它们归到“小驴打卡”来源组（见 ADR 0057）。
    若打卡插件将来自行注册相同 moduleId，原生实现会自动接管。
- 欢迎提交 PR 把你的插件加进这个列表。

## 稳定性说明

- `registerHomeModule` 的**只读契约**（moduleId/title/icon/sizes/description/read/open）自 v0.16.16 起保持向后兼容；
- 平台保证第三方 `read` 永远以有界快照形式渲染，不会获得 DOM 或执行任意注入；
- 建议在 `plugin.json` 的 `minAppVersion` 中不设上限——本协议不依赖思源特定版本。
