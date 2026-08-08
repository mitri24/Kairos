// Spalten-Layout der Kalender-Blöcke (Wochen-Board + Tages-Zeitstrahl).
// Reine Rechnung ohne DOM — genau deshalb hier testbar.
import test from "node:test";
import assert from "node:assert/strict";
import { layoutOverlaps, laneStyle } from "../web/js/calendarLayout.js";

const at = (start, end, id) => ({ start, end, id });
const byId = (list) => Object.fromEntries(list.map((it) => [it.id, it]));

test("ohne Überschneidung bekommt jeder Block die volle Breite", () => {
  const out = byId(layoutOverlaps([at(540, 600, "a"), at(600, 660, "b")]));
  assert.equal(out.a.cols, 1);
  assert.equal(out.b.cols, 1);
  assert.deepEqual(laneStyle(out.a), { left: 0, width: 100 });
  assert.deepEqual(laneStyle(out.b), { left: 0, width: 100 });
});

test("zwei gleichzeitige Blöcke stehen nebeneinander statt übereinander", () => {
  const out = byId(layoutOverlaps([at(540, 660, "a"), at(570, 690, "b")]));
  assert.equal(out.a.cols, 2);
  assert.equal(out.b.cols, 2);
  assert.notEqual(out.a.col, out.b.col);
  const A = laneStyle(out.a), B = laneStyle(out.b);
  assert.equal(A.left, 0);
  assert.equal(B.left, 50);
  assert.ok(A.left + A.width <= B.left, "Spalten dürfen sich nicht überlappen");
});

test("eine frei gewordene Spalte wird wiederverwendet", () => {
  // a 09:00–11:00, b 09:00–10:00, c 10:00–11:00 → c passt in die Spalte von b.
  const out = byId(layoutOverlaps([at(540, 660, "a"), at(540, 600, "b"), at(600, 660, "c")]));
  assert.equal(out.a.cols, 2, "nur zwei Spalten nötig");
  assert.equal(out.b.col, out.c.col);
  assert.notEqual(out.a.col, out.b.col);
});

test("ein Block wächst nach rechts, wenn dort nichts liegt", () => {
  // a 09:00–12:00 | b,c 09:00–10:00 (drei Spalten) | d 10:30–11:00 hat rechts frei.
  const out = byId(layoutOverlaps([
    at(540, 720, "a"), at(540, 600, "b"), at(540, 600, "c"), at(630, 660, "d"),
  ]));
  assert.equal(out.a.cols, 3);
  assert.equal(out.d.span, 2, "d belegt die freie Nachbarspalte mit");
  assert.equal(out.a.span, 1, "a bleibt schmal, b liegt daneben");
  const D = laneStyle(out.d);
  assert.ok(D.width > 100 / 3, "der ausgedehnte Block ist breiter als eine Spalte");
});

test("getrennte Gruppen teilen die Breite unabhängig voneinander", () => {
  // Vormittag überlappt, Nachmittag nicht — der Nachmittag darf nicht schrumpfen.
  const out = byId(layoutOverlaps([
    at(540, 600, "a"), at(550, 610, "b"), at(780, 840, "solo"),
  ]));
  assert.equal(out.a.cols, 2);
  assert.equal(out.solo.cols, 1);
  assert.deepEqual(laneStyle(out.solo), { left: 0, width: 100 });
});

test("Blöcke ohne Dauer kippen das Layout nicht", () => {
  const out = layoutOverlaps([at(540, 540, "punkt")]);
  assert.equal(out.length, 1);
  assert.equal(out[0].cols, 1);
  assert.ok(Number.isFinite(laneStyle(out[0]).width));
});
