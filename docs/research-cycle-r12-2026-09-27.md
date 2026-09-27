# R12 聚焦调研（2026-09-27）：请求生命周期审计（僵尸请求假死模式自查）

> 轮次：R12（R11 后滚入；§8.0.12 引擎）。触发信号：链滴论坛真实故障报告《思源笔记前端假死问题报告：请求超时未取消底层连接，僵尸请求累积占满并发池》（针对 siyuan-plugin-task-horizon，https://ld246.com/article/1790325092677 ）。故障机制与本插件稳定性铁律（ROADMAP §2.3"基本路径不得被远程请求阻塞"）直接相关，故本轮把广域扫描降为辅助，主攻内部同款缺陷自查。

## 1. 外部故障机制（社区报告要点）

1. 请求洪峰逐块发起，Chromium 同主机并发上限（约 6 条）排队；
2. 内核忙时响应慢，前端 fetch 封装超时只 reject Promise，**未 abort 底层请求**；
3. 僵尸请求永久占用并发通道（报告实测单会话 2112 个、最长挂起 935 秒）；
4. 通道耗尽后所有请求入队即超时，前端不可自愈假死；
5. 修复方案：超时回调必须 `AbortController.abort()` 归还连接。

## 2. 全仓自查（10 处竞态超时逐一取证）

| 请求路径 | 位置 | 超时后 abort 底层连接 | 判定 |
| --- | --- | --- | --- |
| 统一内核分发 `fetchKernelJson` | index.ts:5458 | ✅ setTimeout 内 abort | 健康 |
| 搜索主链路（三层：页签/已开内容/全库） | index.ts:3898 入口 `beginSearch` → search-session.js:33 旧轮 abort；已开内容 3 并发×≤6 文档均透传 signal | ✅ 新一轮启动即 abort 旧轮；销毁 dispose 复用 beginSearch | 健康 |
| Agent 搜索能力 | index.ts:7644-7655 | ✅ deadline 回调 abort + unload 集合 abort | 健康 |
| 笔记本下拉 `loadNotebooks` | index.ts:2353-2368 | ✅ timeout 回调 abort 后 reject | 健康 |
| 外部组件网络（天气/RSS/iCal/HN 等） | life-widget-network.js:424/546 | ✅ timeout 回调 `controller?.abort()`，外部 signal 桥接有移除 | 健康 |
| 片段 AI SSE | snippet-studio-ai.js:247-259 | ✅ finally 恒 `run.controller.abort()` + `reader.cancel()`，interrupted/超时同路 | 健康 |
| 悬浮球宿主命令回调 | floating-ball-actions.js:127 | N/A（Promise 超时，无网络连接可 abort） | 健康 |
| 组件适配器外层超时 | home-adapters.js:197 | ⚠️ 外层超时只 reject 不 abort；但适配器内部请求走 `fetchKernelJson`（自带 1.2s~5s abort）或 life-widget-network（自带 abort）双通道兜底 | 可接受，候补池记录 |
| **文档集恢复预检 `probeDocumentSetEntries`** | index.ts:7154-7195 | ❌ **单项超时只 `resolve(null)` 不 abort**（7171-7172 纯 race）；外部批次 signal abort 有覆盖，单项 5s 超时无 | **缺陷 → T-6927** |

缺陷规模评估：预检上限 40 条 × 4 并发，单项超时 5s。内核慢时一次恢复预检可产生最多 40 个僵尸 getDoc，期间挤占内核并发通道——与社区报告同款模式（规模小但模式相同，且发生在用户主动点"恢复"的关键路径上）。修复成本低。

## 3. 广域扫描（辅助，防反复）

- **上游 3.8.6**：仍 alpha（2026-09-26 前后 alpha.6；GitHub 里程碑未关）。锚文本排序/av 新字段维持冻结不解冻。
- **Obsidian 生态**：全量插件清单（8101 个）导航关键词过滤 + 新插件榜核查，无结构性新信号；唯一新面孔 Card View Switcher（qawatake，2022 年老插件）三模式=最近 10 篇内容搜索/`'` 强制全库文件名/`;` 随机 10 篇重发现——前两者与三层搜索及查询语法（T-6802）同构已覆盖，随机重发现与零词条工作台补全（T-6807）语义重叠且真实价值弱，不采纳。
- **启动器品类**：Raycast v2 / Alfred / uTools 均为 R8 已覆盖形态，24h+ 无结构性新信号，不为凑轮次重复扫描。
- **思源论坛**：导航/切换/悬浮球类无新增痛点帖；插件类故障即本轮主信号（§1）。

## 4. 立项

**T-6927（本批交付）**：恢复预检单项超时必 abort。每项预检请求配独立 AbortController；5s 超时回调先 abort 再 `resolve(null)`；外部批次 signal 经 abort 事件桥接到单项 controller（fetch 只挂一个 signal，老 WebView 无 AbortController 时退化为原行为）。契约挂 `kernel-widgets-wiring`（T-6927 断言 + 负向验证）。

**候补池新增**：home-adapters 外层超时不 abort（底层双通道兜底，如未来出现适配器绕过统一通道直连内核时再升级为必修）。

## 5. 防反复

- 不要把"预检超时不 abort"再报为新发现——T-6927 已修复并有契约钉住。
- 不要在无新信号的 24h 窗口内重复扫描 Obsidian/启动器品类（R9/R10/R12 三次确认）。
- 3.8.6 解冻条件不变：stable 发布后才评估锚文本排序/av 新字段。
