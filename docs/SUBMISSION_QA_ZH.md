# HeatAhead 公开生产 QA

验证时间：2026-08-30（America/New_York）  
生产地址：https://heatahead-fortyguard.chunxusun2.chatgpt.site/

## 公开访问

- Sites access mode：`public`
- 无 Cookie、无登录 HTTP 请求：`200 OK`
- 页面标题：`HeatAhead — Data Center Weather Intelligence`
- 登录墙：未出现
- 首屏脚本错误：0
- 全新匿名作用域的 `/api/analyses`：`{"analyses":[]}`

公开站点使用 HttpOnly 匿名作用域 Cookie 隔离不同浏览器的历史。已登录访客继续使用稳定的 Sites 用户 ID。旧版共享的固定匿名作用域已经移除。

## 真实端到端分析

使用公开的 NLR / ESIF 设施坐标完成一次不保存的 QA 运行：

| 字段 | 值 |
| --- | --- |
| Facility | Submission QA · NLR ESIF |
| Coordinates | 39.7427, -105.1701 |
| Requested local time | 2026-08-29 12:00 America/Denver |
| Stored UTC | 2026-08-29 18:00 UTC |
| Facility footprint | 360 m |
| IT load scenario | 100 MW |
| Load state | 70% · strong support · 2,319 h |
| Cooling configuration | direct-to-chip |
| Save history | off |

状态路径：

```text
processing_spatial -> processing_environment -> completed
```

FortyGuard 返回：

- Core tiles：36
- Near tiles：225
- Background tiles：625
- Core mean：32.6147°C
- Core p90：32.6579°C
- Background mean：32.5961°C
- Relative humidity：19.1%
- Wet bulb：16.4°C
- API timestamp：2026-08-29 12:00 GMT-7
- Timestamp alignment：通过 local-wall-clock 对齐

锁定模型输出：

- Cooling ratio：0.0070993
- ESIF-equivalent cooling：0.7099 MW（100 MW IT 场景缩放）
- Weather increment：+0.2173 MW
- Environmental Exposure：Low，24.59 / 100
- Transfer Confidence：Medium
- Scenario PUE：未显示，因为未提供 baseline PUE

完成后使用同一匿名 Cookie 再次读取 History，结果仍为空，证明 `saveForHistory=false` 的临时编排记录在终态后已删除。

## 密钥检查

- FortyGuard credential 只从服务器运行时的 `FORTYGUARD_API_KEY` 读取。
- HTML 渲染测试会拒绝环境变量名或看起来像硬编码 `api-key` 的值。
- 公开分析响应不包含 credential、上游 activity IDs 或内部 customer scope。
- 可发布 Git 历史已重新生成并清理，旧测试中的明文 credential 不在当前可达提交历史中。
