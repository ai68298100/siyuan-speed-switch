# ADR 0111：工作台生命周期必须以组合事务验证

- 状态：已接受并完成（T-7081）
- 日期：2026-10-03
- 关联：T-7076、T-7077、T-7031、T-7034、T-7035

## 背景

T-7076 修复了工作台适配器缓存身份和读取 generation，T-7077 修复了关联内容 SWR 的归一化、淘汰和按根文档刷新代际。两个修复分别在模型测试中成立，但工作台实际还会叠加 provider 替换/注销、失败退避、强制刷新、控制器销毁、面板重建和 SWR 投影。如果只验证单个模型，旧 provider 的迟到结果仍可能写入缓存或让控制器提交旧视图。

## 决策

1. 新增 `tests/workbench-lifecycle-composition-matrix.test.cjs`，用真实 `createHomeRuntime`、`readHomeModule` 和 `createHomeModuleController`，只把 provider 读取和 DOM 容器作为可控边界。
2. 组合矩阵覆盖桌面/移动端、provider steady/replace/unregister/dispose、fresh/error/cached/late、SWR empty/cached/newer/stale、single/rebuild 面板，共 256 个场景；另加矩阵数量断言和面板重建缓存复用场景。
3. provider 替换或注销后，旧 generation 的成功和失败结果统一返回 `stale`，不得写快照缓存、失败退避或诊断；同一 provider 的 `dedupe: false` 并发读取继续返回各自结果，只有当前代际写入缓存。控制器收到 `stale` 也不得渲染旧视图。面板重建复用运行时缓存，但重新取得 DOM 所有权。
4. runtime dispose 只注销并使自身已注册 moduleId 的缓存、读取代际和诊断失效，不能清空其他 runtime 的全局共享状态；无参清理入口仍保留给明确的全局缓存清理路径。
5. 失败退避和 force 刷新继续沿用既有有界语义；SWR 继续按最新时间投影并由请求 generation 决定完成权，不因组合测试而放宽容量或时序约束。

## 未采用

- 不用只调用模型函数的伪组合测试替代真实 runtime/controller 编排。
- 不在 provider 被替换后保留旧成功结果作为“可用缓存”；旧结果的身份已经失效，继续展示会污染新 provider 的状态。
- 不把面板重建当作重新注册 provider；运行时缓存归 runtime 所有，DOM 节点归当前 controller 所有。
- 不把 JSDOM 组合证据描述为真实思源桌面窄侧栏或 Android 真机验收；真实宿主仍由 B-004/B-005 管理。

## 验证

- 工作台生命周期组合套件 **259/259**：256 个组合场景、矩阵数量断言、面板重建缓存复用和跨 runtime dispose 缓存隔离全部通过。
- 既有适配器缓存矩阵 **258/258**，证明同 provider 的 `dedupe: false` 并发读取仍保持原有结果语义；首页适配器与 runtime 定向套件合计 **75/75**。
- 负向验证：临时移除成功读取的 generation 闸门后，`desktop/replace/late` 8 个场景全部精确击中“replacement must close the old runtime generation”；文件恢复后的 SHA-256 与注入前均为 `7055A69826640567BC753E6E2B80782A84C8EE5C713A15AD5AE54269854A102A`。
- 全量 `pnpm test` **8071/8071**；`pnpm exec tsc --noEmit`、`pnpm build`、`pnpm run release:check`、`release:audit 49/49`、`quality:audit 50/50`、`integration:audit 50/50` 和 `git diff --check` 均通过。

## 边界

本 ADR 只收口本地工作台 runtime/controller/SWR 的组合提交语义，不改变 provider 协议、缓存持久化策略或真实宿主 API；Android 真机、真实窄侧栏视觉和跨窗口宿主时序仍不由 JSDOM 证据销项。
