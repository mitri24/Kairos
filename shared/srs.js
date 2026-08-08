// Spaced-Repetition-Scheduler (SM-2-light) für den aktiven Abruf im Journal.
// Reine Funktionen (PWA + Server + Tests teilen exakt dieselbe Logik).
//
// Bewertung nach dem Abruf:  0 = weg · 1 = schwer · 2 = gut · 3 = leicht
// Der Rhythmus folgt der Vergessenskurve (Ebbinghaus): kurze Abstände am Anfang,
// wachsend mit jedem gelungenen Abruf; ein Aussetzer setzt das Intervall zurück,
// merkt sich aber die Schwierigkeit (ease sinkt).
import { addDaysKey } from "./dateKey.js";

export const GRADES = [
  { value: 0, de: "Weg", en: "Gone" },
  { value: 1, de: "Schwer", en: "Hard" },
  { value: 2, de: "Gut", en: "Good" },
  { value: 3, de: "Leicht", en: "Easy" },
];

const EASE_MIN = 1.3;
const EASE_MAX = 2.8;
const INTERVAL_MAX_DAYS = 365;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Startzustand einer neuen Karte/eines neuen Themas.
export function initialReview() {
  return { intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 };
}

// Zustand nach einer Abruf-Bewertung. Gibt NUR den neuen Scheduling-Zustand
// zurück (Persistenz + due-Datum macht der Aufrufer über nextDueKey).
export function gradeReview(review, grade) {
  const g = clamp(Math.round(Number(grade) || 0), 0, 3);
  let { intervalDays = 0, ease = 2.5, reps = 0, lapses = 0 } = review || {};

  if (g === 0) {
    // Vergessen: von vorn, aber mit gesenkter Leichtigkeit (Karte bleibt "teuer").
    return {
      intervalDays: 1,
      ease: clamp(ease - 0.2, EASE_MIN, EASE_MAX),
      reps: 0,
      lapses: (lapses || 0) + 1,
    };
  }

  ease = clamp(ease + [0, -0.15, 0, 0.15][g], EASE_MIN, EASE_MAX);
  reps += 1;
  if (reps === 1) intervalDays = 1;
  else if (reps === 2) intervalDays = g === 1 ? 2 : 3;
  else intervalDays = Math.round(intervalDays * (g === 1 ? 1.2 : ease));
  intervalDays = clamp(intervalDays, 1, INTERVAL_MAX_DAYS);

  return { intervalDays, ease, reps, lapses };
}

// Fälligkeits-Schlüssel (YYYY-MM-DD) aus "heute" + Intervall.
export function nextDueKey(todayKey, intervalDays) {
  return addDaysKey(todayKey, Math.max(1, Math.round(intervalDays || 1)));
}

// Fällig heute? (dueKey ≤ todayKey — Vergangenes bleibt fällig.)
export function isDue(dueKey, todayKey) {
  return typeof dueKey === "string" && typeof todayKey === "string" && dueKey <= todayKey;
}

// Menschlich lesbare Vorschau: "morgen wieder", "in 6 Tagen wieder".
export function intervalLabel(intervalDays, lang = "de") {
  const d = Math.max(1, Math.round(intervalDays || 1));
  if (lang === "de") return d === 1 ? "morgen wieder" : `in ${d} Tagen wieder`;
  return d === 1 ? "again tomorrow" : `again in ${d} days`;
}
