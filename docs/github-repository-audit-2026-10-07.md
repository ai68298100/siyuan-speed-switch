# GitHub 仓库状态与设置审计

日期：2026-10-07。范围：公开仓库元数据、分支与标签、Actions、Release、issue 入口和仓库内协作配置。远端查询默认只读；本文件末尾单独记录本轮已获授权并成功应用的低风险设置。

## 已核对的远端事实

| 项目 | 当前事实 | 判断 |
| --- | --- | --- |
| 仓库 | `ai68298100/siyuan-speed-switch`，公开仓库，MIT，2 stars、1 fork | 仓库可见性和许可证清楚；About 已有四入口定位和 9 个 Topics |
| 默认分支 | `dev/thispc-1002` | 这是开发分支，不应在分支策略未确认前直接改成 `main` |
| 分支关系 | 远端 `dev/thispc-1002` 比 `main` 多 7 个提交；本轮已将本地开发分支推送至 `a07b014`，本地与远端同名分支现已一致 | 开发分支已同步；仍不能把它写成稳定 Release，也不能直接删除 feature 分支 |
| 最新 Release | `v0.44.1`，2026-09-30，目标发布线为 `main`，`package.zip` 568,951 bytes | 这是当前稳定安装包；后续工作树改动尚未进入 Release |
| Actions | CI workflow 已随 `a07b014` 同步并覆盖当前开发分支与 `dev/**`；修复后的同步推送触发 run `37601574326`，已完成并通过；此前 run `37599763303` 在桌面本机证据缺失处失败，已由 T-7191 修复。Dependabot 两条更新 run 也已启动 | 等待云端结果；云端通过前仍以本地门禁为依据 |
| 分支保护 | `main` 和 `dev/thispc-1002` 均未启用保护规则 | 允许直接 push、force-push 或删除，发布线风险高 |
| 安全设置 | secret scanning 和 push protection 已开；Dependabot vulnerability alerts 与自动安全修复已开启（本轮应用） | 每月依赖 PR 配置已写入工作树，待同步后观察噪声 |
| 合并设置 | merge、rebase、squash 均开启；合并后自动删除分支已开启（本轮应用） | 不改变现有合并方式，只清理已经合并的分支 |
| 社区入口 | Issues 开启且目前无未关闭 issue；Projects/Wiki 开启；Discussions 关闭；暂无安全策略、贡献指南和 PR 模板 | 本轮已补仓库内模板和政策文件，远端安全报告开关仍需单独确认 |

## 本轮已落地到工作树

- README 中英文保留静态版本徽章（由发布门禁校验），新增 CI 与 latest release 徽章、稳定版下载提示和支持矩阵入口。
- 对齐路径筛选、悬浮球挂载范围、组件目录数量与外部依赖、Gist Token 风险、五套 UI smoke 等公开描述。
- `package.json` 的 description、keywords 与 `plugin.json` 的当前产品定位对齐。
- CI push 分支改为 `main`、`master`、当前 `dev/thispc-1002` 和后续 `dev/**`，既满足现有工具链契约，也使新开发分支在同步后得到 push 检查。
- 新增 `CONTRIBUTING.md`、`.github/PULL_REQUEST_TEMPLATE.md`、`.github/SECURITY.md`、`.github/dependabot.yml`，并扩展 issue config 的 Releases、支持矩阵和安全入口；安全链接指向仓库 Security 页面，不假设私密报告已启用；Bug/Feature 表单补充端侧、入口、主题、安装来源和脱敏确认，且不再写死旧插件版本。

上述仓库内文件已随提交 `a07b014` 推送到 `dev/thispc-1002`；该分支现为本机与 GitHub 的共同最新工作线。`README` 顶部的版本徽章继续使用 `package.json` 版本，避免破坏现有版本一致性门禁；`v0.44.1` 稳定 Release 和集市资产仍未改动。

## 本轮已应用的远端设置

确认当前账号具备仓库管理员权限后，已通过 GitHub API 应用两项不改变分支归属的设置：

- `security_and_analysis.dependabot_security_updates.status = enabled`；
- `delete_branch_on_merge = true`；
- 自动安全修复随后成功启用，复核 API 返回 Dependabot security updates `enabled`、secret scanning `enabled`、push protection `enabled`、合并后删分支 `true`。

默认分支仍为 `dev/thispc-1002`，`main` 与 `dev/thispc-1002` 仍未启用分支保护；本地 workflow、README、贡献指南和安全文件已随 `a07b014` 推送；远端 CI 已触发本轮 run，Security/协作页面以本次同步内容为准。默认分支切换、保护规则、Actions 权限收紧和 Security policy 发布仍需先确认维护分支策略，本轮未擅自修改。

## 建议的远端设置顺序

1. 已完成第一批 workflow、README、协作文件和当前源码的审阅、提交与推送；后续继续只同步 `dev/thispc-1002`，不要把开发分支直接当成稳定 Release。
2. 确认 `main` 是稳定发布线、`dev/thispc-1002` 是开发线后，再决定默认分支。若要切回 `main`，应先确保 `main` 包含希望公开的提交，并同步 README 的 CI 徽章分支。
3. 对稳定发布线和默认开发线分别设置保护规则：禁止 force-push/删除、要求 PR、要求对应 CI `verify` 检查通过；发布标签 `v*` 只允许维护者创建。
4. Dependabot vulnerability alerts 和自动安全修复已开启；本地 `dependabot.yml` 只安排每月 PR，并限制并发为 5，后续观察噪声再调整。
5. 保留 Actions 默认 `contents: read`，仅 Release job 使用 `contents: write`；是否收紧第三方 action 到 SHA 固定，另行评估维护成本。
6. 在确认维护者可接收私密报告后，再开启 GitHub Security policy / private vulnerability reporting。没有真实维护者邮箱或轮值人之前，不新增 CODEOWNERS 或虚构联系人。

## 复核命令

```bash
git remote -v
gh repo view ai68298100/siyuan-speed-switch --json defaultBranchRef,description,repositoryTopics,latestRelease
gh run list --repo ai68298100/siyuan-speed-switch --limit 10
gh release list --repo ai68298100/siyuan-speed-switch --limit 10
gh api repos/ai68298100/siyuan-speed-switch/branches/main/protection
gh api repos/ai68298100/siyuan-speed-switch/branches/dev/thispc-1002/protection
```

保护接口返回 404 表示当前未设置分支保护，不表示网络失败。写入远端设置或推送前，必须先确认分支策略和待发布提交范围。
