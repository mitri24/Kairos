// Timer-Rendering: DOM-Updates für Uhr, Labels und Card-States
import { STATUS, PHASE } from "./constants.js";
import { formatMs, phaseText } from "./utils.js";

const phaseLabel  = document.getElementById("phaseLabel");
const statusLabel = document.getElementById("statusLabel");
const timeLabel   = document.getElementById("timeLabel");
const cycleLabel  = document.getElementById("cycleLabel");
const timerCard   = document.getElementById("timerCard");

export const startPauseBtn = document.getElementById("startPauseBtn");

export function renderMeta(state, settings) {
  if (phaseLabel) phaseLabel.textContent = phaseText(state.phase);
  if (cycleLabel) cycleLabel.textContent = `セット ${state.cycleInBlock + 1}/${settings.cyclesUntilLongBreak}`;
  renderVisualState(state);
  renderStartPauseLabel(state.status);
}

export function renderTimer(state) {
  const remainingMs = state.status === STATUS.RUNNING && state.endsAt
    ? Math.max(0, state.endsAt - Date.now())
    : state.remainingMs;
  if (timeLabel) timeLabel.textContent = formatMs(remainingMs);
}

export function renderDraftTimer(minutes) {
  if (timeLabel) timeLabel.textContent = formatMs(minutes * 60_000);
}

function renderStartPauseLabel(status) {
  if (status === STATUS.RUNNING) {
    startPauseBtn.textContent = "⏸";
    startPauseBtn.setAttribute("aria-label", "一時停止");
    startPauseBtn.setAttribute("title",      "一時停止");
  } else if (status === STATUS.PAUSED) {
    startPauseBtn.textContent = "▶";
    startPauseBtn.setAttribute("aria-label", "つづける");
    startPauseBtn.setAttribute("title",      "つづける");
  } else {
    startPauseBtn.textContent = "▶";
    startPauseBtn.setAttribute("aria-label", "スタート");
    startPauseBtn.setAttribute("title",      "スタート");
  }
}

function renderVisualState(state) {
  timerCard.classList.remove("state-idle", "state-paused", "state-running-focus", "state-running-break");

  if (state.status === STATUS.RUNNING && state.phase === PHASE.FOCUS) {
    timerCard.classList.add("state-running-focus");
    if (statusLabel) statusLabel.textContent = "集中中";
    return;
  }
  if (state.status === STATUS.RUNNING) {
    timerCard.classList.add("state-running-break");
    if (statusLabel) statusLabel.textContent = "休けい中";
    return;
  }
  if (state.status === STATUS.PAUSED) {
    timerCard.classList.add("state-paused");
    if (statusLabel) statusLabel.textContent = "一時停止中";
    return;
  }
  timerCard.classList.add("state-idle");
  if (statusLabel) statusLabel.textContent = "じゅんびOK";
}
