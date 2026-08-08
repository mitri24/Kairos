// Härtung von shared/outline.js — die Fälle, die eine adversariale Prüfung
// gefunden UND nachgemessen hat:
//   · quadratisches Backtracking in cleanTitle (100 KB Text ≈ 14 s Serverstillstand)
//   · quadratisches Entdoppeln in parseTaskTypes
//   · Muster-Auswahl, die die eigentlichen Themen verschluckt
// Node ist einspurig: eine solche Schleife blockiert ALLE Mandanten, nicht nur
// den Absender. Deshalb sind das Zeitschranken-Tests, keine Stiltests.
import test from "node:test";
import assert from "node:assert/strict";
import { extractOutline, parseTaskTypes } from "../shared/outline.js";

// Großzügig: auf langsamer CI darf es dauern — nur eben nicht quadratisch.
// Vor der Härtung lagen dieselben Eingaben bei 6–16 SEKUNDEN.
const BUDGET_MS = 1500;

const took = (fn) => {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
};

test("100 KB Punkte-Wüste: Gliederung bleibt unter der Zeitschranke", () => {
  const evil = ".".repeat(100_000) + "x";
  const ms = took(() => {
    const { topics } = extractOutline(evil);
    // Inhaltlich richtig bleibt es auch: daraus ist kein Thema zu lesen.
    assert.deepEqual(topics, []);
  });
  assert.ok(ms < BUDGET_MS, `extractOutline brauchte ${Math.round(ms)} ms (Schranke ${BUDGET_MS} ms)`);
});

test("Langer Trennzeichen-Lauf am Zeilenende bremst nicht aus", () => {
  const evil = "Automaten" + " -.,;".repeat(20_000);
  const ms = took(() => extractOutline(evil));
  assert.ok(ms < BUDGET_MS, `extractOutline brauchte ${Math.round(ms)} ms`);
});

test("1 MB Material: linear statt quadratisch", () => {
  // Realistischer Angriff: viele lange Zeilen statt einer.
  const evil = Array.from({ length: 2_000 }, (_, i) => `${".".repeat(400)} ${i}`).join("\n");
  const ms = took(() => extractOutline(evil));
  assert.ok(ms < BUDGET_MS, `extractOutline brauchte ${Math.round(ms)} ms`);
});

test("parseTaskTypes: 16 000 verschiedene Einträge bleiben unter der Schranke", () => {
  const evil = Array.from({ length: 16_000 }, (_, i) => `tt${i}`).join(",");
  let out;
  const ms = took(() => { out = parseTaskTypes(evil); });
  assert.equal(out.length, 20, "es werden weiterhin höchstens 20 übernommen");
  assert.equal(out[0], "tt0");
  assert.ok(ms < BUDGET_MS, `parseTaskTypes brauchte ${Math.round(ms)} ms`);
});

test("parseTaskTypes: ein einziger 1-MB-Block ohne Trenner blockiert nicht", () => {
  const ms = took(() => parseTaskTypes("a".repeat(1_000_000)));
  assert.ok(ms < BUDGET_MS, `parseTaskTypes brauchte ${Math.round(ms)} ms`);
});

// ── Muster-Auswahl ───────────────────────────────
test("Zwei Kapitelüberschriften verschlucken nicht zwanzig Themenpunkte", () => {
  const text = [
    "# Modul 1",
    ...Array.from({ length: 12 }, (_, i) => `- Thema A${i}`),
    "# Modul 2",
    ...Array.from({ length: 8 }, (_, i) => `- Thema B${i}`),
  ].join("\n");
  const { topics, structure } = extractOutline(text);
  // Vorher gewannen die 2 Überschriften und 20 Themen fielen weg.
  assert.equal(structure, "bullet");
  assert.equal(topics.length, 20);
  assert.equal(topics[0].text, "Thema A0");
});

test("Ausgewogene Überschriften gewinnen weiterhin gegen ihre Unterpunkte", () => {
  const text = [
    "## Automaten", "- DFA", "- NFA",
    "## Grammatiken", "- kontextfrei",
    "## Turingmaschinen", "- Band",
  ].join("\n");
  const { topics, structure } = extractOutline(text);
  assert.equal(structure, "heading", "3 Überschriften vs. 4 Punkte — die Struktur trägt");
  assert.deepEqual(topics.map((t) => t.text), ["Automaten", "Grammatiken", "Turingmaschinen"]);
});

test("Windows-Zeilenenden ändern nichts", () => {
  const { topics, structure } = extractOutline("## Alpha\r\n## Beta\r\n## Gamma\r\n");
  assert.equal(structure, "heading");
  assert.deepEqual(topics.map((t) => t.text), ["Alpha", "Beta", "Gamma"]);
});
