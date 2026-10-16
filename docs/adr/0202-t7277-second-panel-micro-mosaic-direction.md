# ADR 0202：第二面板收敛为混合小组件拼贴

- 日期：2026-10-16
- 状态：已接受为下一阶段视觉方向，尚未进入生产实现
- 任务：T-7277
- 相关：T-7273、T-7274、T-7275、ADR 0199、ADR 0200

## 背景

T-7274/T-7275 只缩小了窗口和组件尺寸，真实截图仍显示出完整工作台壳层：平台品牌、三面板导航、上下文行、编辑/刷新/商店工具栏，以及每个组件的来源状态、配置和折叠控件共同占据首屏。外部效果组件也仍沿用渐变或大数字内容，视觉上不像轻量小组件集合。

## 决策

1. 下一阶段以“混合小组件拼贴”为默认视觉目标：列表型内容使用 40～56px 的微型信息条，单值型内容使用约 72～112px 的最小瓦片，宽条与瓦片按内容混排。
2. compact 查看态只保留 34～40px 的标题栏、添加入口和更多入口；编辑、刷新、商店、配置和折叠操作保留可达性，但移入更多或编辑态，不作为首屏常驻 chrome。
3. compact 组件使用中性底色、细边线、6～8px 圆角和单一弱强调色；不再叠加玻璃、渐变、悬浮阴影、大圆角或固定大画布空白。
4. 本任务只交付静态三方案对照原型，不修改生产 DOM、组件协议或外部数据源；先完成视觉确认和可访问性方案，再分批改生产样式。

## 取舍

该方向保留 Obsidian 参考中“不同内容使用不同尺寸、紧凑排列”的可验证结论，不复制未知插件的拖拽、画布或数据协议。将效果插件降为摘要瓦片会减少首屏信息量，但能避免在小尺寸里保留完整图表和装饰层；详细视图仍可由组件自身入口打开。

## 证据

- `docs/design/second-panel-micro-mosaic-prototype-2026-10-16.html`
- `docs/research-second-panel-visual-gap-2026-10-16.md`
- `docs/research-second-panel-2026-10-15.md`
- `.artifacts/e2e-compact-host-7/compact-host-probe.png`
- `.artifacts/e2e-compact-host-narrow-2/compact-host-700.png`
- `src/styles/_07-sidebar-panel-store.scss`
- `src/styles/_11-ui-polish.scss`
- `src/styles/_12-r54-surface-adapter.scss`
