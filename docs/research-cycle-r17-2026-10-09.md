# R17 功能强化调研与下一程建议（2026-10-09）

本轮针对“尚未开发到位的内容”和“已有能力如何继续强化”做只读调研。范围包括第一面板切换器、第二面板工作台、第三面板片段实验室、悬浮球、设置、组件商店、数据边界、失败反馈和三端可达性；同时对照 Raycast、Obsidian、Alfred、Flow Launcher、PowerToys Run 及思源插件 API 的公开资料。本文是立项依据，不把竞品行为当作本插件已经实现的功能，也不把浏览器夹具当作真实 Android 或真实第三方服务证据。

## 结论先行

本插件的基础能力已经比较完整：最近打开与关闭历史、收藏/置顶/分组、保存搜索、模糊与拼音匹配、文档集导入导出与版本历史、三端搜索会话隔离、组件来源/网络/隐私徽标、缓存/超时/退避/重试和商店预览都已经有生产实现。下一阶段不应继续堆叠第二套搜索页或重复这些入口。

真正的产品缺口集中在“动作如何跨表面流动”和“动作完成后能否被证明”：

1. **跨面板动作没有统一契约**。切换器、工作台、片段实验室和悬浮球各有动作入口，已有 quick-action registry 和局部 Action Panel，但对象、能力状态、失败回退、成功后的焦点回归尚未收敛成一套共享描述。设计文档目前也只把 `openSnippetStudio` 作为首个安全跨表面动作。
2. **写入后的最终状态没有统一闭环**。配置导入、文档集恢复、片段保存、第三方 provider 操作需要统一的“快照 → 应用 → 读回校验 → 分项回执 → 重试/回滚”流程；只显示“请求成功”不足以证明用户的最终状态。
3. **组件目录的事实来源仍分散**。内置 58 项、外部候选 20 项、第三方目录 2 项分别维护，`moduleId`、来源/依赖、平台、隐私和失败动作存在漂移风险；`inbox-shorthands` 已被审计为 external，但缺少同等级来源/依赖登记。
4. **数据边界与诊断仍偏文档化**。用户在界面内还不能直接看到数据存储位置、同步范围、删除/恢复限制和可安全导出的诊断内容；失败回执也需要补齐来源、版本、权限、上次成功时间和下一步。
5. **事实说明与真实 UI 有漂移**。README 仍写“路径树选择未开放 UI”，而 `src/doc-search-ui.ts` 已存在路径树入口；README 把 58 个组件称为“开箱即用”，但就绪审计为 23 `ready`、13 `conditional`、22 `external`，应统一口径。
6. **真实环境证据仍有缺口**。最窄侧栏、Android 触控、读屏播报、第三方 provider 注册/卸载和真人五条主路径尚未形成可复核证据，自动化通过不能替代这些结论。

## 竞品模式能借鉴什么

| 模式 | 公开资料中的可借鉴点 | 对本插件的落点 |
| --- | --- | --- |
| Raycast Action Panel | [Action Panel](https://manual.raycast.com/action-panel) 把对象可用动作、键盘入口和上下文放在同一层；[List](https://developers.raycast.com/api-reference/user-interface/list) 明确了过滤、加载、分页和选择反馈 | 建立共享动作描述层，先接入“打开相关文档、回到切换器、在实验室打开、刷新/重试、复制诊断”等安全动作 |
| Raycast 命令入口 | [命令别名与快捷键](https://manual.raycast.com/command-aliases-and-hotkeys) 和 [Quicklinks](https://manual.raycast.com/quicklinks) 把稳定命令 ID 与用户自定义入口分开 | 先稳定内部 command ID，再考虑别名、动作级快捷键和快速链接；不直接把每个组件按钮暴露成全局快捷键 |
| Obsidian | [Command palette](https://obsidian.md/help/plugins/command-palette) 与 [Quick switcher](https://obsidian.md/help/Plugins/Quick%2Bswitcher) 采用可搜索命令、最近/固定和键盘导航；[Workspaces](https://obsidian.md/help/plugins/workspaces) 强调可恢复的工作上下文 | 保留现有最近/收藏/文档集，补齐动作发现、工作区恢复回执和失败后的焦点回归，不重复造一个新的内容搜索页 |
| Alfred | [Universal Actions](https://www.alfredapp.com/help/features/universal-actions/) 和 [File Buffer](https://www.alfredapp.com/help/workflows/actions/file-buffer/) 体现了“先选对象、再批量执行动作”的路径 | 为文档集恢复、批量打开/关闭、片段批处理设计可取消的批量回执；不引入剪贴板历史或系统级常驻覆盖层 |
| Flow Launcher / PowerToys Run | [Flow Launcher Public API](https://github.com/Flow-Launcher/docs/blob/main/API-Reference/Flow.Launcher.Plugin/IPublicAPI.md) 与 [PowerToys Run](https://learn.microsoft.com/en-us/windows/powertoys/run) 展示了插件命令、前缀、快速计算和结果动作的边界 | 可在内部动作注册稳定后增加 `>` 命令模式、前缀/别名和受控外部入口；不把本插件变成系统级启动器 |
| 思源插件 API | 思源 [API 文档](https://github.com/siyuan-note/siyuan/blob/master/docs/API.md) 与 [路由历史 API](https://github.com/siyuan-note/siyuan/blob/master/kernel/api/router.go) 可供受控导航和只读历史探索 | 只在已有动作契约稳定、价值被证明后接入原生历史/深链接；不绕过思源权限，也不以插件自建“第二历史页”替代原生能力 |

## 建议的优先顺序

### P0：先把“动作可发现、结果可证明”做成闭环

**1. 统一 Action Panel 适配层。** 复用现有 `quick-actions`、悬浮球 more actions 和 Shift+F10 卡片菜单，不另起一套菜单。动作描述至少包含：

```text
objectKind / objectId
actionId / label / shortcut
availability / unavailableReason
sideEffect / requiresConfirmation
targets / fallback
onSuccess / onFailure / focusReturn
```

首批只接入安全导航、刷新、重试、复制诊断、返回来源面板和“在实验室打开”。每个表面可以有自己的展示方式，但调用同一个领域动作和同一个回执模型。验收重点是：同一对象在四个表面显示一致的可用性；动作不可用时给原因和替代入口；成功后焦点回到触发控件；失败留在上下文内并给重试/回退。

**2. 统一最终状态回执。** 为配置导入、文档集恢复、片段保存和 provider 操作增加受控事务外壳：

```text
snapshot → apply → readback → per-item receipt → retry / rollback
```

回执状态固定为 `pending / success / partial / no-op / failed / cancelled`，并附带 `source / version / permission / lastSuccess / nextStep`。这不是承诺所有宿主写入都能原子回滚；不能回滚时必须明确显示“已应用哪些、未应用哪些、如何重试”。

**3. 先修产品事实表述。** 以代码与 readiness 审计为真源，修正 README/路线图中路径筛选和组件“开箱即用”的说法；同步中英文、商店说明和发布包内文档。此项属于低风险高收益的信任修复，不需要新增功能。

### P1：补齐可维护性、隐私边界和真实验收

**4. 生成组件 readiness 索引。** 由唯一目录生成内置、外部、第三方视图，强制每个 `moduleId` 具备来源、依赖、网络、隐私、平台、健康动作和失败动作；对 `inbox-shorthands` 这类缺登记项做门禁。明确“可添加”和“可运行”是否分离，特别是 `external + offline`：如果允许离线添加，卡片必须说明待配置/待联网；如果禁止，需补迁移和真实宿主验收。

**5. 增加脱敏诊断导出。** 让用户预览、复制或下载只读诊断包，字段包括插件版本、思源版本、设备端、面板、动作 ID、失败原因码、来源/权限、缓存/重试状态和上次成功时间；明确排除正文、路径、查询词、Token、API Key、外部 URL 和完整响应。导出失败本身也要给回执。

**6. 把数据位置和备份边界放进设置。** 用一张可展开的“数据与恢复”说明回答：数据存在哪里、哪些会随思源同步、哪些只在本机、如何导出、删除后能否恢复、冲突如何处理。现有文档中的边界要与实际 key、配置包和文档集版本历史逐项对应。

**7. 完成真实环境验收。** 以五条主路径记录真人 3 分钟走查：首次进入并切换、搜索与路径筛选、收藏恢复、文档集恢复、片段取消保存。另行记录最窄侧栏、Android 触控、读屏播报、第三方 provider 注册/卸载；不把浏览器 smoke 当成这些环境的通过证据。

### P2：在核心闭环稳定后再扩展

**8. 动作级别的别名、快捷键和深链接。** 等内部 command ID、能力判断和焦点回归稳定后，再增加用户自定义别名、可配置快捷键、受控 quicklink/deeplink 或 CLI。所有外部入口都必须回到同一动作管线。

**9. 片段实验室轻量增强。** 在不引入 CodeMirror 体积和不执行 JS 的前提下，优先做查找/替换、冲突 diff、CSS 检查、错误定位和可取消预览；保留当前安全边界。

**10. 组件二轮精修。** 仅根据真实反馈选择 5–8 项，候选包括倒数日累计/固定双模式、年度进度自定义周期、写作打卡目标与豁免日、近期写作热力图分页与色阶图例、单组件显示覆盖。不要再以“58 项全部重做”作为进度指标。

## 明确不重复建设的内容

- 不再重复实现 MRU、收藏/置顶/分组、保存搜索、模糊/拼音匹配、文档集导入导出、组件缓存/退避/重试和商店基础筛选/预览。
- 不新增第二个搜索页面、系统级常驻覆盖层、云端同步、AI 排序、剪贴板历史或任意 SQL/JS 执行入口。
- 原生历史、原生搜索和思源权限继续作为底层能力；只有当新入口提供清晰的跨面板价值时才接入。

## 证据边界与下一步

本轮结论由当前代码、路线图、组件 readiness 审计、前期研究和公开官方文档交叉得到；竞品链接用于说明交互模式，不证明本插件已经具备对应能力。下一步应先从 P0 的事实对账、Action Panel 适配层和最终状态回执中选一个可独立回滚的小版本任务，再写对应 ADR、契约测试和负向验证；P1 的真实宿主项目继续受 `BLOCKERS.md` 中环境条件约束。

