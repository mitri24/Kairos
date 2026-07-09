// Hilfsfunktionen ohne DOM-Abhängigkeit

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function formatMs(value) {
  const seconds = Math.ceil(Math.max(0, value) / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs    = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function phaseText(phase) {
  if (phase === "focus")       return "Focus";
  if (phase === "short-break") return "Short break";
  return "Long break";
}

export function confirmAction(actionType) {
  if (typeof globalThis.confirm !== "function") return true;
  if (actionType === "SKIP")  return globalThis.confirm("Move to the next phase?");
  if (actionType === "RESET") return globalThis.confirm("Reset the timer?");
  return true;
}
