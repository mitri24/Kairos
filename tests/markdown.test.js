// Markdown-Renderer für Notiz-Dokumente. Wichtigster Punkt: aus Nutzertext darf
// NIE Markup entstehen — deshalb steht die Escaping-Prüfung an erster Stelle.
import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, firstLine, excerpt, excerptBody } from "../web/js/markdown.js";

test("HTML im Text wird escaped, nicht ausgeführt", () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)"> und <b>fett</b>');
  assert.ok(!html.includes("<img"), "kein rohes <img>");
  assert.ok(!html.includes("<b>"), "kein rohes <b>");
  assert.ok(html.includes("&lt;img"), "escaped statt entfernt");
});

test("javascript:-Links werden nicht verlinkt", () => {
  const html = renderMarkdown("[klick](javascript:alert(1))");
  assert.ok(!html.includes("<a "), "kein Anker für unsicheres Schema");
  const ok = renderMarkdown("[docs](https://example.org/a)");
  assert.ok(ok.includes('href="https://example.org/a"'));
  assert.ok(ok.includes('rel="noopener noreferrer"'));
});

test("Überschriften beginnen bei h2 (h1 gehört dem Dokumenttitel)", () => {
  assert.ok(renderMarkdown("# Kapitel").includes("<h2>Kapitel</h2>"));
  assert.ok(renderMarkdown("## Abschnitt").includes("<h3>Abschnitt</h3>"));
});

test("Listen, Aufgabenhaken und Nummerierung", () => {
  const ul = renderMarkdown("- eins\n- zwei");
  assert.ok(ul.startsWith("<ul>") && ul.endsWith("</ul>"));
  assert.equal((ul.match(/<li>/g) || []).length, 2);

  const task = renderMarkdown("- [x] erledigt\n- [ ] offen");
  assert.ok(task.includes("checked"));
  assert.ok(task.includes("md-task is-done"));
  assert.equal((task.match(/type="checkbox"/g) || []).length, 2);

  const ol = renderMarkdown("1. erst\n2. dann");
  assert.ok(ol.startsWith("<ol>"));
});

test("Code-Blöcke bleiben unangetastet", () => {
  const html = renderMarkdown("```\n- keine Liste\n**kein fett**\n```");
  assert.ok(html.includes("<pre class=\"md-code\"><code>"));
  assert.ok(html.includes("- keine Liste"), "Inhalt wörtlich");
  assert.ok(!html.includes("<strong>"), "keine Auszeichnung im Code");
});

test("fett/kursiv/inline-code", () => {
  const html = renderMarkdown("**fett** und *kursiv* und `code`");
  assert.ok(html.includes("<strong>fett</strong>"));
  assert.ok(html.includes("<em>kursiv</em>"));
  assert.ok(html.includes("<code>code</code>"));
});

test("Absätze trennen an Leerzeilen, Zeilenumbruch bleibt erhalten", () => {
  const html = renderMarkdown("eins\nzwei\n\ndrei");
  assert.equal((html.match(/<p>/g) || []).length, 2);
  assert.ok(html.includes("eins<br>zwei"));
});

test("firstLine/excerpt liefern brauchbare Kurzfassungen", () => {
  assert.equal(firstLine("\n\n## Glykolyse\nmehr Text"), "Glykolyse");
  assert.equal(firstLine(""), "");
  assert.equal(excerpt("## Titel\n- ein *Punkt*"), "Titel - ein Punkt");
  assert.ok(excerpt("x".repeat(300)).length <= 160);
});

test("excerptBody lässt die Titelzeile weg (sonst stünde sie doppelt)", () => {
  assert.equal(excerptBody("Kellerautomaten anschauen\nPumping-Lemma üben."), "Pumping-Lemma üben.");
  assert.equal(excerptBody("## Titel\n\nInhalt"), "Inhalt");
  assert.equal(excerptBody("nur eine Zeile"), "", "ohne zweite Zeile bleibt nichts übrig");
  assert.equal(excerptBody(""), "");
});
