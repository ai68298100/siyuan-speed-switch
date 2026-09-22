# ADR 0070：通过既有命令开放 Task Horizon 移动端能力

- 日期：2026-09-22
- 状态：接受；双仓库实现和本地验证，设备验收后置
- 任务：T-6772～T-6775
- 关联：ADR 0069；`docs/integrations/task-horizon-mobile.md`

## 问题与证据

Task Horizon 上游 `7b9da6f83fa338ffe739af579c0ae4acf60ca052`（manifest 3.1.0）已经有移动任务管理器和快速新建表单。但 `registerCommands()` 将管理器绑定至只适用于桌面的 `openTaskHorizonTab()`，又在手机端注册快速新建命令之前返回；`openQuickAddFromMainWindow()` 也直接拒绝移动端。给雷切动作勾选“手机端尝试”无法创造这些缺失的入口。

## 决策

1. 修复提供方：沿用 `openTaskHorizon`、`openQuickAddTaskWindow` 两个 `langKey`。管理器按端侧路由到现有手机入口或桌面页签；快速新建复用原表单，桌面仍先恢复 Electron 主窗口。手机不注册桌面 globalCallback。新增图标以及卸载/惰性加载的失效检查。
2. 提供方可选实现同步 `getQuickActionCapabilities()`，`version: 1`，`commands` 为命令键到 `desktop/sidebar/mobile` 数组的映射。雷切从实时实例读取、过滤并复制数组，未来版本/缺失/异常视为未知，空数组视为明确无支持端侧。这是插件间约定，不冒称宿主官方 API。
3. 执行仍走现有命令回调并保留 `this`；不额外创建全局 API、事件总线或 adapter 动作 ID，避免重复动作和双套生命周期。只有 Task Horizon 自己访问自身内部运行时。雷切每次执行重新查插件、命令和能力，不缓存函数；用户配置的 `targets` 仅表示摆放位置。
4. 目录、设置候选、首层和主点击共用实时声明；已有命令 ID、用户名称和图标覆盖保留。旧版未声明的命令在手机端仍为 unknown，可沿用显式尝试，但不能绕过明确 unsupported 或提供方缺失。
5. 浮球命令执行捕获 `false`、`{ok:false}`、异常及拒绝。默认等待上限 30 秒（覆盖冷加载预算），内部参数限制 1～60000 ms。超时结束等待并恢复浮球状态，不承诺取消插件工作，也不自动重试。此返回语义只调整 command，不扩展到其他 adapter。

## 交付与验证边界

两个仓库分别在隔离分支开发，保留原主工作区尚未提交的 P1 通用动作。交付源码补丁、作者说明、PR 文案和本地测试包；只做本地阶段提交，不 push、不向作者自动发送信息。

新增测试执行真实 Task Horizon 插件和雷切 TypeScript 宿主方法；能力发现、存量动作、卸载重载、失败结果及超时均有行为断言。按门禁清单注入移除手机路由/注册/卸载保护、接受未知版本、把摆放当能力、丢失宿主接线、吞掉失败的负向变异，要求命中具体断言。浏览器/VM 证据不计入 Android 真机通过。
