# ADR 0118：移动端缩略图设置与旧 FAB 兼容说明

- 状态：已接受
- 日期：2026-10-04
- 关联任务：T-7000

## 背景

`mobileThumbHeight` 已有默认值、48–200 px 归一化和移动切换器消费路径，但设置页只有移动列数入口。用户无法调节移动卡片缩略图高度，也看不到旧版 FAB 字段如何与当前悬浮球配置衔接。

## 决策

1. 在“手机端 → 卡片布局”组增加一个共享 range+number 控件，滑块和数值输入使用同一 48–200 px 边界；滑块输入即时同步，数值输入在 change 时归一化并保存。
2. 把 `mobileColumns` 与 `mobileThumbHeight` 一起登记到该组的恢复默认按钮，恢复仍经过既有 `resetSettingsToDefaults`/撤销管线。
3. 在兼容组保留现有 `fabEnabled` 兼容写入，同时显示迁移提示，说明当前开关映射到 `floatingBall.enabled.mobile`；不做破坏性字段迁移。
4. range 控件在 560 px 以下改为可收缩布局，数值输入保留固定可触控宽度；双语标题、说明、迁移提示均进入现有 i18n key 集。

## 结果

- `tests/mobile-settings-contract.test.cjs` 定向 **5/5**；滑块接线、input/change 数值同步、重置注册、双语提示和窄屏 CSS 均直接取生产源码/资源验证。
- 三组违规注入（移除 range 接线、把 range 改成 number、移除移动重置注册）均精确失败并逐字节恢复。
- `tests/e2e/mobile-settings.spec.mjs` 使用真实思源 3.8.6 移动前端和 iPhone 13 视口 **1/1**，验证设置入口、48–200 边界、重置按钮、迁移提示和 390 px 不溢出。
- 全量 `pnpm test` **8300/8300**、`tsc`、生产构建、发布检查、质量审计 **50/50** 和集成审计 **50/50** 通过；最终产物为 `dist/index.js` 1166601、`dist/index.css` 295526、`package.zip` 576085 bytes。

## 边界

该 E2E 是真实思源移动前端的浏览器视口证据，不等同 Android 真机触控、旋转和系统输入法验收；后者仍归 B-004。最窄真实侧栏视觉仍归 B-005。
