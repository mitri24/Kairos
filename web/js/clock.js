// Immer sichtbare Wanduhr im Kopf. Nutzt die NTP-korrigierte Zeit aus dem Store.
import { formatClock, formatDate } from "/js/util.js";

export function initClock({ store }) {
  const elTime = document.getElementById("wallTime");
  const elDate = document.getElementById("wallDate");
  const elSrc = document.getElementById("wallSrc");
  const elTodayLabel = document.getElementById("todayDateLabel");

  function render() {
    const now = store.now();
    elTime.textContent = formatClock(now);
    const dateStr = formatDate(now);
    elDate.textContent = dateStr;
    // Titel der Heute-Ansicht (z. B. "Mittwoch, 08.07.")
    if (elTodayLabel) {
      elTodayLabel.textContent = new Date(now).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" });
    }
    // Zeitquelle: NTP (server-korrigiert) vs. lokal
    const synced = store.state.online && store.state.loaded;
    elSrc.textContent = synced ? "NTP" : "lokal";
    elSrc.dataset.mode = synced ? "ntp" : "local";
  }

  render();
  store.subscribe(render);
  // tick: jede Sekunde aktualisieren (Sekundenzeiger der Wanduhr)
  return { render, tick: render };
}
