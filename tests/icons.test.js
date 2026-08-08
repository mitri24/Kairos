// Schutz für das Icon-System (web/js/icons.js).
//
// Hintergrund: Die Oberfläche wurde bewusst komplett von Emojis auf Strich-SVGs
// umgestellt — Emojis rendern je Plattform anders, lassen sich nicht einfärben
// und brechen Dark-Mode/Hochkontrast. Diese Tests halten drei Dinge fest:
//   1. jeder Icon-Name aus dem Methoden-Katalog existiert wirklich,
//   2. icon() liefert wohlgeformtes, barrierefrei markiertes SVG,
//   3. es schleicht sich kein neues Emoji in die Oberfläche zurück.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { icon, fileIcon, ICON_NAMES } from "../web/js/icons.js";
import { METHOD_CATEGORIES, LEARN_STYLES, CHALLENGES, HELPS, CHRONOTYPES, METHODS, methodIcon } from "../shared/methods.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("icons: Katalog liefert wohlgeformtes SVG mit currentColor", () => {
  assert.ok(ICON_NAMES.length >= 60, `zu wenige Icons: ${ICON_NAMES.length}`);
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    assert.match(svg, /^<svg class="ico"/, `${name}: kein <svg class="ico">`);
    assert.match(svg, /<\/svg>$/, `${name}: nicht geschlossen`);
    assert.match(svg, /stroke="currentColor"/, `${name}: feste Farbe statt currentColor`);
    assert.match(svg, /aria-hidden="true"/, `${name}: ohne label muss aria-hidden gesetzt sein`);
    // Grob auf ausgeglichene Tags prüfen (kein verschachteltes <svg>).
    assert.equal((svg.match(/<svg/g) || []).length, 1, `${name}: verschachteltes <svg>`);
  }
});

test("icons: label macht das Icon zum beschrifteten Bild", () => {
  const svg = icon("pin", { label: 'Angepinnt "A" & B' });
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="Angepinnt &quot;A&quot; &amp; B"/);
  assert.doesNotMatch(svg, /aria-hidden/);
});

test("icons: unbekannter Name liefert leeren String statt Ausnahme", () => {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(" "));
  try {
    assert.equal(icon("gibtesnicht"), "");
  } finally {
    console.warn = orig;
  }
  assert.equal(warns.length, 1);
});

test("icons: fileIcon deckt die Material-Typen ab", () => {
  for (const [mime, expected] of [
    ["application/pdf", "doc"],
    ["image/png", "image"],
    ["audio/mpeg", "audio"],
    ["video/mp4", "video"],
    ["text/plain", "file"],
    ["", "file"],
  ]) {
    assert.equal(fileIcon(mime), expected, `MIME ${mime}`);
    assert.ok(ICON_NAMES.includes(fileIcon(mime)));
  }
});

test("icons: jeder Icon-Name im Methoden-Katalog existiert", () => {
  const groups = {
    METHOD_CATEGORIES, LEARN_STYLES, CHALLENGES, HELPS, CHRONOTYPES, METHODS,
  };
  for (const [groupName, list] of Object.entries(groups)) {
    for (const entry of list) {
      assert.ok(entry.icon, `${groupName}/${entry.id}: kein icon-Feld`);
      assert.ok(
        ICON_NAMES.includes(entry.icon),
        `${groupName}/${entry.id}: unbekanntes Icon "${entry.icon}"`
      );
    }
  }
});

// Chronotyp: dieselbe Liste versorgt Onboarding (Schritt 1) und Profil
// (#pfChrono). Die ids sind gespeicherte Werte (profile.chronotype) — ändern
// sie sich, passt kein bestehendes Profil mehr zu einem Knopf.
test("icons: CHRONOTYPES deckt genau die gespeicherten Werte ab", () => {
  assert.deepEqual(CHRONOTYPES.map((c) => c.id), ["early", "intermediate", "late"]);
  for (const c of CHRONOTYPES) {
    assert.ok(c.de && c.en, `${c.id}: Beschriftung fehlt`);
  }
  // Das statische Markup in web/index.html kann icon() nicht aufrufen — dort
  // liegen dieselben Pfade inline. Sie müssen zeichengleich bleiben.
  const html = readFileSync(join(ROOT, "web/index.html"), "utf8");
  const chrono = html.slice(html.indexOf('id="pfChrono"'), html.indexOf('id="pfFocus"'));
  for (const c of CHRONOTYPES) {
    assert.match(chrono, new RegExp(`data-chrono="${c.id}"`), `${c.id}: Knopf fehlt in index.html`);
    for (const d of icon(c.icon).match(/ d="[^"]+"/g) || []) {
      assert.ok(chrono.includes(d), `#pfChrono/${c.id}: Pfad weicht von icons.js ab (${d.trim()})`);
    }
  }
});

test("icons: methodIcon fällt auf die Kategorie zurück, nie ins Leere", () => {
  for (const m of METHODS) assert.equal(methodIcon(m), m.icon);
  // Methode ohne eigenes Icon → Kategorie-Icon; ohne beides → "book".
  assert.equal(methodIcon({ id: "x", cat: "memory" }), "brain");
  assert.equal(methodIcon({ id: "x", cat: "gibtesnicht" }), "book");
  assert.equal(methodIcon(null), "book");
  assert.ok(ICON_NAMES.includes(methodIcon({ id: "x" })));
});

test("icons: der Katalog trägt keine Emoji-Felder mehr", () => {
  const src = readFileSync(join(ROOT, "shared/methods.js"), "utf8");
  assert.doesNotMatch(src, /emoji/i, "shared/methods.js enthält noch ein emoji-Feld");
});

// ── Rückfall-Schutz ───────────────────────────────────────────────────────
// Piktogramm-Emojis (inkl. Haken/Kreuze/Sterne aus dem Dingbat-Block). Pfeile
// (U+2190–U+21FF) sind bewusst NICHT enthalten: die Codebasis nutzt „→" als
// Trennzeichen in deutschen Kommentaren und Hinweistexten.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE0F}]/u;

function collect(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "fonts" || entry === "icons") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) collect(p, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(p);
  }
  return out;
}

test("icons: keine Emojis mehr in der Oberfläche", () => {
  // CSS gehört dazu: ein content: "✓" ist genauso ein plattformabhängiges
  // Textzeichen wie ein Emoji im Markup — Häkchen gehören als Maske aus
  // demselben Pfad wie icon("check") ins CSS, nicht als Glyphe.
  const files = [
    ...collect(join(ROOT, "web/js"), [".js"]),
    ...collect(join(ROOT, "web/css"), [".css"]),
    ...collect(join(ROOT, "src"), [".js", ".html", ".css"]),
    ...collect(join(ROOT, "shared"), [".js"]),
    join(ROOT, "web/index.html"),
    join(ROOT, "web/sw.js"),
  ];
  const hits = [];
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (EMOJI.test(line)) hits.push(`${f.replace(ROOT, "")}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(hits, [], `Emoji-Rückfall:\n${hits.join("\n")}`);
});

test("icons: keine Emojis in Server-Ausgaben (Push, ICS, Teilen-Seite)", () => {
  const files = collect(join(ROOT, "server"), [".js"]);
  const hits = [];
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (EMOJI.test(line)) hits.push(`${f.replace(ROOT, "")}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(hits, [], `Emoji-Rückfall im Server:\n${hits.join("\n")}`);
});

test("icons: das Icon-Modul liegt in der App-Shell des Service Workers", () => {
  const sw = readFileSync(join(ROOT, "web/sw.js"), "utf8");
  assert.match(sw, /"\/js\/icons\.js"/, "icons.js fehlt im APP_SHELL — offline blieben Icons leer");
});
