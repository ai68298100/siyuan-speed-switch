# 邀请稿 · Calendar（日历面板）

> 状态：2026-09-28 维护者确认外发。
> 目标仓库：https://github.com/gradypark86/siyuan-plugin-calendar
> 定制依据：docs/widget-invite-drafts.md §4.3。
> 发出记录：✅ 2026-09-28 已发出 → gradypark86/siyuan-plugin-calendar**#17**（https://github.com/gradypark86/siyuan-plugin-calendar/issues/17）。

---

[邀请] 小驴雷切「组件面板」× Calendar：把周期笔记日历变成桌面小组件

@gradypark86 你好！

先真诚地道一声感谢——Calendar 的月历视图把思源的周期笔记在日历上直观呈现：点选日期即可创建或跳转对应的日记/周期笔记，有内容的日期在网格上一目了然。这种「以时间维度组织笔记」的形态在思源生态里非常少见，日常安排和回顾都靠它，看得出来在交互细节上花了很多心思。

冒昧打扰，是想代表另一个思源插件**「小驴雷切 (LvSpeed Switch)」**向你发出一个合作邀请。

### 我们在做什么

小驴雷切最初是一个页签快速切换器，近期长出了一个新形态——**「组件面板」**：一个 iPad 式的小组件主页。用户可以把各种数据组件自由添加到 12 列网格画布上，支持 7 档固定尺寸型号（迷你 2×3 到全幅 12×6）、拖拽布局与自动归位，桌面和手机端独立记忆布局。组件面板配有**组件商店**，对所有插件作者开放：插件按协议注册一个只读数据函数，就会出现在商店里，由用户自行添加到面板。

### 为什么找你

日历与周期笔记是"打开主页第一眼就想看到"的信息，而 Calendar 正是思源社区把这件事做得最直观的插件。我们设想了一个对双方用户都直接受益的组件：

- **组件名**：Calendar · 近期周期笔记
- **形态**：中 4×4 或宽 8×3 的列表——近期已创建的周期笔记按日期排列，显示标题与日期，条目点击直达对应文档；
- **后续演进**：完整的月历网格渲染超出当前协议的列表契约——协议路线图已把「自定义视图类型」列为演进方向，就绪后会**优先支持 Calendar 的月网格组件**，届时面板里就能直接呈现你的月历；
- **数据更新**：订阅思源的文档创建/打开事件，新的周期笔记创建后面板自动刷新。

### 接入方式（约 30 行代码）

在 Calendar 的 `onload()` 里调用小驴雷切的公开 API：

```ts
const switcher = this.app.plugins.find((p) => p.name === "siyuan-speed-switch");
if (!switcher?.registerHomeModule) return; // 未安装时安静降级

const unregister = switcher.registerHomeModule({
    moduleId: "calendar-recent-periodic",
    title: "近期周期笔记",
    icon: "iconCalendar",
    category: "plugin",
    supportedDevices: ["desktop", "sidebar", "mobile"],
    sizes: ["medium", "wide"],
    description: "来自 Calendar 的近期周期笔记，点击直达对应日期文档",
    read: async (config, device) => ({
        items: recentNotes.map((note) => ({
            label: note.title,
            value: note.rootBlockId, // 思源块 ID，面板点击后自动定位到对应文档
        })),
    }),
    open: () => { /* 可选：读取失败时"打开插件" */ },
});

this.addUnload(() => unregister.unregister());
```

平台会替你处理**读取超时（800ms）、快照缓存（3s）、失败退避、条数截断、错误态与重试渲染**；用户配置（如显示数量、笔记类型过滤）可以用协议 v2 的 `configSchema` 声明，面板会自动渲染配置表单并把值传入 `read`。完整接入指南：

https://github.com/ai68298100/siyuan-speed-switch/blob/main/docs/widget-protocol.md

### 几点说明与承诺

- `read` 只需要尽快返回一个小体量数组（建议 ≤12 条），点击定位、缓存、错误兜底都由平台承担；
- 只读契约自 v0.16.16 起向后兼容（与 `docs/widget-protocol.md` 的兼容起点一致），协议会按社区反馈持续演进，任何字段诉求欢迎直接提；
- 月网格的自定义视图类型会按你的数据形态优先设计，也欢迎提前提出你对渲染契约的期望；
- **如果暂时没有精力接入，完全没有关系**——这条 issue 不构成任何压力；如果你更希望由我们直接提交接入 PR，把分支约定告知即可，我们很乐意代劳。

再次感谢你为思源社区做出的贡献，期待 Calendar 的时间维度能出现在更多人的主页上。
