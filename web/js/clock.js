// Immer sichtbare Uhr/Datum im Heute-Kopf. Nutzt die NTP-korrigierte Zeit.
import { formatClock, weekdayLong, dateLong } from "/js/util.js";

export function initClock({ store }) {
  const elTime = document.getElementById("wallTime");
  const elDate = document.getElementById("wallDate");
  const elSrc = document.getElementById("wallSrc");
  const globalDate = document.getElementById("globalDate");

  function render() {
    const now = store.now();
    if (elTime) elTime.textContent = formatClock(now);
    if (elDate) elDate.textContent = dateLong(now);
    if (globalDate) {
      globalDate.textContent = `${weekdayLong(now)}, ${dateLong(now)}`;
      globalDate.dateTime = new Date(now).toISOString().slice(0, 10);
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
