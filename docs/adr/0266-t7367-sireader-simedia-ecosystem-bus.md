# ADR 0266：T-7367 思阅、思播与全生态总线事件深度联动与 v0.48.9 发版

日期：2026-10-23  
状态：accepted  
任务：T-7367  

## 背景

在小驴生态联邦架构中，思阅（SiReader，电子书阅读与批注）与思播（SiMedia，音视频播放与学习）是用户日常使用的重量级内容源。同时，小驴全生态（打卡、闪卡、考试、管家、拾遗、常用）各兄弟插件在用户操作时会通过全局 DOM 事件广播事实变动。雷切作为统一工作上下文平台与工作台，需要实现与思阅/思播的深度联动并捕获生态总线事件实现工作台卡片自动无感重绘。

## 决策

1. **思阅与思播小组件接入**：
   - 在 `src/home-external-adapters.ts` 中注册：
     - `sireader-recent`（思阅 · 最近阅读）：读取书架在读书目与阅读进度百分比，条目点击继续阅读；
     - `simedia-active`（思播 · 正在播放）：感知思播当前音视频播放状态与标题；
   - 在 `src/api/ecosystem-bridge-kit.ts` 中声明 `SiReaderBridgeApi`、`SiMediaBridgeApi` 接口与别名检索表；
2. **思阅与思播专属动作调用（上游优先）**：
   - 动作画板中执行 `open-in-reader` 或 `open-in-media` 时，优先探测并调用 `sireader.openDoc` 或 `siyuanMediaPlayer.controller.play`，并在能力缺失时自动优雅降级为 `openTab` / `mobileOpenDoc`；
3. **小驴全生态总线事件聚合自刷新**：
   - 工作台在 `bindEcosystemEventSubscriptions` 中聚合监听小驴打卡（`checkin:event-recorded`）、闪卡（`lv-cards:reviewed`）、考试（`lv-exam:session-ended`）、管家（`lv-home:data-changed`）与思播（`mediaChanged`）等生命周期事件；
   - 当工作台处于打开状态时，在微任务帧中自动触发重绘，保持小组件数据绝对新鲜度；
4. **版本升级与集市发布闭环**：
   - 严格执行小版本递增：`0.48.8` -> `0.48.9`，并在 GitHub 发布 Release `v0.48.9`，确保集市爬虫准时索引。

## 证据与验证

1. **定向测试**：`tests/sireader-simedia-and-ecosystem-bus-contract.test.cjs` 5/5 通过；
2. **多语言契约**：`tests/i18n.test.cjs` 11/11 通过；
3. **全量单测与审计**：9070+ 项测试全绿，四大批量审计全部 PASS。
