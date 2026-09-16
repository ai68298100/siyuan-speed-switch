# 门禁有效性审查清单

> 来源：D-354（隔离门禁漏检 27/31）、D-359（两处恒真断言）、D-360（4 处断言零外部状态）、D-390（邻域窗口锚点导致归因错误 + 假绿）、D-392（白名单值从不被断言 + 源码扫描可被注释满足）、D-393（叙述性历史断言无防线 + 文档契约门禁）六轮审计的方法论固化。
> 用途：**新增或修改任何门禁/契约测试时，按本清单自查一遍**，避免重复交付"看起来在守护、实际从不触发"的测试。

## 一、为什么需要这份清单

五轮审计共发现 **10 处失效门禁**，它们的共同点不是"写错了逻辑"，而是**断言从不因违规而失败**。这类缺陷不会在代码审查中被发现——测试是绿的，覆盖率数字也正常。

**核心原则：一个门禁只有在"注入违规时它确实失败"之后，才算存在。**

## 二、九类失效模式

### ① 自造数据再断言自造数据（最隐蔽，D-360 命中 4 处）

```js
// ✗ 输入全部来自测试自身，与系统无关
test('asset list stays bounded', () => {
    const assets = ['package.zip'];
    assert.deepEqual(assets, ['package.zip']);
    assert.ok(assets.length <= 4);
});
```

**检测**：测试函数体内出现 `const X = [...字面量...]` 或 `X = Y.map(...)`，随后断言 `X` 自身。问一句：**这个断言的输入有没有一处来自被测系统？**

修正：从真实对象取数（读 workflow、读产物、调用真实实现）。

### ② 恒真的表达式

```js
assert.equal(typeof fs.readFileSync, 'function');                    // 凡有 fs 必过
assert.equal(typeof rt[name], 'function' === typeof rt[name] ? ... ) // 右侧化简后等于左侧
assert.equal(snapshot.split('\n').length, files.length);             // snapshot 由 files map 而成
```

**检测**：把断言两侧分别化简，看是否恒等。特别留意 `typeof X` 配三元式、以及"由构造方式决定的量"。

### ③ 测试自造正则/算法，而非调用生产实现

```js
// ✗ 验证的是 JS 正则引擎，不是发布流程的约束
const valid = /^v?\d+\.\d+\.\d+$/;
assert.equal(valid.test('v0.16.11'), true);
```

**检测**：`const <名字> = /.../` 或 `function <名字>(...)` 定义在测试内，然后只测它自己。
修正：`require` 生产实现；若约束只在配置里（如 workflow），则读取并断言该配置。

### ④ 遍历集合后断言子集为空（集合为空时恒真）

```js
const leaked = UNWIRED.filter((m) => inGraph(graph, m));
assert.deepEqual(leaked, []);   // leaked 恒空当 filter 本身失效时
```

D-354 就是这个形态：`inGraph` 检查了错误的键格式，导致 `leaked` 永远为空。

**检测**：任何 `X.filter(...)` 后断言为空的地方，问：**如果 `filter` 的判定函数失效了，会怎样？** 并补一条"输入集合非空"或"检查项数 N ≥ 下限"的自检。

### ⑤ 测试名承诺的语义与实际断言不符

```js
test('build resources are deterministic within one checkout', () => {
    assert.deepEqual(missing, []);              // 只验了"文件存在"
    assert.ok(snapshot.length < 1024);          // 只验了"诊断有界"
});                                              // 没有任何确定性验证
```

**检测**：读测试名，再逐条读断言——断言集合能否推出测试名？不能则改名或补断言。

### ⑥ 扫描自身源码的断言（自指）

```js
const self = fs.readFileSync(__filename, 'utf8');
assert.equal(self.includes('writeFileSync'), false);   // 字符串就在本文件里 → 恒真
```

**检测**：断言检查的文件是否就是断言所在的文件？若是，被查找的字面量必然出现。
修正：用"词根 + 后缀"拼接构造目标串，使其不以完整形态出现。

### ⑦ 邻域窗口锚点（D-390 命中 1 处）

```js
// ✗ "类名之后 400 字符内出现的 <svg> 必须带 width"
const leak = new RegExp(`${label}[\\s\\S]{0,400}?innerHTML = [^;]*?<svg(?![^>]*width=)`);
assert.doesNotMatch(source, leak, `${label} must not assign a size-less svg`);
```

这种"锚点 + 距离窗口"的写法同时踩两个坑，且**方向相反、互相掩盖**：

| 坑 | 表现 |
| --- | --- |
| **归因错误** | 注释或普通字符串里提到同类名即成为伪锚点。破坏 A 容器时会报出 B 容器的名字（实测：注入 `sw__home-module-item-check` 却报 `sw__home-weekday-dot`），排查时会被指向错误位置 |
| **假绿** | 目标语句一旦漂出窗口（重构换行、中间插入代码），正则不再命中 → `doesNotMatch` 通过 → 违规静默放行 |

**检测**：断言里出现固定长度的 `{0,N}?` 距离窗口、或"类名/字符串"作为唯一锚点。
修正：改为**结构化绑定**——先由 `X.className = "..."` 建立"变量 → 类名"映射，再取 `X.innerHTML = ...` 的完整语句断言。既不认注释，也不依赖距离。取语句时要按引号状态扫描以跨过字符串里的分号（三元式 `a ? '<svg…>' : ""` 不能被截断）。

**同类提示**：变量名在同一文件里可能被复用给不同容器（本仓库 `title`/`label`/`row`/`grid` 各绑两个类名），映射表要用多值结构，否则"最后写入者覆盖"会指向错误元素。

**同族变体：窗口无界（D-395 命中 365 条，散在 38 个文件）**。把距离窗口写成无界，同样是与目标无关的断言：

```js
// ✗ "strong 之后任意位置出现过 min-width: 0"
assert.match(css, /strong[\s\S]*?min-width: 0/);
```

`[\s\S]*?` 会一路向后搜，于是断言退化成"文件里某处有 `strong`、其后再某处有 `min-width: 0`"——在一个有 104 处 `min-width: 0` 的 SCSS 文件里几乎恒真。D-395 的注入实验（从 `.sw-home-store__card-head strong` 规则块删掉 `min-width: 0`，仅留同文件其余 103 处）→ 断言**仍然通过**。与模式⑦前半个坑（漂出窄窗口）方向相反，但结论一样：**断言与它声称守护的规则无关**。

**关键区别：剥注释修不了这一类**。窗口无界的断言会被同文件他处的声明满足，所以只有改成**块级作用域断言**（"选择器 A 的规则块内声明了 B"）才有效——即把"文件级共现"升级为"块级包含"。迁移前必须先做两件事：块解析器自身的测试，以及逐条"删掉目标块里的声明 → 必须 FAIL"的判别力验证。

**升级后的新坑：块级断言会被"同选择器的覆盖规则"替身满足（D-396）**。块级作用域断言用"存在某条匹配选择器的规则声明了 B"（`some`）来判定，于是基础规则旁边只要有一条同名覆盖规则也声明了 B，把**基础声明删掉也不会失败**：

```scss
.sw-home-store__summary { max-width: 100%; }                       /* 基础规则：桌面端承重 */
@media (max-width: 560px) { .sw-home-store__summary { max-width: 100%; } }  /* 覆盖规则 */
```

2026-09-16 注入实证：删掉基础规则里的 `max-width: 100%`，`declaresIn(css, '.sw-home-store__summary', /max-width: 100%/)` **仍然通过**（手机端覆盖规则满足了 `some`）。这不是理论问题——本仓手机端覆盖块（`@media (max-width: 560px)`）里有多条这样的同名覆盖。
修正：助手支持 `{topLevel: true}`（只认没被任何 at-rule 包着的规则），改写时对基础规则一律带上它；反过来，若靶点本身**只在**媒体查询里（手机端专属规则），就必须显式不带它，并在注释里写明理由。**判别力验证是唯一的发现手段**——只做"删掉声明→FAIL"的实验，这条会漏（第一版就漏了 1 条：`summary max width full`）。

### ⑧ 源码扫描未剥离注释 / 白名单值从不被断言（D-392 命中 2 处，D-395 补 3 处 + 机制级防线）

契约门禁常用「源码里必须出现某段文本」来证明接线。两条通往假绿的路：

```js
// ✗ 路一：注释同样满足包含关系
const src = fs.readFileSync(indexTs, 'utf8');
assert.ok(src.includes('normalizeThumbCache(this.data[THUMB_CACHE_KEY]'));   // 把调用注释掉也过
```

```js
// ✗ 路二：白名单的值从未被读过，只遍历了 key
const allowlist = {THUMB_CACHE_KEY: ['normalizeThumbCache', 'sanitize']};
for (const key of Object.keys(allowlist)) { /* …只用了 key… */ }            // 值纯属装饰
```

路二比路一更隐蔽：文件头写着「每个 key 必须有清洗函数」，读起来是一条强约束，但断言**从来没有引用过那些函数名**——改名字、写错名字、甚至写成不存在的函数都不会失败。

**检测**：

- 断言读取的源码文本是否先剥了注释？剥离必须按引号状态扫描，否则字符串字面量里的 `//`（如 `"https://…"`）会让朴素正则把真实代码一起吃掉；
- 形如 `for (const k of Object.keys(X))` 的遍历，**问一句：`X[k]` 有没有被用到？** 没用到就是装饰。

**修正**：扫描前剥离注释（本仓 `tests/source-scan.cjs` 的 `stripComments()`，自带 `tests/source-scan.test.cjs` 自测）；白名单的值必须落成可失败的断言——例如「至少一个函数在源码里**被调用**」，并用反向否定环视排除 `export function name(` 这类 ambient 声明（声明存在 ≠ 调用存在），同时断言检查项数等于注册项数，防止只查子集。

**推荐入口与机制级防线（D-395）**：读源码一律走 `tests/source-scan.cjs` 的 `readSourceText(filePath)`（读取 + CRLF 归一 + 剥注释），不要各文件自己 `fs.readFileSync(...)`。**用法边界**：只用于源码——`docs/*.md` 里有裸 URL（表格行 `| [X](https://github.com/…) |` 不在引号/反引号内），按 JS 词法会被 `//` 截断成数据丢失，故 `docs/`、`package.json`、`README`、dist 路径一律不迁。**并且**：只修当下那几处等于规则永不触发，要用 `tests/source-scan-coverage.test.cjs` 把**覆盖度本身**冻结——"仍有裸读的文件集合"与登记清单必须**恰好相等**（新增裸读 → `unexpected`；债还清却忘删条目 → `stale`），配"审计面 ≥N"非空自检，理由标签取自固定词汇表且不得留死标签。同文件里的"检出函数自检"（对裸读返回 1、对 `readSourceText` 返回 0、对 `.json` 与 `docs/` 返回 0）用于防"门禁恒不触发"。

**D-395 的 3 处活假绿值得单独记**：`tests/home-store-contract.test.cjs` 有三条断言的被断言文本在 `src/home-store-ui.ts` 里**只存在于注释**（`card.dataset.availability === availabilityFilter`、`card.dataset.added === "true"`、`PREVIEW_KINDS`，逐条用 `git show HEAD:src/home-store-ui.ts` 核实）。其中两句还各配一个 `const x = …; void x;` **空转局部变量**——`void` 即丢弃，变量存在的唯一理由是"培育"注释以过门禁（TS 的未使用检查因此沉默）。**教训**：见到 `void x;` 这种形态先怀疑"为门禁而留的代码"；修断言的同时要把这类代码一起删掉，否则它继续为下一个门禁提供"可断言的文本"。另有一类**合法例外**要登记而非清除：断言的对象就是注释本身（JSDoc 声明的不变量、声明行尾的 key 说明），此时读原始文本是正确的，在文件里写明理由即可。

### ⑨ 叙述性历史断言无防线（D-393 命中 1 处）

**形态**：写进 JSDoc / 文档里的**历史事实**——「旧版本上限更大」「自 v0.2.0 起从未变过」「vX.Y 引入」——既不进代码审查视野，也无任何测试覆盖。它比失效门禁更隐蔽：失效门禁至少还在"跑"，而错误叙述只是安静地误导每一个后续读者（包括未来的自己），并会被当作决策依据沿用——D-393 正是如此，同一句错论被复制进 JSDoc + TODO + PROGRESS + DECISIONS **四处**。

**本仓处置**：

1. **每条历史断言必须附可复现的 git 命令**（或能被该命令直接证伪）。D-393 用 `git log -S` + 逐 tag 统计 key 数，把路线图那句「8 个数据 key」精确定位到 v0.16.9 时点（当时确实 8 个，现状 13 个），而不是含糊地写"旧数字"。
2. **数量/边界类事实以代码为准，并配文档契约门禁**：`tests/storage-compatibility-matrix.test.cjs` 断言文档声明的 key 集合、分类、上限数字与 `constants.ts` / `DEFAULT_LIMITS` **双向**一致——文档从此不能悄悄过期（负向验证 4 轮：删表格行 / 改分类 / 改数字 / 代码新增 key 均精确失败）。
3. **不确定就不断言**：宁可写"当前实现如此"，不写"一向如此"。一次 `git log -S` 的代价远低于一条错论的传播成本。

**与模式⑧的分工**：⑧ 管"测试扫描源码时被注释满足"（断言恒真），⑨ 管"人读的叙述本身是错的"（事实失真）。

## 三、验证协议（强制）

改完或新增门禁后，**必须**做负向验证：

1. **同条件注入**：向被测对象注入一个该门禁声称能拦住的具体违规；
2. **跑门禁**，按**失败项名称**确认目标断言触发（只看"失败数"不够，其他测试的失败会掩盖）；
3. **恢复**被测文件，并校验字节级还原；
4. 有条件时做**前后对比**：用旧断言跑同一注入，确认它漏检——这才证明修复有价值。

> **只跑"改完仍然通过"证明不了任何事。** D-360 中 `release-quality-report` 的修复前状态是绿的，修复后也是绿的，唯一的区别只在注入违规时才显现。

### 注入时的六个陷阱

- **自指**：注入的违规文本若出现在断言所在文件中，会让断言恒真（见模式⑥）。D-395 又遇一次：覆盖率门禁的自测夹具里写着 `fs.readFileSync(path.join(r, 'src', 'a.ts'), 'utf8')` 这句模式串，于是把自己判成裸读——按惯例把助手与自身一并排除。
- **两次写入互相覆盖**：当"注入目标"与"测试文件"是同一个文件时，先写旧版再写注入版会覆盖前者，导致"修复前"实际跑的是修复后版本。D-359 中差点因此得出错误结论。
- **换行符被工具静默改写**：Git Bash 的 `sed -i` 编辑 **CRLF** 文件时会把整个文件转成 LF（D-392 实测：`src/util.js` 由 68940 bytes 变 67638 bytes，只差每行 1 字节，肉眼与 `git diff` 都看不出）。后果是「还原」后哈希对不上，且按换行锚定的切片会静默失配。**还原步骤应改用逐字节脚本替换 + 哈希校验，并在还原后确认换行符计数**；`sed -i` 只用于已确认是 LF 的文件。
- **混淆实验（D-396 第三批，差点放过）**：注入必须"外科式"——写回的文件除注入那一行外应逐字节等于原文件。若注入工具图省事把**剥注释后的行**同时用于定位与写回，就等于每次注入都顺手删掉全文件注释，差别不止注入那一处。本仓契约测试自己也会剥注释，所以这种混淆**当时完全观测不到偏差**——"恰好没撞上"不等于"安全"（若测试文件含有基于原始字节/`dist/` 产物的断言就会现形）。**正确做法：剥注释的行只用于定位，原始行用于写回，并显式断言两份行等长**。
- **对照实验不同源（D-396 第三批，一次真实的自我误判）**：做"旧写法是否仍绿"的病态对照时，**注入值必须与另一组实验完全相同**，否则会把"两组实验本就不同"读成"工具漏采"。实测：手工注入 `font-weight: normal` 得 2 条失败，工具对"同一注入"报 0 条，我据此判定工具采集有 bug——真相是工具的样本合成取正则**首个交替分支**（`/(?:400|normal)/` → `400`），`400` 满足"字重必须是数字"的整文件不变式、`normal` 不满足。**处置：工具必须打印"到底注了什么"，且负断言的每个交替分支各注一次**（顺带得到更强证据：关键字样本无一例外触发数字不变式）。
- **验证工具必须声明自己的覆盖边界**：只认单行 `assert.ok/equal(declaresIn(...))` 形态的工具，**不得**让"全部通过"被读成"整个文件都验过了"。D-396 第三批的工具现在会把**提取不到的测试逐个点名**（实测 31 条里 18 条），并要求用探针通道（`--probe`，支持插入/删除/深度放宽/期望失败项核对）覆盖循环式与 `deepEqual` 式断言——**禁止退回手写注入脚本**（手写正是上面那次误判的温床）。

### 运行与取证时的陷阱

- **失败项名称会丢**：总门禁（`pnpm verify:release`）输出**一律重定向到日志文件再 grep**，不要 `| tail`。D-395 首轮出现过 1 次 `# fail 1`，正因为用了 `| tail`，连失败项名字都没留下——重跑全绿也无法回溯那次到底是谁失败。
- **不要把带反斜杠的模式交给 shell**：本工具环境的 Git Bash 会吞掉/折叠 `\\`，`grep '\[\\s\\S\]'` 会静默变成别的正则（实测对 365 处真实存在的模式报 0 命中），`grep -c $'\r'` 也会被当成普通 `r`（把 LF 文件误判成 CRLF）。**含反斜杠、`$'…'` 转义的检查一律写成脚本落盘再执行**（Node/Python 均可），并把"命中 0"当作可疑信号而不是结论。
- **给原生 Windows 程序传路径要用盘符形式**：`git commit -F /c/Users/…/msg.txt` 会 `fatal: could not read log file`，换 `C:/Users/…/msg.txt` 立即成功（node 同理）。多行注入/提交信息先落盘再引用，既避开转义问题也留下痕迹。

## 四、已知的**非缺陷**（避免误报）

以下形态在本仓库中经过确认属于**有意设计**，不必"修复"：

| 形态 | 为何合理 |
| --- | --- |
| `if (!fs.existsSync(X)) return;` 产物缺失即跳过（8 处） | `verify:release` 链含 `pnpm build`，本地产物必然存在；CI 用 `SW_REQUIRE_PACKAGE=1` 强制，且 `ci-gate-consistency.test.cjs:29` 守护该设置 |
| `t.skip(...)` 缺产物时跳过 | 同上 |
| `if (missing.length) assert.deepEqual(missing, [])` | 条件冗余但语义无害（等价于无条件断言） |
| 文档级断言（只校验文档提及某关键词） | preflight 类契约的固有形态；**可接受，但不应被当作行为保证** |
| 两条逻辑等价的断言并列 | 冗余但确实能检出真实不一致 |

## 五、一键扫描

以下模式扫描可快速定位可疑点（**不能替代人审**，模式匹配只能发现已知形态）：

```js
const RISK = [
    {name: '恒真-条件表达式', re: /assert\.equal\(\s*typeof[^,]*,\s*[^'"]*[?:]/},
    {name: '恒真-自造常量',   re: /^\s{2,}const\s+\w+\s*=\s*(\[[^\]]*\]|\{[^}]*\})\s*;?\s*$/},
    {name: '空集合风险',      re: /assert\.(deepEqual|ok)\(\s*[\w.$]+\.(filter|map)\([^)]*\)\s*,\s*\[\]\s*\)/},
    {name: '自造正则',        re: /^\s{2,}const\s+\w+\s*=\s*\/.*\/[a-z]*\s*;?\s*$/},
    {name: '自指-扫描自身',   re: /readFileSync\(\s*__filename/},
    {name: '邻域窗口锚点',    re: /\[\\{1,2}s\\{1,2}S\]\{\s*\d+\s*,\s*\d+\s*\}\?/},
    {name: '白名单值未断言',   re: /Object\.keys\(\s*\w*(?:[Aa]llowlist|AllowList)\w*\s*\)/},
    {name: '源码扫描未剥注释', re: /const\s+\w+\s*=\s*fs\.readFileSync\([^)]*\)\s*;?\s*$/},
    {name: '无界窗口断言',    re: /\[\\s\\S\]\*\?/},
    {name: '门禁驱动型空转',  re: /^\s*(const|let)\s+\w+\s*=.*;\s*\n\s*void\s+\w+\s*;/},
    {name: '无据历史断言',    re: /从未(变过|改过|变化)|旧版本(上限)?更大|自 ?v\d+(\.\d+)* ?(起|以来)/},
];
```

补充（D-396）：新的块级断言若靶点是**基础规则**，必须带 `{topLevel: true}`。粗筛可用 `declaresIn\((?![^)]*topLevel)`——它会连带报出"靶点本身只在媒体查询里"的合法写法，需人审逐条确认（这正是判别力验证该做的事，不能只看扫描结果）。

## 六、当前未解决项（需结构性改动）

| 项 | 说明 |
| --- | --- |
| 版本/tag 约束无共享校验模块 | `rollback-preflight`、`release-docs-safety` 各自定义正则；生产与测试可能漂移。彻底修复需抽出共享模块供双方引用 |
| 构建产物无两次构建对比 | "可复现归档"缺少自动化证据（D-083 那次的结论来自人工验证）。需在 CI 跑两次构建比对哈希 |
| **无界窗口断言已全部迁移（T-6280 完成，2026-09-17）**：365 条 / 38 文件 → 0；债清单的 css-window-scope 标签随之退役 | 均可被同文件他处的声明满足（D-395 注入实证）。修法是 CSS 块级作用域断言助手 + 逐文件迁移；**不能机械替换**，需先做块解析自测与"删掉目标声明必须 FAIL"的判别力验证。助手与机制已就位（`tests/css-block-scan.cjs`，含 `{topLevel: true}` 与 `{atRule: /…/}` 作用域，D-396），判别力验证已工具化（`scripts/css-assertion-injector.cjs`，自动跑"精确 FAIL + 兄弟不受波及 + 旧写法仍绿"三件套，规则式与 `deepEqual` 式断言用 `--probe`），普查口径已改为以债清单为准（`scripts/css-window-census.cjs`，债内/债外分组并点名零命中文件）；已迁 6 个文件（`store-width-contract` 15、`store-font-weight-contract` 12、`store-box-sizing-contract` 12、`store-line-height-contract` 14、`store-hyphenation-contract` 14、`store-font-metrics` 11、`store-typography-contract` 11（普查口径；另清掉 1 条普查扫不到的**手写窗口**）、`store-numeric-typography` 13、`store-selection-contract` 11（`none` 侧覆盖 5 个选择器的**两条**分组规则，注入时共因最多——5 条断言共享 2 条规则）、`store-text-wrap-pretty` 11（含**删除 1 条假绿**）、`store-focus-navigation-contract` 10（`__size` 锚点靠前缀匹配 `__sizes` 假绿——**实证 CSS 真缺口**：size tile 从未声明 touch-action，已补上一行）、`store-stacking-contract` 9（含删除 1 条迁移后逐字重复的断言）、`store-preview-context-contract` 10（TS 侧 1 条改写为精确调用断言并负向验证；`{atRule}` 首次用于钉窄屏 chip 缩小）、`store-word-break-contract` 8（含**删除 2 条假绿**：strong/span 从未声明 break-word；"pairs" 兑现为配对块双声明）、`store-motion-accessibility` 10（`{atRule}` 钉 reduce 分支；**顺带去重 CSS**：card 的 transition 覆盖在两个 reduce 块各写一份，删被包含的一份；复合分支 `560px and reduce` 用条件链**精确等于**判别），共 171 条，判别力逐个验证（同选择器多规则的删除探针只达首条，个别用 md5 手工补验——局限已记入工具头）、`store-scroll-contract` 7（含**删除 1 条手写窗口**：`gridBlock` 按"第一个块尾"截块再做否定检查——第二例普查扫不到的变量截块；另删 1 条迁移后逐字重复）、`store-preview-disclosure-contract` 8（TS 侧 1 条精确调用断言 + 手工负向验证；`&__meta-chip` 系列按展开选择器，两个 tone 类收紧到具名块）、render-state 6（TS 侧 1 条改"锚点 + 有界窗口 + 顺序检查"，aria-busy/focus-kind 嵌套按展开选择器）、ui-polish 5（移动端 search 分支用 `{atRule}` 钉 560px）、search-interaction 7（TS 侧 2 条改"锚定 click 处理器 + 顺序检查"；height 断言收紧行首锚定防 min-height 替身）、filter-state 6（空 tab 数据属性选择器尾部锚定）、render-stability 5、card-navigation 1（focus-visible 具名块）、focus-recovery 1（分组规则 user-select）、a11y-navigation 1（TS 侧改"锚定激活函数 + 有界窗口"并负向验证）、rerender-focus 2（TS 侧改"锚定入口 + 有界窗口"）、pending-card 2（ready/pending 创建块各自锚定）、actions 7、will-change 7（will-change 钉 hover/focus 具名交互块；逐规则否定；删 3 条冗余/重复）、performance 4（content-visibility/contain-intrinsic-size 逐规则否定；删 1 条冗余）、forced-colors 3（Canvas 钉 forced-colors 分支具名规则；手写 forcedBlock 截块删除，改对分支内全部规则逐规则否定 animation/opacity/rgb；删 1 条冗余）、print 7（print 分支内各规则用 {atRule} 钉；3 条重复窗口合并删 2、冗余删 1）、group-semantics 4（BUILTIN_GROUPS 数组锚定 + 有界窗口）、sync-panel 3（syncFinish 锚定 + 有界窗口）、external-availability 8（5 个 adapter 各自「模块标记 + 2200 字符有界窗口」，实测距离 1034~1626）、mobile-external 8（560px/复合分支用 {atRule}；sort 控件兑现为 flex: 1 1 46%；guide link 锚定 + 有界窗口），共 242 条，判别力逐个验证。**覆盖率门禁的非空自检阈值随债清减同步重校准**（T-6278 时代按 43 条债钉的 `>=35` 在债剩 34 时误伤正常进展，改为防塌缩下限 `>=3`——精确相等由集合比对保证，负向验证照做：注入扫描失效 → `audit surface collapsed: only 0 files matched` 精确 FAIL）——`store-hyphenation` 另实录工具陷阱：插入文本以 `-` 开头会被当成删除式探针，现支持 `-` 转义），其余按 `SOURCE_SCAN_DEBT` 的 `css-window-scope` 组逐文件推进，迁一条删一条。**注意**：① 是否漏检取决于右侧模式在同文件里的稀有度，**必须逐条注入实测**（现有两个方向相反的样本：8/8 全漏检 vs 12 条里仅 2 条漏检）；② 迁移时常撞见**名不副实**与**纯冗余**断言，改写/删除前先侦察真实数据（例：`avoids px lock` 原来检查的是相邻的 `height:`；全文件禁像素行高会假红——文件里确有 7 处合法像素行高，须按受管块收窄） |
| **`SOURCE_SCAN_DEBT` 的理由标签与内容的相符性**（T-6282，已加门禁） | 历史缺陷：`DEBT_REASONS` 只校验"标签取自词汇表 + 说明 ≥20 字 + 不留死标签"，**从不校验标签与文件内容是否相符**——实测 `kernel-endpoint-guard.test.cjs` 贴着 `css-window-scope`，却一条窗口断言都没有（其 `[\s\S]*?` 是 `source.match(...)` 里的区间截取，不在 assert 内），它真正的债是读 `src/index.ts` 原始文本。**已修**：`tests/source-scan-coverage.test.cjs` 的 `DEBT_REASON_CHECKS` 给全部 4 个标签各配一条**必要条件**级内容判据（作用在剥注释后的文本上），并配两级自检（词汇表↔判据表双向相等；每条判据必须至少拒绝一个反例样本，防改成恒真）；该文件已改走 `readSourceText` 并移出债清单。**遗留的开放部分**：判据是必要条件而非充分条件——"标签与内容明显不符"能拦，"理由是否仍然成立"仍需人审 |
