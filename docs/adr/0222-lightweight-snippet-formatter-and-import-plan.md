# ADR 0222：吸收 TCOTC/snippets 经验落地零依赖代码格式化与三模式导入规划引擎

- 日期：2026-10-17
- 状态：accepted
- 任务：T-7300（第三面板与片段商店能力深化）
- 对应模块：`src/snippet-formatter.js`、`src/snippet-import-plan.js`、`src/snippet-studio-ui.js`

## 背景

在调研思源高星代码片段插件 [TCOTC/snippets](https://github.com/TCOTC/snippets)（v2.0.4）后，发现其在代码排版体验（基于 Prettier 的 `formatWithCursor`）与代码分发导入（`import-plan.ts` 中的合并、分叉与覆盖）上具有成熟的工程实践。然而，TCOTC/snippets 为此打包了庞大的 Prettier standalone（合并后插件体积达 478 KiB），若直接引入外部依赖将直接击穿小驴雷切 578 KiB（591,872 字节）的全插件发布硬门禁。此外，TCOTC 直接将用户 JS 以 `<script>` 注入 DOM 的做法存在极高系统安全风险。

## 决策

1. **研发零依赖极速 CSS 格式化器 (`src/snippet-formatter.js`)**：
   - 彻底摒弃 200KB+ 的重型 Prettier 外部依赖，采用纯原生状态机解析算法（体积仅约 2.5 KiB）；
   - 支持 CSS 选择器、大括号展开、多声明分行、冒号空格对齐与分号补齐，并完整保留 `/* ... */` 块注释；
   - 吸收 Prettier 的 `formatWithCursor` 机制：在格式化代码的同时，将原始光标在非空白字符序列上的相对偏移平滑映射到格式化后文本的对应位置，格式化时用户输入光标绝不乱跳。
2. **研发纯函数式导入规划引擎 (`src/snippet-import-plan.js`)**：
   - 吸收 TCOTC 的 `import-plan.ts` 成熟决策模型，为片段商店与第三方代码导入提供 3 种清晰策略：
     - `merge`（默认增量合并）：匹配同 ID 片段，更新名称与代码内容，**严格保留本地的 `enabled` 启用状态与列表原有排序位置**；未见过的条目作为新增导入；
     - `fork`（分叉克隆）：全部重新派生全局唯一 ID，强制置为 `enabled: false` 作为全新独立副本导入，绝不覆盖已有版本，适合社区代码二次魔改；
     - `overwrite`（镜像覆盖）：以导入集合作为唯一事实源全量替换。
3. **在第三面板中提供便捷操作入口**：
   - 在编辑区工具栏新增 `[ 🧹 格式化 ]`（`snippetFormat`）操作按钮，单键触发规范化排版与撤销栈记录；
   - 片段商店新增导入模式选择，明确向用户披露合并规划影响。
4. **坚守小驴雷切独有的核心安全壁垒**：
   - 坚决保持 ADR 0222 中确立的“JS 运行时强制沙箱阻断（`script === "blocked"`）”与“AI 代码生成行级/块级 Diff 差异审查隔离区”，不盲目开放用户任意运行未审查 JS 的通道，确保笔记数据 100% 安全。

## 证据

- 单元测试：`tests/snippet-formatter-and-import-plan.test.cjs` 7/7 全部通过；
- 负向违规注入：临时在 `merge` 模式下注入覆盖本地 `enabled` 状态的代码，测试精确红屏拦截（`AssertionError: Local enabled state must be preserved during merge`），还原后 100% 复绿；
- 生产构建与门禁：Webpack 生产构建打包成功，产物 `package.zip 577 KiB`（591,281 bytes），严格处于 578 KiB（591,872 bytes）发布门禁之内；
- 典藏版高保真原型：[`docs/design/platform-ui-masterpiece-2026-10-17.html`](../design/platform-ui-masterpiece-2026-10-17.html) 已同步合入格式化与三模式导入规划交互演示。
