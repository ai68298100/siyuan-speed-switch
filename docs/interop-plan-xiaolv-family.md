# 小驴家族功能互动方案（调研稿 · 2026-09-30）

> 状态：调研稿，未立项。实施需在**各自插件工作区**立项（四款插件各有自己的开发协议）。
> 范围：小驴雷切（siyuan-quickcut，组件面板宿主）× 小驴打卡（siyuan-checkin）× 小驴人脉（siyuan-contacts）× 小驴拾遗（siyuan-glean）。

## 一、互动通道盘点

| 通道 | 机制 | 方向 | 成本 |
|---|---|---|---|
| **组件面板** | `registerHomeModule()`：只读 `read(config, device)` 返回 `{title?, items:[{label, value?, href?, command?}]}` | 兄弟插件 → 雷切面板 | 每插件约 30~50 行注册代码 |
| **条目级命令** | items 带 `command: "插件名::命令key"`，雷切代为执行 | 雷切 → 兄弟插件命令 | 零成本（插件已暴露命令即可） |
| **configSchema** | 协议 v2：用户可配置组件（limit/日期/下拉等），面板自动渲染配置表单 | 平台能力 | 声明式，零逻辑 |
| **refreshOn** | `switch-protyle / loaded-protyle / destroy-protyle` 自动刷新 | 平台能力 | 声明式 |
| **quick capture** | 雷切已有 `QUICK_CAPTURE_ACTION_PREFIX` 快速捕获动作 | 雷切 → 兄弟插件（新建记录/条目） | 需兄弟插件暴露接收命令 |

平台已代管：读取超时 800ms、快照缓存 3s、失败退避、条数截断、错误态渲染、点击定位。接入方只需"尽快返回 ≤12 条小体量数组"。完整协议：`docs/widget-protocol.md`。

## 二、各插件组件方案

### 1. 小驴打卡 →「今日打卡」组件（建议首发）

- **数据**：今日习惯清单（完成 ✅ / 待办 ⬜ + 连续天数），打卡数据结构最规整、今日视图现成；
- **items**：`{label: "✅ 晨跑 · 连续 12 天", value: "<习惯块ID>", command: "siyuan-checkin::<打开/切换命令>"}`；
- **sizes**：`["small", "medium"]`；**supportedDevices**：desktop + mobile（打卡本来就是高频轻交互）；
- **configSchema**：`{limit: 8, showStreak: true, onlyUndone: false}`；
- **额外**：雷切悬浮球 quick capture 增加一个"记一笔打卡"动作 → 调用打卡的快速记录命令（需打卡暴露，若未暴露则加一个命令即可）。

### 2. 小驴人脉 →「本周寿星」组件

- **数据**：人脉已有**农历生日提醒**——差异化最强的一块：`read` 按"未来 7 天过生日（含农历换算）"返回；
- **items**：`{label: "🎂 张三 · 腊月初八（3 天后）", value: "<人文档ID>"}`（点击直达一人一文档）；
- **sizes**：`["small", "medium"]`；**configSchema**：`{limit: 6, windowDays: 7, includeLunar: true}`；
- **备选/二期**：「近期联系人」组件（最近联系的 N 位），同一插件可注册多个 moduleId。

### 3. 小驴拾遗 →「待消化阅读」组件

- **数据**：拾遗的生命周期状态机里"待读/重浮"队列天然适合首页曝光；
- **items**：`{label: "《文章标题》 · 待读 3 天", value: "<文档ID>"}`；每日重浮当日条目排前；
- **sizes**：`["medium", "tall"]`；**configSchema**：`{limit: 8, scope: "resurface" | "unread", days: 7}`；
- **refreshOn**：`loaded-protyle`（读完一篇回到面板即看到队列变化）。

## 三、反向互动（雷切输出给兄弟插件）

1. **命令代执行**：兄弟插件条目里的 `command` 字段让面板条目可以直达"开始专注/新建复盘"等动作，不需要各自写跳转；
2. **悬浮球 quick capture 分发**：quick capture 文本动作可按前缀分发到打卡（记一条）与拾遗（收一条）——需兄弟插件各暴露一个文本接收命令，雷切侧加动作注册；
3. **README 互链对齐**：打卡/拾遗 README 对雷切的描述已过时（"快速切片与模板管理"/"快速剪藏"），统一为"组件面板主页 + 快速切换"，家族定位表一行话对齐。

## 四、实施路径（建议顺序）

1. **打卡**：数据结构最稳、today 视图现成 → 首发验证全链路（注册→商店→添加→改尺寸→配置→点击→卸载清理）；
2. **人脉**：寿星组件差异化价值最高，农历窗口计算已有；
3. **拾遗**：重浮队列，refreshOn 联动最有感；
4. **雷切侧配套**（可在雷切工作区做）：悬浮球 quick capture 分发动作 + README 家族定位表对齐。

每步验收共用一份联合冒烟清单（复用 calendar#17 的教训）：未安装雷切时安静降级、添加后反复 `getHomeState()` 稳定保留（T-7069 已修）、卸载插件后实例清洗、面板卸载时 `addUnload` 注销。

## 五、决策点（待用户拍板）

- [ ] 首发组件选哪个（建议打卡「今日打卡」）；
- [ ] quick capture 分发是否纳入首批（需打卡/拾遗各加一个接收命令）；
- [ ] 组件命名是否统一带家族前缀（如 `checkin-today` / `contacts-birthdays` / `glean-reading-queue`）；
- [ ] 实施在兄弟工作区各自立项，还是由雷切侧出 PR 代接入（协议 issue 里已对 Calendar 承诺过可代劳，家族内更顺）。
