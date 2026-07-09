// Prüfungs-Modul: Chips oben (Auswahl der aktiven Prüfung + Hinzufügen) und
// die Countdown-Karte für die aktive Prüfung (Resttage, Sekunden-HMS, Pensum,
// Themen-Fortschritt). Liest store.state, schreibt ausschließlich über api.
import {
  daysUntil, hmsUntil, toDatetimeLocal, fromDatetimeLocal, escapeHtml,
} from "/js/util.js";

const DAY_MS = 86_400_000;

export function initExam({ store, api }) {
  const el = (id) => document.getElementById(id);

  // ── DOM-Elemente ───────────────────────────────
  const examChips = el("examChips");
  const addExamBtn = el("addExamBtn");
  const examName = el("examName");
  const deleteExamBtn = el("deleteExamBtn");
  const examDaysNum = el("examDaysNum");
  const examHMS = el("examHMS");
  const examDate = el("examDate");
  const examProgressBar = el("examProgressBar");
  const examPensum = el("examPensum");
  const examRemainLabel = el("examRemainLabel");
  const examEmpty = el("examEmpty");

  // ── Hilfen ─────────────────────────────────────
  function activeExam() {
    const { exams, settings } = store.state;
    if (!exams.length) return null;
    return exams.find((e) => e.id === settings.activeExamId) || exams[0];
  }

  async function act(fn) {
    try { store.applySnapshot(await fn()); }
    catch (e) { console.warn("[exam]", e.message); }
  }

  // ── Aktionen ───────────────────────────────────
  async function addExam() {
    try {
      const prevIds = new Set(store.state.exams.map((e) => e.id));
      store.applySnapshot(await api.exams.create({
        name: "Neue Prüfung",
        date: store.now() + 14 * DAY_MS,
      }));
      const created = store.state.exams.find((e) => !prevIds.has(e.id));
      if (created) store.applySnapshot(await api.setSettings({ activeExamId: created.id }));
    } catch (e) { console.warn("[exam]", e.message); }
  }

  addExamBtn.addEventListener("click", addExam);

  // Chip-Klick (Delegation) → aktive Prüfung umschalten.
  examChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".exam-chip");
    if (!chip || !examChips.contains(chip)) return;
    const ex = store.state.exams.find((x) => String(x.id) === chip.dataset.id);
    if (ex) act(() => api.setSettings({ activeExamId: ex.id }));
  });

  examName.addEventListener("change", () => {
    const ex = activeExam();
    if (ex) act(() => api.exams.update(ex.id, { name: examName.value.trim() }));
  });

  examDate.addEventListener("change", () => {
    const ex = activeExam();
    if (ex) act(() => api.exams.update(ex.id, { date: fromDatetimeLocal(examDate.value) }));
  });

  examPensum.addEventListener("change", () => {
    const ex = activeExam();
    if (!ex) return;
    const hours = Math.max(0, Number(examPensum.value) || 0);
    act(() => api.exams.update(ex.id, { totalHours: hours }));
  });

  deleteExamBtn.addEventListener("click", () => {
    const ex = activeExam();
    if (ex) act(() => api.exams.remove(ex.id));
  });

  // ── Rendering ──────────────────────────────────
  function renderChips() {
    const { exams, settings } = store.state;
    const now = store.now();
    examChips.innerHTML = "";
    for (const ex of exams) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "exam-chip";
      if (ex.id === settings.activeExamId) chip.classList.add("is-active");
      chip.dataset.id = String(ex.id);
      const days = ex.date ? daysUntil(ex.date, now) : null;
      const daysHtml = days === null ? "" : `<span class="exam-chip__days">${days} T</span>`;
      chip.innerHTML = `<span class="exam-chip__name">${escapeHtml(ex.name || "Prüfung")}</span>${daysHtml}`;
      examChips.appendChild(chip);
    }
  }

  function renderCard() {
    const ex = activeExam();

    if (!ex) {
      examEmpty.hidden = false;
      if (document.activeElement !== examName) examName.value = "";
      examDaysNum.textContent = "–";
      examHMS.textContent = "--:--";
      if (document.activeElement !== examDate) examDate.value = "";
      if (document.activeElement !== examPensum) examPensum.value = "0";
      examProgressBar.style.width = "0%";
      examRemainLabel.textContent = "–";
      return;
    }

    examEmpty.hidden = true;
    const now = store.now();

    if (document.activeElement !== examName) examName.value = ex.name || "";
    examDaysNum.textContent = ex.date ? String(daysUntil(ex.date, now)) : "–";
    examHMS.textContent = ex.date ? hmsUntil(ex.date, now) : "--:--";
    if (document.activeElement !== examDate) examDate.value = ex.date ? toDatetimeLocal(ex.date) : "";
    if (document.activeElement !== examPensum) {
      examPensum.value = String(ex.totalHours != null ? ex.totalHours : 0);
    }

    // Fortschritt = erledigte Themen / Gesamt-Themen dieser Prüfung.
    const topics = store.state.topics.filter((t) => t.examId === ex.id);
    const total = topics.length;
    const done = topics.filter((t) => t.done).length;
    const frac = total ? done / total : 0;
    examProgressBar.style.width = `${Math.round(frac * 100)}%`;
    examRemainLabel.textContent = total ? `${done} von ${total} Themen` : "Noch keine Themen";
  }

  function render() {
    renderChips();
    renderCard();
  }

  // Sekunden-Countdown (#examHMS) unabhängig vom Store-Emit.
  function tick() {
    const ex = activeExam();
    if (!ex || !ex.date) return;
    const now = store.now();
    examHMS.textContent = hmsUntil(ex.date, now);
    examDaysNum.textContent = String(daysUntil(ex.date, now));
  }

  store.subscribe(render);
  render();
  return { tick };
}
