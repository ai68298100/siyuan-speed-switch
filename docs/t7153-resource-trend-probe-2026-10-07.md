# T-7153 资源趋势 probe 契约

日期：2026-10-08

本轮交付可执行的浏览器采样契约和隔离真实压力运行，并修复商店重复重绘的监听器生命周期。它还没有完成 T-7153 的长时验收。probe 位于测试目录，生产 bundle 不引用它。

## 采样内容

`tests/resource-trend-probe.browser.js` 在安装后包装当前页面可观察到的 API，并提供 `sample(label)` / `dispose()`：

- listener：记录安装、移除和当前仍观察到的 `(target, type, listener, capture)` 注册数，并把仍连接在文档树/`window`/`document` 上的注册与已脱离 DOM 的观察记录分开；探针用 `WeakRef` 保存 target，避免诊断本身阻止旧 DOM 回收。脱离 DOM 的记录不能直接当作泄漏。
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

这两个测试证明 probe 的计数语义、dispose 清理、WeakRef 生命周期和 `memory: null` 边界。

真实隔离压力运行（2026-10-07）使用思源 3.8.6、插件 0.44.1、Chromium headless、专属端口 6837 和背景编排器临时工作区，运行时长约 233 秒：

- 运行 `20261007132726-21184-5874f0`，重复切换器→搜索→工作台→商店预览→收敛 **120 轮**；工作台和商店各成功打开 120 次，页面异常 0。
- 最终 observed fetch in-flight 为 0，pending timer 为 2，pending animation frame 为 0；DOM 元素数 `1728→1747`，Chromium 暴露的 heap 读数本轮固定为 `10000000`，不作为泄漏证据。
- 初版报告发现商店反复重绘产生大量 detached listener 观察值；归因后在 `src/home-store-ui.ts` 增加 render-scoped disposer，搜索、Tab、卡片、尺寸、重试、批量和移动端返回监听在重绘前及 Dialog 销毁时释放。结构测试见 `tests/home-store-render-listeners.test.cjs`。
- 重新运行后 connected listener 为 `271→313`；剩余 detached 记录主要来自切换器/Dialog 子树的宿主重建。探针不持有强引用，故不把 detached 计数直接解释为内存泄漏；若要继续处理，应单独做 surface A/B 和生命周期归因。

本轮已给 E2E 补充真实目录卡片重绘时必须先移除旧渲染监听、Dialog 关闭后插件渲染监听活动数归零的断言。约 233 秒的操作压力没有依据证明等价于 2 小时；heap 读数固定且当前未采样插件缓存，因此不把这次运行标为 T-7153 完成。provider 卸载/重试还需要隔离 provider 夹具。

## 2026-10-08 provider 与缓存趋势复验

新增 `getHomeAdapterResourceStats()`，只返回快照、退避、in-flight、generation、invalidated generation 和诊断条目数量，不返回缓存 key 或 provider 内容；`home-runtime` 透出同一受限计数供隔离诊断使用。provider fixture 通过公开 `registerHomeModule` / `readHomeModule` 覆盖成功、缓存命中、失败退避、pending、卸载、迟到回包、重新注册和恢复读取。

- 运行 `20261007181410-29436-80d19c` 在 3.8.6 隔离内核、端口 6867 完成 6 轮工作台/商店循环，并完成 provider 生命周期夹具；页面测试通过。
- fixture 观察到首次成功、缓存命中、失败后 `backoff`、卸载后的旧请求 `stale`；卸载后 `snapshotCacheEntries/failureBackoffEntries/inFlightReads/readGenerationEntries/invalidatedReadGenerationEntries` 全为 `0`，重新注册后可成功读取，最终再次卸载五项仍全为 `0`。
- 6 轮稳定样本的缓存计数为 `3,3,3,3,3,3`，generation 计数为 `3,3,3,3,3,3`，两个范围均为 `0`；这说明本轮观察面内没有持续增长，不代表全插件内存无泄漏。
- 新增负向纯逻辑测试覆盖 `pending old → clearHomeSnapshotCache() → 同 key 新读 → 旧回包`，确认旧回包为 `stale` 且不能污染新缓存；这是修复前未覆盖的清理代次竞态。
- 反向注入把清理时的 generation 推进改为不推进后，`home adapters: global cache clear invalidates an older pending response` 按预期失败；源码随后按原字节恢复。

## 2026-10-08 定向重绘复验

为直接覆盖 `renderStore()`，E2E 在商店中点击目录卡片触发真实重绘；不通过会持久化排序的操作触发重绘。probe 增加 `sw-home-store__*` 节点监听的显式 add/remove 计数，并将完整 breakdown 改为按需采样，避免逐轮生成宿主全量 listener 明细。

- 运行 `20261007171037-38896-64a829` 在 3.8.6 隔离内核、端口 6837 完成 12 轮工作台/商店循环与 12 次真实重绘，时长约 105 秒。
- 目录节点 listener 累计 `16020 add / 16020 remove`，最终活动数 `0`；connected listener `313→313`，DOM `1741→1749`；最终 pending timer/frame/fetch 均为 `0`，页面异常 `0`。
- 负向运行 `20261007162443-39152-aaeb4e` 将 `renderStore()` 的 disposer 调用注入为 no-op，E2E 在目标断言“商店每次真实重绘前必须显式移除上一轮渲染监听”失败；源码已按 SHA-256 `1ec627196ad10c28d2195de4ff93f508b78a410a8eb8d1297b427e060a59ef34` 还原。
- 另一次 120 轮原始隔离压力仍保留作广义循环样本；它不触发定向卡片重绘，不替代本次 12 轮生命周期验证，也不代表 2 小时等价时长。

## T-7153 后续执行

T-7153 保持 `in_progress`。下一轮仍需要增加有依据的 2 小时或等价长会话证据，并决定是否扩大到其他插件级缓存观察面；本轮的缓存计数、provider 卸载/重试和清理竞态修复作为已完成的子交付。
