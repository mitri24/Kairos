// Reine Zustandsübergänge – kein DOM, kein Side-Effect
import { STATUS, PHASE } from "./constants.js";

function getPhaseDurationMs(phase, settings) {
  if (phase === PHASE.FOCUS)       return settings.focusMinutes      * 60_000;
  if (phase === PHASE.SHORT_BREAK) return settings.shortBreakMinutes * 60_000;
  return settings.longBreakMinutes * 60_000;
}

export function applyLocalAction(payload, type, now = Date.now()) {
  const { state, settings } = payload;

  if (type === "START") {
    const remainingMs = Math.max(1000, state.remainingMs || getPhaseDurationMs(state.phase, settings));
    return { ...payload, state: { ...state, status: STATUS.RUNNING, remainingMs, endsAt: now + remainingMs } };
  }

  if (type === "PAUSE") {
    if (state.status !== STATUS.RUNNING) return payload;
    return { ...payload, state: { ...state, status: STATUS.PAUSED, remainingMs: Math.max(0, state.endsAt - now), endsAt: null } };
  }

  if (type === "RESUME") {
    if (state.status !== STATUS.PAUSED) return payload;
    const remainingMs = Math.max(1000, state.remainingMs || getPhaseDurationMs(state.phase, settings));
    return { ...payload, state: { ...state, status: STATUS.RUNNING, remainingMs, endsAt: now + remainingMs } };
  }

  if (type === "RESET") {
    return {
      ...payload,
      state: { status: STATUS.IDLE, phase: PHASE.FOCUS, cycleInBlock: 0, remainingMs: settings.focusMinutes * 60_000, endsAt: null },
    };
  }

  if (type === "SKIP") {
    const { phase, cycleInBlock } = state;
    let nextPhase        = PHASE.FOCUS;
    let nextCycleInBlock = cycleInBlock;

    if (phase === PHASE.FOCUS) {
      const progressed = cycleInBlock + 1;
      if (progressed >= settings.cyclesUntilLongBreak) {
        nextPhase = PHASE.LONG_BREAK; nextCycleInBlock = 0;
      } else {
        nextPhase = PHASE.SHORT_BREAK; nextCycleInBlock = progressed;
      }
    }

    const nextRemainingMs = getPhaseDurationMs(nextPhase, settings);
    const keepsRunning    = state.status === STATUS.RUNNING;
    return {
      ...payload,
      state: {
        ...state,
        phase: nextPhase,
        cycleInBlock: nextCycleInBlock,
        remainingMs: nextRemainingMs,
        status: keepsRunning ? STATUS.RUNNING : STATUS.PAUSED,
        endsAt: keepsRunning ? now + nextRemainingMs : null,
      },
    };
  }

  return payload;
}

export function createPreviewPayload() {
  return {
    state:    { status: "idle", phase: "focus", cycleInBlock: 0, remainingMs: 25 * 60_000, endsAt: null },
    settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesUntilLongBreak: 4 },
  };
}
