# ADR 0102：TypeScript 7 评估——维护窗口不迁移，JS API 兼容层就绪后重评（T-7050）

日期：2026-09-30 · 状态：采纳（不迁移；重评条件在案） · 关联：维护批一（依赖巡检）、T-7050

## 背景

维护批一依赖巡检发现 `typescript 5.9.3 → 7.0.2` 跨两个大版本。TS 7 是 TypeScript 的 Go 原生重写（native port），npm 包改为平台二进制分发（20 个 `@typescript/typescript-<platform>` 可选依赖）。本 ADR 记录实证评估数据与决策。

## 实证数据（2026-09-30，本仓库）

| 维度 | TS 5.9.3（现行） | TS 7.0.2（native） |
| --- | --- | --- |
| `tsc --noEmit` 全库 | 2.8s，0 错误 | 0.5s（约 5× 快），**112 错误** |
| 错误形态 | — | TS7006 隐式 any（推断收紧）+ TS2339 catch `unknown` 不收窄（`.message` 访问 ×5+） |
| JS 编译 API | `transpileModule`/`createSourceFile` 完整 | **`undefined`——JS API 不随 native 包分发** |
| 版本范围防护 | `package.json` 为 `^5.5.4`，7.x 不会被 `^` 自动拉入 | — |

## 决策

### D1 维护窗口不迁移

112 个新错误（隐式 any 收紧 + catch unknown 语义）需逐点收口，属专项批次而非维护窗口改动。**`^5.5.4` 版本范围已天然防护**——7.x 不会被常规 `pnpm update` 拉入，无需额外 pin。

### D2 硬阻塞：JS 编译 API 缺失

**11 个测试文件**（doc-preview-behavior、path-generation-isolation、command-capabilities、constants 等）依赖 `require("typescript")` 的 `transpileModule`/`createSourceFile` 做 TS 片段行为级测试。TS 7 native 包不暴露该 API——升级即测试基建断裂，需将 11 处改为 esbuild（已在工具链）或 Sucrase，或等官方 JS API/兼容包。这是比 112 个错误更大的迁移面。

### D3 重评条件（满足其一即重开本 ADR）

1. TS 7 系发布 JS API 兼容包（或 native 包补齐 `transpileModule` 等入口）；
2. 代码库规模增长使 `tsc --noEmit` 耗时成为开发痛点（当前 2.8s，无痛点）；
3. CI 时长需要压缩且其他手段耗尽。

## 后果

- 维护批一的 typescript 升级跳过项就此闭环；`package.json` 保持 `^5.5.4`。
- 本 ADR 是「不迁移」的登记处：重评时直接引用实证数据，不重复评估。
