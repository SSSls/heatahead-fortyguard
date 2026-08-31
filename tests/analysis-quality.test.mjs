import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assessTransferConfidence,
  timezoneOffsetMinutes,
  zonedLocalToUtcStrict,
} from "../lib/analysis-quality.ts";

test("strict timezone conversion resolves a normal local hour and offset", () => {
  const instant = zonedLocalToUtcStrict("2026-08-31T12:00", "America/New_York");
  assert.equal(instant.toISOString(), "2026-08-31T16:00:00.000Z");
  assert.equal(timezoneOffsetMinutes(instant, "America/New_York"), -240);
});

test("strict timezone conversion rejects missing and duplicated DST hours", () => {
  assert.throws(
    () => zonedLocalToUtcStrict("2026-03-08T02:00", "America/New_York"),
    /does not exist/i,
  );
  assert.throws(
    () => zonedLocalToUtcStrict("2026-11-01T01:00", "America/New_York"),
    /ambiguous/i,
  );
});

test("extreme weather and insufficient tile support force Low confidence", () => {
  const result = assessTransferConfidence({
    timestampAligned: true,
    coolingConfiguration: "direct-to-chip",
    loadSupport: "strong",
    dryBulbC: 32.7,
    wetBulbC: 23.7,
    coreTileCount: 8,
    nearTileCount: 100,
    backgroundTileCount: 200,
  });
  assert.equal(result.confidence, "Low");
  assert.equal(result.weatherOutsideValidatedRange, true);
  assert.match(result.reasons.join(" "), /Dry-bulb temperature exceeds/);
  assert.match(result.reasons.join(" "), /fewer than 10 usable temperature tiles/);
});

test("supported inputs are capped at Medium", () => {
  const result = assessTransferConfidence({
    timestampAligned: true,
    coolingConfiguration: "chilled-water",
    loadSupport: "strong",
    dryBulbC: 20,
    wetBulbC: 12,
    coreTileCount: 20,
    nearTileCount: 100,
    backgroundTileCount: 200,
  });
  assert.equal(result.confidence, "Medium");
  assert.equal(result.weatherOutsideValidatedRange, false);
});

test("the deployed model path uses the center tile instead of the core mean", async () => {
  const route = await readFile(new URL("../app/api/analyses/route.ts", import.meta.url), "utf8");
  assert.match(route, /temperatureC:\s*spatial\.core\.centerC/);
  assert.match(route, /tempC:\s*spatial\.centerTemperatureC/);
  assert.doesNotMatch(route, /tempC:\s*spatial\.coreMeanTemperatureC/);
});
