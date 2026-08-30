# HeatAhead ESIF cooling model card

## Intended use

Estimate weather-sensitive, ESIF-equivalent cooling impact from time-aligned point weather and normalized load state. The model supports a hackathon decision-support demo; it is not a control system and not a validated absolute predictor for a commercial hyperscale facility.

## Target

The approved target is the cooling-to-IT ratio

$$
r_{cool,t}=\frac{P_{cooling,t}}{P_{IT,t}}.
$$

The deployed estimator is

$$
\widehat r_{cool,t}=f_{HGB}(T_t,RH_t,T_{wb,t},h_t,d_t,u_t,\text{hinges},\text{interactions}),
$$

where `HGB` is a physics-constrained histogram gradient boosting regressor, $h_t$ is local hour, $d_t$ is day of year, and $u_t$ is ESIF-normalized IT load state.

## Features

The locked artifact has 13 features: dry-bulb temperature; relative-humidity fraction; wet-bulb temperature; temperature hinges above 15°C and 22°C; wet-bulb hinges above 12°C and 18°C; hour sine/cosine; day-of-year sine/cosine; normalized IT load state; and load × temperature-above-15°C interaction.

Monotonic constraints encode the expected non-decreasing cooling response to hotter / more humid thermal conditions where applicable.

## Split and selection

Data are split chronologically to avoid future-to-past leakage:

| Block | Share | Rows |
| --- | ---: | ---: |
| Train | 70% | 9,846 |
| Calibration | 15% | 2,110 |
| Test | 15% | 2,110 |

Candidate models included Ridge regressions and constrained / unconstrained histogram gradient boosting configurations. The selected model uses 31 maximum leaves, 96 minimum samples per leaf, learning rate 0.05, 500 iterations, and L2 regularization 0.5.

## Locked performance

| Metric | Value |
| --- | ---: |
| Test R² | 0.447880 |
| Test MAE | 0.003246 |
| Train-median benchmark MAE | 0.008208 |
| Web-export parity max absolute error | ~1.37 × 10⁻¹¹ |

The direct `PUE - 1` model did not pass its calibration gate and is not used. The original P10/P90 interval and the rolling conformal alternative also failed the required coverage gate, so the UI does not present a statistical prediction interval.

## Weather uplift and scaling

HeatAhead uses a disclosed mild-weather reference at 18°C and 50% RH while keeping hour, day, and load state fixed:

$$
\Delta r_{weather}=f(T,RH,T_{wb},h,d,u)-f(18,0.50,T_{wb}^{ref},h,d,u).
$$

When the user supplies IT load:

$$
\widehat P_{cooling}=\widehat r_{cool}\,P_{IT},
$$

$$
\Delta \widehat P_{cooling}=\Delta r_{weather}\,P_{IT}.
$$

This is proportional scenario scaling. ESIF training was not expanded to 100–300 MW. The training-only IT-power P95 reference is about 3.66 MW, and load state—not customer MW—is the model feature.

When the user supplies a defensible baseline PUE:

$$
PUE_{scenario}=PUE_{baseline}+\Delta r_{weather}.
$$

Baseline PUE should preferably come from the same facility, comparable load band and cooling configuration, using a representative mild-weather median. Public campus, regional, fleet, or assumed values must be labeled as weaker anchors.

## Confidence interpretation

`Transfer Confidence` is a rule-based applicability label, not a confidence interval. It is Low when the API timestamp is not aligned, cooling configuration is unknown, or the selected load state has sparse ESIF support. It is otherwise Medium and is intentionally never High until API-to-ESIF and cross-facility weather transfer have been externally validated.

## Claim boundary

- Direct: FortyGuard spatial environmental exposure for the requested place and time.
- Modeled: ESIF-equivalent cooling ratio and weather uplift.
- Scaled: MW impact using user-supplied IT load.
- Anchored scenario: baseline PUE plus weather uplift.
- Not claimed: measured target-facility cooling power, trained hyperscale absolute PUE, causal incident prevention, or a reliable statistical prediction interval.
