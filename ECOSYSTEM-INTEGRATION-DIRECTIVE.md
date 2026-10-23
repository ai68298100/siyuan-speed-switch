# 【小驴生态中枢统领指令】小驴雷切 (siyuan-speed-switch) 全方位升级与跨插件协同执行手册

> **统领下发方**：小驴快门中枢（`siyuan-quickgate`）
> **执行接收方**：小驴雷切（`siyuan-speed-switch`）开发 Agent
> **架构基线**：Epoch 6 联邦规范 · 零强依赖优雅降级 · 深鸢尾紫+钛金雷刃美学 · 历史排雷防线

---

## 一、 核心定位与视觉资产状态
- **生态角色**：**【统一总控桌面与工作台（Cockpit & Workbench）】**——统一切换器、小组件工作台、代码片段实验室与悬浮球，聚合全生态状态。
- **专属主题色**：**星际深鸢尾紫（`#7C3AED`）＋ 高能电光柠檬金核（`#FDE047`）＋ 午夜深空黑金卡（`#1B1E2E`）**。
- **根目录 `icon.png`**：**已由快门中枢完成 256×256 殿堂级“深紫底配钛金雷刃与金核”高质感头像替换，请勿覆盖回退！**
- **本地已就绪 SDK**：`src/api/ecosystem-bridge-kit.ts`（零外部依赖，可直接 `import`）。

---

## 二、 必做任务 1：跨插件联邦联动（Epoch 6 标准）

### 1. 第三方小组件（Home Module）错误单向隔离与 800ms 熔断 (`src/api/external-bridge.ts`)
- 雷切作为全生态工作台容器，调用任何第三方插件注册的 `read(config, device)` 钩子时：
  1. 严格执行 **800ms 超时熔断** 与 **3s 快照缓存**；
  2. 全链路 `try-catch` 单向隔离：若某个兄弟插件报错或超时，仅在该组件卡片内优雅降级渲染 `[ 📦 数据暂未返回，点击重试 ]`，**绝对严禁拖垮雷切整个工作台渲染！**
- 维护好四别名挂载：`window.siyuanSpeedSwitch`、`window.xiaolvSpeedSwitch`、`window.xiaolvRaikiri`、`window.lvRaikiri`（First-Instance-Wins + 安全身份核验卸载）。

### 2. 预置小驴全生态 7 大标准小组件目录
在组件商店中对齐以下兄弟插件标准 `moduleId`（未安装对应插件时置灰显示“未检测到插件”或优雅隐藏）：
- `checkin-daily-streaks`（小驴打卡 · 今日习惯与连续天数）
- `exam-daily-summary`（小驴考试 · 今日备考与正确率）
- `cards-due-summary`（小驴闪卡 · 今日待复习卡片数）
- `glean-later-list`（小驴拾遗 · 稍后读推荐流）
- `home-expiry-reminders`（小驴管家 · 家庭效期提醒）
- `contacts-upcoming`（小驴人脉 · 近期生日与待跟进）
- `common-quick-palette`（小驴常用 · 高频常用语快捷）

### 3. 支持快门与常用直达
- 切换器命令模式（`>`）完整读取思源命令注册表中的快门生态命令；支持调用 `window.xiaolvCommon.search()` 检索常用语。

---

## 三、 必做任务 2：顶栏与侧栏单色图标升级 (`src/index.ts`)

将 `CARD_ICON_SPRITE` 中的主图标更新为与新版 Logo 1:1 映射的 32×32 单色矢量图标（三层阶梯页签 + 穿透利落雷刃 + 能量金核点）：
```xml
<symbol id="iconLvSpeedSwitch" viewBox="0 0 32 32">
  <path d="M6 8h8c1.7 0 3 1.3 3 3v10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-opacity="0.3"/>
  <path d="M9 10h8c1.7 0 3 1.3 3 3v10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-opacity="0.5"/>
  <rect x="12" y="12" width="14" height="15" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="m19 6-6 9.5h4.5l-2.5 9.5 8-10.5h-4.5z" fill="currentColor"/>
  <circle cx="25.5" cy="25.5" r="2.5" fill="currentColor"/>
</symbol>
```

---

## 四、 必做任务 3：UI 轻量统一与参考图 Bento 软性美学升级 (`src/index.scss`)

1. **注入专属品牌色与午夜黑金美学**：
   ```scss
   --lv-brand: #8B5CF6; /* 星际电光紫 */
   --lv-brand-soft: color-mix(in srgb, var(--lv-brand) 12%, transparent);
   --lv-accent-gold: #FACC15; /* 钛金雷刃黄 */
   --lv-midnight-card: #1B1E2E; /* 参考图午夜深空黑金卡底色 */
   ```
2. **吸收最初参考图设计神韵**：
   - 工作台焦点摘要卡吸收参考图顶部的“午夜深黑金星芒卡片”质感；
   - 顶部多模态搜索模式药丸栏保持 `9999px` 饱满胶囊态；
   - 按钮挂载 `:active:not(:disabled) { transform: translateY(1.5px) scale(0.985); }` 物理微触感；
   - Dialog 弹窗标题栏统一采用 `.lv-dialog-title-wrap`（22×22 紫底白标 + 标题 + 版本胶囊）。

---

## 五、 必做任务 4：深层工程规范与历史排雷加固（重点必改！）

1. **【高危数据隐患修复】消灭裸自定义块属性 (`src/index.ts`)**：
   - 经中枢审计，代码中直接向思源块写入了 `custom-row`、`custom-apply`、`custom-reservation` 等通用裸词属性，极易与其他表格/数据库插件冲突并损坏用户笔记元数据！
   - **必须统一加上命名空间前缀**：改为 `custom-lv-raikiri-row`、`custom-lv-raikiri-apply`、`custom-lv-raikiri-reservation`（读取时可向下兼容旧字段）。
2. **`plugin.json` 关键对齐（必改）**：
   - **修正英文名空格**：将 `"default": "LvSpeed Switch"` 规范为 `"Lv Speed Switch"`（加上空格，对齐家族 `Lv <Name>` 标准）；
   - 新增 `"settingsWindow": true`（开启独立桌面设置大窗）；
   - `minAppVersion` 统一由 `"3.8.0"` 提升至 `"3.8.4"`；
   - `keywords` 确保包含 `"小驴"`, `"xiaolv"`, `"lv"`。
3. **编译与安全合规补齐**：
   - `tsconfig.json`：将老旧的 `"target": "es2017"` 升级为 `"ES2022"`，开启严格类型检查；
   - `package.json`：将 `"siyuan": "1.2.8"` 升级对齐至 `"1.2.9"`；
   - 全仓 90 处 SQL 查询确保块 ID 经过 `/^\d{14}-[a-z0-9]{7}$/` 校验且字符串经过 `.replace(/'/g, "''")` 转义；
   - 控制台日志统一前缀 `[LvSpeedSwitch]`；Toast 提示统一前缀 `[小驴雷切]`；
   - 补齐根目录缺失的 `CHANGELOG.md` 与 `SECURITY.md`。

---

## 六、 验收标准
执行完毕后，在根目录运行：
```bash
pnpm test
```
确保全量单测与冒烟检查 100% 全绿通过！
