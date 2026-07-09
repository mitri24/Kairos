// Gemeinsame, reine Pomodoro-Domänenlogik.
// Läuft unverändert in Browser (PWA), Node-Backend und Chrome-Extension.
// Kein DOM, kein Storage, kein Side-Effect — nur Zustandsübergänge & Zeit-Mathematik.

export const PHASES = Object.freeze({
  FOCUS: "focus",
  SHORT_BREAK: "short-break",
  LONG_BREAK: "long-break",
});

export const STATUS = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
});

export const DEFAULT_SETTINGS = Object.freeze({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesUntilLongBreak: 4,
  autoStartNextPhase: false,
  todayGoalHours: 4,
  profileName: "Prüfungsfokus",
});

// ── Zeit-Helfer ──────────────────────────────────
export function minutesToMs(minutes) {
  return Math.max(1, Number(minutes)) * 60 * 1000;
}

export function getPhaseDurationMs(phase, settings) {
  if (phase === PHASES.FOCUS) return minutesToMs(settings.focusMinutes);
  if (phase === PHASES.SHORT_BREAK) return minutesToMs(settings.shortBreakMinutes);
  return minutesToMs(settings.longBreakMinutes);
}

export function formatMs(value) {
  const seconds = Math.ceil(Math.max(0, value) / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// Dauer OHNE Sekunden – "nur h und min". "25 Min", "1 Std 05 Min", "2 Std".
// ceil=true für laufende Countdowns (bleibt bis zur vollen Minute stehen, statt
// vorzeitig herunterzuspringen); ceil=false (Default) für verstrichene Dauern.
export function formatDurationHM(value, ceil = false) {
  const ms = Math.max(0, value);
  const totalMin = ceil ? Math.ceil(ms / 60000) : Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h} Std ${String(m).padStart(2, "0")} Min`;
  if (h) return `${h} Std`;
  return `${m} Min`;
}

// ── Settings-Validierung ─────────────────────────
function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function clampFloat(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function sanitizeSettings(raw) {
  const base = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  return {
    focusMinutes: clampInt(base.focusMinutes, 5, 90, DEFAULT_SETTINGS.focusMinutes),
    shortBreakMinutes: clampInt(base.shortBreakMinutes, 1, 30, DEFAULT_SETTINGS.shortBreakMinutes),
    longBreakMinutes: clampInt(base.longBreakMinutes, 5, 45, DEFAULT_SETTINGS.longBreakMinutes),
    cyclesUntilLongBreak: clampInt(base.cyclesUntilLongBreak, 2, 8, DEFAULT_SETTINGS.cyclesUntilLongBreak),
    autoStartNextPhase: Boolean(base.autoStartNextPhase),
    todayGoalHours: clampFloat(base.todayGoalHours, 0.5, 16, DEFAULT_SETTINGS.todayGoalHours),
    profileName:
      typeof base.profileName === "string" && base.profileName.trim()
        ? base.profileName.trim()
        : DEFAULT_SETTINGS.profileName,
  };
}

// ── Zustands-Erzeugung ───────────────────────────
export function createInitialState(settings = DEFAULT_SETTINGS, now = Date.now()) {
  return {
    status: STATUS.IDLE,
    phase: PHASES.FOCUS,
    cycleInBlock: 0,
    remainingMs: getPhaseDurationMs(PHASES.FOCUS, settings),
    endsAt: null,
    activeTaskId: null,
    phaseStartedAt: null,
    updatedAt: now,
  };
}

export function computeRemainingMs(state, now = Date.now()) {
  if (state.status !== STATUS.RUNNING || !state.endsAt) return state.remainingMs;
  return Math.max(0, state.endsAt - now);
}

// ── Übergänge (immutable) ────────────────────────
export function startPhase(state, settings, now = Date.now()) {
  if (state.status === STATUS.RUNNING) return state;
  const remainingMs = Math.max(1000, state.remainingMs || getPhaseDurationMs(state.phase, settings));
  return {
    ...state,
    status: STATUS.RUNNING,
    remainingMs,
    endsAt: now + remainingMs,
    phaseStartedAt: now,
    updatedAt: now,
  };
}

export function pausePhase(state, now = Date.now()) {
  if (state.status !== STATUS.RUNNING) return state;
  return {
    ...state,
    status: STATUS.PAUSED,
    remainingMs: computeRemainingMs(state, now),
    endsAt: null,
    phaseStartedAt: null,
    updatedAt: now,
  };
}

export function resumePhase(state, settings, now = Date.now()) {
  if (state.status !== STATUS.PAUSED) return state;
  const remainingMs = Math.max(1000, state.remainingMs || getPhaseDurationMs(state.phase, settings));
  return {
    ...state,
    status: STATUS.RUNNING,
    remainingMs,
    endsAt: now + remainingMs,
    phaseStartedAt: now,
    updatedAt: now,
  };
}

export function resetSession(state, settings, now = Date.now()) {
  return {
    ...createInitialState(settings, now),
    // aktive Aufgabe bleibt beim Reset erhalten
    activeTaskId: state?.activeTaskId ?? null,
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
  } else {
    nextPhase = PHASES.FOCUS;
  }

  const remainingMs = getPhaseDurationMs(nextPhase, settings);
  const autoStart = Boolean(settings.autoStartNextPhase);
  return {
    ...state,
    status: autoStart ? STATUS.RUNNING : STATUS.PAUSED,
    phase: nextPhase,
    cycleInBlock,
    remainingMs,
    endsAt: autoStart ? now + remainingMs : null,
    phaseStartedAt: autoStart ? now : null,
    updatedAt: now,
  };
}

// Phase manuell wählen (Tabs im UI). Setzt Timer auf die Dauer der Phase zurück.
export function selectPhase(state, settings, phase, now = Date.now()) {
  if (![PHASES.FOCUS, PHASES.SHORT_BREAK, PHASES.LONG_BREAK].includes(phase)) return state;
  return {
    ...state,
    status: STATUS.IDLE,
    phase,
    remainingMs: getPhaseDurationMs(phase, settings),
    endsAt: null,
    phaseStartedAt: null,
    updatedAt: now,
  };
}

// Wird nach Settings-Änderung aufgerufen: passt die Restzeit an, wenn nicht läuft.
export function applySettings(state, settings, now = Date.now()) {
  if (state.status === STATUS.RUNNING) {
    return { ...state, updatedAt: now };
  }
  return {
    ...state,
    remainingMs: getPhaseDurationMs(state.phase, settings),
    endsAt: null,
    updatedAt: now,
  };
}

// Priorität P1 (dringend) … P4 (kann warten). Label-Helfer, geteilt vom UI.
export const PRIORITY = Object.freeze({ P1: 1, P2: 2, P3: 3, P4: 4 });

export function phaseLabelJa(phase) {
  if (phase === PHASES.FOCUS) return "Focus";
  if (phase === PHASES.SHORT_BREAK) return "Short break";
  return "Long break";
}

export function phaseLabelDe(phase) {
  if (phase === PHASES.FOCUS) return "Fokus";
  if (phase === PHASES.SHORT_BREAK) return "Kurze Pause";
  return "Lange Pause";
}
