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
  if (phase === "focus")       return "集中";
  if (phase === "short-break") return "みじかい休けい";
  return "ながい休けい";
}

export function confirmAction(actionType) {
  if (typeof globalThis.confirm !== "function") return true;
  if (actionType === "SKIP")  return globalThis.confirm("次へ進みますか？");
  if (actionType === "RESET") return globalThis.confirm("タイマーをリセットしますか？");
  return true;
}
