# ADR 0060：组件身份收口与敏感配置边界

- 状态：已接受
- 日期：2026-09-18
- 关联任务：T-6358、T-6359、T-6360

## 背景

`recent-documents` 与后加入的 `host-recent-docs` 已经读取同一个思源官方
`/api/storage/getRecentDocs` 端点，却同时出现在组件商店中；此外 Miniflux 与 GitHub
令牌仍按普通文本字段渲染。组件协议新增了数据库与多行配置类型后，Agent 侧的字段白名单
也没有同步，导致合法配置元数据被静默丢弃。

## 决策

1. `recent-documents` 是唯一的官方最近文档组件，并获得同一套 `limit` 配置；
   `host-recent-docs` 从目录与运行时 adapter 退役。
2. 读取旧状态时把 `host-recent-docs` 映射为 `recent-documents`，保留原 `instanceId`、配置和
   布局关联；同时存在新旧实例时仍遵循现有的单模块去重规则。
3. 引入 `secret` 配置字段：默认密码态、允许用户显式显示/隐藏、禁用拼写检查，并把长度限制
   在持久化协议现有的 512 字符边界内。
4. Agent 配置元数据同步支持 `textarea`、`database` 与 `database-columns`；`secret` 有意不进入
   Agent 白名单，因此凭据不会通过组件目录或配置状态能力暴露。

## 结果

- 组件商店不再展示两个同义的“最近打开”，旧布局无需用户重配。
- 凭据仍按原存储模型保存和使用，但配置界面默认不明文显示，Agent 读取面也不可见。
- 商店协议与 Agent 只读协议对非敏感字段保持一致，数据库组件不会再出现配置字段缺失。
