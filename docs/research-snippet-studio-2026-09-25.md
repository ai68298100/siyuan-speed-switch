# T-6864 代码片段实验室二次调研与优化建议（2026-09-25）

> 本轮只做功能、交互和 UI 研究，不修改生产代码。目标是确认实验室应该补什么，以及哪些能力应该继续保持边界。

## 1. 先判断产品是什么

当前工作室同时承担三件事：

1. 管理思源原生 CSS / JS 片段；
2. 在隔离的示例文档中检查 CSS 效果；
3. 让 AI 生成一个需要人工审核的草稿。

它还不是通用文本扩展器、云端代码仓库或任意 JavaScript 运行器。这个定位决定了下一步要先补保存安全和编辑效率，再考虑标签、社区和同步。

## 2. 当前实现盘点

| 领域 | 已有能力 | 仍缺的关键体验 |
|---|---|---|
| 原生管理 | 读取、保存、启用、停用、删除；保存前重读并比较；严格投影原生字段 | `disabledInPublish` 没有编辑入口；没有顺序/级联说明；整表接口冲突只有通用错误；没有全量备份恢复 |
| 编辑 | 名称、类型、代码编辑；导入单个 CSS/JS 为禁用草稿；导出当前代码 | 裸 `textarea` 没有行号、高亮、括号匹配、查找替换、格式化、撤销之外的草稿恢复；没有克隆/另存为 |
| 预览 | CSS opaque-origin sandbox iframe；加载、就绪、错误状态；明暗预览；保存基线比较 | 固定示例文档和固定尺寸；没有设备/编辑器布局档位、当前主题映射、错误位置提示；JS 执行保持禁用 |
| 目录 | 5 条内置 CSS 示例；搜索、来源、类型、分类过滤；当前项标记；方向键/Home/End/Escape | 没有标签、置顶、最近使用、排序、批量动作和摘要预览；内置条目与个人条目的元数据不对称 |
| AI | 生成、优化、解释、迭代；SSE、取消、超时、过期回包、history 上限；手动接受 | 勾选同意后显示的“ready”不等于宿主已配置；缺少 provider/权限/费用/重试状态；结果不能复制、导出或局部采用；解释与代码草稿的操作层级还可以更清楚 |
| 宿主与端侧 | 桌面切换器入口；原生列表是保存来源；卸载保存会话草稿；移动端暂不提供入口 | 真实桌面/Android 验收未完成；当前 UI 浏览器夹具主要覆盖 happy path，缺少正式 UI 契约和宿主回归 |

## 3. 参考插件带来的直接结论

### TCOTC/snippets

[TCOTC/snippets](https://github.com/TCOTC/snippets) 的管理菜单覆盖新增、编辑、删除、启用、停用、搜索、刷新和设置；编辑器使用 CodeMirror 6，具备行号、语法高亮、括号匹配、查找替换和 CSS 实时预览；设置还支持持续监测本地片段目录或只在启动时加载一次。

对本项目最直接的吸收项是编辑器基础能力和“管理列表 → 编辑器 → 预览”的单一流向。文件监视可以作为后续导入适配器研究，不能直接绕过思源原生列表写入边界。

### MDfox-ChaosZone/siyuan-font-studio

[思源字体工坊](https://github.com/MDfox-ChaosZone/siyuan-font-studio) 把适用范围拆成界面、正文、代码、公式、关系图、Mermaid 和 Emoji，并提供预设方案、切换、导入导出、候补字体、示例方案按需下载，以及自动格式检查和人工审核状态。

它提示我们：片段需要“适用范围”和“方案状态”这两种可读元数据。但字体范围本身属于另一个产品域；工作室只应吸收预设、导入、检查、审核状态这些交互，不复制完整字体管理面。

## 4. 同类产品的共性模式

| 产品 | 观察到的模式 | 适合吸收的部分 |
|---|---|---|
| [Stylus Manager](https://github.com/openstyles/stylus/wiki/Manager) / [Editor](https://github.com/openstyles/stylus/wiki/Editor) | 启用状态、来源、UserCSS 类型筛选；搜索名称/代码/适用范围；组合排序；编辑器模式、实时预览、更新历史；导入后报告新增/更新并支持撤销 | 适用范围、状态可见性、过滤摘要、导入回执/撤销、编辑态与运行态分离 |
| [Raycast Snippets](https://manual.raycast.com/snippets) | name/keyword/content 搜索、标签过滤、置顶、复制/粘贴/编辑/复制/删除；导入前审阅；`{date}`、`{clipboard}`、`{cursor}` 等动态占位 | 标签、别名、置顶、导入预览、手动搜索与触发入口分离；动态字段先做受控的日期/光标占位 |
| [VS Code snippets](https://code.visualstudio.com/docs/editing/userdefinedsnippets) | 语言/项目作用域；前缀触发；tabstop、选择项和变量；IntelliSense 与专用选择器双入口 | 适用表面/语言元数据、可搜索前缀、结构化参数；不把内部模板语法直接暴露给普通用户 |
| [massCode](https://github.com/massCodeIO/massCode) / [Gisto](https://github.com/Gisto/Gisto) | 本地优先的库/文件夹/标签组织；三栏列表、编辑、预览；命令面板；跨工具导入和可迁移备份 | 三栏信息架构、过滤 chip、最近使用、迁移格式；保持本地优先，不急于接云同步 |
| [Chrome DevTools Snippets](https://developer.chrome.com/docs/devtools/javascript/snippets) | 编辑和运行是两个明确动作；有保存状态、快捷键、当前页面上下文和运行反馈 | 运行型片段必须显示上下文、保存状态和错误反馈；不代表本项目应解禁任意 JS |

## 5. 优先级判断

### P0：先补安全和可恢复性

1. **发布禁用开关**：在详情卡增加 `disabledInPublish` 控件，并明确它与 CSS/JS 总开关、片段自身 `enabled` 的关系。
2. **冲突差异与恢复**：冲突时显示外部版本、本地草稿和差异摘要，提供“载入外部版本”“保留本地草稿”“另存为新片段”三个出口，避免只能刷新丢意图。
3. **全量备份/恢复**：支持导出当前原生片段列表、总开关、工作室侧车元数据的版本化 JSON；导入先做预览，显示新增/更新/冲突，确认后再写入，并提供一次撤销。
4. **顺序和级联可见**：展示原生列表顺序，提供上移/下移或拖动；编辑区提示 CSS 片段按宿主顺序产生级联，保存前标记会改变优先级的操作。
5. **总开关入口**：`enabledCSS/enabledJS` 关闭时，状态卡应能直接引导到设置或打开对应总开关，不能只在小字状态里提示。

### P1：提高每天编辑的效率

1. **代码编辑器升级**：优先引入与参考插件同类的 CodeMirror 能力，至少提供行号、CSS/JS 高亮、括号匹配、查找替换、格式化和 Cmd/Ctrl+S；移动端退化为轻量文本编辑。
2. **草稿恢复与克隆**：关闭后保留有界草稿快照，重开时提供恢复/丢弃；增加“复制为新片段”，避免把内置项或已启用项直接改坏。
3. **批量导入/导出**：支持多个 `.css/.js` 和版本化 JSON；导入结果逐项显示新增、更新、跳过、冲突，支持撤销。单文件导入继续保持禁用草稿语义。
4. **AI 状态诚实化**：把“已同意发送”与“宿主可用/请求成功”拆开，增加失败原因、重试、取消进度和复制/导出结果；解释结果允许复制，代码结果允许另存草稿。
5. **轻量元数据**：为实验室侧车增加标签、别名、置顶、最近使用和适用表面；内容和启用状态仍由原生列表负责，侧车数据必须版本化、有界、可迁移。

### P2：再做视觉和生态增强

1. 预览增加主题、尺寸、编辑器布局和设备档位；保留“示例文档，不代表当前笔记”的显著标识。
2. 选择器增加排序、过滤 chip、启用状态变化提示、摘要预览和批量操作；桌面可以向“三栏：库/列表/编辑预览”演进，手机使用“列表 → 详情”两级。
3. 建立正式 UI 契约：快捷键、焦点回收、脏状态、错误字段关联、预览状态、导入回执和 AI live region；临时 Chromium 夹具继续保留，但不能代替宿主验收。
4. 社区目录、远程同步、GitHub Gist 和本地文件 watch 都放到 P3，先保证本地导入/导出可迁移。

## 6. 明确暂不做

- 不直接解禁任意 JS 在思源 WebView 中运行。当前 ADR 0078 的不可终止脚本风险仍然成立；后续最多另立受限模拟预览协议。
- 不把 AI checkbox 当作能力预探测，不自动触发模型请求，不把输出直接写入宿主。
- 不把字体工坊整体并入代码片段工作室；只研究适用范围、预设和审核状态的交互。
- 不先做云同步、社区上传或公开发布服务；先把本地备份、冲突恢复和迁移格式做稳。

## 7. 建议的下一批顺序

`disabledInPublish + 总开关引导` → `冲突 diff + 另存为新片段` → `全量备份/恢复` → `顺序管理` → `CodeMirror/快捷键` → `草稿恢复/克隆` → `批量导入导出` → `AI 状态与结果操作`。

这个顺序先消除数据和启用风险，再改善编辑效率，最后扩展元数据和生态；它不改变原生列表唯一来源、opaque sandbox 预览和 AI 手动接受三条边界。

## 来源

- [TCOTC/snippets](https://github.com/TCOTC/snippets)
- [MDfox-ChaosZone/siyuan-font-studio](https://github.com/MDfox-ChaosZone/siyuan-font-studio)
- [Stylus Manager](https://github.com/openstyles/stylus/wiki/Manager) / [Stylus Editor](https://github.com/openstyles/stylus/wiki/Editor)
- [Raycast Snippets](https://manual.raycast.com/snippets)
- [VS Code User Snippets](https://code.visualstudio.com/docs/editing/userdefinedsnippets)
- [massCode](https://github.com/massCodeIO/massCode)
- [Gisto](https://github.com/Gisto/Gisto)
- [Chrome DevTools Snippets](https://developer.chrome.com/docs/devtools/javascript/snippets)
