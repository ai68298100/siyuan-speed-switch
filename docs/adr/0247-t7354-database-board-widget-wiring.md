# ADR 0247：T-7354 属性视图看板卡片生产装配与工作台接入

日期：2026-10-20  
状态：accepted  
任务：T-7354  

## 背景

T-7336 建立了思源原生属性视图（AV）轻量只读看板纯领域模型（`src/av-board-model.js`），支持将数据库行按特定字段聚合为分组桶（Board Groups），计算各桶占比与计数统计。然而，该模型此前未在工作台小组件生态（`DEFAULT_MODULES`）与生产调度层（`src/index.ts`）中正式注册与实例化装配。

## 决策

1. **在 `src/home-model.js` 中正式注册 `database-board` 模块**：
   - `title`: "数据库看板"，`icon`: "iconLayoutRight"，`category`: "siyuan"；
   - 尺寸档位：支持 `medium`、`wide`、`large`，默认档位为 `wide`；
   - 声明 `configSchema`：
     - `blockId`: 数据库选择；
     - `groupBy`: 分组字段选择；
     - `limit`: 每组条数上限（1~12）；
     - `showCounts`: 是否显示桶计数（默认是）；
     - `showPercent`: 是否显示占比（默认否）；
2. **在 `src/index.ts` 中接入生产调度管线**：
   - 注册 `database-board` 适配器，挂载 `loaded-protyle` / `destroy-protyle` 事件监听；
   - 复用 `renderAttributeView` 端点取数与 `getAttributeView` 嵌套镜像库 ID 解析逻辑；
   - 调用 `buildAvBoardSnapshot` 产出包含标题、多桶分组行与统计项的快照对象；
3. **样式层与自适应支持（`_05-settings-widgets.scss`）**：
   - 增加 `.sw-home__cell[data-module-id="database-board"]` 专属排版规则；
   - 统计值启用等宽数字（`font-variant-numeric: tabular-nums`），标签字重设为 medium。

## 证据与验证

1. **定向契约测试**：`node tests/widget-board-and-review-wiring.test.cjs` 包含对模块声明、默认尺寸、Schema、调度管线与样式的全量验证；
2. **负向注入验证**：故意篡改默认尺寸断言 $\to$ 精确红拦截；还原后复绿；
3. **体积与预算校准**：
   - 数据库看板与闪卡复习生产接入将 raw 产物推进至 1,204,500 B，依据 ADR 0247 把 raw bundle 观察线由 1174 KiB 微调至 1178 KiB（1,206,272 B，余量约 1.7 KiB）；
   - 归档包上限相应由 590 KiB 微调至 592 KiB（606,208 B，实际 package.zip 为 604,800 B，余量约 1.4 KiB）；
   - 单条目压缩上限维持 320 KiB 不变。
4. **类型与全量测试**：`pnpm exec tsc --noEmit` 0 错误。
