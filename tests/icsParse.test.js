// Tests für den iCalendar-Parser + Serien-Expansion (shared/icsParse.js).
import test from "node:test";
import assert from "node:assert/strict";

import {
  unfoldIcs, unescapeIcsText, parsePropLine, parseIcsDuration, parseRRule,
  parseIcs, expandEvents, wallToEpoch, epochToWall, safeTz,
} from "../shared/icsParse.js";

const TZ = "Europe/Zurich";
const wrap = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;

// ── Grundbausteine ───────────────────────────────
test("unfoldIcs entfaltet fortgesetzte Zeilen (CRLF + Space/Tab)", () => {
  assert.equal(unfoldIcs("SUMMARY:Hal\r\n lo\r\n\tWelt"), "SUMMARY:HalloWelt");
});

test("unescapeIcsText löst RFC-Escapes auf", () => {
  assert.equal(unescapeIcsText("a\\, b\\; c\\nZeile\\\\x"), "a, b; c\nZeile\\x");
});

test("parsePropLine: Params, quoted Doppelpunkt im Param", () => {
  const p = parsePropLine('X;TZID="Etc:GMT+2";VALUE=DATE-TIME:20260801T100000');
  assert.equal(p.name, "X");
  assert.equal(p.params.TZID, "Etc:GMT+2");
  assert.equal(p.params.VALUE, "DATE-TIME");
  assert.equal(p.value, "20260801T100000");
});

test("parseIcsDuration: PT1H30M, P1D, negativ", () => {
  assert.equal(parseIcsDuration("PT1H30M"), 90);
  assert.equal(parseIcsDuration("P1D"), 1440);
  assert.equal(parseIcsDuration("-PT15M"), -15);
  assert.equal(parseIcsDuration("quatsch"), null);
});

test("safeTz akzeptiert IANA, verwirft Windows-Namen", () => {
  assert.equal(safeTz("Europe/Zurich"), "Europe/Zurich");
  assert.equal(safeTz("W. Europe Standard Time"), null);
  assert.equal(safeTz(null), null);
});

test("parseRRule: Basis + nicht unterstützte Merkmale markiert", () => {
  assert.deepEqual(parseRRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE").byday, [1, 3]);
  assert.equal(parseRRule("FREQ=WEEKLY;BYDAY=-1SU").unsupported, true);
  assert.equal(parseRRule("FREQ=MONTHLY;BYSETPOS=1").unsupported, true);
  assert.equal(parseRRule("HOPPLA"), null);
});

// ── Zeitzonen-Mathematik ─────────────────────────
test("wallToEpoch/epochToWall: Roundtrip in Zürich, UTC-Anker stimmt", () => {
  // 1. Aug 2026 10:00 Zürich = 08:00Z (Sommerzeit, UTC+2)
  const ms = wallToEpoch({ y: 2026, mo: 8, d: 1, h: 10, mi: 0 }, TZ);
  assert.equal(ms, Date.UTC(2026, 7, 1, 8, 0, 0));
  assert.deepEqual(epochToWall(ms, TZ), { y: 2026, mo: 8, d: 1, h: 10, mi: 0, s: 0 });
  // Winter: 15. Jan 2026 10:00 = 09:00Z (UTC+1)
  assert.equal(wallToEpoch({ y: 2026, mo: 1, d: 15, h: 10, mi: 0 }, TZ), Date.UTC(2026, 0, 15, 9, 0, 0));
});

// ── VEVENT-Parsing ───────────────────────────────
test("parseIcs: getimtes Event mit TZID + DTEND", () => {
  const [ev] = parseIcs(wrap(
    "BEGIN:VEVENT\r\nUID:e1@test\r\nSUMMARY:Vorlesung TI\r\nLOCATION:HS 3\r\n" +
    `DTSTART;TZID=${TZ}:20260803T101500\r\nDTEND;TZID=${TZ}:20260803T114500\r\nEND:VEVENT`
  ));
  assert.equal(ev.uid, "e1@test");
  assert.equal(ev.summary, "Vorlesung TI");
  assert.equal(ev.location, "HS 3");
  assert.equal(ev.allDay, false);
  assert.equal(ev.startMs, wallToEpoch({ y: 2026, mo: 8, d: 3, h: 10, mi: 15 }, TZ));
  assert.equal(ev.durationMin, 90);
  assert.equal(ev.tzid, TZ);
});

test("parseIcs: Ganztages-Event (VALUE=DATE) → 1440 min, allDay", () => {
  const [ev] = parseIcs(wrap(
    "BEGIN:VEVENT\r\nUID:e2@test\r\nSUMMARY:Feiertag\r\n" +
    "DTSTART;VALUE=DATE:20260804\r\nDTEND;VALUE=DATE:20260805\r\nEND:VEVENT"
  ), { defaultTz: TZ });
  assert.equal(ev.allDay, true);
  assert.equal(ev.durationMin, 1440);
  assert.equal(ev.startMs, wallToEpoch({ y: 2026, mo: 8, d: 4, h: 0, mi: 0 }, TZ));
});

test("parseIcs: UTC-Zeit (Z) und DURATION statt DTEND", () => {
  const [ev] = parseIcs(wrap(
    "BEGIN:VEVENT\r\nUID:e3@test\r\nDTSTART:20260803T080000Z\r\nDURATION:PT45M\r\nEND:VEVENT"
  ));
  assert.equal(ev.startMs, Date.UTC(2026, 7, 3, 8, 0, 0));
  assert.equal(ev.durationMin, 45);
  assert.equal(ev.tzid, "UTC");
});

test("parseIcs: VALARM im VEVENT stört nicht, TRIGGER wird nicht zum Event", () => {
  const events = parseIcs(wrap(
    "BEGIN:VEVENT\r\nUID:e4@test\r\nSUMMARY:Mit Alarm\r\nDTSTART:20260803T080000Z\r\n" +
    "BEGIN:VALARM\r\nTRIGGER:-PT10M\r\nACTION:DISPLAY\r\nEND:VALARM\r\nEND:VEVENT"
  ));
  assert.equal(events.length, 1);
  assert.equal(events[0].summary, "Mit Alarm");
});

// ── Expansion ────────────────────────────────────
const win = (fromWall, toWall) => ({
  fromMs: wallToEpoch(fromWall, TZ),
  toMs: wallToEpoch(toWall, TZ),
});

test("expandEvents: WEEKLY BYDAY=MO,WE — Wanduhrzeit bleibt über die DST-Kante", () => {
  // Serienstart Mo 23.3.2026 10:00 Zürich (Winterzeit); DST beginnt So 29.3.2026.
  const [ev] = parseIcs(wrap(
    "BEGIN:VEVENT\r\nUID:s1@test\r\nSUMMARY:Uni\r\n" +
    `DTSTART;TZID=${TZ}:20260323T100000\r\nDTEND;TZID=${TZ}:20260323T113000\r\n` +
    "RRULE:FREQ=WEEKLY;BYDAY=MO,WE\r\nEND:VEVENT"
  ));
  const inst = expandEvents([ev], win({ y: 2026, mo: 3, d: 22 }, { y: 2026, mo: 4, d: 2 }));
  const days = inst.map((i) => epochToWall(i.startMs, TZ)).map((w) => `${w.mo}-${w.d} ${w.h}:${String(w.mi).padStart(2, "0")}`);
  assert.deepEqual(days, ["3-23 10:00", "3-25 10:00", "3-30 10:00", "4-1 10:00"]);
  // Absolut: 23.3. ist UTC+1 (09:00Z), 30.3. ist UTC+2 (08:00Z)
  assert.equal(inst[0].startMs, Date.UTC(2026, 2, 23, 9, 0, 0));
  assert.equal(inst[2].startMs, Date.UTC(2026, 2, 30, 8, 0, 0));
});

test("expandEvents: COUNT zählt auch per EXDATE entfernte Instanzen", () => {
  const [ev] = parseIcs(wrap(
    "BEGIN:VEVENT\r\nUID:s2@test\r\nSUMMARY:Daily\r\n" +
    `DTSTART;TZID=${TZ}:20260803T090000\r\nDTEND;TZID=${TZ}:20260803T093000\r\n` +
    `RRULE:FREQ=DAILY;COUNT=3\r\nEXDATE;TZID=${TZ}:20260804T090000\r\nEND:VEVENT`
  ));
  const inst = expandEvents([ev], win({ y: 2026, mo: 8, d: 1 }, { y: 2026, mo: 8, d: 31 }));
  const days = inst.map((i) => epochToWall(i.startMs, TZ).d);
  assert.deepEqual(days, [3, 5]);                       // 4.8. fehlt, COUNT bleibt 3 (3.–5.)
});

test("expandEvents: UNTIL (DATE) inklusiv bis Tagesende", () => {
  const [ev] = parseIcs(wrap(
    "BEGIN:VEVENT\r\nUID:s3@test\r\nSUMMARY:Bis\r\n" +
    `DTSTART;TZID=${TZ}:20260803T090000\r\nDURATION:PT30M\r\n` +
    "RRULE:FREQ=DAILY;UNTIL=20260805\r\nEND:VEVENT"
  ));
  const inst = expandEvents([ev], win({ y: 2026, mo: 8, d: 1 }, { y: 2026, mo: 8, d: 31 }));
  assert.deepEqual(inst.map((i) => epochToWall(i.startMs, TZ).d), [3, 4, 5]);
});

test("expandEvents: RECURRENCE-ID-Override ersetzt die Master-Instanz", () => {
  const events = parseIcs(wrap(
    "BEGIN:VEVENT\r\nUID:s4@test\r\nSUMMARY:Seminar\r\n" +
    `DTSTART;TZID=${TZ}:20260803T140000\r\nDURATION:PT1H\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEND:VEVENT\r\n` +
    "BEGIN:VEVENT\r\nUID:s4@test\r\nSUMMARY:Seminar (verschoben)\r\n" +
    `RECURRENCE-ID;TZID=${TZ}:20260810T140000\r\n` +
    `DTSTART;TZID=${TZ}:20260811T160000\r\nDURATION:PT1H\r\nEND:VEVENT`
  ));
  const inst = expandEvents(events, win({ y: 2026, mo: 8, d: 1 }, { y: 2026, mo: 8, d: 31 }));
  const labels = inst.map((i) => `${epochToWall(i.startMs, TZ).d}:${i.summary}`);
  assert.deepEqual(labels, ["3:Seminar", "11:Seminar (verschoben)", "17:Seminar"]);
});

test("expandEvents: CANCELLED wird ausgelassen, Fenster clippt Überlapper hinein", () => {
  const events = parseIcs(wrap(
    "BEGIN:VEVENT\r\nUID:c1@test\r\nSTATUS:CANCELLED\r\nDTSTART:20260803T080000Z\r\nDURATION:PT1H\r\nEND:VEVENT\r\n" +
    "BEGIN:VEVENT\r\nUID:c2@test\r\nSUMMARY:Über Mitternacht\r\n" +
    `DTSTART;TZID=${TZ}:20260802T230000\r\nDURATION:PT2H\r\nEND:VEVENT`
  ));
  const inst = expandEvents(events, win({ y: 2026, mo: 8, d: 3 }, { y: 2026, mo: 8, d: 4 }));
  assert.equal(inst.length, 1);                          // cancelled raus; Überlapper drin
  assert.equal(inst[0].uid, "c2@test");
});

test("expandEvents: MONTHLY am 31. überspringt kurze Monate", () => {
  const [ev] = parseIcs(wrap(
    "BEGIN:VEVENT\r\nUID:m1@test\r\nSUMMARY:Monatsende\r\n" +
    `DTSTART;TZID=${TZ}:20260131T120000\r\nDURATION:PT30M\r\nRRULE:FREQ=MONTHLY;COUNT=4\r\nEND:VEVENT`
  ));
  const inst = expandEvents([ev], win({ y: 2026, mo: 1, d: 1 }, { y: 2026, mo: 12, d: 31 }));
  const keys = inst.map((i) => { const w = epochToWall(i.startMs, TZ); return `${w.mo}-${w.d}`; });
  assert.deepEqual(keys, ["1-31", "3-31", "5-31", "7-31"]);   // Feb/Apr/Jun übersprungen
});

test("expandEvents: nicht unterstützte Regel → ehrlich nur erste Instanz", () => {
  const [ev] = parseIcs(wrap(
    "BEGIN:VEVENT\r\nUID:u1@test\r\nSUMMARY:Exotisch\r\n" +
    `DTSTART;TZID=${TZ}:20260803T080000\r\nDURATION:PT30M\r\nRRULE:FREQ=MONTHLY;BYDAY=-1FR\r\nEND:VEVENT`
  ));
  const inst = expandEvents([ev], win({ y: 2026, mo: 8, d: 1 }, { y: 2026, mo: 12, d: 31 }));
  assert.equal(inst.length, 1);
});
