// Tests für die reine Pomodoro-Domäne (shared/pomodoro.js).
// Deterministisch durch feste now-Werte, kein DOM/IO.
import test from "node:test";
import assert from "node:assert/strict";

import {
  PHASES,
  STATUS,
  DEFAULT_SETTINGS,
  createInitialState,
  startPhase,
  pausePhase,
  resumePhase,
  resetSession,
  computeRemainingMs,
  advanceToNextPhase,
  selectPhase,
  sanitizeSettings,
  getPhaseDurationMs,
  formatMs,
} from "../shared/pomodoro.js";

// ── getPhaseDurationMs ───────────────────────────
test("getPhaseDurationMs liefert die Phasendauer in ms", () => {
  const s = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 };
  assert.equal(getPhaseDurationMs(PHASES.FOCUS, s), 25 * 60_000);
  assert.equal(getPhaseDurationMs(PHASES.SHORT_BREAK, s), 5 * 60_000);
  assert.equal(getPhaseDurationMs(PHASES.LONG_BREAK, s), 15 * 60_000);
});

// ── formatMs ─────────────────────────────────────
test("formatMs formatiert mm:ss und rundet auf (ceil)", () => {
  assert.equal(formatMs(0), "00:00");
  assert.equal(formatMs(1), "00:01"); // ceil auf 1 Sekunde
  assert.equal(formatMs(1_000), "00:01");
  assert.equal(formatMs(65_000), "01:05");
  assert.equal(formatMs(1_500_000), "25:00");
  assert.equal(formatMs(-5_000), "00:00"); // negativ -> 0
});

// ── sanitizeSettings (Clamping) ──────────────────
test("sanitizeSettings begrenzt und rundet Werte", () => {
  const s = sanitizeSettings({
    focusMinutes: 999,
    shortBreakMinutes: 0,
    longBreakMinutes: 1000,
    cyclesUntilLongBreak: 100,
    todayGoalHours: 99,
    autoStartNextPhase: 1,
    profileName: "  ",
  });
  assert.equal(s.focusMinutes, 90); // max 90
  assert.equal(s.shortBreakMinutes, 1); // min 1
  assert.equal(s.longBreakMinutes, 45); // max 45
  assert.equal(s.cyclesUntilLongBreak, 8); // max 8
  assert.equal(s.todayGoalHours, 16); // max 16
  assert.equal(s.autoStartNextPhase, true);
  assert.equal(s.profileName, DEFAULT_SETTINGS.profileName); // leer -> Default
});

test("sanitizeSettings clampt nach unten und rundet Nachkommastellen", () => {
  const s = sanitizeSettings({
    focusMinutes: 1, // < 5
    shortBreakMinutes: 4.6, // rundet -> 5
    longBreakMinutes: 2, // < 5
    cyclesUntilLongBreak: 1, // < 2
    todayGoalHours: 0.1, // < 0.5
    profileName: "  Bio  ",
  });
  assert.equal(s.focusMinutes, 5);
  assert.equal(s.shortBreakMinutes, 5);
  assert.equal(s.longBreakMinutes, 5);
  assert.equal(s.cyclesUntilLongBreak, 2);
  assert.equal(s.todayGoalHours, 0.5);
  assert.equal(s.profileName, "Bio"); // getrimmt
});

test("sanitizeSettings nutzt Defaults bei ungültigen Zahlen", () => {
  const s = sanitizeSettings({ focusMinutes: "abc", todayGoalHours: "x" });
  assert.equal(s.focusMinutes, DEFAULT_SETTINGS.focusMinutes);
  assert.equal(s.todayGoalHours, DEFAULT_SETTINGS.todayGoalHours);
});

// ── startPhase / computeRemainingMs ──────────────
test("startPhase setzt running, endsAt = now + remainingMs", () => {
  const s = DEFAULT_SETTINGS;
  const idle = createInitialState(s, 0);
  assert.equal(idle.status, STATUS.IDLE);
  assert.equal(idle.remainingMs, getPhaseDurationMs(PHASES.FOCUS, s));

  const started = startPhase(idle, s, 1_000);
  assert.equal(started.status, STATUS.RUNNING);
  assert.equal(started.endsAt, 1_000 + idle.remainingMs);
  assert.equal(started.phaseStartedAt, 1_000);

  // no-op, wenn bereits laufend
  assert.equal(startPhase(started, s, 5_000), started);
});

test("computeRemainingMs zählt nur im Lauf herunter (nie negativ)", () => {
  const s = DEFAULT_SETTINGS;
  const started = startPhase(createInitialState(s, 0), s, 1_000); // endsAt 1_501_000
  assert.equal(computeRemainingMs(started, 1_000), 1_500_000);
  assert.equal(computeRemainingMs(started, 501_000), 1_000_000);
  assert.equal(computeRemainingMs(started, 9_999_999), 0);

  const paused = pausePhase(started, 501_000);
  // Bei paused wird die eingefrorene Restzeit zurückgegeben
  assert.equal(computeRemainingMs(paused, 9_999_999), paused.remainingMs);
});

// ── pause / resume ───────────────────────────────
test("pausePhase friert Restzeit ein, resumePhase rechnet neu", () => {
  const s = DEFAULT_SETTINGS;
  const started = startPhase(createInitialState(s, 0), s, 1_000); // endsAt 1_501_000
  const paused = pausePhase(started, 501_000);
  assert.equal(paused.status, STATUS.PAUSED);
  assert.equal(paused.remainingMs, 1_000_000);
  assert.equal(paused.endsAt, null);

  // no-op, wenn nicht laufend
  assert.equal(pausePhase(paused, 600_000), paused);

  const resumed = resumePhase(paused, s, 2_000);
  assert.equal(resumed.status, STATUS.RUNNING);
  assert.equal(resumed.remainingMs, 1_000_000);
  assert.equal(resumed.endsAt, 2_000 + 1_000_000);

  // no-op, wenn bereits laufend
  assert.equal(resumePhase(resumed, s, 9_999), resumed);
});

// ── resetSession ─────────────────────────────────
test("resetSession setzt auf Fokus/idle zurück, behält aktive Aufgabe", () => {
  const s = DEFAULT_SETTINGS;
  let state = startPhase(createInitialState(s, 0), s, 1_000);
  state = { ...state, activeTaskId: 42, phase: PHASES.SHORT_BREAK, cycleInBlock: 2 };

  const reset = resetSession(state, s, 5_000);
  assert.equal(reset.status, STATUS.IDLE);
  assert.equal(reset.phase, PHASES.FOCUS);
  assert.equal(reset.cycleInBlock, 0);
  assert.equal(reset.remainingMs, getPhaseDurationMs(PHASES.FOCUS, s));
  assert.equal(reset.endsAt, null);
  assert.equal(reset.activeTaskId, 42); // bleibt erhalten
});

// ── advanceToNextPhase ───────────────────────────
test("advanceToNextPhase: Fokus -> kurze Pause, cycleInBlock steigt", () => {
  const s = { ...DEFAULT_SETTINGS, cyclesUntilLongBreak: 4, autoStartNextPhase: false };
  const base = { ...createInitialState(s, 0), status: STATUS.RUNNING, phase: PHASES.FOCUS, cycleInBlock: 0 };
  const next = advanceToNextPhase(base, s, 10_000);
  assert.equal(next.phase, PHASES.SHORT_BREAK);
  assert.equal(next.cycleInBlock, 1);
  assert.equal(next.status, STATUS.PAUSED); // autoStart false
  assert.equal(next.endsAt, null);
  assert.equal(next.remainingMs, getPhaseDurationMs(PHASES.SHORT_BREAK, s));
});

test("advanceToNextPhase: nach cyclesUntilLongBreak -> lange Pause, cycleInBlock zurück auf 0", () => {
  const s = { ...DEFAULT_SETTINGS, cyclesUntilLongBreak: 4, autoStartNextPhase: false };
  // cycleInBlock 3 -> progressed 4 >= 4 -> long-break
  const base = { ...createInitialState(s, 0), status: STATUS.RUNNING, phase: PHASES.FOCUS, cycleInBlock: 3 };
  const next = advanceToNextPhase(base, s, 20_000);
  assert.equal(next.phase, PHASES.LONG_BREAK);
  assert.equal(next.cycleInBlock, 0);
  assert.equal(next.remainingMs, getPhaseDurationMs(PHASES.LONG_BREAK, s));
});

test("advanceToNextPhase: aus Pause zurück zu Fokus (cycleInBlock unverändert)", () => {
  const s = DEFAULT_SETTINGS;
  const base = { ...createInitialState(s, 0), status: STATUS.RUNNING, phase: PHASES.SHORT_BREAK, cycleInBlock: 2 };
  const next = advanceToNextPhase(base, s, 30_000);
  assert.equal(next.phase, PHASES.FOCUS);
  assert.equal(next.cycleInBlock, 2);
});

test("advanceToNextPhase mit autoStart startet die nächste Phase sofort", () => {
  const s = { ...DEFAULT_SETTINGS, autoStartNextPhase: true };
  const base = { ...createInitialState(s, 0), status: STATUS.RUNNING, phase: PHASES.FOCUS, cycleInBlock: 0 };
  const next = advanceToNextPhase(base, s, 40_000);
  assert.equal(next.status, STATUS.RUNNING);
  assert.equal(next.endsAt, 40_000 + getPhaseDurationMs(PHASES.SHORT_BREAK, s));
  assert.equal(next.phaseStartedAt, 40_000);
});

test("kompletter Block: 4 Fokus-Phasen führen zur langen Pause", () => {
  const s = { ...DEFAULT_SETTINGS, cyclesUntilLongBreak: 4, autoStartNextPhase: false };
  let state = { ...createInitialState(s, 0), status: STATUS.RUNNING, phase: PHASES.FOCUS, cycleInBlock: 0 };
  const breaks = [];
  for (let i = 0; i < 4; i++) {
    state = advanceToNextPhase(state, s, 1_000 * (i + 1)); // Fokus -> Pause
    breaks.push(state.phase);
    if (state.phase !== PHASES.LONG_BREAK) {
      // Pause -> Fokus (Status wieder auf running für den nächsten Übergang)
      state = advanceToNextPhase({ ...state, status: STATUS.RUNNING }, s, 2_000 * (i + 1));
    }
  }
  assert.deepEqual(breaks, [
    PHASES.SHORT_BREAK,
    PHASES.SHORT_BREAK,
    PHASES.SHORT_BREAK,
    PHASES.LONG_BREAK,
  ]);
});

// ── selectPhase ──────────────────────────────────
test("selectPhase wählt Phase manuell und setzt auf idle zurück", () => {
  const s = DEFAULT_SETTINGS;
  const running = startPhase(createInitialState(s, 0), s, 1_000);
  const sel = selectPhase(running, s, PHASES.LONG_BREAK, 5_000);
  assert.equal(sel.status, STATUS.IDLE);
  assert.equal(sel.phase, PHASES.LONG_BREAK);
  assert.equal(sel.remainingMs, getPhaseDurationMs(PHASES.LONG_BREAK, s));
  assert.equal(sel.endsAt, null);

  // ungültige Phase -> unverändert
  assert.equal(selectPhase(running, s, "bogus", 5_000), running);
});
