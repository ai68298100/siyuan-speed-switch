# ADR-0002 · 集中常量到 `src/constants.ts`

- **状态**：已采纳（v0.16.0）
- **背景**：v0.15.6 前 magic numbers 散落在 `src/index.ts` 顶部 `const MRU_KEY = ...` 块和函数体中（如 `180` 防抖、`500` 落盘、`240` 回顶阈值、`480/1920` 弹窗宽度边界等）。
- **问题**：
  - 同一 magic value 在多处出现（`360` 出现 4 次、`180` 出现 3 次），调整时易遗漏
  - 范围 MIN/MAX 配对不显式，新人难看出边界
  - 命名不统一（`THUMB_BATCH` 是 const、`500` 是字面量）
- **决策**：新建 `src/constants.ts`，按域分组：
  - `_MS`：时间（毫秒）—— `SEARCH_DEBOUNCE_MS`、`SAVE_DEBOUNCE_MS`、`FAB_HIDE_DELAY_MS`...
  - `_PX`：长度 / 像素 —— `DIALOG_WIDTH_MIN_PX`、`BACK_TOP_THRESHOLD_PX`、`SIDEBAR_DEFAULT_WIDTH_PX`...
  - `_MIN / _MAX / _LIMIT`：数量范围
- **规则**：
  - 同一域的 MIN/MAX 必须成对出现，便于阅读
  - 注释里说明"为什么是这个值"（如 `SEARCH_DEBOUNCE_MS = 180`：兼顾响应感与负载）
  - 不放已存在的 storage key 常量（仍留在 index.ts 顶部以减少 churn）
- **测试**：新增 `tests/constants.test.cjs` 校验范围自洽（MIN<MAX）作为防回归网。
- **代价**：跨模块 import 增加一行；可接受。