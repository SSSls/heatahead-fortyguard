# HeatAhead architecture and end-to-end flow

## System path

```text
Customer input
  -> validation, strict DST handling, and UTC audit
  -> rate / concurrency / credit guard
  -> submit three FortyGuard heatmap activities
  -> persist activity IDs in D1
  -> poll the same activities until complete
  -> submit/poll environmental parameters using the corrected center tile
  -> compute spatial exposure features
  -> run locked ESIF cooling-ratio model
  -> scale to MW / scenario PUE when inputs permit
  -> persist and render result with evidence labels
```

## Inputs

| Input | Role | Effect on output |
| --- | --- | --- |
| Facility name | Record label | No model effect |
| Latitude / longitude | FortyGuard AOI and point query | Changes spatial and point weather |
| Facility footprint | Width of core AOI | Changes core exposure statistics; core mean does not enter cooling |
| Analysis local time + timezone | Time-aligned API request | Changes weather; both local and UTC are saved |
| Load state, 45–105% | ESIF-equivalent normalized model feature | Changes cooling ratio and support label; it is not customer design utilization |
| Cooling configuration | Transfer qualifier | Unknown configuration lowers confidence; it does not numerically retrain the model |
| IT load, optional | Scaling input | Converts cooling ratio / uplift to absolute MW |
| Baseline PUE, optional | Scenario anchor | Enables baseline PUE + weather uplift |
| Save history | Persistence choice | Keeps the run in the user's visible history |

## Asynchronous orchestration

FortyGuard heatmaps are asynchronous. The initial request stores three upstream activity IDs and returns a processing record. The client then sends `PATCH` requests that resume the same activities. It does not create duplicate upstream jobs when a run takes longer than one browser request. A saved processing record can be resumed from History after refresh.

Processing states are:

```text
processing_spatial -> submitting_environment -> processing_environment -> completed
                                                              \-------> failed
```

## Spatial analysis

- Core: customer-defined centered square, 100–1,000 m wide.
- Neighborhood: nested centered 1.2 km square.
- Context: nested centered 2.4 km square.

The exposure layer reports core mean, p90, maximum, standard deviation, neighborhood mean, context mean, core-minus-context temperature, and hotspot fraction. The HeatAhead 0–100 exposure index is a transparent product heuristic computed from these API-derived values. The ESIF cooling model uses the corrected core center tile; it does not use the core AOI mean.

## Security and privacy

- The API key is read inside the server-side FortyGuard client only.
- No `NEXT_PUBLIC_*` secret is used.
- Anonymous public visitors receive a server-generated scope so temporary orchestration records can be resumed; authenticated visitors use the stable Sites identity header when available.
- Public submissions are guarded by per-identity, per-browser, and global request buckets plus a two-processing-run concurrency cap.
- A record with Save History disabled is removed after a terminal result or automatically after six hours.
- Anonymous saved history is retained for up to 90 days and is available only while the browser retains its HttpOnly scope cookie.
- Customer-scoped permanent deletion is implemented in the UI and API. It deletes the HeatAhead D1 record but cannot retract an upstream FortyGuard activity.

## Failure handling

- Inputs are validated on the server.
- Requested local time is submitted as local wall-clock time, independently resolved to a unique UTC instant, and rejected if DST makes it nonexistent or ambiguous.
- API timestamp and timezone offset must align with that UTC instant; local-wall-clock equality alone is insufficient.
- A processing run can be resumed without resubmission.
- Upstream errors become a failed record with a safe summary rather than exposing credentials or raw internal configuration.
