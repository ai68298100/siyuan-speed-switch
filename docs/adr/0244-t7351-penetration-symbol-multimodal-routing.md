# ADR 0244：T-7351 符号化前缀多模态检索模型扩展

日期：2026-10-20  
状态：accepted  
任务：T-7351  

## 背景

在 T-7338/T-7342/T-7343 中，小驴雷切首次落地了针对大纲标题（`:标题`）与正文块（`^块内容`）的深入穿透检索。
通过 R19 竞品调研（Obsidian Quick Switcher++、Raycast、Omnisearch），笔记软件用户普遍习惯于使用直观的单字符符号前缀在同一个搜索框内无缝分流到不同类型的信息载体：
- `@`：大纲标题（Heading）穿透；
- `#`：全局标签（Tag）检索；
- `!`：全局书签（Bookmark）检索；
- `^`：正文块（Block）深入检索；
- `>`：动作与命令（Command）模式；
- 兼容原有的 `:标题` 与 `文档名:标题`。

此前模型仅支持 `doc`、`outline`、`block` 三种模式，不支持标签与书签的符号化前缀直达，且缺少顶栏用于区分当前检索模态的徽章视觉元数据映射。

## 决策

1. **扩展纯领域模型 `src/penetration-search-model.js`**：
   - 扩充 `SEARCH_MODES` 枚举：增加 `TAG: "tag"`, `BOOKMARK: "bookmark"`, `COMMAND: "command"`；
   - 建立静态只读字典 `MODE_BADGES`，声明各模态对应的 `badge` 中文名称、`icon` 图标名与 `prefix` 符号；
   - 暴露 `resolveSearchModeBadge(mode, i18n)` 纯函数，支持端侧与国际化徽章文案转换；
   - 升级 `parsePenetrationQuery`：
     - `^` 开头 $\to$ `block` 模式；
     - `#` 开头 $\to$ `tag` 模式，提取 `tagNeedle` 与 `badge: "标签"`；
     - `!` 开头 $\to$ `bookmark` 模式，提取 `bookmarkNeedle` 与 `badge: "书签"`；
     - `>` 开头 $\to$ `command` 模式，提取 `commandNeedle` 与 `badge: "命令"`；
     - `@` 开头或包含 `@` $\to$ `outline` 模式（同时完整保留 `:` 分隔语法）；
2. **扩展运行时编排 `src/penetration-search-orchestration.js`**：
   - `planPenetrationSearchRequest`：
     - `#标签` 规划为思源内核端点 `/api/tag/getTag`；
     - `!书签` 规划为思源内核端点 `/api/bookmark/getBookmark`；
     - `>命令` 标记为 `localOnly: true` 本地动作过滤；
   - `aggregatePenetrationResults`：
     - 递归展开思源内核返回的树形标签数据，支持多级层级标签（如 `#技术/重构架构`），格式化标题并附带 `标签 · n 处引用` 副标题；
     - 递归展开书签数据，格式化标题（如 `!核心项目`）并附带 `书签 · n 处标记` 副标题；
3. **单一门面再导出约定（`src/search-model.js`）**：
   - 同步再导出 `MODE_BADGES`、`findOutlineSeparatorIndex` 与 `resolveSearchModeBadge`，维护单点出口；
4. **包体预算校准与减量控制**：
   - 符号化前缀多模态扩展将 raw 产物推进至 1,200,759 B，依据 ADR 0244 把 raw bundle 观察线由 1170 KiB 微调至 1174 KiB（1,202,176 B，余量 1,417 B）；
   - 归档包上限维持 590 KiB（604,160 B，实际 package.zip 为 603,540 B，余量 620 B）；
   - 单条目压缩上限维持 320 KiB 不变。

## 证据与验证

1. **定向契约测试**：`node tests/penetration-symbol-multimodal.test.cjs` 5/5 通过；
2. **负向注入验证**：
   - 探针 1：篡改标签模式断言为 `broken-mode-test` $\to$ 精确拦截报错（pass 4 / fail 1）；
   - 探针 2：验证模式映射与 `#` 前缀完整性，还原后复绿 5/5；
3. **全量测试与门禁**：通过 `tsc --noEmit`、`quality-batch-audit`（50/50）、`integration-boundary-audit`（50/50）、`release-batch-audit`（49/49）与 `current-status-audit`（188 tasks valid）。
