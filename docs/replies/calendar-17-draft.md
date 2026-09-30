# 回复草稿 · calendar#17（未外发，待用户确认）

> 状态：**草稿，未发送**。用户确认修复彻底解决后，以 [ai68298100](https://github.com/ai68298100) 身份回复到
> https://github.com/gradypark86/siyuan-plugin-calendar/issues/17 。
> 前提：随下一个版本发布（当前 v0.43.2 → 下一版含 T-7069 修复）；发布后回复并把版本号替换为实际值。

---

@gradypark86 感谢你如此高效的实测与反馈！诊断完全正确——这正是宿主侧的问题，两个都已在宿主修复：

### 1. 第三方组件被 `getHomeState()` 清除（已修复）

与你的分析一致：`normalizeHomeState()` 只按内置组件表清洗，运行时通过 `registerHomeModule()` 注册的第三方组件被误杀。修复采用你建议的允许名单方案：

- `normalizeHomeState()` / `migrateHomeState()` 接受允许名单参数，名单内 moduleId 的实例与布局原样保留；
- 宿主在 `getHomeState()` 时把当前 `registerHomeModule()` 注册表（运行时组件 Id 集合）传入；
- 名单外照旧清洗——组件 unregister 后，对应持久化实例会在下次归一化时移除，避免无效数据无限增长（也是你提到的第 2 点建议）。

已在本地用 `calendar-recent-periodic` 场景验证：注册 → 商店添加 → 反复 `getHomeState()` → 组件与布局稳定保留；卸载 Calendar 后恢复清洗。

### 2. 商店预览恒为 medium（已修复）

独立问题确认。修复后预览对话框按**用户在卡片上选中的尺寸档位**渲染（未添加时跟随尺寸选择器，已添加时跟随当前尺寸），仅在该档位不被组件声明支持时才回退 medium/首档。

### 发布与联调

两个修复会随小驴雷切下一版本发布（含版本号见 Release）。发布后你把 Calendar 侧切回正式版宿主即可摘掉临时补丁；你 LvSpeed 分支的适配代码如果方便提个 PR 或贴一下 diff，我们可以在组件商店侧给 Calendar 做一次联合冒烟（添加/改尺寸/预览/移除全链路），确认后我方也会在 README 的组件商店目录里收录 Calendar 组件。

再次感谢这份高质量 issue——复现步骤、原因分析、修复建议三样齐全，帮我们把第三方组件契约的第一个真实接入问题定位得很干净。

---

## 外发前检查清单（用户确认用）

- [ ] 用户确认两个修复的方案与行为符合预期
- [ ] 版本号确认（建议发版后回复，回复中填实际版本号）
- [ ] 是否附上修复 diff/提交链接
- [ ] 联合冒烟与 README 收录的承诺是否保留

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
| 卸载 | unload 注销 + 重试定时器清理 | unregister → homeThirdPartyIds 收窄 → 实例清洗（T-7069 语义） | ✅ |

**结论：T-7069 修复后，LvSpeed 分支适配代码与宿主全字段兼容，无阻塞项。** 他的重试机制（防插件载入顺序竞争）值得写进 `docs/widget-protocol.md` 作为推荐范式（候选任务）。
