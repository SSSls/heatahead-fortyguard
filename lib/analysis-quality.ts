export const ESIF_DRY_BULB_TRAIN_P95_C = 28.20017355459708;
export const ESIF_WET_BULB_TRAIN_P95_C = 17.14071717625864;

export type TransferAssessment = {
  confidence: "Low" | "Medium";
  weatherOutsideValidatedRange: boolean;
  reasons: string[];
};

export function assessTransferConfidence(input: {
  timestampAligned: boolean;
  coolingConfiguration: string;
  loadSupport: string;
  dryBulbC: number;
  wetBulbC: number;
  coreTileCount: number | null;
  nearTileCount: number | null;
  backgroundTileCount: number | null;
}): TransferAssessment {
  const lowReasons: string[] = [];
  const weatherReasons: string[] = [];

  if (!input.timestampAligned) lowReasons.push("FortyGuard and requested UTC instants are not aligned.");
  if (input.coolingConfiguration === "unknown") lowReasons.push("Cooling configuration is unknown.");
  if (input.loadSupport === "sparse") lowReasons.push("The selected ESIF-equivalent load state has sparse training support.");
  if (input.loadSupport === "extrapolation") lowReasons.push("The selected load state is outside the observed ESIF range.");

  if (input.dryBulbC > ESIF_DRY_BULB_TRAIN_P95_C) {
    weatherReasons.push(`Dry-bulb temperature exceeds the ESIF train P95 (${ESIF_DRY_BULB_TRAIN_P95_C.toFixed(1)}°C).`);
  }
  if (input.wetBulbC > ESIF_WET_BULB_TRAIN_P95_C) {
    weatherReasons.push(`Wet-bulb temperature exceeds the ESIF train P95 (${ESIF_WET_BULB_TRAIN_P95_C.toFixed(1)}°C).`);
  }
  lowReasons.push(...weatherReasons);

  if (input.coreTileCount !== null && input.coreTileCount < 10) {
    lowReasons.push("The core AOI has fewer than 10 usable temperature tiles.");
  }
  if (input.nearTileCount !== null && input.nearTileCount < 20) {
    lowReasons.push("The neighborhood AOI has fewer than 20 usable temperature tiles.");
  }
  if (input.backgroundTileCount !== null && input.backgroundTileCount < 20) {
    lowReasons.push("The context AOI has fewer than 20 usable temperature tiles.");
  }

  const reasons = lowReasons.length
    ? lowReasons
    : ["Inputs are within the current ESIF support gates; cross-facility weather transfer remains unvalidated, so confidence is capped at Medium."];

  return {
    confidence: lowReasons.length ? "Low" : "Medium",
    weatherOutsideValidatedRange: weatherReasons.length > 0,
    reasons,
  };
}

export function zonedLocalToUtcStrict(local: string, timezone: string) {
  const [datePart, timePart] = local.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const requestedKey = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
  const candidates: number[] = [];

  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const instant = localAsUtc - offsetMinutes * 60_000;
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
    );
    const representedKey = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    if (representedKey === requestedKey) candidates.push(instant);
  }

  const uniqueCandidates = [...new Set(candidates)];
  if (uniqueCandidates.length === 0) {
    throw new Error("This local time does not exist in the selected timezone because of a daylight-saving transition.");
  }
  if (uniqueCandidates.length > 1) {
    throw new Error("This local time is ambiguous in the selected timezone because of a daylight-saving transition. Choose another hour.");
  }
  return new Date(uniqueCandidates[0]);
}

export function timezoneOffsetMinutes(instant: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  const represented = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((represented - instant.getTime()) / 60_000);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
