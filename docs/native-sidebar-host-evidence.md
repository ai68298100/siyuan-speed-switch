# T-7115 真实 dock partial evidence

日期：2026-10-05  
思源：3.8.6  
插件：v0.44.1  
验证方式：全新隔离工作区、独立端口 `19316`、真实思源 desktop bundle；未使用个人工作区，未记录访问码或笔记内容。

## 已取证

- 通过生产插件实例的 `toggleSidebar()` 打开真实 `addDock` 注册项 `siyuan-speed-switchsidebar`。
- 侧栏真实挂载在宿主 `.layout__dockr`，宿主分隔条实际把宽度从 `340px` 拖到 `245px`。
- 搜索、筛选、排序、日记、设置五个控件均保留非零命中盒、`tabIndex=0` 和非空可访问名称；逐一聚焦成功。
- 侧栏根和工具栏在窄宽度下 `scrollWidth <= clientWidth + 1`，排序长文案保持隐藏溢出和单行截断。
- 激活筛选状态在真实侧栏 DOM 中显示徽标与可访问名称，点击真实“重置全部筛选”后徽标清空。
- 在窄宽度状态保存仅包含插件侧栏根节点的 `native-sidebar-narrow.png` 局部视觉快照，用于检查布局边界；快照不作为系统读屏或最终人工观感结论。
- Playwright 结果为 `1 passed`；隔离内核错误日志为空。

## 范围

这份证据只把真实思源 dock 的宿主挂载、尺寸响应、控件可达性和筛选状态呈现记为 `partial`。它没有宣称原生桌面窗口的最终视觉、系统读屏、主题切换和人工最窄可用宽度验收完成；这些仍由 B-005 保持 pending。

原始运行产物保存在本地 `.artifacts/t7115-sidebar-native-final2/`，其中 `native-sidebar-narrow.png` 只包含插件侧栏根节点；契约入口为 `tests/e2e/native-sidebar.spec.mjs`，结构与负向验证见 `tests/native-sidebar-e2e-contract.test.cjs`。
