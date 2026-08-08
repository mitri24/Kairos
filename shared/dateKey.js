// Reine Tages-Schlüssel-Mathematik (YYYY-MM-DD, lokaler Kalender). Kein DOM,
// kein Date.now(), kein Side-Effect — deterministisch gegeben ein Schlüssel.
// Geteilt von PWA, Extension, Node-Backend und Tests (Recurrence/Streak/ICS).

export function keyToParts(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || "").trim());
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

function pad2(n) { return String(n).padStart(2, "0"); }

export function partsToKey({ y, mo, d }) {
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

// Kalendertage addieren (auch negativ). DST-sicher, weil setDate rein kalendarisch rechnet.
export function addDaysKey(key, days) {
  const p = keyToParts(key);
  if (!p) return key;
  const dt = new Date(p.y, p.mo - 1, p.d);
  dt.setDate(dt.getDate() + Math.round(days));
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

// Wochentag: 0=So … 6=Sa (wie Date.getDay).
export function weekdayOfKey(key) {
  const p = keyToParts(key);
  if (!p) return null;
  return new Date(p.y, p.mo - 1, p.d).getDay();
}

// Ist der Wochentag Mo–Fr?
export function isWeekdayKey(key) {
  const w = weekdayOfKey(key);
  return w != null && w >= 1 && w <= 5;
}

// Ganze Tage zwischen zwei Schlüsseln (b - a), kalendarisch.
export function daysBetweenKeys(a, b) {
  const pa = keyToParts(a);
  const pb = keyToParts(b);
  if (!pa || !pb) return null;
  const ta = Date.UTC(pa.y, pa.mo - 1, pa.d);
  const tb = Date.UTC(pb.y, pb.mo - 1, pb.d);
  return Math.round((tb - ta) / 86_400_000);
}
