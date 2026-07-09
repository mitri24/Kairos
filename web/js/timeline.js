// Timeline-Karte: baut aus den offenen Tasks der aktiven Prüfung einen
// einfachen Tagesablauf (Blöcke hintereinander, keine Pausen). Nur Lesezugriff.
import { formatClock, formatHours, escapeHtml } from "/js/util.js";

const FIVE_MIN_MS = 5 * 60_000;

export function initTimeline({ store }) {
  const el = (id) => document.getElementById(id);
  const timeline = el("timeline");
  const timelineEmpty = el("timelineEmpty");
  const finishLabel = el("finishLabel");
  const paceLabel = el("paceLabel");

  let lastMinute = null;

  // ── Datenaufbereitung ──────────────────────────
  // Offene Tasks der aktiven Prüfung (oder alle), sortiert nach Prio/Fälligkeit.
  function openTasks() {
    const { tasks, settings } = store.state;
    const activeExamId = settings.activeExamId;
    return tasks
      .filter((t) => !t.done)
      .filter((t) => !activeExamId || t.examId === activeExamId || t.examId == null)
      .slice()
      .sort(compareTasks);
  }

  function compareTasks(a, b) {
    const pa = a.priority || 2, pb = b.priority || 2;
    if (pa !== pb) return pa - pb;                 // Prio 1 zuerst
    const da = a.dueDate || Infinity, db = b.dueDate || Infinity;
    if (da !== db) return da - db;                 // frühere Fälligkeit zuerst
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  }

  // ab jetzt, auf 5 Minuten gerundet
  function round5(ms) { return Math.round(ms / FIVE_MIN_MS) * FIVE_MIN_MS; }

  function buildBlocks() {
    const blocks = [];
    let cursor = round5(store.now());
    for (const t of openTasks()) {
      const est = Number(t.estMinutes) || 0;
      const spentMin = (Number(t.spentMs) || 0) / 60_000;
      const mins = Math.max(5, Math.round(est - spentMin));   // Restdauer, min. 5 Min
      const start = cursor;
      const end = start + mins * 60_000;
      blocks.push({ text: t.text, start, end, mins });
      cursor = end;
    }
    return blocks;
  }

  // ── Rendering ──────────────────────────────────
  function render() {
    lastMinute = Math.floor(store.now() / 60_000);
    const blocks = buildBlocks();

    if (blocks.length === 0) {
      timeline.innerHTML = "";
      timelineEmpty.hidden = false;
      finishLabel.textContent = "–";
      paceLabel.textContent = "–";
      return;
    }

    timelineEmpty.hidden = true;

    timeline.innerHTML = blocks.map((b, i) => `
      <div class="tl-block${i === 0 ? " is-now" : ""}">
        <div class="tl-block__time">${formatClock(b.start)}</div>
        <div class="tl-block__body">
          <div class="tl-block__name">${escapeHtml(b.text)}</div>
          <div class="tl-block__range">${formatClock(b.start)}–${formatClock(b.end)} · ${b.mins} min</div>
        </div>
      </div>`).join("");

    const last = blocks[blocks.length - 1];
    finishLabel.textContent = formatClock(last.end);

    const n = blocks.length;
    const totalMin = blocks.reduce((sum, b) => sum + b.mins, 0);
    paceLabel.textContent = `${n} ${n === 1 ? "block" : "blocks"} · ${formatHours(totalMin * 60_000)} h`;
  }

  // Sekundengenau ist unnötig — nur neu rendern, wenn sich die Minute geändert hat.
  function tick() {
    if (Math.floor(store.now() / 60_000) !== lastMinute) render();
  }

  store.subscribe(render);
  render();
  return { tick };
}
