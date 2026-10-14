# ADR 0191：共享圆角刻度的编译期单一来源

日期：2026-10-14
状态：已接受（T-7265）

## 背景

样式审计中的圆角覆盖率为 141/345（40.87%）。其中 6px 与 8px 直接字面量共 61 条，另有一条 `6px 6px 0 0`；这两档已有 `--sw-radius-sm/md` 语义，但 Sass 变量与 CSS 自定义属性定义分开维护。将其改为运行时 `var()` 会增加 CSS 产物字节，本轮目标是统一来源并保持计算样式和包体不变。

## 决策

- 将 6px/8px 定义为 `$sw-radius-sm/md` 编译期刻度，作为两档静态基础值的唯一源头。
- `--sw-radius-sm/md` 通过 Sass 插值引用相同编译期值，继续为运行时样式与组件作用域提供现有接口。
- 精确消费这两档的 62 个生产圆角声明统一引用编译期刻度；顶角简写继续保持相同四角几何。
- 10px 控件、12px 分区、14px 卡片及其他特殊半径保留现有语义，不因覆盖率目标就近归档。
- 样式门禁禁止生产 SCSS 再直接声明 6px、8px 或 `6px 6px 0 0` 圆角，并自检该检测器会拦截违规样本。

## 实测

使用 `node scripts/ui-token-audit.cjs`，在同一套 17 个 SCSS 文件、相同声明计数规则下比较：

| 类别 | 收敛前 | 收敛后 | 变化 |
| --- | ---: | ---: | ---: |
| 圆角 token 覆盖 | 141/345（40.87%） | 203/345（58.84%） | +62 条，+17.97 个百分点 |
| 圆角字面量声明 | 204 | 142 | -62 |
| 唯一圆角字面量值 | 19 | 16 | -3 |
| 其他审计类别 | 不变 | 不变 | 0 |

独立 expanded CSS 前后均为 433356 bytes，SHA-256 均为 `4aaf4a416685f76703c1c99f46de99b8f6b5446fc7b7c114fa783a6ad187703d`。因此可确认 Sass 展开输出未变，不宣称运行性能或包体收益。

## 验证

- `tests/radius-scale-gate.test.cjs`、`tests/store-ui-polish.test.cjs`、`tests/platform-topbar-layout-contract.test.cjs`：43/43。
- 新圆角门禁的负向验证：在 `_01-base-controls.scss` 临时将一条 `$sw-radius-sm` 改回 `6px`，指定测试 `shared radius tiers use compile-time tokens in production styles` 失败；源文件恢复后 SHA-256 与注入前一致。
- TypeScript、状态索引审计与 `git diff --check` 通过。

## 边界

本次只合并现有两档的静态值来源。圆角中的动态主题角色仍使用 CSS 自定义属性；10px 与其他未匹配值需要结合组件几何分别审计，不能只按数值相邻关系替换。
