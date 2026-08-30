# HeatAhead

HeatAhead is a FortyGuard Hackathon demo for location-aware thermal decision support at U.S. data centers. It combines live or historical outdoor environmental analysis from FortyGuard with a locked model trained on NLR/ESIF HPC facility telemetry.

**Live demo:** https://heatahead-fortyguard.chunxusun2.chatgpt.site/

## What the demo does

1. Accepts a facility name, coordinates, local analysis time, IANA timezone, footprint, load state, cooling configuration, and optional IT load / baseline PUE.
2. Submits three asynchronous FortyGuard spatial analyses: facility core, roughly 1 km neighborhood, and roughly 2–3 km background.
3. Retrieves point relative humidity and wet-bulb temperature for the same requested time.
4. Reports `Environmental Exposure` directly from the spatial API result.
5. Applies the locked ESIF model to point weather and load state to estimate an ESIF-equivalent cooling ratio and weather uplift.
6. Scales the normalized result to MW only when the user supplies IT load. Scenario PUE is shown only when a baseline PUE is supplied.
7. Stores resumable activity IDs and optional analysis history in Cloudflare D1.

## Architecture

```text
Browser
  -> Next.js / vinext UI
  -> server-only /api/analyses orchestration
       -> FortyGuard API (secret injected at runtime)
       -> Cloudflare D1 (job state and saved history)
       -> locked ESIF model exported as JSON
  <- exposure, cooling scenario, data quality, confidence
```

The browser never receives the FortyGuard API key. The API client reads `FORTYGUARD_API_KEY` only from the server runtime and sends it to FortyGuard in the server-side `api-key` header.

## Model

The deployed model is a physics-constrained histogram gradient boosting regressor trained on the target `cooling_kw / it_power_kw`. It uses temperature, relative humidity, wet-bulb temperature, time-of-day / season features, normalized ESIF load state, and temperature-load interactions. Training, calibration, and testing are chronological (70% / 15% / 15%). The locked test result is R² 0.448 and MAE 0.003246, compared with a train-median baseline MAE of 0.008208.

The web model is an exact JSON export of the validated Python model; export parity maximum absolute error is approximately `1.37e-11`.

See [MODEL_CARD.md](docs/MODEL_CARD.md) for equations, validation gates, and claim boundaries.

## Important boundaries

- Environmental Exposure is a direct FortyGuard spatial analysis.
- Predicted Cooling Impact is an **ESIF-equivalent scenario**, not measured customer-facility telemetry.
- Spatial heatmap statistics are displayed separately and are not inserted into the ESIF-trained model.
- IT load scales a normalized cooling ratio to MW; the model was not trained on 100–300 MW hyperscale facilities.
- Scenario PUE equals user-supplied baseline PUE plus modeled weather uplift. It is not an absolute-PUE model.
- Frontier provides an external operational-baseline check. Its cross-facility weather coefficient failed the gate and is not used.
- Transfer confidence is an applicability label, not a statistical prediction interval, and is capped at Medium until cross-facility transfer is externally validated.
- This is planning support, not autonomous facility control or a replacement for site telemetry, alarms, redundancy checks, or operating procedures.

## Data sources

- [FortyGuard environmental parameters API](https://docs-api.fortyguard.com/docs/environmental-parameters)
- [NLR / ESIF HPC Facility PUE Data](https://data.nlr.gov/submissions/300)
- [NLR / ESIF Eagle Jobs and Energy Metrics](https://data.nlr.gov/submissions/295)
- Frontier is used only for the documented external calibration check; prospective target-site outputs are scenarios, not ground truth.

Large raw datasets and experiment outputs are intentionally excluded from this application repository. The repository contains only the locked model artifact required for inference.

## Run locally

Requirements: Node.js `>=22.13.0`.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Set the real FortyGuard credential in `.env.local`. Never commit that file.

For a production-quality local analysis, D1 must also be available through the project runtime. Static rendering, linting, and tests do not require a live credential:

```bash
npm run lint
npm test
```

## Repository safety

- `.env*` is ignored except for the placeholder-only `.env.example`.
- Local D1 / Wrangler state, caches, build output, coverage, and dependencies are ignored.
- API errors are normalized before they reach the client.
- No API credential is embedded in client code or the locked model.

## Demo and judging

- [Architecture and end-to-end flow](docs/ARCHITECTURE.md)
- [Model card and equations](docs/MODEL_CARD.md)
- [Three-minute demo script](docs/DEMO_SCRIPT_ZH.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST_ZH.md)

## License and data terms

Hackathon prototype. Source-code availability does not grant rights to redistribute third-party datasets or bypass the terms of the FortyGuard API. Review the original providers' terms before reuse.
