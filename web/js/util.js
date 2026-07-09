// Formatierungs- & Label-Helfer, geteilt von allen Feature-Modulen.
export { formatMs, formatDurationHM, PHASES, STATUS, phaseLabelJa, phaseLabelDe } from "/shared/pomodoro.js";
// Tages-Zeitstrahl-Helfer durchreichen, damit Feature-Module nur "/js/util.js" kennen.
export {
  minToClock, clockToMin, nowMinOfDay, fractionOfDay, slotStatus, isOverdue,
  nextFreeSlot, roundToStep, ceilToStep, DAY_START_MIN, DAY_END_MIN, SLOT_STEP_MIN,
} from "/shared/daySchedule.js";

export function pad2(n) { return String(n).padStart(2, "0"); }

// HH:MM aus einem epoch-ms-Zeitpunkt (lokale Uhrzeit, ohne Sekunden).
export function formatClock(epochMs) {
  const d = new Date(epochMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDate(epochMs) {
  return new Date(epochMs).toLocaleDateString("en-GB", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

export function formatDateShort(epochMs) {
  return new Date(epochMs).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "2-digit" });
}

// Stunden mit einer Nachkommastelle: 2.5 h
export function formatHours(ms) {
  return (ms / 3_600_000).toFixed(1);
}

// Minutes → "1h 25m" / "25m"
export function formatMinutes(mins) {
  mins = Math.max(0, Math.round(mins));
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Rest bis zu einem Zeitpunkt als H:MM (ohne Sekunden — "nur h und min").
export function hmsUntil(targetMs, nowMs) {
  const diff = Math.max(0, targetMs - nowMs);
  const totalMin = Math.floor(diff / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${pad2(m)}`;
}

// Ganze Tage bis zu einem Datum.
export function daysUntil(targetMs, nowMs) {
  return Math.max(0, Math.ceil((targetMs - nowMs) / 86_400_000));
}

// Priorität → Label (P1 dringend … P4)
export function priorityLabel(p) {
  return { 1: "P1 · Urgent", 2: "P2", 3: "P3", 4: "P4 · Later" }[p] || "P2";
}
export function priorityClass(p) {
  return `chip--prio${Math.min(4, Math.max(1, p || 2))}`;
}

// Fälligkeits-Label relativ zu jetzt.
export function dueLabel(dueMs, nowMs) {
  if (!dueMs) return null;
  const days = Math.ceil((dueMs - nowMs) / 86_400_000);
  if (days < 0) return { text: "overdue", soon: true };
  if (days === 0) return { text: "due today", soon: true };
  if (days === 1) return { text: "tomorrow", soon: true };
  return { text: `in ${days} d`, soon: days <= 2 };
}

// ── Tages-Schlüssel (YYYY-MM-DD, lokal) für die Tagesplanung ──
export function dayKeyOf(epochMs) {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function keyToMs(key) {
  if (!key) return null;
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}
export function addDaysKey(key, days) {
  const ms = keyToMs(key);
  return ms == null ? key : dayKeyOf(ms + days * 86_400_000);
}
export function formatDayShort(key) {
  const ms = keyToMs(key);
  return ms == null ? "" : new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "2-digit" });
}
export function weekdayName(key) {
  const ms = keyToMs(key);
  return ms == null ? "" : new Date(ms).toLocaleDateString("en-GB", { weekday: "long" });
}
// Montag der Woche, in der `key` liegt.
export function mondayOf(key) {
  const ms = keyToMs(key);
  if (ms == null) return key;
  const d = new Date(ms);
  const dow = (d.getDay() + 6) % 7;     // Mo=0 … So=6
  return dayKeyOf(ms - dow * 86_400_000);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] // keep entity map
  ));
}

// Für <input type="datetime-local"> — lokale ISO ohne Zeitzone.
export function toDatetimeLocal(epochMs) {
  if (!epochMs) return "";
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function fromDatetimeLocal(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}
