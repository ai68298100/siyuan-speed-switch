# ADR 0121：剪藏待读改为提供方协议组件

- 状态：已接受
- 日期：2026-10-04
- 任务：T-6997

## 背景

`clipped-unread` 原本由小驴雷切直接查询 `blocks.tag`，默认把“剪藏”当作通用标签。这个查询无法证明数据来自剪藏插件，也会把用户普通使用的同名标签误展示为剪藏内容。规格卡已经要求“与剪藏插件数据同源；无插件 = blocked 占位”。

## 决策

1. 内置适配器继续登记 `clipped-unread`，但只返回受控 `blocked` 快照和本地化前置条件，不再执行标签 SQL。
2. 支持剪藏的插件通过公开 `registerHomeModule()` 使用同一 `moduleId` 接管适配器，并声明 `source` 为 `siyuan-clipper` / “思源剪藏”。
3. runtime 保留内置 blocked 适配器作为回退。provider 接管时清理旧快照；provider 注销后恢复 blocked 回退，旧注销句柄继续因 token 失效。
4. `blocked` 是视图可识别的非错误状态：使用 `emptyHint`，ARIA 角色为 `status`，不显示错误重试按钮。

## 影响

- 没有剪藏插件时，用户会看到明确的安装/启用提示，普通标签不会被冒充为剪藏数据。
- provider 的配置和布局不因卸载删除，重新注册后仍可恢复；提供方自行决定如何解释既有配置字段。
- 原有纯模型函数仍保留给兼容库存和迁移场景，但不再接入生产读取路径。

## 验证

- runtime 覆盖、缓存失效、注销恢复和旧句柄失效测试。
- adapter `blocked` 快照归一化与视图非错误占位测试。
- 生产接线断言确认 `clipped-unread` 不再访问 SQL。
- 按 `docs/gate-audit-checklist.md` 对 SQL 回退、blocked 传播和 fallback 恢复做负向验证。
