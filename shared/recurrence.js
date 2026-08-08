// Reine Wiederholungs-Logik für Aufgaben. Kein DOM/Storage/Side-Effect.
// Rule-Format (kompakt, menschenlesbar, in tasks.recurrence gespeichert):
//   ""|null      → keine Wiederholung
//   "daily"      → jeden Tag
//   "weekdays"   → Mo–Fr
//   "weekly"     → alle 7 Tage (gleicher Wochentag)
//   "every:N"    → alle N Tage (N ≥ 1)
// Beim Abhaken einer wiederkehrenden Aufgabe legt das Backend die nächste Instanz
// an (nextOccurrenceKey). Reine Kalender-Mathematik über shared/dateKey.js.
import { addDaysKey, isWeekdayKey } from "./dateKey.js";

export const RECURRENCE_VALUES = ["", "daily", "weekdays", "weekly"];

// Rohwert → { kind, n } oder null (keine Wiederholung / ungültig).
export function parseRecurrence(rule) {
  const s = String(rule || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "daily") return { kind: "daily", n: 1 };
  if (s === "weekdays") return { kind: "weekdays", n: 1 };
  if (s === "weekly") return { kind: "weekly", n: 7 };
  const m = /^every:(\d{1,3})$/.exec(s);
  if (m) {
    const n = Math.max(1, Math.min(365, Number(m[1])));
    return { kind: "every", n };
  }
  return null;
}

// Normalisiert einen Rohwert auf die kanonische Speicherform (oder "" wenn keine).
export function normalizeRecurrence(rule) {
  const parsed = parseRecurrence(rule);
  if (!parsed) return "";
  if (parsed.kind === "daily") return "daily";
  if (parsed.kind === "weekdays") return "weekdays";
  if (parsed.kind === "weekly") return "weekly";
  return `every:${parsed.n}`;
}

export function isRecurring(rule) {
  return parseRecurrence(rule) !== null;
}

// Nächster Tages-Schlüssel (YYYY-MM-DD) NACH fromKey gemäß Regel, oder null.
// „weekdays" überspringt Sa/So. Andere Regeln addieren feste Tagesabstände.
export function nextOccurrenceKey(rule, fromKey) {
  const parsed = parseRecurrence(rule);
  if (!parsed || !fromKey) return null;
  if (parsed.kind === "weekdays") {
    let k = addDaysKey(fromKey, 1);
    for (let i = 0; i < 7 && !isWeekdayKey(k); i++) k = addDaysKey(k, 1);
    return k;
  }
  return addDaysKey(fromKey, parsed.n);
}
