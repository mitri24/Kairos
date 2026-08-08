// Reiner iCalendar-Generator (RFC 5545), zero-dep. Kein DOM/Storage.
// Zeiten als „floating local" (ohne Z/TZID) — Lernblöcke sollen zur selben
// Wanduhrzeit gelten, egal in welcher Zeitzone der Kalender geöffnet wird.
// Die Aufrufer (Client: Browser-Ortszeit · Server: Profil-Zeitzone) berechnen
// die Wanduhr-Bestandteile; dieses Modul assembliert nur + escaped + faltet.

function pad2(n) { return String(n).padStart(2, "0"); }

// { y, mo, d, h, mi, s? } → "YYYYMMDDTHHMMSS" (floating local).
export function formatIcsLocal({ y, mo, d, h = 0, mi = 0, s = 0 }) {
  return `${y}${pad2(mo)}${pad2(d)}T${pad2(h)}${pad2(mi)}${pad2(s)}`;
}

// { y, mo, d } → "YYYYMMDD" (all-day DATE).
export function formatIcsDate({ y, mo, d }) {
  return `${y}${pad2(mo)}${pad2(d)}`;
}

// epoch ms → "YYYYMMDDTHHMMSSZ" (UTC — für DTSTAMP/Erstellzeit).
export function formatIcsUtc(epochMs) {
  const dt = new Date(epochMs);
  return `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}T` +
    `${pad2(dt.getUTCHours())}${pad2(dt.getUTCMinutes())}${pad2(dt.getUTCSeconds())}Z`;
}

// Text nach RFC 5545 escapen (Backslash, Komma, Semikolon, Zeilenumbruch).
export function escapeIcsText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// Zeilen auf 75 Oktett falten (Fortsetzung mit führendem Leerzeichen).
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length) { parts.push(" " + rest.slice(0, 74)); rest = rest.slice(74); }
  return parts.join("\r\n");
}

// events: [{ uid, summary, description?, location?, dtStart, dtEnd?, allDay? }]
// dtStart/dtEnd sind bereits formatierte Strings (formatIcsLocal/Date).
export function buildCalendar({ prodId = "-//Kairos//Study Planner//EN", calName = "Kairos", events = [], dtStamp } = {}) {
  const stamp = dtStamp || formatIcsUtc(0);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
  ];
  for (const ev of events) {
    if (!ev || !ev.uid || !ev.dtStart) continue;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${ev.dtStart}`);
      if (ev.dtEnd) lines.push(`DTEND;VALUE=DATE:${ev.dtEnd}`);
    } else {
      lines.push(`DTSTART:${ev.dtStart}`);
      if (ev.dtEnd) lines.push(`DTEND:${ev.dtEnd}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(ev.summary || "Study block")}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
