// Tests für den reinen Auto-Tagesplaner (shared/planner.js).
import test from "node:test";
import assert from "node:assert/strict";

import { planDay, cmpTasks } from "../shared/planner.js";

const T = (id, over = {}) => ({ id, priority: 2, estMinutes: 30, sortOrder: id, ...over });
const startOf = (res, id) => res.placements.find((p) => p.id === id)?.startMin;

test("cmpTasks: Priorität vor Deadline vor Sortierung", () => {
  const a = { id: 1, priority: 1, dueDate: null, sortOrder: 9 };
  const b = { id: 2, priority: 2, dueDate: 1, sortOrder: 0 };
  assert.ok(cmpTasks(a, b) < 0);
  const c = { id: 3, priority: 2, dueDate: 100, sortOrder: 0 };
  assert.ok(cmpTasks(c, b) > 0);       // spätere Deadline nach hinten
  const d = { id: 4, priority: 2, dueDate: null, sortOrder: 1 };
  const e = { id: 5, priority: 2, dueDate: null, sortOrder: 2 };
  assert.ok(cmpTasks(d, e) < 0);
});

test("planDay: leer → leerer Plan", () => {
  const res = planDay({ tasks: [], nowMin: 600 });
  assert.deepEqual(res.placements, []);
  assert.equal(res.plannedMin, 0);
});

test("planDay: sequenziell ab jetzt, Prio zuerst, mit Puffer", () => {
  const res = planDay({
    tasks: [T(1, { priority: 3 }), T(2, { priority: 1 })],
    nowMin: 600, bufferMin: 10,
  });
  assert.equal(startOf(res, 2), 600);          // Prio 1 zuerst, ab 10:00
  assert.equal(startOf(res, 1), 640);          // 10:30 Ende + 10 Puffer → 10:40
  assert.equal(res.plannedMin, 60);
});

test("planDay: nicht in der Vergangenheit planen (nowMin-Floor, aufs Raster)", () => {
  const res = planDay({ tasks: [T(1)], nowMin: 601 });
  assert.equal(startOf(res, 1), 605);
});

test("planDay: Kalender-Termine werden umflossen", () => {
  const res = planDay({
    tasks: [T(1, { estMinutes: 60 })],
    busy: [{ startMin: 600, durationMin: 60 }],   // 10–11 Uhr belegt
    nowMin: 590,                                   // 09:50: 10 min Lücke reicht nicht für 60
  });
  assert.equal(startOf(res, 1), 660);              // hinter dem Termin
});

test("planDay: vom Nutzer getimte Blöcke bleiben stehen, auto umfließt sie", () => {
  const res = planDay({
    tasks: [
      T(1, { scheduledMin: 600, schedSource: "user", estMinutes: 60 }),
      T(2, { priority: 1, estMinutes: 30 }),
    ],
    nowMin: 590, bufferMin: 10,
  });
  assert.deepEqual(res.kept, [1]);
  assert.equal(res.placements.length, 1);
  // 09:50 Start, aber 10 min Lücke < 30 → hinter den festen Block (11:00)
  assert.equal(startOf(res, 2), 660);
  assert.equal(res.fixedMin, 60);
  assert.equal(res.plannedMin, 90);
});

test("planDay: 'auto'-getimte Blöcke dürfen neu geplant werden", () => {
  const res = planDay({
    tasks: [T(1, { scheduledMin: 1200, schedSource: "auto" })],
    nowMin: 600,
  });
  assert.equal(startOf(res, 1), 600);              // wandert nach vorn
  assert.deepEqual(res.kept, []);
});

test("planDay: Abhängigkeit erzwingt Reihenfolge trotz höherer Prio", () => {
  const res = planDay({
    tasks: [
      T(1, { priority: 1, dependsOn: [2], estMinutes: 30 }),  // Vertiefung, hohe Prio
      T(2, { priority: 3, estMinutes: 30 }),                   // Grundlage, niedrige Prio
    ],
    nowMin: 600, bufferMin: 10,
  });
  assert.equal(startOf(res, 2), 600);
  assert.equal(startOf(res, 1), 640);              // nach der Grundlage + Puffer
});

test("planDay: erledigte Abhängigkeit blockiert nicht", () => {
  const res = planDay({
    tasks: [T(1, { dependsOn: [99] })],
    doneIds: new Set([99]),
    nowMin: 600,
  });
  assert.equal(startOf(res, 1), 600);
  assert.deepEqual(res.blocked, []);
});

test("planDay: offene externe Abhängigkeit → blockiert, mit Begründung", () => {
  const res = planDay({ tasks: [T(1, { dependsOn: [42] })], nowMin: 600 });
  assert.deepEqual(res.placements, []);
  assert.deepEqual(res.blocked, [{ id: 1, missing: [42] }]);
});

test("planDay: Blockade vererbt sich auf Abhängige", () => {
  const res = planDay({
    tasks: [T(1, { dependsOn: [42] }), T(2, { dependsOn: [1] })],
    nowMin: 600,
  });
  assert.equal(res.placements.length, 0);
  assert.equal(res.blocked.length, 2);
  assert.deepEqual(res.blocked.find((b) => b.id === 2).missing, [1]);
});

test("planDay: Zyklus → beide blockiert statt Endlosschleife", () => {
  const res = planDay({
    tasks: [T(1, { dependsOn: [2] }), T(2, { dependsOn: [1] })],
    nowMin: 600,
  });
  assert.equal(res.placements.length, 0);
  assert.equal(res.blocked.length, 2);
});

test("planDay: Kapazität stoppt ehrlich (Stop-the-line, feste zählen mit)", () => {
  const res = planDay({
    tasks: [
      T(1, { priority: 1, estMinutes: 60 }),
      T(2, { priority: 2, estMinutes: 60 }),
      T(3, { priority: 3, estMinutes: 20 }),      // würde noch passen — bleibt trotzdem draußen
    ],
    nowMin: 600, capacityMin: 90,
  });
  assert.equal(res.placements.length, 1);
  assert.equal(startOf(res, 1), 600);
  assert.deepEqual(res.overCapacity.sort(), [2, 3]);
});

test("planDay: Tagesende → overflow", () => {
  const res = planDay({
    tasks: [T(1, { estMinutes: 60 }), T(2, { estMinutes: 60 })],
    nowMin: 23 * 60,                               // 23:00 — nur noch 60 min Tag
  });
  assert.equal(res.placements.length, 1);
  assert.deepEqual(res.overflow, [2]);
});

test("planDay: durationMin (Pace-adjustiert) schlägt estMinutes", () => {
  const res = planDay({
    tasks: [T(1, { estMinutes: 30, durationMin: 45 }), T(2)],
    nowMin: 600, bufferMin: 5,
  });
  assert.equal(res.placements.find((p) => p.id === 1).durationMin, 45);
  assert.equal(startOf(res, 2), 650);              // 10:45 + 5 Puffer
});
