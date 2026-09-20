# 验收夹具：iCal 重复规则（runbook 5d 节配套）

本目录是 `docs/acceptance-runbook.md` **5d 节**真机验证点使用的 iCal 夹具，
由 `tests/ical-acceptance-fixtures.test.cjs` 门禁保护（解析正确性 + 规则不变）。

## 用法

1. 在仓库根目录启动夹具伺服器（带 CORS 头的零依赖伺服器，插件拉取跨源地址需要响应带 Access-Control-Allow-Origin）：

   ```bash
   node scripts/serve-acceptance-fixtures.cjs 8000
   ```

2. 在小驴雷切设置 → 第二面板 → iCal 日程组件配置中订阅：

   ```
   http://localhost:8000/bysetpos-last-weekday.ics
   http://localhost:8000/daily-weekdays.ics
   http://localhost:8000/yearly-quarterly-dates.ics
   http://localhost:8000/bysetpos-alone-invalid.ics
   ```

3. webcal 验证（5d.4 前半）：webcal 会被重写为 https 拉取，因此需要一个
   真实的公网分享链接（如 Google Calendar/iCloud 的 webcal 订阅地址）；
   本机 http 夹具无法覆盖该分支。

## 夹具与验证点对照

| 夹具 | 验证点 | 期望 |
| --- | --- | --- |
| `bysetpos-last-weekday.ics` | 5d.1 | 每月最后一个工作日出现（周一~周五） |
| `bysetpos-alone-invalid.ics` | 5d.1 降级面 | 仅显示锚点单次事件，不报错 |
| `daily-weekdays.ics` | 5d.2 | 仅工作日出现，周六/周日不出现 |
| `yearly-quarterly-dates.ics` | 5d.3 | 每年 1/3/5/7/9/11 月的 15 日出现 |

窗口提示：组件默认只显示未来 14 天，验证时把「窗口天数」调大（上限 60 天）。
