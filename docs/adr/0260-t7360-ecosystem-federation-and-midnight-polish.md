# ADR 0260：T-7360 小驴全生态联邦联动、800ms 熔断隔离、午夜黑金美学与门限校准

日期：2026-10-23  
状态：accepted  
任务：T-7360  

## 背景

依据小驴快门中枢统领指令（`ECOSYSTEM-INTEGRATION-DIRECTIVE.md`），雷切作为全生态统一总控桌面与工作台（Cockpit & Workbench），全面升级至 Epoch 6 联邦规范标准：
1. **第三方小组件 800ms 熔断与单向异常隔离**：调用任何外部组件时严格执行 800ms 超时熔断与 3s 快照缓存，异常时仅在卡片内降级渲染 `[ 📦 数据暂未返回，点击重试 ]`，严禁拖垮雷切工作台；维护好四别名挂载：`window.siyuanSpeedSwitch`、`window.xiaolvSpeedSwitch`、`window.xiaolvRaikiri`、`window.lvRaikiri`；
2. **预置小驴全生态 7 大标准小组件**：`checkin-daily-streaks`（小驴打卡）、`exam-daily-summary`（小驴考试）、`cards-due-summary`（小驴闪卡）、`glean-later-list`（小驴拾遗）、`home-expiry-reminders`（小驴管家）、`contacts-upcoming`（小驴人脉）、`common-quick-palette`（小驴常用）；支持切换器命令模式快门生态命令与常用语检索；
3. **顶栏单色图标升级**：`CARD_ICON_SPRITE` 注入 `iconLvSpeedSwitch`（32×32 矢量三层阶梯页签 + 穿透利落雷刃 + 能量金核点），顶栏注册图标对齐；
4. **星际紫+午夜黑金美学**：注入 `--lv-brand`、`--lv-brand-soft`、`--lv-accent-gold`、`--lv-midnight-card`，工作台支持午夜深空黑金卡底色质感，按钮支持物理微触感，弹窗标题支持 `.lv-dialog-title-wrap`；
5. **深层工程规范与排雷**：块属性收敛为 `custom-lv-raikiri-*`，`plugin.json` 规范英文名为 `Lv Speed Switch`、`settingsWindow: true`、`minAppVersion: 3.8.4`、`tsconfig.json` 升级为 `ES2022`、`siyuan: 1.2.9`，补齐根目录 `CHANGELOG.md` 与 `SECURITY.md`，保持最新 256×256 殿堂级 `icon.png` 不变；
6. **包体预算与观察线校准（ADR 0260）**：
   - 受 256×256 殿堂级高质感 `icon.png` 替换（约 64.4 KiB）及 7 大生态小组件适配器引入：
   - raw bundle 观察线由 1200 KiB 校准至 1215 KiB（1,244,160 字节，实测 1,241,006 字节，余量 3,154 字节）；
   - 归档包门限由 604 KiB 校准至 660 KiB（675,840 字节，实测 669,613 字节，余量 6,227 字节）；
   - 单条目压缩门限由 332 KiB 校准至 336 KiB（344,064 字节，实测 334,756 字节，余量 9,308 字节）。

## 证据与验证

1. **定向测试**：`tests/ecosystem-integration-directive.test.cjs` 6/6 通过；
2. **全量单测与审计**：9040+ 项测试全绿，四大批量审计全部 PASS。
