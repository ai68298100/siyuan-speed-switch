# 小驴雷切 · 维护者贡献、开发流水线与排障手册 (Contributing & Maintainer Guide)

感谢参与小驴雷切（LvSpeed Switch）的维护与开发。本仓库同时驱动**切换器（Switcher）、工作台（Workbench）、片段实验室（Snippet Lab）与悬浮球（Floating Ball）**四大交互表面，并承载 50+ 个开箱即用的小组件与生态协议。

为了保证生产质量、包体预算和架构一致性，所有贡献者和 AI 协作会话均须遵守本手册规范。新贡献者**无需通读全部历史账本与 ADR**，遵循本文档定义的标准流水线即可提交可信的高质量改动。

---

## 一、 真实工具链与环境契约

小驴雷切采用严格锁定的现代化前端与测试工具链，禁止随意引入重型第三方依赖：

- **Node.js**：`^22.22.2 || ^24.15.0 || >=26.0.0`（严格遵守 `package.json` 的 `engines` 字段）；
- **包管理器**：`pnpm@12.5.1`（安装必须使用 `pnpm install --frozen-lockfile`）；
- **构建环境**：Webpack 5 + Sass + TypeScript 5.5（原生构建，禁止为了小功能引入 React/Vue 等重型运行时）；
- **测试框架**：Node.js 原生 Test Runner（`node:test` + `node:assert/strict`）+ Playwright（E2E）。

---

## 二、 目录结构与神圣只读边界

仓库严格遵循**单调递增账本**与**归档冻结原则**：

| 目录 / 文件 | 权限纪律 | 说明与作用 |
| :--- | :--- | :--- |
| **`docs/archive/`** | ⛔ **绝对只读，严禁追加！** | 历史旧任务、旧决策的归档库。任何新任务、新证据不得写入此目录。 |
| **`docs/current-status-index.json`** | 📝 **全局唯一状态真理源** | 记录当前在制任务 `currentTask`、各任务依赖与证据链。任务状态流转：`planned ➔ in_progress ➔ completed`。 |
| **`docs/dev-plan-*.md`** | 📝 **当期开发账本** | 记录当期任务的背景、决策、证据与下一步（如 `docs/dev-plan-2026-10-06.md`）。旧账本只读。 |
| **`docs/adr/`** | 📝 **架构决策记录** | 任何非显然的技术取舍、架构演进均须建立新 ADR（`0NNN-*.md`）。已接受的旧 ADR 不可篡改。 |
| **`src/`** | 💻 **生产代码** | 严格遵守设计系统 Token 约束与模块分层，禁止任意跨层直接篡改全局 DOM。 |
| **`tests/`** | 🧪 **自动化测试与门禁** | 包含单元测试、契约测试、UI 冒烟与刻度门禁。 |

---

## 三、 日常开发与自动化验证流水线

改动代码后，请按以下阶段逐步执行本地验证：

### 1. 基础编译与类型检查
```bash
pnpm exec tsc --noEmit
```
确保无任何 TypeScript 类型报错。

### 2. 核心逻辑与契约测试
```bash
node tests/compact-workbench-style-contract.test.cjs
node tests/home-view.test.cjs
node tests/home-controller.test.cjs
```
确保相关组件的视图、控制器与样式契约通过。

### 3. 全量测试套件
```bash
pnpm test
```
执行全量自动化测试（当前基线为 8740+ 项测试全部通过）。

### 4. 生产构建与包体预算审计
```bash
pnpm build
```
- 检查构建输出，`package.zip` 必须严格低于 **591,872 字节（578 KiB）** 发布门禁；
- 检查 `dist/index.js` 是否在合理预算范围内（避免无意间将测试夹具或大静态资源打入生产包）。

### 5. 全量发布就绪检查 (发布前必跑)
```bash
pnpm run verify:release
```
串行跑通类型检查、双重可复现构建审计、全量测试、发布门禁审计、质量审计与所有浏览器冒烟。

---

## 四、 负向验证与门禁自查契约 (Core Discipline)

这是本仓库最重要的工程开发纪律之一：**“只跑改完仍通过不构成证据”**。

根据 [`docs/gate-audit-checklist.md`](docs/gate-audit-checklist.md)：
- **无论何时，凡是新增或修改了任何门禁测试、状态检查或样式契约测试**：
  1. 必须先**故意注入一个违规样本**（例如故意注释掉一行核心声明，或故意改错断言目标）；
  2. 运行测试，确认目标测试**确实红屏失败（ERR_ASSERTION）**，且失败原因与注入的错误 100% 吻合；
  3. 还原代码，核对源文件的字节级（或 SHA-256）完整复原，再次运行确认复绿。
- 只有经过负向拦截验证的门禁，才被视为有效证据，防止编写“永远返回 true”的虚假门禁。

---

## 五、 端侧取证标准与证据纪律

在记录任务证据或提交 PR 描述时，严禁使用模糊或虚假用词：

1. **模拟环境不等于真实宿主**：
   - Chromium Smoke、浏览器 Device Emulation、JSDOM 只能证明**“CSS 几何结构与逻辑流通过”**；
   - **绝对不能把浏览器模拟称为“Android 真机通过”或“桌面 Dock 实测通过”**；真实设备验收必须在具备真实环境时单独标记并取证。
2. **受控测试响应不等于外部长期 SLA**：
   - 对 Open-Meteo 天气、Bangumi、ActivityWatch 的测试夹具，仅证明插件代码对该结构的解析与容错正确，不代表外部服务本身的可用性。
3. **零隐私泄漏底线**：
   - 严禁在 PR、Issue、代码注释、测试用例或截图证据中贴入任何真实的 API Token、私密工作区绝对路径或笔记正文！

---

## 六、 维护者常见疑难排障指南 (Troubleshooting)

### Q1: `current-status-audit: currentTask 必须为 in_progress，当前为 planned`
- **原因**：`docs/current-status-index.json` 顶部的 `currentTask` 指定了一个任务 ID，但在 `tasks` 列表中该任务的状态却是 `planned` 或 `completed`。
- **解决**：在推进任务前，先将任务的 `status` 修改为 `in_progress`；或在任务收口后，将顶部的 `currentTask` 切换到下一个处于 `in_progress` 的任务。随后运行 `node tests/current-status-index.test.cjs` 验证。

### Q2: Webpack 打包提示 `package.zip exceeds budget`
- **原因**：构建生成的 zip 包体超过了 578 KiB 的硬上限。
- **排查路径**：
  1. 检查是否在 `publish.resources` 或根目录无意引入了大文件；
  2. 检查 `src/styles/` 是否书写了非 Token 的冗余大段选择器；
  3. 检查双语 README 或 CHANGELOG 中是否有冗余的旧版重复历史记录，必要时精简或移至 docs 外部归档。

### Q3: 运行 E2E 测试时提示端口 6841 被占用
- **原因**：之前的 E2E 测试进程非正常退出，思源测试实例内核依然挂在后台。
- **解决**：检查端口占用进程并安全释放，或使用后台编排脚本 `node scripts/e2e/background-orchestrator.mjs`，该脚本自带 PID 守卫与隔离端口生命周期回收。

---

## 七、 发布准备、资产核验与回滚流程

1. **发布前准备**：
   - 确认版本号在 `package.json`、`plugin.json`、`README.md` 与 `docs/CHANGELOG.md` 中完全一致；
   - 运行 `pnpm run readiness:snapshot` 刷新快照记录；
   - 执行 `pnpm run release:check`。
2. **构建一致性比对**：
   - 运行 `pnpm run repro:audit` 进行生产双构建比对，确保两次构建产物的 SHA-256 100% 相同；
   - 远端 GitHub Actions 构建完成后，下载 Release 中的 `package.zip` 与本地 Windows 构建进行字节比对（允许跨平台 1 KiB 范围内的 DOS 时间戳漂移）。
3. **紧急回滚操作**：
   - 详细回滚手册见 [`docs/install-upgrade-rollback-2026-10-06.md`](docs/install-upgrade-rollback-2026-10-06.md)；
   - 若线上发现严重回归：
     1. 立刻在 Release 页面撤回该版本，保留上一稳定版本的最新标签；
     2. 在本地安全检出上一稳定标签，核对 18 个存储 key 迁移函数的向前降级兼容性；
     3. 绝不强制推送（force push）破坏主线 Git 历史。
