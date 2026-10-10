# 思源 OCR 接入调研

- 调研日期：2026-10-10
- 关联任务：T-7235
- 结论：暂不接入生产代码，等待思源 3.8.7 正式版发布后重新核对接口和配置契约

## 结论摘要

思源当前正式版已经具备 Tesseract OCR、OCR 结果持久化和全文索引能力。3.8.7 alpha 及 dev 分支又在推进 PaddleOCR、AI OCR、自动 OCR 和可配置模型，但这些新接口仍处于演进阶段，不能作为本插件当前版本的稳定依赖。

本插件第一面板已经调用思源原生全文搜索接口。思源完成 OCR 并建立索引后，OCR 文本理论上会自然进入现有搜索结果，因此没有必要在本插件内重复扫描资源、复制模型或建立第二套 OCR 索引。等 3.8.7 正式版发布后，应先用真实稳定版验证这一点，再决定是否增加 OCR 命中标识、筛选和图片快捷操作。

## 上游版本边界

本次通过 GitHub API 和思源源码进行只读核对：

| 来源 | 版本或提交 | 结论 |
| --- | --- | --- |
| 最新正式版 | v3.8.6 | 可作为当前稳定能力基线 |
| 最新 alpha 标签 | v3.8.7-alpha.6，提交 1389bc2b7128a32f51b7ce93496895c889f76b1e | 新 OCR 配置仍是 alpha，不作为生产契约 |
| dev 分支 | 提交 5aef49b3053322f79c8e5d0c51bb8989b944e432 | 相对 alpha 继续领先，接口和默认值仍可能变化 |
| master | 提交 fb3355f07d22bff36f1d785999fd5ded6a90d468 | 当前稳定开发线参考，不替代正式版验证 |

参考：

- 思源仓库：https://github.com/siyuan-note/siyuan
- v3.8.7-alpha.6：https://github.com/siyuan-note/siyuan/tree/v3.8.7-alpha.6
- dev 分支：https://github.com/siyuan-note/siyuan/tree/dev

## 已确认的稳定能力

在 v3.8.6 和当前稳定代码中已看到：

- Tesseract OCR。
- OCR 文本保存到全局 data/assets/ocr-texts.json。
- OCR 文本参与索引。
- 图片菜单提供 getImageOCRText、setImageOCRText 和 ocr 能力。
- 支持 PNG、JPG、JPEG、TIF、TIFF、BMP、GIF、WEBP、PBM、PGM、PPM、PNM 等图片格式。
- Tesseract 能力受 SIYUAN_TESSERACT_ENABLED、SIYUAN_TESSERACT_LANGS、SIYUAN_TESSERACT_TIMEOUT 和 SIYUAN_TESSERACT_MAX_SIZE 等环境变量影响。
- 加密笔记本资源不进入当前全局 OCR 流程，不能把普通笔记本的结论直接套用到加密资源。

对应源码位置：

- kernel/conf/ocr.go
- kernel/model/ocr.go
- kernel/api/ocr.go
- kernel/apicontract/ocr.go
- app/src/asset/imageOCR.ts
- app/src/menus/imageOCRMenu.ts

## alpha/dev 中正在演进的能力

dev 分支出现了以下新的配置和 API 方向，但本轮只做记录：

- OCR 提供商：tesseract、paddleocr、ai。
- 内置 PaddleOCR Tiny 模型和自定义模型导入。
- 自动 OCR 开关 auto。
- AI 模型和推理强度选择。
- 检测、框、识别阈值。
- 配置读取和保存：getOCRConfig、setOCRConfig、importOCRModels。
- AI OCR：/api/ai/ocr。
- 新设备默认 PaddleOCR、Tiny 模型、自动 OCR 关闭。
- 旧配置迁移可能保留 Tesseract 和自动 OCR 开启。
- 切换到 AI 时会关闭自动 OCR，AI 模型必须先在思源中完成配置。

这些能力涉及模型文件、校验、超时、重试、配置竞态、设备资源和隐私边界。3.8.7 正式版发布后必须重新检查实际 API、默认值和迁移逻辑，不能直接照搬 alpha 源码。

## 对本插件的影响

本插件第一面板的搜索实现已经使用：

- /api/search/fullTextSearchBlock
- /api/search/semanticSearchBlock

因此优先级如下：

1. 先在思源 3.8.7 正式版中确认原生全文搜索能返回 OCR 命中，并确认加密笔记本、图片格式、索引延迟和失败响应。
2. 若宿主已提供稳定 OCR 索引，本插件只增加来源标识或筛选，不重复维护 OCR 数据。
3. 在图片相关入口中按宿主能力提供查看、复制、手动 OCR 和重新 OCR；能力不足时不显示会点击后才失败的按钮。
4. 只有宿主提供稳定配置接口且用户主动开启时，才考虑在设置中显示 OCR 相关说明和状态。

## 必须保留的引导和状态

未来接入时，设置和入口至少要区分：

- 未配置：提示用户先到思源 OCR 设置完成引擎、语言或模型配置。
- 本地引擎不可用：说明 Tesseract/PaddleOCR 未安装、模型缺失或资源校验失败，并给出可执行的宿主设置入口。
- AI 未配置：明确 AI OCR 依赖思源已配置的 AI 模型，不把它当作离线功能。
- 图片格式或尺寸不支持：直接说明限制，不显示通用失败。
- 加密笔记本不支持：说明当前宿主边界，不暗示索引丢失。
- 正在处理、超时、取消和失败：保留明确状态，支持重试，不覆盖用户已有文本。
- AI 隐私与费用：首次使用前说明图片可能发送到用户配置的 AI 服务，并提示数据和费用由该服务决定。
- 自动 OCR：默认不替用户打开；若宿主配置已开启，应在本插件中如实显示，不擅自扫描全部资源。

## 暂不实施的内容

- 不依赖思源 3.8.7 alpha 或 dev 分支 API。
- 不把思源 OCR 模型、运行时或 Tesseract/PaddleOCR 打包进本插件。
- 不在本插件内扫描全部图片或另建 OCR 数据库。
- 不伪造 OCR 可用状态，也不在宿主未配置时显示可点击的成功路径。
- 不把 AI OCR 当作本地离线 OCR。

## 3.8.7 正式版后的复核清单

- 对照正式版源码和 API 文档，确认 OCR 配置、图片 OCR、AI OCR 和模型导入接口。
- 用真实宿主验证一张可识别图片、无结果图片、超时、取消、重试、加密笔记本和不支持格式。
- 验证 OCR 文本是否稳定出现在第一面板的全文搜索结果中，并记录索引延迟。
- 确认旧版本配置迁移、默认自动 OCR 状态和宿主最低版本要求。
- 设计 capability gate、设置说明、空态/错误态、隐私提示和双语文案。
- 只有上述证据齐全后，另立实现任务、契约测试和小版本发布计划。
