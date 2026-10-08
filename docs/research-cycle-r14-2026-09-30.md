# R14 扩展调研：状态、键盘、生命周期与内容边界（2026-09-30）

> 本轮只读核对生产源码、ROADMAP、BLOCKERS、ADR 及当期待办。新事项登记为 T-7172～T-7185；仅作规划，不改生产代码、测试或发布包。R13 的 T-7161～T-7171 仍待开发。

## 去重与证据边界

- 第二面板高保真、商店面积与动作、第一面板双栏阅读、第三面板信息架构及整页右上关闭按钮已在 T-7113～T-7160 登记，本轮不把同一需求改名重复立项。
- T-7144 已有全平台关闭/焦点矩阵。下列移动排序、回收站、图标选择器是该矩阵内可定位的具体实现切片；完成后须回填矩阵。
- T-7165 管文档预览请求；缩略图回源和组件配置异步读取走不同链路，因此单列。T-7169 只管图标异常扫描器；收藏下拉的 body 观察器是另一条独立资源路径。
- 本轮确认了源码中的缺口和潜在竞态；**未在真实 SiYuan/Android 证明每项故障都已发生**。缩略图重新挂载 HTML 的执行或网络副作用尤其只列隔离审计，不宣称已发生脚本执行。性能优化先有量测，不以包体字节数直接推断卡顿。

## 新增待办与取证

| 方面 | 源码证据 / 用户影响 | 去向 |
|---|---|---|
| 请求生命周期 | `index.ts:11261` 的 `fillThumbByApi()` 直接 `fetch(getDoc)`，无 signal/超时；缩略图只在响应后检查 `thumb.isConnected`，并发闸门等待项无离队机制。关闭/重开或慢内核时旧读取可继续占位。 | T-7172 P1：取消、超时和队列释放 |
| 内容边界 | `index.ts:11087/11179/11285` 把持久化缓存或内核返回的文档 HTML 经 `innerHTML` 重新放进缩略图，实时克隆的 `innerHTML` 也会写进缓存；CSS 对缩略图内容设 `pointer-events:none`，但这不等于解析/网络/聚焦副作用隔离。 | T-7173 P1：只读安全与交互隔离审计，结论决定修复范围 |
| 国际化 | `index.ts:2520-2562` 的组件依赖指南标题、摘要、徽标、安装链接和列表 aria-label 固定中文；英文界面会出现中英混排。 | T-7174 P2：双语资源和端侧验收 |
| 键盘语义 | `platform-dom.js:42-73` 的分段控件声明 `radiogroup/radio`，只有 click；所有原生按钮仍可逐个 Tab，缺方向键/单 Tab 停靠。 | T-7175 P1：组内键盘模型与读屏验收 |
| 移动排序 | `mobile-switcher-ui.ts:331-430` 排序 sheet 标 `aria-modal=true`，初焦落 overlay；分组 menuitemradio 无方向键，排序列表与分组列表有两套焦点行为，关闭无回焦。`_05-settings-widgets.scss` 减少动效规则未覆盖排序 overlay。 | T-7176 P1：排序 sheet 的模态与菜单合同 |
| 片段回收站 | `snippet-studio-ui.js:1539-1599` 的回收站标模态，打开后无入焦/Tab 约束；Esc、遮罩和关闭按钮直接 remove，未回焦。相邻目录 picker 已有键盘约束，说明存在同类遗漏。 | T-7177 P1：回收站嵌套模态生命周期 |
| 图标选择器 | `index.ts:7526-7692` 的快捷动作图标选择器标模态；移动端无入焦，桌面仅聚焦搜索；关闭未回焦，分类 chips 标 tablist/tab 却只有 click。 | T-7178 P2：选择器模态与分类语义 |
| 插件卸载 | `index.ts:1872-1974` 的 `onunload()` 显式销毁片段实验室，却未显式销毁桌面/移动切换器和工作台；这些面板的资源释放绑定各自 Dialog destroyCallback。宿主是否代销毁尚待验证。 | T-7179 P1：打开状态下卸载/热重载资源基线与回收 |
| body 浮层 | `index.ts:7274-7332` 的尺寸菜单只由选择/外点/Esc 关闭，owner 重绘与销毁未调用 cleanup；`index.ts:7526` 打开新图标选择器直接 remove 旧 overlay，未摘旧 document keydown。 | T-7180 P1：统一 owner disposer 与重复打开卫生 |
| 观察器 | `index.ts:9083-9128` 收藏下拉展开后监听整个 body；`closePanel()` 仅隐藏面板，未调用已有 `unbindGlobal()`，与注释的“关闭即 disconnect”不符。 | T-7181 P2：关闭即释放和回调成本量测 |
| 异步表单 | `home-config-form.ts:40-46/197/310-336/431/492/516/558/742-746` 多种选项异步加载与延时回调；destroyCallback 仅断开图标观察器，未统一取消请求/计时器或阻止旧会话更新草稿。 | T-7182 P1：弹窗代际与取消隔离 |
| 同步竞态 | `index.ts:1847-1863` 的 `onDataChanged()` 只在入口检查卸载，`await loadPersistentKeys()` 后仍可调用 `updateFloatingBallVisibility()`；`onunload()` 先拆浮球。延迟读盘可能在卸载后重新挂 portal。 | T-7183 P1：代际守卫与卸载夹具 |
| 收藏同步 | `index.ts:8643` 的 `initFavCollapsed()` 只向 Set 追加；`onDataChanged()` 重读后调用它，远端展开/移除的折叠项仍留在本地内存。 | T-7184 P2：持久化折叠状态重建与现场策略 |
| 空态与错误 | `index.ts:2432` 的 `loadNotebooks()` 把失败折成 `[]`，`notebookSelect()` 收到空数组后启用“无选项”下拉；用户无法区分真空笔记本与内核读取失败。 | T-7185 P2：笔记本来源失败回执/重试 |

## 参考原则

- [WAI-ARIA APG Radio Group](https://www.w3.org/WAI/ARIA/apg/patterns/radio/)、[Menu and Menubar](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/)、[Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) 与 [Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)：声明角色时要兑现相应方向键、焦点和模态行为。T-7175～T-7178 使用真实 DOM 键盘序列验收。
- [MDN AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) 与 [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)：弃用旧结果之外，还要释放底层请求与观察器。T-7172/T-7181/T-7182 以在途量、listener 数、关闭后回调数验证。
- [MDN innerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML)：对重新解析的文档内容审计来源和隔离，不把 `pointer-events:none` 当 HTML 安全边界。T-7173 先隔离取证，不对原生文档功能武断删减。
- [WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) 与系统减少动态效果：移动收藏组更多按钮、搜索筛选入口和排序 sheet 在真实触控/缩放环境核对命中区及动效；具体入口并入 T-7144/T-7176，不另造平行矩阵。

本轮只读结论对真实宿主资源回收、屏幕阅读器行为、HTML 副作用和 Android 触控都保留验证边界，实施时继续按 B-004/B-005 分账。
