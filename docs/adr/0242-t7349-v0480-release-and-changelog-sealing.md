# ADR 0242：T-7349 v0.48.0 版本号晋级与发布历史结转

日期：2026-10-20  
状态：accepted  
任务：T-7349  

## 背景

在基线版本 `v0.47.6` 发布之后，小驴雷切在主分支上自驱交付了累计 14 项功能与契约工程（T-7334～T-7348）：
- 路径首字母缩写打分模糊检索（`path-acronym-model.js`）；
- Raycast 风格次级动作画板全栈架构（模型、状态机、DOM契约、装配层、主UI调度、多端E2E交互断言）；
- Obsidian 风格深入穿透检索全链路闭环（语法解析、防注入参数化SQL、端点分流、块锚定与独立去重键）；
- 原生属性视图（AV）轻量看板与闪卡复习 SM-2 推演模型；
- 极限窄侧栏（245px～340px）自适应弹性防溢出；
- 生产产物 14 项受控白名单与清洁度封板审计。

鉴于上述改动属于重大用户体验与能力升级（Minor 版本跃迁），依据 SemVer 规范，将版本号从 `0.47.6` 晋级至 **`0.48.0`**。

## 决策

1. **版本元数据全面晋级为 `0.48.0`**：
   - `package.json` 与 `plugin.json` 同步提升为 `0.48.0`；
   - `README.md` 与 `README.en-US.md` 徽标、标题、最近正式版与说明全面更新为 `v0.48.0（2026-10-20）`；
   - `ROADMAP.md` 基线结转为 `v0.48.0` 已就绪；
   - `docs/release-readiness.md` 工作树版本标记同步为 `0.48.0`；
2. **中英文更新日志历史固化**：
   - 将 `docs/CHANGELOG.md` 与 `docs/CHANGELOG.en-US.md` 中的“开发中特性”正式结转固化为 `v0.48.0（2026-10-20）` 独立发布章节，排在历史版本 `v0.47.6` 之前；
3. **构建、快照与可复现审计闭环**：
   - 执行生产全量构建，刷新 `readiness-snapshot.cjs`；
   - 执行 `repro:audit` 确保 3/3 产物跨两次独立构建二进制绝对一致；
   - 产物指标：`dist/index.js` 为 1,196,626 B（在 1170 KiB 自律线内，余量 1,454 B）；`package.zip` 为 602,644 B（在 590 KiB 仓库门禁内，余量 1,516 B）；压缩条目为 322,529 B（低于 320 KiB 门限 5,151 B）；
4. **定向契约测试与负向验证**：
   - 新建 `tests/release-version-bump-contract.test.cjs`（5/5 通过）；
   - 负向探针验证版本退化或日志倒序必定被精确拦截。

## 证据与验证

1. **定向契约测试**：`node tests/release-version-bump-contract.test.cjs` 5/5 通过；
2. **全量测试**：`pnpm test` 8940 项全部通过（净增 5 项契约）；
3. **可复现构建审计**：`pnpm run repro:audit` 3/3 产物跨两次构建 SHA-256 绝对一致；
4. **批量门禁审计**：`quality-batch-audit`（50/50）、`integration-boundary-audit`（50/50）、`release-batch-audit`（49/49）与 `current-status-audit` 全绿；
5. **发布就绪校验**：`pnpm run release:check` 验证通过。
