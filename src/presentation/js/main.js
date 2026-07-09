// Einstiegspunkt – orchestriert alle Module
import { STATUS } from "./constants.js";
import { confirmAction } from "./utils.js";
import { applyLocalAction, createPreviewPayload } from "./timerState.js";
import { renderMeta, startPauseBtn } from "./timerRenderer.js";
import { initDialEvents, renderClock, draftFocusMinutes } from "./dial.js";
import { initTodo } from "./todo.js";
import { isExtensionContext, send } from "./extension.js";
import * as backend from "../../infrastructure/backendSync.js";

const saveInfo      = document.getElementById("saveInfo");
const skipBtn       = document.getElementById("skipBtn");
const resetBtn      = document.getElementById("resetBtn");

let currentPayload  = null;
let renderInterval  = null;
let pollInterval    = null;
let saveInfoTimeout = null;

// Ist das autoritative Backend (PWA-Server) erreichbar? Dann teilen Extension und
// PWA denselben Timer. Sonst Fallback auf chrome.runtime bzw. lokale Vorschau.
let backendOnline   = false;

// ── Buttons ──────────────────────────────────────
startPauseBtn.addEventListener("click", async () => {
  pulse(startPauseBtn);
  await onToggleStartPause();
});

skipBtn.addEventListener("click", async () => {
  pulse(skipBtn);
  if (!confirmAction("SKIP")) return;
  await dispatch("SKIP");
  showInfo("Moved to the next phase");
});

resetBtn.addEventListener("click", async () => {
  pulse(resetBtn);
  if (!confirmAction("RESET")) return;
  await dispatch("RESET");
  showInfo("Reset");
});

// ── Bootstrap ────────────────────────────────────
bootstrap().catch((e) => { saveInfo.textContent = `Error: ${e.message}`; });

async function bootstrap() {
  addFullViewButton();

  backendOnline = await backend.isReachable();

  let data;
  if (backendOnline) {
    // Health-Check bestanden, State-Abruf kann trotzdem scheitern → sauber zurückfallen.
    try {
      data = snapshotToPayload(await backend.getState());
    } catch {
      backendOnline = false;
    }
  }
  if (!backendOnline) {
    data = isExtensionContext ? await send("GET_STATE") : createPreviewPayload();
  }
  apply(data);

  initDialEvents(() => currentPayload, persistSettings);
  initTodo();

  // Im Extension-Kontext IMMER auf Hintergrund-Updates hören (greift nur im
  // Fallback-Modus), damit das Popup nach degradeFromBackend nicht einfriert.
  if (isExtensionContext) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "STATE_UPDATED" && msg.payload && !backendOnline) apply(msg.payload);
    });
  }

  // Sekundentakt: nur Countdown neu zeichnen. Lokales Ticken nur im reinen
  // Vorschau-Modus (weder Backend noch Extension liefern den Zustand).
  renderInterval = setInterval(() => {
    if (!currentPayload) return;
    if (!backendOnline && !isExtensionContext) tickLocal();
    renderClock(currentPayload.state, currentPayload.settings);
  }, 1000);

  if (backendOnline) {
    // Autoritativen Zustand alle ~2 s vom Backend nachziehen.
    pollInterval = setInterval(async () => {
      try {
        apply(snapshotToPayload(await backend.getState()));
      } catch {
        degradeFromBackend();
      }
    }, 2000);
  }
}

// ── Aktionen ─────────────────────────────────────
async function onToggleStartPause() {
  if (!currentPayload) return;
  const { status } = currentPayload.state;
  if (status === STATUS.RUNNING) return dispatch("PAUSE");
  if (status === STATUS.PAUSED)  return dispatch("RESUME");
  return dispatch("START");
}

async function dispatch(type) {
  if (!currentPayload) return;
  if (backendOnline) {
    try {
      apply(snapshotToPayload(await backendAction(type)));
      return;
    } catch {
      degradeFromBackend(); // Backend verschwunden → auf Fallback umschalten
    }
  }
  if (isExtensionContext) { apply(await send(type)); return; }
  apply(applyLocalAction(currentPayload, type));
}

function backendAction(type) {
  switch (type) {
    case "START":  return backend.start();
    case "PAUSE":  return backend.pause();
    case "RESUME": return backend.resume();
    case "SKIP":   return backend.skip();
    case "RESET":  return backend.reset();
    default:       return backend.getState();
  }
}

// Backend nicht mehr erreichbar: Polling stoppen, künftig lokal/Extension weiter.
function degradeFromBackend() {
  if (!backendOnline) return;
  backendOnline = false;
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  // Sauberer Übergang: im Extension-Kontext den Hintergrund-State übernehmen
  // (danach hält der STATE_UPDATED-Listener das Popup aktuell).
  if (isExtensionContext) send("GET_STATE").then(apply).catch(() => {});
  showInfo("Offline: continuing locally");
}

// Backend-Snapshot ({ timer, settings, … }) auf das Popup-Format ({ state, settings }) mappen.
function snapshotToPayload(snap) {
  return { state: snap.timer, settings: snap.settings };
}

function apply(payload) {
  currentPayload = payload;
  const { state, settings } = payload;
  renderMeta(state, settings);
  renderClock(state, settings);
}

function tickLocal() {
  if (currentPayload?.state.status !== STATUS.RUNNING) return;
  const remaining = Math.max(0, currentPayload.state.endsAt - Date.now());
  currentPayload.state.remainingMs = remaining;
  if (remaining === 0) currentPayload = applyLocalAction(currentPayload, "SKIP");
}

async function persistSettings(message) {
  const settings = { focusMinutes: draftFocusMinutes };
  if (backendOnline) {
    // Fokusdauer wird serverseitig autoritativ verwaltet (kein Settings-Endpoint
    // in backendSync); der nächste Poll gleicht das Zifferblatt wieder ab.
    showInfo(message);
    return;
  }
  if (isExtensionContext) {
    apply(await send("UPDATE_SETTINGS", { settings }));
  } else {
    apply({
      ...currentPayload,
      settings: { ...currentPayload.settings, ...settings },
      state: {
        ...currentPayload.state,
        remainingMs:
          currentPayload.state.phase === "focus" && currentPayload.state.status !== STATUS.RUNNING
            ? settings.focusMinutes * 60_000
            : currentPayload.state.remainingMs,
      },
    });
  }
  showInfo(message);
}

// ── UI-Helfer ────────────────────────────────────
function showInfo(msg) {
  saveInfo.textContent = msg;
  if (saveInfoTimeout) clearTimeout(saveInfoTimeout);
  saveInfoTimeout = setTimeout(() => { saveInfo.textContent = ""; }, 1400);
}

function pulse(btn) {
  btn.classList.add("pressed");
  setTimeout(() => btn.classList.remove("pressed"), 120);
}

// Dezenter "Vollansicht öffnen"-Link im Header → öffnet die PWA in neuem Tab.
function addFullViewButton() {
  const head = document.querySelector(".head");
  if (!head) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "fullview-link";
  btn.textContent = "Open full view";
  btn.title = "Open full view";
  btn.addEventListener("click", () => {
    if (globalThis.chrome?.tabs?.create) chrome.tabs.create({ url: backend.BASE });
    else window.open(backend.BASE, "_blank", "noopener");
  });
  head.appendChild(btn);
}
