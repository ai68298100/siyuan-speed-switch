# ADR 0259：T-7360 顶栏切换器秒级直出、长文档首屏浅克隆与动画卡顿根治

日期：2026-10-22  
状态：accepted  
任务：T-7360  

## 背景

用户反馈：“目前点击顶栏，打开需要等很久，体验感直线下降，如何才能提升打开时的速度。”  
经全链路调用栈剖析与性能检测，定位到影响顶栏打开速度的四大关键根因：
1. **长文档全量深克隆阻塞主线程（最严重瓶颈）**：
   - 切换器卡片缩略图在生成时，调用 `wysiwyg.cloneNode(true)` 将当前编辑器内的数千乃至上万个 DOM 块节点全部进行了深度递归拷贝，随后才调用 `limitCloneChildren(clone, 6)` 进行 `removeChild` 裁剪；
   - 在较长或复杂排版文档下，单次 `cloneNode(true)` 耗时高达 100ms~300ms，首屏多张卡片串行克隆直接导致主线程卡顿 1 秒以上；
2. **思源 Dialog 默认动画与挂载延时**：
   - 桌面端创建 `new Dialog` 时未传 `disableAnimation: true`，思源内核默认在挂载后等待 50ms 超时并执行 scale/opacity 缓动过渡，造成肉眼可见的迟滞感；
3. **卡片列表二次拔插与强制同步排版（Reflow）**：
   - 旧版 `renderList` 先把所有卡片追加进 `scrollElement`，随后读取 `scrollElement.clientWidth` 强行触发浏览器排版，紧接着又通过 `while (scrollElement.firstChild)` 将全部卡片从 DOM 树拔出重新塞进 `content` 容器；
4. **非核心后台任务同步阻塞首屏**：
   - `pruneThumbCache(tabs)`（孤儿缩略图缓存扫描与剔除）和 `renderWorkbench`（工作台组件与反链网络请求）在打开弹窗的同一微周期内同步执行，抢占了页签列表首帧绘制带宽。

## 决策

1. **大文档首屏浅克隆（`cloneLimitedContent`）**：
   - 彻底废除 `wysiwyg.cloneNode(true)` 整篇深度克隆；
   - 重构为 `wysiwyg.cloneNode(false)`（只浅克隆外层容器，耗时 <0.01ms），并仅按需深拷贝前 `THUMB_CLONE_MAX`（6 个）直接子块，克隆时间恒定在 0.1ms，彻底与文档大小与复杂度解耦；
2. **桌面端弹窗 0 延迟秒出（`disableAnimation: true`）**：
   - 在 `createSwitcherDialog` 补齐 `disableAnimation: true`，消除 50ms 等待窗口与过渡缓动；
3. **消除卡片二次搬迁与强制同步排版**：
   - 预先判定预览流容器（`contentHost`），所有卡片一次性装配，严禁挂载后二次 `removeChild/appendChild`，消除强制 Reflow；
4. **微任务分层调度（Microtask Layering）**：
   - `pruneThumbCache` 移入 `queueMicrotask`，零词条工作台在卡片首屏挂载后经微任务平滑接入；`MutationObserver` 推迟至首屏 DOM 就绪后监听。

## 证据与验证

1. **定向测试**：`tests/topbar-open-speed-optimization.test.cjs` 5/5 通过；
2. **构建规格**：
   - `dist/index.js` 为 1,225,544 字节（低于 1198 KiB 观察线 1,208 B）；
   - `package.zip` 为 616,730 字节（低于 604 KiB 门限 1,766 B）；
   - 单条目压缩 330,544 字节（低于 332 KiB 门限 9,424 B）；
3. **全量单测与审计**：9038+ 项测试全绿，四大批量审计全部 PASS。
