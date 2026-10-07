# T-7153 资源趋势 probe 契约

日期：2026-10-07

本轮只交付可执行的浏览器采样契约，不宣称已经完成 T-7153 的真实持续会话验收。probe 位于测试目录，生产 bundle 不引用它。

## 采样内容

`tests/resource-trend-probe.browser.js` 在安装后包装当前页面可观察到的 API，并提供 `sample(label)` / `dispose()`：

- listener：记录安装、移除和当前仍观察到的 `(target, type, listener, capture)` 注册数。
- timer：记录 `setTimeout` / `setInterval` 的排队、触发、取消和当前 pending 数。
- animation frame：记录 `requestAnimationFrame` 的排队、触发、取消和 pending 数。
- request：记录 `window.fetch` 的开始、settle、失败和当前 in-flight 数；不替换原 Promise。
- DOM：记录当前 `document` 的元素数量。
- memory：读取 Chromium 暴露的 `performance.memory`；不可用时返回 `null`，不会用估算值代替。

`tests/e2e/resource-trend.cjs` 提供 Playwright 接线：

```js
await installResourceTrendProbe(page, "before-flow");
// 执行一次真实页面动作序列
const after = await sampleResourceTrend(page, "after-flow");
await disposeResourceTrendProbe(page);
```

应尽量在 `page` 导航前通过 `page.addInitScript` 安装。若在已有页面安装，报告的起点只覆盖安装之后的活动；监听器在安装前注册、`once`/`AbortSignal` 自动移除的细节，以及浏览器内部请求不在观测范围内。

## 当前验证

```text
node --test tests/resource-trend-probe.test.cjs
2/2 passed
```

这两个测试只证明 probe 的计数语义、dispose 清理和 `memory: null` 边界。它们没有运行真实思源页面，也没有产生 2 小时资源趋势、Android 证据或内存泄漏结论。

## T-7153 后续执行

真实 E2E 仍需单独增加固定操作序列（开关切换器、搜索、切面板、商店预览、provider 卸载/重试），在页面导航前安装 probe，按固定周期保存 JSON 样本，并记录内核版本、浏览器、插件产物和视口。至少要比较开始/中段/结束的 active listener、pending timer、in-flight request、DOM 数量和可用时的 heap；若某项不可用，保留 `null` 并标注原因。只有重复运行后持续增长且排除 GC/请求未完成等解释，才可转成泄漏修复任务。
