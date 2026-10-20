# ADR 0243：T-7350 v0.48.0 发布产物封验、散列固化与 Release 说明归档

日期：2026-10-20  
状态：accepted  
任务：T-7350  

## 背景

在 T-7349 完成版本晋级（`v0.48.0`）与中英文更新日志历史固化后，必须对最终发版产物进行严密的物理字节核对、密码学散列计算（SHA-256）与正式发布说明（Release Notes）归档，确保本地生成的交付物具备不可篡改性与完全可追溯性。

## 决策

1. **产物物理规格与 SHA-256 密码学散列固化**：
   - `package.zip`：**602,644 字节**，SHA-256：`a6b09cc77ff2796545a0b710ac4231fa3a7b86c09a9c7b41a32d69965d77e712`（在 590 KiB 仓库门禁内，健康余量 1,516 字节）；
   - `dist/index.js`：**1,196,626 字节**，SHA-256：`3f6c7d4f5a87d89c7ff40cff0946c8a72773fbd6bd25f0221445d27699a706b2`（在 1170 KiB 自律线内，健康余量 1,454 字节）；
   - `dist/index.css`：**440,172 字节**，SHA-256：`d43b86ec7ce464565c59e6e48cee7ea546d05c25345619f20aa2bd64417e9b99`；
   - `icon.png`：**18,376 字节**，尺寸严格为 160x160 像素，SHA-256：`3104c5a8c0e2c95db78b6b0a711cfda1709bda93405f2e83346247fc70b6f565`（完全符合思源集市小于 20 KB 限制）；
   - `preview.png`：**54,378 字节**（53.1 KiB），SHA-256：`3ea27ab4559bc7e70b35d4c02a82e9073df4e51a3bb8bbd9eb5f3b759752baf4`（符合思源集市小于 200 KB 限制）；
2. **Release 说明归档**：
   - 包含深入穿透检索（`:大纲`、`^正文块`）、Raycast 风格次级动作画板（`⌘K` / `Ctrl+K`）、多端 E2E 交互与极限窄侧栏弹性自适应防溢出；
3. **定向核验契约测试（`tests/release-candidate-hash-audit.test.cjs`）**：
   - 4 项自动化契约断言，并在原生环境验证解压包内 `plugin.json` 版本与中央目录条目数；
   - 负向探针验证篡改物理大小或伪造版本必定触发精确红拦截。

## 证据与验证

1. **定向契约测试**：`node tests/release-candidate-hash-audit.test.cjs` 4/4 通过；
2. **负向注入验证**：篡改 zip 大小为 `99999999` $\to$ 用例精确拦截报错；还原后复绿；
3. **全量测试**：`pnpm test` 8944 项全部通过；
4. **批量门禁审计**：`quality-batch-audit`（50/50）、`integration-boundary-audit`（50/50）、`release-batch-audit`（49/49）与 `current-status-audit` 全绿；
5. **发布就绪校验**：`pnpm run release:check` 验证通过。
