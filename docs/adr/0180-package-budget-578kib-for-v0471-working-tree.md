# ADR 0180：工作树候选包体预算调整至 578 KiB

日期：2026-10-13  
状态：已接受（T-7252）

## 背景

T-7251/T-7252 增加工作台快捷键和精选组件补齐交互。Windows 生产构建测得 `package.zip` 为 590349 bytes；已发布 v0.47.1 资产为 589640 bytes，旧 576 KiB 观察线上限为 589824 bytes，仅留 184 bytes，工作树候选超过旧线 525 bytes。压缩级别已为 9，归档内容通过 allowlist，新增内容对应可见功能与双语提示。

## 决策

- 将仓库发布门禁预算（自律观察线）上调 2 KiB 至 578 KiB（591872 bytes），为当前候选保留 1523 bytes；该值由本仓发布门禁执行，不是思源宿主限制。
- 保持 raw bundle 1160 KiB 与压缩 `index.js` 320 KiB 观察线不变；不改包内资源清单或发布版本。
- 将 readiness 快照标记为未发布工作树候选；GitHub 正式版仍为 v0.47.1，发布动作按工作协议后置。

## 验证

- `pnpm build` 实测 `package.zip` 590349 bytes，`dist/index.js` 1126441 bytes；压缩条目预算与资源 allowlist 单独检查。
- 将仓库门禁预算临时恢复到 576 KiB 后，包体预算测试和包完整性预算断言必须失败；恢复 578 KiB 后两项通过。
- 运行完整测试、TypeScript、状态索引审计、readiness 快照与 `git diff --check`。
