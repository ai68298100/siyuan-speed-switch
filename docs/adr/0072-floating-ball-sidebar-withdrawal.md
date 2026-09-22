# ADR 0072：悬浮球端侧收缩为桌面与移动

- 日期：2026-09-23
- 状态：已接受
- 关联决策：修订 ADR 0066（三端入口）、ADR 0068（侧栏几何）；不回写历史 ADR
- 关联：`docs/floating-ball-ui-spec.md` §2、`docs/dev-plan-2026-09-22.md`

## 背景

悬浮球自 B0 起按桌面主窗口、侧栏 dock、手机端三面交付。实际使用中，桌面主窗口与侧栏 dock 属于同一个宿主窗口：两个球体在同一屏幕内重复提供同一批动作，且侧栏宽度极窄，球体与面板长期处于避让竞争。用户于 2026-09-23 决定：悬浮球只保留手机端与桌面（主窗口）端，侧栏不再提供。

## 决策

1. **挂载面收缩**：`updateFloatingBallVisibility` 桌面侧只挂 `desktop`；升级路径上若存在旧版本留下的 sidebar 控制器，由既有清扫循环销毁。`FLOATING_BALL_UI_SURFACES = ["desktop", "mobile"]` 成为挂载与设置页的唯一端侧清单。
2. **schema 层保留三面兼容**：`FLOATING_BALL_SURFACES`（含 sidebar）继续用于 `normalizeFloatingBallConfig`、导入导出与预算检查。旧配置或第三方导入包中的 `enabled.sidebar`、`actions.sidebar`、`clickAction.sidebar` 字段被容忍并保持有界，不再产生任何 UI；回滚只需恢复挂载清单一行。
3. **设置页只呈现两端**：端侧开关、编辑表面选择器均迭代 `FLOATING_BALL_UI_SURFACES`；旧 sidebar 值在存储中原样保留但不展示、不可编辑。
4. **共享快捷动作体系不受影响**：`IQuickAction.targets` 中的 `"sidebar"` 指切换器/快捷动作在侧栏面板的可用性，与悬浮球 portal 无关，保持不变。
5. **纯函数层不删**：布局算法、能力解析对 sidebar surface 的既有支持保留（类型完整性与测试资产），仅产品挂载撤出。

## 后果

- 同一宿主窗口内不再出现双球；桌面用户在任意 dock 布局下都只有一个悬浮球。
- 旧用户的 sidebar 独立开关设置失效（不再显示）；其桌面主窗口开关与手机端开关不受影响。
- 设置预算、导入导出与版本化迁移语义零变更。
- 后续"外拨展开"等触发器（T-6784~T-6787）只需覆盖 desktop/mobile 两端。

## 验证

- 挂载契约：`tests/floating-ball-host.test.cjs` 断言 sidebar 永不挂载、旧控制器被清扫；负向验证=把 sidebar 注回挂载清单，测试精确失败。
- 设置契约：`tests/floating-ball-settings-ui.test.cjs` 断言两个开关、表面选择器仅 desktop/mobile 两个选项；负向验证=开关循环注回三面常量，测试精确失败。
- schema 兼容：导入/normalize 侧既有 sidebar 字段断言保持不变并通过。
