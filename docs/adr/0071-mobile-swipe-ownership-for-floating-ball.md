# ADR 0071：移动端悬浮球与思源侧滑的事件归属

- 日期：2026-09-22
- 状态：已提出，等待实现与真实 Android 验收
- 关联任务：T-6777（研究）、后续 T-6778～T-6780
- 关联：`docs/mobile-swipe-floating-ball-research-2026-09-22.md`、ADR 0066、ADR 0068、ROADMAP §8.0.9

## 背景

思源 v3.8.5 在 `app/src/mobile/util/touch.ts` 中改进了侧栏左右滑动：普通页面的方向激活距离为 12 px，抬手时按屏宽三分之一或 32 px+快速甩动提交，并支持在滑动中切换侧栏标签。移动端事件由 `mobile/index.ts` 在 document 冒泡阶段统一接收。

当前悬浮球使用 Pointer Events、pointer capture、`touch-action: none` 和约 9 px touch slop，但 portal 没有声明 `data-prevent-swipe`。因此一根手指在悬浮球上的拖动同时进入插件状态机和思源侧栏状态机，造成左、右边缘都可能误开或误关侧栏。

## 决策

1. 保留共享 quick-action registry、独立 portal、Pointer Events 状态机、位置/动作配置、边缘吸附和弹层让位；问题属于输入所有权，不需要重写悬浮球架构。
2. 移动端 portal 根节点、触发按钮和恢复按钮声明 `data-prevent-swipe`，利用思源已有的“内容独占整轮手势”契约。动作面板作为 portal 后代，继承同一手势边界。
3. 保留 `touch-action: none` 和现有 touch slop；在真实设备验证前不擅自把阈值调大，也不通过位置移动掩盖冲突。
4. 不由插件修改 `local-mobile-bars.sidebarSwipe`，不以固定 z-index 或关闭手机悬浮球作为默认修复。
5. 项目仍支持 3.8.0。3.8.1～3.8.5 已从源码确认 marker 契约；3.8.0 未发现该契约。先验证标记方案，再决定是否为 3.8.0 增加移动 portal 触摸冒泡隔离，或另行抬高最低版本；不在本轮无证据地改变版本下限。

## 被拒绝的方案

- 只调大插件 touch slop：宿主仍会按自己的 12 px/快速甩动规则接管，且拖动手感变差。
- 只改 `touch-action`、`pan-y` 或 `overscroll-behavior`：这些不能撤销思源 document 级 JavaScript 监听。
- 只把球移离边缘：3.8.5 的页面级侧滑不要求起点在最外侧，不能保证消除冲突。
- 启用悬浮球时静默关闭宿主侧滑：改变用户的全局设置，违背插件与宿主能力边界。
- 默认添加全局 `stopPropagation`/`preventDefault`：可能破坏思源长按上下文菜单和动作面板滚动；只有 marker 对真实设备不足时才评估局部兼容层。

## 后果

- 生产增量很小，marker 可随 controller 创建/销毁，符合现有单例与清理模型。
- 3.8.1+ 的宿主可直接识别；3.8.0 需要兼容性验证，不能把浏览器模拟当作结论。
- 更多面板内的触摸默认归悬浮球所有，外层侧滑不会抢走动作；面板自身的垂直滚动仍应由其 CSS/原生滚动处理。
- 真实 Android 触控、旋转、键盘和 WebView 事件顺序仍是环境证据，受 `BLOCKERS.md` B-004 后置条件约束。

## 实施前验证

- 静态/宿主契约测试确认根、触发按钮和恢复按钮均带 marker；删除接线、改成普通 class、或把标记放在不可达节点时目标测试必须失败。
- 使用与思源 v3.8.5 相同的 `touch.ts` 判定夹具，对有/无 marker 的水平拖动分别确认侧栏提交与完全无动作。
- 若加入兼容层，必须额外验证监听器可枚举清理、长按、更多面板竖向滚动、pointer/touch 双流和卸载重载。
- 真实设备至少覆盖左右两侧各 30 次拖动，目标是零次意外侧栏提交、零次重复动作执行。

