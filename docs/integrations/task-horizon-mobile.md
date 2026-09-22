# Task Horizon 手机悬浮球联动交付说明

## 结论

需要 Task Horizon 增加手机端命令入口。它已有手机界面，问题在于命令路由及注册；单靠雷切勾选“手机端尝试”不能解决。作者可以直接应用补丁，无需先合并 PR。雷切这边配套识别实时能力声明，使两个动作无需“尝试”开关即可加入手机悬浮球。

调查基线：[Task Horizon index.js，7b9da6f](https://github.com/5kyfkr/siyuan-plugin-task-horizon/blob/7b9da6f83fa338ffe739af579c0ae4acf60ca052/index.js)，manifest 3.1.0、最低思源 3.8.4。雷切基线 `d541442`、manifest 0.30.0。两个补丁均未代替作者发布新版本。

## 给 Task Horizon 作者

作者只需接收 `task-horizon-mobile.patch`、对应 PR 文案和本文。补丁只改入口文件并增加测试、集成文档，不改任务存储或任务编辑器，不依赖雷切才能使用两个命令。

在干净工作区、基线提交上执行（如上游继续更新，请先检查上下文并正常解决冲突）：

```powershell
git switch -c mobile-command-entry 7b9da6f83fa338ffe739af579c0ae4acf60ca052
git apply --check task-horizon-mobile.patch
git am task-horizon-mobile.patch
node scripts/mobile-command-behavior.test.js
powershell -NoProfile -File scripts/verify-release.ps1
powershell -NoProfile -File build.ps1
```

Windows 检出需保持原始 LF；上游部分已有测试按精确换行定位代码。本地副本已设置 `core.autocrlf=false` 并按 Git 索引恢复 LF，未改动这些测试来绕开失败。

`getQuickActionCapabilities()` 是可选的跨插件约定：同步返回 `{version:1, commands:{openTaskHorizon:["desktop","sidebar","mobile"], openQuickAddTaskWindow:["desktop","sidebar","mobile"]}}`。实际调用仍使用两个稳定的思源 `langKey`。详细语义见作者补丁内 `docs/quick-action-integration.md`。能力声明说明有实现，不能代表所有设备已经验收。

## 用户安装和配置

1. 先备份当前插件目录和配置。在隔离思源工作空间安装两份配套测试包，并启用两个插件。测试包沿用原版本号，请以交付清单的提交及 SHA-256 区分，不要当作集市正式更新。
2. 打开雷切设置 → 悬浮球 → 手机，启用手机悬浮球，在“添加动作”的插件命令中选择 Task Horizon 的“打开任务管理器”和“新建任务窗口”。选择**插件命令**；桌面 Dock 入口不能转成手机入口。
3. 勾选首层后即可拖动悬浮球进入动作；也可将其中一个设为主点击。名称和图标可分别覆盖，原有桌面配置无需删除。
4. 已保存的同名命令会沿用原 ID 并重新读取能力；旧版 Task Horizon 仍缺少手机快速新建命令时，需先升级提供方。停用 Task Horizon 后该动作不可执行，重启或升级后应重新发现入口。

本轮雷切代码位于 `codex/task-horizon-mobile` 隔离工作树；主工作区未提交的快速记录、前后页签和滚动动作仍保留原样，未合入本测试包。

## 必须在设备上补验的项目

| 环境/动作 | 验收条件 | 当前证据 |
| --- | --- | --- |
| 手机，拖动至打开管理器 | 当前视图正常打开，返回后文档/浮球可继续使用 | 命令及能力链自动化通过；真机待验 |
| 手机，主点击快速新建 | 软键盘不遮挡必填项，可取消并回到原界面 | 复用原表单的路由已验证；真机待验 |
| 手机，提交一个测试任务 | 目标文档/日期正确、只新增一次 | 未对用户数据做写入；隔离空间真机待验 |
| 手机，旋转/键盘收起/返回 | 面板、焦点、滚动及浮球恢复正常 | 真机待验 |
| 桌面，命令与全局快捷键 | 管理器仍开页签；快速新建恢复主窗口 | VM 路由回归通过；真实桌面待验 |
| 卸载/重载及加载异常 | 不调用旧实例；失败提示后浮球可继续操作 | 生命周期、目录和执行器自动化通过 |

超时仅停止雷切等待，不能取消对方内部工作；如冷加载超时后仍打开界面，勿连续重试。Task Horizon 是否合并/发布由作者决定；本交付不包含推送、PR 创建或自动发消息。
