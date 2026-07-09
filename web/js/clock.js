// Immer sichtbare Wanduhr im Kopf. Nutzt die NTP-korrigierte Zeit aus dem Store.
import { formatClock, formatDate } from "/js/util.js";

export function initClock({ store }) {
  const elTime = document.getElementById("wallTime");
  const elDate = document.getElementById("wallDate");
  const elSrc = document.getElementById("wallSrc");
  const elTodayLabel = document.getElementById("todayDateLabel");

  function render() {
    const now = store.now();
    // Wanduhr im Sidebar-Kopf wurde entfernt — Elemente können fehlen.
    if (elTime) elTime.textContent = formatClock(now);
    if (elDate) elDate.textContent = formatDate(now);
    // Titel der Heute-Ansicht (z. B. "Thursday, 09/07") — bleibt erhalten.
    if (elTodayLabel) {
      elTodayLabel.textContent = new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "2-digit" });
    }
    // Zeitquelle: NTP (server-korrigiert) vs. lokal
    if (elSrc) {
      const synced = store.state.online && store.state.loaded;
      elSrc.textContent = synced ? "NTP" : "lokal";
      elSrc.dataset.mode = synced ? "ntp" : "local";
    }
  }

  render();
  store.subscribe(render);
  // tick: jede Sekunde aktualisieren (Sekundenzeiger der Wanduhr)
  return { render, tick: render };
}
