// Bootstrap der PWA: verbindet Store, API, alle Feature-Module, Tick- & Reconcile-Loop.
import { createStore } from "/js/store.js";
import { api, onConnectivity } from "/js/api.js";
import { STATUS } from "/js/util.js";
import { initPush, pushState } from "/js/push.js";
import { initClock } from "/js/clock.js";
import { initNav } from "/js/nav.js";
import { initTimer } from "/js/timer.js";
import { initTasks } from "/js/tasks.js";
import { initExam } from "/js/exam.js";
import { initToday } from "/js/today.js";
import { initDayTimeline } from "/js/dayTimeline.js";
import { initTimeline } from "/js/timeline.js";
import { initTopics } from "/js/topics.js";
import { initWeek } from "/js/week.js";

const store = createStore();
const ctx = { store, api };
const modules = [];

onConnectivity((online) => {
  store.setOnline(online);
  const banner = document.getElementById("offlineBanner");
  if (banner) banner.hidden = online;
});

// ── NTP-Sync: Serverzeit-Offset mit Round-Trip-Korrektur ──
async function syncTime() {
  try {
    const t0 = Date.now();
    const { serverTime } = await api.getTime();
    const t1 = Date.now();
    store.setOffset(serverTime - (t0 + (t1 - t0) / 2));
  } catch { /* offline: lokale Uhr */ }
}

async function reconcile() {
  try { store.applySnapshot(await api.getState()); }
  catch { /* offline: Store bleibt */ }
}

// ── Phasenwechsel-Erkennung → Ton + Notification ──
let lastSig = null;
store.subscribe((s) => {
  const sig = `${s.timer.phase}|${s.timer.cycleInBlock}|${s.timer.status}`;
  // status "idle" = manuelle Phasenwahl über die Tabs (selectPhase) → kein Ton.
  // Echte Abschlüsse (advanceToNextPhase) sind running/paused.
  if (lastSig && lastSig !== sig && s.timer.status !== "idle") {
    const prevPhase = lastSig.split("|")[0];
    if (prevPhase !== s.timer.phase) {
      if (prevPhase === "focus") onPhaseComplete("focus", s.timer.phase);      // Fokus fertig
      else if (s.timer.phase === "focus") onPhaseComplete(prevPhase, "focus"); // Pause fertig
    }
  }
  lastSig = sig;
});

function onPhaseComplete(from, to) {
  chime(from === "focus");
  // Bei aktivem Web Push zeigt der Service Worker die Notification (auch bei
  // geschlossener App) — hier NICHT doppelt anzeigen. Nur als Fallback, wenn
  // Push nicht aktiv ist (Browser ohne Push / nicht abonniert), lokal anzeigen.
  if (!pushState.active && "Notification" in window && Notification.permission === "granted") {
    const map = { focus: "Focus", "short-break": "Short break", "long-break": "Long break" };
    // tag matches the service worker → the OS coalesces notifications from several
    // open tabs into ONE (instead of showing one per tab).
    new Notification(`${map[from]} done`, {
      body: `Next: ${map[to]}. Take a breath.`,
      tag: "lernuhr-phase",
      silent: false,
    });
  }
}

// Kurzer Ton via WebAudio (kein Asset, funktioniert offline).
let audioCtx = null;
function chime(twoTone) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const tones = twoTone ? [660, 880] : [520];
    tones.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = f;
      o.connect(g); g.connect(audioCtx.destination);
      const start = t + i * 0.18;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      o.start(start); o.stop(start + 0.36);
    });
  } catch { /* still ok */ }
}

// ── Tick-Loop (1 s): lokale Restzeit + Zeiger + Countdown ──
let reconciling = false;
function tick() {
  const t = store.state.timer;
  if (t.status === STATUS.RUNNING && t.endsAt) {
    const remaining = Math.max(0, t.endsAt - store.now());
    t.remainingMs = remaining;
    if (remaining === 0 && !reconciling) {
      reconciling = true;
      reconcile().finally(() => { reconciling = false; });
    }
  }
  for (const m of modules) m.tick?.();
}

// ── Start ──
function safeInit(name, initFn) {
  try {
    const handle = initFn(ctx);
    if (handle) modules.push(handle);
  } catch (e) {
    console.error(`[Lernuhr] Modul "${name}" konnte nicht starten:`, e);
  }
}

async function boot() {
  safeInit("clock", initClock);
  safeInit("push", initPush);
  safeInit("nav", initNav);
  safeInit("timer", initTimer);
  safeInit("tasks", initTasks);
  safeInit("exam", initExam);
  safeInit("today", initToday);
  safeInit("dayTimeline", initDayTimeline);
  safeInit("timeline", initTimeline);
  safeInit("topics", initTopics);
  safeInit("week", initWeek);

  await syncTime();
  await reconcile();

  setInterval(tick, 1000);
  setInterval(reconcile, 10000);
  setInterval(syncTime, 5 * 60 * 1000);

  document.addEventListener("visibilitychange", () => { if (!document.hidden) { syncTime(); reconcile(); } });
  window.addEventListener("focus", reconcile);

  // Notification-Erlaubnis beim ersten Timer-Start erbitten
  document.getElementById("toggleBtn")?.addEventListener("click", () => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  }, { once: true });

  tick();
}

boot();

// Service-Worker (PWA)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  // Push-Nachricht empfangen, während die Seite offen ist → sofort abgleichen,
  // damit Timer/Phase ohne Verzögerung aktualisiert werden (Ton via Phasen-Erkennung).
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "push") reconcile();
  });
}
