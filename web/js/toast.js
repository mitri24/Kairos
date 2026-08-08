// Globale Toast-/Feedback-Schicht. „Jede Änderung bestätigt still; was scheitert,
// sagt es in klarer Sprache mit einem Weg zurück — nie ein stilles console.warn."
// Wird u. a. von api.js bei fehlgeschlagenen Mutationen aufgerufen.

import { icon } from "/js/icons.js";

// Piktogramme kommen aus icons.js (einzige Icon-Quelle). Die Größe setzt die
// CSS-Regel `.toast__ic svg`; die Farbe kommt vom Token des jeweiligen Typs.
const ICON = {
  success: icon("check", { size: 16, stroke: 2.4 }),
  warn: icon("warning", { size: 16, stroke: 2 }),
  error: icon("close", { size: 16, stroke: 2.2 }),
};

let stack = null;
function ensureStack() {
  if (stack && document.body.contains(stack)) return stack;
  stack = document.createElement("div");
  stack.className = "toast-stack";
  stack.setAttribute("aria-live", "polite");
  document.body.appendChild(stack);
  return stack;
}

export function initToasts() { ensureStack(); }

export function showToast({ type = "success", title = "", body = "", action = null, timeout = 4500 } = {}) {
  const host = ensureStack();
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span class="toast__ic">${ICON[type] || ICON.success}</span>
    <div class="toast__body"><div class="toast__title"></div>${body ? `<div class="toast__sub"></div>` : ""}</div>
    ${action ? `<button class="toast__action" type="button"></button>` : ""}`;
  el.querySelector(".toast__title").textContent = title;
  if (body) el.querySelector(".toast__sub").textContent = body;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));

  let closed = false;
  const remove = () => {
    if (closed) return; closed = true;
    clearTimeout(timer);
    el.classList.remove("is-in"); el.classList.add("is-out");
    setTimeout(() => el.remove(), 220);
  };
  const timer = setTimeout(remove, timeout);

  if (action) {
    const btn = el.querySelector(".toast__action");
    btn.textContent = action.label || "Undo";
    btn.addEventListener("click", (e) => { e.stopPropagation(); try { action.onClick?.(); } finally { remove(); } });
  }
  el.addEventListener("click", remove);
  return { close: remove };
}
