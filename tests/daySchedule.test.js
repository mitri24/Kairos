// Tests für die reine Tagesplan-Logik (shared/daySchedule.js) und den
// sekundenlosen Dauer-Formatter (shared/pomodoro.js).
import test from "node:test";
import assert from "node:assert/strict";

import {
  minToClock, clockToMin, nowMinOfDay, roundToStep, ceilToStep,
  fractionOfDay, slotStatus, isOverdue, nextFreeSlot, slotsOverlap,
  DAY_START_MIN, DAY_END_MIN,
} from "../shared/daySchedule.js";
import { formatDurationHM } from "../shared/pomodoro.js";

// ── Uhrzeit ↔ Minuten ────────────────────────────
test("minToClock formatiert HH:MM und normalisiert auf den Tag", () => {
  assert.equal(minToClock(0), "00:00");
  assert.equal(minToClock(9 * 60 + 5), "09:05");
  assert.equal(minToClock(23 * 60 + 59), "23:59");
  assert.equal(minToClock(1440), "00:00");       // 24:00 → 00:00
  assert.equal(minToClock(-30), "23:30");        // negativ wraparound
});

test("clockToMin parst HH:MM und lehnt Unsinn ab", () => {
  assert.equal(clockToMin("00:00"), 0);
  assert.equal(clockToMin("9:05"), 545);
  assert.equal(clockToMin("14:30"), 870);
  assert.equal(clockToMin("24:00"), null);       // 24 ist ungültig
  assert.equal(clockToMin("12:60"), null);
  assert.equal(clockToMin(""), null);
  assert.equal(clockToMin("abc"), null);
});

test("nowMinOfDay liest lokale Minute-ab-Mitternacht", () => {
  const d = new Date(2026, 6, 9, 14, 30, 30); // 14:30:30 lokal
  assert.equal(Math.floor(nowMinOfDay(d.getTime())), 14 * 60 + 30);
});

// ── Raster & Position ────────────────────────────
test("roundToStep / ceilToStep rasten auf 5 Minuten", () => {
  assert.equal(roundToStep(872), 870);
  assert.equal(roundToStep(873), 875);
  assert.equal(ceilToStep(871), 875);
  assert.equal(ceilToStep(870), 870);
});

test("fractionOfDay ist 0 am Start, 1 am Ende, geclamped", () => {
  assert.equal(fractionOfDay(DAY_START_MIN), 0);
  assert.equal(fractionOfDay(DAY_END_MIN), 1);
  assert.equal(fractionOfDay(0), 0);             // vor dem Fenster → 0
  assert.equal(fractionOfDay(9999), 1);          // nach dem Fenster → 1
  assert.equal(fractionOfDay((DAY_START_MIN + DAY_END_MIN) / 2), 0.5);
});

// ── Slot-Status ──────────────────────────────────
test("slotStatus unterscheidet future / now / past", () => {
  const item = { startMin: 600, durationMin: 30 }; // 10:00–10:30
  assert.equal(slotStatus(item, 590), "future");
  assert.equal(slotStatus(item, 600), "now");
  assert.equal(slotStatus(item, 615), "now");
  assert.equal(slotStatus(item, 630), "past");     // Ende inklusive → past
  assert.equal(slotStatus(item, 700), "past");
});

test("isOverdue nur für offene, vergangene Slots", () => {
  const base = { startMin: 600, durationMin: 30 };
  assert.equal(isOverdue({ ...base, done: false }, 700), true);
  assert.equal(isOverdue({ ...base, done: true }, 700), false);   // erledigt
  assert.equal(isOverdue({ ...base, done: false }, 610), false);  // läuft noch
});

// ── Freier Slot ──────────────────────────────────
test("nextFreeSlot: leerer Tag → from (auf Raster gerundet)", () => {
  assert.equal(nextFreeSlot([], 30, 601), 605);
});

test("nextFreeSlot: nutzt Lücke vor einem Block", () => {
  // Block 10:00–11:00; from 09:00, Dauer 30 → passt bei 09:00
  assert.equal(nextFreeSlot([{ startMin: 600, durationMin: 60 }], 30, 540), 540);
});

test("nextFreeSlot: springt hinter überlappende Blöcke", () => {
  // from 10:15 fällt in Block 10:00–11:00 → hinter den Block: 11:00
  assert.equal(nextFreeSlot([{ startMin: 600, durationMin: 60 }], 30, 615), 660);
});

test("nextFreeSlot: findet erste passende Lücke zwischen zwei Blöcken", () => {
  const occ = [
    { startMin: 600, durationMin: 30 }, // 10:00–10:30
    { startMin: 635, durationMin: 25 }, // 10:35–11:00
  ];
  // ab 10:00, Dauer 40: Lücke 10:30–10:35 (5) zu klein → hinter beide: 11:00
  assert.equal(nextFreeSlot(occ, 40, 600), 660);
  // ab 10:00, Dauer 5: passt in 10:30–10:35
  assert.equal(nextFreeSlot(occ, 5, 600), 630);
});

test("slotsOverlap erkennt Überschneidungen (halb-offen)", () => {
  assert.equal(slotsOverlap({ startMin: 600, durationMin: 30 }, { startMin: 615, durationMin: 30 }), true);
  assert.equal(slotsOverlap({ startMin: 600, durationMin: 30 }, { startMin: 630, durationMin: 30 }), false); // bündig
});

// ── formatDurationHM (keine Sekunden) ────────────
test("formatDurationHM zeigt nur h und min", () => {
  assert.equal(formatDurationHM(0), "0 Min");
  assert.equal(formatDurationHM(25 * 60000), "25 Min");
  assert.equal(formatDurationHM(60 * 60000), "1 Std");
  assert.equal(formatDurationHM(65 * 60000), "1 Std 05 Min");
  assert.equal(formatDurationHM(150 * 60000), "2 Std 30 Min");
  // ceil-Modus für laufende Countdowns: 24:30 bleibt "25 Min"
  assert.equal(formatDurationHM(24.5 * 60000, true), "25 Min");
  assert.equal(formatDurationHM(-5000), "0 Min");
});
