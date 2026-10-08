# R13 扩展调研：功能、交互、UI、性能（2026-09-30）

> 本轮只读核对生产源码、当期账本、既有 R1～R12/设计审查与公开设计或 Web 平台资料；不修改生产代码、测试和发布包。新任务进入 `dev-plan-2026-09-27.md` 的 T-7161～T-7171；已存在的任务只补验收条件。

## 取舍原则

- 先排除已交付或已登记内容：首开骨架已由 T-6885 量测后否决；大列表策略已进 T-6977；第一面板阅读、工作台高保真、商店全屏内联预览、片段商店、关闭入口分别有 T-7113～T-7160 与 T-7024 承接。
- 把“源码可确认的缺陷”和“需先量测的优化假设”分开。后者仅排研究任务，不预设实现或宣称已有卡顿。
- 参考外部产品的交互原则和官方平台约束，继续遵守 SiYuan 宿主、ADR 0073/0084/0091、原生片段唯一真源及第三方组件只读协议；不照搬品牌视觉或未公开宿主接口。

## 新发现与待办映射

| 方面 | 现状证据与影响 | 去向 |
|---|---|---|
| 生态安全 | `home-model.js` 的 `icon`/`source.icon` 只做文本截长，`home-store-ui.ts` 以模板字符串插入 SVG `innerHTML`；只读 DOM 夹具可把含事件属性的额外 SVG 子节点插入商店。**已确认标记注入，未在真实宿主证明脚本执行。** | T-7161：安全 SVG 构造/图标 ID 校验及负向验收，P0 |
| 功能语义 | 保存搜索只存 query 与 notebook，`applySavedSearchFilters()` 却复制当前筛选再仅覆盖 notebook；相同保存项会受当前路径/类型/方法/排序影响。 | T-7162：保存搜索回放范围与现场隔离，P1 |
| 跨面板交互 | `PlatformSurfaceContext.query` 已透传，但 `showSwitcher()` 重建弹窗时只恢复焦点；查询、筛选 chips、滚动与固定预览未作为往返现场恢复。 | T-7163：切换器往返现场合同，P1 |
| 组件可靠性 | `home-adapters.js` 在同 key 去重判断前递增 generation；只读 Node 探针中两次并发只读一次底层，但完成后第三次仍读底层，且首调用者 abort 会让共享 Promise 的第二调用者也收到 aborted；旧成功还可能清除新失败的退避。 | T-7164：同键去重、缓存提交、调用者取消隔离，P1；与 T-7112 尺寸 key 分工 |
| 预览性能 | `cancelDocPreview()` 只清 debounce timer 并递增代际；已发出的 outline/getDoc 请求仍运行，`fetchKernelJson()` 尚无外部 signal 参数。快速换目标可能堆积无用请求。 | T-7165：预览请求实际取消与并发预算，P1 |
| 无障碍 | 设置通用 `select()` 无可访问名称，`switcher()` 的 label 只含 input 与空 span；`settingItem()` 的可见标题是兄弟 div，未关联控件。部分专用开关手工补 `aria-label`，说明统一工厂未覆盖。 | T-7166：设置控件的名称/描述关联与真实 DOM 验收，P1 |
| 数据回退 | `home-view.js` 允许只有 stat、没有 items 的卡片显示 ready；`home-controller.js` 失败回退只认非空 items，导致有效纯统计旧快照无法继续展示。 | T-7167：stat-only 组件失败保留旧值，P1 |
| 生态发现 | `widget-protocol.md` 已承认商店以展示名分组/折叠；`home-store-ui.ts` 以 label 建 Map，而来源模型有稳定 `pluginId`。同名来源会混组并影响计数、批量选择和持久折叠。 | T-7168：以稳定来源身份分组及旧状态迁移，P2 |
| 渲染成本 | 工作台、切换器和配置窗的 MutationObserver 监听整树；`clampOversizedIcons()` 每次量测整棵树所有 SVG。已确认重复扫描路径，尚未量得卡顿。 | T-7169：按新增节点缩域与实际帧预算，P2 |
| 性能证据 | 现有页签/搜索门禁偏纯 CPU，首开测试只量输入框出现；缺少 100+ 页签、58 卡、商店筛选的真实 DOM 输入至下一帧与长任务基线。 | T-7170：交互延时趋势基线，P2；先采样再议门禁 |
| 刷新调度 | 手动刷新全部已有 2 并发上限；初读可见卡和生活组件心跳按各自路径启动，尚无共享峰值/可见卡等待数据。 | T-7171：并发与可见优先预算调查，P2；量测不佳才做调度器 |

## 并入既有任务的同类问题

- **T-7144 移动收藏 sheet 的模态焦点**：`index.ts` 标 `aria-modal=true`，但当前只绑定遮罩点击；补焦点进入、Tab 约束、Esc 分层关闭、背景不可交互和焦点返回，连同嵌套组操作层验收。
- **T-7108 配置字段身份**：归一化后的重复 `key` 可形成两个可见控件、同一份 draft/controls 键；加入去重、诊断和负向夹具。
- **T-7081/T-7110 注册重试示例**：`widget-protocol.md` 的 `listed === false` 分支同步递归，绕过有界 timer/attempt；加入持续失败路径的异步退避与栈深验证，同时按正确卸载函数合同修正示例。

## 外部参考与采用边界

| 资料 | 本轮吸收的原则 | 映射 |
|---|---|---|
| [Apple Human Interface Guidelines: Widgets](https://developer.apple.com/design/human-interface-guidelines/widgets) | 小组件应让重点内容快速可读；结合生产信息层级与真实画面验收，不以圆角数量定义完成 | 既有 T-7148～T-7153，无重复 UI 任务 |
| [VS Code UX Guidelines: Quick Picks](https://code.visualstudio.com/api/ux-guidelines/quick-picks) | 搜索/选择界面的对象、动作与辅助说明需清晰；本插件进一步核对保存条件和跨表面现场 | T-7162/T-7163，关联 T-7116～T-7118 |
| [WAI-ARIA APG: Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) 与 [WAI: Labeling Controls](https://www.w3.org/WAI/tutorials/forms/labels/) | `aria-modal` 必须配合实际键盘模态行为；表单可见标题须成为控件名称 | T-7144/T-7166 |
| [MDN: Element.innerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML) 与 [MDN: AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | 不可信字符串应避免进 HTML 解析入口；代际丢弃不能代替对底层请求的实际中止 | T-7161/T-7164/T-7165 |
| [MDN: MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)、[PerformanceObserver](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver) 与 [web.dev: Optimize Interaction to Next Paint](https://web.dev/articles/optimize-inp) | 观察范围和交互成本应以真实 DOM 与帧时间量测，先得基线再选优化 | T-7169～T-7171 |

只读探针均使用本地代码或现有打包 CSS/DOM 夹具；安全行为、触控手感和性能结论仍需相应真实宿主或隔离测试环境补证，不把源码推断写成真机通过。
