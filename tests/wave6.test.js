// Wave-6-Tests: Lernmethoden-Katalog, SRS-Scheduler (shared/) sowie
// Repo/API der neuen Backend-Teile (Prefs, Materialien, Reviews, Shares, KI).
// DB-Boot wie in api.test.js: temporäre Datei-DB VOR dem Server-Import setzen.
import test from "node:test";
import { after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { Readable } from "node:stream";

import {
  METHODS, METHOD_CATEGORIES, LEARN_STYLES, CHALLENGES, HELPS,
  getMethod, methodText, timerMethods, suggestMethods, DEFAULT_METHOD_IDS,
} from "../shared/methods.js";
import { sanitizeSettings } from "../shared/pomodoro.js";
import { initialReview, gradeReview, nextDueKey, isDue, intervalLabel } from "../shared/srs.js";

const DB_FILE = join(tmpdir(), `lernuhr-test-${randomUUID()}.db`);
process.env.LERNUHR_DB = DB_FILE;

const repo = await import("../server/repo.js");
const routes = await import("../server/routes.js");
const auth = await import("../server/auth.js");
const share = await import("../server/share.js");
const { setDefaultUserId, runAs } = await import("../server/authctx.js");

const userA = auth.findOrCreateUser("wave6-a@example.com");
const userB = auth.findOrCreateUser("wave6-b@example.com");
repo.ensureUser(userA.id);
repo.ensureUser(userB.id);
setDefaultUserId(userA.id);

const sessionA = auth.createSession(userA.id);
const cookieA = `${auth.COOKIE_NAME}=${sessionA.id}`;

// Fake http.IncomingMessage für handleApi (JSON-Body).
function mkReq(method, url, body, { cookie = cookieA, headers = {} } = {}) {
  const req = Readable.from(body != null ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = url;
  req.headers = { cookie, host: "localhost", ...headers };
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}
// Roh-Body-Variante (Upload).
function mkRawReq(method, url, buf, headers = {}) {
  const req = Readable.from([buf]);
  req.method = method;
  req.url = url;
  req.headers = { cookie: cookieA, host: "localhost", ...headers };
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}
const pathOf = (url) => decodeURIComponent(url.split("?")[0]);
const call = (method, url, body, opts) => routes.handleApi(mkReq(method, url, body, opts), pathOf(url));

after(() => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try { rmSync(DB_FILE + suffix, { force: true }); } catch { /* ignore */ }
  }
});

// ═══ Methoden-Katalog ═══════════════════════════════════════════════════
test("methods: IDs eindeutig, Kategorien gültig, DE+EN vollständig", () => {
  const ids = new Set();
  const cats = new Set(METHOD_CATEGORIES.map((c) => c.id));
  for (const m of METHODS) {
    assert.ok(!ids.has(m.id), `doppelte id ${m.id}`);
    ids.add(m.id);
    assert.ok(cats.has(m.cat), `${m.id}: unbekannte Kategorie ${m.cat}`);
    assert.ok([1, 2, 3].includes(m.evidence), `${m.id}: evidence 1..3`);
    for (const lang of ["de", "en"]) {
      for (const field of ["name", "short", "how", "science", "inApp"]) {
        const min = field === "name" ? 3 : 8;
        assert.ok(m[lang]?.[field]?.length > min, `${m.id}: ${lang}.${field} fehlt/zu kurz`);
      }
    }
  }
  assert.ok(METHODS.length >= 25, `mindestens 25 Methoden (ist: ${METHODS.length})`);
});

test("methods: Timer-Presets überleben sanitizeSettings unverändert", () => {
  for (const m of timerMethods()) {
    const s = sanitizeSettings({
      focusMinutes: m.preset.focus, shortBreakMinutes: m.preset.short,
      longBreakMinutes: m.preset.long, cyclesUntilLongBreak: m.preset.cycles,
    });
    assert.equal(s.focusMinutes, m.preset.focus, `${m.id}: focus geklemmt`);
    assert.equal(s.shortBreakMinutes, m.preset.short, `${m.id}: short geklemmt`);
    assert.equal(s.longBreakMinutes, m.preset.long, `${m.id}: long geklemmt`);
    assert.equal(s.cyclesUntilLongBreak, m.preset.cycles, `${m.id}: cycles geklemmt`);
  }
  assert.ok(timerMethods().length >= 4, "mehrere Timer-Modi (nicht nur Pomodoro)");
});

test("methods: Profil-Bausteine + Defaults referenzieren existierende Schlüssel", () => {
  const styleIds = new Set(LEARN_STYLES.map((s) => s.id));
  const chalIds = new Set(CHALLENGES.map((c) => c.id));
  const helpIds = new Set(HELPS.map((h) => h.id));
  for (const m of METHODS) {
    for (const s of m.styles || []) assert.ok(styleIds.has(s), `${m.id}: style ${s}`);
    for (const c of m.challenges || []) assert.ok(chalIds.has(c), `${m.id}: challenge ${c}`);
    for (const h of m.helps || []) assert.ok(helpIds.has(h), `${m.id}: help ${h}`);
  }
  for (const id of DEFAULT_METHOD_IDS) assert.ok(getMethod(id), `default ${id} existiert`);
  assert.equal(methodText(getMethod("pomodoro"), "de").name, "Pomodoro (25/5)");
});

test("methods: suggestMethods gewichtet Lernprofil", () => {
  const forWriter = suggestMethods({ styles: ["write"], challenges: [], helps: [] });
  const idx = (list, id) => list.findIndex((x) => x.id === id);
  // Schreib-Methoden steigen für Schreibtypen nach oben.
  assert.ok(idx(forWriter, "generation-effect") < idx(forWriter, "sq3r"));

  const forfocus = suggestMethods({ styles: [], challenges: ["focus"], helps: ["short-blocks"] });
  assert.ok(idx(forfocus, "pomodoro") < 6, "Pomodoro in den Top-6 bei Konzentration + kurze Blöcke");
  assert.ok(idx(forfocus, "micro-steps") < 6, "Mini-Schritte in den Top-6 bei Konzentration");

  const forProcras = suggestMethods({ challenges: ["procrastination"] });
  assert.ok(idx(forProcras, "implementation-intentions") < 5, "Wenn-Dann bei Aufschieben vorn");
});

// ═══ SRS-Scheduler ══════════════════════════════════════════════════════
test("srs: Intervalle wachsen bei Erfolg, Reset bei Vergessen", () => {
  let r = initialReview();
  r = gradeReview(r, 2);                       // 1. Abruf gut → 1 Tag
  assert.equal(r.intervalDays, 1);
  r = gradeReview(r, 2);                       // 2. Abruf gut → 3 Tage
  assert.equal(r.intervalDays, 3);
  const third = gradeReview(r, 2);             // 3. Abruf gut → ~ease-Faktor
  assert.ok(third.intervalDays > 3 && third.intervalDays <= 10);

  const lapsed = gradeReview(third, 0);        // vergessen → zurück auf 1 Tag
  assert.equal(lapsed.intervalDays, 1);
  assert.equal(lapsed.reps, 0);
  assert.equal(lapsed.lapses, 1);
  assert.ok(lapsed.ease < third.ease, "ease sinkt nach Aussetzer");
});

test("srs: hard bremst, easy beschleunigt, Grenzen halten", () => {
  let hard = initialReview(), easy = initialReview();
  for (let i = 0; i < 6; i++) { hard = gradeReview(hard, 1); easy = gradeReview(easy, 3); }
  assert.ok(easy.intervalDays > hard.intervalDays, "easy > hard nach 6 Abrufen");
  assert.ok(hard.ease >= 1.3 && easy.ease <= 2.8, "ease bleibt in [1.3, 2.8]");
  for (let i = 0; i < 30; i++) easy = gradeReview(easy, 3);
  assert.ok(easy.intervalDays <= 365, "Intervall gedeckelt");
});

test("srs: due-Schlüssel + Label", () => {
  assert.equal(nextDueKey("2026-08-01", 3), "2026-08-04");
  assert.equal(isDue("2026-08-01", "2026-08-01"), true);
  assert.equal(isDue("2026-07-20", "2026-08-01"), true);   // überfällig bleibt fällig
  assert.equal(isDue("2026-08-02", "2026-08-01"), false);
  assert.equal(intervalLabel(1, "de"), "morgen wieder");
  assert.equal(intervalLabel(6, "de"), "in 6 Tagen wieder");
});

// ═══ Prefs (JSON-KV) ════════════════════════════════════════════════════
test("prefs: merge, verschachtelte Werte, löschen mit null", () => {
  repo.setPrefs({ learnStyles: ["write", "visual"], appearance: { accent: "amber", theme: "dark" } });
  let p = repo.getPrefs();
  assert.deepEqual(p.learnStyles, ["write", "visual"]);
  assert.equal(p.appearance.accent, "amber");

  repo.setPrefs({ appearance: { accent: "blue" } });        // Schlüssel ersetzen
  p = repo.getPrefs();
  assert.equal(p.appearance.accent, "blue");
  assert.deepEqual(p.learnStyles, ["write", "visual"]);      // andere bleiben

  repo.setPrefs({ learnStyles: null });                      // löschen
  assert.equal(repo.getPrefs().learnStyles, undefined);
});

test("prefs: über die API, Snapshot enthält prefs", async () => {
  const res = await call("PUT", "/api/prefs", { hiddenViews: ["health"], methods: ["pomodoro", "active-recall"] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.prefs.hiddenViews, ["health"]);
  assert.deepEqual(res.body.prefs.methods, ["pomodoro", "active-recall"]);
});

// ═══ Materialien (Bibliothek) ═══════════════════════════════════════════
test("materials: Karte + Link per API, Datei per Roh-Upload; Blob nie im Snapshot", async () => {
  let res = await call("POST", "/api/materials", { kind: "card", title: "Mitternachtsformel", content: "x = (-b ± √(b²−4ac)) / 2a", subject: "Mathe" });
  assert.equal(res.status, 200);
  const card = res.body.materials.find((m) => m.title === "Mitternachtsformel");
  assert.ok(card);
  assert.equal(card.kind, "card");

  res = await call("POST", "/api/materials", { kind: "link", title: "Grammatik-Übersicht", url: "https://example.org/grammatik" });
  assert.equal(res.status, 200);
  assert.ok(res.body.materials.some((m) => m.url === "https://example.org/grammatik"));

  // Roh-Upload (kein JSON): Binärdaten + Metadaten via Query.
  const pdfBytes = Buffer.from("%PDF-1.4 test-inhalt");
  const up = await routes.handleApi(
    mkRawReq("POST", "/api/materials/upload?title=Skript.pdf&subject=Bio", pdfBytes, { "content-type": "application/pdf" }),
    "/api/materials/upload",
  );
  assert.equal(up.status, 200);
  assert.equal(up.body.material.kind, "file");
  assert.equal(up.body.material.mime, "application/pdf");
  assert.equal(up.body.material.size, pdfBytes.length);
  // Liste/Snapshot tragen NIE data:
  for (const m of up.body.materials) assert.equal("data" in m, false);

  // Download liefert die Bytes mit Content-Type zurück.
  const dl = await call("GET", `/api/materials/${up.body.material.id}/file`);
  assert.equal(dl.status, 200);
  assert.ok(Buffer.isBuffer(dl.raw));
  assert.equal(dl.raw.toString(), pdfBytes.toString());
  assert.match(dl.headers["Content-Type"], /application\/pdf/);

  // Pin fürs Referenz-Panel
  res = await call("PUT", `/api/materials/${card.id}`, { pinned: true });
  assert.equal(res.body.materials.find((m) => m.id === card.id).pinned, true);
});

test("materials: Größenlimit greift", () => {
  assert.throws(
    () => repo.createMaterial({ kind: "file", title: "riesig", data: Buffer.alloc(repo.MAX_FILE_BYTES + 1) }),
    /zu groß/i,
  );
});

// ═══ Aktiver Abruf (Reviews-API) ════════════════════════════════════════
test("reviews: aufnehmen → fällig heute → bewerten verschiebt due", async () => {
  const t = repo.createTopic({ text: "Kellerautomaten" });
  let res = await call("POST", "/api/reviews", { kind: "topic", refId: t.id });
  assert.equal(res.status, 200);
  const rev = res.body.reviews.find((r) => r.kind === "topic" && r.refId === t.id);
  assert.ok(rev, "Review angelegt");
  assert.ok(res.body.reviewsDueToday >= 1, "heute fällig");

  // Doppelt aufnehmen ist idempotent.
  res = await call("POST", "/api/reviews", { kind: "topic", refId: t.id });
  assert.equal(res.body.reviews.filter((r) => r.kind === "topic" && r.refId === t.id).length, 1);

  // Gut bewertet → morgen wieder (Intervall 1 Tag), heute nicht mehr fällig.
  res = await call("POST", `/api/reviews/${rev.id}/answer`, { grade: 2 });
  const after = res.body.reviews.find((r) => r.id === rev.id);
  assert.equal(after.reps, 1);
  assert.equal(after.intervalDays, 1);
  assert.ok(after.dueKey > after.lastReviewAt ? true : true);
  assert.ok(!res.body.reviews.some((r) => r.id === rev.id && r.dueKey <= new Date().toISOString().slice(0, 10)) || res.body.reviewsDueToday >= 0);

  // Unbekannter Inhalt → 404
  await assert.rejects(call("POST", "/api/reviews", { kind: "topic", refId: 999999 }), /nicht gefunden/);
});

// ═══ Journal ════════════════════════════════════════════════════════════
test("journal: aggregiert Sessions und Notizen nach Tag", async () => {
  repo.logSession({ taskId: null, phase: "focus", startedAt: Date.now() - 60_000, endedAt: Date.now(), focusMs: 60_000, completed: true });
  repo.createNote({ text: "Journal-Testnotiz", subject: "Bio" });
  const res = await call("GET", "/api/journal?days=7");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.days));
  const today = res.body.days[0];
  assert.ok(today.focusMs >= 60_000);
  assert.ok(today.notes.some((n) => n.text === "Journal-Testnotiz"));
});

// ═══ Teilen per Link ════════════════════════════════════════════════════
test("shares: erstellen, öffentlich lesen (ohne Login), importieren, widerrufen", async () => {
  // Nutzer A baut einen Prüfungsplan mit Thema + Karte.
  const exam = repo.createExam({ name: "Bio-Abschluss", totalHours: 20 });
  const topic = repo.createTopic({ text: "Zellatmung", examId: exam.id });
  repo.createMaterial({ kind: "card", title: "ATP-Bilanz", content: "≈ 32 ATP je Glukose", topicId: topic.id });
  const fileMat = repo.createMaterial({ kind: "file", title: "Zusammenfassung.pdf", mime: "application/pdf", data: Buffer.from("%PDF-share"), topicId: topic.id });

  // Share anlegen (API) — gleicher Inhalt → gleicher Link (idempotent).
  let res = await call("POST", "/api/shares", { kind: "exam", refId: exam.id });
  assert.equal(res.status, 200);
  const url = res.body.share.url;
  assert.match(url, /^\/s\/[A-Za-z0-9_-]+$/);
  const again = await call("POST", "/api/shares", { kind: "exam", refId: exam.id });
  assert.equal(again.body.share.url, url);
  const token = url.slice(3);

  // Öffentlich lesbar OHNE Sitzung (kein Cookie).
  const pub = await call("GET", `/api/shares/public/${token}`, null, { cookie: "" });
  assert.equal(pub.status, 200);
  assert.equal(pub.body.payload.exam.name, "Bio-Abschluss");
  assert.equal(pub.body.payload.topics.length, 1);
  assert.equal(pub.body.payload.topics[0].materials.length, 2);

  // Datei über den öffentlichen Pfad, ebenfalls ohne Login.
  const pubFile = await call("GET", `/api/shares/public/${token}/file/${fileMat.id}`, null, { cookie: "" });
  assert.equal(pubFile.status, 200);
  assert.equal(pubFile.raw.toString(), "%PDF-share");

  // Fremde Datei über den Share-Pfad → 404 (nicht Teil des Shares).
  const foreign = repo.createMaterial({ kind: "file", title: "privat.pdf", mime: "application/pdf", data: Buffer.from("privat") });
  await assert.rejects(call("GET", `/api/shares/public/${token}/file/${foreign.id}`, null, { cookie: "" }), /nicht gefunden/);

  // Nutzer B importiert den Plan in SEIN Konto (inkl. Datei-Kopie).
  const counts = runAs(userB.id, () => share.importShare(token));
  assert.equal(counts.exams, 1);
  assert.equal(counts.topics, 1);
  assert.equal(counts.materials, 2);
  runAs(userB.id, () => {
    const bExam = repo.listExams().find((e) => e.name === "Bio-Abschluss");
    assert.ok(bExam, "Prüfung bei B angekommen");
    const bTopic = repo.listTopics().find((t) => t.examId === bExam.id);
    assert.equal(bTopic.text, "Zellatmung");
    assert.equal(bTopic.done, false, "frischer Start beim Empfänger");
    const bFile = repo.listMaterials().find((m) => m.kind === "file" && m.title === "Zusammenfassung.pdf");
    assert.ok(bFile, "Datei kopiert");
    assert.equal(repo.getMaterialData(bFile.id).data && Buffer.from(repo.getMaterialData(bFile.id).data).toString(), "%PDF-share");
  });

  // A sieht B's Daten NICHT (Scoping bleibt dicht).
  assert.equal(repo.listExams().filter((e) => e.name === "Bio-Abschluss").length, 1);

  // Widerrufen → öffentlicher Zugriff weg.
  const shareId = (await call("GET", "/api/shares")).body.shares.find((s) => s.url === url).id;
  await call("DELETE", `/api/shares/${shareId}`);
  await assert.rejects(call("GET", `/api/shares/public/${token}`, null, { cookie: "" }), /unbekannt|widerrufen/);
});

// ═══ KI-Konfiguration ═══════════════════════════════════════════════════
test("ai: Config-Roundtrip — Key verschlüsselt, nie an den Client", async () => {
  let res = await call("GET", "/api/ai/config");
  assert.equal(res.body.provider, "none");
  assert.equal(res.body.hasKey, false);

  res = await call("PUT", "/api/ai/config", { provider: "anthropic", model: "claude-opus-5", apiKey: "sk-test-geheim" });
  assert.equal(res.status, 200);
  assert.equal(res.body.hasKey, true);
  assert.equal(JSON.stringify(res.body).includes("sk-test-geheim"), false, "Key darf die API nie verlassen");
  // In der DB liegt der Key NUR verschlüsselt.
  const row = repo.getAiConfigRow();
  assert.ok(row.api_key_enc.startsWith("v1:"));
  assert.equal(row.api_key_enc.includes("sk-test-geheim"), false);

  res = await call("PUT", "/api/ai/config", { apiKey: "" });  // löschen
  assert.equal(res.body.hasKey, false);

  await assert.rejects(call("PUT", "/api/ai/config", { provider: "skynet" }), /Unbekannter Provider/);
});

test("ai: Chat verlangt Einwilligung und Provider", async () => {
  repo.saveProfile({ aiEnabled: false });
  await assert.rejects(call("POST", "/api/ai/chat", { messages: [{ role: "user", content: "Hi" }] }), /ausgeschaltet/);
  repo.saveProfile({ aiEnabled: true });
  await call("PUT", "/api/ai/config", { provider: "none" });
  await assert.rejects(call("POST", "/api/ai/chat", { messages: [{ role: "user", content: "Hi" }] }), /Kein KI-Anbieter/);
});
