# ADR 0218：第三方组件 Provider 7 阶段全生命周期与跨表面状态流转契约

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7292（Phase B 工作台生态准入第一阶段）
- 依据：[`docs/product-direction-2026-10-16.md`](../product-direction-2026-10-16.md) 第三分段、[`docs/widget-protocol.md`](../widget-protocol.md)、ADR 0043/0113/0135

## 背景

在推进 Phase B（工作台价值密度与生态）路线时，规划明确要求：
> “第三方生态先完成至少一个 provider 的注册、配置、失效、卸载、恢复和跨表面证据，再扩展商店分组或目录协议。组件必须显示来源、网络、凭据、缓存和不可用原因。”

此前测试虽然在 `tests/widget-provider-lifecycle-matrix.test.cjs` 中覆盖了动态重试与时钟轮询（`whenSwitcherReady`），但对于一个外部 Provider 从宿主冷启动装入、进入配置、跨端展示（桌面/侧栏/手机）、出现网络或凭据故障、提供方被停用/卸载（触发注销）、在主工作台降级为不可用占位（保留用户原有排版）、到提供方重新启用后原地恢复的全链路 7 阶段状态机，缺少端到端的跨表面消费契约守卫。

## 决策

1. **固化 7 阶段生命周期状态机 (Seven-Stage Lifecycle State Machine)**：
   - 阶段 1：**探测与注册 (Register)** —— Provider 侦测到雷切宿主或通过 `registerHomeModule` 挂载，雷切建立实例隔离并返回可调用的 `unregister` 句柄；
   - 阶段 2：**参数配置 (Configure)** —— 支持受控的 schema 校验与实例持久化，配置更改触发定向失效而非全库重绘；
   - 阶段 3：**现场消费与新鲜度判定 (Consume & Freshness)** —— 组件快照按时效标记 `fresh`（新加载）、`cached`（缓存可用）、`stale`（超时陈旧保持展示）；
   - 阶段 4：**异常退避与失败隔离 (Fail & Backoff)** —— 网络超时、401/403 权限拒绝或解析崩溃，严守单个卡片隔离，提供可操作的重试与错误代码；
   - 阶段 5：**动态卸载与资源释放 (Unregister & Teardown)** —— 提供方插件停用时调用注销句柄，雷切清空所有相关的 DOM 事件监听与轮询 Timer，实现内存 0 泄漏；
   - 阶段 6：**卡片占位退化 (Placeholder Degradation)** —— 用户已摆放的布局中，已卸载模块不直接从网格中强行删除（防止网格空洞与排版跳乱），而是优雅退化为带明确禁用原因的只读占位卡片；
   - 阶段 7：**原地无损恢复 (Recover)** —— 提供方重新启用并再次注册时，雷切基于持久化 `moduleId` 原地唤醒卡片并刷新数据，恢复原有尺寸与配置。

2. **跨表面元数据透明化标准 (Cross-Surface Metadata Transparency)**：
   卡片在桌面弹窗、侧栏 Dock 与手机全屏流转时，必须标准化暴露 5 类透明凭据元数据：
   - `source`: `built-in`（内建）/ `family`（小驴家族）/ `third-party`（第三方社区）/ `external`（外部 API）；
   - `network`: `local`（纯本地）/ `loopback`（本机回环服务）/ `remote`（远程 HTTPS）；
   - `auth`: `none`（免密）/ `token`（用户私钥）/ `host`（思源宿主鉴权）；
   - `freshness`: `fresh` / `cached` / `stale` / `error`；
   - `reason`: 故障时明确给出代码（如 `provider_unloaded`、`network_timeout`、`unauthorized`）。

## 证据与验证

- 定向契约测试：`tests/widget-provider-full-lifecycle-contract.test.cjs`，完整验证 7 阶段流转、状态退化与跨表面元数据一致性；
- 负向违规注入：
  - 注入违规 1：模拟卸载后未能清除旧模块，破坏占位退化断言，确认测试精确红屏拦截并复绿；
  - 注入违规 2：模拟跨表面元数据遗漏 `source` 标注，确认元数据完整性断言精确失败并复绿；
- 门禁自查：`npx tsc --noEmit` 0 错误；`package.zip` 体积严格守在 578 KiB 发布门禁之内；`release-readiness` 指标通过。
