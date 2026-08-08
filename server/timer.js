// Server-seitige Timer-Engine — autoritativ. Läuft auch ohne offenen Client weiter,
// damit PWA und Extension exakt denselben Timer teilen ("die beiden verbinden").
import * as domain from "../shared/pomodoro.js";
import * as repo from "./repo.js";
import * as calsync from "./calsync.js";
import { nowMs, dayKeyTz, localMinutesInTz } from "./lib/util.js";
import { computeHealthContext } from "./health/context.js";
import { runAs } from "./authctx.js";
import { nextOccurrenceKey, isRecurring } from "../shared/recurrence.js";
import { daysBetweenKeys } from "../shared/dateKey.js";
import { isQuietTime } from "../shared/quietHours.js";
import { computePace } from "../shared/pace.js";

const { STATUS, PHASES } = domain;

// Zeitzone des aktuellen Nutzers (Tages-Buckets + Ruhezeiten). Ohne Profil-Zone
// → Serverzeit-Fallback in dayKeyTz/localMinutesInTz.
function userTz() {
  return repo.getProfile()?.timezone || null;
}
// Overrun-Uhr räumen (Nutzer ist zum Fokus zurück / hat manuell gehandelt).
function clearOverrun(state) {
  return { ...state, breakOverSince: null, breakOverNotified: 0 };
}

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
    try { fn(evt); } catch (err) { console.error("[Kairos] phaseComplete-Listener:", err.message); }
  }
}

// ── Pausen-Overrun-Ereignis ──────────────────────
// index.js hängt hier den Push-Versand ein (Erinnerung, wenn eine Pause abgelaufen
// ist, der Fokus aber noch nicht wieder gestartet wurde).
const breakOverrunListeners = new Set();
export function onBreakOverrun(fn) {
  breakOverrunListeners.add(fn);
  return () => breakOverrunListeners.delete(fn);
}
function emitBreakOverrun(evt) {
  for (const fn of breakOverrunListeners) {
    try { fn(evt); } catch (err) { console.error("[Kairos] breakOverrun-Listener:", err.message); }
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
  repo.addDailyFocus(dayKeyTz(new Date(now), userTz()), ms, completed ? 1 : 0);
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
  // Profil zuerst → Zeitzone für die Tages-Buckets (Streak/„heute" nach Nutzer-Zone,
  // nicht Serverzeit — behebt die Verschiebung um Mitternacht/über Zeitzonen).
  const profile = repo.getProfile();
  const tz = profile?.timezone || null;
  const daily = repo.getDailyMetrics(dayKeyTz(new Date(now), tz));

  // Abgeleiteter Health-Kontext (Brücke zu KI/Planung).
  const contextSource = repo.resolveContextSource(profile);
  const health = computeHealthContext(repo.recentDaily(contextSource, 14), profile, now);

  // Readiness in die PLANUNG spiegeln (nicht nur Anzeige): das server-autoritative
  // Tages-Soll wird mit dem Kapazitäts-Multiplikator skaliert, damit alle Clients
  // (Today-Ring, Machbarkeits-Check, Extension) exakt dieselbe angepasste Zahl
  // verwenden, statt jeder für sich zu rechnen (oder Readiness ganz zu ignorieren).
  const capacityMultiplier = Number(health?.capacityMultiplier) || 1;
  const effectiveGoalHours = Math.round(settings.todayGoalHours * capacityMultiplier * 10) / 10;

  // Kalender-Termine des Tages (expandiert, Nutzer-Zeitzone) — für Timeline &
  // Auto-Plan. Fehler hier dürfen den Snapshot nie brechen.
  let calendarToday = [];
  try {
    calendarToday = calsync.eventsForDay(daily.dayKey, tz);
  } catch (err) {
    console.warn(`[Kairos] Kalender-Tageslese: ${err.message}`);
  }

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
    resources: repo.listResources(),
    navNodes: repo.listNavNodes(),
    // Wave 6: Bibliothek (ohne Datei-Blobs), Nutzer-Prefs, Abruf-Warteschlange.
    materials: repo.listMaterials(),
    prefs: repo.getPrefs(),
    reviews: repo.listReviews(),
    reviewsDueToday: repo.countDueReviews(daily.dayKey),
    // Jüngste Fokus-Session für das Post-Session-Review (Ist-Dauer, nicht Soll).
    lastSession: repo.lastFocusSession(),
    // Gelerntes Tempo (Ist/Soll je Schwierigkeit) — Basis für Vorschläge & Plan.
    pace: computePace(tasks),
    // Heutige Kalender-Termine (Busy-Blöcke der Timeline, Planungs-Hindernisse).
    calendarToday,
    today: {
      dayKey: daily.dayKey,
      focusMs: daily.focusMs + live,
      sessionsDone: daily.sessionsDone,
      goalHours: settings.todayGoalHours,
      // Readiness-angepasstes Tages-Soll (Planungsbasis, s. o.).
      effectiveGoalHours,
      capacityMultiplier,
    },
    // Tages-Fokuszeit der letzten ~6 Wochen für den Wochenkalender.
    recentMetrics: (() => {
      const from = dayKeyTz(new Date(now - 41 * 86_400_000), tz);
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
  repo.saveTimerState(clearOverrun(domain.startPhase(state, settings, now)));
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
  repo.saveTimerState(clearOverrun(domain.resumePhase(state, settings, now)));
  return getSnapshot(now);
}

export function skip(now = nowMs()) {
  const state = repo.getTimerState();
  const settings = repo.getSettings();
  if (state.status === STATUS.RUNNING && state.phase === PHASES.FOCUS) accrueFocus(state, now, { completed: false });
  repo.saveTimerState(clearOverrun(domain.advanceToNextPhase(state, settings, now)));
  return getSnapshot(now);
}

export function reset(now = nowMs()) {
  const state = repo.getTimerState();
  const settings = repo.getSettings();
  if (state.status === STATUS.RUNNING && state.phase === PHASES.FOCUS) accrueFocus(state, now, { completed: false });
  repo.saveTimerState(clearOverrun(domain.resetSession(state, settings, now)));
  return getSnapshot(now);
}

export function selectPhase(phase, now = nowMs()) {
  const state = repo.getTimerState();
  const settings = repo.getSettings();
  if (state.status === STATUS.RUNNING && state.phase === PHASES.FOCUS) accrueFocus(state, now, { completed: false });
  repo.saveTimerState(clearOverrun(domain.selectPhase(state, settings, phase, now)));
  return getSnapshot(now);
}

export function setSettings(patch, now = nowMs()) {
  const cur = repo.getSettings();
  const merged = domain.sanitizeSettings({ ...cur, ...patch });
  // Nicht-Domain-Felder separat durchreichen (sanitizeSettings verwirft sie).
  const activeExamId = patch.activeExamId !== undefined ? patch.activeExamId : cur.activeExamId;
  const dndEnabled = patch.dndEnabled !== undefined ? !!patch.dndEnabled : cur.dndEnabled;
  const dndStartMin = patch.dndStartMin !== undefined ? patch.dndStartMin : cur.dndStartMin;
  const dndEndMin = patch.dndEndMin !== undefined ? patch.dndEndMin : cur.dndEndMin;
  const remindTasks = patch.remindTasks !== undefined ? !!patch.remindTasks : cur.remindTasks;
  const remindLeadMin = patch.remindLeadMin !== undefined ? patch.remindLeadMin : cur.remindLeadMin;
  repo.saveSettings({ ...merged, activeExamId, dndEnabled, dndStartMin, dndEndMin, remindTasks, remindLeadMin });
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

// Aufgabe ändern — mit Timer-Kopplung. Wird die GERADE AKTIVE Aufgabe als erledigt
// gemeldet, wird sie vom laufenden Fokus ENTKOPPELT: die bis jetzt verstrichene
// Fokuszeit wird ihr noch fair gutgeschrieben, danach zeigt der Timer auf keine
// Aufgabe mehr. Sonst liefe die Fokuszeit weiter auf die fertige Aufgabe (der
// Block läuft ja weiter) und überzeichnete ihren Aufwand.
export function updateTask(id, patch, now = nowMs()) {
  const before = repo.getTask(id);
  const state = repo.getTimerState();
  const wasActive = state.activeTaskId != null && Number(id) === Number(state.activeTaskId);
  repo.updateTask(id, patch);
  // Wiederkehrende Aufgabe frisch abgehakt → nächste Instanz einplanen.
  if (patch.done === true && before && !before.done && isRecurring(before.recurrence)) {
    spawnNextOccurrence(before, now);
  }
  if (wasActive && patch.done === true) {
    // setActiveTask(null) schreibt den Rest-Fokus der alten (nun fertigen) Aufgabe
    // gut und räumt anschließend aktiven Zeiger + active-Flag.
    return setActiveTask(null, now);
  }
  return getSnapshot(now);
}

// Nächste Instanz einer wiederkehrenden Aufgabe erzeugen (gleiche Uhrzeit/Fach/Prio;
// Ressourcen bleiben an der Ur-Instanz — die Serie verkettet über recur_parent_id).
function spawnNextOccurrence(task, now) {
  const base = task.plannedDate || dayKeyTz(new Date(now), userTz());
  const nextKey = nextOccurrenceKey(task.recurrence, base);
  if (!nextKey) return;
  const deltaDays = daysBetweenKeys(base, nextKey) || 0;
  const nextDue = task.dueDate != null ? task.dueDate + deltaDays * 86_400_000 : null;
  repo.createTask({
    examId: task.examId, text: task.text, subject: task.subject, priority: task.priority,
    dueDate: nextDue, plannedDate: nextKey, estMinutes: task.estMinutes,
    scheduledMin: task.scheduledMin, recurrence: task.recurrence,
    recurParentId: task.recurParentId || task.id,
    difficulty: task.difficulty, topicId: task.topicId,
    room: task.room, location: task.location, mapsUrl: task.mapsUrl,
    schedSource: task.scheduledMin != null ? "user" : null,
  });
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

// ── Pausen-Overrun-Erinnerung ────────────────────
const BREAK_OVERRUN_FIRST_MS = 3 * 60_000;    // erste Erinnerung 3 min nach Pausenende
const BREAK_OVERRUN_REPEAT_MS = 6 * 60_000;   // danach alle 6 min
const BREAK_OVERRUN_MAX = 3;                   // höchstens 3 Erinnerungen, dann Ruhe

// Liegt „jetzt" (in der Nutzer-Zeitzone) im Ruhezeiten-Fenster? → kein Push.
function withinQuietHours(settings, now) {
  if (!settings.dndEnabled) return false;
  const min = localMinutesInTz(now, userTz());
  return isQuietTime(min, { enabled: true, startMin: settings.dndStartMin, endMin: settings.dndEndMin });
}

// Über ALLE Nutzer mit laufendem Timer ODER offener Overrun-Uhr ticken (jeder in
// seinem eigenen ALS-Nutzerkontext, damit repo korrekt skopiert).
export function tick(now = nowMs()) {
  let any = false;
  for (const userId of repo.runningTimerUserIds()) {
    runAs(userId, () => { if (tickUser(userId, now)) any = true; });
  }
  return any;
}

function tickUser(userId, now) {
  const state = repo.getTimerState();
  const settings = repo.getSettings();
  const quiet = withinQuietHours(settings, now);

  // ── A) Laufende Phase real abgelaufen? ──
  if (state.status === STATUS.RUNNING && state.endsAt && now >= state.endsAt) {
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
    // Pause endete → pausierter Fokus: Overrun-Uhr stellen (Erinnerung, falls der
    // Nutzer nicht zurückkommt). In allen anderen Fällen die Uhr räumen.
    if (state.phase !== PHASES.FOCUS && next.phase === PHASES.FOCUS && next.status === STATUS.PAUSED) {
      next = { ...next, breakOverSince: state.endsAt, breakOverNotified: 0 };
    } else {
      next = { ...next, breakOverSince: null, breakOverNotified: 0 };
    }
    repo.saveTimerState(next);

    // Benachrichtigen, solange der Abschluss aktuell genug ist (deckt kurzen Sleep
    // ab) UND außerhalb der Ruhezeiten (DND).
    if (now - state.endsAt <= NOTIFY_GRACE_MS && !quiet) {
      emitPhaseComplete({ userId, from: state.phase, to: next.phase, completedAt: state.endsAt });
    }
    return true; // Phase abgeschlossen — Clients sollten Sound/Notification zeigen
  }

  // ── B) Pausen-Overrun: Fokus pausiert nach Pausenende, Nutzer noch nicht zurück ──
  if (state.status === STATUS.PAUSED && state.phase === PHASES.FOCUS && state.breakOverSince) {
    const overMs = now - state.breakOverSince;
    const n = state.breakOverNotified || 0;
    if (n >= BREAK_OVERRUN_MAX) return false;      // ausgereizt (Uhr wurde beim letzten Nudge geräumt)
    const dueAt = BREAK_OVERRUN_FIRST_MS + n * BREAK_OVERRUN_REPEAT_MS;
    if (overMs < dueAt) return false;              // noch nicht fällig
    if (quiet) return false;                       // in Ruhezeit nicht stören; später erneut prüfen
    const nextN = n + 1;
    repo.saveTimerState({
      ...state,
      breakOverNotified: nextN,
      breakOverSince: nextN >= BREAK_OVERRUN_MAX ? null : state.breakOverSince, // nach dem letzten Nudge Ruhe
    });
    emitBreakOverrun({ userId, minutesOver: Math.round(overMs / 60000) });
    return true;
  }

  return false;
}
