# ADR 0203：compact 保留组件高度档位

- 日期：2026-10-16
- 状态：已完成
- 任务：T-7278
- 相关：T-7277、ADR 0202

## 背景

真实宿主探针显示 compact 默认组件虽然宽度不同，但高度全部约 78px。原因是 compact CSS 把网格行设为 `auto`、把单元格 `grid-row` 强制为 `auto`，并统一限制为 68px；渲染层原本声明的 `small/medium/tall/wide` 高度因此不可见。结果看起来像一排被压扁的工作台卡片，而不是内容决定形状的小组件。

## 决策

1. compact 网格使用 28px 小行高，继续消费布局渲染层写入的 `grid-row: span h`。
2. 移除统一 `max-height: 68px` 和 `grid-row: auto !important`；单元格保留 `min-height: 0`、`overflow: hidden`，由声明的高度档位承载内容。
3. 不改变 `HOME_WIDGET_SIZES`、实例布局数据、组件协议、移动端单列降级或已保存用户布局。

## 取舍

恢复高度差会让 medium/tall 组件占用更多垂直空间，但这是区分内容形状和避免统一大卡的必要成本。内容裁切风险由组件自身的有界投影和现有窄屏回归承担；后续若某个组件在小档位确有独立裁切证据，再按组件类型处理，不重新引入全局高度上限。

## 验证

- `tests/compact-workbench-style-contract.test.cjs`
- `.artifacts/T-7278-negative-height-track.log`
- `.artifacts/T-7278-negative-height-track-explicit28.log`
- `src/styles/_12-r54-surface-adapter.scss`
- Chrome 隔离思源 3.8.7 回归（`C:\Program Files\Google\Chrome\Application\chrome.exe`）：
  `1440×900`、`700×900`（compact/medium）、`375×812` 均保持 `grid-auto-rows: 28px`，
  渲染层 `span 3/4/6` 产生 `96/130/198px` 高度档位；`scrollWidth` 与 `clientWidth` 一致，
  无横向溢出。完整指标见 `.artifacts/T-7278-visual-regression-28-run-output.json` 与
  `.artifacts/T-7278-compact-visual-metrics.json`。
- `tests/surface-switch-browser-smoke.cjs` 的 Dialog 夹具补齐
  `.b3-dialog__content,.b3-dialog__body { height: 100%; min-height: 0; }` 高度契约；
  `.artifacts/surface-switch-hostcss.log` 记录 R5 窄屏三次坐标切换全绿。

## 完成边界

本任务只恢复 compact 的内容高度档位和发布 smoke 夹具的宿主高度契约，不改变组件协议、
移动端布局、版本号或发布状态；后续组件若出现独立裁切证据，按组件类型单独处理。
