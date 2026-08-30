import modelPayload from "./esif-cooling-model.json";

type CompactTree = {
  f: number[];
  t: number[];
  l: number[];
  r: number[];
  v: number[];
  leaf: number[];
  ml: number[];
};

type ModelPayload = {
  model_id: string;
  target: string;
  feature_names: string[];
  baseline: number;
  calibration_offset: number;
  trees: CompactTree[];
};

const model = modelPayload as ModelPayload;

export type CoolingModelInput = {
  tempC: number;
  rhPercent: number;
  wetBulbC: number;
  localHour: number;
  dayOfYear: number;
  itLoadFraction: number;
};

export const MODEL_ID = model.model_id;

export function stullWetBulbC(tempC: number, rhPercent: number) {
  const rh = Math.min(100, Math.max(1, rhPercent));
  return (
    tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  );
}

export function predictCoolingRatio(input: CoolingModelInput) {
  const x = featureVector(input);
  let prediction = model.baseline;
  for (const tree of model.trees) {
    let node = 0;
    while (!tree.leaf[node]) {
      const value = x[tree.f[node]];
      const goLeft = Number.isNaN(value) ? Boolean(tree.ml[node]) : value <= tree.t[node];
      node = goLeft ? tree.l[node] : tree.r[node];
    }
    prediction += tree.v[node];
  }
  return Math.max(prediction + model.calibration_offset, 0);
}

function featureVector(input: CoolingModelInput) {
  const tempAbove15 = Math.max(input.tempC - 15, 0);
  const tempAbove22 = Math.max(input.tempC - 22, 0);
  const wetBulbAbove12 = Math.max(input.wetBulbC - 12, 0);
  const wetBulbAbove18 = Math.max(input.wetBulbC - 18, 0);
  const values: Record<string, number> = {
    temp_c: input.tempC,
    rh_fraction: input.rhPercent / 100,
    wet_bulb_c: input.wetBulbC,
    temp_above_15: tempAbove15,
    temp_above_22: tempAbove22,
    wet_bulb_above_12: wetBulbAbove12,
    wet_bulb_above_18: wetBulbAbove18,
    hour_sin: Math.sin((2 * Math.PI * input.localHour) / 24),
    hour_cos: Math.cos((2 * Math.PI * input.localHour) / 24),
    doy_sin: Math.sin((2 * Math.PI * input.dayOfYear) / 365.25),
    doy_cos: Math.cos((2 * Math.PI * input.dayOfYear) / 365.25),
    it_load_fraction: input.itLoadFraction,
    load_x_temp_above_15: input.itLoadFraction * tempAbove15,
  };
  return model.feature_names.map((name) => values[name]);
}
