export type LoadStateSupport = "strong" | "observed" | "sparse" | "extrapolation";

export type LoadStateOption = {
  percent: number;
  fraction: number;
  trainingHours: number;
  support: LoadStateSupport;
};

// Counts are ESIF training-window hours within +/-2.5 percentage points of
// each selectable load state. The training reference is train-only IT-power P95.
const TRAINING_HOURS_BY_PERCENT: Record<number, number> = {
  45: 199,
  50: 87,
  55: 199,
  60: 527,
  65: 1103,
  70: 2319,
  75: 1669,
  80: 171,
  85: 332,
  90: 780,
  95: 1007,
  100: 832,
  105: 90,
};

export const LOAD_STATE_OPTIONS: LoadStateOption[] = Object.entries(TRAINING_HOURS_BY_PERCENT).map(
  ([percentText, trainingHours]) => {
    const percent = Number(percentText);
    const support: LoadStateSupport =
      trainingHours === 0
        ? "extrapolation"
        : trainingHours < 100
          ? "sparse"
          : trainingHours < 250
            ? "observed"
            : "strong";
    return { percent, fraction: percent / 100, trainingHours, support };
  },
);

export function loadStateOption(fraction: number): LoadStateOption | null {
  return LOAD_STATE_OPTIONS.find((option) => Math.abs(option.fraction - fraction) < 1e-8) ?? null;
}

export function loadSupportLabel(option: LoadStateOption) {
  if (option.support === "extrapolation") return "Outside ESIF observed range";
  if (option.support === "sparse") return `Sparse support · ${option.trainingHours.toLocaleString()} h`;
  if (option.support === "observed") return `Observed · ${option.trainingHours.toLocaleString()} h`;
  return `Strong support · ${option.trainingHours.toLocaleString()} h`;
}
