// Lernziel → Themen & Ablauf: API-Ebene.
// Enthält die Regressionen aus der adversarialen Prüfung — jeder Test steht für
// einen bestätigten Fund, damit er nicht zurückkommt.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

const DB_FILE = join(tmpdir(), `lernuhr-splan-${randomUUID()}.db`);
process.env.LERNUHR_DB = DB_FILE;

const routes = await import("../server/routes.js");
const repo = await import("../server/repo.js");
const auth = await import("../server/auth.js");
const ai = await import("../server/ai.js");
const { setDefaultUserId } = await import("../server/authctx.js");

const __user = auth.findOrCreateUser("splan@example.com");
repo.ensureUser(__user.id);
setDefaultUserId(__user.id);
const __session = auth.createSession(__user.id);

function mkReq(method, url, body) {
  const req = Readable.from(body != null ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = url;
  req.headers = { cookie: `${auth.COOKIE_NAME}=${__session.id}`, host: "localhost" };
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}
const call = (method, url, body) => routes.handleApi(mkReq(method, url, body), url.split("?")[0]);

after(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { rmSync(DB_FILE + suffix); } catch { /* nicht da: gut */ }
  }
});

// ── validateProposal: Modellantworten sind keine Daten, sondern Behauptungen ──
test("validateProposal verwirft ungültige dependsOn, statt sie zu klemmen", () => {
  const p = ai.validateProposal({
    summary: "x",
    topics: [
      { text: "A", dependsOn: [] },
      { text: "B", dependsOn: [-5] },        // negativ → früher zu 0 geklemmt = erfundene Kante
      { text: "C", dependsOn: [999] },       // zu groß  → früher zum letzten Thema geklemmt
      { text: "D", dependsOn: [1, 1, 2] },   // gültig, doppelt
      { text: "E", dependsOn: [4] },         // zeigt auf sich selbst → raus
      { text: "F", dependsOn: ["2", null, {}, NaN] }, // keine Ganzzahlen → raus
    ],
  });
  assert.deepEqual(p.topics.map((t) => t.dependsOn), [[], [], [], [1, 2], [], []]);
});

test("validateProposal klemmt Mengen und Wertebereiche", () => {
  const p = ai.validateProposal({
    topics: [
      ...Array.from({ length: 40 }, (_, i) => ({ text: `T${i}` })),   // > 25
      { text: "spät" },
    ],
  });
  assert.equal(p.topics.length, 25, "höchstens 25 Themen");

  const q = ai.validateProposal({
    topics: [{ text: "X", estMinutes: 99999, difficulty: 9 }, { text: "Y", estMinutes: 1, difficulty: -3 }],
  });
  assert.equal(q.topics[0].estMinutes, 240);
  assert.equal(q.topics[0].difficulty, 3);
  assert.equal(q.topics[1].estMinutes, 15);
  assert.equal(q.topics[1].difficulty, 1);
});

test("validateProposal schlüsselt dependsOn um, wenn ein Thema verworfen wird", () => {
  // Modell liefert 4 Themen, Nr. 1 ohne Text. Nr. 3 hängt an Modell-Index 2
  // ("Beta") — nach dem Verwerfen ist Beta Ausgabe-Index 1. Ohne Umschlüsselung
  // zeigte die Abhängigkeit auf „Alpha" statt auf „Beta".
  const p = ai.validateProposal({
    topics: [
      { text: "Alpha" },
      { text: "   " },            // fällt weg
      { text: "Beta" },
      { text: "Gamma", dependsOn: [2] },
    ],
  });
  assert.deepEqual(p.topics.map((t) => t.text), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(p.topics[2].dependsOn, [1], "zeigt auf Beta, nicht auf Alpha");
});

test("validateProposal ignoriert Themen ohne Text und kürzt zu lange", () => {
  const p = ai.validateProposal({ topics: [{ text: "   " }, { text: "L".repeat(300) }] });
  assert.equal(p.topics.length, 1);
  assert.equal(p.topics[0].text.length, 90);
});

// ── Denial-of-Service über eingefügten Text ──────
test("POST /api/plan/topics: größtmögliches Material blockiert den Server nicht", async () => {
  // Knapp unter dem 1-MB-Limit von readJsonBody: alles Größere lehnt schon der
  // Body-Leser mit 413 ab. Das hier ist also die schlimmste Eingabe, die den
  // Textpfad überhaupt erreicht.
  const t0 = process.hrtime.bigint();
  const res = await call("POST", "/api/plan/topics", {
    goal: "Test", material: ".".repeat(900_000) + "x", useAi: false, lang: "de",
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.topics, [], "aus Punkten ist kein Thema zu lesen");
  // Vor der Härtung: minutenlanger Stillstand für ALLE Mandanten (einspuriger Node).
  assert.ok(ms < 1500, `Antwort brauchte ${Math.round(ms)} ms`);
});

test("POST /api/plan/topics: über 1 MB lehnt bereits der Body-Leser ab", async () => {
  await assert.rejects(
    () => call("POST", "/api/plan/topics", { goal: "x", material: "y".repeat(1_100_000), useAi: false }),
    (err) => err.status === 413);
});

test("POST /api/plan/topics: taskTypes allein kann den Server nicht lahmlegen", async () => {
  // Der Fund: parseTaskTypes lief VOR der 400er-Prüfung — ein Request ganz ohne
  // Ziel und Material blockierte, bevor er überhaupt abgelehnt werden konnte.
  const t0 = process.hrtime.bigint();
  await assert.rejects(
    () => call("POST", "/api/plan/topics", { taskTypes: "a,".repeat(300_000), useAi: false }),
    (err) => err.status === 400);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 1500, `Ablehnung brauchte ${Math.round(ms)} ms`);
});

// ── Übernehmen: Grenzen und Zeitzone ─────────────
test("POST /api/plan/topics/apply: lehnt zu viele Themen ab, statt still abzuschneiden", async () => {
  const many = Array.from({ length: 61 }, (_, i) => ({ text: `T${i}` }));
  await assert.rejects(
    () => call("POST", "/api/plan/topics/apply", { examName: "Zu viel", topics: many, lang: "de" }),
    (err) => err.status === 400 && /61/.test(err.message));
  assert.equal(repo.listExams().some((e) => e.name === "Zu viel"), false, "nichts angelegt");
});

test("POST /api/plan/topics/apply: Kantenzahl je Thema ist gedeckelt", async () => {
  const res = await call("POST", "/api/plan/topics/apply", {
    examName: "Kanten",
    topics: [
      { text: "A" },
      { text: "B" },
      // 50 000 Verweise auf Thema 0 — ohne Deckel 50 000 Schreibvorgänge.
      { text: "C", dependsOn: Array.from({ length: 50_000 }, () => 0) },
    ],
    lang: "de",
  });
  const examId = res.body.applied.examId;
  const tasks = repo.listTasks().filter((t) => t.examId === examId).sort((a, b) => a.id - b.id);
  // Entdoppelt bleibt genau eine echte Kante übrig.
  assert.deepEqual(tasks[2].dependsOn, [tasks[0].id]);
  repo.deleteExam(examId);
});

test("POST /api/plan/topics/apply: Prüfungsdatum ist LOKALE Mitternacht", async () => {
  const res = await call("POST", "/api/plan/topics/apply", {
    examName: "Datum", examDate: "2026-09-03",
    topics: [{ text: "A" }], createTasks: false, lang: "de",
  });
  const exam = repo.getExam(res.body.applied.examId);
  const d = new Date(exam.date);
  // Date.parse("2026-09-03") wäre UTC-Mitternacht — westlich von Greenwich
  // zeigte die App dann den 2. September.
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8, "September");
  assert.equal(d.getDate(), 3, "der 3., nicht der 2.");
  assert.equal(d.getHours(), 0);
  repo.deleteExam(exam.id);
});
