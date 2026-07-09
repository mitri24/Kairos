// Heute-Ziel-Karte: Tages-Lernziel (Stunden), Fortschritt der bereits
// fokussierten Zeit und ein Schnellstart-Button für den Fokus-Timer.
import { formatHours } from "/js/util.js";

export function initToday({ store, api }) {
  const el = (id) => document.getElementById(id);
  const goalInput = el("todayGoalHours");
  const progressBar = el("todayProgressBar");
  const doneLabel = el("todayDoneLabel");
  const remainLabel = el("todayRemainLabel"); // optional (evtl. nicht im DOM)
  const startBtn = el("startTodayBtn");

  // ── Aktionen ───────────────────────────────────
  async function act(fn) {
    try { store.applySnapshot(await fn()); }
    catch (e) { console.warn("[today]", e.message); }
  }

  // Tagesziel ändern → Einstellungen speichern.
  goalInput?.addEventListener("change", () => {
    const v = Number(goalInput.value);
    if (Number.isFinite(v) && v > 0) act(() => api.setSettings({ todayGoalHours: v }));
  });

  // Sofort einen Fokus-Block starten.
  startBtn?.addEventListener("click", () => act(() => api.timer.start()));

  // ── Rendering ──────────────────────────────────
  function render() {
    const s = store.state;
    const goalHours = Number(s.settings.todayGoalHours) || 4;
    const focusMs = Math.max(0, s.today.focusMs || 0);
    const goalMs = goalHours * 3_600_000;

    // Input nicht überschreiben, solange er fokussiert ist.
    if (goalInput && document.activeElement !== goalInput) {
      goalInput.value = String(goalHours);
    }

    const pct = goalMs > 0 ? Math.min(100, (focusMs / goalMs) * 100) : 0;
    if (progressBar) progressBar.style.width = `${pct}%`;

    if (doneLabel) {
      doneLabel.textContent =
        `${formatHours(focusMs)} h von ${goalHours.toFixed(1)} h geschafft`;
    }

    if (remainLabel) {
      const remainMs = Math.max(0, goalMs - focusMs);
      remainLabel.textContent = remainMs > 0
        ? `noch ${formatHours(remainMs)} h`
        : "Ziel erreicht 🎉";
    }
  }

  store.subscribe(render);
  render();

  return {};
}
