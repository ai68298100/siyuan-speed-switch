# 门禁有效性审查清单

> 来源：D-354（隔离门禁漏检 27/31）、D-359（两处恒真断言）、D-360（4 处断言零外部状态）、D-390（邻域窗口锚点导致归因错误 + 假绿）、D-392（白名单值从不被断言 + 源码扫描可被注释满足）五轮审计的方法论固化。
> 用途：**新增或修改任何门禁/契约测试时，按本清单自查一遍**，避免重复交付"看起来在守护、实际从不触发"的测试。

## 一、为什么需要这份清单

五轮审计共发现 **10 处失效门禁**，它们的共同点不是"写错了逻辑"，而是**断言从不因违规而失败**。这类缺陷不会在代码审查中被发现——测试是绿的，覆盖率数字也正常。

**核心原则：一个门禁只有在"注入违规时它确实失败"之后，才算存在。**

## 二、八类失效模式

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

### ⑧ 源码扫描未剥离注释 / 白名单值从不被断言（D-392 命中 2 处）

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

## 三、验证协议（强制）

改完或新增门禁后，**必须**做负向验证：

1. **同条件注入**：向被测对象注入一个该门禁声称能拦住的具体违规；
2. **跑门禁**，按**失败项名称**确认目标断言触发（只看"失败数"不够，其他测试的失败会掩盖）；
3. **恢复**被测文件，并校验字节级还原；
4. 有条件时做**前后对比**：用旧断言跑同一注入，确认它漏检——这才证明修复有价值。

> **只跑"改完仍然通过"证明不了任何事。** D-360 中 `release-quality-report` 的修复前状态是绿的，修复后也是绿的，唯一的区别只在注入违规时才显现。

### 注入时的两个陷阱

- **自指**：注入的违规文本若出现在断言所在文件中，会让断言恒真（见模式⑥）。
- **两次写入互相覆盖**：当"注入目标"与"测试文件"是同一个文件时，先写旧版再写注入版会覆盖前者，导致"修复前"实际跑的是修复后版本。D-359 中差点因此得出错误结论。
- **换行符被工具静默改写**：Git Bash 的 `sed -i` 编辑 **CRLF** 文件时会把整个文件转成 LF（D-392 实测：`src/util.js` 由 68940 bytes 变 67638 bytes，只差每行 1 字节，肉眼与 `git diff` 都看不出）。后果是「还原」后哈希对不上，且按换行锚定的切片会静默失配。**还原步骤应改用逐字节脚本替换 + 哈希校验，并在还原后确认换行符计数**；`sed -i` 只用于已确认是 LF 的文件。

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
];
```

## 六、当前未解决项（需结构性改动）

| 项 | 说明 |
| --- | --- |
| 版本/tag 约束无共享校验模块 | `rollback-preflight`、`release-docs-safety` 各自定义正则；生产与测试可能漂移。彻底修复需抽出共享模块供双方引用 |
| 构建产物无两次构建对比 | "可复现归档"缺少自动化证据（D-083 那次的结论来自人工验证）。需在 CI 跑两次构建比对哈希 |
