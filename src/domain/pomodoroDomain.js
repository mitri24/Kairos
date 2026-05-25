export const PHASES = {
  FOCUS: "focus",
  SHORT_BREAK: "short-break",
  LONG_BREAK: "long-break"
};

export const STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused"
};

export const DEFAULT_SETTINGS = Object.freeze({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesUntilLongBreak: 4,
  autoStartNextPhase: false,
  profileName: "Prüfungsfokus"
});

export function minutesToMs(minutes) {
  return Math.max(1, Number(minutes)) * 60 * 1000;
}

export function getPhaseDurationMs(phase, settings) {
  if (phase === PHASES.FOCUS) return minutesToMs(settings.focusMinutes);
  if (phase === PHASES.SHORT_BREAK) return minutesToMs(settings.shortBreakMinutes);
  return minutesToMs(settings.longBreakMinutes);
}

export function createInitialState(settings = DEFAULT_SETTINGS) {
  return {
    status: STATUS.IDLE,
    phase: PHASES.FOCUS,
    cycleInBlock: 0,
    remainingMs: getPhaseDurationMs(PHASES.FOCUS, settings),
    endsAt: null,
    updatedAt: Date.now()
  };
}

export function sanitizeSettings(raw) {
  const focusMinutes = clampInt(raw?.focusMinutes, 10, 90, DEFAULT_SETTINGS.focusMinutes);
  const shortBreakMinutes = clampInt(raw?.shortBreakMinutes, 3, 30, DEFAULT_SETTINGS.shortBreakMinutes);
  const longBreakMinutes = clampInt(raw?.longBreakMinutes, 10, 45, DEFAULT_SETTINGS.longBreakMinutes);
  const cyclesUntilLongBreak = clampInt(raw?.cyclesUntilLongBreak, 2, 6, DEFAULT_SETTINGS.cyclesUntilLongBreak);

  return {
    focusMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    cyclesUntilLongBreak,
    autoStartNextPhase: Boolean(raw?.autoStartNextPhase),
    profileName: typeof raw?.profileName === "string" && raw.profileName.trim()
      ? raw.profileName.trim()
      : DEFAULT_SETTINGS.profileName
  };
}

export function computeRemainingMs(state, now = Date.now()) {
  if (state.status !== STATUS.RUNNING || !state.endsAt) return state.remainingMs;
  return Math.max(0, state.endsAt - now);
}

export function startPhase(state, settings, now = Date.now()) {
  const remainingMs = Math.max(1000, state.remainingMs || getPhaseDurationMs(state.phase, settings));
  return {
    ...state,
    status: STATUS.RUNNING,
    remainingMs,
    endsAt: now + remainingMs,
    updatedAt: now
  };
}

export function pausePhase(state, now = Date.now()) {
  if (state.status !== STATUS.RUNNING) return state;
  const remainingMs = computeRemainingMs(state, now);
  return {
    ...state,
    status: STATUS.PAUSED,
    remainingMs,
    endsAt: null,
    updatedAt: now
  };
}

export function resumePhase(state, settings, now = Date.now()) {
  if (state.status !== STATUS.PAUSED) return state;
  return startPhase({ ...state, remainingMs: Math.max(1000, state.remainingMs) }, settings, now);
}

export function resetSession(settings, now = Date.now()) {
  return {
    ...createInitialState(settings),
    updatedAt: now
  };
}

export function advanceToNextPhase(state, settings, now = Date.now()) {
  const fromPhase = state.phase;
  let nextPhase = PHASES.FOCUS;
  let cycleInBlock = state.cycleInBlock;

  if (fromPhase === PHASES.FOCUS) {
    const progressed = cycleInBlock + 1;
    if (progressed >= settings.cyclesUntilLongBreak) {
      nextPhase = PHASES.LONG_BREAK;
      cycleInBlock = 0;
    } else {
      nextPhase = PHASES.SHORT_BREAK;
      cycleInBlock = progressed;
    }
  }

  if (fromPhase === PHASES.SHORT_BREAK || fromPhase === PHASES.LONG_BREAK) {
    nextPhase = PHASES.FOCUS;
  }

  const remainingMs = getPhaseDurationMs(nextPhase, settings);
  return {
    ...state,
    status: settings.autoStartNextPhase ? STATUS.RUNNING : STATUS.PAUSED,
    phase: nextPhase,
    cycleInBlock,
    remainingMs,
    endsAt: settings.autoStartNextPhase ? now + remainingMs : null,
    updatedAt: now
  };
}

export function applySettings(state, settings, now = Date.now()) {
  if (state.status === STATUS.RUNNING) {
    return {
      ...state,
      updatedAt: now
    };
  }

  if (state.phase === PHASES.FOCUS) {
    return {
      ...state,
      remainingMs: getPhaseDurationMs(PHASES.FOCUS, settings),
      updatedAt: now
    };
  }

  return {
    ...state,
    updatedAt: now
  };
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
