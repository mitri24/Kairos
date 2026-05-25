// Dial-Steuerung: Pointer-Events und SVG-Rendering
import { DIAL_MINUTES_MIN, DIAL_MINUTES_MAX, DIAL_RADIUS, DIAL_CIRCUMFERENCE } from "./constants.js";
import { clamp } from "./utils.js";
import { renderDraftTimer } from "./timerRenderer.js";

const dialSvg      = document.getElementById("dial");
const dialProgress = document.getElementById("dialProgress");
const dialHandle   = document.getElementById("dialHandle");

dialProgress.style.strokeDasharray = String(DIAL_CIRCUMFERENCE);

export let draftFocusMinutes = 25;

export function initDialEvents(getCurrentPayload, onPersist) {
  dialSvg.addEventListener("pointerdown", (e) => {
    const p = getCurrentPayload();
    if (!p || p.state.status === "running") return;
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
    if (was) onPersist("集中時間を保存しました");
  });

  dialSvg.addEventListener("pointercancel", () => {
    isDragging = false;
    dialSvg.classList.remove("dragging");
  });
}

export function renderDial(minutes) {
  draftFocusMinutes = clamp(minutes, DIAL_MINUTES_MIN, DIAL_MINUTES_MAX);
  const progress     = (draftFocusMinutes - DIAL_MINUTES_MIN) / (DIAL_MINUTES_MAX - DIAL_MINUTES_MIN);
  const offset       = DIAL_CIRCUMFERENCE * (1 - progress);
  dialProgress.style.strokeDashoffset = String(offset);

  const radians = ((progress * 360 - 90) * Math.PI) / 180;
  dialHandle.setAttribute("cx", String(120 + DIAL_RADIUS * Math.cos(radians)));
  dialHandle.setAttribute("cy", String(120 + DIAL_RADIUS * Math.sin(radians)));
}

// ── intern ───────────────────────────────────────
let isDragging = false;

function updateFromPointer(e) {
  const minutes = Math.round(DIAL_MINUTES_MIN + progressFromPointer(e) * (DIAL_MINUTES_MAX - DIAL_MINUTES_MIN));
  renderDial(clamp(minutes, DIAL_MINUTES_MIN, DIAL_MINUTES_MAX));
  renderDraftTimer(draftFocusMinutes);
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
