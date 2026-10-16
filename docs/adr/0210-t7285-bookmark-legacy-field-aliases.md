# ADR 0210：书签块旧宿主字段别名兼容

- 日期：2026-10-16
- 状态：accepted
- 任务：T-7285
- 相关：T-7144、ADR 0201、ADR 0209

## 背景

T-7144 的旧宿主兼容审计发现，书签组件已经能从现代宿主返回的 `id`/`blockId` 与 `rootID`/`rootId` 生成块级定位值，但同一投影对旧兼容层常见的 `blockID`、`block_id`、`root_id` 字段会回退成仅按名称打开书签 dock。这样数据明明带有合法块 ID，点击仍无法精确定位到原文档块。

## 决策

1. 在书签模型读取块字段时，按 `id → blockId → blockID → block_id` 与 `rootID → rootId → root_id` 的稳定顺序归一化。
2. 归一化后的 ID 继续经过既有 14 位时间戳 + 后缀校验，并复用 `bookmark-block:<blockId>:<rootId>` 动作协议；非法或缺失 ID 仍安全回退 `bookmark:<name>`，不伪造定位成功。
3. 不改变同名书签的名称聚合或宿主书签 dock 协议；没有稳定 ID 的旧响应仍保持名称入口。

## 验证

- 模型/接线定向测试：`node --test tests/kernel-widget-model.test.cjs tests/component-specs-batch8-wiring.test.cjs`，**58/58** 通过，覆盖 `blockID` 与 `block_id/root_id` 两种旧字段组合。
- 负向验证：将生产读取表达式临时移除 `block_id`、`root_id` 别名后，新增模型用例精确失败；恢复后定向套件回绿。注入文件使用字节级还原并保留原换行。
- 生产构建：`package.zip` **591784 B**，预算 **591872 B**，余量 **88 B**；为抵消新增兼容代码，README 中与版本日志重复的双语内测提示已移除，发布包内容与功能无关。

## 边界

本任务只兼容书签块 ID 字段别名，不声称能区分没有稳定 ID 的同名书签组，也不把打开书签 dock 描述为精确选中。真实旧版本宿主仍需在合法隔离工作区补一次 E2E 取证。
