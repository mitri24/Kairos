// Konstanten & Enums – kein DOM, kein Side-Effect

export const DIAL_MINUTES_MIN  = 10;
export const DIAL_MINUTES_MAX  = 90;
export const DIAL_RADIUS       = 90;
export const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;

export const STATUS = Object.freeze({
  IDLE:    "idle",
  RUNNING: "running",
  PAUSED:  "paused",
});

export const PHASE = Object.freeze({
  FOCUS:       "focus",
  SHORT_BREAK: "short-break",
  LONG_BREAK:  "long-break",
});

export const TODO_STORAGE_KEY = "adhd_pomodoro_todos";
