# HeatAhead v2.3：准确度、输入与模型路线

## 本版已经完成

1. Cooling 模型不再使用 Core AOI 平均温度，改为使用经几何修正后最接近客户坐标的中心温度 tile。
2. Core、1.2 km Neighborhood、2.4 km Context 明确为三个嵌套正方形，不再描述为真实园区边界或互不重叠环带。
3. 当地时间以墙钟时间提交给 FortyGuard，同时由 HeatAhead 独立解析 UTC；DST 不存在或重复小时直接拒绝。
4. API 返回的时间必须在 UTC instant 和 timezone offset 上匹配，不能仅凭相同墙钟小时通过。
5. Transfer Confidence 新增以下 Low gate：
   - 干球温度超过 ESIF Train P95：28.2°C；
   - 湿球温度超过 ESIF Train P95：17.1°C；
   - Core 少于 10 个有效 tile；
   - Neighborhood 或 Context 少于 20 个有效 tile；
   - 时间不匹配、冷却类型未知或 load support 稀疏/外推。
6. 公开 API 增加匿名/IP/全局额度、并发保护、429 响应和短期记录清理。
7. 保存历史明确为浏览器作用域，最长保留 90 天；永久删除只删除 HeatAhead D1 数据。

## 当前输入的准确含义

| 输入 | 当前作用 |
| --- | --- |
| 经纬度 | 三个 AOI 的中心，也是 cooling 模型中心 tile 的目标位置 |
| Core width | 只改变 Core exposure 统计，不再把 Core mean 喂给模型 |
| 当前 IT MW | 只把 cooling ratio 换算为场景 MW |
| ESIF-equivalent load state | 直接进入模型；不是客户设施的设计利用率 |
| Cooling configuration | 只参与适用性判断，当前没有配置专属系数 |
| Baseline PUE | 只作为 `baseline + weather uplift` 的同设施锚点 |

## 下一轮公平模型实验

固定最终 15% Test，不再用 Test 调参。在前 85% 上做 3–5 个 expanding-window folds，并在相邻块之间保留 24 小时 gap。所有模型使用相同数据、fold 和 gate：

1. 当前 monotonic HistGradientBoosting，作为冻结 baseline；
2. monotonic LightGBM；
3. monotonic EBM / shape-constrained GAM；
4. 半物理基线 + monotonic residual model。

推荐的半物理结构为：

$$
r_{phys}(u,T_{wb})=
\beta_0+\frac{\beta_1}{u}
+\beta_2[T_{wb}-\tau_1]_+
+\beta_3u[T_{wb}-\tau_2]_+,
$$

$$
\hat r_t=r_{phys,t}+f_{residual}(x_t).
$$

评估必须同时报告总体 MAE / RMSE / $R^2$、signed bias、24h/168h persistence、极端干球/湿球切片、各 load band、单调性违规数，以及相对 ESIF 站点天气和 FortyGuard 输入的 source-shift 误差。

## 数据工作优先于深度模型

最有价值的新数据不是更多 UI 选项，而是：

1. 在 ESIF 坐标按历史同时刻回填 FortyGuard，拟合 API 到 ESIF station 的 bias calibration；
2. 使用 FortyGuard 历史窗口增加 1/3/6/24h lag、rolling mean、maximum、slope 和连续高温小时；
3. 取得客户真实 current IT MW、design capacity、供回水温度、流量、泵/风机功率、设备状态、setpoint 与实测 PUE/cooling power；
4. 有多个带标签设施后再做 site-specific calibration、hierarchical model 和 regime model。

TFT / TCN 暂不作为第一优先级：当前只有单站约 14k 小时，目标商业设施又没有历史 cooling label，复杂网络无法自动消除跨设施 domain shift。
