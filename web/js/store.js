// Beobachtbarer State-Container. Hält die Server-Momentaufnahme + Client-Felder.
// Feature-Module lesen store.state und abonnieren store.subscribe(render).

function emptyState() {
  return {
    serverOffsetMs: 0,   // Korrektur Client-Uhr → Serverzeit (NTP)
    online: true,
    loaded: false,
    serverTime: Date.now(),
    timer: { status: "idle", phase: "focus", cycleInBlock: 0, remainingMs: 1500000, endsAt: null, activeTaskId: null },
    settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesUntilLongBreak: 4, autoStartNextPhase: false, todayGoalHours: 4, profileName: "Exam focus", activeExamId: null },
    exams: [],
    tasks: [],
    topics: [],
    today: { dayKey: "", focusMs: 0, sessionsDone: 0, goalHours: 4 },
    recentMetrics: {},
    ui: { expandedTaskId: null },
  };
}

export function createStore() {
  const state = emptyState();
  const subs = new Set();

  function emit() { for (const fn of subs) { try { fn(state); } catch (e) { console.error(e); } } }

  return {
    state,

    // Server-Momentaufnahme übernehmen (Client-Felder bleiben erhalten).
    applySnapshot(snap) {
      if (!snap) return;
      state.serverTime = snap.serverTime ?? Date.now();
      if (snap.timer) state.timer = snap.timer;
      if (snap.settings) state.settings = snap.settings;
      if (snap.exams) state.exams = snap.exams;
      if (snap.tasks) state.tasks = snap.tasks;
      if (snap.topics) state.topics = snap.topics;
      if (snap.today) state.today = snap.today;
      if (snap.recentMetrics) state.recentMetrics = snap.recentMetrics;
      state.loaded = true;
      emit();
    },

    setOffset(ms) { state.serverOffsetMs = ms; },
    setOnline(on) { if (state.online !== on) { state.online = on; emit(); } },
    setUi(patch) { Object.assign(state.ui, patch); emit(); },

    // NTP-korrigierte aktuelle Zeit (epoch ms).
    now() { return Date.now() + state.serverOffsetMs; },

    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    emit,
  };
}
