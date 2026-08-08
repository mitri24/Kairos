// Integrationstest gegen die Backend-Engine (server/timer.js + server/repo.js)
// OHNE HTTP-Port: wir importieren die Module direkt und lenken die SQLite-DB
// über LERNUHR_DB auf eine temporäre Datei. Der Pfad MUSS vor dem Import der
// server-Module gesetzt sein, da server/db.js DB_PATH beim Laden auswertet.
import test from "node:test";
import { after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";

const DB_FILE = join(tmpdir(), `lernuhr-test-${randomUUID()}.db`);
process.env.LERNUHR_DB = DB_FILE;

// Dynamischer Import NACH dem Setzen von LERNUHR_DB (node:sqlite ist experimentell — Warnung ok).
const timer = await import("../server/timer.js");
const repo = await import("../server/repo.js");
const auth = await import("../server/auth.js");
const { setDefaultUserId } = await import("../server/authctx.js");

// Multi-Tenant: einen Test-Nutzer anlegen und als Standardkontext setzen, damit
// die direkten repo/timer-Aufrufe (ohne HTTP/Session) korrekt skopiert laufen.
const __testUser = auth.findOrCreateUser("test@example.com");
repo.ensureUser(__testUser.id);
setDefaultUserId(__testUser.id);

// Temporäre DB (inkl. WAL-Begleitdateien) am Ende aufräumen.
after(() => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try {
      rmSync(DB_FILE + suffix, { force: true });
    } catch {
      /* ignore */
    }
  }
});

// ── Tasks: create -> list ────────────────────────
test("createTask erscheint in listTasks", () => {
  const before = repo.listTasks().length;
  const t = repo.createTask({ text: "Mathe lernen", priority: 1, estMinutes: 30 });
  assert.ok(t.id > 0);
  assert.equal(t.text, "Mathe lernen");
  assert.equal(t.priority, 1);
  assert.equal(t.done, false);
  assert.deepEqual(t.subtasks, []);

  const tasks = repo.listTasks();
  assert.equal(tasks.length, before + 1);
  assert.ok(tasks.some((x) => x.id === t.id));
});

// ── Tasks: scheduledMin (Tages-Zeitstrahl) ───────
test("scheduledMin wird gespeichert, geändert und entfernt", () => {
  const t = repo.createTask({ text: "10-Uhr-Block", estMinutes: 45, scheduledMin: 600 });
  assert.equal(t.scheduledMin, 600);

  // Auf 14:30 verschieben
  const moved = repo.updateTask(t.id, { scheduledMin: 870 });
  assert.equal(moved.scheduledMin, 870);

  // Aus dem Zeitstrahl nehmen (null)
  const unscheduled = repo.updateTask(t.id, { scheduledMin: null });
  assert.equal(unscheduled.scheduledMin, null);

  // Mitternacht (0) ist ein gültiger Wert, nicht "leer"
  const midnight = repo.updateTask(t.id, { scheduledMin: 0 });
  assert.equal(midnight.scheduledMin, 0);

  // Erscheint im Snapshot
  const snap = timer.getSnapshot(3_000_000);
  assert.equal(snap.tasks.find((x) => x.id === t.id).scheduledMin, 0);
});

test("Task-Ort, Raum und Maps-Link werden gespeichert und bearbeitet", () => {
  const t = repo.createTask({
    text: "Seminar", room: "B 2.14", location: "Campus Nord",
    mapsUrl: "https://maps.example.test/campus-nord",
  });
  assert.equal(t.room, "B 2.14");
  assert.equal(t.location, "Campus Nord");
  assert.equal(t.mapsUrl, "https://maps.example.test/campus-nord");
  const edited = repo.updateTask(t.id, { room: "C 1.03", location: "Campus Süd" });
  assert.equal(edited.room, "C 1.03");
  assert.equal(edited.location, "Campus Süd");
});

// ── timer.start: running + endsAt ────────────────
test("timer.start() setzt status running und endsAt in der Zukunft", () => {
  const now = 1_000_000;
  timer.reset(now); // sauberer idle-Zustand (Fokus)
  const snap = timer.start(now);
  assert.equal(snap.timer.status, "running");
  assert.ok(snap.timer.endsAt > now);
  assert.equal(snap.timer.phase, "focus");
});

// ── getSnapshot: enthält tasks/settings/today ────
test("getSnapshot enthält tasks, settings und today", () => {
  const snap = timer.getSnapshot(2_000_000);
  assert.ok(Array.isArray(snap.tasks));
  assert.ok(Array.isArray(snap.exams));
  assert.ok(Array.isArray(snap.topics));
  assert.ok(snap.settings);
  assert.equal(typeof snap.settings.focusMinutes, "number");
  assert.ok(snap.timer);
  assert.ok(snap.today);
  assert.equal(typeof snap.today.focusMs, "number");
  assert.ok("dayKey" in snap.today);
  assert.equal(typeof snap.today.goalHours, "number");
});

// ── setActiveTask + start: Live-Fokus akkumuliert ─
test("setActiveTask + start akkumuliert Fokuszeit im Snapshot (now + X)", () => {
  const t0 = 5_000_000;
  timer.reset(t0); // status idle, phase focus
  const task = repo.createTask({ text: "Fokus-Task" });
  timer.setActiveTask(task.id, t0);
  const started = timer.start(t0);
  assert.equal(started.timer.status, "running");
  assert.equal(started.timer.activeTaskId, task.id);

  // Basiswerte bei now == phaseStartedAt (Live-Fokus = 0)
  const baseSnap = timer.getSnapshot(t0);
  const baseToday = baseSnap.today.focusMs;
  const baseSpent = baseSnap.tasks.find((x) => x.id === task.id).spentMs;

  const elapsed = 60_000; // 1 Minute
  const snap = timer.getSnapshot(t0 + elapsed);
  const shown = snap.tasks.find((x) => x.id === task.id);
  assert.ok(shown);
  assert.equal(shown.spentMs, baseSpent + elapsed); // Live-Fokus in aktive Aufgabe gemischt
  assert.equal(snap.today.focusMs, baseToday + elapsed); // und ins Tagesziel
});

// ── tick nach Ablauf: Fokus abgeschlossen ────────
test("timer.tick(now > endsAt) schließt Fokusphase ab und persistiert today.focusMs", () => {
  const t0 = 8_000_000;
  timer.reset(t0);
  const task = repo.createTask({ text: "Ablauf-Task" });
  timer.setActiveTask(task.id, t0);
  const started = timer.start(t0);
  const endsAt = started.timer.endsAt;
  const focusDurationMs = started.timer.remainingMs; // volle Fokusdauer

  const before = timer.getSnapshot(t0).today.focusMs; // Live = 0 bei t0

  const changed = timer.tick(endsAt + 1);
  assert.equal(changed, true); // Phase wurde abgeschlossen

  const snap = timer.getSnapshot(endsAt + 1);
  // Fokuszeit ist jetzt persistiert (Live = 0, da nicht mehr running/focus)
  assert.equal(snap.today.focusMs, before + focusDurationMs);
  assert.equal(snap.today.sessionsDone >= 1, true);
  // Phase ist nicht mehr Fokus (kurze Pause bei cyclesUntilLongBreak > 1)
  assert.notEqual(snap.timer.phase, "focus");

  // tick ohne laufenden Timer -> false
  assert.equal(timer.tick(endsAt + 10_000), false);
});

// ── Exams CRUD ───────────────────────────────────
test("exams CRUD: create/update/list/remove", () => {
  const ex = repo.createExam({ name: "Physik", date: 9_999_999, totalHours: 40 });
  assert.ok(ex.id > 0);
  assert.equal(ex.name, "Physik");
  assert.equal(ex.totalHours, 40);

  const upd = repo.updateExam(ex.id, { name: "Physik II", totalHours: 50 });
  assert.equal(upd.name, "Physik II");
  assert.equal(upd.totalHours, 50);

  assert.ok(repo.listExams().some((e) => e.id === ex.id));
  repo.deleteExam(ex.id);
  assert.ok(!repo.listExams().some((e) => e.id === ex.id));
});

// ── Topics CRUD ──────────────────────────────────
test("topics CRUD: create/update/list/remove", () => {
  const tp = repo.createTopic({ text: "Kapitel 1" });
  assert.ok(tp.id > 0);
  assert.equal(tp.text, "Kapitel 1");
  assert.equal(tp.done, false);

  const upd = repo.updateTopic(tp.id, { done: true });
  assert.equal(upd.done, true);

  assert.ok(repo.listTopics().some((x) => x.id === tp.id));
  repo.deleteTopic(tp.id);
  assert.ok(!repo.listTopics().some((x) => x.id === tp.id));
});

// ── Notes CRUD ───────────────────────────────────
test("notes CRUD: create/update/list/remove + Snapshot", () => {
  const n = repo.createNote({ text: "Formel merken", subject: "Bio", pinned: true });
  assert.ok(n.id > 0);
  assert.equal(n.text, "Formel merken");
  assert.equal(n.subject, "Bio");
  assert.equal(n.pinned, true);
  assert.equal(n.examId, null);
  assert.ok(n.createdAt > 0);

  const upd = repo.updateNote(n.id, { text: "Formel gemerkt", pinned: false });
  assert.equal(upd.text, "Formel gemerkt");
  assert.equal(upd.pinned, false);
  assert.equal(upd.subject, "Bio"); // nicht mitgeschickte Felder bleiben erhalten

  // Erscheint im Snapshot
  const snap = timer.getSnapshot(4_000_000);
  assert.ok(Array.isArray(snap.notes));
  assert.ok(snap.notes.some((x) => x.id === n.id));

  repo.deleteNote(n.id);
  assert.ok(!repo.listNotes().some((x) => x.id === n.id));
});

// ── Subtasks CRUD ────────────────────────────────
test("subtasks CRUD: create/update/list-via-task/remove", () => {
  const task = repo.createTask({ text: "Task mit Subtasks" });
  const sub = repo.createSubtask(task.id, "Teilaufgabe");
  assert.ok(sub.id > 0);
  assert.equal(sub.text, "Teilaufgabe");
  assert.equal(sub.done, false);

  const upd = repo.updateSubtask(sub.id, { done: true, text: "Teilaufgabe erledigt" });
  assert.equal(upd.done, true);
  assert.equal(upd.text, "Teilaufgabe erledigt");

  const reloaded = repo.getTask(task.id);
  assert.ok(reloaded.subtasks.some((s) => s.id === sub.id));

  repo.deleteSubtask(sub.id);
  const after = repo.getTask(task.id);
  assert.ok(!after.subtasks.some((s) => s.id === sub.id));
});

// ── Erledigte aktive Aufgabe entkoppelt den laufenden Fokus (Welle 3 #7) ──
test("erledigte aktive Aufgabe wird vom laufenden Fokus entkoppelt", () => {
  const t0 = 12_000_000;
  timer.reset(t0);
  const task = repo.createTask({ text: "Aktive Aufgabe" });
  timer.setActiveTask(task.id, t0);
  timer.start(t0); // 25-Min-Fokus läuft

  // Nach 10 Min als erledigt melden → entkoppeln
  const tenMin = 10 * 60_000;
  const snap = timer.updateTask(task.id, { done: true }, t0 + tenMin);
  assert.equal(snap.timer.activeTaskId, null);          // Zeiger geräumt
  const done = snap.tasks.find((x) => x.id === task.id);
  assert.equal(done.done, true);
  assert.equal(done.active, false);                     // active-Flag geräumt
  assert.equal(done.spentMs, tenMin);                   // 10 Min fair gutgeschrieben

  // Weiterer Fokus zählt NICHT mehr auf die fertige Aufgabe
  const later = timer.getSnapshot(t0 + 20 * 60_000);
  assert.equal(later.tasks.find((x) => x.id === task.id).spentMs, tenMin); // unverändert
});

// ── Post-Session: lastSession trägt die Ist-Dauer bei Skip (Welle 3 #8) ──
test("Snapshot lastSession spiegelt die tatsächliche Fokusdauer bei Skip", () => {
  const t0 = 13_000_000;
  timer.reset(t0);
  const task = repo.createTask({ text: "Skip-Aufgabe" });
  timer.setActiveTask(task.id, t0);
  timer.start(t0); // 25-Min-Block

  const eightMin = 8 * 60_000;
  const snap = timer.skip(t0 + eightMin); // früh abbrechen
  assert.ok(snap.lastSession, "lastSession vorhanden");
  assert.equal(snap.lastSession.focusMs, eightMin);   // Ist = 8 Min, nicht Soll 25
  assert.equal(snap.lastSession.completed, false);    // abgebrochen
  assert.equal(snap.lastSession.taskId, task.id);
});

// ── Readiness fließt in die Planung: effectiveGoalHours im Snapshot (Welle 3 #13) ──
test("today.effectiveGoalHours ist im Snapshot vorhanden und plausibel", () => {
  const snap = timer.getSnapshot(14_000_000);
  assert.equal(typeof snap.today.effectiveGoalHours, "number");
  assert.equal(typeof snap.today.capacityMultiplier, "number");
  // Ohne Wearable-Daten: Multiplikator 1 → effektives == gesetztes Ziel.
  assert.equal(snap.today.capacityMultiplier, 1);
  assert.equal(snap.today.effectiveGoalHours, snap.today.goalHours);
});
