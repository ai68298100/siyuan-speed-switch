# 小驴速切（siyuan-speed-switch）项目长期记忆

## 本机环境事实（可直接复用）
- 思源安装目录：`/d/biji/SiYuan`（`D:\biji\SiYuan`）。
- **真机基础样式（权威依据）**：`resources/stage/build/mobile/base.9450c3c32a0f5d8ce01a.css`（另有 `app/`、`desktop/` 同名 base CSS）。
  查宿主对插件 DOM 的真实样式兜底时读这里，**不要凭推断**。
- 已验证的关键宿主规则（2026-09-16 实测）：
  - `.b3-button svg{height:16px;width:16px;margin-right:4px;flex-shrink:0}` → 带 `b3-button` 的容器，其子 svg 在插件 CSS 缺席时**有 16px 兜底**。
  - `.b3-tooltips svg{margin-right:0}` → **只有边距、无尺寸**，带 `b3-tooltips` 的容器**无兜底**。
  - 推论：判定"某个裸 svg 会不会在样式未就绪时失控"= 容器是否带 `b3-button`（或其它有 svg 尺寸规则的 b3 类）× svg 尺寸是否只写在插件 CSS 里。
- pnpm 在 Git Bash 需 shim（用户级记忆已记），实测版本 11.4.0。
- Chromium 门禁可用浏览器：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。

## 项目约定
- `pnpm test` = `node tests/run-tests.cjs`（自定义 runner，非 node --test 直跑）；单跑某文件用 `node --test <file>` 不会计入总数。
- `pnpm verify:release` = tsc --noEmit → build → test → 三套 UI smoke（mobile-card-smoke / mobile-toolbar-layout / chromium-style-smoke）。
- **README 的"测试项数"没有门禁断言**（只有"测试文件数"有），改测试后必须手工同步 README 双语 + `docs/release-readiness.md` 快照，否则 `release readiness matrix matches generated artifact sizes` 会失败。
- **i18n 有"死 key"门禁**（`tests/i18n.test.cjs`）：新增 key 必须在 src 里被引用，且 zh-CN 与 en 的 key 集合必须完全一致 → 加 key 必须成对加。
- 门禁新增/修改必须按 `docs/gate-audit-checklist.md` 自查 + 负向验证（注入违规→按**失败项名称**确认→md5 字节级还原）。
- 设置页 UI 构建在 `src/settings-sections.ts`（R4/D-376 外迁）；其源码契约写在 `tests/mobile-card-smoke.cjs` 的 `documentSetContractOk` 等一串 `includes` 断言里，改设置页行为要顺手扩那里。
- 纯模型惯例：`src/document-sets.js` 一侧放 plan/summarize/run/**report**，UI 只装配；报告类函数的时间戳用 `options.now` 注入以便测试确定化。
- `src/index.ts` 与 `src/settings-sections.ts` 各有一份 `declare module "./document-sets"` 类型增强块，新增导出要补声明（否则 tsc 报错）。

## 门禁方法论（踩过的坑）
1. **不要用"类名 + N 字符距离窗口"当锚点**（第七类失效模式，D-390）：注释里提到同类名即成伪锚点 → 归因错误；目标语句漂出窗口 → 假绿。改用 `X.className = "..."` 建变量→类名映射（多值 Set，因变量名会复用），再取 `X.innerHTML = ...` 完整语句断言（按引号状态扫描跨过字符串内分号）。
2. 成对门禁：Chromium 布局门禁量真实布局量，但 HTML 与生产模板是两份会漂移 → 配源码契约锁模板。
3. 时序类缺陷用**同页因果对照**（`sheet.disabled = true`）证明测试环境真的复现了故障，否则断言可能恒绿。
4. 断言集合为空时恒真（模式④）：遍历类断言要补"审计面非空"自检。
