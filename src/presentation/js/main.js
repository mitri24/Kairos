// Einstiegspunkt – orchestriert alle Module
import { STATUS, DIAL_MINUTES_MIN, DIAL_MINUTES_MAX } from "./constants.js";
import { clamp, confirmAction } from "./utils.js";
import { applyLocalAction, createPreviewPayload } from "./timerState.js";
import { renderMeta, renderTimer, startPauseBtn } from "./timerRenderer.js";
import { initDialEvents, renderDial, draftFocusMinutes } from "./dial.js";
import { initTodo } from "./todo.js";
import { isExtensionContext, send } from "./extension.js";

const saveInfo      = document.getElementById("saveInfo");
const skipBtn       = document.getElementById("skipBtn");
const resetBtn      = document.getElementById("resetBtn");

let currentPayload  = null;
let renderInterval  = null;
let saveInfoTimeout = null;

// ── Buttons ──────────────────────────────────────
startPauseBtn.addEventListener("click", async () => {
  pulse(startPauseBtn);
  await onToggleStartPause();
});

skipBtn.addEventListener("click", async () => {
  pulse(skipBtn);
  if (!confirmAction("SKIP")) return;
  await dispatch("SKIP");
  showInfo("次へ進みました");
});

resetBtn.addEventListener("click", async () => {
  pulse(resetBtn);
  if (!confirmAction("RESET")) return;
  await dispatch("RESET");
  showInfo("リセットしました");
});

// ── Bootstrap ────────────────────────────────────
bootstrap().catch((e) => { saveInfo.textContent = `エラー: ${e.message}`; });

async function bootstrap() {
  const data = isExtensionContext ? await send("GET_STATE") : createPreviewPayload();
  apply(data);

  initDialEvents(() => currentPayload, persistSettings);
  initTodo();

  renderInterval = setInterval(() => {
    if (!currentPayload) return;
    if (!isExtensionContext) tickLocal();
    renderTimer(currentPayload.state);
  }, 1000);

  if (isExtensionContext) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "STATE_UPDATED" && msg.payload) apply(msg.payload);
    });
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
  if (isExtensionContext) { apply(await send(type)); return; }
  apply(applyLocalAction(currentPayload, type));
}

function apply(payload) {
  currentPayload = payload;
  const { state, settings } = payload;
  renderDial(clamp(settings.focusMinutes, DIAL_MINUTES_MIN, DIAL_MINUTES_MAX));
  renderMeta(state, settings);
  renderTimer(state);
}

function tickLocal() {
  if (currentPayload?.state.status !== STATUS.RUNNING) return;
  const remaining = Math.max(0, currentPayload.state.endsAt - Date.now());
  currentPayload.state.remainingMs = remaining;
  if (remaining === 0) currentPayload = applyLocalAction(currentPayload, "SKIP");
}

async function persistSettings(message) {
  const settings = { focusMinutes: draftFocusMinutes };
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
