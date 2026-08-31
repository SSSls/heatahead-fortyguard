import { env } from "cloudflare:workers";

const API_BASE = "https://api.fortyguard.com/v1";

export type HeatmapStats = {
  activityId: string;
  tileCount: number;
  centerC: number;
  meanC: number;
  minimumC: number;
  maximumC: number;
  p90C: number;
  standardDeviationC: number;
  temperaturesC: number[];
};

export type EnvironmentalPoint = {
  activityId: string;
  apiTimestamp: string | null;
  apiTimezone: string | null;
  apiTimezoneOffsetHours: number | null;
  relativeHumidityPercent: number;
  wetBulbTemperatureC: number;
  apparentTemperatureC: number | null;
};

export type SpatialActivityIds = {
  core: string;
  near: string;
  background: string;
};

export type ActivityPoll<T> =
  | { state: "pending" }
  | { state: "completed"; value: T }
  | { state: "failed"; error: string };

type HeatmapRequest = {
  latitude: number;
  longitude: number;
  sideM: number;
  granularity: 60 | 80 | 100;
  startDate: string;
  startTime: string;
};

type SpatialRequest = Omit<HeatmapRequest, "sideM" | "granularity"> & { coreSideM: number };

export async function submitSpatialLayers(input: SpatialRequest): Promise<SpatialActivityIds> {
  const [core, near, background] = await Promise.all([
    submitHeatmap({ ...input, sideM: input.coreSideM, granularity: 60 }),
    submitHeatmap({ ...input, sideM: 1200, granularity: 80 }),
    submitHeatmap({ ...input, sideM: 2400, granularity: 100 }),
  ]);
  return { core, near, background };
}

export async function pollSpatialLayers(
  activityIds: SpatialActivityIds,
  input: { latitude: number; longitude: number },
): Promise<ActivityPoll<{ core: HeatmapStats; near: HeatmapStats; background: HeatmapStats }>> {
  const [core, near, background] = await Promise.all([
    pollActivity(activityIds.core),
    pollActivity(activityIds.near),
    pollActivity(activityIds.background),
  ]);
  const polls = [core, near, background];
  const failed = polls.find((item) => item.state === "failed");
  if (failed?.state === "failed") return failed;
  if (polls.some((item) => item.state === "pending")) return { state: "pending" };
  if (core.state !== "completed" || near.state !== "completed" || background.state !== "completed") {
    return { state: "pending" };
  }
  try {
    return {
      state: "completed",
      value: {
        core: parseHeatmap(core.activity, activityIds.core, input.latitude, input.longitude),
        near: parseHeatmap(near.activity, activityIds.near, input.latitude, input.longitude),
        background: parseHeatmap(background.activity, activityIds.background, input.latitude, input.longitude),
      },
    };
  } catch (error) {
    return { state: "failed", error: safeMessage(error) };
  }
}

export async function submitEnvironmentalPoint(input: {
  latitude: number;
  longitude: number;
  temperatureC: number;
  startDate: string;
  startTime: string;
}) {
  return submitActivity("/env_params", {
    latitude: input.latitude,
    longitude: input.longitude,
    temperature: input.temperatureC,
    date_time: {
      start_date: input.startDate,
      start_time: input.startTime,
      filter_type: 1,
    },
    analysis: [
      "relative_humidity_percent",
      "wet_bulb_temperature_celsius",
      "apparent_temperature_celsius",
    ],
  });
}

export async function pollEnvironmentalPoint(activityId: string): Promise<ActivityPoll<EnvironmentalPoint>> {
  const poll = await pollActivity(activityId);
  if (poll.state !== "completed") return poll;
  try {
    return { state: "completed", value: parseEnvironmental(poll.activity, activityId) };
  } catch (error) {
    return { state: "failed", error: safeMessage(error) };
  }
}

async function submitHeatmap(input: HeatmapRequest) {
  return submitActivity("/heatmap", {
    polygon_aoi: polygonFeatureCollection(input.latitude, input.longitude, input.sideM),
    date_time: {
      start_date: input.startDate,
      start_time: input.startTime,
      filter_type: 1,
    },
    granularity: input.granularity,
    analytic_type: "tcm",
  });
}

async function submitActivity(endpoint: string, body: unknown) {
  const submitted = await requestJson(`${API_BASE}${endpoint}`, {
    method: "POST",
    body: JSON.stringify(body),
  }, 15000);
  const activityId = objectAt(submitted, ["data"]).activity_id;
  if (typeof activityId !== "string" || !activityId) {
    throw new Error("FortyGuard did not return an activity id");
  }
  return activityId;
}

async function pollActivity(activityId: string): Promise<
  | { state: "pending" }
  | { state: "completed"; activity: unknown }
  | { state: "failed"; error: string }
> {
  try {
    const activity = await requestJson(
      `${API_BASE}/status/${encodeURIComponent(activityId)}`,
      { method: "GET" },
      8000,
    );
    const state = String(objectAt(activity, ["data"]).status ?? "").toLowerCase();
    if (state === "completed") return { state: "completed", activity };
    if (["failed", "error", "cancelled"].includes(state)) {
      return { state: "failed", error: `FortyGuard activity ${state}` };
    }
    return { state: "pending" };
  } catch (error) {
    const message = safeMessage(error);
    if (/activity not found|abort|timeout|network|fetch failed/i.test(message)) {
      return { state: "pending" };
    }
    return { state: "failed", error: message };
  }
}

function parseHeatmap(activity: unknown, activityId: string, latitude: number, longitude: number): HeatmapStats {
  const result = objectAt(activity, ["data", "result"]);
  const mapData = objectAt(result, ["map_data"]);
  const features = arrayAt(mapData, ["features"]);
  const tiles = features
    .map((feature) => {
      const item = asObject(feature);
      const properties = objectAt(item, ["properties"]);
      const value = firstFinite([
        properties.average_temperature,
        properties.temperature,
        properties.value,
        properties.mean_temperature,
      ]);
      return value === null ? null : { value, distance: featureDistance(item, latitude, longitude) };
    })
    .filter((item): item is { value: number; distance: number } => item !== null);

  if (!tiles.length) throw new Error("FortyGuard heatmap completed without usable temperature tiles");
  const values = tiles.map((tile) => tile.value).sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  const center = [...tiles].sort((a, b) => a.distance - b.distance)[0]?.value ?? mean;
  return {
    activityId,
    tileCount: values.length,
    centerC: center,
    meanC: mean,
    minimumC: values[0],
    maximumC: values.at(-1) ?? values[0],
    p90C: quantile(values, 0.9),
    standardDeviationC: Math.sqrt(variance),
    temperaturesC: values,
  };
}

function parseEnvironmental(activity: unknown, activityId: string): EnvironmentalPoint {
  const result = objectAt(activity, ["data", "result"]);
  const locations = arrayAt(result, ["locations"]);
  const location = asObject(locations[0]);
  const parameters = objectAt(location, ["parameters"]);
  const metadata = objectAt(result, ["metadata"]);
  const rh = firstNumber(parameters.relative_humidity_percent);
  const wetBulb = firstNumber(parameters.wet_bulb_temperature_celsius);
  if (rh === null || wetBulb === null) {
    throw new Error("FortyGuard environmental response is missing RH or wet-bulb temperature");
  }
  return {
    activityId,
    apiTimestamp: firstString(metadata.timestamps),
    apiTimezone: typeof metadata.timezone === "string" ? metadata.timezone : null,
    apiTimezoneOffsetHours: firstFinite([metadata.timezone_offset_hours]),
    relativeHumidityPercent: rh,
    wetBulbTemperatureC: wetBulb,
    apparentTemperatureC: firstNumber(parameters.apparent_temperature_celsius),
  };
}

async function requestJson(url: string, init: RequestInit, timeoutMs = 15000) {
  const runtime = env as unknown as Record<string, unknown>;
  const apiKey = runtime.FORTYGUARD_API_KEY;
  if (typeof apiKey !== "string" || !apiKey) throw new Error("FortyGuard service is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("FortyGuard request timeout")), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "content-type": "application/json", "api-key": apiKey },
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok || objectAt(payload, []).error === true) {
      const message = objectAt(payload, []).message;
      throw new Error(typeof message === "string" ? message : `FortyGuard request failed (${response.status})`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function polygonFeatureCollection(latitude: number, longitude: number, sideM: number) {
  const half = sideM / 2;
  const latDelta = half / 110574;
  const lonDelta = half / (111320 * Math.cos((latitude * Math.PI) / 180));
  const west = longitude - lonDelta;
  const east = longitude + lonDelta;
  const south = latitude - latDelta;
  const north = latitude + latDelta;
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
      },
    }],
  };
}

function featureDistance(feature: Record<string, unknown>, latitude: number, longitude: number) {
  const geometry = asObject(feature.geometry);
  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates)) return Number.POSITIVE_INFINITY;
  const points: number[][] = [];
  collectPoints(coordinates, points);
  if (!points.length) return Number.POSITIVE_INFINITY;
  const west = Math.min(...points.map((point) => point[0]));
  const east = Math.max(...points.map((point) => point[0]));
  const south = Math.min(...points.map((point) => point[1]));
  const north = Math.max(...points.map((point) => point[1]));
  const lon = (west + east) / 2;
  const lat = (south + north) / 2;
  const northingM = (lat - latitude) * 110574;
  const eastingM = (lon - longitude) * 111320 * Math.cos((latitude * Math.PI) / 180);
  return Math.hypot(northingM, eastingM);
}

function collectPoints(value: unknown, points: number[][]) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    points.push([value[0], value[1]]);
    return;
  }
  for (const child of value) collectPoints(child, points);
}

function quantile(sorted: number[], q: number) {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function objectAt(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) current = asObject(current)[key];
  return asObject(current);
}

function arrayAt(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) current = asObject(current)[key];
  return Array.isArray(current) ? current : [];
}

function firstNumber(value: unknown): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate !== -999 ? candidate : null;
}

function firstString(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" ? candidate : null;
}

function firstFinite(values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value !== -999) return value;
  }
  return null;
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : "FortyGuard request failed";
}
