# TODO

## P0

- [x] T-001 手机端底栏组件面板入口
  - 验收：底栏可见按钮，点击直达组件面板
  - 状态：done (v0.16.26)
- [x] T-002 组件商店分区与安装状态识别
  - 验收：可用/待安装两大分区；400ms 缓冲复扫
  - 状态：done (v0.16.30)
- [x] T-003 智能体受控写三项（勾选任务/新建文档/追加日记）
  - 验收：确认弹窗 + 效果如实声明
  - 状态：done (v0.16.32)
- [x] T-004 智能体文档大纲能力
  - 验收：flattenOutline 纯函数 + handler 注册 + spec
  - 状态：done (v0.16.35)

## P1

- [ ] T-005 内置组件 stat 进度条渲染
  - 验收：today-tasks 显示完成进度条；journal-monthly 显示月份进度
  - 依赖：home-view.js stat hero 已实现，home-adapters stat.progress 透传已实现
  - 状态：todo
- [ ] T-006 tags/bookmarks 组件条目比例条渲染
  - 验收：标签按出现次数显示行内比例条
  - 依赖：home-adapters item.count 透传已实现，home-view 条目 count 渲染已实现
  - 状态：todo（代码已写入，需验证全量测试通过）
- [ ] T-007 推送积压提交到远端
  - 验收：git rev-list --count origin/main..HEAD = 0
  - 依赖：网络恢复
  - 状态：todo（间歇性网络重置）

## P2

- [ ] T-008 商店卡片分类 Tab（内置/插件/待安装）
  - 验收：三 Tab 切换，空分区自动隐藏
  - 状态：todo
- [ ] T-009 收集箱组件（需云端登录）
  - 验收：/api/inbox/getShorthands 读取
  - 依赖：用户登录思源云端
  - 状态：blocked（依赖云端）
