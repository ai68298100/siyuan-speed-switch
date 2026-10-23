# 【小驴生态中枢统领指令】小驴雷切 (siyuan-speed-switch) 专项排查与全方位升级执行手册

> **统领下发方**：小驴快门中枢（`siyuan-quickgate`）
> **执行接收方**：小驴雷切（`siyuan-speed-switch`）开发 Agent
> **当前状态**：底座测试全绿 · 规范评分 80% ➔ 目标 100%
> **核心原则**：零强依赖 · 深鸢尾紫+钛金雷刃 Bento 美学 · 严禁私有存储穿透

---

## 一、 核心资产状态确认
1. **根目录 `icon.png`**：**已由中枢完成 256×256 殿堂级“深紫底配钛金雷刃与金核”高清头像替换，请严格保留勿覆盖！**
2. **本地就绪 SDK**：`src/api/ecosystem-bridge-kit.ts`（零外部依赖，直接 import 使用）。

---

## 二、 当前排查出的本插件专项缺陷与必修任务清单

### 【P0 级：数据防篡改、集市获客与设置窗口升级】
1. **【最高危数据安全修复】消灭裸自定义块属性 (`src/index.ts`)**：
   - 目前代码直接向思源块写入了 `custom-row`、`custom-apply`、`custom-reservation` 等通用裸词属性，极易与第三方表格插件冲突导致用户笔记属性被篡改！
   - **必须统一加上命名空间前缀**：改为 `custom-lv-raikiri-row`、`custom-lv-raikiri-apply`、`custom-lv-raikiri-reservation`（读取时向下兼容旧字段）。
2. **`plugin.json` 规范化**：
   - 英文名加空格：将 `"default": "LvSpeed Switch"` 规范为 `"Lv Speed Switch"`（对齐家族 `Lv <Name>` 标准）；
   - 前置补齐关键词 `["小驴", "小驴雷切", "xiaolv", "lv", ...]`；
   - 增加 `"settingsWindow": true`，`minAppVersion` 提升至 `"3.8.4"`。

---

### 【P1 级：组件容器 800ms 熔断隔离与顶栏图标升级】
3. **强化第三方小组件单向异常隔离 (`src/api/external-bridge.ts`)**：
   - 调用第三方组件的 `read()` 钩子时，严格执行 800ms 超时熔断，全链路 try-catch 隔离，第三方报错时优雅降级为空态卡片，**绝不拖垮雷切自身**！
4. **顶栏单色矢量图标升级 (`src/index.ts`)**：
   - 更新 `CARD_ICON_SPRITE` 为与新版 Logo 1:1 映射的标准 32×32 SVG（阶梯页签 + 穿透雷刃 + 能量金核）：
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

### 【P2 级：编译现代化与合规文件补齐】
5. **升级编译目标至现代 ES**：
   - 将 `tsconfig.json` 的 `"target": "es2017"` 提升至 `"ES2022"`，开启 `strict: true`；
   - 将 `package.json` 中的 `siyuan` 依赖升级对齐至 `1.2.9`。
6. **补齐开源规范文件**：
   - 补齐根目录缺失的 `CHANGELOG.md` 与 `SECURITY.md`。

---

## 三、 验收指令
修改完成后，在根目录执行：
```bash
pnpm test
```
确保全量单测与冒烟测试 100% 全绿通过！
