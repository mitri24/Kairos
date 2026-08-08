// Regressionstests für die in der Code-Review gefundenen Timer-Fixes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const DB = join(tmpdir(), `lernuhr-timerfix-${process.pid}.db`);
process.env.LERNUHR_DB = DB;

let timer, repo;
before(async () => {
  timer = await import("../server/timer.js");
  repo = await import("../server/repo.js");
  const auth = await import("../server/auth.js");
  const { setDefaultUserId } = await import("../server/authctx.js");
  const u = auth.findOrCreateUser("test@example.com");
  repo.ensureUser(u.id);
  setDefaultUserId(u.id);
});
after(() => {
  for (const suf of ["", "-wal", "-shm"]) { try { rmSync(DB + suf); } catch {} }
});

test("Aufgabenwechsel im laufenden Fokus rechnet der ALTEN Aufgabe ab, neue startet bei 0", () => {
  const A = repo.createTask({ text: "A" });
  const B = repo.createTask({ text: "B" });
  const t0 = 2_000_000;
  timer.setActiveTask(A.id, t0);
  timer.start(t0);
  timer.setActiveTask(B.id, t0 + 3 * 60_000);      // nach 3 Min wechseln

  let snap = timer.getSnapshot(t0 + 3 * 60_000);
  assert.equal(snap.tasks.find((t) => t.id === A.id).spentMs, 180_000, "A bekommt 3 Min");
  assert.equal(snap.tasks.find((t) => t.id === B.id).spentMs, 0, "B startet bei 0");

  timer.pause(t0 + 5 * 60_000);                     // 2 Min auf B
  snap = timer.getSnapshot(t0 + 5 * 60_000);
  assert.equal(snap.tasks.find((t) => t.id === B.id).spentMs, 120_000, "B bekommt 2 Min");
  assert.equal(snap.tasks.find((t) => t.id === A.id).spentMs, 180_000, "A unverändert");
});

test("Downtime-Nachhol-Tick pausiert statt Phantom-Sessions durchzuketten (autoStart)", () => {
  const t0 = 2_000_000;
  timer.reset(t0);
  timer.setSettings({ autoStartNextPhase: true, focusMinutes: 25 }, t0);
  timer.start(t0);                                  // Fokus, endsAt = t0 + 25 Min

  const later = t0 + 25 * 60_000 + 3 * 60 * 60_000; // 3 h nach Ablauf (Server war "aus")
  assert.equal(timer.tick(later), true, "eine Phase wird abgeschlossen");

  const st = repo.getTimerState();
  assert.equal(st.status, "paused", "nach Downtime pausiert (kein Auto-Chain)");
  assert.equal(st.endsAt, null);
  assert.equal(timer.tick(later + 1000), false, "kein weiteres Ketten");
});

test("normaler Live-Abschluss (kurz nach endsAt) respektiert autoStart weiterhin", () => {
  const t0 = 2_000_000;
  timer.reset(t0);
  timer.setSettings({ autoStartNextPhase: true, focusMinutes: 25, shortBreakMinutes: 5 }, t0);
  timer.start(t0);
  const st0 = repo.getTimerState();
  // ~1 s nach endsAt (Live-Vervollständigung, keine Downtime)
  assert.equal(timer.tick(st0.endsAt + 800), true);
  const st = repo.getTimerState();
  assert.equal(st.phase, "short-break", "auf Pause gewechselt");
  assert.equal(st.status, "running", "autoStart hält den Timer laufend");
});
