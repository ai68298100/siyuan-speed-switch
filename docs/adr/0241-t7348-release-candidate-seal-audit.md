# ADR 0241：T-7348 版本候选封板演练、产物校验与发布清单审计

日期：2026-10-20  
状态：accepted  
任务：T-7348  

## 背景

在 T-7334 至 T-7347 连续完成了深入穿透检索、次级动作画板、属性看板与闪卡模型、多端端到端交互契约及窄侧栏自适应对账之后，主分支积累了完整的特性集。

在进入正式发布（Tag / GitHub Release）前，必须进行严格的**版本候选封板演练（Release Candidate Seal Audit）**：
1. **打包归档资产白名单**：确保 `package.zip` 内只包含受控的 14 个生产必需文件，严禁任何构建脚本、测试套件、开发配置或临时文件泄漏；
2. **多源元数据一致性**：确保 `plugin.json`、`package.json` 与文档记录的版本号、插件名、作者、GitHub URL、最低宿主版本等一致；
3. **生产清洁度与安全隔离**：确保生产构建生成的 bundle（`dist/index.js`）完全剥离 `console.log`，严禁残留任何开发者物理工作区绝对路径（如 `D:/`、`C:/Users/` 等）与未脱敏信息；
4. **门禁与契约固化**：以零第三方依赖的原生 Node.js 解析 zip 中央目录（Central Directory），建立不可绕过的封板门禁。

## 决策

1. **确立 package.zip 打包产物 14 项受控白名单**：
   - 包含根目录及资源：`index.css`, `index.js`, `dist/snippet-studio.js`, `icon.png`, `preview.png`, `README.en-US.md`, `README.md`, `docs/architecture.svg`, `docs/interface-map.svg`, `docs/component-store-guide.md`, `docs/agent-document-context-m2.md`, `plugin.json`, `i18n/en.json`, `i18n/zh-CN.json`；
   - 严禁出现未授权的临时文件、构建脚本或非发布源码；
2. **实现零依赖 Central Directory 解析器与契约断言**：
   - 编写 `tests/release-candidate-seal-audit.test.cjs`，利用 Node.js `Buffer` 原生寻址 EOCD（`0x06054b50`）与中央目录头（`0x02014b50`），直接枚举 zip 归档中的条目；
   - 断言文件数量、白名单集合、元数据一致性与 bundle 清洁度；
3. **负向注入验证机制（AGENTS 门禁要求）**：
   - 注入 1：注入未授权文件时，白名单校验精确拦截并抛出 `AssertionError`；
   - 注入 2：伪造版本不匹配时，元数据对齐断言精确拦截并抛出 `AssertionError`；
   - 还原后 SHA-256 校验一致并复绿 4/4；
4. **包体预算无影响**：
   - 本任务属于发布审计与门禁测试套件，未修改 `src/` 代码，生产 bundle 与归档大小完全维持不变。

## 证据与验证

1. **定向契约测试**：`node tests/release-candidate-seal-audit.test.cjs` 4/4 通过；
2. **代码清洁度检查**：`console.log` 存在性为 `false`，`D:/` 绝对路径存在性为 `false`；
3. **TypeScript 编译检查**：`pnpm exec tsc --noEmit` 0 错误；
4. **批量门禁审计**：`quality-batch-audit`（50/50）、`integration-boundary-audit`（50/50）、`release-batch-audit`（49/49）与 `current-status-audit` 全部全绿；
5. **发布就绪校验**：`pnpm run release:check` 验证通过。
