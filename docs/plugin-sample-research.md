# SiYuan plugin-sample 研究结论

研究对象：<https://github.com/siyuan-note/plugin-sample>（2026-09-15，main）。

## 项目用途

这是思源官方插件模板与 API 参考，不是可直接安装的业务插件。它覆盖标准前端插件生命周期、顶部栏/状态栏、Dock、命令、快捷键、Protyle 菜单与事件总线、设置页、国际化、发布服务公开数据，以及可选的 kernel 插件构建链。

## 对本插件有直接价值的内容

1. `onLayoutReady` 再创建顶部栏、状态栏和 Dock，避免在 `onload` 阶段宿主布局尚未完成；可作为页签面板和组件面板生命周期审计基线。
2. `onunload`/`uninstall` 的顺序、超时和资源清理说明，可继续用于同步期间冻结、监听器移除和定时器回收检查。
3. `plugin.json` 的 `frontends`、`backends`、`kernels` 声明可用于组件/Agent 能力矩阵，避免把桌面能力误标为移动端可用。
4. 官方 i18n 约定（`displayName`、`description`、`readme` 和 `src/i18n/*.json`）可作为组件商店文案和中英文一致性校验来源。
5. 发布服务示例明确区分私有 `loadData/saveData` 与公开 `loadPublishData/savePublishData`；对本插件的 Agent 只读输出和外部组件隐私边界具有参考价值，但不应把页签或笔记内容自动发布。
6. 发布服务、启动外观和 kernel 插件均有严格白名单/资源限制；本插件应继续保持 `package.zip` 资源清单、第三方 URL 和外部 API 白名单。
7. 官方模板使用 webpack + esbuild-loader，同时明确要求 `tsc --noEmit`，与本仓库现有发布门禁一致。

## 不直接引入的内容

- kernel 插件示例会增加 `kernel.js`、独立构建链和宿主权限面；当前页签切换、组件面板和 Agent 只读能力不需要它。
- 发布服务公开快照不适合承载私人页签、文档正文、天气定位或第三方 API 密钥；仅保留为未来“明确授权的公开摘要”候选。
- 启动外观资源（视频、背景图、CSS）与本插件核心交互无关，会增加包体和维护面，暂不接入。

## 结论与后续动作

研究结果为“参考并吸收规范，不复制模板业务代码”。下一阶段优先：

- 增加生命周期契约测试，覆盖 `onLayoutReady` 创建 UI、卸载清理和重复加载；
- 将 `plugin.json` 前后端平台声明映射到组件商店的可用性提示；
- 在发布检查中补充公开数据与私有数据隔离扫描；
- 保持 kernel 能力作为独立、需明确授权的后续路线，不并入当前 Agent 默认能力。
