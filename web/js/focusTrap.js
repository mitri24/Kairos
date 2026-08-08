// Wiederverwendbare Fokus-Falle für modale Overlays (A11y). Hält Tab/Shift+Tab im
// Dialog, legt einen sinnvollen Anfangsfokus, gibt den Fokus beim Schließen an das
// zuvor fokussierte Element zurück und ruft optional onEscape() bei Escape.
//
// Bewusst ohne Abhängigkeiten und ohne DOM-Aufbau — die Modale bauen ihr Markup
// selbst, hier kommt nur das Tastatur-/Fokus-Verhalten dazu:
//   const trap = createFocusTrap(dialogEl, { onEscape: close, initialFocus: () => okBtn });
//   trap.activate();  // beim Öffnen (nachdem das Overlay sichtbar ist)
//   trap.release();   // beim Schließen

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

// Sichtbar = hat Layout-Boxen (deckt display:none, hidden-Ancestor und die
// versteckten Onboarding-/Tab-Panels ab, ohne offsetParent-Fallstricke bei fixed).
const isVisible = (el) => !!el.getClientRects().length;

export function createFocusTrap(container, { onEscape, initialFocus } = {}) {
  let prevFocus = null;
  let active = false;

  const focusables = () => Array.from(container.querySelectorAll(FOCUSABLE)).filter(isVisible);

  function onKey(e) {
    if (!active) return;
    if (e.key === "Escape") {
      if (onEscape) { e.preventDefault(); onEscape(); }
      return;
    }
    if (e.key !== "Tab") return;
    const items = focusables();
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    const cur = document.activeElement;
    if (e.shiftKey) {
      if (cur === first || !container.contains(cur)) { e.preventDefault(); last.focus(); }
    } else if (cur === last || !container.contains(cur)) {
      e.preventDefault(); first.focus();
    }
  }

  return {
    activate() {
      if (active) return;
      active = true;
      prevFocus = document.activeElement;
      // Capture-Phase: greift, bevor andere Handler den Tab konsumieren.
      document.addEventListener("keydown", onKey, true);
      // initialFocus:false → Anfangsfokus NICHT anfassen (das Modal setzt ihn selbst,
      // z. B. Namensfeld mit Cursor am Ende); sonst würde der Trap ihn überschreiben.
      if (initialFocus !== false) {
        const pick = typeof initialFocus === "function" ? initialFocus() : initialFocus;
        const target = pick || focusables()[0] || container;
        // Microtask, damit das Overlay garantiert sichtbar/gelayoutet ist.
        queueMicrotask(() => { try { target.focus(); } catch { /* ignore */ } });
      }
    },
    release() {
      if (!active) return;
      active = false;
      document.removeEventListener("keydown", onKey, true);
      try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch { /* ignore */ }
      prevFocus = null;
    },
  };
}
