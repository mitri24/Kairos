// Kanonische Tages-Health-Felder — die *Single Source of Truth* für
// Schema-Spalten, Bereichsvalidierung (Clamping) und die Geräte-Normalisierung.
//
// Jede Zeile beschreibt ein Feld genau einmal:
//   key   – JSON/JS-Name (camelCase), so kommt es rein und geht es raus
//   col   – SQLite-Spalte (snake_case) in health_daily
//   unit  – Einheit (nur Doku/Transparenz)
//   kind  – "int" | "num" | "ts" (Epoch-ms) → bestimmt Coercion
//   min/max – plausibler Bereich; Ausreißer werden geklemmt statt abgelehnt
//
// Neues Feld ⇒ NUR hier ergänzen und die Spalte in schema.sql anlegen. repo.js
// und normalize.js leiten Spaltenliste, Upsert-SQL und Mapping automatisch ab.

import { toInt, toNum } from "../lib/util.js";

export const DAILY_FIELDS = [
  // ── Schlaf ────────────────────────────────────────────────
  { key: "sleepStart",      col: "sleep_start",       unit: "epoch_ms", kind: "ts" },
  { key: "sleepEnd",        col: "sleep_end",         unit: "epoch_ms", kind: "ts" },
  { key: "sleepTotalMin",   col: "sleep_total_min",   unit: "min",   kind: "int", min: 0,   max: 1440 },
  { key: "sleepDeepMin",    col: "sleep_deep_min",    unit: "min",   kind: "int", min: 0,   max: 1440 },
  { key: "sleepRemMin",     col: "sleep_rem_min",     unit: "min",   kind: "int", min: 0,   max: 1440 },
  { key: "sleepLightMin",   col: "sleep_light_min",   unit: "min",   kind: "int", min: 0,   max: 1440 },
  { key: "sleepAwakeMin",   col: "sleep_awake_min",   unit: "min",   kind: "int", min: 0,   max: 1440 },
  { key: "sleepEfficiency", col: "sleep_efficiency",  unit: "%",     kind: "num", min: 0,   max: 100 },
  { key: "sleepScore",      col: "sleep_score",       unit: "0..100",kind: "int", min: 0,   max: 100 },
  // ── Herz / Atmung / Sauerstoff / Temperatur ───────────────
  { key: "restingHr",       col: "resting_hr",        unit: "bpm",   kind: "num", min: 20,  max: 220 },
  { key: "avgHr",           col: "avg_hr",            unit: "bpm",   kind: "num", min: 20,  max: 220 },
  { key: "minHr",           col: "min_hr",            unit: "bpm",   kind: "num", min: 20,  max: 220 },
  { key: "maxHr",           col: "max_hr",            unit: "bpm",   kind: "num", min: 20,  max: 240 },
  { key: "hrvMs",           col: "hrv_ms",            unit: "ms",    kind: "num", min: 0,   max: 400 },
  { key: "respiratoryRate", col: "respiratory_rate",  unit: "brpm",  kind: "num", min: 3,   max: 40 },
  { key: "spo2Avg",         col: "spo2_avg",          unit: "%",     kind: "num", min: 50,  max: 100 },
  { key: "spo2Min",         col: "spo2_min",          unit: "%",     kind: "num", min: 50,  max: 100 },
  { key: "skinTempC",       col: "skin_temp_c",       unit: "°C",    kind: "num", min: 20,  max: 45 },
  { key: "skinTempDeltaC",  col: "skin_temp_delta_c", unit: "°C",    kind: "num", min: -10, max: 10 },
  // ── Aktivität ─────────────────────────────────────────────
  { key: "steps",           col: "steps",             unit: "count", kind: "int", min: 0,   max: 200000 },
  { key: "activeCalories",  col: "active_calories",   unit: "kcal",  kind: "num", min: 0,   max: 20000 },
  { key: "totalCalories",   col: "total_calories",    unit: "kcal",  kind: "num", min: 0,   max: 20000 },
  { key: "activityMin",     col: "activity_min",      unit: "min",   kind: "int", min: 0,   max: 1440 },
  { key: "distanceM",       col: "distance_m",        unit: "m",     kind: "num", min: 0,   max: 500000 },
  // ── Zusammenfassende Scores ───────────────────────────────
  { key: "recoveryScore",   col: "recovery_score",    unit: "0..100",kind: "int", min: 0,   max: 100 }, // WHOOP Recovery
  { key: "strainScore",     col: "strain_score",      unit: "0..21", kind: "num", min: 0,   max: 21 },  // WHOOP Strain
  { key: "stressAvg",       col: "stress_avg",        unit: "0..100",kind: "num", min: 0,   max: 100 }, // RingConn Stress
  { key: "readiness",       col: "readiness",         unit: "0..100",kind: "int", min: 0,   max: 100 }, // kanonische Tagesbereitschaft
];

export const DAILY_COLS = DAILY_FIELDS.map((f) => f.col);
export const DAILY_KEYS = DAILY_FIELDS.map((f) => f.key);

const clamp = (n, lo, hi) => Math.min(hi ?? Infinity, Math.max(lo ?? -Infinity, n));

// Ein einzelnes Feld in seinen Zieltyp zwingen und (falls gesetzt) in den
// plausiblen Bereich klemmen. Ungültige/leere Werte → null (Spalte bleibt leer).
export function coerceField(field, value) {
  const raw = field.kind === "int" || field.kind === "ts" ? toInt(value, null) : toNum(value, null);
  if (raw === null) return null;
  return clamp(raw, field.min, field.max);
}

// Beliebiges (schon kanonisches) Objekt → { col: value } nur mit bekannten,
// gültigen Feldern. Unbekannte Keys werden ignoriert (landen ggf. in raw_json).
export function coerceDaily(canonical = {}) {
  const out = {};
  for (const f of DAILY_FIELDS) {
    if (canonical[f.key] === undefined || canonical[f.key] === null) continue;
    const v = coerceField(f, canonical[f.key]);
    if (v !== null) out[f.col] = v;
  }
  return out;
}
