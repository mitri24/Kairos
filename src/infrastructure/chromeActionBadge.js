import { STATUS, PHASES, computeRemainingMs } from "../domain/pomodoroDomain.js";

const BADGE_BACKGROUND_COLOR = "#aa5a54";
const BADGE_TEXT_COLOR = "#fbe8d7";

const PHASE_LABELS = {
  [PHASES.FOCUS]: "Fokus",
  [PHASES.SHORT_BREAK]: "Kurzpause",
  [PHASES.LONG_BREAK]: "Langpause"
};

export class ChromeActionBadge {
  async render(snapshot, now = Date.now()) {
    const state = snapshot?.state;
    if (!state) {
      await this.clear();
      return;
    }

    if (state.status !== STATUS.RUNNING) {
      const pausedText = state.status === STATUS.PAUSED ? "II" : "";
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR });
      await chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR });
      await chrome.action.setBadgeText({ text: pausedText });
      await chrome.action.setTitle({
        title: this._createTitle(state, now)
      });
      return;
    }

    const remainingMs = computeRemainingMs(state, now);
    const text = this._formatBadgeText(remainingMs);

    await chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR });
    await chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR });
    await chrome.action.setBadgeText({ text });
    await chrome.action.setTitle({
      title: this._createTitle({ ...state, remainingMs }, now)
    });
  }

  async clear() {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "Focus Exam Pomodoro" });
  }

  _formatBadgeText(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes >= 100) return "99+";
    return `${String(minutes).padStart(2, "0")}${String(seconds).padStart(2, "0")}`;
  }

  _createTitle(state, now) {
    const remainingMs = state.status === STATUS.RUNNING
      ? computeRemainingMs(state, now)
      : state.remainingMs;

    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const phaseLabel = PHASE_LABELS[state.phase] ?? "Phase";

    return `Focus Exam Pomodoro • ${phaseLabel} • ${minutes}:${String(seconds).padStart(2, "0")}`;
  }
}