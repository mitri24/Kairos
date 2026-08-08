// Geteilter, versprochener Bestätigungsdialog für destruktive, nicht-triviale
// Aktionen (Cascade-Löschungen). Tastatur-fähig (Escape, Fokus-Falle, Fokus-
// Rückgabe), im „sheet"-Design (dialog.css). confirmDialog(...) → Promise<boolean>.
// Für harmlose Einzel-Löschungen NICHT nötig — dort ist ein Undo-Toast besser.

import { icon } from "/js/icons.js";

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

export function confirmDialog({
  title = "Are you sure?", body = "", confirmLabel = "Delete", cancelLabel = "Keep", danger = true,
} = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "sheet-overlay";
    overlay.style.zIndex = "200"; // über Task-/Exam-Modalen
    overlay.innerHTML = `
      <div class="sheet-overlay__scrim"></div>
      <div class="sheet" role="alertdialog" aria-modal="true" aria-label="${esc(title)}" style="width:min(400px,100%);padding:26px">
        <div class="sheet__head">
          <div class="sheet__head-ic" style="${danger ? "background:#F5E3DB;color:#C2603F" : ""}">${icon("warning", { size: 28 })}</div>
          <div>
            <div class="sheet__title" style="font-size:19px">${esc(title)}</div>
            ${body ? `<div class="sheet__sub">${esc(body)}</div>` : ""}
          </div>
        </div>
        <div class="sheet__foot">
          <button class="btn btn--ghost" data-a="cancel" type="button">${esc(cancelLabel)}</button>
          <button class="btn btn--primary" data-a="ok" type="button"${danger ? ' style="background:#C2603F;border-color:#C2603F"' : ""}>${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const okBtn = overlay.querySelector('[data-a="ok"]');
    const cancelBtn = overlay.querySelector('[data-a="cancel"]');
    const focusables = [cancelBtn, okBtn];

    const done = (val) => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      try { prev && prev.focus && prev.focus(); } catch { /* ignore */ }
      resolve(val);
    };
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); done(false); }
      else if (e.key === "Enter") { e.preventDefault(); done(true); }
      else if (e.key === "Tab") { // Fokus bleibt im Dialog
        e.preventDefault();
        const i = focusables.indexOf(document.activeElement);
        const next = e.shiftKey ? (i <= 0 ? focusables.length - 1 : i - 1) : (i + 1) % focusables.length;
        focusables[next].focus();
      }
    }
    okBtn.addEventListener("click", () => done(true));
    cancelBtn.addEventListener("click", () => done(false));
    overlay.querySelector(".sheet-overlay__scrim").addEventListener("click", () => done(false));
    document.addEventListener("keydown", onKey, true);
    okBtn.focus();
  });
}
