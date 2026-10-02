# 开发分支协议 — `dev/thispc-1002`

> **⚠️ 任何在本仓库工作的人或 AI Agent：动手改代码之前，必须先读完本文件并严格遵守。**
> 本文件只存在于 `dev/thispc-1002` 分支。你能在工作区看到它，说明当前已在该分支上——请继续保持。

## 背景（记录于 2026-10-02）

本插件跨两台电脑开发。另一台开发机上存在大量**未推送到 GitHub** 的更新（最后已知同步点：2026-09-30，`main` @ `ca5ce68f94314b1fffb72c66e5850504dad4b4d2`，即 v0.44.1 发布记录），预计 **2026-10-09 前后**才能再次接触那台电脑。在那之前：

- GitHub 上的 `main` 分支是另一台电脑的开发基线，**处于冻结状态，禁止直接改动**。
- 本机（`D:\AI\思源笔记插件开发\插件探索\小驴雷切`）的一切新开发只在 `dev/thispc-1002` 分支进行。
- **两边工作合并完成之前，禁止发版**：不改版本号、不打 tag、不发 Release。

## 铁律（违反任何一条都会让七天后的合并变得困难或产生重复开发）

1. 只在 `dev/thispc-1002` 上提交；**禁止向 `main` 提交或推送任何内容**。
2. **禁止修改版本号**：`package.json` 和 `plugin.json` 的 `version` 保持 `0.44.1` 不动。本地调试用思源开发模式直接加载仓库目录即可，不需要升版本。
3. **禁止修改以下文件**（它们是另一台电脑的持续写入区，本机改动会在七天后的合并中必然冲突）：
   - `CHANGELOG.md`（含 README 内的更新日志章节）
   - `README.md` / `README.en-US.md` 顶部的版本徽章与安装说明
   - `docs/dev-plan-*.md`、`docs/replies/*` 等计划与回复草稿文档
   - 其它 `PROGRESS` / `RELEASE` 类状态文档（开发记录写进 commit message）
4. 新功能**优先新建文件**；确需改动公共核心文件时尽量小步、局部，降低合并冲突面。
5. 每天收工前 `git push`（推 `dev/thispc-1002`），进度即备份。
6. 发版流程只能在合并完成后统一执行：升一次版本号覆盖两边改动 → 合并两边 CHANGELOG → 打 tag → 发 Release。

## 本仓库专属说明

- **三个遗留分支已搁置，禁止在其上开发或合并**：`feature/quick-action-platform`、`feature/search-global`、`feature/search-opened-content`（均停在 2026-09-07，落后 main 1300+ 提交，是早期实验）。也不要把它们的提交挑（cherry-pick）进本分支。
- i18n 源文件在 `src/i18n/`（`zh-CN.json`、`en.json`），可直接编辑；构建时压入发布包。

## 七天后的合并流程（拿到另一台电脑后，严格按顺序执行）

1. **先抢救另一台电脑**（它上面的内容目前是单副本，最优先）：
   ```bash
   git add -A && git commit -m "wip: 收拢未推送的本地开发"   # 仅有未提交改动时需要
   git push origin main
   git push origin --all
   ```
   推完用 `git log origin/main -1` 确认最新提交已上去，再干别的。
2. 回到本机（或任一台电脑）合并：
   ```bash
   git fetch origin
   git checkout dev/thispc-1002
   git merge origin/main        # 所有冲突都在这一步解决
   # 跑测试与构建，全绿后：
   git checkout main
   git merge dev/thispc-1002
   git push
   ```
3. 合并完成、测试构建全绿之后，才按仓库既有发布清单走发版流程（版本号一次性覆盖两边改动，CHANGELOG 合并两边内容）。
