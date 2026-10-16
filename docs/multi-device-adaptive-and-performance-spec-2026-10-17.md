# 小驴雷切 · 多端设备自适应与前端性能护栏规范 (Multi-Device & Performance Spec)

- 日期：2026-10-17
- 目标：兼顾“极致科技质感”与“多端高帧率性能”，系统化适配桌面、iPadOS 平板、iOS/Android 手机及窄侧栏 Dock。
- 对应全功能原型：[`docs/design/cyber-tactile-glance-prototype-2026-10-17.html`](design/cyber-tactile-glance-prototype-2026-10-17.html)（本地服务：`http://127.0.0.1:8765/`）

---

## 一、 多端设备自适应显示架构 (Responsive Matrix)

为了在不同尺寸屏幕上均呈现出呼吸感、不留空白、不出现横向溢出，小驴雷切看板建立了五大标准物理视口分级：

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🖥️ 桌面紧凑视窗 (Desktop, 920×390px)                                    │
│    - 12 列微马赛克基底 (行高 28px)，单值微卡占 3 列，条状占 6 列，大卡占 6 列  │
│    - 鼠标专属：3D 物理微透视倾角 + 动态双层聚光追随                       │
├────────────────────────────────────────────────────────────────────────┤
│ 📱 iPadOS 平板端 (iPad Pro 11", 834×580px)                             │
│    - 4 列自适应 Bento 布局 (行高 76px)，双手触控舒适，不被拉伸变形         │
│    - 1×1 瓦片占 1 列，2×1 条状占 2 列，2×2 密度卡占 2 列 × 2 行             │
├────────────────────────────────────────────────────────────────────────┤
│ 📲 iPhone 手机端 (iOS Dual Bento, 393×780px)                           │
│    - 2 列双拼 Bento 网格：时钟与天气自动 50% 并排，文档与任务 100% 舒展展开 │
│    - 画廊抽屉自动降级为自屏幕底部滑出的 Bottom Sheet，手指下滑即关闭      │
├────────────────────────────────────────────────────────────────────────┤
│ 🤖 Android 手机端 (Pixel / Galaxy, 412×800px)                          │
│    - 2 列双拼网格，行高 80px，符合 Material Design 48dp 触控标准          │
├────────────────────────────────────────────────────────────────────────┤
│ 📌 思源原生窄侧栏 (Native Dock, 245×540px)                             │
│    - 1 列单维极简流，小组件 100% 满宽堆叠，自动折叠非必要辅助文本          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 二、 前端性能护栏三原则 (Performance Guardrails)

在加入高质感（3D 倾斜、Spotlight、毛玻璃、微噪点）时，为彻底消灭掉帧、卡顿和发热，严密执行以下性能架构：

### 1. 指针设备物理分流（Pointer & Touch Isolation）
- **核心痛点**：在触控屏（手机/iPad）上绑定高频 `mousemove` 事件会导致滑动极其卡顿，且触控设备根本没有鼠标指针。
- **性能重构**：
  - 通过媒体查询 `@media (hover: hover) and (pointer: fine)` 严格物理隔离：**鼠标 3D 微倾斜与 Spotlight 仅在有鼠标的桌面端激活**；
  - 在移动端和 iPad 触控屏上（`pointer: coarse`），JavaScript 层面**完全跳过事件监听（0% CPU 占用）**，改用纯 CSS 的硬件加速反馈：
    ```scss
    @media (hover: none) or (pointer: coarse) {
        .glance-tile:active {
            transform: scale(0.98) !important;
            transition: transform 80ms ease !important;
        }
    }
    ```

### 2. GPU 合成层与零重排（Composite-Only & Zero Reflow）
- **渲染纪律**：
  - 所有的位移、缩放、卡片倾角，**一律仅通过 `transform` 与 `opacity` 实现**；
  - 严格禁止在 hover 或动画中篡改 `width`、`height`、`top`、`margin`、`padding` 等触发布局重排（Reflow / Layout Thrashing）的盒模型属性；
  - 对卡片声明硬件加速图层提升：
    ```scss
    .glance-tile {
        transform: translateZ(0);
        will-change: transform;
    }
    ```

### 3. RAF 硬件锁帧防抖（RequestAnimationFrame Throttling）
- **桌面高频鼠标平滑锁帧**：
  即使用户以 1000Hz 竞技级回报率的鼠标剧烈晃动，代码依然使用 `requestAnimationFrame` 严格锁帧：
  ```javascript
  let rafId = null;
  el.addEventListener('mousemove', (e) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
          // 二维倾角与坐标更新
          rafId = null;
      });
  });
  ```
  保证渲染管线永远与显示器物理刷新率（60Hz / 120Hz ProMotion）完全同步，杜绝掉帧与线程阻塞。

### 4. 0 网络开销微噪点（Inline SVG Shader）
- 采用内联数据 URI（Data URI）的 SVG `feTurbulence` 分形噪点，不产生外部 HTTP 请求，且通过 `pointer-events: none` 挂载，不参与任何滚动事件计算。

---

## 三、 本地原型即时预览入口

本规范已在全新升级的原型中 100% 完整落地，您可在浏览器中直接点击切换体验：

👉 **[点击这里体验：🌟 极致工匠级多端自适应看板原型 (支持 5 种设备视口一键切换)](http://127.0.0.1:8765/cyber-tactile-glance-prototype-2026-10-17.html)**

**控制台使用指引**：
- 点击顶部控制台的 **“🖥️ 桌面 920”**、**“📱 iPad 834”**、**“📲 iPhone 393”**、**“🤖 Android 412”**、**“📌 窄Dock 245”**，亲自感受各端布局的毫秒级无损变换！
- 在 iPhone/Android 模式下点击“编排态” ➔ “+ 添加小组件”，体验自底部滑入的 **Bottom Sheet**！
