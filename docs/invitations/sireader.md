# 邀请稿 · SiReader（电子书阅读）

> 状态：2026-09-28 维护者确认外发。
> 目标仓库：https://github.com/mm-o/siyuan-sireader
> 定制依据：docs/widget-invite-drafts.md §4.4。
> 发出记录：✅ 2026-09-28 已发出 → mm-o/siyuan-sireader**#57**（https://github.com/mm-o/siyuan-sireader/issues/57）。

---

[邀请] 小驴雷切「组件面板」× SiReader：把「最近阅读」变成桌面小组件

@mm-o 你好！

先真诚地道一声感谢——SiReader 把电子书阅读带进了思源：不用在应用之间来回切换，书架、阅读进度都在笔记软件里安顿下来。对「把所有阅读和笔记收在一个工作区」这个目标来说是非常珍贵的拼图，看得出来在阅读体验的完整性上花了很多心思。

冒昧打扰，是想代表另一个思源插件**「小驴雷切 (LvSpeed Switch)」**向你发出一个合作邀请。

### 我们在做什么

小驴雷切最初是一个页签快速切换器，近期长出了一个新形态——**「组件面板」**：一个 iPad 式的小组件主页。用户可以把各种数据组件自由添加到 12 列网格画布上，支持 7 档固定尺寸型号（迷你 2×3 到全幅 12×6）、拖拽布局与自动归位，桌面和手机端独立记忆布局。组件面板配有**组件商店**，对所有插件作者开放：插件按协议注册一个只读数据函数，就会出现在商店里，由用户自行添加到面板。

### 为什么找你

「最近在读什么、读到哪了」是打开主页时非常自然的回看需求，而 SiReader 正好管理着这份数据。我们设想了一个对双方用户都直接受益的组件：

- **组件名**：SiReader · 最近阅读
- **形态**：小 4×3 或中 4×4 的列表——最近阅读的 3~5 本书，显示书名与阅读进度百分比；
- **点击行为**：点击条目续读——书目在插件 storage 中、不对应思源块时，条目可交由 `open` 回调接管，面板会以「打开插件」兜底，不会出现死点击；
- **数据更新**：阅读进度变化后面板刷新时自然取到最新值，无需额外订阅。

### 接入方式（约 30 行代码）

在 SiReader 的 `onload()` 里调用小驴雷切的公开 API：

```ts
const switcher = this.app.plugins.find((p) => p.name === "siyuan-speed-switch");
if (!switcher?.registerHomeModule) return; // 未安装时安静降级

const unregister = switcher.registerHomeModule({
    moduleId: "sireader-recent",
    title: "最近阅读",
    icon: "iconBook",
    category: "plugin",
    supportedDevices: ["desktop", "sidebar", "mobile"],
    sizes: ["small", "medium"],
    description: "来自 SiReader 的最近在读书目与进度，点击续读",
    read: async (config, device) => ({
        items: recentBooks.slice(0, 5).map((book) => ({
            label: `${book.title} · ${book.progress}%`,
            value: book.blockId ?? "", // 有对应思源块则可跳转；无则留空走 open 兜底
        })),
    }),
    open: () => { /* 打开 SiReader 续读 */ },
});

this.addUnload(() => unregister.unregister());
```

平台会替你处理**读取超时（800ms）、快照缓存（3s）、失败退避、条数截断、错误态与重试渲染**。完整接入指南：

https://github.com/ai68298100/siyuan-speed-switch/blob/main/docs/widget-protocol.md

### 几点说明与承诺

- `read` 只需要尽快返回一个小体量数组（建议 ≤5 条），点击、缓存、错误兜底都由平台承担；
- 只读契约自 v0.16.16 起向后兼容（与 `docs/widget-protocol.md` 的兼容起点一致），协议会按社区反馈持续演进，任何字段诉求欢迎直接提；
- **如果暂时没有精力接入，完全没有关系**——这条 issue 不构成任何压力；如果你更希望由我们直接提交接入 PR，把分支约定告知即可，我们很乐意代劳。

再次感谢你为思源社区做出的贡献，期待书架上的进度能出现在更多人的主页上。
