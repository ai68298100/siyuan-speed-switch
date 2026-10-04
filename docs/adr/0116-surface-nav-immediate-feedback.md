# ADR 0116：SurfaceNav 使用同帧交互反馈

- 状态：已接受并完成（T-7027）
- 日期：2026-10-04
- 关联：T-7012、T-7015、T-7027

## 背景

三面板顶部的 SurfaceNav 已经由 CSS 提供 hover 和键盘焦点样式，但复用了 120ms 的通用微动效，且没有明确的按下态。导航是进入其他工作表面的高频入口，用户需要在 pointer enter、focus 和 press 后立即得到“这能操作”的反馈。

## 决策

- SurfaceNav 基础项的 `transition` 设为 `none`，hover 和 focus 状态由当前渲染帧直接呈现。
- `:active` 使用主题 accent 的 pressed 背景、边框和 1px 下压位移，表达真实按下状态。
- `:focus-visible` 在 active/current 样式之后再次声明轮廓，避免后续状态规则覆盖键盘焦点。
- `prefers-reduced-motion: reduce` 下移除按下位移；触控命中区和导航装配保持不变。

## 未采用的方案

没有用 pointer 事件脚本维护 hover 类，也没有改动 `openPlatformSurface`、入口数量或导航文案。脚本状态会增加重绘和生命周期清理面，无法改善本来属于 CSS 的状态延迟。

## 验证

- `tests/switcher-feedback-contract.test.cjs` 覆盖零过渡、pressed、focus-visible 和 reduced-motion 规则。
- 删除任一关键声明的负向注入均精确失败。
- `tests/e2e/panel-header-layout.spec.mjs` 在真实思源 3.8.6 桌面实例验证 hover、键盘焦点、真实鼠标按下和单次导航，结果 2/2 通过。

