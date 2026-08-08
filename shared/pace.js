// Reines Lern-Tempo ("Pace"): Wie lange braucht DIESER Nutzer wirklich für
// Aufgaben einer Schwierigkeit? Kein DOM, kein Storage, kein Side-Effect.
//
// Datenbasis: erledigte Aufgaben mit Soll (estMinutes) und Ist (spentMs).
// Je Schwierigkeitsstufe wird ein exponentiell geglätteter Faktor Ist/Soll
// gelernt (jüngere Aufgaben zählen mehr) plus eine geglättete Ist-Dauer für
// Vorschläge ohne Nutzer-Schätzung. Cold-Start: neutrale Baselines.

export const DIFFICULTY_BASELINE_MIN = { 1: 20, 2: 35, 3: 60 };
export const DIFFICULTY_LEVELS = [1, 2, 3];

const EMA_ALPHA = 0.3;        // Glättung: 0.3 → letzte ~5 Aufgaben dominieren
const RATIO_MIN = 0.25;       // Ausreißer-Kappung einzelner Ist/Soll-Verhältnisse
const RATIO_MAX = 4;
const FACTOR_MIN = 0.5;       // Plan-Faktor bleibt in vernünftigen Grenzen
const FACTOR_MAX = 3;
const FULL_WEIGHT_N = 5;      // ab 5 Stichproben zählt der Stufen-Faktor voll

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function ema(prev, x) {
  return prev == null ? x : prev + EMA_ALPHA * (x - prev);
}
function round5(min) {
  return Math.max(5, Math.round(min / 5) * 5);
}

// Schwierigkeit auf 1..3 normalisieren (unbekannt → mittel).
export function normDifficulty(d) {
  const n = Math.round(Number(d));
  return n >= 1 && n <= 3 ? n : 2;
}

// ── Pace aus erledigten Aufgaben lernen ──────────
// tasks: beliebige Task-Liste; gewertet werden nur erledigte mit doneAt,
// estMinutes > 0 und spentMs > 0 (chronologisch nach Abschluss).
export function computePace(tasks) {
  const done = (tasks || [])
    .filter((t) => t && t.done && t.doneAt && Number(t.estMinutes) > 0 && Number(t.spentMs) > 0)
    .sort((a, b) => a.doneAt - b.doneAt);

  const overall = { factor: null, n: 0 };
  const byDifficulty = {};

  for (const t of done) {
    const actualMin = t.spentMs / 60000;
    const ratio = clamp(actualMin / t.estMinutes, RATIO_MIN, RATIO_MAX);
    const d = normDifficulty(t.difficulty);
    const b = byDifficulty[d] || (byDifficulty[d] = { factor: null, avgActualMin: null, n: 0 });
    b.factor = ema(b.factor, ratio);
    b.avgActualMin = ema(b.avgActualMin, actualMin);
    b.n++;
    overall.factor = ema(overall.factor, ratio);
    overall.n++;
  }
  return { overall, byDifficulty };
}

// ── Plan-Faktor einer Schwierigkeit ──────────────
// Wenig Stichproben in der Stufe → Mischung mit dem Gesamt-Faktor; ganz ohne
// Historie → 1 (neutral). Immer auf [0.5, 3] gekappt.
export function planFactor(pace, difficulty) {
  const d = normDifficulty(difficulty);
  const overall = pace?.overall?.n ? clamp(pace.overall.factor, FACTOR_MIN, FACTOR_MAX) : 1;
  const b = pace?.byDifficulty?.[d];
  if (!b || !b.n) return Math.round(overall * 100) / 100;
  const w = Math.min(b.n, FULL_WEIGHT_N) / FULL_WEIGHT_N;
  const mixed = w * b.factor + (1 - w) * overall;
  return Math.round(clamp(mixed, FACTOR_MIN, FACTOR_MAX) * 100) / 100;
}

// ── Vorschlag ohne Nutzer-Schätzung ──────────────
// Ab 3 Stichproben: geglättete Ist-Dauer der Stufe; sonst Baseline.
export function suggestEstimate(pace, difficulty) {
  const d = normDifficulty(difficulty);
  const b = pace?.byDifficulty?.[d];
  if (b && b.n >= 3) {
    return { minutes: round5(clamp(b.avgActualMin, 10, 480)), basis: "history", n: b.n };
  }
  return { minutes: DIFFICULTY_BASELINE_MIN[d], basis: "baseline", n: b?.n || 0 };
}

// ── Plan-Dauer einer Aufgabe ─────────────────────
// Nutzer-Schätzung × gelernter Faktor (der Plan rechnet mit der Realität,
// die gespeicherte Schätzung bleibt unangetastet). Ohne Schätzung → Vorschlag.
export function planMinutes(pace, difficulty, estMinutes) {
  const est = Number(estMinutes);
  if (est > 0) return round5(clamp(est * planFactor(pace, difficulty), 5, 480));
  return suggestEstimate(pace, difficulty).minutes;
}
