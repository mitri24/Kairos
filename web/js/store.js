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
    profile: {},
    health: { hasData: false, capacityMultiplier: 1, recommendation: "unknown", reasons: [] },
    exams: [],
    tasks: [],
    topics: [],
    notes: [],
    resources: [],
    materials: [],
    navNodes: [],
    prefs: {},
    reviews: [],
    reviewsDueToday: 0,
    today: { dayKey: "", focusMs: 0, sessionsDone: 0, goalHours: 4, effectiveGoalHours: 4, capacityMultiplier: 1 },
    recentMetrics: {},
    pace: { overall: { factor: null, n: 0 }, byDifficulty: {} },
    calendarToday: [],
    lastSession: null,
    ui: { expandedTaskId: null, examTab: "topics", notesFilter: null, selectedTopicId: null, libraryFilter: null, openNoteId: null },
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
      if (snap.profile) state.profile = snap.profile;
      if (snap.health) state.health = snap.health;
      if (snap.exams) state.exams = snap.exams;
      if (snap.tasks) state.tasks = snap.tasks;
      if (snap.topics) state.topics = snap.topics;
      if (snap.notes) state.notes = snap.notes;
      if (snap.resources) state.resources = snap.resources;
      if (snap.materials) state.materials = snap.materials;
      if (snap.navNodes) state.navNodes = snap.navNodes;
      if (snap.prefs) state.prefs = snap.prefs;
      if (snap.reviews) state.reviews = snap.reviews;
      if (snap.reviewsDueToday !== undefined) state.reviewsDueToday = snap.reviewsDueToday;
      if (snap.today) state.today = snap.today;
      if (snap.recentMetrics) state.recentMetrics = snap.recentMetrics;
      if (snap.pace) state.pace = snap.pace;
      if (snap.calendarToday) state.calendarToday = snap.calendarToday;
      if (snap.lastSession !== undefined) state.lastSession = snap.lastSession;
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
