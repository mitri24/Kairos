// Wave-4-Tests: reine shared/-Logik (kein Auth-Kontext / keine DB nötig).
import test from "node:test";
import assert from "node:assert/strict";
import { addDaysKey, weekdayOfKey, isWeekdayKey, daysBetweenKeys } from "../shared/dateKey.js";
import { parseRecurrence, normalizeRecurrence, nextOccurrenceKey, isRecurring } from "../shared/recurrence.js";
import { computeStreak } from "../shared/streak.js";
import { isQuietTime, clockToMinutes, minutesToClock } from "../shared/quietHours.js";
import { buildCalendar, formatIcsUtc, formatIcsLocal, escapeIcsText } from "../shared/ics.js";

// ── dateKey ──────────────────────────────────────
test("dateKey: addDaysKey rechnet über Monats-/Jahresgrenzen", () => {
  assert.equal(addDaysKey("2026-07-10", 1), "2026-07-11");
  assert.equal(addDaysKey("2026-07-31", 1), "2026-08-01");
  assert.equal(addDaysKey("2026-01-01", -1), "2025-12-31");
  assert.equal(addDaysKey("2026-03-01", -1), "2026-02-28");
});
test("dateKey: weekday + daysBetween", () => {
  assert.equal(weekdayOfKey("2026-07-10"), 5);       // Freitag
  assert.equal(isWeekdayKey("2026-07-11"), false);    // Samstag
  assert.equal(isWeekdayKey("2026-07-13"), true);     // Montag
  assert.equal(daysBetweenKeys("2026-07-10", "2026-07-17"), 7);
});

// ── recurrence ───────────────────────────────────
test("recurrence: parse + normalize", () => {
  assert.equal(isRecurring(""), false);
  assert.equal(isRecurring("daily"), true);
  assert.deepEqual(parseRecurrence("weekly"), { kind: "weekly", n: 7 });
  assert.deepEqual(parseRecurrence("every:3"), { kind: "every", n: 3 });
  assert.equal(normalizeRecurrence("EVERY:2"), "every:2");
  assert.equal(normalizeRecurrence("bogus"), "");
});
test("recurrence: nextOccurrenceKey", () => {
  assert.equal(nextOccurrenceKey("daily", "2026-07-10"), "2026-07-11");
  assert.equal(nextOccurrenceKey("weekly", "2026-07-10"), "2026-07-17");
  assert.equal(nextOccurrenceKey("every:3", "2026-07-10"), "2026-07-13");
  // Freitag → weekdays überspringt Sa/So auf Montag.
  assert.equal(nextOccurrenceKey("weekdays", "2026-07-10"), "2026-07-13");
  assert.equal(nextOccurrenceKey("weekdays", "2026-07-13"), "2026-07-14");
  assert.equal(nextOccurrenceKey("", "2026-07-10"), null);
});

// ── streak (Gnadentag) ───────────────────────────
const focus = (...keys) => Object.fromEntries(keys.map((k) => [k, { focusMs: 60000 }]));
test("streak: zusammenhängende Tage", () => {
  const m = focus("2026-07-10", "2026-07-09", "2026-07-08");
  assert.equal(computeStreak(m, "2026-07-10").streak, 3);
});
test("streak: heute noch nicht begonnen bricht NICHT", () => {
  const m = focus("2026-07-09", "2026-07-08");
  const r = computeStreak(m, "2026-07-10");
  assert.equal(r.streak, 2);
  assert.equal(r.graceUsed, 0);
});
test("streak: EIN Fehltag wird per Gnade übersprungen", () => {
  // Lücke am 09., aber 10/08/07 aktiv → Serie überlebt (Gnade verbraucht).
  const m = focus("2026-07-10", "2026-07-08", "2026-07-07");
  const r = computeStreak(m, "2026-07-10");
  assert.equal(r.streak, 3);
  assert.equal(r.graceUsed, 1);
});
test("streak: ZWEI aufeinanderfolgende Fehltage beenden die Serie", () => {
  // 10 aktiv, 09+08 fehlen → Gnade deckt 09, 08 bricht.
  const m = focus("2026-07-10", "2026-07-07", "2026-07-06");
  const r = computeStreak(m, "2026-07-10");
  assert.equal(r.streak, 1);
});
test("streak: gar keine Aktivität → 0", () => {
  assert.equal(computeStreak({}, "2026-07-10").streak, 0);
});

// ── quietHours ───────────────────────────────────
test("quietHours: Übernacht-Fenster 22:00–07:00", () => {
  const win = { enabled: true, startMin: 22 * 60, endMin: 7 * 60 };
  assert.equal(isQuietTime(23 * 60, win), true);   // 23:00 ruhig
  assert.equal(isQuietTime(3 * 60, win), true);    // 03:00 ruhig
  assert.equal(isQuietTime(12 * 60, win), false);  // 12:00 laut
  assert.equal(isQuietTime(7 * 60, win), false);   // exakt Ende → nicht mehr ruhig
  assert.equal(isQuietTime(22 * 60, win), true);   // exakt Start → ruhig
});
test("quietHours: same-day Fenster + disabled", () => {
  const win = { enabled: true, startMin: 13 * 60, endMin: 14 * 60 };
  assert.equal(isQuietTime(13 * 60 + 30, win), true);
  assert.equal(isQuietTime(15 * 60, win), false);
  assert.equal(isQuietTime(13 * 60 + 30, { ...win, enabled: false }), false);
});
test("quietHours: clock <-> minutes", () => {
  assert.equal(clockToMinutes("22:30"), 22 * 60 + 30);
  assert.equal(clockToMinutes("7:05"), 7 * 60 + 5);
  assert.equal(clockToMinutes("bad"), null);
  assert.equal(minutesToClock(22 * 60 + 30), "22:30");
});

// ── ics ──────────────────────────────────────────
test("ics: formatIcsUtc + local", () => {
  assert.equal(formatIcsUtc(0), "19700101T000000Z");
  assert.equal(formatIcsLocal({ y: 2026, mo: 7, d: 10, h: 9, mi: 5 }), "20260710T090500");
  assert.equal(escapeIcsText("a, b; c\\d\ne"), "a\\, b\\; c\\\\d\\ne");
});
test("ics: buildCalendar erzeugt gültiges VCALENDAR", () => {
  const ics = buildCalendar({
    calName: "Kairos",
    dtStamp: formatIcsUtc(0),
    events: [{ uid: "t1@kairos", summary: "Mathe", dtStart: "20260710T090000", dtEnd: "20260710T093000" }],
  });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /UID:t1@kairos/);
  assert.match(ics, /SUMMARY:Mathe/);
  assert.match(ics, /DTSTART:20260710T090000/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.ok(ics.split("\r\n").every((l) => l.length <= 75), "Zeilen ≤ 75 Oktett");
});
