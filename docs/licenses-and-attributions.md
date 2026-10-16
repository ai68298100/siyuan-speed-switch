# 第三方依赖与开源授权清单（Licenses and Attributions）

> 任务归属：T-7165 · 维护者与法律合规基准 · 最后更新：2026-10-17

小驴雷切（LvSpeed Switch）坚定秉持**本地优先、开源透明与尊重原作者劳动**的原则。本文档集中梳理本项目所涉及的原作者署名、内置第三方库（Vendor）、视觉与图标资源以及可选外部数据源的授权清单。

---

## 一、 原作者与项目版权说明

本项目基于原作者 **wish5115** 的开源项目持续演进与架构重构，项目完全遵循 **MIT License**。

- **原作者**：`wish5115`
- **原许可证**：MIT License（保留于根目录 [`LICENSE`](../LICENSE)）
- **当前维护者**：`ai68298100`（小驴系列插件）
- **品牌演进与权利保护声明**：虽然插件在 v0.24+ 统一整合为“小驴雷切”品牌并重构为四入口（切换器、紧凑工作台、片段实验室、悬浮球）的统一工作上下文平台，但项目始终完整保留原作者 `wish5115` 的 MIT 权利声明与原始版权头，绝不因品牌变更或商业化抹去原作者署名。

---

## 二、 内置第三方代码（Vendored Libraries）

本项目严控运行时依赖体积（生产 bundle 零外部远程 CDN 引入），对必要的小型纯算法库采用 vendored 源码审计接入：

| 组件 / 路径 | 用途 | 原始作者 / 项目 | 许可证 | 授权凭证与说明 |
| --- | --- | --- | --- | --- |
| `src/vendor/tiny-pinyin/` | 中文拼音分词、首字母快速检索与音调过滤 | `soulteary/tiny-pinyin` | MIT License | 独立许可证位于 [`src/vendor/tiny-pinyin/LICENSE`](../src/vendor/tiny-pinyin/LICENSE)，版权所有 (c) 2016-2021 soulteary |

---

## 三、 图标与视觉资产授权

| 资产类型 | 资产路径 / 形式 | 来源与授权规范 | 说明 |
| --- | --- | --- | --- |
| **宿主原生图标** | `<use xlink:href="#iconXxx">` | 思源笔记（SiYuan）官方图标集 | 仅在思源宿主运行时通过 SVG Symbol 引用，不抽取外部未授权图标库，保持与宿主主题完美融合 |
| **产品主头像与图标** | `icon.png`, `docs/assets/lvspeed-switch-master.svg` | 原创矢量母版（小驴雷切设计团队） | 遵循本仓库 MIT License，无第三方商业字体或闭源版权切片 |
| **集市首图与预览图** | `preview.png`, `acceptance-screenshots/*.png` | 自动化无头浏览器脱敏测试截图 | 截图数据全部为本地隔离生成的脱敏沙盒内容，不包含真人隐私数据，遵循 MIT License |
| **三表面架构与界面矢量图** | `docs/architecture.svg`, `docs/interface-map.svg` | 原创技术架构与界面拓扑图 | 遵循本仓库 MIT License |

---

## 四、 可选外部数据源与 API 服务授权声明

小驴雷切的工作台小组件支持部分可选联网数据源，所有外部调用均遵循只读、请求带超时、失败退避与零凭据回传原则：

| 数据源名称 | 适用组件 | 协议 / 许可证 | 服务性质与合规要求 |
| --- | --- | --- | --- |
| **Open-Meteo** | 天气小组件 (`weather`) | CC BY 4.0 | 免费开源非商业天气 API，纯经纬度只读查询，无跟踪 Cookie |
| **Bangumi** | 番组放送小组件 (`anime`) | CC BY-SA 4.0 | Bangumi 开放 API，仅读取当日公开广播日历与公开封面 |
| **Hacker News** | 极客资讯小组件 (`hn`) | 官方公开 API | Y Combinator 官方 Firebase 实时只读接口 |
| **GitHub REST / GraphQL** | 代码贡献热力图 (`github-heatmap`) | GitHub API Terms | 用户可选输入公开用户名，仅读取公开贡献事件，不索取写权限 |
| **ActivityWatch** | 本地应用用时小组件 (`activitywatch`) | MPL 2.0 | 仅通过本地回环地址 (`127.0.0.1:5600`) 读取用户本机运行的 ActivityWatch 数据，数据不出本机网络 |

---

## 五、 打包与发布产物（Bundle Banner）合规

为满足 MIT 协议中“所有副本均须包含版权声明与许可声明”的法定要求，生产构建管线（`webpack.config.js`）做出如下工程设计：

1. **Bundle Header 自动注入**：通过 Webpack `BannerPlugin` 在生产产物 `dist/index.js` 的第一行自动注入根目录 `LICENSE` 完整文本；
2. **跨平台 LF 归一化**（T-6847）：构建期间自动统一换行符为 LF，避免不同操作系统 checkout 产生的字节差异破坏可复现构建；
3. **分发包完整性**：发版生成的 `package.zip` 内包含独立的 `LICENSE` 文本与完整的声明，保证离线分发或解压安装时的版权完整合规。
