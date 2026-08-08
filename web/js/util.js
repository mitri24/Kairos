// Formatierungs- & Label-Helfer, geteilt von allen Feature-Modulen.
import { icon } from "/js/icons.js";
export { formatDurationHM, PHASES, STATUS, phaseLabelJa, phaseLabelDe } from "/shared/pomodoro.js";
// Tages-Zeitstrahl-Helfer durchreichen, damit Feature-Module nur "/js/util.js" kennen.
export {
  minToClock, clockToMin, nowMinOfDay, fractionOfDay, slotStatus, isOverdue,
  nextFreeSlot, rescheduleWithinDay, roundToStep, ceilToStep, DAY_START_MIN, DAY_END_MIN, SLOT_STEP_MIN,
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

// ── Fach-Farben ───────────────────────────────────────────
// Deterministische Zuordnung Fachname → eine von 6 Sage-Paletten-Farben.
// Nutzung: Element bekommt class `subj-N` (CSS setzt --sc/--sc-ink/--sc-tint);
// wo Inline-Farbe nötig ist (absolut positionierte Blöcke), liefern .color/.ink/.tint.
const SUBJECT_COLORS = [
  { color: "#3E7D5E", ink: "#2F6349", tint: "#EBF1EC" },
  { color: "#C89A4C", ink: "#8A6D3B", tint: "#F6EFDF" },
  { color: "#7C9AC2", ink: "#4A678C", tint: "#E8EEF5" },
  { color: "#C98AA6", ink: "#B06A8A", tint: "#F5E6EE" },
  { color: "#C2603F", ink: "#A24E32", tint: "#F5E3DB" },
  { color: "#8A7CC2", ink: "#5E4F8C", tint: "#ECE8F5" },
];
export function subjectColor(name) {
  const s = String(name || "").trim().toLowerCase();
  if (!s) return { idx: -1, cls: "subj-none", color: "#C4C7BE", ink: "#93978B", tint: "#F3F1EA" };
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const idx = h % SUBJECT_COLORS.length;
  return { idx, cls: `subj-${idx}`, ...SUBJECT_COLORS[idx] };
}

// Datumsteile für Kopfzeilen: Wochentag + „9 July 2026".
export function weekdayLong(epochMs) {
  return new Date(epochMs).toLocaleDateString("en-GB", { weekday: "long" });
}
export function dateLong(epochMs) {
  return new Date(epochMs).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
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

// ── Lern-Ressourcen-Helfer (geteilt: topics, tasks, session — der Hand-off) ──
// Icons aus /js/icons.js (einmal gebaut, danach nur noch der String) — dieselben
// Zeichnungen wie überall sonst; die Größe setzt weiterhin das CSS der Aufrufer.
const RES_ICON_LINK = icon("link");
const RES_ICON_PLAY = icon("play");
const RES_ICON_DOC = icon("doc");

// Nur http(s) zulassen (kein javascript:/data: → sicher als href). https:// wird ergänzt.
export function safeUrl(raw) {
  const u = String(raw || "").trim();
  if (!u) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`;
  try {
    const p = new URL(withScheme);
    return (p.protocol === "http:" || p.protocol === "https:") ? p.href : null;
  } catch { return null; }
}
export function prettyUrl(url) {
  try { const u = new URL(url); return (u.hostname + u.pathname).replace(/^www\./, "").replace(/\/$/, ""); }
  catch { return String(url || ""); }
}
export function resourceIcon(res) {
  const s = `${res.kind || ""} ${res.url || ""} ${res.title || ""}`.toLowerCase();
  if (/notebooklm|audio|podcast|youtu|video|vimeo/.test(s)) return RES_ICON_PLAY;
  if (/\.pdf|slides|folien|drive|notion|doc|report|skript|exam|klausur/.test(s)) return RES_ICON_DOC;
  return RES_ICON_LINK;
}
