# ADR-0003 · 纯函数 + jsdom 测试矩阵

- **状态**：已采纳（v0.15.3 起，v0.16.0 扩展）
- **背景**：思源插件运行环境是浏览器 + siyuan 包，传统 jest/mocha 等测试框架对插件类（继承自 `Plugin`）的支持差，且启动慢。
- **决策**：三档测试矩阵：
  - **纯函数测试**：所有能脱离 `this` 的逻辑抽到 `src/util.js`（plain JS，零依赖），用 Node 22 内置 `node:test` + `node:assert/strict` 跑。当前 6 个函数 / 23 用例 / ~1.6s 全过。
  - **常量自洽性测试**：`tests/constants.test.cjs` 校验 MIN/MAX 范围、debounce 时长合理性。3 用例 / 5.7ms。
  - **UI 烟雾测试**：`tests/mobile-card-smoke.cjs` 用 jsdom 加载 `dist/index.css` + SiYuan mobile base CSS + litheness sprite，验证 CSS 计算样式不变量。7 用例。
- **规则**：
  - `util.js` 严禁 `import` 任何模块（思源包 / TS 类型）—— 保持可在纯 Node 环境 require
  - 测试文件以 `.cjs` 后缀；不引入 jest/mocha/vitest（避免 ts-jest / esbuild 配置链）
  - 烟雾测试 `package.json` 加 `test:smoke` 命令，要求先 `pnpm build`
- **不做什么**：
  - 不做 E2E（启动真实思源）—— 太重、CI 跑不动
  - 不做 TS 单元测试 —— 编译产物是 JS，测源码意义不大
  - 不做覆盖率门槛 —— 当前插件规模下人工 review 性价比更高
- **代价**：测试"不能"覆盖 plugin 类的成员方法（如 `renderSidebarPanel`）；通过把这些方法抽成纯函数（接受 element 参数而非 `this`）来扩大覆盖。