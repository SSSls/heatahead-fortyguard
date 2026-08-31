# HeatAhead 公开生产 QA

验证时间：2026-08-31（America/New_York）
生产地址：https://heatahead-fortyguard.chunxusun2.chatgpt.site/

## 公开访问

- Sites access mode：`public`
- 无 Cookie、无登录 HTTP 请求：`200 OK`
- 页面标题：`HeatAhead — Data Center Weather Intelligence`
- 页面版本：`v2.3`
- 登录墙：未出现
- 首屏脚本错误：0
- 全新匿名作用域的 `/api/analyses`：`{"analyses":[]}`

公开站点使用 HttpOnly 匿名作用域 Cookie 隔离不同浏览器的历史。已登录访客继续使用稳定的 Sites 用户 ID。旧版共享的固定匿名作用域已经移除。

## 真实端到端分析

使用公开站点对 Ashburn 自定义美国设施坐标完成一次不保存的 QA 运行：

| 字段 | 值 |
| --- | --- |
| Facility | Production QA - Ashburn |
| Coordinates | 39.0438, -77.4874 |
| Requested local time | 2026-08-31 15:00 America/New_York |
| Stored UTC | 2026-08-31 19:00 UTC |
| Facility footprint | 360 m |
| IT load scenario | 100 MW |
| Load state | 80% · observed support · 171 h |
| Cooling configuration | unknown |
| Baseline PUE | 1.20 |
| Save history | off |

状态路径：

```text
processing_spatial -> submitting_environment -> processing_environment -> completed
```

FortyGuard 返回：

- Core tiles：36
- Near tiles：195
- Background tiles：588
- Center tile：30.6438°C
- Core mean：30.6643°C（只用于暴露解释，不作为 ESIF 模型温度输入）
- Core p90：30.7388°C
- Background mean：30.6133°C
- Relative humidity：46.7%
- Wet bulb：23.6°C
- API timestamp：2026-08-31 15:00 GMT-5
- Timestamp alignment：`mismatch`。请求时区当日为 UTC-4，而 FortyGuard 元数据返回 GMT-5；v2.3 不再以相同本地钟面时间代替 UTC 对齐。

锁定模型输出：

- Cooling ratio：0.0191366
- ESIF-equivalent cooling：1.9137 MW（100 MW IT 场景缩放）
- Weather increment：+1.3445 MW
- Environmental Exposure：Elevated，44.88 / 100
- Transfer Confidence：Low
- Scenario PUE：1.2134

`Low` 是预期的安全降级，而不是运行失败。此次样本同时触发四项可见原因：API / 请求 UTC 不一致、冷却配置未知、干球温度超过 ESIF 训练 P95 28.2°C、湿球温度超过 ESIF 训练 P95 17.1°C。结果仍展示为情景估计，但不能被解读为目标设施已校准预测。

完成后使用同一匿名 Cookie 再次读取 History，`analysis_count=0`，证明 `saveForHistory=false` 的临时编排记录在终态后已删除。

## 发布前自动验证

- `npm run build`：通过
- `npm test`：7 / 7 通过
- `npm run lint`：通过
- `npx tsc --noEmit`：通过
- `npm audit --omit=dev`：生产依赖 0 个已知漏洞

## 密钥检查

- FortyGuard credential 只从服务器运行时的 `FORTYGUARD_API_KEY` 读取。
- HTML 渲染测试会拒绝环境变量名或看起来像硬编码 `api-key` 的值。
- 公开分析响应不包含 credential、上游 activity IDs 或内部 customer scope。
- 可发布 Git 历史已重新生成并清理，旧测试中的明文 credential 不在当前可达提交历史中。
