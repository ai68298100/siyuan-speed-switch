# ADR 0098：raw 自律线与归档上限再校准

- 日期：2026-09-29
- 状态：已采纳
- 关联：ADR 0081（1024→1088）、ADR 0090（zip 512→544）、ADR 0092（1088→1120）

## 背景

v0.42.0 后三批本地开发（T-6967 S2 商店余项、T-6986/T-6999 面板尺寸、T-7002/T-7004 设置深化、T-7003 保存回执）累计使 `dist/index.js` 达 1,140,647 B，raw 1120 KiB 自律线（1,146,880 B）内仅余 ~6.1 KiB；`package.zip` 545,261 B（544 KiB 上限内余 ~11.8 KiB）、压缩条目 312,015 B（320 KiB 内余 ~15.7 KiB）。后续面板状态批与第三面板预览链仍有明确功能增量，余量不足以承接。

## 减量审计

- 全仓无 `console.log` 残留；i18n 死键门禁保证语言文件无未引用键；近期增长逐批对账均为已验收功能（商店主从结构、设置搜索/存储健康、保存回执/撤销/恢复默认），无死代码或调试产物可摘。
- 集市必需资产与 F7 `publish.resources` 声明的 docs 文件（ADR 0090 已审）不可摘。

## 多 chunk 分流的评估结论（候选任务登记）

按需 chunk 分流（如设置页 `settings-sections.ts`）技术上可缓解 raw 与压缩条目线，但当前 webpack 配置的 `chunkFilename` 为**单一固定名**（`dist/snippet-studio.js`，T-6861 为发布资源契约与包体审计钉住稳定名）——新增第二个异步 chunk 将互相覆盖。分流前置条件是「多 chunk 稳定命名」构建工程（`[name]` 模板 + 命名规则 + 发布契约/复现构建/包体审计三处同步），登记为独立候选任务（T-7018，等下一批包体再收紧时评估开工），本轮不强行实施。

## 决策

1. **raw 自律线 1120 → 1152 KiB**（+32 KiB 步进，先例 ADR 0090/0092）。
2. **归档上限 544 → 576 KiB**（+32 KiB 步进，先例 ADR 0090 的 512→544）。
3. 压缩条目线 320 KiB 不变（余 ~15.7 KiB，暂不收紧本批）。
4. raw 线性质不变：异常膨胀预警，不限制功能实现；预算/余量/快照漂移统一由 `scripts/release-readiness-metrics.cjs` 提供。

## 影响面

- `scripts/release-readiness-metrics.cjs`：RAW_BUNDLE_BUDGET_BYTES、ARCHIVE_BUDGET_BYTES。
- `scripts/readiness-snapshot.cjs` 快照文案、`docs/release-readiness.md` 头注与质量表。
- `tests/second-round-widgets.test.cjs` 对 raw 常量的钉住断言。

## 退出条件

- 下一批（面板状态批）开工前复存量：若 raw/归档再度逼近新线（<16 KiB），优先启动 T-7018 多 chunk 分流，而非继续抬线。
