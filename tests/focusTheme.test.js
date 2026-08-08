// Schutz für die Farbdisziplin im Fokusmodus (web/css/session.css).
//
// Hintergrund: Der Fokusmodus war die einzige Ansicht mit einem EIGENEN, fest
// verdrahteten Farbsatz (#20241F, #7dbf9c, …). Damit lief er an der ganzen
// Adapt-Engine vorbei — Akzentfarbe, Hell/Dunkel, Hochkontrast und Dichte
// blieben dort wirkungslos. Diese Tests halten fest:
//   1. feste Farben stehen NUR im Token-Block, nirgends in den Regeln,
//   2. jede benutzte --ses-Variable ist auch definiert (fängt Tippfehler),
//   3. beide Flächen-Modi belegen denselben Satz Tokens (kein blinder Fleck),
//   4. adapt.js schreibt data-focus-surface, sonst greift der Modus nie.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");
const CSS = read("web/css/session.css");
const ADAPT = read("web/js/adapt.js");

// Kommentare raus — dort stehen Hex-Werte als Beleg der alten Fassung.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

// Die Blöcke, in denen feste Farben erlaubt sind: dort werden die --ses-Tokens
// aus den globalen Tokens gemischt, und ein Mischpartner MUSS eine Farbe sein.
function tokenBlockRanges(css) {
  const ranges = [];
  const re = /(^|\})\s*([^{}]*\bbody\.session-open\b[^{}]*)\{/g;
  let m;
  while ((m = re.exec(css))) {
    const start = re.lastIndex;
    const end = css.indexOf("}", start);
    ranges.push([start, end]);
  }
  return ranges;
}

test("Fokusmodus: feste Farben stehen ausschließlich im Token-Block", () => {
  const css = stripComments(CSS);
  const ranges = tokenBlockRanges(css);
  assert.ok(ranges.length >= 2, "Token-Blöcke für beide Flächen-Modi fehlen");

  const inToken = (idx) => ranges.some(([a, b]) => idx >= a && idx <= b);
  // #rgb/#rrggbb sowie rgb()/hsl() — alles, was eine Farbe festnagelt.
  const colorRe = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;
  const offenders = [];
  let m;
  while ((m = colorRe.exec(css))) {
    if (inToken(m.index)) continue;
    const line = css.slice(0, m.index).split("\n").length;
    offenders.push(`Zeile ${line}: ${css.slice(m.index, m.index + 40).split("\n")[0]}`);
  }
  assert.deepEqual(offenders, [], `feste Farbe außerhalb des Token-Blocks:\n${offenders.join("\n")}`);
});

test("Fokusmodus: jede benutzte --ses-Variable ist definiert", () => {
  const css = stripComments(CSS);
  const defined = new Set([...css.matchAll(/(--ses-[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...css.matchAll(/var\((--ses-[\w-]+)/g)].map((m) => m[1]));
  const missing = [...used].filter((v) => !defined.has(v));
  assert.deepEqual(missing, [], `undefinierte Fokus-Tokens: ${missing.join(", ")}`);
});

test("Fokusmodus: beide Flächen-Modi belegen denselben Satz Tokens", () => {
  const css = stripComments(CSS);
  const [dim, match] = tokenBlockRanges(css).slice(0, 2).map(([a, b]) => css.slice(a, b));
  const names = (block) => new Set([...block.matchAll(/(--ses-[\w-]+)\s*:/g)].map((m) => m[1]));
  const dimNames = names(dim);
  const matchNames = names(match);
  // --ses-ground ist reine Hilfsgröße des gedämpften Modus.
  const missing = [...dimNames].filter((n) => n !== "--ses-ground" && !matchNames.has(n));
  assert.deepEqual(missing, [], `„Wie App“ belegt diese Tokens nicht: ${missing.join(", ")}`);
});

test("Fokusmodus: Ring und Fläche hängen an der Akzentfarbe", () => {
  const css = stripComments(CSS);
  // Der Ring darf seine Farbe nicht selbst setzen, sondern über die globale
  // .ring-Mechanik (--ring-color) aus dem Fokus-Akzent beziehen.
  assert.match(css, /--ring-color:\s*var\(--ses-accent\)/, "Ring folgt der Akzentfarbe nicht");
  assert.match(css, /--ses-accent:\s*color-mix\([^;]*var\(--accent\)/, "gedämpfter Akzent nicht aus --accent gemischt");
  assert.match(css, /:root\[data-focus-surface="match"\]/, "Flächen-Modus „match“ fehlt");
  assert.match(css, /:root\[data-contrast="high"\]\s*body\.session-open/, "Hochkontrast greift im Fokusmodus nicht");
});

// ── Quellen-Auswahl: was im Fokusblock überhaupt auftauchen darf ────────────
// session.js lässt sich hier nicht importieren (Browser-Pfade wie "/js/util.js"),
// deshalb statisch geprüft — das reicht für die Fragen, die wirklich weh tun:
// wird eine neue Quelle auch ausgewertet, und bleibt „Angepinntes" aus?
const SESSION = read("web/js/session.js");

test("Fokus-Quellen: jede deklarierte Quelle wird in collectDocs ausgewertet", () => {
  const block = SESSION.match(/export const FOCUS_SOURCES\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(block, "FOCUS_SOURCES fehlt");
  const ids = [...block[1].matchAll(/id:\s*"([\w-]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 4, `zu wenige Quellen: ${ids.length}`);

  const body = SESSION.match(/export function collectDocs[\s\S]*?\n}\n/);
  assert.ok(body, "collectDocs nicht gefunden");
  const unused = ids.filter((id) => !new RegExp(`src\\.${id}\\b`).test(body[0]));
  assert.deepEqual(unused, [], `Quelle deklariert, aber nie abgefragt: ${unused.join(", ")}`);

  // Umgekehrt: keine Abfrage auf eine Quelle, die es gar nicht gibt (Tippfehler).
  const queried = [...body[0].matchAll(/src\.(\w+)\b/g)].map((m) => m[1]);
  const unknown = [...new Set(queried)].filter((q) => !ids.includes(q));
  assert.deepEqual(unknown, [], `unbekannte Quelle abgefragt: ${unknown.join(", ")}`);
});

test("Fokus-Quellen: bezugloses Angepinntes ist standardmäßig aus", () => {
  const def = SESSION.match(/export const DEFAULT_FOCUS_SOURCES\s*=\s*\{([^}]*)\}/);
  assert.ok(def, "DEFAULT_FOCUS_SOURCES fehlt");
  assert.match(def[1], /pinned:\s*false/, "Angepinntes würde fremden Stoff in den Fokus holen");
  // Alles, was an der Aufgabe hängt, gehört per Vorgabe hinein.
  for (const id of ["task", "topic", "exam", "subject"]) {
    assert.match(def[1], new RegExp(`${id}:\\s*true`), `Quelle ${id} sollte vorgegeben an sein`);
  }
});

test("adapt.js: schreibt data-focus-surface und kennt beide Modi", () => {
  assert.match(ADAPT, /root\.dataset\.focusSurface\s*=/, "data-focus-surface wird nie gesetzt");
  assert.match(ADAPT, /export const FOCUS_SURFACES/, "FOCUS_SURFACES fehlt");
  for (const id of ["dim", "match"]) {
    assert.ok(ADAPT.includes(`"${id}"`), `Flächen-Modus ${id} fehlt in adapt.js`);
  }
});
