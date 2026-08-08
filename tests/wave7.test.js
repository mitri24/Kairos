// Wave-7-Tests: Notizen als Dokumente (Titel + Markdown-Text) und Anhänge, die
// an Notiz, Thema oder Prüfung hängen. DB-Boot wie in den anderen API-Tests:
// temporäre Datei-DB VOR dem Server-Import setzen.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { Readable } from "node:stream";

const DB_FILE = join(tmpdir(), `lernuhr-test-${randomUUID()}.db`);
process.env.LERNUHR_DB = DB_FILE;

const repo = await import("../server/repo.js");
const routes = await import("../server/routes.js");
const auth = await import("../server/auth.js");
const { setDefaultUserId } = await import("../server/authctx.js");

const userA = auth.findOrCreateUser("wave7-a@example.com");
const userB = auth.findOrCreateUser("wave7-b@example.com");
repo.ensureUser(userA.id);
repo.ensureUser(userB.id);
setDefaultUserId(userA.id);

const cookieA = `${auth.COOKIE_NAME}=${auth.createSession(userA.id).id}`;
const cookieB = `${auth.COOKIE_NAME}=${auth.createSession(userB.id).id}`;

function mkReq(method, url, body, cookie = cookieA) {
  const req = Readable.from(body != null ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = url;
  req.headers = { cookie, host: "localhost" };
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}
function mkRawReq(url, buf, mime = "application/pdf", cookie = cookieA) {
  const req = Readable.from([buf]);
  req.method = "POST";
  req.url = url;
  req.headers = { cookie, host: "localhost", "content-type": mime };
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}
const pathOf = (url) => decodeURIComponent(url.split("?")[0]);
const call = (method, url, body, cookie) => routes.handleApi(mkReq(method, url, body, cookie), pathOf(url));
const upload = (url, buf, mime, cookie) => routes.handleApi(mkRawReq(url, buf, mime, cookie), pathOf(url));

after(() => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try { rmSync(DB_FILE + suffix, { force: true }); } catch { /* ignore */ }
  }
});

// ═══ Notiz = Dokument ════════════════════════════════════════════════════
test("Notiz trägt einen Titel und behält ihn über den Snapshot", async () => {
  const res = await call("POST", "/api/notes", { title: "Glycolysis", text: "## Steps\n- hexokinase" });
  assert.equal(res.status, 200);
  const note = res.body.notes.find((n) => n.title === "Glycolysis");
  assert.ok(note, "Notiz mit Titel im Snapshot");
  assert.equal(note.text, "## Steps\n- hexokinase");
});

test("ein Dokument darf nur einen Titel haben (leerer Text ist erlaubt)", async () => {
  const res = await call("POST", "/api/notes", { title: "Untitled", text: "" });
  assert.equal(res.status, 200);
  assert.ok(res.body.notes.some((n) => n.title === "Untitled" && n.text === ""));
});

test("ohne Titel UND ohne Text wird abgelehnt", async () => {
  // handleApi wirft bei Client-Fehlern; index.js macht daraus die HTTP-Antwort.
  await assert.rejects(
    () => call("POST", "/api/notes", { title: "   ", text: "  " }),
    (err) => err.status === 400,
  );
});

test("Titel lässt sich ändern und wieder leeren", async () => {
  const created = (await call("POST", "/api/notes", { title: "Draft", text: "x" })).body;
  const id = created.notes.find((n) => n.title === "Draft").id;

  const renamed = (await call("PUT", `/api/notes/${id}`, { title: "Final" })).body;
  assert.equal(renamed.notes.find((n) => n.id === id).title, "Final");

  const cleared = (await call("PUT", `/api/notes/${id}`, { title: "" })).body;
  assert.equal(cleared.notes.find((n) => n.id === id).title, null, "leerer Titel → null, nicht ''");
});

test("Bestandsnotizen ohne Titel bleiben unverändert nutzbar", async () => {
  const res = await call("POST", "/api/notes", { text: "nur Text, kein Titel" });
  const note = res.body.notes.find((n) => n.text === "nur Text, kein Titel");
  assert.equal(note.title, null);
});

// ═══ Anhänge ═════════════════════════════════════════════════════════════
test("Datei hängt an einer Notiz und taucht im Snapshot auf", async () => {
  const noteId = (await call("POST", "/api/notes", { title: "With files", text: "" }))
    .body.notes.find((n) => n.title === "With files").id;

  const res = await upload(`/api/materials/upload?title=script.pdf&noteId=${noteId}`, Buffer.from("%PDF-1.4 test"));
  assert.equal(res.status, 200);
  assert.equal(res.body.material.noteId, noteId);
  assert.equal(res.body.material.kind, "file");

  const mat = res.body.materials.find((m) => m.id === res.body.material.id);
  assert.equal(mat.noteId, noteId, "noteId ist Teil des Snapshots");
  assert.equal(mat.data, undefined, "der Blob bleibt aus dem Snapshot draußen");
});

test("Löschen der Notiz nimmt ihre Dateien mit", async () => {
  const noteId = (await call("POST", "/api/notes", { title: "Doomed", text: "" }))
    .body.notes.find((n) => n.title === "Doomed").id;
  const matId = (await upload(`/api/materials/upload?title=a.pdf&noteId=${noteId}`, Buffer.from("x"))).body.material.id;

  const after = (await call("DELETE", `/api/notes/${noteId}`)).body;
  assert.ok(!after.notes.some((n) => n.id === noteId), "Notiz weg");
  assert.ok(!after.materials.some((m) => m.id === matId), "Anhang weg");
});

test("Dateien lassen sich an Thema und Prüfung hängen", async () => {
  const exam = (await call("POST", "/api/exams", { name: "Biochem" })).body.exams.at(-1);
  const topic = (await call("POST", "/api/topics", { text: "Krebs cycle", examId: exam.id })).body.topics.at(-1);

  const atExam = (await upload(`/api/materials/upload?title=syllabus.pdf&examId=${exam.id}`, Buffer.from("s"))).body.material;
  const atTopic = (await upload(`/api/materials/upload?title=cycle.png&topicId=${topic.id}&examId=${exam.id}`, Buffer.from("p"), "image/png")).body.material;

  assert.equal(atExam.examId, exam.id);
  assert.equal(atExam.topicId, null);
  assert.equal(atTopic.topicId, topic.id);
  assert.equal(atTopic.examId, exam.id);
});

test("ein Anhang lässt sich nachträglich umhängen", async () => {
  const noteId = (await call("POST", "/api/notes", { title: "Move me", text: "" }))
    .body.notes.find((n) => n.title === "Move me").id;
  const matId = (await upload(`/api/materials/upload?title=m.pdf`, Buffer.from("m"))).body.material.id;

  const res = await call("PUT", `/api/materials/${matId}`, { noteId });
  assert.equal(res.body.materials.find((m) => m.id === matId).noteId, noteId);
});

test("Anhänge bleiben pro Konto getrennt", async () => {
  const mine = (await upload(`/api/materials/upload?title=private.pdf`, Buffer.from("secret"))).body.material.id;
  const other = await call("GET", "/api/state", null, cookieB);
  assert.ok(!other.body.materials.some((m) => m.id === mine), "fremdes Konto sieht die Datei nicht");
});

// ═══ Migration ═══════════════════════════════════════════════════════════
test("ensureWave7 ist idempotent (zweiter Lauf ändert nichts)", async () => {
  const { ensureWave7 } = await import("../server/migrations/wave7.mjs");
  const { getDb } = await import("../server/db.js");
  const db = getDb();
  ensureWave7(db);
  ensureWave7(db);
  const noteCols = db.prepare("PRAGMA table_info(notes)").all().map((c) => c.name);
  const matCols = db.prepare("PRAGMA table_info(materials)").all().map((c) => c.name);
  assert.equal(noteCols.filter((c) => c === "title").length, 1);
  assert.equal(matCols.filter((c) => c === "note_id").length, 1);
});
