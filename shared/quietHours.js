// Reine Ruhezeiten-/DND-Logik. Kein Side-Effect. Fenster in Minuten-ab-Mitternacht,
// mit Übernacht-Umschlag (start > end = z. B. 22:00–07:00). Wird server-seitig
// zum Unterdrücken von Push genutzt und client-seitig für den „Ruhe aktiv"-Hinweis.

// "HH:MM" → Minuten ab Mitternacht, oder null.
export function clockToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// Minuten ab Mitternacht → "HH:MM".
export function minutesToClock(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// Liegt die Minute im Ruhefenster [startMin, endMin)? Übernacht-Umschlag unterstützt.
export function isQuietTime(minuteOfDay, { enabled = false, startMin = null, endMin = null } = {}) {
  if (!enabled) return false;
  if (startMin == null || endMin == null || startMin === endMin) return false;
  const m = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  if (startMin < endMin) return m >= startMin && m < endMin;   // gleicher Tag
  return m >= startMin || m < endMin;                          // über Mitternacht
}
