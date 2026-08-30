# HeatAhead 三分钟 Demo 脚本

目标时长：2 分 45 秒到 2 分 55 秒。只展示真实产品操作，不用幻灯片。

## 0:00–0:20｜问题

“数据中心的保护系统通常在温度已经上升时响应。HeatAhead 希望把室外热暴露、湿球温度和设施负载放在同一条提前决策路径里，让运营人员在告警前获得更清楚的准备窗口。”

画面：主页顶部，快速指出 `Exposure ≠ Cooling impact`。

## 0:20–0:45｜输入

“我们输入设施位置、当地分析时间和时区。设施 footprint 决定核心 AOI。Load state 是 ESIF 归一化负载特征；IT load 只把归一化结果换算成 MW；baseline PUE 只用于场景锚定。”

画面：选择一个预设美国数据中心；选 70% load state；填写 IT load；选择已知 cooling configuration；可填写明确来源的 baseline PUE。

## 0:45–1:25｜真实运行

“点击 Run 后，HeatAhead 向 FortyGuard 提交三层空间分析：设施核心、约 1 km 近邻和约 2–3 km 本地背景。FortyGuard 是异步任务，所以我们保存 activity ID，并持续恢复同一次运行，不重复创建任务。”

画面：点击 Run analysis，展示四阶段进度。若等待超过录制节奏，可提前准备一个已完成的 History 记录，但必须先展示真实提交动作。

## 1:25–2:05｜结果

“Environmental Exposure 直接来自 FortyGuard 空间结果，包括核心 p90、热点比例和核心相对背景温差。Predicted Cooling Impact 使用同一时间点的温度、相对湿度和湿球温度进入锁定的 ESIF 模型。空间热力图没有被伪装成训练特征。”

画面：依次指向 Environmental Exposure、三层空间环境、point weather、Predicted Cooling Impact。

## 2:05–2:30｜可信度与行动

“Transfer Confidence 不是统计置信区间，而是适用性标签。时间错位、未知冷却配置或稀疏 load state 会降为 Low；在跨设施天气迁移完成外部验证前，最高只显示 Medium。产品给出需要人工确认的运营建议，而不会直接控制设施。”

画面：指出 confidence、load-state evidence 和 suggested operator review。

## 2:30–2:55｜证据与边界

“模型在 ESIF 时间序列上按 70/15/15 顺序切分，冷却比测试 R² 为 0.448、MAE 为 0.003246。Frontier 只保留通过验证的 operational baseline；未通过的天气迁移系数不用于客户结论。HeatAhead 的价值是把位置环境和可审计的冷却场景放进一个提前决策界面。”

画面：滚动到 Evidence ladder 和 claim boundary；以产品名称结束。

## 录制检查

- 使用无痕窗口和公开生产 URL。
- 浏览器缩放 100%，关闭通知和个人书签栏。
- 预先准备一个能在 30–60 秒内完成或可从 History 恢复的分析。
- 录屏中不要打开开发者工具、环境变量或任何密钥页面。
- 上传 YouTube 时可设为 Unlisted；Loom 设为 anyone with the link。
- 上传后再次在无痕窗口打开视频链接并检查总时长不超过 3:00。
