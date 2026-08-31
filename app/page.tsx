"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { LOAD_STATE_OPTIONS, loadStateOption, loadSupportLabel } from "../lib/load-state";

type Analysis = {
  id: string;
  facilityName: string;
  createdAtUtc: string;
  analysisTimeLocal: string;
  analysisTimeUtc: string;
  ianaTimezone: string;
  latitude: number;
  longitude: number;
  facilityRadiusM: number;
  itLoadMw: number | null;
  itLoadFraction: number;
  loadStateSupport: string;
  loadStateTrainingHours: number;
  baselinePue: number | null;
  coolingConfiguration: string;
  status: string;
  centerTemperatureC: number | null;
  coreMeanTemperatureC: number | null;
  coreMaxTemperatureC: number | null;
  coreP90TemperatureC: number | null;
  coreTemperatureStdC: number | null;
  nearMeanTemperatureC: number | null;
  backgroundMeanTemperatureC: number | null;
  coreMinusBackgroundC: number | null;
  hotspotFraction: number | null;
  relativeHumidityPercent: number | null;
  wetBulbTemperatureC: number | null;
  coolingRatio: number | null;
  coolingMw: number | null;
  weatherUplift: number | null;
  incrementalCoolingMw: number | null;
  scenarioPue: number | null;
  environmentalExposureScore: number | null;
  environmentalExposureLevel: string | null;
  confidenceLevel: string | null;
  summary: string | null;
  modelId: string;
  apiTimestamp: string | null;
  apiTimezone?: string | null;
  confidenceReasons?: string[];
  weatherOutsideValidatedRange?: boolean;
  timestampAlignmentBasis?: string | null;
  coreTileCount?: number | null;
  nearTileCount?: number | null;
  backgroundTileCount?: number | null;
  saveForHistory?: boolean;
};

type FormState = {
  facilityName: string;
  latitude: string;
  longitude: string;
  ianaTimezone: string;
  analysisTimeLocal: string;
  facilityRadiusM: string;
  itLoadMw: string;
  itLoadFraction: string;
  baselinePue: string;
  coolingConfiguration: string;
  saveForHistory: boolean;
  allowSharedModelImprovement: boolean;
};

const presets = [
  { id: "custom", label: "Custom U.S. facility", name: "My facility", lat: "", lon: "", timezone: "America/New_York" },
  { id: "esif", label: "NLR / ESIF — Golden, CO", name: "NLR / ESIF HPC", lat: "39.7427", lon: "-105.1701", timezone: "America/Denver" },
  { id: "frontier", label: "ORNL Frontier — Oak Ridge, TN", name: "ORNL Frontier", lat: "35.9313", lon: "-84.3104", timezone: "America/New_York" },
  { id: "berkeley", label: "Google Berkeley County, SC", name: "Google Berkeley County", lat: "33.196", lon: "-79.995", timezone: "America/New_York" },
  { id: "midlothian", label: "Google Midlothian, TX", name: "Google Midlothian", lat: "32.4824", lon: "-96.9945", timezone: "America/Chicago" },
  { id: "mesa", label: "Meta Mesa, AZ", name: "Meta Mesa", lat: "33.354884", lon: "-111.635759", timezone: "America/Phoenix" },
];

const timezones = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];

function localHour(timezone: string, offsetHours = 0) {
  const instant = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
}

function isProcessing(status: string) {
  return status === "processing_spatial" || status === "submitting_environment" || status === "processing_environment";
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

const initialForm: FormState = {
  facilityName: "My facility",
  latitude: "",
  longitude: "",
  ianaTimezone: "America/New_York",
  analysisTimeLocal: localHour("America/New_York"),
  facilityRadiusM: "360",
  itLoadMw: "100",
  itLoadFraction: "0.80",
  baselinePue: "",
  coolingConfiguration: "unknown",
  saveForHistory: true,
  allowSharedModelImprovement: false,
};

export default function Home() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [preset, setPreset] = useState("custom");
  const [coordinatePair, setCoordinatePair] = useState("");
  const [coordinateMessage, setCoordinateMessage] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function loadHistory() {
    try {
      setHistoryError("");
      const response = await fetch("/api/analyses", { cache: "no-store" });
      if (!response.ok) throw new Error("History is temporarily unavailable.");
      const payload = (await response.json()) as { analyses: Analysis[] };
      setHistory(payload.analyses);
    } catch {
      setHistory([]);
      setHistoryError("Saved history is temporarily unavailable. Your analysis can still run.");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/analyses", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("History is temporarily unavailable.");
        return (await response.json()) as { analyses: Analysis[] };
      })
      .then((payload) => { if (active) { setHistory(payload.analyses); setHistoryError(""); } })
      .catch(() => { if (active) { setHistory([]); setHistoryError("Saved history is temporarily unavailable. Your analysis can still run."); } })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  function choosePreset(id: string) {
    setPreset(id);
    const selected = presets.find((item) => item.id === id) ?? presets[0];
    setCoordinatePair(selected.lat && selected.lon ? `${selected.lat}, ${selected.lon}` : "");
    setCoordinateMessage(selected.id === "custom" ? "" : "Preset coordinates applied.");
    setForm((current) => ({ ...current, facilityName: selected.name, latitude: selected.lat, longitude: selected.lon, ianaTimezone: selected.timezone, analysisTimeLocal: localHour(selected.timezone) }));
  }

  function applyCoordinatePair() {
    const match = coordinatePair.match(/^\s*\(?\s*(-?\d+(?:\.\d+)?)\s*(?:,|\s)\s*(-?\d+(?:\.\d+)?)\s*\)?\s*$/);
    const latitude = match ? Number(match[1]) : Number.NaN;
    const longitude = match ? Number(match[2]) : Number.NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 18 || latitude > 72 || longitude < -180 || longitude > -60) {
      setCoordinateMessage("Enter a U.S. pair such as 39.7427, -105.1701.");
      return;
    }
    setPreset("custom");
    setForm((current) => ({ ...current, latitude: String(latitude), longitude: String(longitude) }));
    setCoordinateMessage("Coordinates applied. Fine-tune either value below if needed.");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      setError("Enter a facility name and valid U.S. latitude/longitude before running the analysis.");
      return;
    }
    setElapsedSeconds(0);
    setLoading(true);
    setError("");
    setAnalysis(null);
    try {
      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, latitude: Number(form.latitude), longitude: Number(form.longitude), facilityRadiusM: Number(form.facilityRadiusM), itLoadMw: form.itLoadMw ? Number(form.itLoadMw) : null, itLoadFraction: Number(form.itLoadFraction), baselinePue: form.baselinePue ? Number(form.baselinePue) : null }),
      });
      const payload = (await response.json()) as { analysis?: Analysis; error?: string; persisted?: boolean };
      if (!response.ok || !payload.analysis) throw new Error(payload.error ?? "Analysis failed.");
      setAnalysis(payload.analysis);
      window.setTimeout(() => document.getElementById("analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      if (isProcessing(payload.analysis.status)) {
        await pollUntilTerminal(payload.analysis.id, payload.persisted === true);
      } else if (payload.analysis.status === "failed") {
        throw new Error(payload.analysis.summary ?? "Analysis failed.");
      } else if (payload.persisted) {
        await loadHistory();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed.");
      if (form.saveForHistory) await loadHistory();
    } finally {
      setLoading(false);
    }
  }

  async function pollUntilTerminal(id: string, persisted: boolean) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await wait(2500);
      const response = await fetch("/api/analyses", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = (await response.json()) as { analysis?: Analysis; error?: string; persisted?: boolean };
      if (!response.ok || !payload.analysis) throw new Error(payload.error ?? "Could not check analysis status.");
      setAnalysis(payload.analysis);
      if (payload.analysis.status === "completed") {
        if (persisted || payload.persisted) await loadHistory();
        return;
      }
      if (payload.analysis.status === "failed") {
        if (persisted || payload.persisted) await loadHistory();
        throw new Error(payload.analysis.summary ?? "Analysis failed.");
      }
    }
    if (persisted) await loadHistory();
    throw new Error("FortyGuard is still processing. This saved run can be resumed from History without starting over.");
  }

  async function resumeAnalysis(item: Analysis) {
    setAnalysis(item);
    setElapsedSeconds(0);
    setLoading(true);
    setError("");
    try {
      await pollUntilTerminal(item.id, item.saveForHistory !== false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resume analysis.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAnalysis(item: Analysis) {
    const confirmed = window.confirm(`Permanently delete the saved record for “${item.facilityName}”? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingId(item.id);
    setError("");
    try {
      const response = await fetch("/api/analyses", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const payload = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !payload.deleted) throw new Error(payload.error ?? "Could not delete this record.");
      setHistory((current) => current.filter((record) => record.id !== item.id));
      setAnalysis((current) => current?.id === item.id ? null : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this record.");
    } finally {
      setDeletingId(null);
    }
  }

  function showHistoryAnalysis(item: Analysis) {
    setAnalysis(item);
    window.setTimeout(() => document.getElementById("analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const completedHistory = useMemo(() => history.filter((item) => item.status === "completed"), [history]);
  const historyMax = Math.max(...completedHistory.map((item) => item.environmentalExposureScore ?? 0), 1);
  const selectedLoadState = loadStateOption(Number(form.itLoadFraction)) ?? LOAD_STATE_OPTIONS.find((option) => option.percent === 80)!;
  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);
  const canSubmit = form.facilityName.trim().length > 0
    && Number.isFinite(latitude) && latitude >= 18 && latitude <= 72
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= -60
    && !loading;

  return (
    <main>
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark">H</span><div><p className="brand">HeatAhead</p><p className="brand-sub">Facility weather intelligence</p></div></div>
        <nav className="topnav" aria-label="Main navigation"><a href="#analyze">Analyze</a><a href="#evidence">Evidence</a><a href="#incidents">Why now</a><a href="#history">History</a></nav>
        <div className="source-chip"><span className="live-dot" /> Live FortyGuard · ESIF model · Saved history</div>
      </header>

      <section className="hero compact-hero">
        <div className="hero-copy"><p className="eyebrow">Proactive thermal decision support</p><h1>See heat risk<br />before the alarm.</h1><p className="lede">HeatAhead combines live, historical, or near-term FortyGuard exposure with a locked ESIF cooling model. It is a scenario-analysis tool—not continuous monitoring, an alerting system, or a replacement for facility controls.</p><div className="hero-actions"><a className="primary-link" href="#analyze">Analyze a facility ↓</a><a href="#evidence">Inspect the evidence</a></div></div>
        <div className="method-stamp"><span>Evidence layers</span><strong>Exposure ≠ Cooling impact</strong><p>AOI statistics create HeatAhead Exposure. Only corrected center-tile weather enters the ESIF model.</p></div>
      </section>

      <section className="workspace-grid" id="analyze">
        <form className="analysis-form" onSubmit={submit}>
          <div className="panel-heading"><div><p className="eyebrow">01 · Facility input</p><h2>Run an analysis</h2></div><span className="required-note">Location required</span></div>
          <div className="form-section-label full"><strong>Location &amp; analysis time</strong><span>Pick a known facility or paste coordinates from any map.</span></div>
          <label className="field full"><span>Start from</span><select value={preset} onChange={(event) => choosePreset(event.target.value)}>{presets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label className="field full"><span>Facility name</span><input required value={form.facilityName} onChange={(event) => setForm({ ...form, facilityName: event.target.value })} placeholder="Ashburn AI Campus" /></label>
          <div className="field full coordinate-field"><span>Paste coordinate pair</span><div className="coordinate-entry"><input aria-label="Latitude and longitude pair" value={coordinatePair} onChange={(event) => { setCoordinatePair(event.target.value); setCoordinateMessage(""); }} placeholder="39.7427, -105.1701" /><button type="button" onClick={applyCoordinatePair}>Apply</button></div><small>{coordinateMessage || "Paste directly from a map, then use the fields below for precise edits."}</small></div>
          <label className="field"><span>Latitude</span><input required type="number" min="18" max="72" step="0.0001" value={form.latitude} onChange={(event) => { setPreset("custom"); setForm({ ...form, latitude: event.target.value }); }} placeholder="39.0438" /></label>
          <label className="field"><span>Longitude</span><input required type="number" min="-180" max="-60" step="0.0001" value={form.longitude} onChange={(event) => { setPreset("custom"); setForm({ ...form, longitude: event.target.value }); }} placeholder="-77.4874" /></label>
          <label className="field"><span>IANA timezone</span><select value={form.ianaTimezone} onChange={(event) => setForm({ ...form, ianaTimezone: event.target.value, analysisTimeLocal: localHour(event.target.value) })}>{timezones.map((timezone) => <option key={timezone}>{timezone}</option>)}</select></label>
          <label className="field"><span>Analysis time · local</span><input required type="datetime-local" step="3600" value={form.analysisTimeLocal} onChange={(event) => setForm({ ...form, analysisTimeLocal: event.target.value })} /></label>
          <div className="time-alignment full"><div><strong>Timezone-safe</strong><span>FortyGuard receives the selected local wall-clock hour. HeatAhead independently resolves its UTC instant, rejects ambiguous DST hours, and verifies the returned API offset.</span></div><div className="time-shortcuts" aria-label="Forecast time shortcuts"><button type="button" onClick={() => setForm({ ...form, analysisTimeLocal: localHour(form.ianaTimezone) })}>Now</button><button type="button" onClick={() => setForm({ ...form, analysisTimeLocal: localHour(form.ianaTimezone, 6) })}>+6 h</button><button type="button" onClick={() => setForm({ ...form, analysisTimeLocal: localHour(form.ianaTimezone, 12) })}>+12 h</button></div></div>
          <div className="form-section-label full"><strong>Operating scenario</strong><span>The ESIF model uses the center temperature tile, RH, wet bulb, time, and ESIF-equivalent load state. AOI averages stay in Exposure.</span></div>
          <label className="field"><span>Core square width</span><div className="input-unit"><input type="number" min="100" max="1000" value={form.facilityRadiusM} onChange={(event) => setForm({ ...form, facilityRadiusM: event.target.value })} /><i>m</i></div><small>Controls core exposure statistics; the model uses the corrected center tile, not the core mean.</small></label>
          <label className="field"><span>Cooling configuration · applicability</span><select value={form.coolingConfiguration} onChange={(event) => setForm({ ...form, coolingConfiguration: event.target.value })}><option value="unknown">Unknown</option><option value="air-cooled">Air cooled</option><option value="evaporative">Evaporative</option><option value="chilled-water">Chilled water</option><option value="direct-to-chip">Direct-to-chip liquid</option><option value="hybrid">Hybrid</option></select></label>
          <label className="field"><span>Current IT load · MW scaling</span><div className="input-unit"><input type="number" min="0" max="2000" step="1" value={form.itLoadMw} onChange={(event) => setForm({ ...form, itLoadMw: event.target.value })} placeholder="Unknown" /><i>MW</i></div></label>
          <div className="field full load-state-control"><div className="load-state-heading"><span>ESIF-equivalent load state · 45–105%</span><label><span>Exact value</span><select aria-label="Exact load state" value={form.itLoadFraction} onChange={(event) => setForm({ ...form, itLoadFraction: event.target.value })}>{LOAD_STATE_OPTIONS.map((option) => <option key={option.percent} value={option.fraction.toFixed(2)}>{option.percent}%</option>)}</select></label><strong>{selectedLoadState.percent}%</strong></div><input aria-label="Load state slider" type="range" min="0.45" max="1.05" step="0.05" value={form.itLoadFraction} onChange={(event) => setForm({ ...form, itLoadFraction: Number(event.target.value).toFixed(2) })} /><div className="load-ticks" aria-hidden="true">{LOAD_STATE_OPTIONS.map((option) => <i key={option.percent} />)}</div><div className="range-labels"><i>45%</i><i>60%</i><i>75%</i><i>90%</i><i>105%</i></div><p className="load-recommendation"><strong>Best-supported choices</strong><span>60%, 65%, 70%, 75%, 85%, 90%, 95%, or 100%. The 70% state has the most ESIF training coverage.</span></p><p className={`load-support support-${selectedLoadState.support}`}><strong>{loadSupportLabel(selectedLoadState)}</strong><span>{selectedLoadState.support === "sparse" ? "Limited ESIF coverage; overall transfer confidence will be Low." : "Hours within ±2.5 percentage points in the ESIF training block."}</span></p></div>
          <label className="field full"><span>Same-facility baseline PUE · optional</span><input type="number" min="1" max="2.5" step="0.001" value={form.baselinePue} onChange={(event) => setForm({ ...form, baselinePue: event.target.value })} placeholder="Leave blank to hide anchored scenario PUE" /></label>
          <div className="form-section-label full"><strong>Data preference</strong><span>Choose whether this run becomes part of the customer timeline.</span></div>
          <div className="consent full">
            <div className="consent-row"><input id="save-history" type="checkbox" checked={form.saveForHistory} onChange={(event) => setForm({ ...form, saveForHistory: event.target.checked })} /><label htmlFor="save-history"><strong>Save this run to this browser&apos;s history</strong><small>Stored for up to 90 days. Clearing this browser cookie or changing devices removes access to the anonymous history.</small></label></div>
            <div className="consent-row"><input id="shared-improvement" type="checkbox" checked={form.allowSharedModelImprovement} onChange={(event) => setForm({ ...form, allowSharedModelImprovement: event.target.checked })} /><label htmlFor="shared-improvement"><strong>Allow de-identified shared model improvement</strong><small>Separate consent; off by default and not used in this Demo.</small></label></div>
          </div>
          {error && <p className="form-error full" role="alert">{error}</p>}
          <button className="run-button full" disabled={!canSubmit}>{loading ? <><span className="spinner" /> Analysis running · {elapsedSeconds}s</> : canSubmit ? "Analyze facility" : "Enter a valid U.S. location"}</button>
          <p className="form-footnote full">One run requests three nested centered square AOIs: selected core width at 60 m granularity; 1.2 km neighborhood at 80 m; and 2.4 km context at 100 m. They are HeatAhead analysis windows—not inferred campus boundaries or non-overlapping rings. Typical processing time is 30–90 seconds.</p>
          <details className="explain-panel full"><summary>What every input changes</summary><div className="explain-grid"><article><strong>Facility name</strong><p>Record label only. It never enters the API or model.</p></article><article><strong>Latitude / longitude</strong><p>Required API location and the center of all three nested square AOIs. A valid U.S. bounding-box value is not a guarantee of usable tiles; completion is the coverage test.</p></article><article><strong>Timezone + local time</strong><p>Submitted as the location&apos;s wall-clock hour, independently resolved to UTC, checked against API time and offset, and rejected when DST makes the hour ambiguous.</p></article><article><strong>Core square width</strong><p>Controls core exposure statistics. Cooling uses the corrected center tile—not the AOI mean—so changing footprint width does not intentionally average new spatial values into the model.</p></article><article><strong>Cooling configuration</strong><p>Applicability metadata only. Unknown lowers confidence; the current model does not learn configuration-specific coefficients.</p></article><article><strong>Current IT load (MW)</strong><p>Scaling input: cooling ratio × MW. It creates scenario MW but is not fed into the trained ESIF model.</p></article><article><strong>ESIF-equivalent load state</strong><p>ESIF IT divided by the train-only P95 (≈3.66 MW). It is not the customer facility&apos;s design utilization; support hours show comparable ESIF evidence.</p></article><article><strong>Baseline PUE</strong><p>Optional same-facility scenario anchor. Output is baseline + modeled weather uplift; it is not a trained absolute-PUE prediction.</p></article><article><strong>Save / improvement consent</strong><p>Save controls this anonymous browser timeline for up to 90 days. Shared improvement is separate, off by default, and unused in this Demo.</p></article></div></details>
        </form>

        <section className={`result-panel ${analysis || loading ? "has-result" : "empty-result"}`} id="analysis-result" aria-live="polite">
          {loading ? <AnalysisProgress seconds={elapsedSeconds} status={analysis?.status} /> : !analysis ? <div className="empty-state"><span>02</span><h2>Your result appears here</h2><p>Location alone produces Environmental Exposure. Add IT load for MW impact. Add baseline PUE only when you want a scenario PUE.</p><div className="layer-preview"><i>Core square</i><i>1.2 km square</i><i>2.4 km square</i></div></div> : isProcessing(analysis.status) ? <ProcessingResult analysis={analysis} onResume={() => resumeAnalysis(analysis)} /> : analysis.status !== "completed" ? <div className="empty-state"><span>!</span><h2>Run failed</h2><p>{analysis.summary}</p></div> : <Result analysis={analysis} />}
        </section>
      </section>

      <section className="evidence-section" id="evidence">
        <div className="section-heading"><div><p className="eyebrow">Verified pipeline</p><h2>Every output has a declared evidence level.</h2></div><span className="verification-date">Reproduced · Aug 29, 2026</span></div>
        <div className="evidence-grid">
          <article><div><span>Step 1</span><b className="status-pass">PASS</b></div><h3>ESIF internal model</h3><strong>R² 0.448 · MAE 0.003246</strong><p>Chronological test set. Moderate explanatory power, but 60.5% lower MAE than the train-median baseline. Suitable for a bounded Demo scenario—not control-grade truth.</p></article>
          <article><div><span>Step 2</span><b className="status-partial">PARTIAL</b></div><h3>Frontier operational check</h3><strong>Baseline R² 0.828 · not transfer R²</strong><p>Operational baseline decomposition passed. The cross-facility weather coefficient was rejected and is not used in customer claims.</p></article>
          <article><div><span>Step 3</span><b className="status-pass">REPRODUCED</b></div><h3>Seven U.S. target sites</h3><strong>FortyGuard → scenario output</strong><p>All seven stored target calculations reproduce. They are prospective scenarios, not measured target-facility truth.</p></article>
        </div>
        <p className="claim-boundary"><strong>Claim boundary:</strong> HeatAhead Exposure is a heuristic computed from FortyGuard-derived spatial inputs—not a failure probability. Cooling impact is ESIF-equivalent. Scenario PUE is baseline PUE plus modeled uplift—not a trained absolute-PUE model.</p>
      </section>

      <section className="history-section" id="history">
        <div className="section-heading"><div><p className="eyebrow">03 · Saved data</p><h2>Facility analysis history</h2></div><span className="history-count">{history.length} saved run{history.length === 1 ? "" : "s"}</span></div>
        {historyLoading ? <p className="history-empty">Loading private history…</p> : historyError ? <p className="history-empty history-error">{historyError}</p> : history.length === 0 ? <p className="history-empty">No saved analyses yet. Keep “Save this run” checked to start a facility timeline.</p> : <div className="history-layout"><div className="timeline" aria-label="Saved exposure timeline">{completedHistory.slice().reverse().map((item) => <button key={item.id} title={`${item.facilityName}: ${format(item.environmentalExposureScore, 0)}/100`} onClick={() => showHistoryAnalysis(item)}><span style={{ height: `${Math.max(8, ((item.environmentalExposureScore ?? 0) / historyMax) * 100)}%` }} /></button>)}</div><div className="history-list">{history.map((item) => <article className="history-row" key={item.id}><button className="history-open" onClick={() => showHistoryAnalysis(item)}><span><strong>{item.facilityName}</strong><small>{item.analysisTimeLocal.replace("T", " ")} · {item.ianaTimezone.replace("America/", "")}</small></span><span><strong className={isProcessing(item.status) ? "level-processing" : levelClass(item.environmentalExposureLevel)}>{item.status === "completed" ? item.environmentalExposureLevel : isProcessing(item.status) ? "Processing" : "Failed"}</strong><small>{item.status === "completed" ? `${format(item.wetBulbTemperatureC, 1)}°C wet bulb · ${Math.round(item.itLoadFraction * 100)}% ESIF-equivalent${item.itLoadFraction > 1.05 ? " · legacy outside current grid" : ""}` : item.summary}</small></span><b>{isProcessing(item.status) ? "Resume →" : "View →"}</b></button><button type="button" className="history-delete" disabled={deletingId === item.id} onClick={() => deleteAnalysis(item)} aria-label={`Permanently delete ${item.facilityName}`}>{deletingId === item.id ? "Deleting…" : "Delete"}</button></article>)}</div></div>}
        <p className="history-policy">Anonymous history is available only in this browser and is retained for up to 90 days. Delete permanently removes the HeatAhead D1 record and cannot be undone; it does not cancel or erase a FortyGuard activity already submitted.</p>
      </section>

      <section className="incidents-section" id="incidents">
        <div className="incident-intro"><p className="eyebrow">Why this matters</p><h2>Thermal events compress the operator&apos;s decision window.</h2><p>Public incident reports show that extreme outdoor heat and cooling disruptions can progress from thermal alert to protective shutdown. HeatAhead is designed as an earlier planning layer—not a replacement for BMS, EPMS, or hardware protection.</p></div>
        <div className="incident-grid">
          <article><div><span>London · 2022</span><b>Google Cloud</b></div><h3>Extreme outdoor heat coincided with multiple redundant cooling failures.</h3><p>Google reported that automated temperature monitoring detected the rise and engineers powered systems down to prevent damage.</p><a href="https://status.cloud.google.com/incidents/fmEL9i2fArADKawkZAa2" target="_blank" rel="noreferrer">Read the official incident report ↗</a></article>
          <article><div><span>Sacramento · 2022</span><b>Twitter</b></div><h3>A heat wave caused a full physical shutdown at a key data center.</h3><p>The incident left the company in a non-redundant state while Sacramento recorded exceptional heat.</p><a href="https://www.axios.com/2022/09/12/twitter-heat-wave-sacramento-data-center-shutdown" target="_blank" rel="noreferrer">Read Axios reporting ↗</a></article>
          <article><div><span>West US 2 · 2026</span><b>Microsoft Azure</b></div><h3>A cooling lockout led to rising temperatures and rapid service shutdowns.</h3><p>Microsoft&apos;s remediation explicitly includes proactive row-level shutdown and a longer decision window before protective systems engage.</p><a href="https://azure.status.microsoft/status/history/?trackingId=GHRP-84G" target="_blank" rel="noreferrer">Read the official incident history ↗</a></article>
        </div>
        <p className="source-caveat"><strong>Responsible framing:</strong> These sources do not prove the operators lacked forecasts or pre-cooling. Google explicitly reports automated temperature monitoring. The demonstrated gap is the value of more location-aware lead time before reactive protection is triggered.</p>
      </section>

      <section className="method">
        <div><p className="eyebrow">Evidence boundary</p><h2>Three layers.<br />No category errors.</h2></div>
        <ol><li><span>01</span><div><strong>HeatAhead Exposure</strong><p>A transparent heuristic computed from FortyGuard core, neighborhood, and context statistics.</p></div></li><li><span>02</span><div><strong>Weather-driven cooling increment</strong><p>Locked ESIF model using corrected center-tile weather; AOI means are excluded from the model input.</p></div></li><li><span>03</span><div><strong>Transfer Confidence</strong><p>Checks UTC alignment, load support, tile counts, cooling metadata, and ESIF extreme-weather support; never above Medium.</p></div></li></ol>
      </section>

      <footer><p><strong>Important:</strong> Cooling outputs are ESIF-equivalent scenarios, not measured customer-facility PUE or cooling telemetry.</p><span>Demo v2.3 · support-gated model · protected public API · 90-day browser history</span></footer>
    </main>
  );
}

function Result({ analysis }: { analysis: Analysis }) {
  const support = loadStateOption(analysis.itLoadFraction);
  const confidenceReasons = analysis.confidenceReasons ?? [];
  const lowConfidence = analysis.confidenceLevel === "Low";
  return <>
    <div className="result-heading"><div><p className="eyebrow">02 · Analysis result</p><h2>{analysis.facilityName}</h2><p>{analysis.summary}</p></div><span className="saved-badge">{analysis.saveForHistory === false ? "Live scenario" : "Saved record"}</span></div>
    <div className="operator-action"><span>Suggested operator review</span><strong>{operatorAction(analysis)}</strong><small>Decision support only—confirm against facility controls, redundancy, and operating procedures.</small></div>
    <div className="result-cards"><article><p>HeatAhead exposure</p><strong className={levelClass(analysis.environmentalExposureLevel)}>{analysis.environmentalExposureLevel}</strong><span>{format(analysis.environmentalExposureScore, 0)} / 100 · derived from FortyGuard</span></article><article><p>Weather-driven cooling increment</p><strong>{analysis.incrementalCoolingMw === null ? signed(analysis.weatherUplift, 4) : `${signed(analysis.incrementalCoolingMw, 2)} MW`}</strong><span>{analysis.itLoadMw === null ? "modeled uplift per unit IT" : `at ${format(analysis.itLoadMw, 0)} MW current IT load`}</span></article><article><p>Transfer confidence</p><strong className="confidence">{analysis.confidenceLevel}</strong><span>{analysis.weatherOutsideValidatedRange ? "Outside ESIF extreme-weather support" : "Applicability label—not a prediction interval"}</span></article></div>
    <div className={`confidence-explanation ${lowConfidence ? "confidence-low" : "confidence-medium"}`}><strong>{lowConfidence ? "Why this run is Low confidence" : "Why this run is capped at Medium"}</strong><ul>{confidenceReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
    <div className="spatial-block"><div className="subheading"><strong>Spatial environment</strong><span>FortyGuard modeled outdoor temperature</span></div><div className="spatial-grid"><article><span>Core · {analysis.facilityRadiusM} m square</span><strong>{format(analysis.coreMeanTemperatureC, 1)}°C</strong><small>center {format(analysis.centerTemperatureC, 1)}° · p90 {format(analysis.coreP90TemperatureC, 1)}° · max {format(analysis.coreMaxTemperatureC, 1)}°</small></article><article><span>Neighborhood · 1.2 km square</span><strong>{format(analysis.nearMeanTemperatureC, 1)}°C</strong><small>600 m center-to-edge · ≈849 m to corners</small></article><article><span>Context · 2.4 km square</span><strong>{format(analysis.backgroundMeanTemperatureC, 1)}°C</strong><small>1.2 km center-to-edge · core delta {signed(analysis.coreMinusBackgroundC, 1)}°C</small></article></div><div className="spatial-details"><span>Core spread σ: {format(analysis.coreTemperatureStdC, 2)}°C</span><span>Hotspot tiles: {format(analysis.hotspotFraction === null ? null : analysis.hotspotFraction * 100, 1)}%</span><span>Hotspot = core tile &gt; background mean + 1°C</span></div></div>
    <div className="impact-grid"><div><span>Center-tile weather used by model</span><strong>{format(analysis.centerTemperatureC, 1)}°C · {format(analysis.relativeHumidityPercent, 0)}% RH</strong><small>{format(analysis.wetBulbTemperatureC, 1)}°C wet bulb · core mean excluded</small></div><div><span>ESIF-equivalent cooling</span><strong>{analysis.coolingMw === null ? `${format(analysis.coolingRatio, 4)} per IT` : `${format(analysis.coolingMw, 2)} MW`}</strong><small>ratio × current IT MW; locked model {analysis.modelId}</small></div><div><span>ESIF-equivalent load evidence</span><strong>{Math.round(analysis.itLoadFraction * 100)}%</strong><small>{support ? loadSupportLabel(support) : `Legacy ${Math.round(analysis.itLoadFraction * 100)}% · outside current grid`}</small></div><div><span>Anchored scenario PUE</span><strong>{analysis.scenarioPue === null ? "Not shown" : format(analysis.scenarioPue, 3)}</strong><small>{analysis.scenarioPue === null ? "enter same-facility baseline PUE to enable" : `${format(analysis.baselinePue, 3)} baseline + ${signed(analysis.weatherUplift, 4)} uplift`}</small></div></div>
    <details className="result-explainer"><summary>How to read every output and its trust level</summary><div className="explain-grid"><article><strong>Exposure score / level</strong><p>A HeatAhead 0–100 heuristic combining FortyGuard-derived core p90, wet bulb, core/context delta and hotspot fraction. It is not a failure probability.</p></article><article><strong>Cooling ratio / MW</strong><p>The trained ESIF-equivalent cooling-to-IT ratio. If current IT MW is supplied, proportional scaling creates scenario MW; the target facility was not training data.</p></article><article><strong>Weather uplift</strong><p>Model output minus the same hour/day/load at 18°C and 50% RH. It is a transparent model contrast—not a causal estimate.</p></article><article><strong>Scenario PUE</strong><p>User baseline PUE + modeled weather uplift. The direct absolute-PUE model failed its gate, so this remains an anchored scenario.</p></article><article><strong>Transfer Confidence</strong><p>Low when UTC/offset alignment, cooling metadata, ESIF load support, AOI tile counts, or extreme-weather support fail. It never reaches High because cross-facility weather transfer is unvalidated.</p></article><article><strong>Spatial statistics</strong><p>Mean describes each nested AOI; p90 is exceeded by about 10% of core tiles; max is the hottest tile; σ is within-core spread. The model uses the corrected center tile only.</p></article></div></details>
    <div className="result-meta"><span>Local: {analysis.analysisTimeLocal.replace("T", " ")} · {analysis.ianaTimezone}</span><span>UTC: {analysis.analysisTimeUtc.replace("T", " ").slice(0, 16)}</span><span>{analysis.latitude.toFixed(4)}, {analysis.longitude.toFixed(4)}</span><span>API: {analysis.apiTimestamp?.replace("T", " ").slice(0, 22) ?? "timestamp unavailable"}{analysis.apiTimezone ? ` · ${analysis.apiTimezone}` : ""}</span><span>Tiles: {format(analysis.coreTileCount ?? null, 0)} / {format(analysis.nearTileCount ?? null, 0)} / {format(analysis.backgroundTileCount ?? null, 0)}</span></div>
  </>;
}

function ProcessingResult({ analysis, onResume }: { analysis: Analysis; onResume: () => void }) {
  const stage = analysis.status === "processing_environment" || analysis.status === "submitting_environment" ? "Humidity and wet-bulb analysis" : "Spatial temperature layers";
  return <div className="empty-state processing-result"><span>↻</span><p className="eyebrow">Saved upstream activity</p><h2>{stage} still processing</h2><p>{analysis.summary}</p><button type="button" className="resume-button" onClick={onResume}>Resume this analysis</button><small>No new FortyGuard jobs will be created. HeatAhead will continue polling the saved activity IDs.</small></div>;
}

function AnalysisProgress({ seconds, status }: { seconds: number; status?: string }) {
  const stages = ["Submit three AOIs", "Resolve spatial temperature", "Read humidity & wet bulb", "Apply locked ESIF model"];
  const activeStage = status === "processing_environment" || status === "submitting_environment" ? 2 : status === "processing_spatial" ? 1 : 0;
  const progress = activeStage === 2 ? Math.min(92, 68 + seconds * 0.35) : activeStage === 1 ? Math.min(65, 25 + seconds * 0.55) : 12;
  return <div className="progress-state"><span className="progress-orbit"><i /><i /><i /></span><p className="eyebrow">02 · Live analysis</p><h2>{stages[activeStage]}</h2><p>Typical processing time is 30–90 seconds. HeatAhead checks the same protected activity records instead of restarting the run.</p><div className="progress-track" aria-label={`Analysis progress ${Math.round(progress)} percent`}><span style={{ width: `${progress}%` }} /></div><ol>{stages.map((stage, index) => <li className={index < activeStage ? "complete" : index === activeStage ? "active" : ""} key={stage}><b>{index < activeStage ? "✓" : index + 1}</b><span>{stage}</span></li>)}</ol><small>{seconds}s elapsed · saved runs can resume from History; unsaved temporary records expire automatically</small></div>;
}

function operatorAction(analysis: Analysis) {
  const level = (analysis.environmentalExposureLevel ?? "").toLowerCase();
  const highWetBulb = (analysis.wetBulbTemperatureC ?? -Infinity) >= 24;
  const lowConfidence = (analysis.confidenceLevel ?? "").toLowerCase() === "low";
  const action = level === "high" || highWetBulb ? "Review cooling headroom, standby response, and workload-shift options." : level === "elevated" ? "Watch cooling headroom and compare the facility across peak local hours." : "No acute exposure signal; compare again at the hottest local hour.";
  return lowConfidence ? `${action} Resolve low-confidence inputs before acting.` : action;
}

function format(value: number | null, digits: number) { return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits); }
function signed(value: number | null, digits: number) { return value === null || !Number.isFinite(value) ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`; }
function levelClass(level: string | null) { return `level-${(level ?? "unknown").toLowerCase()}`; }
