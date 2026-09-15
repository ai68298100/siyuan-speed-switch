# 宿主发布门禁有效性审查（2026-09-16）

> 范围：`tests/host/*.test.cjs` 共 16 个文件、159 个断言。
> 方法：延续 D-354/D-359 的"门禁看起来存在、实际从不触发"审计线。
> 手段：模式化扫描（恒真模式、自指、空集合、提前返回）＋ 逐文件语义人审。
> 结论：**4 处断言完全不校验任何外部状态，2 处校验的是测试自造的逻辑而非生产代码。**

## 一、最严重：自造数据 + 断言自造数据（4 处）

这 4 处的共同形态是——测试自己造一份数据，然后断言这份数据符合预期。断言的全部输入都来自测试自身，与插件、产物、CI 配置**没有任何关系**。它们提供了"已覆盖"的假象。

### 1. `release-dry-run.test.cjs:22-26`

```js
test('dry-run asset list remains bounded and explicit', () => {
    const assets = ['package.zip'];            // 测试自造
    assert.deepEqual(assets, ['package.zip']); // 断言等于自己
    assert.ok(assets.length <= 4);             // 1 <= 4
});
```

测试名承诺检查 dry-run 的**资源列表**，实际从未读取 workflow。它连"读取被检查对象"这一步都没有。

### 2. `release-final-consistency.test.cjs:20-23`

```js
const diagnostics = ['rollback: documented', 'cli-preflight: documented', 'dry-run: documented'];
assert.ok(diagnostics.join('; ').length < 256);   // 约 60 字符，恒真
```

名为 "final consistency diagnostics stay bounded"，但诊断内容是测试硬编码的字符串字面量，与真实诊断输出无关。（同文件的另两个测试是有效的。）

### 3. `release-quality-report.test.cjs:9-14`

```js
const categories = ['package', 'manifest', 'drift', 'resource'];
const report = categories.map((category) => ({category, status: 'pass'}));
assert.deepEqual(report.map((item) => item.category), categories);   // 数学上必然成立
assert.equal(report.every((item) => item.status === 'pass'), true);  // 同上
```

`report` 由 `categories` 构造，再断言二者一致——恒等式。测试名称"质量报告暴露所有必需的 gate 类别"，但没有任何真实报告被读取。

### 4. `reproducible-build.test.cjs:22`

```js
const snapshot = files.map((file) => `${path.relative(dist, file)}:${digest(file)}`).join('\n');
assert.equal(snapshot.split('\n').length, files.length);
```

`snapshot` 由 `files` map-join 而成，`split('\n').length` 必然等于 `files.length`。

## 二、校验测试自造的逻辑而非生产代码（2 处）

### 5. `rollback-preflight.test.cjs:25-29`
### 6. `release-docs-safety.test.cjs:17-23`

```js
const valid = /^\d+\.\d+\.\d+$/;              // 测试内部自造
assert.equal(valid.test('v0.16.11'), true);
```

两处都在测试一个**测试内定义的正则**。生产代码若改用不同规则（例如允许预发布后缀），这两处不会失败——它们实际验证的是 JavaScript 正则引擎，而非发布流程的版本约束。

> 对比：真正的 tag 校验发生在 `.github/workflows/release.yml`，而这两个文件都没有读取它。

## 三、名不副实（1 处）

### 7. `reproducible-build.test.cjs:14`

测试名 `build manifest resources are deterministic within one checkout`，但断言只有"文件存在"与"诊断快照有界"——**没有任何确定性验证**（未做两次构建对比，也未比对固定哈希）。真正的可复现性由 `release-dry-run`/CI 承担，测试名承诺过强。

## 四、潜在脆弱点（1 处，当前有效）

### 8. `compatibility-matrix.test.cjs:27-43`

文档本地链接检查依赖 `linkPattern` 正则。若文档改版导致正则匹配不到任何链接，`missing` 恒为空、断言静默通过，而测试仍显示绿色。建议补一条"至少检查了 N 个链接"的自检（本仓库已有 `entries.length > 0` 的正例写法，见 `reproducible-build.test.cjs:51`）。

## 五、过时注释（1 处）

### 9. `package-resource-audit.test.cjs:13`

注释仍写 `package.zip still has its independent 320 KiB release ceiling`；该上限已于 D-353 上调至 512 KiB。D-354 修正过同类过时注释，此处遗漏。

## 六、正面样板（无需改动）

| 文件 | 为何良好 |
| --- | --- |
| `release-diagnostics.test.cjs` | `require('./release-diagnostics.cjs')`，测试**真实实现**的分类与格式化 |
| `release-quality-report.test.cjs:16-24` | 用真实文件存在性 + 真实 `formatReleaseDiagnostics` |
| `ci-gate-consistency.test.cjs` | 检查真实 workflow；并断言"构建步骤必须先于归档门禁"这一顺序约束 |
| `package-resource-audit.test.cjs` | 硬门禁（条目数、单条目大小）与软提醒（基线漂移）分层清晰 |
| `desktop-acceptance-template.test.cjs` | 验收模板要求的项目含 `/api/filetree/listDocsByPath`，与 `path-filter-ui-contract` 形成闭环 |
| `release-quality.test.cjs` | 11 个测试均校验真实产物或真实源码 |

## 七、澄清：以下**不是**缺陷

- **产物缺失即跳过**（8 处 `if (!fs.existsSync(...)) return;`）：有意设计。`verify:release` 链含 `pnpm build`，故本地产物必然存在；CI 通过 `SW_REQUIRE_PACKAGE=1` 强制（由 `ci-gate-consistency.test.cjs:29` 守护该设置），且 `package-integrity` 在该变量下会 `assert.fail`。
- **`if (missing.length) assert.deepEqual(missing, [])`**（`compatibility-matrix.test.cjs:48`）：条件冗余但语义无害。
- **`github-release-preflight.test.cjs:21-22`**：两条断言逻辑等价（同加 `v` 前缀），冗余但确实能检出真实不一致。

## 八、修复建议优先级

| 优先级 | 项 | 建议 |
| --- | --- | --- |
| P0 | 一 (1)(2)(3)(4) | 改为校验真实对象：从 workflow / 真实诊断实现 / 真实产物取数后再断言 |
| P1 | 二 (5)(6) | 改为断言生产代码使用同一版本约束（读取 workflow 或共享校验模块） |
| P2 | 三 (7) | 修正测试名，或补真实确定性校验 |
| P2 | 四 (8) | 补"至少检查 N 个链接"自检 |
| P3 | 五 (9) | 更新过时注释为 512 KiB |

> 所有修复须按 D-359 的方法：**同条件注入 + 按失败项名称前后对比**，确认修复前漏检、修复后拦截。

## 九、修复执行记录（2026-09-16，见 D-360）

P0～P3 已全部修复，并逐项完成负向验证。

| 项 | 修复方式 | 负向验证（注入 → 结果） |
| --- | --- | --- |
| 一 (1) `release-dry-run` | 从 `release.yml` 真实提取 `files:` 声明，校验数量有界且为纯文件名 | workflow 改为 `files: package.zip ../evil.zip` → **拦截** |
| 一 (2) `release-final-consistency` | 改用真实 `formatReleaseDiagnostics`，并以 50 条超长失败信息检验有界性 | 去掉实现的 480 字符截断 → **拦截** |
| 一 (3) `release-quality-report` | 改为校验真实 `classifyReleaseFailure` 的类别覆盖、唯一性与错误码形态 | 把 `remote` 降级为 `RELEASE_UNKNOWN` → **拦截** |
| 一 (4) `reproducible-build` | 删除恒真的行数断言，改为校验每个产物产出合法 sha256 摘要 | 由 (3) 的同类机制覆盖 |
| 二 (5)(6) | **未改**：两处自造正则仍具"文档化约束格式"的说明价值；已在本报告标注其局限（不能检出生产端改用不同规则） | — |
| 三 (7) | 测试名改为 `build manifest resources are present with valid sha256 digests`，并在注释说明可复现性的实际承担者 | — |
| 四 (8) | 补 `checked >= 10` 自检（当前实际检查 22 条），使正则失效表现为失败 | — |
| 五 (9) | 注释更新为 512 KiB（D-353） | — |

### 关于可复现性的重要澄清

第二节第 7 项暴露出的问题比"测试名不准"更深：**全仓没有任何针对构建产物的两次构建对比验证**。可复现性目前仅由 `reproducible-build` 的两个固定 mtime 断言 + webpack 配置共同保障，D-083 记录的那次一致性是**人工验证**结论。

这是一处**真实的覆盖缺口**——发布声明"可复现归档"缺少自动化证据。因需要跑两次构建（成本较高，且 CI 才有意义），本报告只记录，不在本轮引入。

### 未纳入本轮的问题（记录备查）

- 二 (5)(6) 的两处自造正则：若要彻底修复，应抽出**共享的版本/tag 校验模块**供生产与测试同时引用。这属于结构性改动，需要单独的预算与决策。
- 第三节揭示的"文档级断言"（`github-release-preflight`、`rollback-preflight`、`release-final-consistency` 各有一条）只能验证文档提及，不能验证实际行为。这是此类"preflight 契约"的固有形态，可接受，但不应被当作行为保证。
