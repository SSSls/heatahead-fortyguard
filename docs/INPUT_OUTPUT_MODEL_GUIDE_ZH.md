# HeatAhead 输入、输出、模型与空间口径说明

更新日期：2026-08-30

## 1. 一句话结论

HeatAhead 目前是一个有明确证据边界的 Hackathon 决策支持 Demo：FortyGuard 提供指定地点和时间的空间环境暴露；ESIF 模型给出同等条件下的冷却强度与天气增量；客户 IT load 只负责把无量纲强度换算成 MW；客户 baseline PUE 只负责生成锚定场景 PUE。

它不是大型数据中心的实测数字孪生，也不是控制系统。

## 2. 当前模型不是 LightGBM 论文的直接复现

线上锁定模型是 scikit-learn `HistGradientBoostingRegressor`，不是 LightGBM，也不是 Temporal Fusion Transformer。目标为：

$$
r_{cool,t}=\frac{P_{cooling,t}}{P_{IT,t}}.
$$

模型形式为：

$$
\widehat r_{cool,t}=f_{HGB}(T_t,RH_t,T_{wb,t},h_t,d_t,u_t,\text{hinges},\text{interactions}).
$$

其中：

- $T_t$：干球温度；
- $RH_t$：相对湿度；
- $T_{wb,t}$：湿球温度；
- $h_t$：当地小时的周期编码；
- $d_t$：年内日期的周期编码；
- $u_t$：ESIF 归一化 load state；
- hinges：温度超过 15°C、22°C，以及湿球温度超过 12°C、18°C 后的分段特征；
- interactions：负载与高温的交互项。

锁定参数为 31 个最大叶节点、每叶最少 96 个样本、学习率 0.05、500 轮、L2=0.5，并对需要符合热物理方向的特征施加单调约束。

## 3. R²=0.448 到底意味着什么

数据按时间顺序分为 70% train、15% calibration、15% test，没有随机打乱。测试集结果：

| 指标 | 数值 | 正确解释 |
| --- | ---: | --- |
| Test R² | 0.447880 | 解释了约 44.8% 的时间测试集目标方差，属于中等预测力 |
| Test MAE | 0.003246 | 冷却/IT 比率的平均绝对误差 |
| Train-median baseline MAE | 0.008208 | 只猜训练中位数时的误差 |
| 相对基线 MAE 改善 | 60.5% | 模型有实际信息增益，但不是高精度数字孪生 |

$R^2$ 小不等于不可解释。预测力回答“预测得多准”，可解释性回答“为什么产生这个输出”。当前模型用显式物理特征和单调约束，比完全黑箱更容易审计；但树集成本身仍不是完全透明模型，而且当前 Demo 没有展示逐样本 SHAP，因此不能声称“完全可解释”。

最稳妥的产品表述是：模型可提供有物理约束的、方向上可审计的 ESIF-equivalent 场景，但尚不足以作为大型商业数据中心的控制级真值。

## 4. 和 Frontier LightGBM 论文怎么比较

2026 年 Frontier 论文使用一年、10 分钟粒度的同站点遥测，输入包括 IT 功率、冷却液流量、供回水温度、废热、时间滞后和运行 regime。其 LightGBM surrogate 测试 R² 约 0.791、MAE 约 0.0259 MW，98.7% 测试样本的预测 PUE 与实测 PUE 相差不超过 0.01。

这比 HeatAhead 当前数字强，但不能直接横比：

1. Frontier 任务有冷却系统内部流量和水温等高信息量特征；HeatAhead 主要依赖天气、时间和归一化负载。
2. Frontier 使用随机 80/20 切分；HeatAhead 使用更保守的时间顺序 70/15/15 切分。
3. Frontier 是同一设施内部预测；HeatAhead 还涉及从 ESIF 到客户地点的跨设施迁移。
4. Frontier 论文也明确指出迁移到其他液冷数据中心需要 site-specific recalibration。

所以论文可以证明“physics-guided boosting 对有完整站内 telemetry 的冷却 surrogate 很有效”，但不能直接证明 HeatAhead 的跨设施天气预测已经达到同样精度。

## 5. 每个输入的含义

| 输入 | 是否必需 | 进入 FortyGuard | 进入 ESIF 模型 | 影响输出 |
| --- | --- | --- | --- | --- |
| Facility name | 是 | 否 | 否 | 仅作为记录标签 |
| Latitude / longitude | 是 | 是 | 间接 | 三个 AOI 的中心；决定 API 环境数据 |
| IANA timezone | 是 | 是 | 是 | 本地时间转 UTC，并产生小时/日期特征 |
| Analysis time · local | 是 | 是 | 是 | API 查询时刻；与 API timestamp 对齐 |
| Core square width | 是，默认 360 m | 是 | 否 | 仅改变核心 heatmap 空间范围 |
| Cooling configuration | 是，可 unknown | 否 | 当前不进入 | unknown 会降低 Transfer Confidence |
| IT load (MW) | 可选 | 否 | 否 | 把比率换算为绝对 MW |
| Load state (%) | 是 | 否 | 是 | 归一化负载特征；影响模型与支持级别 |
| Baseline PUE | 可选 | 否 | 否 | 生成 baseline + weather uplift 的场景 PUE |
| Save this run | 可选 | 否 | 否 | 控制是否进入当前客户时间线 |
| Shared improvement consent | 可选，默认关闭 | 否 | 否 | Demo 当前不使用，仅保留独立同意入口 |

### 5.1 IT load 和 load state 不是同一个东西

训练集没有扩展到 100–300 MW。模型输入的是归一化状态：

$$
u_t=\frac{P_{IT,t}^{ESIF}}{P_{IT,P95}^{train}},\qquad P_{IT,P95}^{train}\approx3.66\text{ MW}.
$$

客户输入的 100 MW、300 MW 不进入模型，只用于缩放：

$$
\widehat P_{cooling}=\widehat r_{cool}\,P_{IT}^{customer},
$$

$$
\Delta\widehat P_{cooling}=\Delta r_{weather}\,P_{IT}^{customer}.
$$

因此，大 IT load 会让 MW 结果变大，但不会让模型假装自己见过 300 MW 的训练样本。

## 6. 空间距离到底怎么定义

目前三个范围都是以客户坐标为中心的正方形，不是圆形半径，也不是 FortyGuard 返回的真实园区边界。

| 层级 | 精确几何 | 中心到边 | 中心到角 | API granularity |
| --- | --- | ---: | ---: | ---: |
| Core | 客户输入的 100–1,000 m 宽正方形；默认 360 m | 宽度 / 2 | 宽度 / $\sqrt{2}$ | 60 m |
| Neighborhood | 1.2 km × 1.2 km 正方形 | 600 m | 约 849 m | 80 m |
| Context | 2.4 km × 2.4 km 正方形 | 1.2 km | 约 1.697 km | 100 m |

这些宽度和 granularity 是 HeatAhead 为 Demo 的局部对比、调用时延和 API 用量做出的产品选择，然后作为 polygon AOI 提交给 FortyGuard；并不是 API 强制规定。

大型 hyperscale campus 可能超过 1 km。当前上限不表示“大型数据中心核心一定不到 1 km”，只表示本版把可编辑核心限制在 1 km 宽。已知园区可先输入最重要的建筑/冷却核心；更严谨的下一版应让客户在地图上画真实 polygon，再从 polygon 计算近邻和背景 buffer/ring。

## 7. PUE 怎么处理

ESIF 原始数据确实包含实测 PUE 时间序列。但直接预测 `PUE - 1` 的候选模型没有通过 calibration gate，所以线上没有把它当作训练成功的绝对 PUE 模型。

当前场景 PUE 为：

$$
\Delta r_{weather}=f(T,RH,T_{wb},h,d,u)-f(18,50\%,T_{wb}^{ref},h,d,u),
$$

$$
PUE_{scenario}=PUE_{baseline}+\Delta r_{weather}.
$$

建议 baseline 使用同一客户设施、同一冷却配置、相近负载状态、温和天气下的历史中位数。中位数比均值更稳健，因为 PUE 是比值，低 IT load 或异常时段容易产生尖峰。

可以按 load state 计算 ESIF PUE 均值/中位数，但不建议直接自动填入客户 baseline，因为它会把 ESIF 的设施差异带到 hyperscaler。下面是 train-only 描述统计，作用是解释状态，不是客户 PUE 真值：

| Load state | 训练小时 | PUE 均值 | PUE 中位数 | IQR |
| ---: | ---: | ---: | ---: | ---: |
| 45% | 199 | 1.06478 | 1.03614 | 0.05073 |
| 50% | 87 | 1.08706 | 1.11539 | 0.09477 |
| 55% | 199 | 1.10915 | 1.11418 | 0.02056 |
| 60% | 527 | 1.09710 | 1.10478 | 0.02072 |
| 65% | 1,103 | 1.08250 | 1.09000 | 0.02882 |
| 70% | 2,319 | 1.08227 | 1.08724 | 0.02716 |
| 75% | 1,669 | 1.08001 | 1.08578 | 0.02497 |
| 80% | 171 | 1.05644 | 1.07708 | 0.06123 |
| 85% | 332 | 1.06317 | 1.07426 | 0.00738 |
| 90% | 780 | 1.04995 | 1.06753 | 0.04977 |
| 95% | 1,007 | 1.04395 | 1.02200 | 0.04961 |
| 100% | 832 | 1.03614 | 1.02057 | 0.04742 |
| 105% | 90 | 1.04016 | 1.02131 | 0.04578 |

## 8. 每个输出的含义与信任级别

### 8.1 Environmental Exposure

直接由 FortyGuard 空间统计和环境参数构成：

$$
Score=100\left(0.30D+0.40W+0.15\Delta+0.15H\right),
$$

其中 $D$ 为 core p90 干球热度归一化，$W$ 为湿球热度归一化，$\Delta$ 为核心相对背景温差归一化，$H$ 为热点 tile 比例。Low / Elevated / High 的阈值分别为小于 35、35–65、65 以上。

它是启发式暴露指数，不是故障概率，也不是经过客户事故标签训练的风险概率。

### 8.2 Spatial environment

- center：距离输入坐标最近 tile 的温度；
- mean：AOI 所有可用 tile 的平均温度；
- p90：约 10% tile 高于该值，代表高温尾部；
- max：最热 tile；
- $\sigma$：核心内部温度离散程度；
- hotspot fraction：核心中高于背景均值 1°C 的 tile 比例；
- core delta：core mean − context mean。

这些是 API 直接派生统计，信任级别高于跨设施模型结果，但仍是 FortyGuard 建模环境 tile，不等同于现场传感器。

### 8.3 Predicted Cooling Impact

`cooling ratio` 是 ESIF 模型的核心输出；`cooling MW` 是 ratio × 客户 IT MW；`weather uplift` 是相对 18°C / 50% RH 参考天气的增量；`incremental cooling MW` 是 uplift × 客户 IT MW。

这些是 ESIF-equivalent 模型输出。内部时间测试已通过，但目标设施没有真实冷却标签，因此不能称为客户实测预测。

### 8.4 Transfer Confidence

这是规则型适用性标签，不是统计置信区间：

- API 时间不对齐：Low；
- cooling configuration unknown：Low；
- load state 训练支持稀疏：Low；
- 其他情况：Medium；
- 当前永远不会显示 High，因为 API-to-ESIF 和跨设施 weather transfer 尚未外部验证。

P10/P90 和 rolling conformal 区间没有通过覆盖率 gate，所以本版不显示伪精确区间。

## 9. 保存与永久删除

勾选 Save 后，输入、API 摘要、模型版本和输出保存在 D1，并按当前 ChatGPT 用户或匿名浏览器 cookie 隔离。取消勾选的临时运行在完成后不会进入历史。

History 每条记录现在有 `Delete`：

1. 点击 Delete；
2. 浏览器要求二次确认；
3. 服务端再次按当前 customer scope 和记录 id 验证归属；
4. 从 D1 永久删除；
5. 操作不可恢复。

删除记录不会撤销已经提交给 FortyGuard 的上游 activity。当前仍没有 hide/restore 和自动保留期限。

## 10. 坐标覆盖的正确说法

表单允许美国范围的坐标只是输入校验，不代表“美国所有坐标都有数据”。真正覆盖验证必须满足：三个 heatmap activity 完成、均返回可用 temperature tiles、环境参数返回 RH 与湿球温度，并且时间戳可解释。

预设列表不是 coverage 白名单。任何不在预设中的美国设施都可以选择 `Custom U.S. facility`、粘贴坐标、设置正确 IANA timezone 后提交。运行成功才是该地点/时刻在当前 API 下的实证覆盖。

### 10.1 三个未预设坐标的真实验证

验证设置：2026-08-29 14:00 当地时间、600 m core square、70% load state、100 MW IT load、baseline PUE 1.10、direct-to-chip；`saveForHistory=false`。三处均完成三个 heatmap 和 environmental parameter activity。

| Custom facility | 坐标 | Core / near / context | RH / 湿球 | Exposure | 100 MW 天气增量 | Scenario PUE | Confidence |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| Microsoft Boydton, VA | `36.6854, -78.3766` | 31.35 / 31.40 / 31.47°C | 58.8% / 22.6°C | Elevated · 42.4 | +1.51 MW | 1.1151 | Medium |
| Google Council Bluffs, IA | `41.220836, -95.863464` | 32.45 / 32.41 / 32.39°C | 54.4% / 23.9°C | Elevated · 49.3 | +1.50 MW | 1.1150 | Medium |
| Meta Prineville, OR | `44.295709, -120.885998` | 18.41 / 18.41 / 18.42°C | 27.9% / 9.5°C | Low · 1.8 | −0.40 MW | 1.0960 | Medium |

这些结果证明这三个“未在 Demo 预设列表中”的坐标和所选历史时刻能走通当前 API 管线；它们不证明目标设施的实际 IT load、PUE 或冷却功率，也不能外推为美国全覆盖。

时间戳还有一个需要透明展示的细节：FortyGuard 在这三次 8 月请求中返回的 offset 分别为 `-05:00`、`-06:00`、`-08:00`，而对应 IANA 时区当日处于夏令时。当前服务端同时保存 IANA 转换后的 UTC、API timestamp 和对齐依据；当 API 的当地墙钟小时一致但固定 GMT offset 相差一小时时，记录为 `local-wall-clock` 对齐。界面现已同时展示 Local、UTC 和 API timestamp，方便评委审查。若用于生产，应向 FortyGuard 确认 offset 语义，或者把任何 UTC instant mismatch 都降为 Low。

## 11. 后续模型升级优先级

1. 保持当前 HGB 作为冻结基线。
2. 增加 GAM / Explainable Boosting baseline，比较预测力与可解释性。
3. 对树模型增加 global permutation importance、partial dependence 与逐样本 SHAP，但不要把 SHAP 当因果解释。
4. 获得客户站内流量、供回水温度、泵/风机功率后，再做类似 Frontier 的 site-specific LightGBM recalibration。
5. 建立真正的跨设施外部测试，之后才能把 Transfer Confidence 提升到 High。
6. 后续构建新验证集时应考虑 ORNL Summit 作为第三个组件级验证数据集；它适合验证 compute/power → component temperature，但不能替代 ESIF 的设施级天气—冷却联合数据。

## 12. 主要资料

- NLR / ESIF PUE 数据集：https://data.nlr.gov/submissions/300
- Frontier physics-guided LightGBM 论文：https://arxiv.org/abs/2601.02275
- 当前锁定模型卡：`docs/MODEL_CARD.md`
