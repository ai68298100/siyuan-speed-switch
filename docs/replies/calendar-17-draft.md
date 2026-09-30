# 回复草稿 · calendar#17（未外发，待用户确认 · v2 精修稿）

> 状态：**草稿，未发送**。用户确认修复彻底解决后，以 [ai68298100](https://github.com/ai68298100) 身份回复到
> https://github.com/gradypark86/siyuan-plugin-calendar/issues/17 。
> 前提：v0.44.1 已发布（tag v0.44.1，提交 51eb017，含 T-7069~T-7072 全部修复）——**版本号已填，可直接外发**（正文如需逐字核对版本引用见下）。

---

@gradypark86 感谢你如此高效的实测与反馈！诊断完全正确——这正是宿主侧的问题，两个都已在宿主修复：

### 1. 第三方组件被 `getHomeState()` 清除（已修复）

与你的分析一致：`normalizeHomeState()` 只按内置组件表清洗，运行时通过 `registerHomeModule()` 注册的第三方组件被误杀。修复采用允许名单方案：`normalizeHomeState()` / `migrateHomeState()` 接受允许名单参数，名单内 moduleId 的实例与布局原样保留。

关于你建议的第 2 点（"只保留当前已注册的 moduleId"），实现时多考虑了一步：插件**禁用/重载**也会触发 unregister——如果按"未注册即清洗"，用户临时禁用一次 Calendar 就会丢掉摆好的布局。所以最终语义是：**归一化允许名单 = 当前运行时注册表 ∪ 已持久化实例的 moduleId**——添加、禁用、重载全程保留（商店卡片照常显示"当前不可用"+显式清理入口），用户在商店删除实例后才真正移除；数据增长受每表面 64 实例上限约束。你建议的"避免无效数据膨胀"由显式清理 + 上限共同承接。已在本地用 `calendar-recent-periodic` 场景验证全链路：注册 → 商店添加 → 反复归一化/禁用模拟 → 组件与布局稳定保留。

### 2. 商店预览恒为 medium（已修复）

独立问题确认。修复后预览对话框按**用户在卡片上选中的尺寸档位**渲染（未添加时跟随尺寸选择器，已添加时跟随当前尺寸），仅在该档位不被组件声明支持时才回退 medium/首档。

### 你的 LvSpeed 分支我们已经逐字段核对过了

拉取了 `src/integrations/speed-switch.ts` 对照宿主协议审计：moduleId、options 全字段、`read` 第三参尺寸感知（协议 v2.3 的 `context.size` 在宿主侧已生效，你的按型号裁剪条数会正常工作）、返回契约、注册返回值三形态兼容——**全字段兼容，无需改动**。有界重试 + `getHomeModules()` 核验的注册范式写得很好，已作为推荐范式收录进宿主的[组件接入指南](https://github.com/ai68298100/siyuan-speed-switch/blob/main/docs/widget-protocol.md)。

另外两件事同步给你：

- **装机前曝光**：Calendar 组件已登记进组件目录——还没安装 Calendar 的用户，也能在小驴雷切的组件商店里看到"近期周期笔记"（标注需安装 Calendar 后可用），这对双方都是新入口；
- **联合冒烟**：随下一版本发布后，欢迎一起过一遍添加/改尺寸/预览/移除全链路（尤其你实机上的 `context.size` 裁剪），有任何不符直接在这个 issue 里说。

再次感谢这份高质量 issue——复现步骤、原因分析、修复建议三样齐全，帮我们把第三方组件契约的第一个真实接入问题定位得很干净。

---

## 外发前检查清单（用户确认用）

- [ ] 用户确认两个修复的方案与行为符合预期（含 ADR 0103 保留语义）
- [ ] 版本号确认（建议发版后回复，回复中填实际版本号）
- [ ] 是否附上修复 diff/提交链接
- [ ] 装机前曝光与协议文档收录已在本稿告知——确认表述无误
- [ ] 联合冒烟邀约是否保留

---

## 附录：LvSpeed 分支适配代码审计（2026-09-30，宿主侧自检，未外发）

拉取 gradypark86/siyuan-plugin-calendar `LvSpeed` 分支 `src/integrations/speed-switch.ts`（272 行）逐字段核对：

| 审计项 | 他的实现 | 宿主（修复后） | 结论 |
|---|---|---|---|
| moduleId | `calendar-recent-periodic` | registerHomeModule 校验 `^[A-Za-z0-9._:-]{1,64}$` | ✅ |
| options 字段 | moduleId/title/description/icon/category/availability/supportedDevices/sizes/protocolVersion:2/source/readOnly/open/read | index.ts registerHomeModule 全部接受（availability 经 normalizeModuleDefinition 归一） | ✅ |
| read 第三参 | `context.size` 按型号裁剪条数（small=4/wide=10/large=14/full=18） | 协议 v2.3 已传 `{size, signal}`（home-adapters.js:199） | ✅ 尺寸感知生效 |
| 返回契约 | `{title, items:[{label(≤256), value: 块ID}]}` | normalizeSnapshot 接受 | ✅ |
| 失败形态 | 捕获异常返回空快照，不污染 Calendar 自身面板 | 平台兜底+其自兜底双层 | ✅ |
| 注册返回值 | 三形态兼容（函数/对象/undefined）+ `getHomeModules` 列表核验 + 有界重试 [250ms..6s] | 我方失败返回 no-op 函数 → 其核验兜住并重试 | ✅ 载入顺序竞争已自解 |
| 卸载 | unload 注销 + 重试定时器清理 | unregister 只摘运行时可见性；已持久化实例保留（ADR 0103），显式清理才移除 | ✅ |

**结论：T-7069 修复后，LvSpeed 分支适配代码与宿主全字段兼容，无阻塞项。**

第三方生命周期三面闭合（T-7071 后补记）：面板格子显示诚实占位且编辑态可移除（宿主既有能力），商店显示"当前不可用"并可一键清理（含未登记组件），实例与布局在禁用/重载期间完整保留。其重试机制已作为推荐范式收录 `docs/widget-protocol.md`（T-7070 完成）；组件已登记目录获得装机前曝光（T-7072 完成）。
