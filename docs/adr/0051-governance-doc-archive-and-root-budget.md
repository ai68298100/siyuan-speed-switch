# ADR 0051：治理文档归档与根目录体积门禁（P0-2）

- 日期：2026-09-17
- 状态：已接受（T-6294）
- 范围：`docs/archive/` 建立、`AGENTS.md` 协议改写、`tests/root-doc-budget.test.cjs` 新增、
  `tests/protocol-compat-claim.test.cjs` 扫描面修正

## 背景（由实测数据导出）

根目录曾堆积三份治理账本：

| 文件 | 字节 | 行数 | 内容 |
|---|---:|---:|---|
| `TODO.md` | 454,957 | 8,175 | 任务账本（T-0001…T-6289，6186 已勾选 / 84 未勾选） |
| `DECISIONS.md` | 237,575 | 539 | 决策账本（D-001…D-396） |
| `PROGRESS.md` | 228,393 | 565 | 进度与发版流水 |

合计 **920,925 字节**，占根目录 Markdown 总量 **89.3%**（1,031,001 → 归档后 110,076）。
三者互相覆盖、只增不删，必然过期；且 2026-09-17 实测已**无人回写**——当期任务
T-6290+ 全部落在 `docs/dev-plan-*.md` 与 ADR，账本只是历史。

## 决定

1. `git mv` 三份到 `docs/archive/`，**逐文件 md5 校验一致**（零字节漂移）；
   保留 `ROADMAP.md`、`BLOCKERS.md`、`docs/adr/` 在根目录。
2. 新增 `docs/archive/README.md`：声明"冻结快照、只读、不追加"，并作为**归档清单的
   唯一事实源**（门禁直接解析该文件，不硬编码清单）。
3. 新增 `docs/acceptance-log.md`，承接 `PROGRESS.md` 原有的"追加脱敏验收摘要"职责。
4. 改写 `AGENTS.md` 协议的事实源指向。
5. 新增 `tests/root-doc-budget.test.cjs` 防止复发。

### 归档的真正风险在引用面，不在搬运

若只做物理搬运，协议会指向不存在的路径。勘察出 **7 处指令性引用**，全部改写：

| 位置 | 原指向 | 改后 |
|---|---|---|
| `AGENTS.md` 第 3-7 行 | 每轮读 TODO/PROGRESS/BLOCKERS/DECISIONS | ROADMAP → BLOCKERS → `docs/adr/` → `docs/dev-plan-*.md`；归档区只读检索 |
| `docs/acceptance-runbook.md:3` | TODO | `docs/archive/TODO.md` |
| `docs/acceptance-runbook.md:11` | 勾选 TODO + 追加 `PROGRESS.md` | 本清单标注 + 追加 `docs/acceptance-log.md` |
| `docs/desktop-acceptance-template.md:35` | 追加 `PROGRESS.md` | 追加 `docs/acceptance-log.md` |
| `docs/path-filter-desktop-plan.md:168` | 记 DECISIONS | 记 ADR |
| `docs/workspace-capability-wiring-plan.md:49` | 对应 DECISIONS 条目 | 对应 ADR 条目 |
| `docs/refactor-candidates.md:5` | TODO 立项 | ADR 立项 |

**改写规则：指令性引用（写入/读取目标）必须改；叙述性引用保持原样。**
后者是历史断言，改动等于篡改历史（本仓明令禁止）。

### 上限取值依据（不是拍脑袋，也不是钉死当前值）

- **单文件 150 KiB**：归档三份中最小的是 228,393 B，现有根目录最大文件 37,216 B。
  150 KiB 落在两者之间 ⇒ 既能容纳 README 正常增长（约 4.3 倍余量），
  又能在任一归档账本复活回根目录时精确拦截。
- **合计 300 KiB**：归档后实测 110,076 B，余量约 2.7 倍；归档前 1,031,001 B 远超此线。
- **数量 8**：归档后 5 份，留 3 份余量。

## 意外发现：归档把历史叙述带进了既有门禁的扫描面

`tests/protocol-compat-claim.test.cjs` 扫描 `docs/**` 收集"只读契约自 vX 起向后兼容"
的对外承诺并要求版本唯一一致。三份账本原来在**根目录**（扫描面外），归档后进入
`docs/archive/`（扫描面内），带来 **v0.16.17 ×2 与 v0.7.0 ×1** 的历史叙述，
与活文档统一的 **v0.16.16 ×3** 冲突 ⇒ 门禁假红。

处置：**按前缀排除 `docs/archive/`**，理由是该目录已被自身政策声明为"不代表当前承诺"。
计入它只会强制二选一——改写历史（禁止）或永久假红。

同时补一条**"排除承重"自检**：断言归档区确实含有被排除的声明；
否则该排除条件会退化成一个永远成立、将来可被无声删除的空操作。

## 验证

- 新增门禁 4 项：**负向验证 4 组**（单文件超限 / 合计超限 / 归档复活 / 工作流失根），
  每组**精确 1 项 FAIL、兄弟 3 项不受波及**，还原后 md5 零漂移、无残留注入物。
  - 第一版注入设计有缺陷（200 KiB 同时突破单文件与合计上限，无法证明两条断言各自
    独立上膛），改为 160 KiB 后精确命中单文件分支。
- 修改既有门禁：**负向验证 3 组**（去掉归档排除=旧写法 / 活文档引入 v0.15.0 漂移 /
  归档区清空致排除退化），每组精确 1 项 FAIL、兄弟 1 项不受波及、还原零漂移。
- 全量 **5879/5879**（原 5875，+4）；测试文件 172 → 173；`verify:release` EXIT=0，
  移动端 smoke 70 项、布局门禁、Chromium smoke 全绿，总 PASS 80。
- 产物：`dist/index.js` 631,453 B、`index.css` 145,577 B、`package.zip` 321,070 B。

## 教训（两条，均已当场修正）

1. **影子绑定不只出现在产品代码里**。负向验证脚本里 `for ... fails in results`
   重新绑定了外层的 `fails`，使"还原后全绿"误报 False——与 P1-1a 的
   `renderMobileList` 局部闭包是同一类缺陷。验证工具本身也必须有正确性保证。
2. **"命中 0"永远当可疑信号处理**。CRLF 文件用 LF 片段做多行替换会静默命中 0 次；
   补丁脚本必须按目标文件行尾自适应，且断言命中次数。

## 边界

- 本门禁只约束**体积与去向**，不校验归档内容是否仍然正确（那本就是历史）。
- `docs/archive/README.md` 的清单是手工维护的契约；新增归档项必须同步登记，
  否则门禁的"双向"只剩单向。
- 根目录字节快照存在"记录即失效"耦合：README 被打进 `package.zip`，改 README 会改 zip。
  本批按"快照记在最后一次构建之后"处理，当前 321,070 B 与最后一次构建一致。
