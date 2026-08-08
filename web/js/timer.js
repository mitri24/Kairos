// Fokus-Timer-Widget (Sidebar): conic Fortschrittsring + Restzeit (MM:SS), aktuelle
// Uhrzeit im Kopf, Phasen-Tabs, Steuerung (Start/Pause/Skip/Reset) und phasenbezogene
// Dauer-Presets (Focus/Short/Long). Liest store.state, schreibt ausschließlich über api.
import { formatClock, PHASES, STATUS, pad2 } from "/js/util.js";
import { getPhaseDurationMs } from "/shared/pomodoro.js";
import { icon } from "/js/icons.js";

// Presets pro Phase — die 15/25/45/60-Reihe im Design gehört zu Focus; Pausen bekommen
// passende kürzere Werte. Damit ersetzen die Presets die alten Dauer-Slider 1:1 im Design.
const PRESETS = {
  [PHASES.FOCUS]: [15, 25, 45, 60],
  [PHASES.SHORT_BREAK]: [3, 5, 10, 15],
  [PHASES.LONG_BREAK]: [10, 15, 20, 30],
};
const SETTING_KEY = {
  [PHASES.FOCUS]: "focusMinutes",
  [PHASES.SHORT_BREAK]: "shortBreakMinutes",
  [PHASES.LONG_BREAK]: "longBreakMinutes",
};

// Restzeit als MM:SS (Minuten zweistellig für ein stabiles Zifferbild).
function formatMMSS(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

export function initTimer({ store, api }) {
  const el = (id) => document.getElementById(id);
  const ring = el("timerRing");
  const digitalTime = el("digitalTime");
  const timeStr = el("timeStr"), modeLabel = el("modeLabel");
  const toggleBtn = el("toggleBtn"), toggleLabel = el("toggleLabel");
  const skipBtn = el("skipBtn"), resetBtn = el("resetBtn");
  const tabs = { [PHASES.FOCUS]: el("tabFocus"), [PHASES.SHORT_BREAK]: el("tabShort"), [PHASES.LONG_BREAK]: el("tabLong") };
  const presetGroup = el("sessionPresets");

  // Start/Pause-Piktogramm: das statische <svg class="play-glyph"> aus index.html
  // wird durch das Icon aus /js/icons.js ersetzt (Klasse bleibt, CSS greift weiter).
  // So haben Play und Pause denselben Strichstil wie in Fokusmodus und Extension.
  let toggleGlyph = toggleBtn?.querySelector(".play-glyph");
  let toggleGlyphName = "";
  function setToggleGlyph(name) {
    if (!toggleGlyph || name === toggleGlyphName) return;
    toggleGlyphName = name;
    toggleGlyph.outerHTML = icon(name, { size: 13, cls: "play-glyph" });
    toggleGlyph = toggleBtn.querySelector(".play-glyph");
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
  skipBtn?.addEventListener("click", () => act(api.timer.skip));
  resetBtn?.addEventListener("click", () => act(api.timer.reset));
  for (const [phase, tab] of Object.entries(tabs)) {
    tab?.addEventListener("click", () => act(() => api.timer.phase(phase)));
  }

  // Preset-Klick (Delegation): Dauer der AKTUELLEN Phase setzen + persistieren.
  presetGroup?.addEventListener("click", (e) => {
    const btn = e.target.closest(".preset");
    if (!btn) return;
    const min = Number(btn.dataset.min);
    if (!Number.isFinite(min)) return;
    setPhaseMinutes(store.state.timer.phase, min);
    persistDurations();
  });

  function setPhaseMinutes(phase, min) {
    const s = store.state.settings;
    s[SETTING_KEY[phase]] = min;
    const t = store.state.timer;
    // Ruhende Aktuelle-Phase sofort neu bemessen (Vorschau ohne Serverrundreise).
    if (t.status !== STATUS.RUNNING && t.phase === phase) t.remainingMs = min * 60000;
    store.emit();
  }
  function persistDurations() {
    const s = store.state.settings;
    act(() => api.setSettings({
      focusMinutes: s.focusMinutes, shortBreakMinutes: s.shortBreakMinutes,
      longBreakMinutes: s.longBreakMinutes,
    }));
  }

  // ── Rendering ──────────────────────────────────
  function renderClock() {
    if (digitalTime) digitalTime.textContent = formatClock(store.now());
  }

  function renderRing() {
    const t = store.state.timer, s = store.state.settings;
    const total = getPhaseDurationMs(t.phase, s) || 1;
    const frac = Math.max(0, Math.min(1, t.remainingMs / total));
    if (ring) {
      ring.style.setProperty("--frac", String(frac));
      ring.classList.toggle("is-break", t.phase !== PHASES.FOCUS);
    }
  }

  function renderTimerText() {
    const t = store.state.timer;
    timeStr.textContent = formatMMSS(t.remainingMs);
    let sub;
    if (t.status === STATUS.RUNNING) sub = t.phase === PHASES.FOCUS ? "focusing" : "on break";
    else if (t.status === STATUS.PAUSED) sub = "paused";
    else sub = "remaining";
    if (modeLabel) modeLabel.textContent = sub;

    if (t.status === STATUS.RUNNING) {
      if (toggleLabel) toggleLabel.textContent = "Pause";
      toggleBtn.classList.add("is-running");
      setToggleGlyph("pause");
    } else {
      if (toggleLabel) toggleLabel.textContent = t.status === STATUS.PAUSED ? "Resume" : "Start";
      toggleBtn.classList.remove("is-running");
      setToggleGlyph("play");
    }
  }

  function renderTabs() {
    const phase = store.state.timer.phase;
    for (const [p, tab] of Object.entries(tabs)) tab?.classList.toggle("is-active", p === phase);
  }

  // Presets folgen der aktiven Phase; aktiver Preset = aktueller Dauerwert.
  let presetSig = null;
  function renderPresets() {
    if (!presetGroup) return;
    const s = store.state.settings, phase = store.state.timer.phase;
    const values = PRESETS[phase] || PRESETS[PHASES.FOCUS];
    const current = Number(s[SETTING_KEY[phase]]);
    const sig = `${phase}|${values.join(",")}|${current}`;
    if (sig === presetSig) return;
    presetSig = sig;
    presetGroup.innerHTML = values.map((m) =>
      `<button type="button" class="preset${m === current ? " is-active" : ""}" data-min="${m}">${m}</button>`
    ).join("");
  }

  function render() { renderRing(); renderTimerText(); renderTabs(); renderPresets(); }
  // Ring + Uhrzeit + Restzeit laufen jede Sekunde (getrennt vom Store-Emit).
  function tick() { renderClock(); renderRing(); renderTimerText(); }

  render(); renderClock();
  store.subscribe(render);
  return { render, tick };
}
