[邀请] 小驴速切「组件面板」× Task Horizon：把「今日任务」变成桌面小组件

@5kyfkr 你好！

先真诚地道一声感谢——Task Horizon 是思源社区里最完整的任务管理方案：多文档任务汇总、四象限 / 看板 / 时间轴 / 日历多种视图、块绑定与悬浮条快速编辑，还有与底栏番茄钟的联动。这些能力在日常使用中几乎每天都会用到，也一直佩服你在视图细节和数据一致性上的投入。

冒昧打扰，是想代表另一个思源插件**「小驴速切 (LvSpeed Switch)」**向你发出一个合作邀请。

### 我们在做什么

小驴速切最初是一个页签快速切换器，近期长出了一个新形态——**「组件面板」**：一个 iPad 式的小组件主页。用户可以把各种数据组件自由添加到 12 列网格画布上，支持 7 档固定尺寸型号（迷你 2×3 到全幅 12×6）、拖拽布局与自动归位，桌面和手机端独立记忆布局。组件面板配有**组件商店**，对所有插件作者开放：插件按协议注册一个只读数据函数，就会出现在商店里，由用户自行添加到面板。

### 为什么找你

任务数据是"打开主页第一眼就想看到"的信息，而 Task Horizon 正是思源社区做得最深的任务聚合方案。我们设想了一个对双方用户都直接受益的组件：

- **组件名**：Task Horizon · 今日任务
- **形态**：高 4×6 或全幅 12×6 的清单列表——今日到期与逾期任务按时间排序，条目点击直达任务所在文档；
- **可选汇总头**：今日应完成 / 已完成计数，让面板一打开就有掌控感；
- **数据更新**：订阅思源的页签切换 / 文档打开 / 关闭事件，任务勾选后面板在半秒内自动刷新。

### 接入方式（约 30 行代码）

在 Task Horizon 的 `onload()` 里调用小驴速切的公开 API：

```ts
const switcher = this.app.plugins.find((p) => p.name === "siyuan-speed-switch");
if (!switcher?.registerHomeModule) return; // 未安装时安静降级

const unregister = switcher.registerHomeModule({
    moduleId: "task-horizon-today",
    title: "今日任务",
    icon: "iconCheck",
    category: "plugin",
    supportedDevices: ["desktop", "sidebar", "mobile"],
    sizes: ["tall", "large", "full"],
    description: "来自 Task Horizon 的今日到期与逾期任务，点击直达",
    refreshOn: ["switch-protyle", "loaded-protyle", "destroy-protyle"],
    read: async (config, device) => ({
        items: tasks.map((task) => ({
            label: task.title,
            value: task.blockId, // 思源块 ID，面板点击后自动定位到任务文档
        })),
    }),
    open: () => { /* 可选：读取失败时"打开插件" */ },
});

this.addUnload(() => unregister.unregister());
```

平台会替你处理**读取超时（800ms）、快照缓存（3s）、失败退避、条数截断、错误态与重试渲染**；用户配置（如筛选条件）可以用协议 v2 的 `configSchema` 声明，面板会自动渲染配置表单并把值传入 `read`。完整接入指南：

https://github.com/ai68298100/siyuan-speed-switch/blob/main/docs/widget-protocol.md

### 几点说明与承诺

- `read` 只需要尽快返回一个小体量数组（建议 ≤12 条），点击定位、缓存、错误兜底都由平台承担；
- 只读契约自 v0.16.17 起向后兼容，协议会按社区反馈持续演进，任何字段诉求欢迎直接提；
- **如果暂时没有精力接入，完全没有关系**——这条 issue 不构成任何压力；如果你更希望由我们直接提交接入 PR，把分支约定告知即可，我们很乐意代劳。

再次感谢你为思源社区做出的贡献，期待 Task Horizon 的任务数据能出现在更多人的主页上。
