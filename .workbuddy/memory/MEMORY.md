# 小驴速切（siyuan-speed-switch）项目长期记忆

> 详细过程与批次记录看 `.workbuddy/memory/2026-09-*.md` 每日日志；本文件只留仍有效的结论。

## 本机环境（可直接复用）
- 思源安装目录 `D:\biji\SiYuan`；真机样式权威依据 `resources/stage/build/{mobile,app,desktop}/base.*.css`——查宿主兜底读这里，不要凭推断。
- 宿主 svg 兜底规则：`.b3-button svg` 有 16px 尺寸兜底；`.b3-tooltips svg` 只有边距无尺寸。判定裸 svg 失控 = 容器 b3 类 × 尺寸是否只在插件 CSS。
- Chromium 门禁浏览器：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。
- pnpm 在 Git Bash 需 shim（见用户级记忆）；本仓 CRLF 文件用 python 逐字节改，`sed -i` 只用于确认 LF 的文件。

## 项目约定（高频）
- `pnpm test` = `node tests/run-tests.cjs`；`node --test 单跑不计入总数`。`verify:release` = tsc→build→test→三套 UI smoke，**必须独占运行**；输出落日志再 grep，不要 `| tail`。
- **收尾固定动作**：跑全量落盘 → 同步 README 双语测试数（无门禁，必漂移）+ `docs/release-readiness.md` 快照（含测试项数行）→ 产物快照必须在最后一次构建之后记 → **`git status --short` 逐行核对再提交**（tmp 脚本曾被 `git add -A` 误提交）。
- i18n 死 key 门禁：key 必须被 src 引用且 zh-CN/en 集合一致，成对加。
- 门禁新增/修改按 `docs/gate-audit-checklist.md` + 负向验证三件套（精确 FAIL＋兄弟不波及＋旧写法仍绿；注入须外科式、同源）。
- 读源码走 `tests/source-scan.cjs` 的 `readSourceText`/`readSourceFile`（CRLF 归一＋剥注释；docs/JSON 不迁）；裸读须登记 `SOURCE_SCAN_DEBT`（覆盖度由 source-scan-coverage 冻结，当前仅 4 条合法例外）。`.cjs` 助手 require 必须写全扩展名。
- 存储 key 恒 13（`KEY_ORDER`，字面量钉住）；细节与迁移时间线看 `docs/storage-compatibility-matrix.md`（双向文档契约）。
- 含反斜杠/`$'…'` 的检查一律写脚本落盘执行；"命中 0"当可疑信号。

## 门禁方法论精华（33 条全录见 2026-09 日志）
- 断言锚点：禁"类名+距离窗口"（伪锚点/假绿），用块级断言（`tests/css-block-scan.cjs` 的 `parseRules/findRules/declaresIn`）＋ `{topLevel: true}`（防覆盖规则替身）＋ `{atRule: /…/}`（窄屏分支）；复合 at-rule 用 `atRules[0]` 精确等于原文。
- 源码扫描必剥注释；数据驱动门禁的白名单值必须被断言（要求"被调用"）；断言集合补"非空"自检，下限不钉死进度（用 `>=3` 这类，勿 `>=35`）。
- 叙述性历史断言无防线：约史断言必须附可复现 git 命令；数量边界以代码为准。
- 文档契约门禁要双向；否定断言先侦察真实数据防假红（`index.scss` 有 7 处合法像素行高）。
- `void x;` 是门禁驱动型死代码指纹；名不副实断言三处置（兑现/删除/换名）；"块级化当场假红"可能是真实产品缺陷（如 size tile 缺 touch-action）。
- 手写变量截块窗口是普查盲区，"债清单归零"≠"窗口断言归零"，逐文件通读是最后一道工序。
- 工具普查：`node scripts/css-window-census.cjs`、`node scripts/css-assertion-injector.cjs`（探针 `\-` 转义 `-` 哨兵；工具须打印注入内容并点名未覆盖断言）。

## 当前状态（2026-09-17 晨）
- 全会话 40 个本地提交（`8700fe9`..`dd963b7`），未 push；测试 5872/5872（171 文件）；verify:release 全链绿（js 631610 / zip 318095）。
- 已完结：T-6280~T-6289（窗口断言清零、iCal 与 GitHub 贡献双组件全链、性能门禁加固、worktree 收口、D-397 iCal 文本抓取缺陷修复）、分支/worktree 只剩 main、验收 Runbook。
- v0.21 生活信息支线 iCal + GitHub 均已上线（GitHub 为周汇总列表卡，格点热力图视觉留后续）。
- 剩余（需用户）：真机验收解锁 T-103/T-1219/T-1220 链条；发布决策（push / v0.20 vs v0.21）。
