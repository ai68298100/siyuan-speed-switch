# 小驴雷切 · 现代科技感与深邃质感设计系统规范 (Cyber-Tactile Design Spec)

- 日期：2026-10-17
- 目标：将第二面板（看板）、小组件画廊抽屉与每个组件本体从“普通网页表单”提升至媲美 Linear、Raycast、macOS 的顶尖工业级质感与现代科技美学。

---

## 一、 材质与光影系统 (Materials & Lighting)

### 1. 极深暗底与极光漫射 (Deep Void & Aurora Mesh)
- **基底色**：不是死沉沉的纯黑 `#000`，而是深邃的航天级钛黑 `#0b0d13` 与深灰 `#131722`。
- **漫反射光晕（Subtle Ambient Glow）**：
  在面板背景底层叠加两处低烈度（透明度 4%~7%）、大半径（380px）的径向渐变：
  ```css
  background: 
    radial-gradient(circle at 15% 20%, rgba(103, 88, 216, 0.08) 0%, transparent 60%),
    radial-gradient(circle at 85% 80%, rgba(45, 212, 191, 0.06) 0%, transparent 55%),
    #0d1017;
  ```
  带来如深空探索般的深邃空间层次与呼吸感。

### 2. 1px 亚光微倒角切光 (Subtle Rim Light)
顶级科技软件的质感核心在于“对边界反光的精准控制”。
卡片杜绝使用粗糙生硬的 1px 实线，而是采用内倒角高光 + 微暗投射阴影：
```scss
// 深色模式下金属切边质感
--tile-rim-light: inset 0 1px 0 0 rgba(255, 255, 255, 0.11), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
--tile-drop-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 20px rgba(0, 0, 0, 0.18);
border: 1px solid rgba(255, 255, 255, 0.08);
```

### 3. 光标磁吸微高光追随 (Radial Spotlight Border)
当鼠标划过小组件卡片或画廊抽屉时，卡片边缘随光标二维坐标实时渲染出微弱的白色/主题色聚光点：
```css
background: radial-gradient(120px circle at var(--mouse-x) var(--mouse-y), rgba(158, 145, 255, 0.12), transparent 80%), var(--tile-bg);
```

---

## 二、 精密排版与数字美学 (Precision Typography)

### 1. 等宽精密数字 (Tabular Tech Figures)
所有时间、温度、待办数量、百分比、倒数天数，强制声明等宽特性，彻底消灭数据刷新时的文字微跳动：
```scss
font-variant-numeric: tabular-nums;
font-feature-settings: "cv02", "cv03", "cv04", "cv11";
letter-spacing: -0.03em;
```

### 2. 呼吸微光点 (Pulsing Ambient Indicator)
将呆板的静态状态圆点升级为带有 2.6s 缓慢呼吸光环的精密仪器指示点：
```scss
.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--b3-theme-success);
  box-shadow: 0 0 8px color-mix(in srgb, var(--b3-theme-success) 60%, transparent);
  animation: pulse-ring 2.6s infinite cubic-bezier(0.4, 0, 0.6, 1);
}
@keyframes pulse-ring {
  0%, 100% { opacity: 0.85; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.92); }
}
```

### 3. 机械键帽微缩 (Tactile Keycap Badges)
所有的快捷键标签（`⌘K`、`Esc`、`Tab`）做成微小的微机械键帽：
带 1px 上边缘白线反光、深色渐变底、等宽小字，宛若面板上嵌着的真实微型物理键。

---

## 三、 动态物理反馈系统 (Tactile Micro-Interactions)

1. **弹簧级抽屉动效 (Spring Sheet Curve)**：
   画廊抽屉开启与收起采用物理贝塞尔曲线：`cubic-bezier(0.16, 1, 0.3, 1)`，时间锁定在 `240ms`，既极度干脆利落，又无生硬机械感。
2. **交互勾选物理反馈**：
   在今日待办卡片中打勾时，复选框产生 `scale(0.88)` 到 `scale(1)` 的微回弹，打勾图标带微弱缩放拉伸，划线文本以平滑过渡渐入。
3. **卡片微悬浮把手**：
   编排模式下，尺寸切换与移除把手带有亚克力毛玻璃背景（`backdrop-filter: blur(6px)`），不破坏卡片本身的美学完整度。
