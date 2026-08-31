import { and, count, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { analyses, apiRateLimits } from "../../../db/schema";
import { MODEL_ID, predictCoolingRatio, stullWetBulbC } from "../../../lib/esif-model";
import {
  pollEnvironmentalPoint,
  pollSpatialLayers,
  submitEnvironmentalPoint,
  submitSpatialLayers,
  type EnvironmentalPoint,
  type HeatmapStats,
  type SpatialActivityIds,
} from "../../../lib/fortyguard";
import { loadStateOption } from "../../../lib/load-state";
import {
  assessTransferConfidence,
  timezoneOffsetMinutes,
  zonedLocalToUtcStrict,
} from "../../../lib/analysis-quality";

export const dynamic = "force-dynamic";

const COOLING_CONFIGURATIONS = new Set([
  "unknown",
  "air-cooled",
  "evaporative",
  "chilled-water",
  "direct-to-chip",
  "hybrid",
]);

type AnalysisInput = {
  facilityName: string;
  latitude: number;
  longitude: number;
  facilityRadiusM: number;
  itLoadMw: number | null;
  itLoadFraction: number;
  baselinePue: number | null;
  coolingConfiguration: string;
  analysisTimeLocal: string;
  ianaTimezone: string;
  saveForHistory: boolean;
  allowSharedModelImprovement: boolean;
};

type AnalysisRow = typeof analyses.$inferSelect;
type SpatialResult = { core: HeatmapStats; near: HeatmapStats; background: HeatmapStats };

export async function GET(request: Request) {
  await cleanupExpiredAnalyses();
  const customerId = await customerScope(request);
  const rows = await getDb()
    .select()
    .from(analyses)
    .where(and(eq(analyses.customerId, customerId), eq(analyses.saveForHistory, true)))
    .orderBy(desc(analyses.createdAtUtc))
    .limit(50);
  return NextResponse.json({ analyses: rows.map(toPublicRecord) });
}

export async function DELETE(request: Request) {
  const customerId = await customerScope(request);
  let id: string;
  try {
    id = stringValue(asObject(await request.json()).id);
  } catch {
    return NextResponse.json({ error: "A saved analysis id is required." }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "A saved analysis id is required." }, { status: 400 });

  const [owned] = await getDb()
    .select({ id: analyses.id })
    .from(analyses)
    .where(and(eq(analyses.id, id), eq(analyses.customerId, customerId), eq(analyses.saveForHistory, true)))
    .limit(1);
  if (!owned) return NextResponse.json({ error: "Saved analysis not found." }, { status: 404 });

  await getDb()
    .delete(analyses)
    .where(and(eq(analyses.id, id), eq(analyses.customerId, customerId)));
  return NextResponse.json({ deleted: true, id });
}

export async function POST(request: Request) {
  await cleanupExpiredAnalyses();
  const customerId = await customerScope(request);
  const createdAtUtc = new Date().toISOString();
  const id = crypto.randomUUID();
  let input: AnalysisInput;
  try {
    input = validateInput(await request.json());
  } catch (error) {
    return NextResponse.json({ error: safeMessage(error) }, { status: 400 });
  }

  let expectedUtc: Date;
  try {
    expectedUtc = zonedLocalToUtcStrict(input.analysisTimeLocal, input.ianaTimezone);
  } catch (error) {
    return NextResponse.json({ error: safeMessage(error) }, { status: 400 });
  }
  const earliest = Date.parse("2019-01-01T00:00:00Z");
  const latest = Date.now() + 12 * 60 * 60 * 1000;
  if (expectedUtc.getTime() < earliest || expectedUtc.getTime() > latest) {
    return NextResponse.json(
      { error: "Analysis time must be between 2019-01-01 and 12 hours from now." },
      { status: 400 },
    );
  }

  const loadSupport = loadStateOption(input.itLoadFraction);
  if (!loadSupport) {
    return NextResponse.json({ error: "Load state must use a 5% step from 45% to 105%." }, { status: 400 });
  }
  const [startDate, startTimeWithMinutes] = input.analysisTimeLocal.split("T");
  const startTime = startTimeWithMinutes.slice(0, 5);

  const rateLimitResponse = await enforceSubmissionLimits(request, customerId);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const activityIds = await submitSpatialLayers({
      latitude: input.latitude,
      longitude: input.longitude,
      coreSideM: input.facilityRadiusM,
      startDate,
      startTime,
    });
    const record = {
      id,
      customerId,
      facilityName: input.facilityName,
      createdAtUtc,
      analysisTimeLocal: input.analysisTimeLocal,
      analysisTimeUtc: expectedUtc.toISOString(),
      ianaTimezone: input.ianaTimezone,
      latitude: input.latitude,
      longitude: input.longitude,
      facilityRadiusM: input.facilityRadiusM,
      itLoadMw: input.itLoadMw,
      itLoadFraction: input.itLoadFraction,
      loadStateSupport: loadSupport.support,
      loadStateTrainingHours: loadSupport.trainingHours,
      baselinePue: input.baselinePue,
      coolingConfiguration: input.coolingConfiguration,
      saveForHistory: input.saveForHistory,
      allowSharedModelImprovement: input.allowSharedModelImprovement,
      status: "processing_spatial",
      summary: "Three spatial layers were submitted to FortyGuard and are processing.",
      modelId: MODEL_ID,
      heatmapActivityIdsJson: JSON.stringify(activityIds),
      dataQualityJson: JSON.stringify({
        stage: "processing_spatial",
        apiSource: "FortyGuard",
        expectedUtc: expectedUtc.toISOString(),
      }),
    };

    // Even non-history runs need a short-lived server record so later requests can
    // resume the same upstream activities instead of creating duplicate jobs.
    await getDb().insert(analyses).values(record);
    return NextResponse.json(
      { analysis: toPublicRecord(record), persisted: input.saveForHistory },
      { status: 202 },
    );
  } catch (error) {
    const message = safeMessage(error);
    if (input.saveForHistory) {
      await getDb().insert(analyses).values({
        id,
        customerId,
        facilityName: input.facilityName,
        createdAtUtc,
        analysisTimeLocal: input.analysisTimeLocal,
        analysisTimeUtc: expectedUtc.toISOString(),
        ianaTimezone: input.ianaTimezone,
        latitude: input.latitude,
        longitude: input.longitude,
        facilityRadiusM: input.facilityRadiusM,
        itLoadMw: input.itLoadMw,
        itLoadFraction: input.itLoadFraction,
        loadStateSupport: loadSupport.support,
        loadStateTrainingHours: loadSupport.trainingHours,
        baselinePue: input.baselinePue,
        coolingConfiguration: input.coolingConfiguration,
        saveForHistory: true,
        allowSharedModelImprovement: input.allowSharedModelImprovement,
        status: "failed",
        summary: message,
        modelId: MODEL_ID,
        dataQualityJson: JSON.stringify({ stage: "submission", error: message }),
      });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const customerId = await customerScope(request);
  const body = asObject(await request.json().catch(() => null));
  const id = stringValue(body.id);
  if (!id) return NextResponse.json({ error: "Analysis id is required." }, { status: 400 });

  const [row] = await getDb()
    .select()
    .from(analyses)
    .where(and(eq(analyses.id, id), eq(analyses.customerId, customerId)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Analysis was not found." }, { status: 404 });
  if (row.status === "completed" || row.status === "failed") {
    return NextResponse.json({ analysis: toPublicRecord(row), persisted: row.saveForHistory });
  }

  try {
    if (row.status === "submitting_environment") {
      const transitionStartedAtUtc = stringValue(parseJsonObject(row.dataQualityJson).transitionStartedAtUtc);
      const ageMs = transitionStartedAtUtc ? Date.now() - Date.parse(transitionStartedAtUtc) : 0;
      if (ageMs > 10 * 60 * 1000) {
        return failedResponse(row, customerId, "The environmental transition timed out. Start a new analysis.", "environment-transition");
      }
      return pendingResponse(row);
    }
    if (row.status === "processing_spatial") {
      const activityIds = parseSpatialActivityIds(row.heatmapActivityIdsJson);
      const poll = await pollSpatialLayers(activityIds, {
        latitude: row.latitude,
        longitude: row.longitude,
      });
      if (poll.state === "pending") return pendingResponse(row);
      if (poll.state === "failed") return failedResponse(row, customerId, poll.error, "spatial");
      return advanceToEnvironment(row, customerId, poll.value);
    }

    if (row.status === "processing_environment") {
      if (!row.environmentActivityId) {
        return failedResponse(row, customerId, "Environmental activity id is missing.", "environment");
      }
      const poll = await pollEnvironmentalPoint(row.environmentActivityId);
      if (poll.state === "pending") return pendingResponse(row);
      if (poll.state === "failed") return failedResponse(row, customerId, poll.error, "environment");
      return completedResponse(row, customerId, poll.value);
    }

    return failedResponse(row, customerId, `Unknown analysis state: ${row.status}`, "state");
  } catch (error) {
    return failedResponse(row, customerId, safeMessage(error), "orchestration");
  }
}

async function advanceToEnvironment(row: AnalysisRow, customerId: string, spatial: SpatialResult) {
  const claimSummary = "Spatial layers are complete; HeatAhead is starting the environmental analysis.";
  const transitionStartedAtUtc = new Date().toISOString();
  const claimQuality = JSON.stringify({
    ...parseJsonObject(row.dataQualityJson),
    stage: "submitting_environment",
    transitionStartedAtUtc,
  });
  const claimed = await getDb()
    .update(analyses)
    .set({ status: "submitting_environment", summary: claimSummary, dataQualityJson: claimQuality })
    .where(and(
      eq(analyses.id, row.id),
      eq(analyses.customerId, customerId),
      eq(analyses.status, "processing_spatial"),
    ))
    .returning({ id: analyses.id });
  if (!claimed.length) {
    return NextResponse.json(
      { analysis: toPublicRecord({ ...row, status: "submitting_environment", summary: claimSummary }), persisted: row.saveForHistory },
      { status: 202 },
    );
  }
  const [startDate, startTimeWithMinutes] = row.analysisTimeLocal.split("T");
  const startTime = startTimeWithMinutes.slice(0, 5);
  const coreMinusBackgroundC = spatial.core.meanC - spatial.background.meanC;
  const hotspotFraction =
    spatial.core.temperaturesC.filter((value) => value > spatial.background.meanC + 1).length /
    spatial.core.temperaturesC.length;
  const environmentActivityId = await submitEnvironmentalPoint({
    latitude: row.latitude,
    longitude: row.longitude,
    temperatureC: spatial.core.centerC,
    startDate,
    startTime,
  });
  const dataQuality = {
    stage: "processing_environment",
    apiSource: "FortyGuard",
    coreTileCount: spatial.core.tileCount,
    nearTileCount: spatial.near.tileCount,
    backgroundTileCount: spatial.background.tileCount,
    expectedUtc: row.analysisTimeUtc,
  };
  const update = {
    status: "processing_environment",
    summary: "Spatial layers are complete; humidity and wet-bulb parameters are processing.",
    centerTemperatureC: spatial.core.centerC,
    coreMeanTemperatureC: spatial.core.meanC,
    coreMaxTemperatureC: spatial.core.maximumC,
    coreP90TemperatureC: spatial.core.p90C,
    coreTemperatureStdC: spatial.core.standardDeviationC,
    nearMeanTemperatureC: spatial.near.meanC,
    backgroundMeanTemperatureC: spatial.background.meanC,
    coreMinusBackgroundC,
    hotspotFraction,
    environmentActivityId,
    dataQualityJson: JSON.stringify(dataQuality),
  };
  await getDb()
    .update(analyses)
    .set(update)
    .where(and(eq(analyses.id, row.id), eq(analyses.customerId, customerId)));
  return NextResponse.json(
    { analysis: toPublicRecord({ ...row, ...update }), persisted: row.saveForHistory },
    { status: 202 },
  );
}

async function completedResponse(row: AnalysisRow, customerId: string, environmental: EnvironmentalPoint) {
  const spatial = requiredSpatialValues(row);
  const localDate = new Date(`${row.analysisTimeLocal}:00Z`);
  const localHour = Number(row.analysisTimeLocal.slice(11, 13));
  const dayOfYear = Math.floor(
    (Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate()) -
      Date.UTC(localDate.getUTCFullYear(), 0, 0)) /
      86400000,
  );
  const modelInput = {
    tempC: spatial.centerTemperatureC,
    rhPercent: environmental.relativeHumidityPercent,
    wetBulbC: environmental.wetBulbTemperatureC,
    localHour,
    dayOfYear,
    itLoadFraction: row.itLoadFraction,
  };
  const referenceInput = {
    ...modelInput,
    tempC: 18,
    rhPercent: 50,
    wetBulbC: stullWetBulbC(18, 50),
  };
  const coolingRatio = predictCoolingRatio(modelInput);
  const referenceRatio = predictCoolingRatio(referenceInput);
  const weatherUplift = coolingRatio - referenceRatio;
  const coolingMw = row.itLoadMw === null ? null : coolingRatio * row.itLoadMw;
  const incrementalCoolingMw = row.itLoadMw === null ? null : weatherUplift * row.itLoadMw;
  const scenarioPue = row.baselinePue === null ? null : row.baselinePue + weatherUplift;
  const exposureScore = environmentalExposureScore({
    coreP90C: spatial.coreP90TemperatureC,
    wetBulbC: environmental.wetBulbTemperatureC,
    coreMinusBackgroundC: spatial.coreMinusBackgroundC,
    hotspotFraction: spatial.hotspotFraction,
  });
  const exposureLevel = exposureScore >= 65 ? "High" : exposureScore >= 35 ? "Elevated" : "Low";
  const parsedTimestamp = environmental.apiTimestamp ? Date.parse(environmental.apiTimestamp) : Number.NaN;
  const timestampDeltaMinutes = Number.isFinite(parsedTimestamp)
    ? Math.abs(parsedTimestamp - Date.parse(row.analysisTimeUtc)) / 60000
    : null;
  // FortyGuard can report a fixed GMT offset during daylight saving time. Keep
  // both checks visible so a matching requested local hour is not falsely rejected.
  const localWallClockAligned = environmental.apiTimestamp?.slice(0, 16) === row.analysisTimeLocal;
  const requestedOffsetMinutes = timezoneOffsetMinutes(new Date(row.analysisTimeUtc), row.ianaTimezone);
  const apiOffsetMinutes = environmental.apiTimezoneOffsetHours === null
    ? null
    : Math.round(environmental.apiTimezoneOffsetHours * 60);
  const apiOffsetAligned = apiOffsetMinutes === null || Math.abs(apiOffsetMinutes - requestedOffsetMinutes) <= 1;
  const timestampAligned = timestampDeltaMinutes !== null && timestampDeltaMinutes <= 30 && apiOffsetAligned;
  const timestampAlignmentBasis =
    timestampAligned
      ? "utc-instant"
      : "mismatch";
  const loadSupport = loadStateOption(row.itLoadFraction);
  if (!loadSupport) throw new Error("Stored load state is outside the supported 5% grid.");
  const priorQuality = parseJsonObject(row.dataQualityJson);
  const transfer = assessTransferConfidence({
    timestampAligned,
    coolingConfiguration: row.coolingConfiguration,
    loadSupport: loadSupport.support,
    dryBulbC: spatial.centerTemperatureC,
    wetBulbC: environmental.wetBulbTemperatureC,
    coreTileCount: nullableFiniteNumber(priorQuality.coreTileCount),
    nearTileCount: nullableFiniteNumber(priorQuality.nearTileCount),
    backgroundTileCount: nullableFiniteNumber(priorQuality.backgroundTileCount),
  });
  const confidence = transfer.confidence;
  const summary = buildSummary({
    exposureLevel,
    wetBulbC: environmental.wetBulbTemperatureC,
    coreMinusBackgroundC: spatial.coreMinusBackgroundC,
    coolingMw,
    incrementalCoolingMw,
    scenarioPue,
    confidence,
    loadStatePercent: loadSupport.percent,
    loadStateSupport: loadSupport.support,
  });
  const dataQuality = {
    ...priorQuality,
    stage: "completed",
    apiSource: "FortyGuard",
    expectedUtc: row.analysisTimeUtc,
    apiTimestamp: environmental.apiTimestamp,
    apiTimezone: environmental.apiTimezone,
    timestampDeltaMinutes,
    timestampAligned,
    localWallClockAligned,
    timestampAlignmentBasis,
    requestedTimezoneOffsetMinutes: requestedOffsetMinutes,
    apiTimezoneOffsetMinutes: apiOffsetMinutes,
    apiTimezoneOffsetAligned: apiOffsetAligned,
    coolingModelTemperatureSource: "fortyguard-core-center-tile",
    coreAoiMeanUsedByCoolingModel: false,
    frontierWeatherTransferApplied: false,
    weatherOutsideValidatedRange: transfer.weatherOutsideValidatedRange,
    confidenceReasons: transfer.reasons,
    loadStatePercent: loadSupport.percent,
    loadStateSupport: loadSupport.support,
    loadStateTrainingHours: loadSupport.trainingHours,
    loadStateTrainingBin: "+/-2.5 percentage points",
  };
  const update = {
    status: "completed",
    relativeHumidityPercent: environmental.relativeHumidityPercent,
    wetBulbTemperatureC: environmental.wetBulbTemperatureC,
    coolingRatio,
    coolingMw,
    weatherUplift,
    incrementalCoolingMw,
    scenarioPue,
    environmentalExposureScore: exposureScore,
    environmentalExposureLevel: exposureLevel,
    confidenceLevel: confidence,
    summary,
    apiTimestamp: environmental.apiTimestamp,
    dataQualityJson: JSON.stringify(dataQuality),
  };
  const completed = { ...row, ...update };
  if (row.saveForHistory) {
    await getDb()
      .update(analyses)
      .set(update)
      .where(and(eq(analyses.id, row.id), eq(analyses.customerId, customerId)));
  } else {
    await getDb()
      .delete(analyses)
      .where(and(eq(analyses.id, row.id), eq(analyses.customerId, customerId)));
  }
  return NextResponse.json({ analysis: toPublicRecord(completed), persisted: row.saveForHistory });
}

async function failedResponse(row: AnalysisRow, customerId: string, error: string, stage: string) {
  const message = safeMessage(new Error(error));
  const update = {
    status: "failed",
    summary: message,
    dataQualityJson: JSON.stringify({ ...parseJsonObject(row.dataQualityJson), stage, error: message }),
  };
  const failed = { ...row, ...update };
  if (row.saveForHistory) {
    await getDb()
      .update(analyses)
      .set(update)
      .where(and(eq(analyses.id, row.id), eq(analyses.customerId, customerId)));
  } else {
    await getDb()
      .delete(analyses)
      .where(and(eq(analyses.id, row.id), eq(analyses.customerId, customerId)));
  }
  return NextResponse.json({ analysis: toPublicRecord(failed), persisted: row.saveForHistory });
}

function pendingResponse(row: AnalysisRow) {
  return NextResponse.json(
    { analysis: toPublicRecord(row), persisted: row.saveForHistory },
    { status: 202 },
  );
}

async function cleanupExpiredAnalyses() {
  const now = Date.now();
  const transientCutoff = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  const savedCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
  const rateLimitCutoff = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const db = getDb();
  await db.delete(analyses).where(or(
    and(eq(analyses.saveForHistory, false), lt(analyses.createdAtUtc, transientCutoff)),
    and(eq(analyses.saveForHistory, true), lt(analyses.createdAtUtc, savedCutoff)),
  ));
  await db.delete(apiRateLimits).where(lt(apiRateLimits.updatedAtUtc, rateLimitCutoff));
}

async function enforceSubmissionLimits(request: Request, customerId: string) {
  const db = getDb();
  const [active] = await db
    .select({ total: count() })
    .from(analyses)
    .where(and(
      eq(analyses.customerId, customerId),
      inArray(analyses.status, ["processing_spatial", "processing_environment", "submitting_environment"]),
    ));
  if ((active?.total ?? 0) >= 2) {
    return rateLimited("Two analyses are already processing in this browser. Resume or wait for them to finish.", 60);
  }

  const now = new Date();
  const identity = await requestIdentityHash(request, customerId);
  const minuteBucket = now.toISOString().slice(0, 16);
  const hourBucket = now.toISOString().slice(0, 13);
  const dayBucket = now.toISOString().slice(0, 10);
  const checks = [
    { key: `minute:${minuteBucket}:${identity}`, limit: 2, retrySeconds: 60 },
    { key: `scope-hour:${hourBucket}:${await stableHash(customerId)}`, limit: 10, retrySeconds: 3600 },
    { key: `identity-day:${dayBucket}:${identity}`, limit: 30, retrySeconds: 86400 },
    { key: `global-day:${dayBucket}`, limit: 500, retrySeconds: 86400 },
  ];

  for (const check of checks) {
    if (!(await incrementRateLimit(check.key, check.limit, now.toISOString()))) {
      return rateLimited("The public Demo request limit has been reached. Please try again later.", check.retrySeconds);
    }
  }
  return null;
}

async function incrementRateLimit(key: string, limit: number, updatedAtUtc: string) {
  const [row] = await getDb()
    .insert(apiRateLimits)
    .values({ key, requestCount: 1, updatedAtUtc })
    .onConflictDoUpdate({
      target: apiRateLimits.key,
      set: {
        requestCount: sql`${apiRateLimits.requestCount} + 1`,
        updatedAtUtc,
      },
    })
    .returning({ requestCount: apiRateLimits.requestCount });
  return (row?.requestCount ?? limit + 1) <= limit;
}

async function requestIdentityHash(request: Request, customerId: string) {
  const address = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  return stableHash(`${address}:${customerId}`);
}

async function stableHash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rateLimited(message: string, retrySeconds: number) {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "retry-after": String(retrySeconds) } },
  );
}

async function customerScope(request: Request) {
  const user = await getChatGPTUser();
  if (user?.userId) return user.userId;

  const cookieStore = await cookies();
  const existing = cookieStore.get("heatahead_anonymous_scope")?.value;
  if (existing && /^[a-f0-9-]{36}$/i.test(existing)) return `anonymous:${existing}`;

  const anonymousId = crypto.randomUUID();
  cookieStore.set("heatahead_anonymous_scope", anonymousId, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return `anonymous:${anonymousId}`;
}

function validateInput(value: unknown): AnalysisInput {
  const body = asObject(value);
  const facilityName = stringValue(body.facilityName).slice(0, 80);
  const latitude = finiteNumber(body.latitude);
  const longitude = finiteNumber(body.longitude);
  const facilityRadiusM = optionalNumber(body.facilityRadiusM) ?? 360;
  const itLoadMw = optionalNumber(body.itLoadMw);
  const itLoadFraction = optionalNumber(body.itLoadFraction) ?? 0.8;
  const baselinePue = optionalNumber(body.baselinePue);
  const coolingConfiguration = stringValue(body.coolingConfiguration) || "unknown";
  const analysisTimeLocal = stringValue(body.analysisTimeLocal);
  const ianaTimezone = stringValue(body.ianaTimezone);
  if (!facilityName) throw new Error("Facility name is required.");
  if (latitude < 18 || latitude > 72 || longitude < -180 || longitude > -60) {
    throw new Error("This hackathon API plan supports U.S. locations only.");
  }
  if (facilityRadiusM < 100 || facilityRadiusM > 1000) throw new Error("Facility footprint width must be 100–1,000 m.");
  if (itLoadMw !== null && (itLoadMw <= 0 || itLoadMw > 2000)) throw new Error("IT load must be 0–2,000 MW.");
  if (!loadStateOption(itLoadFraction)) throw new Error("Load state must use a 5% step from 45% to 105%.");
  if (baselinePue !== null && (baselinePue < 1 || baselinePue > 2.5)) throw new Error("Baseline PUE must be 1.0–2.5.");
  if (!COOLING_CONFIGURATIONS.has(coolingConfiguration)) throw new Error("Cooling configuration is invalid.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(analysisTimeLocal)) throw new Error("Analysis time is invalid.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: ianaTimezone }).format(new Date());
  } catch {
    throw new Error("IANA timezone is invalid.");
  }
  return {
    facilityName,
    latitude,
    longitude,
    facilityRadiusM: Math.round(facilityRadiusM),
    itLoadMw,
    itLoadFraction,
    baselinePue,
    coolingConfiguration,
    analysisTimeLocal,
    ianaTimezone,
    saveForHistory: body.saveForHistory !== false,
    allowSharedModelImprovement: body.allowSharedModelImprovement === true,
  };
}

function parseSpatialActivityIds(value: string | null): SpatialActivityIds {
  const parsed = parseJsonObject(value);
  const core = stringValue(parsed.core);
  const near = stringValue(parsed.near);
  const background = stringValue(parsed.background);
  if (!core || !near || !background) throw new Error("Spatial activity ids are missing.");
  return { core, near, background };
}

function requiredSpatialValues(row: AnalysisRow) {
  const values = {
    centerTemperatureC: row.centerTemperatureC,
    coreMeanTemperatureC: row.coreMeanTemperatureC,
    coreP90TemperatureC: row.coreP90TemperatureC,
    coreMinusBackgroundC: row.coreMinusBackgroundC,
    hotspotFraction: row.hotspotFraction,
  };
  if (Object.values(values).some((value) => value === null)) {
    throw new Error("Stored spatial result is incomplete.");
  }
  return values as { [K in keyof typeof values]: number };
}

function parseJsonObject(value: string | null) {
  if (!value) return {};
  try {
    return asObject(JSON.parse(value));
  } catch {
    return {};
  }
}

function environmentalExposureScore(input: {
  coreP90C: number;
  wetBulbC: number;
  coreMinusBackgroundC: number;
  hotspotFraction: number;
}) {
  const dry = clip((input.coreP90C - 22) / 15);
  const wet = clip((input.wetBulbC - 16) / 12);
  const localDelta = clip((input.coreMinusBackgroundC + 0.5) / 4);
  return 100 * (0.3 * dry + 0.4 * wet + 0.15 * localDelta + 0.15 * clip(input.hotspotFraction));
}

function buildSummary(input: {
  exposureLevel: string;
  wetBulbC: number;
  coreMinusBackgroundC: number;
  coolingMw: number | null;
  incrementalCoolingMw: number | null;
  scenarioPue: number | null;
  confidence: string;
  loadStatePercent: number;
  loadStateSupport: string;
}) {
  const impact =
    input.incrementalCoolingMw === null
      ? "Enter IT load to convert the weather uplift into MW."
      : `Equivalent weather increment: ${signed(input.incrementalCoolingMw, 2)} MW.`;
  const pue = input.scenarioPue === null
    ? "Baseline PUE was not supplied, so absolute scenario PUE is hidden."
    : `Scenario PUE: ${input.scenarioPue.toFixed(4)}.`;
  const loadNote =
    input.loadStateSupport === "extrapolation"
      ? `${input.loadStatePercent}% load is outside the observed ESIF training range.`
      : `${input.loadStatePercent}% load support: ${input.loadStateSupport}.`;
  return `${input.exposureLevel} environmental exposure; wet bulb ${input.wetBulbC.toFixed(1)}°C and core/background difference ${signed(input.coreMinusBackgroundC, 1)}°C. ${impact} ${pue} ${loadNote} Transfer confidence: ${input.confidence}.`;
}

function toPublicRecord<T extends Record<string, unknown>>(record: T) {
  const safe: Record<string, unknown> = { ...record };
  const quality = parseJsonObject(typeof safe.dataQualityJson === "string" ? safe.dataQualityJson : null);
  safe.confidenceReasons = Array.isArray(quality.confidenceReasons)
    ? quality.confidenceReasons.filter((item): item is string => typeof item === "string").slice(0, 8)
    : [];
  safe.weatherOutsideValidatedRange = quality.weatherOutsideValidatedRange === true;
  safe.timestampAlignmentBasis = stringValue(quality.timestampAlignmentBasis) || null;
  safe.apiTimezone = stringValue(quality.apiTimezone) || null;
  safe.coreTileCount = nullableFiniteNumber(quality.coreTileCount);
  safe.nearTileCount = nullableFiniteNumber(quality.nearTileCount);
  safe.backgroundTileCount = nullableFiniteNumber(quality.backgroundTileCount);
  delete safe.customerId;
  delete safe.heatmapActivityIdsJson;
  delete safe.environmentActivityId;
  delete safe.dataQualityJson;
  return safe;
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : "Analysis failed.";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error("A required numeric field is invalid.");
  return number;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return finiteNumber(value);
}

function nullableFiniteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function clip(value: number) {
  return Math.min(1, Math.max(0, value));
}

function signed(value: number, digits: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}
