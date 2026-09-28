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
- 含反斜杠/`$'…'` 的检查一律写脚本落盘执行；"命中 0"当可疑信号。Git Bash heredoc 还会吃正则 `\)`——注入/对比脚本的正则退化为字符串 `find` 或落盘执行；**多行切片验证必须行数/md5 双断言**（CRLF `newline=""` 口径下反向找闭合行会报伪失败，P1-1b 自证脚本实例）。**CRLF 改写姿势：检测行尾 → 只改目标 → 写回前断言行尾纯净（无 `\r\r\n`、无裸 `\n`）**——对已 CRLF 文本再 `replace('\n','\r\n')` 会双重损坏且工具不可见（P1-4 清单脚本实例）。**且 CRLF 纪律要逐文件判定：改前先查 `git show HEAD:<file>` 的行尾——docs/dev-plan-*.md 是纯 LF 文件，往 LF 文件插 CRLF 同样是损坏（P3-2 实例）**
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

## 当前状态（2026-09-27，T-6928 会话校正；旧 09-17 基线已大幅过时）
- **版本与计数**：v0.40.0 已发布（T-6926，跳过真机直接发）；测试 **6288 项**；任务号最新 **T-6929**；ADR 最新 **0084**；包体 zip 预算线 512 KiB（余 ~16 KiB）。当期账本 = `docs/dev-plan-2026-09-22.md`（09-18/09-19 为前序账本）。
- **产品形态（T-6866 定案）**：统一切换与工作上下文平台 = 三表面（切换器 switcher / 工作台 workbench / 片段实验室 studio，桌面专属）+ 悬浮球（全局触发器，非第四表面）。平台外壳/表面导航已实现；默认全屏（ADR 0080）；RZ-1~RZ-6（T-6871~T-6876）细节批全部收口。
- **UI 设计唯一事实源 = `docs/design-system-v1-2026-09-27.md`（T-6928，ADR 0084）**；组件画廊 `docs/design/design-system-gallery-2026-09-27.html`（管零件），R2 原型 `docs/design/platform-ui-redesign-r2-2026-09-26.html`（管整机）。做 UI 先读规范 §11 扩展指南。**原型审查报告 = `docs/design-review-2026-09-27.md`（T-6929，38 条建议按优先级排序，两处方向待用户裁决：设置第 11 标签、行级数字直达去留）**。
- **生产 token 在 `src/styles/_platform-shell.scss`**：`--sw-platform-*` 全家桶（色彩纯 `--b3-*` 派生 + color-mix）+ 原语 action/status/kbd/seg/preview；动效常量在 `_00-tokens.scss`（120/160/200/260ms）。`rz-*` 是原型提案层类名，**不进生产**。
- **设置页 = 10 个标签**（index.ts `panelKeys`：appearance/behavior/panels/favorites/quickActions/floatingBall/documentSets/journal/mobile/storage）；R2 探索的第 11 个"组件面板"标签未落地。
- i18n 双语各约 1252 key。悬浮球已撤侧栏端（ADR 0072，只挂 desktop/mobile）。
- 剩余（需用户/后置）：真机验收 B-004/B-005；皮肤首批色板渐进落地（ADR 0073，T-6796~T-6798）；T-6927 等修复随 v0.41.0 攒版。

## 历史交付快照（2026-09-17 基线，细节见当日日志）
- P3-1~P3-3（T-6297~T-6299）：热力图 viewType、第三方插件接入示例、语义搜索能力门。
- P1-1a/1b（T-6291/T-6295）：`mobile-switcher-ui.ts`/`second-panel-ui.ts` 拆出，index.ts 9226→8104 行；教训：① 机械替换 `this.X(`→`X.call(this, ` 须先做影子绑定扫描（tsc 零报错但运行爆栈）；② 契约同步分形式扫（includes/双引号字符串/match 计数式）。
- P1-2~P1-4（T-6292~T-6296）：index.scss 拆 9 顺序切片 + `readStyleSource()` 合成逻辑视图（CSS 顺序即层叠，只能顺序切片）；切片语义重命名。
- 视图类型接入清单：`home-model.js` 定义 → home-model/home-view **两处白名单同步** → 渲染分支 → `normalizeHomeViewResult` → 样式切片 → 契约 + 负向验证。
- P0-2（T-6294）：三根目录账本归档 docs/archive/（指令性引用必改、叙述性引用不改）；root-doc-budget 门禁。
- 产物快照与 README 有"记录即失效"耦合（README 打进 zip，快照必须在最后一次构建之后记）。
