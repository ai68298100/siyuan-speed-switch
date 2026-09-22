# 思源 3.8.5 移动端左右滑与悬浮球冲突复核

> 日期：2026-09-22  
> 状态：研究与方案阶段，本轮没有修改 `src/`、没有修改构建产物，也没有开发实现。  
> 关联：T-6777、ADR 0071、ROADMAP §8.0.9

## 1. 研究范围与证据

本轮以思源官方仓库 `siyuan-note/siyuan` 的发布 tag `v3.8.5` 为准，并与 `v3.8.4` 做源码差异比较。

| 项目 | 证据 |
| --- | --- |
| v3.8.5 tag | `60a4387cc1ce0cd0c7a61c2343e5a6a020758c0a` |
| v3.8.4 tag | `9f775e8a12daef8255556097396f9b2739078892` |
| v3.8.5 与 master | 2026-09-22 检索时 master 与 v3.8.5 指向同一发布提交 |
| 本地源码副本 | `.research/siyuan-v3.8.5`（研究副本，不属于插件生产图） |
| 发布说明 | `app/changelogs/v3.8.5/v3.8.5.zh-CN.md` 列出 issue #19644“改进移动端侧栏滑动手势灵敏度”和 issue #19645“改进通过滑动手势切换移动端侧栏标签页” |
| 主要实现 | `app/src/mobile/util/touch.ts`、`touchPanelGesture.ts`、`touchGesture.ts`、`mobile/index.ts`、`mobileBarsConfig.ts` |

可复现的源码核对命令：

```powershell
git -C .research/siyuan-v3.8.5 show v3.8.5:app/src/mobile/util/touch.ts
git -C .research/siyuan-v3.8.5 diff v3.8.4 v3.8.5 -- app/src/mobile/util/touch.ts app/src/mobile/util/touchPanelGesture.ts
```

官方在线入口：

- [v3.8.5 移动端触摸处理](https://github.com/siyuan-note/siyuan/blob/v3.8.5/app/src/mobile/util/touch.ts)
- [v3.8.5 侧栏手势参数](https://github.com/siyuan-note/siyuan/blob/v3.8.5/app/src/mobile/util/touchPanelGesture.ts)
- [v3.8.5 移动端发布说明](https://github.com/siyuan-note/siyuan/blob/v3.8.5/app/changelogs/v3.8.5/v3.8.5.zh-CN.md)

## 2. 3.8.5 到底改了什么

### 2.1 侧滑不再只依赖旧的 5 px 拖动阈值

3.8.4 对普通页面使用 `Constants.SIZE_DRAG_THRESHOLD = 5` 判断首个方向。3.8.5 对不在菜单和模型中的页面改用：

```ts
MOBILE_SIDEBAR_SWIPE_ACTIVATION_DISTANCE = 12;
```

对应源码为 `touch.ts:481-499`。这一步本身把“开始识别为侧滑”的距离从 5 px 提高到 12 px，不能简单解释为所有路径都变得更低阈值。

### 2.2 松手提交改成“距离或快速甩动”

`touchPanelGesture.ts` 新增：

```ts
MOBILE_SIDEBAR_SWIPE_MIN_FLING_DISTANCE = 32;
MOBILE_SIDEBAR_SWIPE_MIN_FLING_VELOCITY = 0.3;
MOBILE_SIDEBAR_SWIPE_SETTLE_RATIO = 1 / 3;
```

`shouldCommitSidebarSwipe` 的语义是：

1. 手势必须沿当前方向移动；
2. 最终位移达到屏幕宽度的三分之一，直接提交；或
3. 位移至少 32 px 且速度至少 `0.3 px/ms`（约 300 px/s），作为快速甩动提交。

`touch.ts:278-305` 在抬手时使用最终横纵位移再次确认方向，然后打开或关闭侧栏。以 360 px 宽的手机为例，一次 40 px、100 ms 的水平拖动就满足快速甩动条件。悬浮球的正常拖动很容易落入这个范围，因此“球移动”和“侧栏滑动”会同时拥有同一根手指。

### 2.3 侧滑入口不是只在最外侧几像素生效

`touch.ts:376-384` 只把最外侧 8 px 的触摸点排除（iPhone 例外）；悬浮球默认中心距边缘约 8+24 px，实际仍会进入思源的全局触摸状态机。3.8.5 在页面级路径中没有要求起点必须位于边缘，关闭侧栏时可以从普通内容区域开始识别。

### 2.4 思源已经提供“整轮手势由内容独占”的契约

3.8.5 的 `handleTouchStart` 在 `touch.ts:339-355`：

```ts
preventSwipe = !!hasClosestByAttribute(target, "data-prevent-swipe", null, true);
if (preventSwipe) {
    return;
}
```

后续 `handleTouchEnd` 在 `touch.ts:149-153` 看到同一个标记对应的状态就直接返回；`touchmove` 因为起点没有被记录，也不会进入侧栏拖动逻辑。3.8.4 已有同名标记，但只把起点坐标置空；3.8.5 把它明确成跨 start/move/end 的整轮状态。

这个契约在 v3.8.1、v3.8.2、v3.8.3、v3.8.4 和 v3.8.5 的 `touch.ts` 中都存在；v3.8.0 源码中尚未发现该标记。因此项目仍保留 `minAppVersion: 3.8.0` 时，3.8.0 需要单独的兼容边界。

### 2.5 监听是 document 级、冒泡阶段

`mobile/index.ts:241-244` 注册四个 document 级监听：`touchstart`、`touchmove`、`touchend` 和 `touchcancel`，均使用冒泡阶段。悬浮球不能只依赖 CSS 的 `touch-action` 来表达事件所有权。只要触摸事件继续冒泡到 document，思源就会看到它；`touch-action` 主要约束浏览器的默认直接操控行为，不会自动撤销思源自己的 JavaScript 状态机。

## 3. 当前悬浮球实现与冲突链

当前插件的实现证据：

- `src/floating-ball-ui.ts:428-479` 创建 `.sw-fab-root.sw__fab`、`.sw-fab-trigger` 和恢复按钮；根节点没有 `data-prevent-swipe`。
- `src/styles/_04-fab-fullscreen-soft.scss:78-95` 给真正的触发按钮设置 `touch-action: none` 和 `pointer-events: auto`；根节点本身是 `pointer-events: none`。
- `src/floating-ball-ui.ts:532-647` 使用 Pointer Events、pointer capture 和默认 9 px（可配置 8~12 px）的 touch slop；拖动后才在 `pointermove/pointerup` 中调用 `preventDefault`，没有为触摸事件设置 `stopPropagation`。
- 恢复按钮是 portal 根节点的兄弟（`floating-ball-ui.ts:459-500`），即使根节点加了标记，恢复按钮也应单独加同一标记。

在思源 3.8.5 上，一次从悬浮球开始的水平拖动可能按下面的顺序发生：

1. `pointerdown` 被悬浮球控制器捕获，同时兼容的 `touchstart` 冒泡到思源 document；当前没有 `data-prevent-swipe`，思源记录起点。
2. 悬浮球在约 9 px 后进入自己的 `dragging` 状态。
3. 触摸位移达到 12 px 后，思源把同一手势认作横向侧滑，显示侧栏拖动状态。
4. 抬手时，若最终拖动满足 32 px+快速甩动或三分之一屏宽，思源提交打开/关闭；悬浮球同时保存位置或执行拖动目标。

因此，当前方案的根因不是动作目录、几何命中、位置持久化或 z-index 设计失效，而是**移动端宿主与插件没有明确的触摸所有权边界**。已有 8~10 px touch slop 只能区分“悬浮球点击/拖动”，不能阻止宿主把拖动再次解释成侧滑。

## 4. 对原方案的结论

原来的“共享动作注册表 + 独立 portal + Pointer Events 状态机 + 停靠/自由位置 + 动作面板”仍然成立，不需要推翻，也不需要把悬浮球退回成固定按钮。需要修订的只有移动端输入边界：

| 原方案要素 | 结论 | 说明 |
| --- | --- | --- |
| 共享 quick-action registry / executor | 保留 | 与思源侧滑无关，动作能力和展示仍应分离 |
| 单例 portal、Pointer Capture、8~12 px slop | 保留 | 仍负责插件自身的点击/拖动分流 |
| `touch-action: none` | 保留但降级为必要条件 | 能阻止浏览器默认滚动/手势，不等于阻止思源 document 监听 |
| 左右边缘吸附、半隐藏、闲置降透明度 | 保留 | 这是遮挡与位置体验问题，和宿主侧滑是两条边界 |
| 只调大 touch slop | 不采用 | 只能改变插件何时开始拖动，不能消除宿主的 12 px/快速甩动判断，且会损害拖动手感 |
| 只把球向内移动 | 不作为根治方案 | 3.8.5 页面级侧滑可从普通内容区域开始，位置调整只能降低概率 |
| 固定高 z-index / 让球盖住侧栏 | 不采用 | 这是层级问题的错误方向，且会遮挡宿主面板 |

结论：**原方案可行，但必须补上宿主手势隔离；最小修订是把悬浮球声明为 `data-prevent-swipe` 内容。**

## 5. 备选方案比较

| 方案 | 处理方式 | 优点 | 代价与风险 | 判断 |
| --- | --- | --- | --- | --- |
| A. 宿主契约标记 | 在移动端 portal 根节点、触发按钮和恢复按钮上设置 `data-prevent-swipe`；动作面板作为根节点后代自然继承 | 直接使用思源已有契约；不改侧滑阈值；不改全局设置；代码和生命周期增量很小；3.8.1+ 可工作 | v3.8.0 不识别；需要真机确认 Android WebView 的事件目标仍能向上找到根节点 | **首选 P0** |
| B. 标记 + 触摸事件冒泡隔离 | A 仍作为主路径；只在检测到旧宿主或真机仍冲突时，在移动 portal 上对 `touchstart/move/end/cancel` 做冒泡阶段 `stopPropagation`，不主动全局 `preventDefault` | 可兼容 v3.8.0；即使宿主契约回归也能隔离 document 监听 | 可能改变宿主在球内长按/上下文菜单的语义；必须完整绑定/解绑并验证更多面板竖向滚动 | **条件性 P1** |
| C. 仅调大插件 slop | 将 9 px 调到 12~16 px | 改动极小 | 宿主仍会在 12 px 后接管；拖动变迟钝；不能证明事件所有权 | **不采用** |
| D. 仅改 CSS（`pan-y`、`overscroll-behavior` 等） | 依赖 CSS 约束水平手势 | 可视上简单 | 思源 document JavaScript 仍会收到 touch 事件；不能解决本问题 | **不采用** |
| E. 关闭思源 `sidebarSwipe` | 悬浮球启用时关闭移动端侧栏滑动 | 能回避冲突 | 改写用户全局习惯，用户失去原生侧滑；插件不应替用户修改宿主偏好 | **只作用户自选逃生开关，不作默认方案** |
| F. 不在左右边缘放球 | 改为底部胶囊、顶部入口或固定中部 | 可降低边缘心理冲突 | 3.8.5 侧滑可从页面内部开始；改变产品形态且仍无法保证 | **可作为后续 UX 预设，不是修复** |
| G. 移动端停用悬浮球 | 只保留顶栏/更多菜单入口 | 最稳妥 | 直接放弃手机端核心需求 | **仅作极端兼容降级** |

## 6. 推荐路线（本轮只定方案，不开发）

### P0：宿主手势契约收口

1. 移动端悬浮球 portal 根节点设置 `data-prevent-swipe`；触发按钮和恢复按钮也显式设置，避免未来 DOM 重构或事件目标变化时失去保护。
2. 继续保留 `touch-action: none`、Pointer Capture 和现有 8~12 px 配置，不先调阈值。
3. 动作面板仍允许自己的垂直滚动；`data-prevent-swipe` 只阻止思源的外层侧滑状态机，不用 CSS 禁止面板默认竖向滚动。
4. 桌面和侧栏 surface 不添加移动端专属的 touch firewall；移动 surface 才接入宿主契约，保持三端生命周期独立。
5. 不修改用户的 `local-mobile-bars.sidebarSwipe`，不新增迁移字段，不改变动作配置 schema。

### P1：旧宿主与事件异常的兼容路径

项目当前 `minAppVersion` 是 3.8.0，而标记契约在 3.8.1 才能从源码中确认。因此先保留兼容决策，不立即抬高最低版本：

- 先在 3.8.5/3.8.4 真机验证方案 A；
- 如果仍需覆盖 3.8.0，再评估方案 B 的移动 portal 触摸冒泡隔离；
- 只有当 B 与宿主长按/面板滚动存在不可接受冲突，才把最低版本抬到 3.8.1，并单独写 ADR、更新 `plugin.json`、README 和兼容矩阵。

不采用“运行时偷偷关闭侧滑”来掩盖 3.8.0 差异。

### P2：可观测性与真实设备验收

在开发时为测试夹具记录“悬浮球拥有手势 / 宿主拥有手势 / 取消 / 侧栏提交”四类结果，生产版本不写入工作区、不发送网络数据。真实 Android 需覆盖：

- 左边缘球：轻触、垂直拖动、向右拖动、向左拖动、拖到动作目标、空白松手；
- 右边缘球：同一组镜像动作；
- 悬浮球更多面板：搜索输入、列表竖向滚动、点击动作、点击外部关闭；
- 左右侧栏分别打开、关闭和切换标签；
- `sidebarSwipe` 开启/关闭、横竖屏旋转、键盘出现、弹层让位、插件重载；
- 连续至少 30 次左右两侧拖动，零次意外打开/关闭侧栏，零次重复执行动作。

浏览器夹具只能证明 DOM 事件和几何逻辑，不能替代 Android WebView 证据；这点继续受 `BLOCKERS.md` B-004 约束。

## 7. 实施前的验收门槛

实现前需要先把以下契约写成测试设计，开发时按门禁清单做负向验证：

1. 真实 portal 根节点、触发按钮、恢复按钮均有 `data-prevent-swipe`；旧 controller 被清理后不得残留标记节点。
2. 将标记从夹具中移除后，模拟 v3.8.5 `touch.ts` 的 document 处理必须能观察到侧栏提交；保留标记时必须没有打开、关闭或切换标签动作。
3. 负向注入：删除生产接线、只给不可达节点加标记、或把 marker 改成普通 class，目标测试必须精确失败；恢复后字节级还原。
4. 方案 B 若实施，必须单独验证监听器数量、卸载清理、长按上下文菜单、更多面板竖向滚动和 pointer/touch 双事件顺序。
5. 真实宿主验收必须分别记录 3.8.5、至少一个 3.8.4 兼容点，以及项目最低版本 3.8.0 是否需要明确降级或抬升下限。

## 8. 当前结论

3.8.5 的侧滑更新没有让悬浮球整体设计失效；它暴露了旧方案遗漏的宿主输入契约。方案 A 是低风险、可逆、符合思源现有设计的修订，应先验证；方案 B 只作为 3.8.0 或真机仍有异常时的兼容层。调大阈值、改位置、改 CSS 或关闭宿主功能都不能替代事件归属处理。

