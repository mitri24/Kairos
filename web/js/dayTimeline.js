// Tages-Zeitstrahl (Heute-Ansicht, linke Spalte).
// - Vertikaler Zeitstrahl 06:00–24:00, läuft mit der (NTP-)Systemuhr mit (Now-Linie).
// - Aufgaben mit scheduledMin erscheinen als Blöcke an ihrer Uhrzeit.
// - Farben: future / now / past; erledigt = grün, überfällig & offen = Warnfarbe.
// - Drop-Ziel für Drag & Drop aus der Aufgabenliste; Blöcke selbst verschiebbar.
// - Überfällige, offene Aufgaben: Nachfrage „erledigt?" — Ja → fertig,
//   Nein → automatisch in den nächsten freien Slot.
import {
  minToClock, nowMinOfDay, slotStatus, isOverdue, rescheduleWithinDay,
  roundToStep, ceilToStep, escapeHtml, dayKeyOf, addDaysKey, formatMinutes, subjectColor,
  DAY_START_MIN, DAY_END_MIN, SLOT_STEP_MIN,
} from "/js/util.js";
import { showToast } from "/js/toast.js";
import { createFocusTrap } from "/js/focusTrap.js";
import { icon } from "/js/icons.js";
import { layoutOverlaps, laneStyle } from "/js/calendarLayout.js";

const PX_PER_MIN = 64 / 60;                     // 64 px pro Stunde (Design), 18 h ≈ 1152 px
const WINDOW_MIN = DAY_END_MIN - DAY_START_MIN;
// Mindesthöhe in PIXELN, nicht in Minuten: eine 15-Minuten-Aufgabe war vorher
// 14 px hoch — bei 18 px Innenabstand blieb vom Text nichts übrig.
const MIN_BLOCK_PX = 30;                        // eine Textzeile passt immer
const COMPACT_PX = 48;                          // darunter einzeilig (wie kurze Termine bei Apple)
const SNOOZE_MIN = 5;                           // „später": so lange nicht erneut fragen

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Herkunft eines Kalender-Termins ──────────────
// Name des Quell-Kalenders (Fallback: Kontoname), damit am Block steht, WOHER er kommt.
const calName = (b) => (b.calendar && (b.calendar.name || b.calendar.account)) || null;
// Farbe: die im Quell-Kalender gesetzte Farbe hat Vorrang (das ist die Farbe, die
// der Nutzer in seiner Kalender-App kennt). Fehlt sie, wird aus dem Kalendernamen
// deterministisch eine Farbe der Sage-Palette abgeleitet — nie eine zufällige.
// CalDAV liefert teils #RRGGBBAA; alles andere wird verworfen, statt ungeprüft in
// einen style="" zu wandern.
function calColor(b) {
  const raw = String(b.calendar?.color || "").trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw);
  if (m) return `#${m[1].length === 8 ? m[1].slice(0, 6) : m[1]}`;
  const name = calName(b);
  return name ? subjectColor(name).color : "var(--line-strong)";
}
const durOf = (t) => Math.max(SLOT_STEP_MIN, Math.round(Number(t.estMinutes) || 25));

export function initDayTimeline({ store, api }) {
  const el = (id) => document.getElementById(id);
  const root = el("dayTimeline");
  const inner = el("dayTimelineInner");
  const clockLabel = el("planClock");
  const emptyHint = el("planEmpty");
  const alldayRow = el("dayAllday");
  if (!root || !inner) return {};

  const modal = buildModal();
  document.body.appendChild(modal.overlay);

  const handled = new Set();     // key `${id}:${scheduledMin}` bereits beantwortet
  const snoozed = new Map();     // key -> absolute epoch ms, bis dahin nicht erneut fragen
  let currentKey = null;         // gerade offener Prompt (null = keiner)
  let lastMin = -1;
  let lastDayKey = null;         // Tageswechsel → handled/snoozed leeren

  inner.style.height = `${WINDOW_MIN * PX_PER_MIN}px`;

  async function act(fn) {
    try { store.applySnapshot(await fn()); return true; }
    catch (e) { console.warn("[plan]", e.message); return false; }
  }

  // ── Datenauswahl: heute geplante Aufgaben (mit Uhrzeit) ──
  function scheduledToday() {
    const today = dayKeyOf(store.now());
    return store.state.tasks
      .filter((t) => {
        if (t.scheduledMin == null) return false;
        if (t.done) return t.doneAt && dayKeyOf(t.doneAt) === today; // heute erledigt zeigen
        return !t.plannedDate || t.plannedDate <= today;             // heute/überfällig/undatiert
      })
      .sort((a, b) => a.scheduledMin - b.scheduledMin);
  }

  const yOf = (min) => (min - DAY_START_MIN) * PX_PER_MIN;

  // ── Rendering ────────────────────────────────────
  function render() {
    const nowMin = nowMinOfDay(store.now());
    lastMin = Math.floor(nowMin);
    if (clockLabel) clockLabel.textContent = minToClock(nowMin);

    // Tageswechsel: beantwortete/aufgeschobene Nachfragen zurücksetzen.
    const dayKey = dayKeyOf(store.now());
    if (dayKey !== lastDayKey) { handled.clear(); snoozed.clear(); lastDayKey = dayKey; }

    const tasks = scheduledToday();
    if (emptyHint) emptyHint.hidden = tasks.length > 0;

    let h = `<div class="tl-axis" aria-hidden="true"></div>`;
    // Stundenlabels (nur Beschriftung, keine Querlinien — wie im Design)
    for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 60) {
      h += `<div class="tl-hour" style="top:${yOf(m)}px"><span class="tl-hour__lbl">${minToClock(m)}</span></div>`;
    }
    // Kalender-Termine (synchronisiert) und Aufgaben teilen sich EINE Spur:
    // Was gleichzeitig läuft, steht nebeneinander (wie Apple Kalender) — vorher
    // verschwand der Termin vollständig hinter der Aufgabe. Ganztägige als Chips oben.
    const cal = store.state.calendarToday || [];
    if (alldayRow) {
      const allday = cal.filter((b) => b.allDay);
      alldayRow.hidden = allday.length === 0;
      alldayRow.innerHTML = allday.map((b) =>
        `<span class="tl-allday__chip" style="--cal:${calColor(b)}"><i class="tl-cal__dot"></i>${escapeHtml(b.summary)}</span>`).join("");
    }

    const laid = layoutOverlaps([
      ...cal.filter((b) => !b.allDay).map((b) => ({
        kind: "busy", start: b.startMin, end: b.startMin + b.durationMin, busy: b,
      })),
      ...tasks.map((t) => {
        const dur = durOf(t);
        return { kind: "task", start: t.scheduledMin, end: t.scheduledMin + dur, task: t, dur };
      }),
    ]);

    let lanes = "";
    for (const item of laid) {
      const durMin = item.end - item.start;
      const height = Math.max(MIN_BLOCK_PX, durMin * PX_PER_MIN - 2);
      // Außerhalb des Fensters (z. B. < 06:00) sichtbar halten statt abschneiden.
      const top = clamp(yOf(item.start), 0, WINDOW_MIN * PX_PER_MIN - height);
      const { left, width } = laneStyle(item);
      const pos = `top:${top}px;height:${height}px;left:${left.toFixed(2)}%;width:${width.toFixed(2)}%`;
      const compact = height < COMPACT_PX;
      // Teilt sich der Block die Breite, bleibt nur Platz für das Wichtigste:
      // der Titel. Nebeninfo (Dauer, Zeitraum) fällt weg statt ihn wegzudrücken.
      const narrow = (item.cols || 1) > 1;
      const range = `${minToClock(item.start)}–${minToClock(item.end)}`;

      if (item.kind === "busy") {
        const b = item.busy;
        const src = calName(b);
        // Untertitel nennt die HERKUNFT zuerst — „woher kommt dieser Termin?"
        // ist beim Blick auf einen fremden Block die erste Frage.
        const subBits = [src, range, b.location].filter(Boolean).map((x) => escapeHtml(x));
        const sub = (compact || narrow) ? "" : `<span class="tl-busy__sub">${subBits.join(" · ")}</span>`;
        const tip = [b.summary, range, src && `from ${src}`].filter(Boolean).join(" · ");
        lanes += `<div class="tl-busy${compact ? " is-compact" : ""}${narrow ? " is-narrow" : ""}" style="${pos};--cal:${calColor(b)}" title="${escapeHtml(tip)}">
              <span class="tl-busy__name">${escapeHtml(b.summary)}</span>${sub}
            </div>`;
        continue;
      }

      const t = item.task;
      const dur = item.dur;
      const status = t.done ? "done" : slotStatus({ startMin: t.scheduledMin, durationMin: dur }, nowMin);
      const sub = t.subject ? `${escapeHtml(t.subject)} · ${formatMinutes(dur)}` : range;
      const right = t.done ? "" : `<button type="button" class="tl-item__focus" data-act="focus" aria-label="Start focus: ${escapeHtml(t.text)}" title="Start focus">${icon("play", { size: 13 })}</button>`;
      // Fachfarbe wie im Wochen-Board (Klasse subj-N → --sc/--sc-tint/--sc-ink),
      // damit derselbe Stoff in beiden Kalendern dieselbe Farbe trägt.
      lanes += `<div class="tl-item ${subjectColor(t.subject).cls} is-${status}${compact ? " is-compact" : ""}${narrow ? " is-narrow" : ""}${t.active ? " is-active" : ""}" data-id="${escapeHtml(String(t.id))}"
              draggable="true" style="${pos}" title="${escapeHtml(t.text)} · ${range}">
              <div class="tl-item__body">
                <div class="tl-item__row"><span class="tl-item__name">${escapeHtml(t.text)}</span>${right}</div>
                ${(compact || narrow) ? "" : `<div class="tl-item__sub">${sub}</div>`}
              </div>
            </div>`;
    }
    h += `<div class="tl-lanes">${lanes}</div>`;
    // Now-Linie (zuletzt → oben drüber), mit Uhrzeit-Label in Terrakotta
    if (nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN) {
      h += `<div class="tl-now" style="top:${yOf(nowMin)}px" aria-hidden="true">
              <span class="tl-now__time">${minToClock(nowMin)}</span><span class="tl-now__dot"></span><span class="tl-now__line"></span>
            </div>`;
    }
    inner.innerHTML = h;

    maybePrompt(tasks, nowMin);
  }

  // Nur bei Minutenwechsel voll neu zeichnen (spart Flackern); Prompt-Check jede Sekunde.
  function tick() {
    const nowMin = nowMinOfDay(store.now());
    if (Math.floor(nowMin) !== lastMin) render();
    else maybePrompt(scheduledToday(), nowMin);
  }

  // Erststart: Zeitstrahl auf „jetzt" scrollen.
  function scrollToNow() {
    const nowMin = nowMinOfDay(store.now());
    root.scrollTop = clamp(yOf(nowMin) - root.clientHeight / 2, 0, inner.clientHeight);
  }

  // ── Überfällig-Nachfrage ─────────────────────────
  function maybePrompt(tasks, nowMin) {
    if (currentKey) return; // es ist bereits ein Dialog offen
    for (const t of tasks) {
      if (t.done) continue;
      if (!isOverdue({ startMin: t.scheduledMin, durationMin: durOf(t) }, nowMin)) continue;
      const key = `${t.id}:${t.scheduledMin}`;
      if (handled.has(key)) continue;
      const until = snoozed.get(key);
      if (until != null && store.now() < until) continue;
      showPrompt(t, key);
      return;
    }
  }

  function showPrompt(task, key) {
    currentKey = key;
    const today = dayKeyOf(store.now());
    const nowMin = nowMinOfDay(store.now());
    // Nächsten freien Slot vorab bestimmen → in die primäre Aktion schreiben.
    const occupied = scheduledToday()
      .filter((x) => String(x.id) !== String(task.id) && !x.done)
      .map((x) => ({ startMin: x.scheduledMin, durationMin: durOf(x) }))
      // Kalender-Termine blockieren den Vorschlag ebenfalls (nicht in ein Meeting planen).
      .concat((store.state.calendarToday || []).filter((b) => !b.allDay)
        .map((b) => ({ startMin: b.startMin, durationMin: b.durationMin })));
    const from = Math.max(ceilToStep(nowMin, SLOT_STEP_MIN), DAY_START_MIN);
    // Nächster freier Slot, der noch in den Tag passt; sonst morgen früh (nie hinter 24:00).
    const { startMin: newMin, overflow } = rescheduleWithinDay(occupied, durOf(task), from);
    const targetDay = overflow ? addDaysKey(today, 1) : today;

    modal.title.textContent = `${task.text} was due ${minToClock(task.scheduledMin)}`;
    modal.resched.textContent = overflow
      ? `Reschedule to tomorrow ${minToClock(newMin)} (today’s full)`
      : `Reschedule to ${minToClock(newMin)} (next free)`;
    modal.overlay.hidden = false;
    modal.resched.focus();
    modal.trap.activate();

    // handled erst NACH erfolgreichem Update setzen; scheitert es (offline),
    // bleibt der Slot re-promptbar (kurz zurückgestellt, statt für immer stumm).
    const settle = (ok) => { if (ok) handled.add(key); else snoozed.set(key, store.now() + SNOOZE_MIN * 60_000); };
    modal.onResched = async () => { close(); settle(await act(() => api.tasks.update(task.id, { scheduledMin: newMin, plannedDate: targetDay }))); };
    modal.onDone = async () => { close(); settle(await act(() => api.tasks.update(task.id, { done: true }))); };
    modal.onTomorrow = async () => { close(); settle(await act(() => api.tasks.update(task.id, { plannedDate: addDaysKey(today, 1) }))); };
    modal.onDrop = async () => {
      close();
      const snap = { text: task.text, subject: task.subject || undefined, priority: task.priority, estMinutes: task.estMinutes, plannedDate: task.plannedDate || undefined, scheduledMin: task.scheduledMin ?? undefined, dueDate: task.dueDate ?? undefined, examId: task.examId ?? undefined };
      const ok = await act(() => api.tasks.remove(task.id));
      settle(ok);
      if (ok) showToast({ type: "success", title: "Dropped — no judgement", body: task.text, timeout: 6000, action: { label: "Undo", onClick: () => act(() => api.tasks.create(snap)) } });
    };
    modal.onLater = () => { snoozed.set(key, store.now() + SNOOZE_MIN * 60_000); close(); };
  }

  function close() {
    modal.overlay.hidden = true;
    modal.trap.release();
    currentKey = null;
  }

  // ── Drag & Drop: Uhrzeit aus der Drop-Position ───
  function minFromEvent(e) {
    const rect = inner.getBoundingClientRect();           // Viewport-Koord., scroll-korrekt
    const min = DAY_START_MIN + (e.clientY - rect.top) / PX_PER_MIN;
    return clamp(roundToStep(min, SLOT_STEP_MIN), DAY_START_MIN, DAY_END_MIN - SLOT_STEP_MIN);
  }

  root.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    root.classList.add("is-drop");
  });
  root.addEventListener("dragleave", (e) => {
    if (!root.contains(e.relatedTarget)) root.classList.remove("is-drop");
  });
  root.addEventListener("drop", (e) => {
    e.preventDefault();
    root.classList.remove("is-drop");
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const min = minFromEvent(e);
    const today = dayKeyOf(store.now());
    act(() => api.tasks.update(id, { scheduledMin: min, plannedDate: today }));
  });

  // Blöcke selbst als Drag-Quelle (Verschieben) — nutzt denselben Drop-Handler.
  inner.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".tl-item");
    if (!item || e.target.closest("button")) { e.preventDefault(); return; }
    e.dataTransfer.setData("text/plain", item.dataset.id);
    e.dataTransfer.effectAllowed = "move";
    item.classList.add("is-dragging");
  });
  inner.addEventListener("dragend", (e) => {
    e.target.closest?.(".tl-item")?.classList.remove("is-dragging");
  });

  // Jeder geplante Task kann direkt aus dem Kalender in den Fokusmodus wechseln.
  inner.addEventListener("click", async (e) => {
    const item = e.target.closest(".tl-item");
    if (!item) return;
    if (e.target.closest("[data-act='focus']")) {
      e.stopPropagation();
      const button = e.target.closest("[data-act='focus']");
      button.disabled = true;
      try {
        const ok = await act(() => api.timer.activeTask(item.dataset.id));
        if (ok) document.dispatchEvent(new CustomEvent("open-focus-session"));
      } finally { button.disabled = false; }
      return;
    }
    store.setUi({ expandedTaskId: item.dataset.id });
  });

  store.subscribe(render);
  render();
  scrollToNow();
  return { tick };
}

// ── Overdue-Prompt (Card B): „Missed block" — scham-frei, 4 ehrliche Aktionen ──
function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "sheet-overlay overdue-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `<div class="sheet-overlay__scrim"></div>
    <div class="overdue" role="dialog" aria-modal="true" aria-labelledby="planModalTitle">
      <div class="overdue__head"><span class="overdue__dot"></span><span class="overdue__eyebrow">Missed block</span></div>
      <div class="overdue__title" id="planModalTitle">–</div>
      <div class="overdue__sub">Missed ≠ failed. Pick what’s true now — Kairos fits it back in.</div>
      <div class="overdue__actions">
        <button class="btn btn--primary btn--wide" data-a="resched">Reschedule</button>
        <button class="btn btn--ghost btn--wide" data-a="done">I did it — mark done</button>
        <div class="overdue__split">
          <button class="btn btn--ghost" data-a="tomorrow">Tomorrow</button>
          <button class="btn btn--ghost overdue__drop" data-a="drop">Drop it</button>
        </div>
      </div>
    </div>`;

  const card = overlay.querySelector(".overdue");
  const handles = {
    overlay,
    title: overlay.querySelector("#planModalTitle"),
    resched: overlay.querySelector('[data-a="resched"]'),
    trap: createFocusTrap(card, { initialFocus: false }),
    onResched: null, onDone: null, onTomorrow: null, onDrop: null, onLater: null,
  };

  overlay.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "resched") return handles.onResched?.();
    if (a === "done") return handles.onDone?.();
    if (a === "tomorrow") return handles.onTomorrow?.();
    if (a === "drop") return handles.onDrop?.();
    if (!card.contains(e.target)) handles.onLater?.(); // Klick auf den Hintergrund = später
  });
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") handles.onLater?.();
  });

  return handles;
}
