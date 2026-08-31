# HeatAhead 2–3 分钟 Demo Pitch

建议时长：约 2 分 40 秒。录屏时只展示真实产品，不使用幻灯片。下方英文可以直接照读，中文是操作提示。

## 录制前准备

1. 使用无痕窗口打开公开 Demo，证明不需要登录。
2. 准备坐标 `39.7427, -105.1701`，它会匹配 NLR / ESIF catalog point。
3. 输入 100 MW、70% ESIF-equivalent load state、baseline PUE 1.20。
4. 保持 “Save this run” 开启，以便结束时展示 History。
5. FortyGuard 通常需要 30–90 秒；结果处理期间讲解 Evidence 和 Why now，随后回到结果。

## 分镜与逐字稿

### 0:00–0:20｜问题

**屏幕：** 打开首页，停在标题和输入区。

**说：**

> Data centers usually react after a thermal threshold is already visible in facility telemetry. But outdoor heat, humidity, and neighborhood hot spots can increase cooling demand before that alarm. HeatAhead gives operators an earlier, location-aware planning signal.

### 0:20–0:48｜产品与数据边界

**屏幕：** 指向首页的 Evidence layers 和输入表单。

**说：**

> HeatAhead combines two different evidence layers. FortyGuard provides location-specific environmental exposure across three spatial scales. A locked model trained on real NLR ESIF HPC telemetry estimates an ESIF-equivalent cooling impact. We deliberately keep exposure and cooling prediction separate, so the interface never presents a heat map as if it were trained facility telemetry.

### 0:48–1:18｜坐标验证

**屏幕：** 选择 Custom U.S. facility，粘贴 `39.7427, -105.1701`，点击 **Check location**，展示坐标点和候选设施，再点击确认。

**说：**

> First, I enter a customer coordinate. Before spending API credits, HeatAhead checks the point against a small, transparent demo catalog. This point is close to NLR ESIF, so the customer confirms the candidate. If no match is found, we do not claim it is not a data center. The customer can report it as a custom facility or correct the coordinates.

### 1:18–1:42｜运行参数

**屏幕：** 展示 timezone、time、100 MW、70%、baseline PUE 1.20，然后点击 **Analyze confirmed facility**。

**说：**

> I select the facility timezone and analysis hour, a 100-megawatt IT scenario, and a 70-percent ESIF-equivalent load state—the best-supported region of our training data. The optional baseline PUE anchors a scenario PUE; it is not used as a claim that we trained absolute customer PUE.

### 1:42–2:10｜处理期间讲方法

**屏幕：** 让真实进度条运行；短暂滚动到 Evidence，再回到结果。

**说：**

> One run requests a core square, a 1.2-kilometer neighborhood, and a 2.4-kilometer local context from FortyGuard. The cooling model uses only the corrected center weather point, plus humidity, wet bulb, time, and load state. The surrounding tiles explain environmental exposure; they are not silently inserted into the trained model.

### 2:10–2:34｜解释结果

**屏幕：** 指向 Environmental Exposure、weather-driven increment、Scenario PUE、Transfer Confidence，再展开 confidence reasons。

**说：**

> The result separates the environmental score, the weather-driven cooling increment, and the anchored scenario PUE. Most importantly, Transfer Confidence explains whether the target is inside our evidence envelope. Unknown cooling configuration, sparse load coverage, extreme weather, insufficient tiles, or API timestamp mismatch automatically lower confidence instead of hiding uncertainty.

### 2:34–2:52｜保存与价值

**屏幕：** 滚到 History，展示本次记录；若时间紧，只指出 History 导航。

**说：**

> The customer can save each run into a private browser-scoped timeline, revisit it, resume an incomplete analysis, or permanently delete it. Over time, HeatAhead turns one weather query into an operational record of when extra cooling preparation or closer monitoring may be justified.

### 2:52–3:00｜结尾

**屏幕：** 回到结果顶部或产品标题。

**说：**

> HeatAhead does not replace BMS controls. It gives operators more decision time before reactive protection becomes the only option.

## 必须强调的四句话

- “Exposure and cooling impact are separate evidence layers.”
- “The model is trained on real ESIF HPC telemetry, then scenario-scaled—not retrained on customer data.”
- “Transfer Confidence is capped at Medium and drops to Low outside validated support.”
- “No catalog match does not mean the location is not a data center.”

## 不要这样说

- 不要说 “We predict the customer’s true PUE.” 应说 “anchored scenario PUE”。
- 不要说 “FortyGuard identifies every U.S. data center.” 它提供环境数据；DC catalog 是 HeatAhead 的小型演示目录。
- 不要说 “1 km is the facility boundary.” 三层 AOI 是分析窗口，不是推断出的园区边界。
- 不要说 “Low confidence means the run failed.” 它表示结果成功，但处于迁移或数据支持边界外。
- 不要承诺实时告警、自动预冷或控制设备；当前产品是 planning and decision-support demo。

## 如果现场 API 超过 90 秒

说：

> FortyGuard is processing the three spatial layers asynchronously. HeatAhead saves the workflow state, so the operator can resume it without starting another paid request. I’ll open the most recent completed result from History while this run continues.

然后从 History 打开最近一次 completed run，继续解释输出。不要刷新页面或重复点击 Analyze。
