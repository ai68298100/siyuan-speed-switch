# ADR 0219：组件商店分组与目录协议扩展（来源、网络、鉴权透明化）

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7293（Phase B 工作台生态准入第二阶段）
- 依据：[`docs/product-direction-2026-10-16.md`](../product-direction-2026-10-16.md)、ADR 0057、ADR 0218

## 背景

在 Phase B 中，工作台生态建设遵循严格的准入秩序：在 T-7292 固化了 Provider 7 阶段全生命周期状态机之后，下一步必须解决组件商店（画廊/目录）在面对多样化来源时的“透明化”问题。用户在添加或浏览组件时，必须一眼看清：
1. 这个组件来自哪里（内建核心、小驴家族、第三方插件还是外部 Web API）？
2. 是否需要联网（纯本地运算、本地回环还是公网请求）？
3. 是否需要提供私密凭据（免密、需要用户输入 Token、还是依赖思源宿主账号）？
4. 如果当前不可用，确切的原因是什么，用户如何自愈？

此前 `src/home-source-model.js` 仅按 `pluginId` 进行单一维度的来源分组，缺少对网络依赖与鉴权要求的分组与统计透出，未能完全满足 Phase B 的准入要求。

## 决策

1. **多维透明元数据目录扩展 (Transparent Directory Protocol)**：
   在组件目录模型中规范化 4 档来源属性与 3 档网络/鉴权枚举：
   - `source.kind`: `builtin`（思源/雷切核心）/ `family`（小驴系列插件）/ `plugin`（第三方社区插件）/ `external`（外部标准 Web 服务）；
   - `network`: `local`（纯离线本地）/ `loopback`（本机服务回环）/ `remote`（公网安全 HTTPS）；
   - `auth`: `none`（无凭据依赖）/ `token`（用户私钥）/ `host`（宿主原生登录）。

2. **在 `home-source-model.js` 扩充聚合与过滤纯函数**：
   - `buildHomeStoreTransparencySummary(entries)`：一键聚合输出当前可用组件集合在各来源、网络与鉴权维度的数量分布与不可用原因汇总；
   - `filterHomeStoreEntriesByTransparency(entries, filter)`：支持按来源属性、离线安全等级进行纯函数无损过滤；
   - 保持 0 状态副作用与稳定确定性字典序排列。

3. **操作回执与不可用原因透出**：
   未安装或故障的组件必须明确输出规范化的 `reasonCode`（如 `provider_unloaded`、`network_timeout`、`unauthorized` 等），并关联清晰的用户下一步自愈指引，绝不显示含糊的“组件失效”。

## 证据与验证

- 定向契约测试：`tests/store-grouping-and-directory-protocol.test.cjs`，全量覆盖多维聚合统计、按网络/来源维度过滤、排序稳定性与负向违规注入；
- 门禁自查：`npx tsc --noEmit` 0 错误；生产构建体积严格守在 578 KiB 发布门禁之内；`release-readiness` 指标通过。
