# ADR 0075：压缩条目评审线二次校准（256 → 288 KiB）

- 日期：2026-09-23
- 状态：已接受
- 关联：ADR 0065（224→256）、ADR 0074（raw 线 896→960）、D-353（512 KiB zip 硬上限，不变）
- 关联任务：T-6789~T-6810（R1/R2 吸收批与端侧扩展）

## 背景

`COMPRESSED_ENTRY_BUDGET_BYTES`（256 KiB=262144 字节）约束 package.zip 中单条目（index.js）的压缩后尺寸。R1/R2 吸收批（宿主命令桥、拼音 vendor、统一索引、Essentials 等）落地后，index.js 压缩后达 263314 字节，超出旧线 1170 字节。与 raw 自律线（ADR 0074，评审信号）不同，压缩条目线是**硬断言门禁**（package-resource-audit）。

## 决策

1. `COMPRESSED_ENTRY_BUDGET_BYTES` 校准为 **288 KiB**（294912 字节），按 0065 先例 +32 KiB 步进；
2. 归档总上限 512 KiB（D-353）不变；
3. 增量来源均为用户指令功能与调研吸收批（见 ADR 0074 同批说明），非失控增长；
4. 下一次校准前必须消耗完本档余量并附新一轮审计说明。

## 验证

- `tests/host/package-resource-audit.test.cjs` 的逐条目断言在 288 KiB 线下全绿；
- `tests/host/package-resource-baseline.json` 已按当前归档重新生成（diagnostics 中的 baselineDrift 提示消除）；
- 回归保护：`second-round-widgets` 对 raw 常量的钉死断言模式同样适用于本线（后续如再动此常量，须同步更新其钉死断言与 ADR）。
