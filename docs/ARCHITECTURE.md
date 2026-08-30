# HeatAhead architecture and end-to-end flow

## System path

```text
Customer input
  -> validation and timezone conversion
  -> submit three FortyGuard heatmap activities
  -> persist activity IDs in D1
  -> poll the same activities until complete
  -> submit/poll point environmental parameters
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
| Facility footprint | Width of core AOI | Changes core spatial summary |
| Analysis local time + timezone | Time-aligned API request | Changes weather; both local and UTC are saved |
| Load state, 45–105% | ESIF-normalized model feature | Changes cooling ratio and support label |
| Cooling configuration | Transfer qualifier | Unknown configuration lowers confidence; it does not numerically retrain the model |
| IT load, optional | Scaling input | Converts cooling ratio / uplift to absolute MW |
| Baseline PUE, optional | Scenario anchor | Enables baseline PUE + weather uplift |
| Save history | Persistence choice | Keeps the run in the user's visible history |

## Asynchronous orchestration

FortyGuard heatmaps are asynchronous. The initial request stores three upstream activity IDs and returns a processing record. The client then sends `PATCH` requests that resume the same activities. It does not create duplicate upstream jobs when a run takes longer than one browser request. A saved processing record can be resumed from History after refresh.

Processing states are:

```text
processing_spatial -> processing_environment -> completed
                                     \-------> failed
```

## Spatial analysis

- Core: customer-defined facility footprint.
- Near environment: approximately 1 km.
- Local background: approximately 2–3 km.

The exposure layer reports core mean, p90, maximum, standard deviation, near mean, background mean, core-minus-background temperature, and hotspot fraction. These are direct API-derived scenario statistics.

## Security and privacy

- The API key is read inside the server-side FortyGuard client only.
- No `NEXT_PUBLIC_*` secret is used.
- Anonymous public visitors receive a server-generated scope so temporary orchestration records can be resumed; authenticated visitors use the stable Sites identity header when available.
- A record with Save History disabled is retained only long enough to finish the asynchronous workflow and is removed after a terminal result.
- The demo does not implement customer-managed permanent deletion yet.

## Failure handling

- Inputs are validated on the server.
- Requested local time is converted to UTC and both values are recorded.
- API timestamp alignment is surfaced in data quality.
- A processing run can be resumed without resubmission.
- Upstream errors become a failed record with a safe summary rather than exposing credentials or raw internal configuration.
