[邀请] 小驴速切「组件面板」× DockTomato：「今日专注」小组件

@5kyfkr 你好！

底栏番茄钟是那种"用了就回不去"的插件：不打断心流的底栏计时、完整的时间轴与历史记录、跨端同步，还能与 Task Horizon 联动，设计上非常克制和专业。

冒昧打扰，是想代表另一个思源插件**「小驴速切 (LvSpeed Switch)」**向你发出一个接入邀请。

### 我们在做什么

小驴速切近期上线了**「组件面板」**：一个 iPad 式的小组件主页。用户在 12 列网格画布上自由摆放数据组件（7 档固定尺寸型号、拖拽布局、自动归位），组件来自内置功能与**开放的插件接入协议**——任何插件注册一个只读数据函数，就会出现在组件商店里供用户添加。

### 为什么找你

专注数据是"一眼即见"的典型场景。我们设想了一个轻量的「今日专注」组件：

- **组件名**：DockTomato · 今日专注
- **形态**：迷你 2×3 或 小 4×3——今日完成的番茄数、专注总分钟数，可选列出最近几条专注记录；
- **点击**：通过 `clickCommand` 直接执行你插件的开始/停止计时命令，或打开番茄钟面板；
- **数据更新**：一轮番茄结束后自动刷新（订阅文档事件 + 防抖）。

### 接入方式（约 30 行代码）

```ts
const switcher = this.app.plugins.find((p) => p.name === "siyuan-speed-switch");
if (!switcher?.registerHomeModule) return;

const unregister = switcher.registerHomeModule({
    moduleId: "docktomato-focus-today",
    title: "今日专注",
    icon: "iconClock",
    category: "plugin",
    supportedDevices: ["desktop", "mobile"],
    sizes: ["xs", "small"],
    description: "今日番茄数与专注时长，来自 DockTomato",
    read: async () => ({
        items: [
            {label: "🍅 08:30 - 09:10 报告写作", value: ""},
        ],
    }),
    clickCommand: "docktomato::open", // 以实际注册的命令 key 为准
});

this.addUnload(() => unregister.unregister());
```

平台负责超时（800ms）、快照缓存（3s）、失败退避、错误态渲染与重试；完整接入指南：

https://github.com/ai68298100/siyuan-speed-switch/blob/main/docs/widget-protocol.md

### 几点说明与承诺

- `read` 只需要返回小体量数组，专注统计从你的历史记录聚合即可，性能压力几乎没有；
- 只读契约向后兼容，协议按反馈持续演进；
- **暂时不接入也完全没问题**，这条 issue 只是一个邀请；愿意接入的话我们全程配合，也可以由我们直接提 PR。

感谢你为思源社区带来这么实用的插件，期待 DockTomato 的数据出现在更多人的主页上。
