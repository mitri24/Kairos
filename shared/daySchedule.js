// Reine Tagesplan-/Zeitstrahl-Logik. Kein DOM, kein Storage, kein Side-Effect.
// Läuft unverändert in PWA (web/), Chrome-Extension (src/) und Node-Tests.
//
// Konvention: "Minuten ab lokaler Mitternacht" (min-of-day), 0..1439.
// Ein Todo/Task auf dem Zeitstrahl hat { startMin, durationMin }.

// ── Tagesfenster (Minuten ab Mitternacht) ────────
export const DAY_START_MIN = 6 * 60;    // 06:00 – oberes Ende des Zeitstrahls
export const DAY_END_MIN = 24 * 60;     // 24:00 – unteres Ende
export const SLOT_STEP_MIN = 5;         // Raster für Drag & freie Slots
export const DEFAULT_DURATION_MIN = 25; // Fallback-Dauer eines Todos

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}
function pad2(n) {
  return String(n).padStart(2, "0");
}

// ── Uhrzeit ↔ Minuten ────────────────────────────
// Minuten ab Mitternacht → "HH:MM" (auf den Tag normalisiert).
export function minToClock(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

// "HH:MM" → Minuten ab Mitternacht, oder null bei ungültiger Eingabe.
export function clockToMin(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

// epoch ms → aktuelle Minute-ab-Mitternacht (mit Sekunden-Bruchteil für die Now-Linie).
export function nowMinOfDay(epochMs) {
  const d = new Date(epochMs);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

// ── Raster ───────────────────────────────────────
export function roundToStep(min, step = SLOT_STEP_MIN) {
  return Math.round(min / step) * step;
}
export function ceilToStep(min, step = SLOT_STEP_MIN) {
  return Math.ceil(min / step) * step;
}

// ── Position auf dem Zeitstrahl ──────────────────
// Anteil 0..1 von oben; für CSS top:% eines vertikalen Zeitstrahls.
export function fractionOfDay(min, startMin = DAY_START_MIN, endMin = DAY_END_MIN) {
  return clamp((min - startMin) / (endMin - startMin), 0, 1);
}

// ── Zeitstatus eines Slots relativ zu now (min-of-day) ──
// "future"  – liegt noch vor uns
// "now"     – läuft gerade (now im Intervall [start, end))
// "past"    – Ende bereits verstrichen
export function slotStatus(item, nowMin) {
  const start = item.startMin;
  const end = item.startMin + Math.max(1, item.durationMin || DEFAULT_DURATION_MIN);
  if (nowMin >= end) return "past";
  if (nowMin >= start) return "now";
  return "future";
}

// Offen (nicht erledigt) und Ende in der Vergangenheit → sollte nachgefragt werden.
export function isOverdue(item, nowMin) {
  return !item.done && slotStatus(item, nowMin) === "past";
}

// ── Freien Slot finden ───────────────────────────
// Früheste Startminute >= `from`, an der `durationMin` in keine der belegten
// Intervalle fällt. `occupied` = Array<{startMin, durationMin}> OHNE das zu
// platzierende Item. Fällt der Slot aus dem Tagesfenster, wird trotzdem die
// Startminute hinter dem letzten Block zurückgegeben (nichts geht verloren).
export function nextFreeSlot(occupied, durationMin, from, options = {}) {
  const step = options.step ?? SLOT_STEP_MIN;
  const dayEnd = options.dayEnd ?? DAY_END_MIN;
  const d = Math.max(step, Math.round(durationMin || DEFAULT_DURATION_MIN));

  const busy = (occupied || [])
    .filter((o) => o && Number.isFinite(o.startMin))
    .map((o) => [o.startMin, o.startMin + Math.max(1, o.durationMin || DEFAULT_DURATION_MIN)])
    .sort((a, b) => a[0] - b[0]);

  let cursor = ceilToStep(Math.max(0, from), step);
  for (const [bs, be] of busy) {
    if (be <= cursor) continue;         // Block liegt komplett vor dem Cursor
    if (bs - cursor >= d) return cursor; // Lücke davor passt
    cursor = ceilToStep(Math.max(cursor, be), step); // hinter den Block springen
  }
  return cursor; // hinter allen Blöcken (ggf. jenseits dayEnd – bewusst)
}

// Überschneiden sich zwei Slots? (Halb-offen: [start, end))
export function slotsOverlap(a, b) {
  const ae = a.startMin + Math.max(1, a.durationMin || DEFAULT_DURATION_MIN);
  const be = b.startMin + Math.max(1, b.durationMin || DEFAULT_DURATION_MIN);
  return a.startMin < be && b.startMin < ae;
}
