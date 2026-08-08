// Tests für das reine Lern-Tempo (shared/pace.js).
import test from "node:test";
import assert from "node:assert/strict";

import {
  computePace, planFactor, suggestEstimate, planMinutes,
  normDifficulty, DIFFICULTY_BASELINE_MIN,
} from "../shared/pace.js";

// Hilfe: erledigte Aufgabe mit Soll (min) und Ist (min).
const doneTask = (estMinutes, actualMin, difficulty = 2, doneAt = 1000) => ({
  done: true, doneAt, estMinutes, spentMs: actualMin * 60000, difficulty,
});

test("normDifficulty klemmt auf 1..3, unbekannt → 2", () => {
  assert.equal(normDifficulty(1), 1);
  assert.equal(normDifficulty(3), 3);
  assert.equal(normDifficulty(0), 2);
  assert.equal(normDifficulty(null), 2);
  assert.equal(normDifficulty("x"), 2);
});

test("computePace ignoriert offene und unvollständige Aufgaben", () => {
  const pace = computePace([
    { done: false, estMinutes: 30, spentMs: 30 * 60000, doneAt: 1 },
    { done: true, doneAt: 2, estMinutes: 0, spentMs: 60000 },
    { done: true, doneAt: 3, estMinutes: 30, spentMs: 0 },
    null,
  ]);
  assert.equal(pace.overall.n, 0);
  assert.deepEqual(pace.byDifficulty, {});
});

test("computePace lernt Faktor je Schwierigkeit (EMA, chronologisch)", () => {
  // Stufe 3: konstant 1.5× länger als geschätzt → Faktor konvergiert Richtung 1.5
  const tasks = [1, 2, 3, 4, 5, 6].map((i) => doneTask(40, 60, 3, i));
  const pace = computePace(tasks);
  const b = pace.byDifficulty[3];
  assert.equal(b.n, 6);
  assert.ok(Math.abs(b.factor - 1.5) < 0.01, `factor ${b.factor}`);
  assert.ok(Math.abs(b.avgActualMin - 60) < 0.01);
  assert.equal(pace.overall.n, 6);
});

test("computePace kappt Ausreißer-Verhältnisse", () => {
  // 10 min geschätzt, 300 min gebraucht → ratio wird auf 4 gekappt
  const pace = computePace([doneTask(10, 300, 2, 1)]);
  assert.equal(pace.byDifficulty[2].factor, 4);
});

test("planFactor: ohne Historie neutral 1", () => {
  assert.equal(planFactor(computePace([]), 2), 1);
  assert.equal(planFactor(null, 2), 1);
});

test("planFactor: wenige Stichproben mischen mit dem Gesamt-Faktor", () => {
  // Gesamt bei ~1.0 (Stufe 2, 5×), Stufe 3 nur 1 Stichprobe bei 2.0
  const tasks = [
    ...[1, 2, 3, 4, 5].map((i) => doneTask(30, 30, 2, i)),
    doneTask(30, 60, 3, 6),
  ];
  const pace = computePace(tasks);
  const f3 = planFactor(pace, 3);
  // Mischung: 1/5 × 2.0 + 4/5 × Gesamt(≈1.06) → deutlich unter 2, über 1
  assert.ok(f3 > 1 && f3 < 1.5, `f3 ${f3}`);
  // volle Stichprobenzahl → Stufen-Faktor dominiert
  const many = [1, 2, 3, 4, 5, 6, 7].map((i) => doneTask(30, 60, 3, i));
  assert.ok(planFactor(computePace(many), 3) > 1.8);
});

test("planFactor bleibt in [0.5, 3]", () => {
  const slow = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => doneTask(10, 40, 2, i));  // ratio 4
  assert.ok(planFactor(computePace(slow), 2) <= 3);
  const fast = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => doneTask(60, 15, 2, i));  // ratio 0.25
  assert.ok(planFactor(computePace(fast), 2) >= 0.5);
});

test("suggestEstimate: Baseline ohne Historie, Historie ab 3 Stichproben", () => {
  const empty = suggestEstimate(computePace([]), 3);
  assert.deepEqual(empty, { minutes: DIFFICULTY_BASELINE_MIN[3], basis: "baseline", n: 0 });

  const two = computePace([doneTask(30, 50, 3, 1), doneTask(30, 50, 3, 2)]);
  assert.equal(suggestEstimate(two, 3).basis, "baseline");

  const three = computePace([1, 2, 3].map((i) => doneTask(30, 50, 3, i)));
  const s = suggestEstimate(three, 3);
  assert.equal(s.basis, "history");
  assert.equal(s.minutes, 50);
});

test("planMinutes: Schätzung × Faktor, gerundet auf 5", () => {
  const pace = computePace([1, 2, 3, 4, 5, 6].map((i) => doneTask(40, 60, 3, i))); // Faktor ~1.5
  assert.equal(planMinutes(pace, 3, 40), 60);
  // ohne Schätzung → Vorschlag (Historie: 60)
  assert.equal(planMinutes(pace, 3, null), 60);
  // ohne alles → Baseline
  assert.equal(planMinutes(computePace([]), 1, null), DIFFICULTY_BASELINE_MIN[1]);
});
