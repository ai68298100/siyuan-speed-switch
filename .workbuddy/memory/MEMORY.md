# 小驴速切（siyuan-speed-switch）项目长期记忆

## 本机环境事实（可直接复用）
- 思源安装目录：`/d/biji/SiYuan`（`D:\biji\SiYuan`）。
- **真机基础样式（权威依据）**：`resources/stage/build/mobile/base.9450c3c32a0f5d8ce01a.css`（另有 `app/`、`desktop/` 同名 base CSS）。
  查宿主对插件 DOM 的真实样式兜底时读这里，**不要凭推断**。
- 已验证的关键宿主规则（2026-09-16 实测）：
  - `.b3-button svg{height:16px;width:16px;margin-right:4px;flex-shrink:0}` → 带 `b3-button` 的容器，其子 svg 在插件 CSS 缺席时**有 16px 兜底**。
  - `.b3-tooltips svg{margin-right:0}` → **只有边距、无尺寸**，带 `b3-tooltips` 的容器**无兜底**。
  - 推论：判定"某个裸 svg 会不会在样式未就绪时失控"= 容器是否带 `b3-button`（或其它有 svg 尺寸规则的 b3 类）× svg 尺寸是否只写在插件 CSS 里。
- pnpm 在 Git Bash 需 shim（用户级记忆已记），实测版本 11.4.0。
- **Git Bash 的 `sed -i` 会把 CRLF 文件整体转成 LF**（本仓 CRLF 文件：`src/util.js`、`src/quick-actions.js`、`tests/util.test.cjs`、`tests/storage-key-audit.test.cjs`；LF 文件：`src/index.ts`、其余 src/*.js、全部 md）。症状是"内容看起来一样但哈希变了"、按 `\n` 锚定的切片静默失配。改动 CRLF 文件请用 python 逐字节替换，`sed -i` 只用于确认是 LF 的文件。
- Chromium 门禁可用浏览器：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。

## 项目约定
- `pnpm test` = `node tests/run-tests.cjs`（自定义 runner，非 node --test 直跑）；单跑某文件用 `node --test <file>` 不会计入总数。
- `pnpm verify:release` = tsc --noEmit → build → test → 三套 UI smoke（mobile-card-smoke / mobile-toolbar-layout / chromium-style-smoke）。
- **README 的"测试项数"没有门禁断言**（只有"测试文件数"有），改测试后必须手工同步 README 双语 + `docs/release-readiness.md` 快照，否则 `release readiness matrix matches generated artifact sizes` 会失败。
- **i18n 有"死 key"门禁**（`tests/i18n.test.cjs`）：新增 key 必须在 src 里被引用，且 zh-CN 与 en 的 key 集合必须完全一致 → 加 key 必须成对加。
- 门禁新增/修改必须按 `docs/gate-audit-checklist.md` 自查 + 负向验证（注入违规→按**失败项名称**确认→md5 字节级还原）。
- 设置页 UI 构建在 `src/settings-sections.ts`（R4/D-376 外迁）；其源码契约写在 `tests/mobile-card-smoke.cjs` 的 `documentSetContractOk` 等一串 `includes` 断言里，改设置页行为要顺手扩那里。
- 纯模型惯例：`src/document-sets.js` 一侧放 plan/summarize/run/**report**，UI 只装配；报告类函数的时间戳用 `options.now` 注入以便测试确定化。
- `src/index.ts` 与 `src/settings-sections.ts` 各有一份 `declare module "./document-sets"` 类型增强块，新增导出要补声明（否则 tsc 报错）。
- 存储 key 总数恒为 13 = `HANDLED_KEYS`(**11**) ∪ `INSPECTED_KEYS`(**2**)，即 `src/storage-migration.js` 的 `KEY_ORDER`（端型无关）；`agent-capabilities.js` 把只读快照计数钳到 13，`tests/storage-key-audit.test.cjs` 用字面量 13 钉住（`report.keys.length === KEY_ORDER.length` 是自指恒真式，发现不了重复归类）。
- **13 key 的迁移函数 / 容量边界 / 引入版本 / 跨版本迁移时间线**看 `docs/storage-compatibility-matrix.md`（v0.20 交付物，D-393）；它由 `tests/storage-compatibility-matrix.test.cjs` **双向**钉住（文档缺 key 或写废弃 key 都失败）。注意 ROADMAP v0.20 那句「8 个数据 key」是 **v0.16.9 时点**的旧数字，现为 13。
- 缩略图缓存：`src/util.js` 的 `normalizeThumbCache`（读取侧，`changed` 驱动回写）必须与 `index.ts` 的 `setThumbCache`（写入侧）规则镜像，上限按端型选（桌面 40/200 KiB、手机 30/80 KiB）且**写入侧/加载侧/演练侧三处都要选**——`tests/storage-migration.test.cjs` 断言该常量选择表达式恰出现 3 次。**历史事实（已用 `git log -S` 核实，不要凭印象改）**：桌面 40/200 KiB 自 v0.2.0 起从未变过；手机端常量 v0.7.0 是 20/80 KiB 但 `setThumbCache` 当时**硬编码桌面常量**（该版本 `isMobile ? THUMB` 出现 0 次），v0.8.0 起才按端型选到 30/80 KiB。

## 门禁方法论（踩过的坑）
1. **不要用"类名 + N 字符距离窗口"当锚点**（第七类失效模式，D-390）：注释里提到同类名即成伪锚点 → 归因错误；目标语句漂出窗口 → 假绿。改用 `X.className = "..."` 建变量→类名映射（多值 Set，因变量名会复用），再取 `X.innerHTML = ...` 完整语句断言（按引号状态扫描跨过字符串内分号）。
2. 成对门禁：Chromium 布局门禁量真实布局量，但 HTML 与生产模板是两份会漂移 → 配源码契约锁模板。
3. 时序类缺陷用**同页因果对照**（`sheet.disabled = true`）证明测试环境真的复现了故障，否则断言可能恒绿。
4. 断言集合为空时恒真（模式④）：遍历类断言要补"审计面非空"自检。
5. **源码扫描前必须剥注释**（第八类失效模式，D-392）：否则"把调用注释掉"或"在注释里写下调用文本"就能满足 `includes(...)` 式接线性断言。统一用 `tests/source-scan.cjs` 的 `stripComments()`（按引号状态扫描，不误伤 `"https://…"`），别自己写朴素 `//` 正则。
6. **数据驱动门禁的白名单值一定要被断言**（第八类，D-392）：`for (const k of Object.keys(X))` 只用了 key 就是装饰——`tests/storage-key-audit.test.cjs` 的 `sanitizeAllowlist` 曾如此，"每个 key 必须有清洗函数"从未真正生效。要求"函数在源码里被**调用**"，并用反向否定环视排除 `export function name(` 这类 ambient 声明。
7. **可判别性检查**：构造用例后要问"注入违规时它真的会失败吗"。`normalizeThumbCache` 的"按 ts 淘汰"用例首版里插入序与 ts 同向，注入"忽略 ts"仍通过（假绿）；改成插入序/键名/ts 互相反相关才有效。
8. **叙述性历史断言无防线**（第九类失效模式，D-393）：写进 JSDoc/文档的「旧版本上限更大」「自 vX 起从未变过」不进代码审查视野、无测试覆盖，却会被后续读者当作事实沿用（同一句错论曾复制进 JSDoc + TODO + PROGRESS + DECISIONS 四处）。处置：① 每条约史断言**必须附可复现的 git 命令**（`git log -S <符号> -- src/` 定位引入提交，再 `git show <sha>:plugin.json` 取版本号；数量类用逐 tag 统计）；② 数量/边界类事实**以代码为准**并配文档契约门禁；③ 不确定就写"当前实现如此"，不写"一向如此"。
9. **文档契约门禁要双向**：只断言"文档提到了 X"会漏掉"文档写了已废弃的 X"。`tests/storage-compatibility-matrix.test.cjs` 同时断言两个方向，并配"被审计常量清单须恰好等于 `DEFAULT_LIMITS` 声明的来源常量集合"的自检（首版漏 `THUMB_HTML_MAX` 时它立刻报错）。清单必须**显式**——`constants.ts` 另有 `COLUMNS_MAX`/`PANEL_SCALE_MAX` 等与存储无关的上限，宽泛正则会误纳。
10. **verify:release 必须独占运行**（D-376/D-393）：与其它进程争用时 `tests/perf-complexity-gate.test.cjs` 会假失败（实测 `buildSearchCacheKey … grew 3.42x (ceiling 3)`，单独复跑 5/5 绿）。此类失败一律先单独复跑再判定。**并且：总门禁输出必须重定向到日志文件再 grep，不要 `| tail`**——D-395 首轮出现 1 次 `# fail 1`，正因 `| tail` 连失败项名字都没留下。
11. **读源码一律走 `tests/source-scan.cjs` 的 `readSourceText(filePath)`**（读取 + CRLF 归一 + 剥注释；D-395）。**只用于源码**——`docs/*.md` 里有裸 URL（表格行 `| [X](https://github.com/…) |` 不在引号内），按 JS 词法会被 `//` 截断成数据丢失，故 `docs/`、`package.json`、`README`、dist 路径不迁。**合法例外**：断言对象就是注释本身时（JSDoc 不变量、声明行尾 key 说明）读原始文本，并在文件里写明理由。**覆盖度由 `tests/source-scan-coverage.test.cjs` 冻结**：裸读文件集合与 `SOURCE_SCAN_DEBT`（43 条带理由标签）必须**恰好相等**（新增裸读→`unexpected`，债还清未删→`stale`）。
12. **`void x;` 空转局部变量 = 门禁驱动型死代码的指纹**（D-395 实测 2 处）：`const availabilityFilter = …; void availabilityFilter; // <旧表达式>` 这种写法存在的唯一理由是"培育"注释里那句旧表达式以过源码扫描门禁（`void` 让 TS 未使用检查沉默）。D-395 据此抓出 `tests/home-store-contract.test.cjs` 三条假绿断言（文本只存在于 `src/home-store-ui.ts` 的注释里）。修断言时必须连这类代码一起删。
13. **窗口无界的断言（`A[\s\S]*?B`）与目标无关，剥注释修不了**（第七类同族，D-395）：全仓 **38 文件 / 365 条**（未剥注释粗计）；剥注释后**以债清单为准**的精计为 **305 条 / 33 文件**（选择器→声明类债内 201、非声明类 87、窄窗口 17；已迁 4 个文件共 53 条，见 D-396），断言退化成"文件某处有 A、其后再某处有 B"（`index.scss` 有 104 处 `min-width: 0`，几乎恒真）。修法是**块级作用域断言**，不可机械替换——见 T-6280，债条目在 `SOURCE_SCAN_DEBT` 的 `css-window-scope` 组。**工具**：`node scripts/css-window-census.cjs`（**已剥注释**，且**按债清单分组**——债外命中不计入待迁，债内零命中会被点名，因为普查只认单行形态）、`node scripts/css-assertion-injector.cjs <测试文件> [样式表] [--old=<rev>] [--probe=…]`（判别力三件套自动化，见第 18/21 条）。
14. **本仓 `.cjs` 助手必须写全扩展名**：`require("./source-scan")` 会 `MODULE_NOT_FOUND`——Node 的 CJS 扩展名探测只有 `.js`/`.json`/`.node`，**不含 `.cjs`**；约定是 `require('./source-scan.cjs')`（`tests/run-tests.cjs` 用 glob 发现 `*.test.cjs`，故助手不是测试文件）。
15. **不要把带反斜杠的模式交给这个 Bash 工具**：实测 `grep '\[\\s\\S\]'` 会静默变成别的正则（对 365 处真实存在的模式报 0 命中）、`grep -c $'\r'` 被当成普通 `r`（把 LF 文件误判成 CRLF）。含反斜杠/`$'…'` 的检查**一律写成脚本落盘再执行**，并把"命中 0"当可疑信号而非结论。
16. **归档白名单（改动会挪动 `package.zip` 字节）**：`index.css` / `index.js` / `icon.png` / `preview.png` / `README.md` / `README.en-US.md` / `docs/architecture.svg` / `docs/interface-map.svg` / `docs/component-store-guide.md` / `docs/agent-document-context-m2.md` / `plugin.json` / `i18n/{en,zh-CN}.json`。**产物快照必须在最后一次构建之后记录**——D-395 实测：README 双语计数做的是**等长替换**（5776→5779、166→167），却改变了 DEFLATE 压缩率，重建后 zip 由 313079 变 313078；而 `release readiness matrix matches generated artifact sizes` 对 zip 有 **1 KiB 容差**，会静默放过这类漂移（`dist/index.js` 则是精确比对）。
17. **CSS 块级断言要带 `{topLevel: true}`**（D-396，第七类新变体"覆盖规则替身"）：`declaresIn` 用 `some` 判定"存在匹配选择器的规则声明了 B"，于是基础规则旁**同名覆盖规则会替它满足断言**——删掉 `.sw-home-store__summary` 基础规则里的 `max-width: 100%` 仍绿，因为 `@media (max-width: 560px)` 里另有一条同名规则。助手 `tests/css-block-scan.cjs`（`parseRules`/`findRules`/`declaresIn`/`normalizeSelector`）解析时记 `atDepth`，`{topLevel: true}` 只认未被 at-rule 包裹的规则；基础规则一律带上，**靶点本身只在媒体查询里**的写法必须显式不带并写明理由。**这条只能靠判别力注入发现**（首轮 10 条里就漏了 1 条）。
18. **改写断言的判别力验证要用"三件套"**（D-396）：在同一份被破坏的真实输入上，必须同时成立 ① 新断言**精确 FAIL**（且失败项名称正确）、② **同块"兄弟"断言不受波及**（证明注入是外科式的、不是把整块毁掉）、③ **旧写法仍然绿**（病态对照，证明旧断言确实漏检）。只做 ① 会漏掉"断言被旁路满足"（覆盖规则替身就是这么漏的）。**并要求"只有目标测试失败"**——连带别的测试失败说明注入超范围。
19. **读 CSS 契约文件用 `readSourceFile(rel)`**（D-396，`tests/source-scan.cjs`）：相对仓库根 + **限定源码扩展名**（`.ts/.js/.cjs/.mjs/.scss/.css`），非源码扩展名直接抛错——否则它就是绕开"裸读登记"的后门（读 JSON/Markdown 要登记理由）。迁移一个 CSS 契约文件 = 断言改块级 + 读取改走该入口 + 删掉 `SOURCE_SCAN_DEBT` 里对应的 `css-window-scope` 条目（漏删会立刻 `stale` 失败）。
20. **README 计数会反复静默漂移**：本仓"测试项数"**无门禁**（只有"测试文件数"有），已连续三次在收尾时才发现漂移（最近一次：新建 `css-block-scan.test.cjs` 后无人同步）。**每批收尾固定动作**：`node tests/run-tests.cjs` 落盘 → 取 `# tests` 与文件计数 → 同步 README 双语 + `docs/release-readiness.md`（含"测试项数"行）→ 再重建产物快照。
21. **注入验证的两条铁律**（D-396 第三批，两条都踩过）：① **对照实验必须同源**——"旧写法是否仍绿"的对照必须用与另一组**完全相同**的注入值，否则会把"两组实验本就不同"读成"工具漏采"（实测：手工注 `font-weight: normal` 得 2 条失败、工具注首个交替分支 `font-weight: 400` 得 0 条，我据此误判工具有 bug）；**工具必须打印"到底注了什么"**，负断言应对**每个交替分支各注一次**。② **注入必须外科式**——写回文件除注入那一行外应逐字节等于原文件；若图省事用**剥注释后的行**同时定位与写回，就等于每次注入顺手删掉全文件 `//` 注释（**混淆实验**），而本仓契约测试自己也剥注释，所以**这种混淆完全观测不到**（"恰好没撞上"≠"安全"）。正确做法：剥注释的行只用于**定位**，原始行用于**写回**，并显式断言两份行等长。
22. **验证工具必须声明自己的覆盖边界**（D-396 第三批）：只认 `assert.ok/equal(declaresIn(...))` 单行形态的工具，**不得**让"全部通过"被读成"整个文件都验过了"——它会**逐个点名提取不到的测试**（实测 31 条里 18 条）并列出需人工另验的名单；循环式与 `deepEqual` 式断言用 `--probe` 覆盖（插入式 `'<sel>@@<decl>'`、删除式 `'<sel>@@-<regex>'`、前导 `@` 放宽深度、`@@expect=A|B` 核对失败项），**禁止退回手写注入脚本**（手写正是 ① 的温床）。
23. **理由标签 / 白名单值必须被内容验证**（D-396 第三批发现、第五批落地，模式⑧第三次自我适用）：`tests/source-scan-coverage.test.cjs` 的 `DEBT_REASONS` 曾只校验"标签取自词汇表 + 说明 ≥20 字 + 不留死标签"，**从不校验标签与文件内容是否相符**——实测 `kernel-endpoint-guard.test.cjs` 贴着 `css-window-scope`（"断言是无界窗口"）却一条窗口断言都没有（其 `[\s\S]*?` 是 `source.match(...)` 的**区间截取**、不在 assert 内），真债是读 `src/index.ts` 原文。**已修**：`DEBT_REASON_CHECKS` 给全部 4 个标签各配一条**必要条件**级判据（作用在剥注释后的文本上），配两级自检（词汇表↔判据表双向相等；**每条判据必须至少拒绝一个反例样本**，否则改成 `() => true` 不会被发现）。该文件已改走 `readSourceText` 并移出债清单。**遗留**：判据拦"明显不符"，"理由是否仍然成立"仍需人审。
24. **CSS 块级断言的作用域开关有两个**（D-396 第三/四批，T-6283 已落地）：`{topLevel: true}` 只认未被 at-rule 包裹的基础规则（防"同名覆盖规则替身"）；`{atRule: /…/}` 要求外层 at-rule 条件链至少一条命中（`parseRules` 记录 `atRules`，如 `["@media (max-width: 560px)"]`），用于"**窄屏分支**里必须有 X"——`atDepth` 只说"被几层包着"、说不出"是哪一条"，退让成"任意 at-rule"会让"把声明挪去 `@media print`"静默通过。两者可同给（互斥时断言正确地失败）。
25. **改写否定断言前先侦察真实数据**（D-396 第四批，救过一次假红）：`store-line-height-contract` 的 `avoids px lock`/`uses unitless values` 若按名字写成"全文件禁像素行高"会**假红**——实测 `src/index.scss` 有 **7 处合法的像素行高**（设置页/工具栏等）。否定断言的作用域必须与"被管对象"一致（该契约=受管五块：card-head strong/span、status、group、summary）。同理，这两条原本是**名不副实**（一个检查的是相邻 `height:`、一个只是"存在 1.35"），普查工具扫不到这类（不是窗口形态），迁移时必须逐条读断言。
26. **迁移后零信息的测试可以删**（D-396 第四批，本仓第一次）：`* rule closes` 的 `\}` 由文件后面**任何一个** `}` 满足，而块解析版 `is defined` 本身就要求"存在合法闭合的规则块声明了它"——严格强于旧断言，三条纯冗余，删除（30→27）。删除会动"测试项数"，收尾必须同步 README 双语 + `docs/release-readiness.md`（见第 20 条）。
