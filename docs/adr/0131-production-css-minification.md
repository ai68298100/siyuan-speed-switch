# ADR 0131：生产样式压缩与 JavaScript 冗余消除

- 状态：已采纳
- 日期：2026-10-04
- 任务：T-7091

生产构建只压缩 JavaScript，提取的 CSS 未进入 minimizer。归档余量仅 26 bytes 时继续补功能必须先消除这项构建浪费。

为已有 EsbuildPlugin 启用 css。CSS 压缩后归档为 588,738 bytes，仍仅余 1,086 bytes，不足以补齐已确认的元数据与 AI 缺口。

JavaScript 改用 webpack 标准的 TerserPlugin，显式登记开发依赖 5.3.16；不启用 unsafe 优化或属性改名，保持 ES2020 与 CommonJS/动态 chunk 接口，最多两个压缩 worker。不额外提取许可文件；既有 BannerPlugin 继续附完整 LICENSE。SCSS 源码、运行依赖和预算保持。

通过生产样式 Chromium smoke 与真实思源 E2E 检查几何、交互和主题；连续构建检查可复现性，生产图与资源合同核对发布内容。压缩不能替代真实端侧验收。

四条旧 smoke 仅因逗号/冒号后的空格被移除而失败；改为接受 CSS 等价空白的明确条件匹配，保留 reduce、0px 和错误色 token 的值约束，并剥离注释。编译 CSS 契约 5/5；从真实产物移除这些条件后，实际 smoke 必须报告对应四项 FAIL，不能被注释替身满足。

补齐本批功能后：入口 1,076,712 B、样式 299,262 B、归档 555,376 B；相较 T-7090 白名单修复产物，入口减少 107,141 B，归档减少 34,422 B。预算原值保持。
