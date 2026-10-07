# 品牌图标导出清单（2026-10-07）

本清单对应 T-7156。`docs/assets/lvspeed-switch-master.svg` 是可维护母版；根目录的 `icon.png` 仍是当前正式插件资产，本轮没有未经审核替换它。

## 母版与语义

- 主符号：层叠页签 + 闪电。
- 固定名称：小驴雷切 / LvSpeed Switch。
- 母版画布：160×160 SVG，圆角白色底板，蓝青页签，单一闪电形。
- 识别约束：16px 以上依靠轮廓和色块识别，不依赖文字、细线或发光。
- 使用范围：插件图标、GitHub/集市头像和 README 素材的候选来源；不表示已经替换发布资产。

## 候选尺寸

| 文件 | 尺寸 | 背景 | 用途 |
| --- | ---: | --- | --- |
| `docs/assets/icon-16.png` | 16×16 | 内置浅色底板 | 小图标/紧凑列表 |
| `docs/assets/icon-24.png` | 24×24 | 内置浅色底板 | 工具栏和导航 |
| `docs/assets/icon-32.png` | 32×32 | 内置浅色底板 | 菜单和卡片 |
| `docs/assets/icon-48.png` | 48×48 | 内置浅色底板 | 设置/集市预览 |
| `docs/assets/icon-160.png` | 160×160 | 内置浅色底板 | 头像与大图候选 |

导出图均从同一 SVG 母版生成，避免不同尺寸各自改形。正式替换前仍需在浅色、深色、中性灰和圆形裁切下人工确认边缘与辨识度。

## 当前导出哈希

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `lvspeed-switch-master.svg` | 2,383 | `CDC0774BBF0DF8082F82CF8BBF1D954F5783A40530B5CFFFDCB91EFBDDB18496` |
| `icon-16.png` | 493 | `43B24FCF67C658363B34BEB5F954B0F4357AF4DCCFB188A6138DCF1541EE8B22` |
| `icon-24.png` | 826 | `511C7664391EDB633C8C210420DD9DBA2D4D804CFFC29B4F7660F827C61F9548` |
| `icon-32.png` | 1,220 | `918B20DF94F0DAF361C6EC74FF98807CEE74A24877CC6A96928763BD49E3ED76` |
| `icon-48.png` | 2,161 | `2108A5EEABFAECDE280FC99DC7085E51C4627FA6F23ADF0EB375438DA804366F` |
| `icon-160.png` | 12,057 | `CCA4EE6639FFD6D20D587A02C68D93B6E586B134DF7F06A3780F94D13D9F579E` |

## 授权与发布边界

- 母版为本仓新增矢量源，当前正式 `icon.png` 的历史来源和署名仍按 T-7165 单独核对。
- 候选素材放在 `docs/assets/`，不会被 webpack 自动打入插件包。
- 只有通过 T-7156 评审并完成资源门禁后，才可替换根目录 `icon.png` 或更新对外预览。
