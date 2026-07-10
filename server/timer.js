// Server-seitige Timer-Engine — autoritativ. Läuft auch ohne offenen Client weiter,
// damit PWA und Extension exakt denselben Timer teilen ("die beiden verbinden").
import * as domain from "../shared/pomodoro.js";
import * as repo from "./repo.js";
import { nowMs, dayKey } from "./lib/util.js";
import { computeHealthContext } from "./health/context.js";

const { STATUS, PHASES } = domain;

// ── Phasenabschluss-Ereignis ─────────────────────
// Entkoppelt: index.js hängt hier den Push-Versand ein. tick() bleibt boolean,
// damit bestehende Aufrufer/Tests unverändert funktionieren.
const phaseCompleteListeners = new Set();
export function onPhaseComplete(fn) {
  phaseCompleteListeners.add(fn);
  return () => phaseCompleteListeners.delete(fn);
}
function emitPhaseComplete(evt) {
  for (const fn of phaseCompleteListeners) {
    try { fn(evt); } catch (err) { console.error("[Lernuhr] phaseComplete-Listener:", err.message); }
  }
}

// Berechnet die im laufenden Fokus bereits verstrichene (noch nicht persistierte) Fokuszeit.
function liveFocusMs(state, now) {
  if (state.status !== STATUS.RUNNING || state.phase !== PHASES.FOCUS || !state.phaseStartedAt) return 0;
  const cap = state.endsAt ?? now;
  return Math.max(0, Math.min(now, cap) - state.phaseStartedAt);
}

// Schreibt verstrichene Fokuszeit in Tages-Metrik + aktive Aufgabe und loggt die Session.
function accrueFocus(state, now, { completed } = { completed: false }) {
  const ms = liveFocusMs(state, now);
  if (ms <= 0) return 0;
  repo.addDailyFocus(dayKey(new Date(now)), ms, completed ? 1 : 0);
  if (state.activeTaskId != null) repo.addTaskSpent(state.activeTaskId, ms);
  repo.logSession({
    taskId: state.activeTaskId,
    phase: PHASES.FOCUS,
    startedAt: state.phaseStartedAt,
    endedAt: now,
    focusMs: ms,
    completed,
  });
  return ms;
}

// Vollständige Momentaufnahme für Clients (mit Live-Fokus, ohne Persistenz-Nebenwirkung).
export function getSnapshot(now = nowMs()) {
  const settings = repo.getSettings();
  const state = repo.getTimerState();
  const tasks = repo.listTasks();
  const live = liveFocusMs(state, now);

  // Live-Fokus in die Anzeige mischen (aktive Aufgabe + Tagesziel)
  if (live > 0 && state.activeTaskId != null) {
    const t = tasks.find((x) => x.id === state.activeTaskId);
    if (t) t.spentMs += live;
  }
  const daily = repo.getDailyMetrics(dayKey(new Date(now)));

  // Persönliches Profil + abgeleiteter Health-Kontext (Brücke zu KI/Planung).
  const profile = repo.getProfile();
  const contextSource = repo.resolveContextSource(profile);
  const health = computeHealthContext(repo.recentDaily(contextSource, 14), profile, now);

  return {
    serverTime: now,
    timer: {
      status: state.status,
      phase: state.phase,
      cycleInBlock: state.cycleInBlock,
      remainingMs: domain.computeRemainingMs(state, now),
      endsAt: state.endsAt,
      activeTaskId: state.activeTaskId,
      updatedAt: state.updatedAt,
    },
    settings,
    profile,
    health,
    exams: repo.listExams(),
    tasks,
    topics: repo.listTopics(),
    notes: repo.listNotes(),
    today: {
      dayKey: daily.dayKey,
      focusMs: daily.focusMs + live,
      sessionsDone: daily.sessionsDone,
      goalHours: settings.todayGoalHours,
    },
    // Tages-Fokuszeit der letzten ~6 Wochen für den Wochenkalender.
    recentMetrics: (() => {
      const from = dayKey(new Date(now - 41 * 86_400_000));
      const m = repo.getRecentMetrics(from);
      if (live > 0) { // Live-Fokus in den heutigen Tag mischen
        const k = daily.dayKey;
        m[k] = { focusMs: (m[k]?.focusMs || 0) + live, sessionsDone: m[k]?.sessionsDone || 0 };
      }
      return m;
    })(),
  };
}

// ── Aktionen ─────────────────────────────────────
export function start(now = nowMs()) {
  const state = repo.getTimerState();
  const settings = repo.getSettings();
  repo.saveTimerState(domain.startPhase(state, settings, now));
  return getSnapshot(now);
}

export function pause(now = nowMs()) {
  const state = repo.getTimerState();
  if (state.status === STATUS.RUNNING && state.phase === PHASES.FOCUS) accrueFocus(state, now, { completed: false });
  repo.saveTimerState(domain.pausePhase(state, now));
  return getSnapshot(now);
}

export function resume(now = nowMs()) {
  const state = repo.getTimerState();
  const settings = repo.getSettings();
  repo.saveTimerState(domain.resumePhase(state, settings, now));
  return getSnapshot(now);
}

export function skip(now = nowMs()) {
  const state = repo.getTimerState();
  const settings = repo.getSettings();
  if (state.status === STATUS.RUNNING && state.phase === PHASES.FOCUS) accrueFocus(state, now, { completed: false });
  repo.saveTimerState(domain.advanceToNextPhase(state, settings, now));
  return getSnapshot(now);
}

export function reset(now = nowMs()) {
  const state = repo.getTimerState();
  const settings = repo.getSettings();
  if (state.status === STATUS.RUNNING && state.phase === PHASES.FOCUS) accrueFocus(state, now, { completed: false });
  repo.saveTimerState(domain.resetSession(state, settings, now));
  return getSnapshot(now);
}

export function selectPhase(phase, now = nowMs()) {
  const state = repo.getTimerState();
  const settings = repo.getSettings();
  if (state.status === STATUS.RUNNING && state.phase === PHASES.FOCUS) accrueFocus(state, now, { completed: false });
  repo.saveTimerState(domain.selectPhase(state, settings, phase, now));
  return getSnapshot(now);
}

export function setSettings(patch, now = nowMs()) {
  const merged = domain.sanitizeSettings({ ...repo.getSettings(), ...patch });
  // activeExamId separat durchreichen (nicht Teil der Domain-Settings)
  const activeExamId = patch.activeExamId !== undefined ? patch.activeExamId : repo.getSettings().activeExamId;
  repo.saveSettings({ ...merged, activeExamId });
  repo.saveTimerState(domain.applySettings(repo.getTimerState(), merged, now));
  return getSnapshot(now);
}

export function setActiveTask(taskId, now = nowMs()) {
  const state = repo.getTimerState();
  // Läuft ein Fokus? Bisherige Zeit der ALTEN Aufgabe gutschreiben und den Zähler
  // ab jetzt neu starten, damit die neue Aufgabe nur ab dem Wechsel akkumuliert.
  const runningFocus = state.status === STATUS.RUNNING && state.phase === PHASES.FOCUS;
  if (runningFocus) accrueFocus(state, now, { completed: false });
  repo.setActiveTask(taskId);
  repo.saveTimerState({
    ...state,
    activeTaskId: taskId ?? null,
    phaseStartedAt: runningFocus ? now : state.phaseStartedAt,
    updatedAt: now,
  });
  return getSnapshot(now);
}

// ── Tick: Auto-Abschluss abgelaufener Phasen ─────
// Grenze, ab der ein abgelaufenes endsAt als "Server war offline" gilt (statt
// einer normalen, ~1 s späten Live-Vervollständigung). Steuert die AUTO-Fortsetzung.
const DOWNTIME_GRACE_MS = 60_000;
// Fenster, in dem ein Phasenabschluss noch eine Benachrichtigung wert ist. Größer
// als die Auto-Advance-Grace, damit ein kurzer Laptop-Sleep (Deckel zu, >60 s) die
// Push-Notification NICHT verschluckt — aber ein stundenlang toter Server keine
// uralten "Fokus beendet"-Pushes mehr auslöst.
const NOTIFY_GRACE_MS = 10 * 60_000;

export function tick(now = nowMs()) {
  const state = repo.getTimerState();
  if (state.status !== STATUS.RUNNING || !state.endsAt) return false;
  if (now < state.endsAt) return false;

  const settings = repo.getSettings();
  const wasFocus = state.phase === PHASES.FOCUS;
  if (wasFocus) accrueFocus(state, state.endsAt, { completed: true });

  let next = domain.advanceToNextPhase(state, settings, state.endsAt);
  // Nachhol-Tick nach Downtime: NICHT automatisch durch alle abgelaufenen Phasen
  // ketten (das würde Phantom-Fokus-Sessions gutschreiben). Nach der einen
  // unterbrochenen Phase pausieren — der Nutzer setzt selbst fort.
  const fresh = now - state.endsAt <= DOWNTIME_GRACE_MS;
  if (!fresh && next.status === STATUS.RUNNING) {
    next = { ...next, status: STATUS.PAUSED, endsAt: null, phaseStartedAt: null };
  }
  repo.saveTimerState(next);

  // Benachrichtigen, solange der Abschluss noch aktuell genug ist (deckt kurzen
  // Sleep ab), aber nicht für längst abgelaufene Phasen nach langem Server-Ausfall.
  if (now - state.endsAt <= NOTIFY_GRACE_MS) {
    emitPhaseComplete({ from: state.phase, to: next.phase, completedAt: state.endsAt });
  }

  return true; // Phase abgeschlossen — Clients sollten Sound/Notification zeigen
}
