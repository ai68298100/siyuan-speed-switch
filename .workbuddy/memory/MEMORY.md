# 小驴速切（siyuan-speed-switch）项目长期记忆

> 详细过程与批次记录看 `.workbuddy/memory/2026-09-*.md` 每日日志；本文件只留仍有效的结论。

## 本机环境（可直接复用）
- 思源安装目录 `D:\biji\SiYuan`；真机样式权威依据 `resources/stage/build/{mobile,app,desktop}/base.*.css`——查宿主兜底读这里，不要凭推断。
- 宿主 svg 兜底规则：`.b3-button svg` 有 16px 尺寸兜底；`.b3-tooltips svg` 只有边距无尺寸。判定裸 svg 失控 = 容器 b3 类 × 尺寸是否只在插件 CSS。
- Chromium 门禁浏览器：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。
- pnpm 在 Git Bash 需 shim（见用户级记忆）；本仓 CRLF 文件用 python 逐字节改，`sed -i` 只用于确认 LF 的文件。
- **新工作区两个环境坑（2026-09-17 固化到仓库根 `.dev-env.sh`，已入 `.gitignore`）**：① WorkBuddy 的 bash shim 坏了（coreutils 不在 PATH）→ 显式加 `PortableGit/.../usr/bin` 与 `/bin`；② 系统 Node 的 corepack 损坏，`pnpm` 必报 `Cannot find module '.../corepack/dist/pnpm.js'` → 绕过 corepack，直连受管 Node 22 的 `node_modules/pnpm/bin/pnpm.cjs`。用前先 `source .dev-env.sh`。
- Bash 的 MSYS 路径转换异常：`/c/Users/x` 会被译成 `D:\c\Users\x`，Windows 绝对路径一律写 `C:/...` 形式。

## 项目约定（高频）
- `pnpm test` = `node tests/run-tests.cjs`；`node --test 单跑不计入总数`。`verify:release` = tsc→build→test→三套 UI smoke，**必须独占运行**；输出落日志再 grep，不要 `| tail`。
- **收尾固定动作**：跑全量落盘 → 同步 README 双语测试数（无门禁，必漂移）+ `docs/release-readiness.md` 快照（含测试项数行）→ 产物快照必须在最后一次构建之后记 → **`git status --short` 逐行核对再提交**（tmp 脚本曾被 `git add -A` 误提交）。
- i18n 死 key 门禁：key 必须被 src 引用且 zh-CN/en 集合一致，成对加。
- 门禁新增/修改按 `docs/gate-audit-checklist.md` + 负向验证三件套（精确 FAIL＋兄弟不波及＋旧写法仍绿；注入须外科式、同源）。
- 读源码走 `tests/source-scan.cjs` 的 `readSourceText`/`readSourceFile`（CRLF 归一＋剥注释；docs/JSON 不迁）；裸读须登记 `SOURCE_SCAN_DEBT`（覆盖度由 source-scan-coverage 冻结，当前仅 4 条合法例外）。`.cjs` 助手 require 必须写全扩展名。
- 存储 key 恒 13（`KEY_ORDER`，字面量钉住）；细节与迁移时间线看 `docs/storage-compatibility-matrix.md`（双向文档契约）。
- 含反斜杠/`$'…'` 的检查一律写脚本落盘执行；"命中 0"当可疑信号。Git Bash heredoc 还会吃正则 `\)`——注入/对比脚本的正则退化为字符串 `find` 或落盘执行；**多行切片验证必须行数/md5 双断言**（CRLF `newline=""` 口径下反向找闭合行会报伪失败，P1-1b 自证脚本实例）。
- **文档治理（2026-09-17 起）**：事实源 = `ROADMAP.md`（方向）+ `BLOCKERS.md`（阻塞）+ `docs/adr/`（决策）+ `docs/dev-plan-*.md`（当期任务账本）+ `docs/acceptance-log.md`（验收流水）；`docs/archive/` 是**冻结快照、只读不追加**。任务号 T-xxxx 继续递增但**不回写**归档账本。根目录 Markdown 受 `tests/root-doc-budget.test.cjs` 约束。

## 门禁方法论精华（33 条全录见 2026-09 日志）
- 断言锚点：禁"类名+距离窗口"（伪锚点/假绿），用块级断言（`tests/css-block-scan.cjs` 的 `parseRules/findRules/declaresIn`）＋ `{topLevel: true}`（防覆盖规则替身）＋ `{atRule: /…/}`（窄屏分支）；复合 at-rule 用 `atRules[0]` 精确等于原文。
- 源码扫描必剥注释；数据驱动门禁的白名单值必须被断言（要求"被调用"）；断言集合补"非空"自检，下限不钉死进度（用 `>=3` 这类，勿 `>=35`）。
- 叙述性历史断言无防线：约史断言必须附可复现 git 命令；数量边界以代码为准。
- 文档契约门禁要双向；否定断言先侦察真实数据防假红（`index.scss` 有 7 处合法像素行高）。
- `void x;` 是门禁驱动型死代码指纹；名不副实断言三处置（兑现/删除/换名）；"块级化当场假红"可能是真实产品缺陷（如 size tile 缺 touch-action）。
- 手写变量截块窗口是普查盲区，"债清单归零"≠"窗口断言归零"，逐文件通读是最后一道工序。
- 工具普查：`node scripts/css-window-census.cjs`、`node scripts/css-assertion-injector.cjs`（探针 `\-` 转义 `-` 哨兵；工具须打印注入内容并点名未覆盖断言）。
- **验证工具自身也会出缺陷，且缺陷型与产品代码同构**：负向验证脚本里 `for ... fails in results` 重新绑定了外层 `fails`，使"还原后全绿"误报 False——与 P1-1a 的 `renderMobileList` 影子绑定同类。**注入设计也必须能隔离目标分支**：200 KiB 会同时踩单文件与合计两条上限，须选只踩一条的量级（160 KiB）。

## 当前状态（2026-09-17 下午·本会话实测）
- **P1-1b 已交付（T-6295，ADR 0052）**：`openSecondPanel`（601 行体）搬入新模块 `src/second-panel-ui.ts`（宽宿主接口 `SecondPanelUiHost`：9 状态字段 + 11 方法签名，纯读单入口故**改判**不先拆状态宿主）；`index.ts` **8702 → 8104 行**。类静态成员 `HOME_ACCENTS` 用转发字段 `homeAccents` 解决。599 行体换行归一逐字节相等（仅 2 处授权替换）；契约改指 9 个测试文件（每条实证，零人工裁定）；负向抽样 23/2 精确 FAIL 全 PASS；verify:release EXIT=0。生产图天花板 45→46。
- **P1-1a 已交付（T-6291，ADR 0048）**：移动端切换器群 525 行搬入新模块 `src/mobile-switcher-ui.ts`，`index.ts` **9226 → 8701 行**。tsc 0 错误 / 5872 全绿 / smoke 70 / **verify:release 全链绿**。
- **两条可直接复用的硬教训**：① `this.X(` → `X.call(this, ` 的机械替换，遇同作用域同名局部闭包会指向自身→运行时爆栈且 **tsc 零报错**，迁移脚本必须先做「影子绑定」扫描；② 契约同步不能只扫 `includes('...')`，还有**双引号字符串**与 **`match` 计数式**两种形式，务必分形式扫。
- **P1-2 已交付（T-6292，ADR 0049）**：`src/index.scss` 6517 行拆为 `src/styles/` 的 tokens + 9 个**顺序切片**，本体退化为 12 行 `@use` 清单。**样式重构与 TS 重构方法论不同：CSS 顺序即层叠顺序，只能顺序切片，不能按域名聚类。**
- **样式类重构的通用解法**：拆物理文件 + 在 `tests/source-scan.cjs` 用 `readStyleSource()` 合成逻辑视图（对 `src/index.scss` 返回按清单重组的内容）。既有 35 处样式断言一行未改。零漂移证据：重组后逐字节等于原文件 + `dist/index.css` md5 不变。
- **该缺口已闭合（P1-3，T-6293，ADR 0050）**：新增 `tests/style-slice-coverage.test.cjs`，按切片动态求「独占锚点」（顶层选择器 + SCSS 变量声明）并要求其出现在组合视图中。复测：**逐个删除切片触发失败数 10/10 从 0 变为 1**。
- **门禁设计套路（可复用）**：数据驱动（不硬编码清单）+ 非空自检（防正则失效恒绿）+ 下限用 `>=3` 这类不钉死进度的值 + 附「删除模拟」用例证明确实上膛。
- 测试计数现为 **5879 项 / 173 文件**（改门禁后必须同步双语 README 与 release-readiness，无门禁保护必漂移）。
- **P0-2 已交付（T-6294，ADR 0051）**：`TODO.md`/`DECISIONS.md`/`PROGRESS.md` 归档到 `docs/archive/`（md5 逐一一致、零漂移），根目录 Markdown **8 份 1031001 B → 5 份 110076 B（-89.3%）**。
- **归档的关键风险在引用面不在搬运**：`AGENTS.md` 的自主开发协议明文依赖这三份文件，只挪目录会打断协议链。共 **7 处指令性引用**改写；**规则：指令性引用（写入/读取目标）必改，叙述性引用保持原样**（改=篡改历史）。另新增 `docs/archive/README.md`（归档政策＋**归档清单唯一事实源**，门禁解析它）与 `docs/acceptance-log.md`（承接验收摘要追加职责）。
- 新增 `tests/root-doc-budget.test.cjs`（4 项）：数量 ≤8 / 单文件 ≤150 KiB / 合计 ≤300 KiB + 与归档清单**双向契约**（清单项须在 archive、根目录不得同名）+ 替代事实源存在性。上限依据见 ADR 0051。
- **归档会外溢到既有门禁的扫描面**：`protocol-compat-claim` 扫 `docs/**`，三份账本归档后进入扫描面，带来 v0.16.17 x2 与 v0.7.0 x1，与活文档统一的 v0.16.16 x3 冲突 → 假红。处置：按前缀排除 `docs/archive/` + 补**「排除承重」自检**（归档区必须确实含被排除的声明，否则排除退化成可被无声删除的空操作）。
- 新工作区自 GitHub 浅克隆，基线 `1d74efd release: v0.20.0`。tsc 0 错误、build 通过、测试 5872 项中 **5871 通过 1 失败**。
- **该项已修复（T-6290，ADR 0047）**：自检改为自适应标定（`calibrateSelfCheckIterations` 放大至 ≥2ms）+ 比值断言 `heavy/light >= 1.5`。**全量已恢复 5872/5872 全绿**。
- **负向验证挖出的通用教训**：`heavy > light` 这类"大于"断言在计时噪声下**零判别力**（等规模注入仍通过），必须用比值断言。同类计时门禁自查一遍。
- 产物（2026-09-17 P1-1b 收尾实测）：`dist/index.js` **631445 B**、`index.css` **145577 B**、`package.zip` **320546 B**；双语 README 与 release-readiness 已对齐。**注意"记录即失效"耦合**：README 被打进 `package.zip`，改 README 会改 zip，故快照必须在最后一次构建之后记。
- 结构基线：`src/` 40 文件；`index.ts` 由最初 **9226 行**经 P1-1a/P1-1b 降至 **8104 行**；`index.scss` 已拆分完毕（P1-2）。
- 交付 `docs/dev-plan-2026-09-17.md`（实测基线＋架构评价＋已完功能清单＋P0~P3 优先级）。本会话未改任何产品代码。
- 剩余（需用户）：真机验收解锁 T-103/T-1219/T-1220 链条；发布决策（push / v0.20 vs v0.21）。
- 已完结：T-6280~T-6289（窗口断言清零、iCal 与 GitHub 贡献双组件全链、性能门禁加固、worktree 收口、D-397 iCal 文本抓取缺陷修复）、分支/worktree 只剩 main、验收 Runbook。
- v0.21 生活信息支线 iCal + GitHub 均已上线（GitHub 为周汇总列表卡，格点热力图视觉留后续）。
- 剩余（需用户）：真机验收解锁 T-103/T-1219/T-1220 链条；发布决策（push / v0.20 vs v0.21）。
