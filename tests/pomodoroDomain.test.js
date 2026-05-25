import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SETTINGS,
  createInitialState,
  sanitizeSettings,
  startPhase,
  pausePhase,
  resumePhase,
  advanceToNextPhase
} from "../src/domain/pomodoroDomain.js";

test("sanitizeSettings begrenzt Werte korrekt", () => {
  const settings = sanitizeSettings({
    focusMinutes: 999,
    shortBreakMinutes: 1,
    longBreakMinutes: "20",
    cyclesUntilLongBreak: -2,
    autoStartNextPhase: true
  });

  assert.equal(settings.focusMinutes, 90);
  assert.equal(settings.shortBreakMinutes, 3);
  assert.equal(settings.longBreakMinutes, 20);
  assert.equal(settings.cyclesUntilLongBreak, 2);
  assert.equal(settings.autoStartNextPhase, true);
});

test("start->pause->resume erhält Restzeit konsistent", () => {
  const settings = DEFAULT_SETTINGS;
  const idle = createInitialState(settings);
  const started = startPhase(idle, settings, 1_000);
  const paused = pausePhase({ ...started, endsAt: 61_000 }, 11_000);
  const resumed = resumePhase(paused, settings, 20_000);

  assert.equal(paused.status, "paused");
  assert.equal(paused.remainingMs, 50_000);
  assert.equal(resumed.status, "running");
  assert.equal(resumed.endsAt, 70_000);
});

test("nach Fokus kommt kurze Pause und später lange Pause", () => {
  const settings = { ...DEFAULT_SETTINGS, cyclesUntilLongBreak: 2, autoStartNextPhase: false };

  const base = {
    status: "running",
    phase: "focus",
    cycleInBlock: 0,
    remainingMs: 0,
    endsAt: 0,
    updatedAt: 0
  };

  const first = advanceToNextPhase(base, settings, 10_000);
  assert.equal(first.phase, "short-break");
  assert.equal(first.cycleInBlock, 1);

  const toFocus = advanceToNextPhase({ ...first, phase: "short-break" }, settings, 20_000);
  assert.equal(toFocus.phase, "focus");

  const secondFocusEnd = advanceToNextPhase({ ...toFocus, phase: "focus", cycleInBlock: 1 }, settings, 30_000);
  assert.equal(secondFocusEnd.phase, "long-break");
  assert.equal(secondFocusEnd.cycleInBlock, 0);
});
