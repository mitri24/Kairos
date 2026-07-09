// Timer-Karte: Zifferblatt (echte Uhr-Zeiger + Timer-Fortschrittsring),
// Digital-Zeit, Countdown, Phasen-Tabs, Steuerung und Session-Längen-Slider.
import {
  formatDurationHM, formatClock, PHASES, STATUS, phaseLabelJa,
} from "/js/util.js";
import { getPhaseDurationMs } from "/shared/pomodoro.js";

const R = 132;
const CIRC = 2 * Math.PI * R;
const FOCUS_PRESETS = [15, 25, 45, 60];

export function initTimer({ store, api }) {
  const el = (id) => document.getElementById(id);
  const dialProgress = el("dialProgress");
  const hourHand = el("hourHand"), minHand = el("minHand"), secHand = el("secHand");
  const digitalTime = el("digitalTime");
  const timeStr = el("timeStr"), modeLabel = el("modeLabel");
  const toggleBtn = el("toggleBtn"), skipBtn = el("skipBtn"), resetBtn = el("resetBtn");
  const tabs = { [PHASES.FOCUS]: el("tabFocus"), [PHASES.SHORT_BREAK]: el("tabShort"), [PHASES.LONG_BREAK]: el("tabLong") };
  const sessionRange = el("sessionRange"), sessionLabel = el("sessionLabel"), sessionPresets = el("sessionPresets");
  const shortRange = el("shortRange"), shortLabel = el("shortLabel");
  const longRange = el("longRange"), longLabel = el("longLabel");
  // Mini-Timer in der Sidebar (immer sichtbar)
  const miniTimer = el("miniTimer"), miniPhase = el("miniPhase"), miniTime = el("miniTime");
  const miniToggle = el("miniToggle"), miniSkip = el("miniSkip"), miniTask = el("miniTask");

  dialProgress.style.strokeDasharray = String(CIRC);
  dialProgress.style.transition = "stroke-dashoffset .3s linear, stroke .2s";

  // Presets rendern
  sessionPresets.innerHTML = "";
  for (const m of FOCUS_PRESETS) {
    const b = document.createElement("button");
    b.className = "preset"; b.textContent = String(m); b.dataset.min = String(m);
    b.addEventListener("click", () => { setFocusMinutes(m); persistSettings(); });
    sessionPresets.appendChild(b);
  }

  // ── Aktionen ───────────────────────────────────
  async function act(fn) {
    try { store.applySnapshot(await fn()); }
    catch (e) { console.warn("[timer]", e.message); }
  }
  function toggle() {
    const s = store.state.timer.status;
    if (s === STATUS.RUNNING) return act(api.timer.pause);
    if (s === STATUS.PAUSED) return act(api.timer.resume);
    return act(api.timer.start);
  }
  toggleBtn.addEventListener("click", toggle);
  skipBtn.addEventListener("click", () => act(api.timer.skip));
  resetBtn.addEventListener("click", () => act(api.timer.reset));
  miniToggle?.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  miniSkip?.addEventListener("click", (e) => { e.stopPropagation(); act(api.timer.skip); });
  for (const [phase, tab] of Object.entries(tabs)) {
    tab.addEventListener("click", () => act(() => api.timer.phase(phase)));
  }

  // Slider: live Vorschau (input) + speichern (change)
  sessionRange.addEventListener("input", () => setFocusMinutes(Number(sessionRange.value)));
  sessionRange.addEventListener("change", persistSettings);
  shortRange.addEventListener("input", () => { store.state.settings.shortBreakMinutes = Number(shortRange.value); renderSliders(); });
  shortRange.addEventListener("change", persistSettings);
  longRange.addEventListener("input", () => { store.state.settings.longBreakMinutes = Number(longRange.value); renderSliders(); });
  longRange.addEventListener("change", persistSettings);

  function setFocusMinutes(m) {
    const s = store.state.settings;
    s.focusMinutes = m;
    const t = store.state.timer;
    if (t.status !== STATUS.RUNNING && t.phase === PHASES.FOCUS) t.remainingMs = m * 60000;
    store.emit();
  }
  function persistSettings() {
    const s = store.state.settings;
    act(() => api.setSettings({
      focusMinutes: s.focusMinutes, shortBreakMinutes: s.shortBreakMinutes,
      longBreakMinutes: s.longBreakMinutes,
    }));
  }

  // ── Rendering ──────────────────────────────────
  function renderHands() {
    const now = store.now();
    const d = new Date(now);
    const sec = d.getSeconds() + d.getMilliseconds() / 1000;
    const min = d.getMinutes() + sec / 60;
    const hr = (d.getHours() % 12) + min / 60;
    secHand.setAttribute("transform", `rotate(${sec * 6} 140 140)`);
    minHand.setAttribute("transform", `rotate(${min * 6} 140 140)`);
    hourHand.setAttribute("transform", `rotate(${hr * 30} 140 140)`);
    digitalTime.textContent = formatClock(now);
  }

  function renderRing() {
    const t = store.state.timer, s = store.state.settings;
    const total = getPhaseDurationMs(t.phase, s) || 1;
    const frac = Math.max(0, Math.min(1, t.remainingMs / total));
    dialProgress.style.strokeDashoffset = String(CIRC * (1 - frac));
    dialProgress.setAttribute("stroke", t.phase === PHASES.FOCUS ? "var(--accent)" : "var(--green)");
  }

  function renderTimerText() {
    const t = store.state.timer, s = store.state.settings;
    timeStr.textContent = formatDurationHM(t.remainingMs, true);
    let status = "";
    if (t.status === STATUS.RUNNING) status = t.phase === PHASES.FOCUS ? "Focusing" : "On break";
    else if (t.status === STATUS.PAUSED) status = "Paused";
    else status = `${Math.round(getPhaseDurationMs(t.phase, s) / 60000)} min`;
    modeLabel.textContent = `${phaseLabelJa(t.phase)} · ${status}`;

    if (t.status === STATUS.RUNNING) { toggleBtn.textContent = "⏸ Pause"; toggleBtn.classList.add("is-running"); }
    else if (t.status === STATUS.PAUSED) { toggleBtn.textContent = "▶ Resume"; toggleBtn.classList.remove("is-running"); }
    else { toggleBtn.textContent = "▶ Start"; toggleBtn.classList.remove("is-running"); }
  }

  function renderTabs() {
    const phase = store.state.timer.phase;
    for (const [p, tab] of Object.entries(tabs)) tab.classList.toggle("is-active", p === phase);
  }

  function renderSliders() {
    const s = store.state.settings;
    if (document.activeElement !== sessionRange) sessionRange.value = String(s.focusMinutes);
    if (document.activeElement !== shortRange) shortRange.value = String(s.shortBreakMinutes);
    if (document.activeElement !== longRange) longRange.value = String(s.longBreakMinutes);
    sessionLabel.textContent = `${s.focusMinutes} min`;
    shortLabel.textContent = `${s.shortBreakMinutes} min`;
    longLabel.textContent = `${s.longBreakMinutes} min`;
    for (const b of sessionPresets.children) b.classList.toggle("is-active", Number(b.dataset.min) === s.focusMinutes);
  }

  function renderMini() {
    if (!miniTimer) return;
    const t = store.state.timer;
    miniPhase.textContent = phaseLabelJa(t.phase);
    miniTime.textContent = formatDurationHM(t.remainingMs, true);
    miniToggle.textContent = t.status === STATUS.RUNNING ? "⏸" : "▶";
    miniTimer.classList.toggle("is-break", t.phase !== PHASES.FOCUS);
    const active = store.state.tasks.find((x) => x.active);
    miniTask.textContent = active ? active.text : "";
  }

  function render() { renderRing(); renderTimerText(); renderTabs(); renderSliders(); renderMini(); }

  // Zeiger + Digital laufen jede Sekunde (auch getrennt vom Store-Emit).
  function tick() { renderHands(); renderRing(); renderTimerText(); renderMini(); }

  render(); renderHands();
  store.subscribe(render);
  return { render, tick };
}
