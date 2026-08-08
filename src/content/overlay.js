// ─────────────────────────────────────────────────────────────────────────────
// ADHD-Pomodoro — Content-Script-Overlay
//
// Blendet auf JEDER Website oben rechts ein aus-/einfahrbares Widget ein, das
//   • immer die aktuelle Aufgabe zeigt (adhdCurrentTask),
//   • den Timer 1:1 wie die Extension darstellt (ablaufendes Dial, Focus,
//     Start/Pause, Skip, Reset).
//
// Datenfluss (berechtigungsarm, ohne Fetch auf Fremdseiten):
//   • Timer:   chrome.runtime.sendMessage({type:"GET_STATE"|"START"|…}) → Background.
//              Live-Push über chrome.storage.onChanged (Key "adhdPomodoroState"),
//              da runtime.sendMessage-Broadcasts Content-Scripts NICHT erreichen.
//              Sekündlicher lokaler Tick fürs Countdown (aus endsAt gerechnet).
//   • Aufgabe: chrome.storage.local["adhdCurrentTask"], vom Popup-Todo gespiegelt.
//   • UI:      Ein-/Ausfahren in chrome.storage.local["adhdOverlayExpanded"]
//              (über alle Tabs synchron).
//
// Als klassisches IIFE geschrieben — MV3-Content-Scripts unterstützen kein
// ES-Module-import. Alles ist im Shadow-DOM isoliert.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  "use strict";

  // Nur im echten Extension-Kontext, nur im Top-Frame, nie doppelt injizieren.
  if (!globalThis.chrome?.runtime?.id) return;
  if (window.top !== window) return;

  const HOST_ID = "adhd-pomodoro-overlay-host";
  if (document.getElementById(HOST_ID)) return;

  // ── Konstanten (aus der Extension übernommen) ──────────────────────────────
  const STATE_KEY = "adhdPomodoroState";   // { state, settings }
  const TASK_KEY  = "adhdCurrentTask";      // { text, id } | null
  const UI_KEY    = "adhdOverlayExpanded";  // boolean

  const STATUS = { IDLE: "idle", RUNNING: "running", PAUSED: "paused" };
  const DIAL_MIN = 10, DIAL_MAX = 90, DIAL_R = 90;
  const DIAL_C = 2 * Math.PI * DIAL_R;

  // ── Hilfsfunktionen (ohne DOM) ─────────────────────────────────────────────
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function formatMs(value) {
    const seconds = Math.ceil(Math.max(0, value) / 1000);
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function phaseText(phase) {
    if (phase === "focus") return "Focus";
    if (phase === "short-break") return "Short break";
    return "Long break";
  }

  // Phasendauer in ms — für die ablaufende Uhr (Rest / Gesamtdauer der Phase).
  function phaseDurationMs(phase, settings) {
    if (phase === "short-break") return (Number(settings.shortBreakMinutes) || 5) * 60000;
    if (phase === "long-break")  return (Number(settings.longBreakMinutes) || 15) * 60000;
    return clamp(Number(settings.focusMinutes) || 25, DIAL_MIN, DIAL_MAX) * 60000;
  }

  // ── Icons (Strich-SVGs im Stil des restlichen UIs) ─────────────────────────
  // Kanonische Quelle ist src/presentation/js/icons.js — MV3-Content-Scripts
  // sind klassische Skripte ohne `import`, deshalb steht hier eine wortgleiche
  // Kopie der benötigten Pfade. Wird dort etwas geändert, hier mitziehen.
  // Format wie dort: 24er-Raster, fill:none, stroke:currentColor,
  // stroke-width 1.8, runde Enden — erbt damit Textfarbe und Hover-Zustände.
  const ICON_PATHS = {
    play:   '<path d="M7.8 5.2 18.6 12 7.8 18.8z"/>',
    pause:  '<path d="M9.2 5.5v13M14.8 5.5v13"/>',
    skip:   '<path d="M6.5 5.5v13L15.5 12z"/><path d="M18 5.5v13"/>',
    reset:  '<path d="M3.5 12a8.5 8.5 0 1 0 8.5-8.5A9.2 9.2 0 0 0 5.6 6.1L3.5 8.1"/><path d="M3.5 3.6v4.7h4.7"/>',
    minus:  '<path d="M6 12h12"/>',
    expand: '<path d="M14.5 4.5h5v5"/><path d="m19.5 4.5-6 6"/><path d="M9.5 19.5h-5v-5"/><path d="m4.5 19.5 6-6"/>',
  };

  // Die Icons sind rein dekorativ — die Bedeutung tragen title/aria-label am Button.
  function ico(name, size = 20) {
    return (
      `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
      `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ` +
      `aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`
    );
  }

  // ── Styles (Extension-Tokens 1:1, im Shadow-DOM isoliert) ──────────────────
  const CSS = `
  :host { all: initial; }
  :host {
    position: fixed; top: 12px; right: 12px; z-index: 2147483647;
    --accent: #a9524a; --accent-dark: #8f423b;
    --accent-soft: rgba(169,82,74,.08); --accent-soft2: rgba(169,82,74,.12);
    --accent-border: rgba(169,82,74,.32);
    --green: #5E8577; --green-dark: #4d7266; --green-soft: rgba(94,133,119,.12);
    --ink: #38332C; --muted: #9A9086;
    --paper: #FBF7F0; --paper-2: #FCFAF5; --shell: #F3EEE6;
    --warm-2: #EBE6DE; --line: rgba(150,138,124,.28); --track: #E6DFD3;
    --danger: #b5514a;
    --r-card: 20px; --r-btn: 12px; --r-pill: 999px;
    --shadow-card: 0 1px 2px rgba(56,51,44,.06), 0 14px 34px rgba(56,51,44,.14);
    --font: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --ink: #ECE4D8; --muted: #A79C8C;
      --paper: #26221D; --paper-2: #2E2823; --shell: #1B1815;
      --warm-2: #2C2620; --line: rgba(190,176,156,.18); --track: #3A332B;
      --accent-soft: rgba(200,110,100,.14); --accent-soft2: rgba(200,110,100,.2);
      --shadow-card: 0 1px 2px rgba(0,0,0,.3), 0 14px 34px rgba(0,0,0,.5);
    }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .wrap {
    font-family: var(--font); color: var(--ink); line-height: 1.4;
    -webkit-font-smoothing: antialiased; text-align: left;
    animation: ov-in .18s ease both;
  }
  @keyframes ov-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

  button { font-family: inherit; cursor: pointer; }
  .ico { flex: none; display: block; }

  /* ── Eingefahren: kompakte Pille ── */
  .collapsed {
    display: flex; align-items: center; gap: 8px;
    max-width: 260px; padding: 7px 10px 7px 11px;
    background: var(--paper); border: 1.5px solid var(--line);
    border-radius: var(--r-pill); box-shadow: var(--shadow-card);
    cursor: pointer; user-select: none;
    transition: border-color .15s, background .15s;
  }
  .collapsed:hover { border-color: var(--accent-border); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); flex: 0 0 auto; }
  .is-focus .dot  { background: var(--accent); }
  .is-break .dot  { background: var(--green); }
  .is-paused .dot { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .mini-time {
    font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums;
    letter-spacing: .3px; flex: 0 0 auto;
  }
  .mini-task {
    font-size: 12px; color: var(--muted); flex: 1 1 auto; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .grip { color: var(--muted); flex: 0 0 auto; display: inline-flex; align-items: center; }

  /* ── Ausgefahren: Timer-Karte (1:1 Extension) ── */
  .card {
    width: 264px; display: flex; flex-direction: column; align-items: center; gap: 12px;
    padding: 14px; background: var(--paper);
    border: 1.5px solid var(--line); border-radius: var(--r-card);
    box-shadow: var(--shadow-card);
    transition: border-color .16s, background .16s;
  }
  .card.is-paused        { border-color: var(--accent); }
  .card.is-focus         { border-color: var(--accent); }
  .card.is-break         { border-color: var(--green); background: var(--paper-2); }

  .head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .brand { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; letter-spacing: .4px; }
  .brand__mark { width: 16px; height: 16px; flex: none; }
  .mini-icon {
    width: 26px; height: 26px; border: none; background: transparent; color: var(--muted);
    border-radius: 8px; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .mini-icon:hover { background: var(--accent-soft); color: var(--accent); }

  .dial-wrap { position: relative; width: 152px; aspect-ratio: 1/1; }
  .dial-svg { width: 100%; height: 100%; display: block; }
  .dial-track { fill: none; stroke: var(--track); stroke-width: 14; }
  .dial-progress {
    fill: none; stroke: var(--accent); stroke-linecap: round; stroke-width: 14;
    transform: rotate(-90deg); transform-origin: center; transition: stroke-dashoffset 1s linear;
  }
  .is-break .dial-progress { stroke: var(--green); }
  .dial-handle { fill: var(--accent); stroke: var(--paper); stroke-width: 3; }
  .is-break .dial-handle { fill: var(--green); }
  .dial-center {
    position: absolute; inset: 0; display: grid; place-content: center; gap: 2px;
    pointer-events: none; text-align: center;
  }
  .phase { font-size: 12px; font-weight: 700; color: var(--accent); }
  .is-break .phase { color: var(--green); }
  .time {
    font-size: 30px; font-weight: 800; line-height: 1; letter-spacing: -1px;
    font-variant-numeric: tabular-nums; color: var(--ink);
  }

  .task {
    width: 100%; text-align: center; padding: 8px 10px;
    background: var(--accent-soft); border: 1.5px solid var(--accent-border);
    border-radius: 14px; display: flex; flex-direction: column; gap: 2px;
  }
  .is-break .task { background: var(--green-soft); border-color: rgba(94,133,119,.32); }
  .task.is-empty { background: var(--paper-2); border-color: var(--line); }
  .task-kicker { font-size: 9.5px; font-weight: 800; letter-spacing: 1px; color: var(--accent); }
  .is-break .task-kicker { color: var(--green); }
  .task.is-empty .task-kicker { color: var(--muted); }
  .task-title {
    font-size: 13.5px; font-weight: 800; color: var(--ink); line-height: 1.25;
    overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }

  .controls { display: flex; gap: 8px; width: 100%; }
  .btn {
    flex: 1 1 0; height: 42px; border: 1.5px solid var(--line); background: var(--paper-2);
    color: var(--ink); border-radius: var(--r-btn); line-height: 1;
    display: inline-flex; align-items: center; justify-content: center;
    transition: background .14s, border-color .14s, transform .08s, filter .12s;
  }
  .btn:hover { background: var(--warm-2); }
  .btn:active { transform: translateY(1px) scale(.98); }
  .btn.primary { flex: 1.4; background: var(--accent); border-color: var(--accent); color: #FDF6EE; }
  .btn.primary:hover { background: var(--accent-dark); border-color: var(--accent-dark); }
  .card.is-break .btn.primary,
  .card.is-focus .btn.primary.is-running { background: var(--green); border-color: var(--green); }
  .btn.danger { color: var(--danger); }

  /* Sichtbarkeit je nach Zustand */
  .wrap[data-expanded="true"]  .collapsed { display: none; }
  .wrap[data-expanded="false"] .card      { display: none; }
  `;

  // ── Markup ─────────────────────────────────────────────────────────────────
  const HTML = `
  <div class="wrap" id="ov-wrap" data-expanded="false">
    <div class="collapsed" id="ov-collapsed" role="button" tabindex="0"
         title="Open timer" aria-label="Open Pomodoro timer">
      <span class="dot" id="ov-dot"></span>
      <span class="mini-time" id="ov-miniTime">25:00</span>
      <span class="mini-task" id="ov-miniTask">No task</span>
      <span class="grip" aria-hidden="true">${ico("expand", 14)}</span>
    </div>

    <div class="card" id="ov-card">
      <div class="head">
        <span class="brand">
          <svg class="brand__mark" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
            <g transform="translate(8 0)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <path d="M 158 34 C 101 25, 45 63, 32 119 C 17 183, 68 223, 128 221 C 190 219, 226 172, 220 117 C 216 84, 205 66, 194 56" stroke-width="20"/>
              <path d="M 112 69 C 108 94, 108 124, 110 171 M 111 122 C 132 105, 151 88, 169 72 M 112 123 C 133 137, 150 155, 164 173 C 170 181, 178 178, 183 166" stroke-width="18"/>
              <circle cx="179" cy="42" r="7.5" fill="currentColor" stroke="none"/>
            </g>
          </svg>Kairos</span>
        <button class="mini-icon" id="ov-collapse" title="Collapse" aria-label="Collapse">${ico("minus", 16)}</button>
      </div>

      <div class="dial-wrap">
        <svg class="dial-svg" viewBox="0 0 240 240" aria-hidden="true">
          <circle class="dial-track" cx="120" cy="120" r="90"></circle>
          <circle class="dial-progress" id="ov-progress" cx="120" cy="120" r="90"></circle>
          <circle class="dial-handle" id="ov-handle" cx="120" cy="30" r="7"></circle>
        </svg>
        <div class="dial-center">
          <p class="phase" id="ov-phase">Focus</p>
        </div>
      </div>

      <div class="task" id="ov-task">
        <div class="task-kicker">NOW</div>
        <div class="task-title" id="ov-taskTitle">No task</div>
      </div>

      <div class="controls">
        <button class="btn primary" id="ov-toggle" title="Start" aria-label="Start/Pause">${ico("play")}</button>
        <button class="btn" id="ov-skip" title="Skip" aria-label="Skip">${ico("skip")}</button>
        <button class="btn danger" id="ov-reset" title="Reset" aria-label="Reset">${ico("reset")}</button>
      </div>
    </div>
  </div>`;

  // ── Aufbau: Host + Shadow-DOM ──────────────────────────────────────────────
  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const tpl = document.createElement("template");
  tpl.innerHTML = HTML;
  shadow.append(style, tpl.content);
  (document.body || document.documentElement).appendChild(host);

  const $ = (id) => shadow.getElementById(id);
  const wrap        = $("ov-wrap");
  const dot         = $("ov-dot");
  const miniTimeEl  = $("ov-miniTime");
  const miniTaskEl  = $("ov-miniTask");
  const collapsed   = $("ov-collapsed");
  const card        = $("ov-card");
  const progressEl  = $("ov-progress");
  const handleEl    = $("ov-handle");
  const phaseEl     = $("ov-phase");
  const taskEl      = $("ov-task");
  const taskTitleEl = $("ov-taskTitle");
  const toggleBtn   = $("ov-toggle");
  const skipBtn     = $("ov-skip");
  const resetBtn    = $("ov-reset");

  progressEl.style.strokeDasharray = String(DIAL_C);

  // ── Zustand ────────────────────────────────────────────────────────────────
  let payload = null;              // { state, settings }
  let currentTask = null;          // { text, id } | null
  let expanded = false;
  let toggleIcon = "play";         // aktuell im Start/Pause-Button gezeichnetes Icon

  // Tauscht das Icon des Start/Pause-Buttons nur, wenn es sich wirklich ändert.
  function setToggleIcon(name) {
    if (toggleIcon === name) return;
    toggleIcon = name;
    toggleBtn.innerHTML = ico(name);
  }

  // ── Kommunikation mit dem Background ───────────────────────────────────────
  async function send(type) {
    try {
      const res = await chrome.runtime.sendMessage({ type });
      if (res?.ok && res.payload) { payload = res.payload; render(); }
    } catch (_) {
      // Extension neu geladen / Kontext ungültig — stumm ignorieren.
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  // Zeichnet den Bogen (0..1) und setzt den Zeiger ans Bogenende.
  function drawDial(fraction) {
    const f = clamp(fraction, 0, 1);
    progressEl.style.strokeDashoffset = String(DIAL_C * (1 - f));
    const rad = ((f * 360 - 90) * Math.PI) / 180;
    handleEl.setAttribute("cx", String(120 + DIAL_R * Math.cos(rad)));
    handleEl.setAttribute("cy", String(120 + DIAL_R * Math.sin(rad)));
  }

  function render() {
    if (!payload?.state) return;
    const st = payload.state;
    const settings = payload.settings || {};
    const focusMinutes = clamp(Number(settings.focusMinutes) || 25, DIAL_MIN, DIAL_MAX);

    // Restzeit wie im Popup: bei laufendem Timer aus endsAt, sonst remainingMs.
    const remaining = st.status === STATUS.RUNNING && st.endsAt
      ? Math.max(0, st.endsAt - Date.now())
      : st.remainingMs;
    const timeStr = formatMs(remaining);

    // Zifferblatt: im Ruhezustand die gewählte Dauer, sonst die ablaufende
    // Restzeit der aktuellen Phase (bildliche Uhr wie in der Seitenleiste).
    if (st.status === STATUS.IDLE) {
      drawDial((focusMinutes - DIAL_MIN) / (DIAL_MAX - DIAL_MIN));
    } else {
      const totalMs = phaseDurationMs(st.phase, settings);
      drawDial(totalMs > 0 ? remaining / totalMs : 0);
    }
    phaseEl.textContent = phaseText(st.phase);
    miniTimeEl.textContent = timeStr;

    // Phasen-/Status-Klassen (steuern Farben in collapsed UND card)
    const isBreak = st.phase !== "focus";
    const running = st.status === STATUS.RUNNING;
    const paused  = st.status === STATUS.PAUSED;
    for (const el of [wrap, card, collapsed]) {
      el.classList.toggle("is-focus", !isBreak && running);
      el.classList.toggle("is-break", isBreak && (running || paused));
      el.classList.toggle("is-paused", paused);
    }
    toggleBtn.classList.toggle("is-running", running);

    // Start/Pause-Button — Icon nur bei Wechsel neu setzen (render() läuft sekündlich).
    if (running) { setToggleIcon("pause"); toggleBtn.title = "Pause"; }
    else if (paused) { setToggleIcon("play"); toggleBtn.title = "Resume"; }
    else { setToggleIcon("play"); toggleBtn.title = "Start"; }

    // Aktuelle Aufgabe (immer sichtbar)
    const text = currentTask?.text?.trim();
    taskTitleEl.textContent = text || "No task";
    miniTaskEl.textContent = text || "No task";
    taskEl.classList.toggle("is-empty", !text);
  }

  function applyExpanded() {
    wrap.setAttribute("data-expanded", expanded ? "true" : "false");
  }

  async function setExpanded(next) {
    expanded = next;
    applyExpanded();
    try { await chrome.storage.local.set({ [UI_KEY]: expanded }); } catch (_) {}
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  collapsed.addEventListener("click", () => setExpanded(true));
  collapsed.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(true); }
  });
  $("ov-collapse").addEventListener("click", () => setExpanded(false));

  toggleBtn.addEventListener("click", () => {
    const status = payload?.state?.status;
    if (status === STATUS.RUNNING) return send("PAUSE");
    if (status === STATUS.PAUSED)  return send("RESUME");
    return send("START");
  });
  skipBtn.addEventListener("click", () => {
    if (confirm("Move to the next phase?")) send("SKIP");
  });
  resetBtn.addEventListener("click", () => {
    if (confirm("Reset the timer?")) send("RESET");
  });

  // Live-Updates aus dem Background/Popup (erreicht Content-Scripts).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STATE_KEY]) { payload = changes[STATE_KEY].newValue || payload; render(); }
    if (changes[TASK_KEY])  { currentTask = changes[TASK_KEY].newValue ?? null; render(); }
    if (changes[UI_KEY])    { expanded = Boolean(changes[UI_KEY].newValue); applyExpanded(); }
  });

  // Sekündlicher Tick: nur Countdown fortschreiben, wenn Tab sichtbar & laufend.
  setInterval(() => {
    if (document.hidden) return;
    if (payload?.state?.status === STATUS.RUNNING) render();
  }, 1000);

  // ── Initialer Zustand ──────────────────────────────────────────────────────
  (async () => {
    try {
      const stored = await chrome.storage.local.get([STATE_KEY, TASK_KEY, UI_KEY]);
      if (stored[STATE_KEY]) payload = stored[STATE_KEY];
      currentTask = stored[TASK_KEY] ?? null;
      expanded = Boolean(stored[UI_KEY]);
      applyExpanded();
      render();
    } catch (_) {}
    // Autoritativen Snapshot vom Background nachziehen (falls Storage leer/alt).
    await send("GET_STATE");
  })();
})();
