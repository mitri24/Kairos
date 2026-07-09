// Dial-Steuerung: Pointer-Events, SVG-Rendering und die ablaufende Uhr.
// Zwei Modi: Ruhezustand = Dauer-Wähler (ziehbar), Läuft/Pausiert = ablaufende
// Countdown-Uhr (Bogen leert sich, Zeiger ausgeblendet).
import {
  DIAL_MINUTES_MIN,
  DIAL_MINUTES_MAX,
  DIAL_RADIUS,
  DIAL_CIRCUMFERENCE,
  STATUS,
  PHASE,
} from "./constants.js";
import { clamp } from "./utils.js";

const dialSvg      = document.getElementById("dial");
const dialProgress = document.getElementById("dialProgress");
const dialHandle   = document.getElementById("dialHandle");
const dialHint     = document.getElementById("dialHint");

dialProgress.style.strokeDasharray = String(DIAL_CIRCUMFERENCE);

export let draftFocusMinutes = 25;

// ── Zeichnen ─────────────────────────────────────
function drawArc(fraction) {
  const f = clamp(fraction, 0, 1);
  dialProgress.style.strokeDashoffset = String(DIAL_CIRCUMFERENCE * (1 - f));
}

function placeHandle(fraction) {
  const radians = ((clamp(fraction, 0, 1) * 360 - 90) * Math.PI) / 180;
  dialHandle.setAttribute("cx", String(120 + DIAL_RADIUS * Math.cos(radians)));
  dialHandle.setAttribute("cy", String(120 + DIAL_RADIUS * Math.sin(radians)));
}

function showHint(text) {
  if (dialHint) dialHint.textContent = text;
}

// Phasendauer in ms — spiegelt die Domain, ohne sie zu importieren.
function phaseDurationMs(phase, settings) {
  if (phase === PHASE.SHORT_BREAK) return (settings.shortBreakMinutes ?? 5) * 60_000;
  if (phase === PHASE.LONG_BREAK)  return (settings.longBreakMinutes ?? 15) * 60_000;
  return clamp(settings.focusMinutes ?? 25, DIAL_MINUTES_MIN, DIAL_MINUTES_MAX) * 60_000;
}

// Ruhezustand: Bogen = gewählte Fokusminuten, Zeiger sichtbar & ziehbar.
export function renderSetupDial(minutes) {
  draftFocusMinutes = clamp(minutes, DIAL_MINUTES_MIN, DIAL_MINUTES_MAX);
  const fraction = (draftFocusMinutes - DIAL_MINUTES_MIN) / (DIAL_MINUTES_MAX - DIAL_MINUTES_MIN);
  dialProgress.classList.remove("ticking");
  drawArc(fraction);
  placeHandle(fraction);
  if (dialSvg) dialSvg.setAttribute("aria-valuenow", String(draftFocusMinutes));
  showHint(`${draftFocusMinutes} min`);
}

// Läuft/Pausiert: Bogen = Restanteil der Phase, leert sich weich bis auf 0.
export function renderCountdown(remainingMs, totalMs) {
  const fraction = totalMs > 0 ? remainingMs / totalMs : 0;
  dialProgress.classList.add("ticking");
  drawArc(fraction);
}

// Zentrale Uhr-Anzeige: entscheidet Setup vs. Countdown.
export function renderClock(state, settings, now = Date.now()) {
  if (!state) return;
  if (state.status === STATUS.IDLE) {
    renderSetupDial(clamp(settings.focusMinutes, DIAL_MINUTES_MIN, DIAL_MINUTES_MAX));
    return;
  }
  const totalMs = phaseDurationMs(state.phase, settings);
  const remainingMs = state.status === STATUS.RUNNING && state.endsAt
    ? Math.max(0, state.endsAt - now)
    : state.remainingMs;
  renderCountdown(remainingMs, totalMs);
}

// ── Pointer-Interaktion (nur im Ruhezustand) ─────
export function initDialEvents(getCurrentPayload, onPersist) {
  dialSvg.addEventListener("pointerdown", (e) => {
    const p = getCurrentPayload();
    if (!p || p.state.status !== STATUS.IDLE) return; // nur im Ruhezustand einstellbar
    isDragging = true;
    dialSvg.classList.add("dragging");
    dialSvg.setPointerCapture(e.pointerId);
    updateFromPointer(e);
  });

  dialSvg.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    updateFromPointer(e);
  });

  dialSvg.addEventListener("pointerup", () => {
    const was = isDragging;
    isDragging = false;
    dialSvg.classList.remove("dragging");
    if (was) onPersist("Focus time saved");
  });

  dialSvg.addEventListener("pointercancel", () => {
    isDragging = false;
    dialSvg.classList.remove("dragging");
  });
}

// ── intern ───────────────────────────────────────
let isDragging = false;

function updateFromPointer(e) {
  const minutes = Math.round(
    DIAL_MINUTES_MIN + progressFromPointer(e) * (DIAL_MINUTES_MAX - DIAL_MINUTES_MIN)
  );
  renderSetupDial(clamp(minutes, DIAL_MINUTES_MIN, DIAL_MINUTES_MAX));
}

function progressFromPointer(e) {
  const pt  = dialSvg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const ctm = dialSvg.getScreenCTM();
  if (!ctm) return 0;
  const svgPt = pt.matrixTransform(ctm.inverse());
  let angle = Math.atan2(svgPt.y - 120, svgPt.x - 120) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;
  return angle / 360;
}
