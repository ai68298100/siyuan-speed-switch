# ADR 0057：组件来源成为一等公民 + 小驴打卡桥接组件

- 日期：2026-09-17
- 状态：已接受
- 关联任务：T-6298

## 背景

两件事同时挤压了组件商店的呈现方式：

1. **小驴打卡要进商店**。小驴打卡（siyuan-checkin）已上架集市，并公开了生态 API v4
   （`window.siyuanCheckin`，协议 `siyuan-checkin`，同步 getter、只读、纯本地）。
   原设计（`checkin-widget-design/`）主张"打卡侧注册"，但这需要等打卡插件发版适配，
   组件在此期间完全不可用。
2. **同一插件的多个组件没有立足之地**。商店原先只有一套分组维度：
   - 内置组件按 7 个**功能组**（日记/任务/文档/统计/学习/生活/系统）聚类；
   - 插件组件按 `def.author` **自由文本**成组，组名写作"插件 · {作者}"；
   - "需安装插件后可用"分区里的目录组件**完全平铺**，同一插件的多个组件互不相认。

   于是一旦某个插件提供 3～5 个组件，用户面对的就是：分组键会随作者名写法漂移、
   看不出哪些组件同源、想整套添加只能逐个点、搜索"插件名"命中不了它的组件。

## 决策

### 1. 协议 v2.4：新增结构化 `source` 字段

`registerHomeModule` 与内建 adapter 的注册入参新增可选 `source`：

```ts
source?: {
  pluginId?: string;   // 稳定分组键
  name?: string;       // 展示名
  icon?: string;       // 来源图标 symbol
  version?: string;
  homepage?: string;
  collection?: string; // 同一插件内的子系列
  order?: number;      // 套件内的建议顺序（0~999）
}
```

归一化规则（`normalizeModuleDefinition`）：`pluginId` 走与 `moduleId` 相同的字符白名单；
`name` 与 `pluginId` 至少有一个非空，缺失则整个 `source` 置 `null`；`order` 钳到 0~999。
旧的、没有 `source` 的注册行为完全不变。

**为什么是新增字段而不是复用 `author`**：`author` 是给人看的自由文本，做分组键会漂移；
`pluginId` 是机器标识。二者并存，前者继续用于卡片上的署名展示。

### 2. 速切侧桥接：小驴打卡 5 个组件由速切自己注册

与其等打卡插件适配，不如由速切以内建 adapter 直接消费它**已公开的**生态 API：

| moduleId | 内容 | 依赖能力 |
| --- | --- | --- |
| `checkin-today` | 今日打卡项目与完成进度 | `items.read` |
| `checkin-streak` | 各项目连续天数排行 | `items.read` |
| `checkin-year-heatmap` | 年度打卡热力图（`viewType: "heatmap"`） | `items.read` |
| `checkin-weekly` | 本周打卡概览（直接采用打卡自己的分析快照） | `analytics.read` |
| `checkin-occasions` | 近期日期事项（只读投影，无完成动作） | `occasions.read` |

- 数据全部来自 `window.siyuanCheckin`，**只读、纯本地、零网络请求**；
- 组件标注 `source.pluginId = "siyuan-checkin"`，因此虽然由速切注册，商店仍把它们
  归到"小驴打卡"来源组；
- 打卡缺席或能力缺失时 `read` 返回确定空态而不是抛错（抛错会触发失败退避，把组件
  显示成故障态）；
- 若将来打卡插件自行注册**相同 moduleId**，`registerAdapter` 的 token 覆盖会让原生
  实现接管，无需用户迁移配置。

`checkin-summary`（目录登记、由提供方注册的旧路径）**保留不动**：它练的是"三态生命周期"
（ready/unavailable/missing），删掉会让这条链路失去真实案例。两者在文档里明确区分。

### 3. 商店呈现：来源分组优先于功能分组

- **可用区**：`resolveHomeModuleSource()` 判定为插件来源的组件，按 `source.pluginId`
  收敛进一个来源组；组头补**来源图标**、**已添加 x/y** 与**全选本组 / 取消本组**。
  内置组件仍走 7 个功能组（功能分组是审计口径，每个内置组件都要有归属）。
- **待安装区**：按 `providerPlugin` 聚合，同一插件的多个组件先出一个来源小标题，
  不再平铺成互不相认的孤立方卡。
- **排序确定性**：非内置组改为"组内数量降序 → 名称字典序"，不再依赖 `Map` 插入顺序。
- **搜索**：来源名与 pluginId 一并进入卡片搜索文本，搜"小驴打卡"命中整套组件。

新增纯函数模块 `src/home-source-model.js` 承载以上决策，DOM 渲染仍归 `home-store-ui.ts`。

## 被拒绝的方案

- **等打卡插件注册后再上线**：组件空窗期不可控，且用户现在就要。
- **把 5 个组件塞进某个功能组**：功能分组回答"能帮我做什么"，回答不了"谁提供的"；
  同一插件的组件会被打散到不同组里。
- **删除 `checkin-summary` 占位**：会连带删除"三态生命周期"的唯一真实案例与它的
  一整套契约测试，收益不抵风险。
- **给商店再加一个"按插件"页签**：页签已经有 12 个，再加只会更难选；分组内聚合
  比增加一个筛选维度更能解决"同一插件多组件"的问题。

## 代价与诚实声明

- 速切为**某一个具体插件**写了适配代码（`src/checkin-bridge-model.js`）。这与既有的
  external-* 适配器（iCal / GitHub / 天气…）是同一类"读外部数据源"的角色，但耦合对象
  是思生态内的插件，若打卡 API  Breaking，桥接会退化为确定空态。
- 连续天数、今日计划命中、热力图色阶阈值是**桥接层复现**的口径（阈值沿用打卡公开
  文档里的 `≥2 / ≥max(3, 0.5max) / ≥max(6, 0.75max)`），不是打卡内部函数的直接调用；
  若将来打卡公开这些函数，改调它们即可，`moduleId` 不变以免用户配置漂移。
- 未安装小驴打卡时，这 5 个组件**仍然出现在商店里**（需求标注为"需前置依赖"），
  与"组件由提供方注册所以天然不出现"的原设计不同——这是桥接方案的固有代价，
  换来的是装了插件就能立刻用。

## 验证

- `tests/checkin-bridge-model.test.cjs`（15 项）：API 握手、能力协商、连续天数、
  热力图格子边界（`≤371`、7 的倍数、`level ∈ [-1,4]`、占位格 `outside`）、
  getter 抛错不击穿宿主、未知 moduleId 回落。
- `tests/checkin-bridge-protocol.test.cjs`（17 项）：`source` 白名单与净化、
  注册签名透传、5 个组件的来源/依赖/可用性一致性、商店 UI 侧来源分组契约。
- `tests/home-source-model.test.cjs`（13 项）：来源解析、同插件多组件收敛为一组、
  排序确定性、来源搜索文本、provider 聚合、垃圾输入不抛错。
- 门禁同步：内置组件数 42→47、默认模块 43→48、依赖目录 14→19、
  生产图闭包 46→48、适配器审计认得 `registerCheckinBridge` 助手、
  商店分组顺序断言改写为"确定性排序"。

## 体积与门禁记账

- **zip 单条目压缩预算 168 KiB → 180 KiB**（`tests/host/package-resource-audit.test.cjs`）：
  本批新增约 849 行源码（桥接模型 415 + 来源分组模型 144 + 商店 UI 77 + 其余 213）
  后，`index.js` 压缩后由 164015 字节增至 175727 字节（+11712），超出 168 KiB 上限
  3695 字节。增量性质为纯本地只读桥接与分组展示、无网络外传面，按 D-353 / D-366 /
  D-386 的既有先例依真实功能增量上调并留评审余量；归档总上限 512 KiB 不变（余约
  197 KiB）。已实测产物未误打包示例模板（`registerCheckinHomeModules` 在 dist 中
  出现 0 次）。
- **perf 自检改为 best-of-N 重测**（`tests/perf-complexity-gate.test.cjs`）：
  `verify:release` 并发满载时 CPU 争用会抬高轻负载一侧（本机实证：独立跑
  light 7.27ms / heavy 14.88ms / ratio 2.05；满载下 light 被抬到 10.51ms 而 heavy
  不变 → ratio 1.42 假红），故取至多 3 次测量中的最优比值。判别力由负向验证钉住：
  把 2× 规模改成等规模后，3 次重测仍全部 FAIL（比值恒 ≈1.0），兄弟用例不波及。
