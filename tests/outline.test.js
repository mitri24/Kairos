// Gliederungs-Erkennung (shared/outline.js) — der KI-freie Weg von „Text
// einfügen" zu Lernthemen. Rein funktional, deshalb ohne DB/Server testbar.
import test from "node:test";
import assert from "node:assert/strict";
import { extractOutline, parseTaskTypes, outlineProposal } from "../shared/outline.js";

test("Markdown-Überschriften gewinnen gegen Aufzählungspunkte darunter", () => {
  const { topics, structure } = extractOutline(`
# Theoretische Informatik
## Endliche Automaten
- DFA
- NFA
## Kellerautomaten
- Kontextfreie Sprachen
`);
  assert.equal(structure, "heading");
  assert.deepEqual(topics.map((t) => t.text),
    ["Theoretische Informatik", "Endliche Automaten", "Kellerautomaten"]);
  // Ebene bleibt erhalten (H1 = 1, H2 = 2) — die UI kann daraus einrücken.
  assert.deepEqual(topics.map((t) => t.level), [1, 2, 2]);
});

test("Nummerierte Gliederung mit Inhaltsverzeichnis-Punkten und Seitenzahlen", () => {
  const { topics, structure } = extractOutline(`
Inhaltsverzeichnis
1. Grundlagen der Mechanik ............ 7
2. Kinematik ......................... 23
2.1 Geradlinige Bewegung ............. 24
3. Dynamik ........................... 51
`);
  assert.equal(structure, "numbered");
  assert.deepEqual(topics.map((t) => t.text),
    ["Grundlagen der Mechanik", "Kinematik", "Geradlinige Bewegung", "Dynamik"]);
  assert.equal(topics[2].level, 2, "2.1 ist eine Ebene tiefer");
});

test("Kapitel-/Wochenform wird erkannt, Rauschen fliegt raus", () => {
  const { topics, structure } = extractOutline(`
Prof. Dr. Meier
Woche 1 — Zellbiologie
Woche 2: Stoffwechsel
Woche 3 – Genetik
https://uni.example/kurs
`);
  assert.equal(structure, "chapter");
  assert.deepEqual(topics.map((t) => t.text), ["Zellbiologie", "Stoffwechsel", "Genetik"]);
});

test("Ohne jede Struktur zählt jede Zeile als Thema", () => {
  const { topics, structure } = extractOutline("Vokabeln Lektion 3\nGrammatik: Aspekte\nHörverstehen");
  assert.equal(structure, "lines");
  assert.equal(topics.length, 3);
});

test("Doppelte Themen erscheinen nur einmal (Groß-/Kleinschreibung egal)", () => {
  const { topics } = extractOutline("- Automaten\n- automaten!\n- Grammatiken");
  assert.deepEqual(topics.map((t) => t.text), ["Automaten", "Grammatiken"]);
});

test("Leerer oder unbrauchbarer Text liefert nichts — statt Platzhalter", () => {
  assert.deepEqual(extractOutline("").topics, []);
  assert.equal(extractOutline("").structure, null);
  assert.deepEqual(extractOutline("2024\n17\n---").topics, []);
});

test("Ein einzelner Treffer ist keine Struktur — das schwächere Muster greift", () => {
  // Nur EINE Überschrift, aber drei Aufzählungspunkte: die Punkte sind gemeint.
  const { topics, structure } = extractOutline("# Lernstoff\n- Integrale\n- Ableitungen\n- Reihen");
  assert.equal(structure, "bullet");
  assert.deepEqual(topics.map((t) => t.text), ["Integrale", "Ableitungen", "Reihen"]);
});

test("Aufgabentypen: trennen, säubern, entdoppeln — nichts erfinden", () => {
  assert.deepEqual(
    parseTaskTypes("Beweise führen, Automaten konstruieren; Pumping-Lemma anwenden\nbeweise führen"),
    ["Beweise führen", "Automaten konstruieren", "Pumping-Lemma anwenden"]);
  assert.deepEqual(parseTaskTypes(""), []);
});

test("outlineProposal liefert das gemeinsame Format OHNE erfundene Zeiten", () => {
  const p = outlineProposal("## Automaten\n## Grammatiken", { taskTypes: ["Beweise"] });
  assert.equal(p.source, "outline");
  assert.equal(p.structure, "heading");
  assert.deepEqual(p.taskTypes, ["Beweise"]);
  assert.equal(p.topics.length, 2);
  // Ehrlichkeit: ohne KI gibt es keine Dauer- und keine Schwierigkeitsangabe.
  assert.equal(p.topics[0].estMinutes, null);
  assert.equal(p.topics[0].difficulty, null);
  assert.deepEqual(p.topics.map((t) => t.order), [0, 1]);
});
