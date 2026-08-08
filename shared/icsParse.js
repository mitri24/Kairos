// Reiner iCalendar-PARSER (RFC 5545) + Serien-Expansion. Kein DOM, kein Storage.
// Gegenstück zum Generator shared/ics.js. Zero-dep; Zeitzonen über Intl (IANA),
// VTIMEZONE-Blöcke werden bewusst ignoriert (TZID → Intl reicht für iCloud/Google).
//
// Unterstützte Wiederholungen: FREQ=DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL,
// COUNT, UNTIL, BYDAY (reine Wochentage, WEEKLY), EXDATE, RECURRENCE-ID-Overrides.
// Exotisches (BYSETPOS, Ordinal-BYDAY, HOURLY …) → Serie liefert nur die erste
// Instanz (ehrlich begrenzt statt falsch expandiert).

// ── Zeilen entfalten & Text entescapen ───────────
export function unfoldIcs(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
}

export function unescapeIcsText(value) {
  return String(value ?? "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// ── Property-Zeile: NAME;P=V;Q="a:b":wert ────────
export function parsePropLine(line) {
  // Doppelpunkt suchen, der NICHT in einem quoted Param-Wert steht.
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ":" && !inQuotes) { colon = i; break; }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segs = [];
  let cur = "";
  inQuotes = false;
  for (const c of head) {
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ";" && !inQuotes) { segs.push(cur); cur = ""; continue; }
    cur += c;
  }
  segs.push(cur);
  const name = segs.shift().trim().toUpperCase();
  const params = {};
  for (const s of segs) {
    const eq = s.indexOf("=");
    if (eq > 0) params[s.slice(0, eq).trim().toUpperCase()] = s.slice(eq + 1).trim();
  }
  return { name, params, value };
}

// ── Wanduhr ↔ Epoch in einer IANA-Zeitzone ───────
// tz null → Server-Lokalzeit (floating). Ungültige TZIDs behandelt der Aufrufer
// vorab über safeTz().
export function safeTz(tzid) {
  if (!tzid) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tzid });
    return tzid;
  } catch {
    return null;
  }
}

export function epochToWall(ms, tz) {
  const d = new Date(ms);
  if (!tz) {
    return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() };
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute"), s: get("second") };
}

export function wallToEpoch(wall, tz) {
  const { y, mo, d, h = 0, mi = 0, s = 0 } = wall;
  if (!tz) return new Date(y, mo - 1, d, h, mi, s).getTime();
  if (tz === "UTC") return Date.UTC(y, mo - 1, d, h, mi, s);
  // Doppelte Iteration: Offset raten, nachjustieren (DST-Kanten).
  let guess = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let i = 0; i < 2; i++) {
    const w = epochToWall(guess, tz);
    const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
    guess += Date.UTC(y, mo - 1, d, h, mi, s) - asUtc;
  }
  return guess;
}

// ── ICS-Zeitwert parsen ──────────────────────────
// → { allDay, wall, tz } — tz ist "UTC", eine gültige IANA-Zone oder null (floating).
function parseIcsTime(value, params, defaultTz) {
  const v = String(value || "").trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (params?.VALUE === "DATE" || dateOnly) {
    const m = dateOnly || /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { allDay: true, wall: { y: +m[1], mo: +m[2], d: +m[3], h: 0, mi: 0, s: 0 }, tz: defaultTz };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const wall = { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6] || 0) };
  if (m[7]) return { allDay: false, wall, tz: "UTC" };
  const tz = safeTz(params?.TZID) || defaultTz;
  return { allDay: false, wall, tz };
}

// ISO-8601-Dauer (PT1H30M, P1D …) → Minuten, oder null.
export function parseIcsDuration(value) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(value || "").trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const min = (+(m[2] || 0)) * 7 * 1440 + (+(m[3] || 0)) * 1440 + (+(m[4] || 0)) * 60 + (+(m[5] || 0)) + Math.round((+(m[6] || 0)) / 60);
  return sign * min;
}

// ── RRULE ────────────────────────────────────────
const BYDAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function parseRRule(str) {
  if (!str) return null;
  const rule = { freq: null, interval: 1, count: null, until: null, byday: null, unsupported: false };
  for (const pair of String(str).trim().split(";")) {
    const [k, v] = pair.split("=");
    if (!k || v === undefined) continue;
    switch (k.toUpperCase()) {
      case "FREQ": rule.freq = v.toUpperCase(); break;
      case "INTERVAL": rule.interval = Math.max(1, parseInt(v, 10) || 1); break;
      case "COUNT": rule.count = Math.max(1, parseInt(v, 10) || 1); break;
      case "UNTIL": rule.until = v; break;                 // roh; Auflösung bei Expansion (braucht tz)
      case "WKST": break;                                   // Wochenstart: Standard MO reicht hier
      case "BYDAY": {
        const days = v.split(",").map((t) => t.trim().toUpperCase());
        if (days.some((t) => !(t in BYDAY_MAP))) { rule.unsupported = true; break; } // Ordinale (1MO, -1SU) nicht unterstützt
        rule.byday = days.map((t) => BYDAY_MAP[t]);
        break;
      }
      case "BYMONTHDAY": case "BYMONTH": case "BYSETPOS": case "BYYEARDAY": case "BYWEEKNO": case "BYHOUR": case "BYMINUTE":
        rule.unsupported = true; break;
      default: break;
    }
  }
  if (!rule.freq) return null;
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(rule.freq)) rule.unsupported = true;
  if (rule.byday && rule.freq !== "WEEKLY") rule.unsupported = true;
  return rule;
}

// ── VEVENTs extrahieren ──────────────────────────
// → Events in DB-nahem Format: { uid, summary, location, status, allDay,
//    startMs, endMs, durationMin, tzid, rrule, exdates: [ms], recurrenceIdMs }
export function parseIcs(text, { defaultTz = null } = {}) {
  const lines = unfoldIcs(text).split("\n");
  const events = [];
  let cur = null;      // rohe Properties des aktuellen VEVENT
  let depth = 0;       // eingebettete Komponenten (VALARM) überspringen

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("BEGIN:")) {
      const comp = line.slice(6).trim().toUpperCase();
      if (cur) { depth++; continue; }                    // z. B. VALARM im VEVENT
      if (comp === "VEVENT") cur = [];
      continue;
    }
    if (line.startsWith("END:")) {
      const comp = line.slice(4).trim().toUpperCase();
      if (cur && depth > 0) { depth--; continue; }
      if (comp === "VEVENT" && cur) {
        const ev = buildEvent(cur, defaultTz);
        if (ev) events.push(ev);
        cur = null;
      }
      continue;
    }
    if (cur && depth === 0) {
      const p = parsePropLine(line);
      if (p) cur.push(p);
    }
  }
  return events;
}

function buildEvent(props, defaultTz) {
  const get = (name) => props.find((p) => p.name === name);
  const dtstart = get("DTSTART");
  if (!dtstart) return null;
  const start = parseIcsTime(dtstart.value, dtstart.params, defaultTz);
  if (!start) return null;

  const startMs = wallToEpoch(start.wall, start.tz);
  let durationMin = null;
  const dtend = get("DTEND");
  const dur = get("DURATION");
  if (dtend) {
    const end = parseIcsTime(dtend.value, dtend.params, start.tz ?? defaultTz);
    if (end) durationMin = Math.round((wallToEpoch(end.wall, end.tz) - startMs) / 60000);
  } else if (dur) {
    durationMin = parseIcsDuration(dur.value);
  }
  if (durationMin == null || durationMin < 0) durationMin = start.allDay ? 1440 : 0;
  if (start.allDay) durationMin = Math.max(1440, Math.round(durationMin / 1440) * 1440);

  // EXDATE (mehrfach, kommaseparierte Werte, eigene TZID möglich)
  const exdates = [];
  for (const p of props.filter((x) => x.name === "EXDATE")) {
    for (const v of p.value.split(",")) {
      const t = parseIcsTime(v, p.params, start.tz ?? defaultTz);
      if (t) exdates.push(wallToEpoch(t.wall, t.tz));
    }
  }

  const recId = get("RECURRENCE-ID");
  const recTime = recId ? parseIcsTime(recId.value, recId.params, start.tz ?? defaultTz) : null;

  return {
    uid: get("UID") ? unescapeIcsText(get("UID").value) : null,
    summary: get("SUMMARY") ? unescapeIcsText(get("SUMMARY").value) : "",
    location: get("LOCATION") ? unescapeIcsText(get("LOCATION").value) : null,
    status: get("STATUS") ? get("STATUS").value.trim().toUpperCase() : null,
    allDay: start.allDay,
    startMs,
    endMs: startMs + durationMin * 60000,
    durationMin,
    tzid: start.tz,
    rrule: get("RRULE") ? get("RRULE").value.trim() : null,
    exdates,
    recurrenceIdMs: recTime ? wallToEpoch(recTime.wall, recTime.tz) : null,
  };
}

// ── Serien-Expansion im Fenster ──────────────────
// events: Format von parseIcs (bzw. DB-Zeilen mit denselben Feldern).
// → chronologische Instanzen [{ uid, summary, location, startMs, endMs, allDay }]
const MAX_STEPS = 3000;             // Schutz gegen degenerierte Regeln

export function expandEvents(events, { fromMs, toMs, maxPerSeries = 500 } = {}) {
  const out = [];
  // Overrides: Master-Instanz mit passender RECURRENCE-ID auslassen.
  const overridden = new Map();     // uid → Set(minute-genauer Startzeitpunkt)
  for (const ev of events) {
    if (ev.recurrenceIdMs != null && ev.uid) {
      if (!overridden.has(ev.uid)) overridden.set(ev.uid, new Set());
      overridden.get(ev.uid).add(minuteKey(ev.recurrenceIdMs));
    }
  }

  for (const ev of events) {
    if (!ev || ev.status === "CANCELLED") continue;
    const durMs = Math.max(0, (ev.durationMin ?? 0) * 60000 || (ev.endMs - ev.startMs) || 0);

    if (!ev.rrule || ev.recurrenceIdMs != null) {
      pushIfOverlaps(out, ev, ev.startMs, ev.startMs + durMs, fromMs, toMs);
      continue;
    }

    const rule = parseRRule(ev.rrule);
    if (!rule || rule.unsupported) {           // ehrlich begrenzt: nur erste Instanz
      pushIfOverlaps(out, ev, ev.startMs, ev.startMs + durMs, fromMs, toMs);
      continue;
    }

    const tz = ev.tzid || null;
    const wall0 = epochToWall(ev.startMs, tz);
    const untilMs = resolveUntil(rule.until, tz);
    const exSet = new Set((ev.exdates || []).map(minuteKey));
    const skip = ev.uid ? overridden.get(ev.uid) : null;

    let produced = 0;   // gezählte Instanzen (für COUNT, inkl. übersprungener EX/Overrides? RFC: EXDATE zählt MIT)
    let emitted = 0;
    let steps = 0;

    for (const wallDate of occurrenceDates(rule, wall0)) {
      if (++steps > MAX_STEPS || emitted >= maxPerSeries) break;
      const startMs = wallToEpoch({ ...wallDate, h: wall0.h, mi: wall0.mi, s: wall0.s }, tz);
      if (startMs < ev.startMs) continue;                       // vor Serienbeginn (BYDAY-Woche)
      produced++;
      if (rule.count != null && produced > rule.count) break;
      if (untilMs != null && startMs > untilMs) break;
      if (startMs >= toMs) break;                               // chronologisch → fertig
      const endMs = startMs + durMs;
      if (exSet.has(minuteKey(startMs)) || (skip && skip.has(minuteKey(startMs)))) continue;
      if (endMs > fromMs) {
        out.push(instanceOf(ev, startMs, endMs));
        emitted++;
      }
    }
  }
  out.sort((a, b) => a.startMs - b.startMs || String(a.uid).localeCompare(String(b.uid)));
  return out;
}

function minuteKey(ms) {
  return Math.floor(ms / 60000);
}
function instanceOf(ev, startMs, endMs) {
  // `calendar` (Herkunft: Name/Farbe/Konto) wird mitgereicht, damit im Zeitstrahl
  // erkennbar bleibt, aus welchem Kalender eine Instanz stammt.
  return {
    uid: ev.uid, summary: ev.summary, location: ev.location ?? null,
    allDay: !!ev.allDay, startMs, endMs, calendar: ev.calendar ?? null,
  };
}
function pushIfOverlaps(out, ev, startMs, endMs, fromMs, toMs) {
  if (endMs > fromMs && startMs < toMs) out.push(instanceOf(ev, startMs, endMs));
}
function resolveUntil(until, tz) {
  if (!until) return null;
  const t = parseIcsTime(until, /Z$/.test(until) ? {} : { VALUE: until.length === 8 ? "DATE" : undefined }, tz);
  if (!t) return null;
  // UNTIL als DATE gilt bis Tagesende.
  const ms = wallToEpoch(t.wall, t.tz);
  return t.allDay ? ms + 1440 * 60000 - 1 : ms;
}

// Generator der Kalender-TAGE einer Regel (Wanduhr-Datumsteile, chronologisch).
function* occurrenceDates(rule, wall0) {
  const base = { y: wall0.y, mo: wall0.mo, d: wall0.d };
  if (rule.freq === "DAILY") {
    for (let i = 0; ; i++) yield addDaysWall(base, i * rule.interval);
  } else if (rule.freq === "WEEKLY") {
    const startDow = dowOfWall(base);
    const byday = (rule.byday && rule.byday.length ? rule.byday : [startDow]);
    // Wochenstart Montag (RFC-Default WKST=MO): Offset des Serienstarts zur Wochenbasis.
    const mondayOffset = (startDow + 6) % 7;
    const weekBase = addDaysWall(base, -mondayOffset);
    const offsets = byday.map((dow) => (dow + 6) % 7).sort((a, b) => a - b);
    for (let w = 0; ; w += rule.interval) {
      for (const off of offsets) yield addDaysWall(weekBase, w * 7 + off);
    }
  } else if (rule.freq === "MONTHLY") {
    for (let i = 0; ; i++) {
      const total = (base.mo - 1) + i * rule.interval;
      const y = base.y + Math.floor(total / 12);
      const mo = (total % 12) + 1;
      if (base.d <= daysInMonth(y, mo)) yield { y, mo, d: base.d };
    }
  } else { // YEARLY
    for (let i = 0; ; i++) {
      const y = base.y + i * rule.interval;
      if (base.d <= daysInMonth(y, base.mo)) yield { y, mo: base.mo, d: base.d };
    }
  }
}

function addDaysWall({ y, mo, d }, days) {
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
function dowOfWall({ y, mo, d }) {
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}
function daysInMonth(y, mo) {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
