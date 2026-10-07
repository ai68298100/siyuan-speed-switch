# 第三方组件提供方接入指南

> 版本：2026-10-06 · 对应任务：T-7146

本文给第三方插件作者一条可复现、可卸载、可诊断的接入路径。这里的“提供方”是负责读取数据并调用小驴雷切公开 API 的插件；小驴雷切只负责组件目录、实例布局、快照读取和失效恢复。本文以仓库当前实现和协议文档为准，不把未取证的外部仓库、集市版本或账号状态写成支持承诺。

## 当前能接入什么

提供方可以通过 `registerHomeModule` 把一个只读快照组件加入组件商店。组件可以声明桌面、侧栏和移动端的可用表面、七种固定尺寸、来源分组、可选配置表单、宿主事件刷新和失败时的打开入口。`read` 返回有界的文本条目，条目可以携带思源块 ID、有限的 `href` 或协议命令。

运行时将第三方注册强制视为只读边界：`readOnly` 不能把它变成写操作，也不会把 DOM、任意 HTML 或持久化回调交给提供方。若需要修改数据，应由提供方自己的命令或界面完成，并在自己的界面中处理确认、权限、撤销和错误。

协议的基础只读字段自 v0.16.16 起保持向后兼容；`protocolVersion: 2` 和 `source`（协议 v2.4）是可选能力。旧宿主没有公开 API 时应安静降级，不能把“没有 API”当作注册成功。

## 最小接入

在提供方的 `onload()` 中查找小驴雷切，注册一个有界 `read`，并在 `onunload()` 中注销。下面的代码只展示协议边界，`readSummary` 应使用提供方自己的缓存和查询层：

```ts
type SpeedSwitch = {
    registerHomeModule?: (options: Record<string, unknown>) => (() => void) | {unregister?: () => void} | undefined;
    getHomeModules?: (device?: "desktop" | "sidebar" | "mobile") => Array<{moduleId?: string}>;
};

export default class MyPlugin extends Plugin {
    private unregisterHome: (() => void) | undefined;

    onload() {
        const switcher = this.app.plugins.find(
            (plugin) => plugin.name === "siyuan-speed-switch",
        ) as SpeedSwitch | undefined;
        if (typeof switcher?.registerHomeModule !== "function") return;

        const handle = switcher.registerHomeModule({
            moduleId: "my-plugin-summary",
            title: "我的摘要",
            icon: "iconInfo",
            category: "plugin",
            supportedDevices: ["desktop", "sidebar", "mobile"],
            sizes: ["small", "medium"],
            description: "展示我的插件最近摘要",
            source: {
                pluginId: "my-plugin",
                name: "我的插件",
                version: "1.2.3",
                collection: "摘要",
                order: 1,
            },
            read: async (config, device) => ({
                title: device === "sidebar" ? "摘要" : "最近摘要",
                items: await readSummary(config, device),
            }),
            open: () => this.openPluginPage(),
        });

        this.unregisterHome = normalizeUnregister(handle);
    }

    onunload() {
        this.unregisterHome?.();
        this.unregisterHome = undefined;
    }
}

function normalizeUnregister(handle: unknown): () => void {
    let done = false;
    return () => {
        if (done) return;
        done = true;
        if (typeof handle === "function") handle();
        else if (handle && typeof (handle as any).unregister === "function") (handle as any).unregister();
    };
}
```

真实注册接口当前返回一个幂等注销函数；示例的对象形态兼容旧宿主和多插件重试代码。提供方应把句柄、重试定时器和半注册批次交给同一个生命周期所有者，避免卸载后仍有回调或定时器运行。

## 字段和数据边界

| 字段 | 要求与产品含义 |
| --- | --- |
| `moduleId` | 必填，最多 64 字符，只允许 `A-Za-z0-9._:-`；用稳定的插件前缀，避免与内置或其他插件冲突。相同 ID 的后注册者会完整替换先注册者。 |
| `title` | 最多 64 字符，显示在商店和组件头。 |
| `icon` | 思源 `icon*` 图标 ID，或 1～2 个字符的 emoji。 |
| `category` | 通常填 `plugin`，用于插件分区。 |
| `supportedDevices` | `desktop`、`sidebar`、`mobile` 的子集；未声明的表面不会出现。 |
| `sizes` | `xs`、`small`、`medium`、`tall`、`wide`、`large`、`full` 的子集；省略时回退 `medium`，非法值会被丢弃。 |
| `description` | 商店卡片说明，最多 96 字。 |
| `read(config, device, options)` | 必填，返回快照；`device` 区分表面，第三参可读取当前 `options.size`。请尽快返回小对象。 |
| `open` / `clickCommand` | 可选失败出口。`open` 是函数；`clickCommand` 是 `插件名::命令 key`。二者都应指向提供方自己的可用入口。 |
| `source` | 可选来源身份：`pluginId`、`name` 至少一个；还可填 `icon`、`version`、`homepage`、`collection`、`order`。来源用于商店聚合，版本和主页当前会透传但不显示。 |
| `protocolVersion` | 可选填 `2`，表示使用 v2 的命令、配置和刷新声明。 |
| `configSchema` | 最多 8 个字段，类型为 `text`、`number`、`select`、`notebook`、`date`、`document`；日期使用 `YYYY-MM-DD`，文档值只能是 block ID。 |
| `refreshOn` | 仅支持 `switch-protyle`、`loaded-protyle`、`destroy-protyle`；宿主防抖 500ms。自定义插件事件不会跨插件传播。 |

`read` 只能返回 `{title?, items: [{label, value?, href?, command?}]}`。`label` 最多 256 字，平台最多保留 24 条；建议每次返回不超过 12 条，并按尺寸和表面裁剪。宿主提供单次 800ms 超时、3 秒快照缓存和失败退避；超时或异常会进入错误态，不会拖垮其他组件。不要在 `read` 中全库扫描、构造任意 HTML 或把正文、令牌、异常对象写进快照。

点击值的通用语义有限：思源块 ID 定位文档，`action:journal` 打开或新建今日日记，`set:文档集 ID` 恢复文档集，其他字符串只作为展示值。需要插件内动作时优先使用 `command` 或 `clickCommand`，并在提供方中保证命令存在；不要模拟 DOM 点击或伪造全局快捷键。

## 装载顺序与有界重试

思源按插件清单加载，提供方可能早于小驴雷切执行 `onload()`。推荐使用固定退避 `[250, 750, 1500, 3000, 6000]` 毫秒，最多尝试 6 次，总窗口约 11.5 秒；到顶后记录诊断并停止。每轮要做到以下几点：

1. 找到 `registerHomeModule` 后再注册；不存在时只安排下一次尝试。
2. 多组件提供方先注册整批，再用 `getHomeModules("desktop")` 检查每个 `moduleId` 都出现。
3. 列表缺项、注册抛错、返回 no-op 或只有部分组件可见时，先注销本轮已有句柄，再按同一序列重试。
4. 没有 `getHomeModules` 的旧宿主只能标记“可见性未知”，不能宣布 provider ready。
5. `onunload()` 同时清除定时器和所有已成功或半成功句柄。

只有完整核验通过才向自己的状态面板显示“已接入”。不要无限轮询，也不要把第三方插件未加载误报成用户数据错误。仓库中的 [有界重试示例](widget-protocol.md) 和 [注册顺序 ADR](adr/0113-provider-registration-order-and-retry.md) 是实现依据。

## 可用性、失败和用户看到的状态

商店用三个级别表达前置条件：`ready` 可直接添加，`conditional` 依赖活动文档、命名约定或特定 API，`external` 等待第三方提供方。以下原因应分别诊断：

| 现象 | 常见原因 | 提供方处理 |
| --- | --- | --- |
| 商店完全没有卡片 | 小驴雷切未安装、版本过旧、声明表面不匹配、注册尚未完成 | 有界重试；提供方自己的设置页说明依赖，不伪造卡片。 |
| 卡片存在但显示不可用 | 提供方被禁用/卸载、配置缺失或无效、依赖 API 不存在 | 让 `read` 快速失败并提供 `open`；不要删除用户实例。 |
| 加载失败或超时 | 外部网络、内核查询、提供方异常 | 使用提供方缓存和短查询；依赖失败时返回错误态，允许用户重试或打开插件。 |
| 只在某端出现 | `supportedDevices` 未声明该端，或移动端被强制单列 | 在设置中解释端侧差异；按 `device` 减少条目。 |
| 注销后仍有旧条目 | 旧布局和实例是刻意保留的持久化状态 | 等提供方重新注册恢复；用户要清理时从面板显式删除。 |
| 重注册后旧句柄影响新版本 | 错误复用旧注销句柄 | 每次 `onload()` 保存当次句柄；宿主 token 校验会保护新注册。 |

提供方卸载不等于用户删除配置：实例、跨端布局和 `configSchema` 值会保留，并显示不可用占位；重新注册同一 `moduleId` 后自动恢复。用户明确删除实例时，平台才清理布局。提供方不得把用户配置写入自己的临时回调闭包，也不得依赖回调跨重载存活。

## 快捷动作不是组件写入通道

如果功能本质是一个按钮而不是快照，可使用 `registerQuickAction({id, label, icon, value, targets, handler})`。提供方在 `onunload()` 调用返回的注销函数；持久化只保存 ID、值和端侧目标，不保存函数。提供方卸载后入口配置可以保留，但点击会安全跳过，重新注册后恢复。已经通过思源 `addCommand()` 注册的命令会自动出现在快捷入口列表，不需要模拟 UI。低层 `registerQuickActionAdapter` 只适合接管已有配置，优先使用高层接口。详见 [README 的快捷动作章节](../README.md)。

## 提供方自测清单

在发布前至少完成下面的本地检查，并把结果写到自己的发布说明：

- 未安装、旧版本和加载顺序相反时，注册会安静降级并在有界窗口内停止重试。
- `moduleId` 冲突、非法字段、空句柄和部分注册不会留下重复卡片或孤儿定时器。
- `read` 覆盖桌面、侧栏、移动端、不同尺寸、空数据、配置无效、异常和超时；返回条目有 24 条上限意识。
- 提供方卸载、重载、升级和同 ID 热替换后，实例/布局保留、不可用状态可解释、重新注册立即恢复。
- `open`/`clickCommand`/条目 `command` 在提供方命令不存在时仍安全失败；不把写操作藏在读取回调中。
- 通过 `getHomeModules("desktop")`、开发者工具和自己的日志确认注册；不要依赖小驴雷切转发第三方 `console.log`。
- 真实宿主中检查键盘可达、焦点、暗色主题、窄侧栏、移动单列和长标题；Chromium 夹具通过不等于真实思源人工验收。

## 当前生态边界与未承诺事项

仓库中的 [组件协议](widget-protocol.md)、[生命周期 ADR](adr/0103-third-party-module-lifecycle.md) 和 [注册顺序 ADR](adr/0113-provider-registration-order-and-retry.md) 是当前可核对的实现依据。`clipped-unread`、`siyuan-checkin` 等名称在仓库中有协议或桥接示例，但这不等于对应外部插件已在用户环境安装或已发布集市版本。

人脉“本周寿星”和拾遗“待消化阅读”属于 [ADR-0135 的跨工作区计划](adr/0135-family-provider-integration.md)，提供方仍应在各自工作区自注册。`BLOCKERS.md` 的 B-010 仍明确记录该前置；本文不声称它们已经接入。Task Horizon 手机联动仍受 `T-6772～T-6775` 的真实管理器、Android 和上游作者交付限制，也不在本文宣称支持范围内。Calendar 等协议文档中的外部示例仅作为代码形态参考，本稿不替外部仓库、账号或集市状态背书。

## 事实来源

- [组件面板协议](widget-protocol.md)：字段、尺寸、快照、v2/v2.4、点击和生命周期。
- [README：组件面板与快捷动作](../README.md)：公开入口和持久化边界。
- [公开注册 API](../src/index.ts)：当前 TypeScript 参数和注销语义。
- [运行时注册器](../src/home-runtime.js)：token、替换、内置回退和只读边界。
- [注册顺序与重试 ADR](adr/0113-provider-registration-order-and-retry.md)。
- [第三方生命周期 ADR](adr/0103-third-party-module-lifecycle.md)。
- [家族 provider 边界 ADR](adr/0135-family-provider-integration.md)。
- [当前阻塞与未承诺事项](../BLOCKERS.md)。
