// Timer-Rendering: Labels, Button-Zustand und Card-States (ohne Countdown-Zahl —
// die Restzeit zeigt das ablaufende Zifferblatt in dial.js).
import { STATUS, PHASE } from "./constants.js";
import { phaseText } from "./utils.js";
import { icon } from "./icons.js";

const phaseLabel  = document.getElementById("phaseLabel");
const statusLabel = document.getElementById("statusLabel");
const cycleLabel  = document.getElementById("cycleLabel");
const timerCard   = document.getElementById("timerCard");

export const startPauseBtn = document.getElementById("startPauseBtn");

export function renderMeta(state, settings) {
  if (phaseLabel) phaseLabel.textContent = phaseText(state.phase);
  if (cycleLabel) cycleLabel.textContent = `Set ${state.cycleInBlock + 1}/${settings.cyclesUntilLongBreak}`;
  if (timerCard) timerCard.dataset.phase = state.phase;
  renderVisualState(state);
  renderStartPauseLabel(state.status);
}

// Icon-only-Button: das SVG bleibt dekorativ, die Bedeutung tragen
// aria-label und title (werden hier je Zustand mitgeführt).
function renderStartPauseLabel(status) {
  if (status === STATUS.RUNNING) {
    startPauseBtn.innerHTML = icon("pause", { size: 20 });
    startPauseBtn.setAttribute("aria-label", "Pause");
    startPauseBtn.setAttribute("title",      "Pause");
  } else if (status === STATUS.PAUSED) {
    startPauseBtn.innerHTML = icon("play", { size: 20 });
    startPauseBtn.setAttribute("aria-label", "Resume");
    startPauseBtn.setAttribute("title",      "Resume");
  } else {
    startPauseBtn.innerHTML = icon("play", { size: 20 });
    startPauseBtn.setAttribute("aria-label", "Start");
    startPauseBtn.setAttribute("title",      "Start");
  }
}

function renderVisualState(state) {
  timerCard.classList.remove("state-idle", "state-paused", "state-running-focus", "state-running-break");

  if (state.status === STATUS.RUNNING && state.phase === PHASE.FOCUS) {
    timerCard.classList.add("state-running-focus");
    if (statusLabel) statusLabel.textContent = "Focusing";
    return;
  }
  if (state.status === STATUS.RUNNING) {
    timerCard.classList.add("state-running-break");
    if (statusLabel) statusLabel.textContent = "On break";
    return;
  }
  if (state.status === STATUS.PAUSED) {
    timerCard.classList.add("state-paused");
    if (statusLabel) statusLabel.textContent = "Paused";
    return;
  }
  timerCard.classList.add("state-idle");
  if (statusLabel) statusLabel.textContent = "Ready";
}
