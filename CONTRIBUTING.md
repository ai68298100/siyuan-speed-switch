# Contributing

感谢参与小驴雷切。这个仓库同时维护切换器、工作台、片段实验室和悬浮球四个入口；提交前请先确认改动属于哪个表面，并保留核心命令、存储迁移和宿主降级语义。

## 开始前

1. 先读 [`ROADMAP.md`](ROADMAP.md)、[`BLOCKERS.md`](BLOCKERS.md)、相关 [`docs/adr/`](docs/adr/) 和当期 [`docs/dev-plan-2026-10-06.md`](docs/dev-plan-2026-10-06.md)。
2. 任务状态只以 [`docs/current-status-index.json`](docs/current-status-index.json) 为准；不要把计划、浏览器模拟或受控服务响应写成真实宿主/Android 验收。
3. 从 `dev/<topic>` 分支开始，通过 Pull Request 合入。`main` 是稳定发布线；默认分支和分支保护仍需维护者在 GitHub 仓库设置中确认。

## 本地验证

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm verify:release
```

按改动范围补跑 `pnpm test:smoke:layout`、`pnpm test:smoke:browser`、`pnpm test:smoke:floating-ball` 或对应的宿主/组件定向测试。涉及多插件或宿主的 E2E 时，使用隔离工作区和独立产物目录，避免读写个人工作区。真实 Android、读屏、主题和最窄原生 dock 必须单独标注证据来源；浏览器 device emulation 不能替代真机验收。

如果新增或修改门禁/契约测试，必须逐项执行 [`docs/gate-audit-checklist.md`](docs/gate-audit-checklist.md)，注入一个违规样本确认目标门禁确实失败，恢复文件并核对字节级还原。

## 变更边界

- 新设置同时更新默认值、归一化、设置页和中英文文案，并考虑旧存储迁移。
- 新面板或悬浮窗复用共享命令注册与能力声明；显示隐藏不能改变命令执行能力。
- 改动发布流程、manifest 或静态资源时，运行包体、allowlist、版本一致性和可复现构建检查。
- 不在 issue、PR、截图或测试产物中提交 Token、笔记正文、完整本地路径或私人工作区数据。

## 提交说明

PR 描述请写清用户可观察的变化、影响的表面、验证命令和未覆盖的真实宿主边界。若包含截图，注明它来自真实思源、Chromium smoke 还是原型预览。不要把未推送的本地候选写成 GitHub Release，也不要在没有授权时推送或修改仓库设置。

## 发布与回退

发布前先完成 [`docs/release-readiness.md`](docs/release-readiness.md) 和 [`docs/acceptance-runbook.md`](docs/acceptance-runbook.md) 的候选检查；`v*` 标签触发 GitHub Actions 发布。升级、停用、卸载和回退步骤见 [`docs/install-upgrade-rollback-2026-10-06.md`](docs/install-upgrade-rollback-2026-10-06.md)。发现回归时优先保留证据、停止继续扩大范围，并按回退手册恢复上一稳定包。
