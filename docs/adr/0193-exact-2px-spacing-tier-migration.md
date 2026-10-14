# ADR 0193：2px 复合间距刻度精确迁移

日期：2026-10-14  
状态：已接受（T-7267）

## 背景

T-7266 已覆盖 4/6/8/12/16/24px 六档间距，但生产样式仍有一批可精确对应 2px 的紧凑间距分量。它们集中在顶栏、设置项、移动筛选、工作台卡片和片段实验室等密集控件中，继续直接写字面值会让同一刻度在后续调整时容易漏改。2px 与现有 2px 基准栅格一致，适合增加为最小语义档位；负值、函数内部值和结构化安全区表达式仍不满足等值迁移条件。

## 决策

- 在 `_00-tokens.scss` 增加编译期 `$sw-space-2xs: 2px`，并由同一来源生成运行时 `--sw-space-2xs`。
- 只迁移顶层、正值且精确命中 2px 的 `gap`、`padding`、`margin` 家族分量；复合简写只替换命中的分量，其余值和 fallback 保留。
- 生产样式门禁把 2px 与既有六档一起检查，直接写入 2px 的生产声明必须失败；门禁负向注入完成后恢复源文件字节。
- 不把新增 token 宣传为性能优化；该批目标是维护一致性和后续可调性。

## 实测

| 指标 | 收敛前 | 收敛后 | 变化 |
| --- | ---: | ---: | ---: |
| 间距 token 覆盖 | 789/1142（69.09%） | 842/1142（73.73%） | +53 条，+4.64 个百分点 |
| 间距字面量声明 | 353 | 300 | -53 |
| 间距唯一字面量值 | 56 | 49 | -7 |
| Sass expanded CSS | 436956 B | 439058 B | +2102 B |
| Chromium 场景/元素差异 | — | 30/480 | 计算样式与几何差异均为 0 |

当前生产构建为 `dist/index.css` 386730 B、`dist/index.js` 1142426 B、`package.zip` 596562 B；578 KiB（591872 B）仓库包体门禁仍超出 4690 B，减量工作完成前不得发布。

## 验证

- `tests/spacing-token-migration.test.cjs`、`tests/space-scale-gate.test.cjs` 与商店定向测试通过；负向注入将 `_01-base-controls.scss` 的真实 `gap: var(--sw-space-2xs, 2px)` 临时改为裸 `gap: 2px` 后，迁移门禁按预期失败。
- 负向探针退出码为 1，源文件 SHA-256 注入前后均为 `79807C95C0061C805B14DDD27D658A5B04FA84D6C7073CBA39E09EC3A1E3EDDF`；日志见 `.artifacts/t7267-negative-spacing2-probe.log`。
- 30 个 Chromium 场景、480 个元素的计算样式与几何对照差异为 0，见 `.artifacts/t7267-style-compare.json`；迁移与构建证据见 `.artifacts/t7267-spacing2-migration.json`、`.artifacts/t7267-token-audit-after.json`、`.artifacts/t7267-build.log`。
- `pnpm exec tsc --noEmit` 与 `git diff --check` 通过；完整 `verify:release` 需在包体减量和版本更新后重新执行。

## 边界

本批仅处理可证明等值的 2px 正向分量，不改变设计密度、组件几何或响应式断点。2px 之外的特化值、负偏移和函数表达式继续保留，不能为提高覆盖率强行归档。真实思源宿主、读屏和 Android 验收仍按 `BLOCKERS.md` 后置。
