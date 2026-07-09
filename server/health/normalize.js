// Geräte-Normalisierung: rohe Wearable-Exporte → kanonisches Tages-Objekt
// (siehe fields.js) plus optionale Intraday-Samples.
//
// RingConn ist die *Referenzquelle*. WHOOP, Apple Health / Health Connect und
// ein generischer (bereits kanonischer) Pass-Through werden ebenfalls abgedeckt.
// Grundsatz: tolerant lesen — mehrere Schreibweisen/Verschachtelungen akzeptieren,
// Einheiten vereinheitlichen, Unbekanntes ignorieren (bleibt in raw_json erhalten).

import { coerceDaily } from "./fields.js";
import { dayKey as localDayKey } from "../lib/util.js";

export const SUPPORTED_SOURCES = ["ringconn", "whoop", "apple_health", "google_fit", "manual", "generic"];

// Quelle säubern: klein, Präfix-tolerant (z. B. "WHOOP 4.0", "ring-conn"),
// Unbekanntes → "generic".
export function normalizeSource(source) {
  const s = String(source || "").trim().toLowerCase().replace(/[\s._-]+/g, "_");
  if (!s) return "manual";
  if (s.startsWith("ring")) return "ringconn";
  if (s.startsWith("whoop")) return "whoop";
  if (s.startsWith("apple") || s.startsWith("healthkit")) return "apple_health";
  if (s.startsWith("google") || s.startsWith("health_connect") || s.startsWith("healthconnect")) return "google_fit";
  return SUPPORTED_SOURCES.includes(s) ? s : "generic";
}

// ── kleine Helfer ───────────────────────────────────────────
// Ersten definierten Wert entlang mehrerer Dot-Pfade zurückgeben.
function pick(obj, ...paths) {
  for (const path of paths) {
    let cur = obj;
    for (const seg of path.split(".")) {
      if (cur == null) { cur = undefined; break; }
      cur = cur[seg];
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}
const msToMin = (ms) => (ms == null ? undefined : ms / 60000);
const secToMin = (s) => (s == null ? undefined : s / 60);
const kjToKcal = (kj) => (kj == null ? undefined : kj / 4.184);
// ISO-String ODER Epoch-ms/-s → Epoch-ms.
function toEpochMs(v) {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return v < 1e12 ? Math.round(v * 1000) : Math.round(v); // <1e12 ⇒ Sekunden
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}
// Tagesschlüssel aus explizitem Feld ODER aus Schlafende/Aufwachzeit ableiten.
function resolveDayKey(raw, fallbackTs) {
  const explicit = pick(raw, "dayKey", "day", "date", "calendar_date", "summary_date");
  if (typeof explicit === "string" && /^\d{4}-\d{2}-\d{2}/.test(explicit)) return explicit.slice(0, 10);
  const ts = toEpochMs(explicit) ?? fallbackTs;
  return ts == null ? undefined : localDayKey(new Date(ts));
}
// undefined-Werte aus einem Objekt entfernen (damit COALESCE-Merge sauber greift).
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// ── RingConn (Referenz) ─────────────────────────────────────
// RingConn hat (Stand 2026) keine offizielle Public-REST-API; Daten liegen in
// der RingConn-App und lassen sich per Export bzw. Apple Health / Health Connect
// herausziehen. Diese Map bildet die App-Metriken (Schlaf, Puls, HRV, SpO₂,
// Hauttemperatur, Schritte, Wellness/Stress) auf die kanonischen Felder ab.
function fromRingConn(raw) {
  const start = toEpochMs(pick(raw, "sleep.start", "sleep.bedtime", "bedtime", "sleepStart"));
  const end = toEpochMs(pick(raw, "sleep.end", "sleep.wakeTime", "wakeTime", "sleepEnd"));
  const c = {
    sleepStart: start,
    sleepEnd: end,
    sleepTotalMin: pick(raw, "sleep.totalMinutes", "sleep.durationMin", "sleepDurationMin")
      ?? msToMin(pick(raw, "sleep.durationMs", "sleepDurationMs")),
    sleepDeepMin: pick(raw, "sleep.deepMinutes", "sleep.deep", "deepSleepMin"),
    sleepRemMin: pick(raw, "sleep.remMinutes", "sleep.rem", "remSleepMin"),
    sleepLightMin: pick(raw, "sleep.lightMinutes", "sleep.light", "lightSleepMin"),
    sleepAwakeMin: pick(raw, "sleep.awakeMinutes", "sleep.awake", "awakeMin"),
    sleepEfficiency: pick(raw, "sleep.efficiency", "sleepEfficiency"),
    sleepScore: pick(raw, "sleep.score", "sleepScore"),
    restingHr: pick(raw, "restingHeartRate", "restingHr", "heartRate.resting", "rhr"),
    avgHr: pick(raw, "heartRate.avg", "heartRate.average", "avgHeartRate"),
    minHr: pick(raw, "heartRate.min", "minHeartRate"),
    maxHr: pick(raw, "heartRate.max", "maxHeartRate"),
    hrvMs: pick(raw, "hrv", "hrvMs", "heartRateVariability", "hrv.rmssd"),
    respiratoryRate: pick(raw, "respiratoryRate", "respiration", "breathingRate"),
    spo2Avg: pick(raw, "spo2.avg", "spo2", "bloodOxygen", "spo2Avg"),
    spo2Min: pick(raw, "spo2.min", "spo2Min"),
    skinTempC: pick(raw, "skinTemperature", "skinTempC", "temperature"),
    skinTempDeltaC: pick(raw, "skinTemperatureDelta", "temperatureDelta", "skinTempDeltaC"),
    steps: pick(raw, "steps", "activity.steps"),
    activeCalories: pick(raw, "activeCalories", "activity.activeCalories", "caloriesActive"),
    totalCalories: pick(raw, "totalCalories", "calories", "activity.totalCalories"),
    activityMin: pick(raw, "activeMinutes", "activity.minutes", "activityMin"),
    distanceM: pick(raw, "distance", "distanceM", "activity.distance"),
    stressAvg: pick(raw, "stress", "stressAvg", "stress.avg"),
    // RingConn kennt kein WHOOP-Recovery/Strain; "Wellness"/Readiness → readiness.
    readiness: pick(raw, "readiness", "wellnessScore", "wellness", "readinessScore"),
  };
  return compact(c);
}

// ── WHOOP ───────────────────────────────────────────────────
// Erwartet die Objekte der offiziellen WHOOP-API (recovery / sleep / cycle),
// entweder verschachtelt {recovery,sleep,cycle} oder bereits teilflach.
function fromWhoop(raw) {
  const start = toEpochMs(pick(raw, "sleep.start", "start", "sleepStart"));
  const end = toEpochMs(pick(raw, "sleep.end", "end", "sleepEnd"));
  const c = {
    sleepStart: start,
    sleepEnd: end,
    sleepDeepMin: msToMin(pick(raw, "sleep.score.stage_summary.total_slow_wave_sleep_time_milli", "slowWaveMilli")),
    sleepRemMin: msToMin(pick(raw, "sleep.score.stage_summary.total_rem_sleep_time_milli", "remMilli")),
    sleepLightMin: msToMin(pick(raw, "sleep.score.stage_summary.total_light_sleep_time_milli", "lightMilli")),
    sleepAwakeMin: msToMin(pick(raw, "sleep.score.stage_summary.total_awake_time_milli", "awakeMilli")),
    sleepEfficiency: pick(raw, "sleep.score.sleep_efficiency_percentage", "sleepEfficiency"),
    sleepScore: pick(raw, "sleep.score.sleep_performance_percentage", "sleepPerformance"),
    restingHr: pick(raw, "recovery.score.resting_heart_rate", "restingHeartRate"),
    avgHr: pick(raw, "cycle.score.average_heart_rate", "averageHeartRate"),
    maxHr: pick(raw, "cycle.score.max_heart_rate", "maxHeartRate"),
    hrvMs: pick(raw, "recovery.score.hrv_rmssd_milli", "hrvRmssdMilli"),
    respiratoryRate: pick(raw, "sleep.score.respiratory_rate", "respiratoryRate"),
    spo2Avg: pick(raw, "recovery.score.spo2_percentage", "spo2Percentage"),
    skinTempC: pick(raw, "recovery.score.skin_temp_celsius", "skinTempCelsius"),
    activeCalories: kjToKcal(pick(raw, "cycle.score.kilojoule", "kilojoule")),
    recoveryScore: pick(raw, "recovery.score.recovery_score", "recoveryScore"),
    strainScore: pick(raw, "cycle.score.strain", "strain"),
  };
  // WHOOP-Gesamtschlaf = Summe der Phasen, falls nicht separat vorhanden.
  const phases = [c.sleepDeepMin, c.sleepRemMin, c.sleepLightMin].filter((x) => x != null);
  if (phases.length) c.sleepTotalMin = phases.reduce((a, b) => a + b, 0);
  return compact(c);
}

// ── Apple Health / Google Fit (aggregierter Tages-Export) ───
function fromAggregator(raw) {
  const start = toEpochMs(pick(raw, "sleepStart", "inBedStart", "bedtime"));
  const end = toEpochMs(pick(raw, "sleepEnd", "inBedEnd", "wakeTime"));
  const c = {
    sleepStart: start,
    sleepEnd: end,
    sleepTotalMin: pick(raw, "sleepTotalMin", "sleepMinutes")
      ?? secToMin(pick(raw, "sleepAnalysisAsleepSeconds", "asleepSeconds")),
    sleepDeepMin: pick(raw, "sleepDeepMin", "deepMinutes"),
    sleepRemMin: pick(raw, "sleepRemMin", "remMinutes"),
    sleepLightMin: pick(raw, "sleepLightMin", "coreMinutes", "lightMinutes"),
    sleepAwakeMin: pick(raw, "sleepAwakeMin", "awakeMinutes"),
    restingHr: pick(raw, "restingHr", "restingHeartRate", "HKQuantityTypeIdentifierRestingHeartRate"),
    avgHr: pick(raw, "avgHr", "averageHeartRate"),
    hrvMs: pick(raw, "hrvMs", "heartRateVariabilitySDNN", "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"),
    respiratoryRate: pick(raw, "respiratoryRate", "HKQuantityTypeIdentifierRespiratoryRate"),
    spo2Avg: pick(raw, "spo2Avg", "oxygenSaturation", "HKQuantityTypeIdentifierOxygenSaturation"),
    steps: pick(raw, "steps", "stepCount", "HKQuantityTypeIdentifierStepCount"),
    activeCalories: pick(raw, "activeCalories", "activeEnergyBurned"),
    totalCalories: pick(raw, "totalCalories", "basalPlusActive"),
    distanceM: pick(raw, "distanceM", "distanceWalkingRunning"),
  };
  return compact(c);
}

// ── Dispatcher ──────────────────────────────────────────────
// Roh-Tages-Objekt einer Quelle → { dayKey, source, canonical, cols, raw }.
// `cols` ist bereits validiert/geklemmt und direkt in health_daily schreibbar.
export function normalizeDaily(source, raw = {}) {
  const src = normalizeSource(source);
  let canonical;
  switch (src) {
    case "ringconn": canonical = fromRingConn(raw); break;
    case "whoop": canonical = fromWhoop(raw); break;
    case "apple_health":
    case "google_fit": canonical = fromAggregator(raw); break;
    default: canonical = compact(raw); // manual/generic: schon kanonische Keys
  }
  const dayKey = resolveDayKey(raw, canonical.sleepEnd ?? canonical.sleepStart);
  const recordedAt = toEpochMs(pick(raw, "recordedAt", "recorded_at", "timestamp", "updated_at")) ?? canonical.sleepEnd;
  return { dayKey, source: src, canonical, cols: coerceDaily(canonical), recordedAt, raw };
}

// Intraday-Samples einer Quelle vereinheitlichen → [{ source, metric, t, value, unit }].
// Akzeptiert [{metric,t,value,unit}] oder {metric:[{t,value}], ...}.
export function normalizeSamples(source, input) {
  const src = normalizeSource(source);
  const out = [];
  const push = (metric, t, value, unit) => {
    const ts = toEpochMs(t);
    const v = Number(value);
    if (ts == null || !Number.isFinite(v)) return;
    out.push({ source: src, metric: String(metric), t: ts, value: v, unit: unit ? String(unit) : null });
  };
  if (Array.isArray(input)) {
    for (const s of input) push(s.metric ?? s.type, s.t ?? s.time ?? s.timestamp, s.value ?? s.v, s.unit);
  } else if (input && typeof input === "object") {
    for (const [metric, series] of Object.entries(input)) {
      if (!Array.isArray(series)) continue;
      for (const s of series) push(metric, s.t ?? s.time ?? s.timestamp, s.value ?? s.v, s.unit);
    }
  }
  return out;
}
