# ADR 0201：书签块列表优先于失真的零计数

- 日期：2026-10-16
- 状态：已接受
- 任务：T-7276
- 相关：T-7144、ADR 0194

## 背景

书签组件同时消费思源返回的 `count` 和 `blocks`。隔离审计发现，宿主在 `count: 0` 时仍可能返回有效 `blocks`；旧投影只信任数值计数，会把真实书签当作空分组，`showEmpty` 关闭时直接隐藏入口，开启时显示错误的“空书签”。

## 决策

1. 当 `blocks` 是数组时，使用 `max(max(count, 0), blocks.length)` 作为展示计数；非数值计数继续回退到 `blocks.length`。
2. 只对计数做投影兜底，不改变书签名称合并、排序、限制和宿主 dock 点击协议。
3. 没有块的真实空分组仍按 `count: 0` 展示或按 `showEmpty` 过滤。

## 取舍

这能吸收宿主返回顺序或计数暂时滞后的情况，同时保持已有空态语义。若未来宿主提供稳定书签 ID，仍需另行评估名称聚合和精确定位；本任务不扩大协议范围。

## 证据

- `src/kernel-widget-model.js`
- `tests/kernel-widget-model.test.cjs`
- `.artifacts/T-7276-bookmark-model.log`
- `docs/dev-plan-2026-10-06.md`
