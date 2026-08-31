import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CATALOG_MATCH_RADIUS_KM, FACILITY_CATALOG, distanceKm, nearestCatalogFacility } from "../lib/facility-catalog.ts";

test("an exact catalog coordinate resolves to that facility", () => {
  const esif = FACILITY_CATALOG.find((facility) => facility.id === "esif");
  assert.ok(esif);
  const nearest = nearestCatalogFacility(esif.latitude, esif.longitude);
  assert.equal(nearest.facility.id, "esif");
  assert.equal(nearest.distanceKm, 0);
});

test("Ashburn remains an unlisted custom point in the small demo catalog", () => {
  const nearest = nearestCatalogFacility(39.0438, -77.4874);
  assert.ok(nearest.distanceKm > CATALOG_MATCH_RADIUS_KM);
});

test("great-circle distance is symmetric", () => {
  const forward = distanceKm(39.7427, -105.1701, 35.9313, -84.3104);
  const reverse = distanceKm(35.9313, -84.3104, 39.7427, -105.1701);
  assert.ok(forward > 0);
  assert.ok(Math.abs(forward - reverse) < 1e-9);
});

test("the UI requires confirmation and avoids false negative identity claims", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /&& locationConfirmed/);
  assert.match(page, /This does not mean the point is not a data center/);
  assert.match(page, /Use as customer-reported DC/);
});
