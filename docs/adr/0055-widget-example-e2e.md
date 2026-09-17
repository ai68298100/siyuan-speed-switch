# ADR 0055：第三方插件端到端接入示例（P3-2）

- 日期：2026-09-17
- 状态：已接受（T-6298）
- 范围：`docs/widget-example/` / `tests/widget-example-e2e.test.cjs`

## 背景

`docs/widget-protocol.md`（v2.3+）与 `docs/widget-example/example-module.js`（复制模板）
此前只有**静态契约门禁**（`tests/widget-example-contract.test.cjs`）：校验示例使用的
字段、configSchema 类型与点击前缀在生产白名单内。但"模板能不能真正跑通生产链路"
没有任何证据——第三方开发者照抄模板后若在运行时踩坑（设备清单、缓存生命周期、
token 失效），插件侧无法提前发现。dev-plan P3 第二项即"第三方插件端到端接入最小示例"。

## 决定

**不新增协议字段、不改产品代码**，把缺口定位为"运行时证据"，新增端到端测试：

1. **宿主 harness**（测试文件内）：镜像 `index.ts registerHomeModule` 的可观测行为——
   `homeModuleOpens` / `homeThirdPartyIds` / `homeModuleChangeListeners` 三套簿记，
   注销句柄**返回 void**（与生产一致）。
2. **把模板当真实第三方插件**跑完整链：
   `registerExampleHomeModule(harness, myPlugin)` → `listModules`（三设备清单 +
   协议元数据 readOnly/refreshOn/sizes/configSchema）→ `read`（有界快照、
   command/value/href 三种点击语义、设备感知标题）→ `buildHomeModuleView` → `unregister`。
3. **运行时语义逐项钉住**：
   - 替换注册后**旧句柄失效**（runtime token 安全，以可观测状态断言）；
   - 注销幂等（重复调用为无操作）；
   - 注销清除快照缓存（重新注册后首次读取 `cached: false`）；
   - `open` 回调经宿主绑定、注销后不再触发；
   - 无宿主/宿主过旧时**安静降级**返回 null。

## 过程教训（当场踩中，均已修正）

1. **断言层级错位**：首版在宿主句柄上断言布尔返回值（`unregister() === true`），
   而 `index.ts` 的宿主闭包返回 void。harness 镜像生产是对的，**错的是断言**——
   契约测试必须断言"生产真实暴露的东西"，不能断言"我希望它暴露的东西"。
   → 宿主层改用可观测状态断言；布尔语义只在 runtime 层（已有测试）覆盖。
2. **`normalizeHomeViewResult` 的入参是完整 read 结果**（从 `source.snapshot.items`
   取数），误传 `result.snapshot` 会静默得到 0 条目——测试当场暴露而非上线后暴露，
   正是本节点要补的证据价值。

## 验证

- 新增 6 项端到端测试（注册/读取/视图/替换/生命周期/open 与降级）。
- **负向验证三件套 PASS**：向示例注入外科式缺陷（`supportedDevices` 收窄为
  `["mobile"]`，静态契约测试不测设备故不受波及）→ 基线 10/10 绿 → 注入后**精确**
  4 项 e2e 失败、兄弟契约测试 0 失败 → md5 字节级还原 → 复跑 10/10 绿。
- `verify:release` 全链绿（EXIT=0）：tsc 0 错误、5890/5890、80 项 smoke PASS。
- 计数同步：测试 5884→5890、测试文件 173→174；产物 `index.js` 632957 /
  `index.css` 146536 / `package.zip` 321021（README 计数变化 +76 bytes），
  双语 README 与 release-readiness 已对齐；README 改动后重建，zip 尺寸收敛不变
  （同字节数字替换，"记录即失效"耦合被字长不变性吸收）。
