// Wochen-Kalender-Board: 7 Tagesspalten × durchgehende Zeitachse (08:00–24:00,
// dem Design entsprechend). Getaktete Aufgaben (scheduledMin) als Blöcke, ungetaktete
// geplante Aufgaben als „all-day"-Chips (nur wenn vorhanden). Now-Linie in der Heute-
// Spalte, Wochen-Navigation, Legende aus echten Fächern, ehrlicher Auto-plan-Schalter.
import {
  dayKeyOf, keyToMs, addDaysKey, mondayOf, escapeHtml, subjectColor,
  minToClock, nowMinOfDay, roundToStep, SLOT_STEP_MIN,
} from "/js/util.js";
import { showToast } from "/js/toast.js";
import { icon } from "/js/icons.js";
import { layoutOverlaps, laneStyle } from "/js/calendarLayout.js";

// Lokales Wochenfenster (08–24) — bewusst getrennt von shared DAY_START_MIN (06:00).
const WK_START_MIN = 8 * 60;      // 480
const WK_END_MIN = 24 * 60;       // 1440
const WK_WINDOW = WK_END_MIN - WK_START_MIN; // 960 min = 16 h
const MIN_BLOCK_PCT = 3.6;
const AXIS_STEP_MIN = 120;        // Achsenbeschriftung alle 2 h

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const durOf = (t) => Math.max(SLOT_STEP_MIN, Math.round(Number(t.estMinutes) || 25));
const topPct = (min) => ((min - WK_START_MIN) / WK_WINDOW) * 100;

export function initWeek({ store, api }) {
  const grid = document.getElementById("weekGrid");
  const el = (id) => document.getElementById(id);
  if (!grid) return {};

  let weekMonday = null;
  let addOpenKey = null;
  let lastSig = null;
  let lastMinFloor = -1;
  let lastDayKey = null;
  let dragging = false;
  let selected = new Set();
  let calendarByDay = new Map();
  let calendarLoadKey = null;
  let calendarAccounts = [];
  const detailPopover = document.createElement("aside");
  detailPopover.className = "week-event-detail";
  detailPopover.hidden = true;
  document.querySelector(".week-surface")?.appendChild(detailPopover);
  let detailTaskId = null;
  const closeDetail = () => { detailPopover.hidden = true; detailTaskId = null; };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
  document.addEventListener("pointerdown", (e) => {
    if (!detailPopover.hidden && !detailPopover.contains(e.target) && !e.target.closest(".wkb-block,.wkb-chip")) closeDetail();
  });

  function placeDetail(anchor) {
    const surface = anchor.closest(".week-surface"), sr = surface?.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
    if (!sr) return;
    const width = Math.min(320, sr.width - 24);
    detailPopover.style.width = `${width}px`;
    detailPopover.style.left = `${clamp(ar.right - sr.left + 10, 12, Math.max(12, sr.width - width - 12))}px`;
    detailPopover.style.top = `${clamp(ar.top - sr.top, 58, Math.max(58, sr.height - 300))}px`;
  }

  function openEventDialog(day, index, anchor) {
    const ev = (calendarByDay.get(day) || [])[Number(index)];
    if (!ev) return;
    const date = new Date(keyToMs(day)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const range = ev.allDay ? "All day" : `${minToClock(ev.startMin)}–${minToClock(ev.startMin + Math.max(5, ev.durationMin || 30))}`;
    const rows = [
      ["Date", date], ["Time", range], ["Calendar", ev.calendar?.name],
      ["Account", ev.calendar?.account], ["Location", ev.location],
    ].filter(([, value]) => value);
    detailPopover.innerHTML = `<div class="week-event-detail__top"><div class="week-event-detail__eyebrow" style="--calendar-color:${escapeHtml(ev.calendar?.color || "#718096")}"><i></i>Calendar event</div><button type="button" class="week-event-detail__close" data-detail="close" aria-label="Close">${icon("close")}</button></div><h2>${escapeHtml(ev.summary || "Calendar event")}</h2><div class="week-event-detail__rows">${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("")}</div><p class="week-event-detail__source">Synced event · managed in ${escapeHtml(ev.calendar?.name || "the source calendar")}</p>`;
    detailPopover.hidden = false;
    placeDetail(anchor);
  }

  function openTaskDetail(id, anchor) {
    const t = store.state.tasks.find((task) => String(task.id) === String(id));
    if (!t) return;
    detailTaskId = String(id);
    const date = t.plannedDate ? new Date(keyToMs(t.plannedDate)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "Inbox";
    const time = t.scheduledMin == null ? "No fixed time" : `${minToClock(t.scheduledMin)}–${minToClock(t.scheduledMin + durOf(t))}`;
    detailPopover.innerHTML = `<div class="week-event-detail__top"><div class="week-event-detail__eyebrow"><i class="${scClass(t)}"></i>Task</div><button type="button" class="week-event-detail__close" data-detail="close" aria-label="Close">${icon("close")}</button></div><h2>${escapeHtml(t.text)}</h2><div class="week-event-detail__rows"><div><span>Date</span><strong>${escapeHtml(date)}</strong></div><div><span>Time</span><strong>${time}</strong></div>${t.subject ? `<div><span>Subject</span><strong>${escapeHtml(t.subject)}</strong></div>` : ""}<div><span>Duration</span><strong>${durOf(t)} min</strong></div></div><div class="week-event-detail__actions"><button data-detail="toggle">${t.done ? "Reopen" : "Mark done"}</button><button data-detail="select">Select</button><button class="is-danger" data-detail="delete">Delete</button></div>`;
    detailPopover.hidden = false;
    placeDetail(anchor);
  }

  detailPopover.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-detail]")?.dataset.detail;
    if (!action) return;
    if (action === "close") return closeDetail();
    const t = store.state.tasks.find((task) => String(task.id) === detailTaskId);
    if (!t) return closeDetail();
    if (action === "toggle") await act(() => api.tasks.update(t.id, { done: !t.done }));
    if (action === "delete") await act(() => api.tasks.remove(t.id));
    if (action === "select") { selected.add(String(t.id)); render(true); }
    closeDetail();
  });

  async function act(fn) {
    try { store.applySnapshot(await fn()); }
    catch (e) { console.warn("[week]", e.message); }
  }

  // ── Navigation ─────────────────────────────────
  el("weekPrev")?.addEventListener("click", () => { weekMonday = addDaysKey(weekMonday, -7); render(true); });
  el("weekNext")?.addEventListener("click", () => { weekMonday = addDaysKey(weekMonday, 7); render(true); });
  el("weekToday")?.addEventListener("click", () => { weekMonday = mondayOf(dayKeyOf(store.now())); render(true); });
  // Auto-plan: ehrlich ohne Funktion (kein Planer-Backend) → No-op.
  el("weekAutoplan")?.addEventListener("click", (e) => e.preventDefault());

  el("weekCalendarsBtn")?.addEventListener("click", async () => {
    const panel = el("weekCalendars");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) await loadCalendarAccounts();
  });
  el("weekClearSelection")?.addEventListener("click", () => { selected.clear(); render(true); });
  el("weekDeleteSelected")?.addEventListener("click", async () => {
    const ids = [...selected];
    if (!ids.length) return;
    selected.clear();
    try {
      let snapshot = null;
      for (const id of ids) snapshot = await api.tasks.remove(id);
      if (snapshot) store.applySnapshot(snapshot);
      showToast({ type: "success", title: `${ids.length} tasks deleted` });
    } catch (e) { console.warn("[week]", e.message); }
    render(true);
  });

  async function loadCalendarAccounts() {
    try {
      const data = await api.calendar.accounts();
      calendarAccounts = data.accounts || [];
      renderCalendarPanel();
    } catch (e) { console.warn("[week calendars]", e.message); }
  }

  function renderCalendarPanel() {
    const panel = el("weekCalendars");
    if (!panel) return;
    const calendars = calendarAccounts.flatMap((a) => (a.calendars || []).filter((c) => c.enabled).map((c) => ({ ...c, account: a.label || a.username || "Calendar" })));
    panel.innerHTML = calendars.length ? calendars.map((c) => `<div class="week-calendar-row">
      <span class="week-calendar-row__color" style="--calendar-color:${escapeHtml(c.color || "#718096")}"></span>
      <span class="week-calendar-row__name">${escapeHtml(c.name || "Calendar")}</span>
      <span class="week-calendar-row__account">${escapeHtml(c.account)}</span>
      <button class="week-calendar-row__remove" type="button" data-calendar-remove="${c.id}">Delete calendar</button>
    </div>`).join("") : `<p class="week-calendars__empty">No connected calendars.</p>`;
  }

  el("weekCalendars")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-calendar-remove]");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
      const snap = await api.calendar.removeCalendar(btn.dataset.calendarRemove);
      store.applySnapshot(snap);
      calendarLoadKey = null;
      await Promise.all([loadCalendarAccounts(), loadWeekEvents(true)]);
    } catch (err) { console.warn("[week calendar remove]", err.message); }
  });

  // ── Klick-Delegation: add öffnen · erledigt · löschen ──
  grid.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-act='add-open']");
    if (openBtn) {
      const day = openBtn.getAttribute("data-day");
      addOpenKey = addOpenKey === day ? null : day;
      render(true);
      // Eingabefeld sofort fokussieren (funktioniert jetzt auch auf leerer Woche).
      if (addOpenKey) grid.querySelector(`.wkb-add[data-add-key="${addOpenKey}"]`)?.focus();
      return;
    }
    const eventItem = e.target.closest("[data-event-index]");
    if (eventItem) { openEventDialog(eventItem.dataset.eventDay, eventItem.dataset.eventIndex, eventItem); return; }
    const btn = e.target.closest("[data-act]");
    if (!btn) {
      const taskItem = e.target.closest("[data-id]");
      if (taskItem) openTaskDetail(taskItem.dataset.id, taskItem);
      return;
    }
    const id = btn.closest("[data-id]")?.getAttribute("data-id");
    const a = btn.getAttribute("data-act");
    if (a === "select" && id) {
      selected.has(id) ? selected.delete(id) : selected.add(id);
      render(true);
    } else if (a === "toggle" && id) {
      const t = store.state.tasks.find((x) => String(x.id) === id);
      if (t) act(() => api.tasks.update(id, { done: !t.done }));
    } else if (a === "del" && id) {
      const t = store.state.tasks.find((x) => String(x.id) === id);
      const snap = t ? { text: t.text, subject: t.subject || undefined, priority: t.priority, estMinutes: t.estMinutes, plannedDate: t.plannedDate || undefined, scheduledMin: t.scheduledMin ?? undefined, dueDate: t.dueDate ?? undefined, examId: t.examId ?? undefined } : null;
      act(() => api.tasks.remove(id)).then((ok) => {
        if (ok && snap) showToast({ type: "success", title: "Task deleted", body: t.text, timeout: 6000, action: { label: "Undo", onClick: () => act(() => api.tasks.create(snap)) } });
      });
    }
  });

  grid.addEventListener("keydown", (e) => {
    const inp = e.target.closest(".wkb-add[data-add-key]");
    if (!inp) return;
    if (e.key === "Enter") {
      const text = inp.value.trim();
      if (!text) return;
      const key = inp.getAttribute("data-add-key");
      // Erst nach Erfolg leeren/neu fokussieren (kein Verlust bei Fehler), erlaubt Schnell-Erfassung.
      act(() => api.tasks.create({ text, plannedDate: key })).then((ok) => {
        if (!ok) return;
        const next = grid.querySelector(`.wkb-add[data-add-key="${key}"]`);
        if (next) { next.value = ""; next.focus(); }
      });
    } else if (e.key === "Escape") {
      addOpenKey = null;
      render(true);
    }
  });

  // ── Drag & Drop ────────────────────────────────
  grid.addEventListener("dragstart", (e) => {
    const item = e.target.closest("[data-id][draggable='true']");
    if (!item) return;
    dragging = true;
    e.dataTransfer.setData("text/plain", item.getAttribute("data-id"));
    e.dataTransfer.effectAllowed = "move";
    item.classList.add("is-dragging");
  });
  grid.addEventListener("dragend", (e) => {
    dragging = false;
    e.target.closest?.("[data-id]")?.classList.remove("is-dragging");
    grid.querySelectorAll(".wkb-track.is-drop").forEach((t) => t.classList.remove("is-drop"));
  });
  grid.addEventListener("dragover", (e) => {
    const track = e.target.closest(".wkb-track");
    if (!track) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!track.classList.contains("is-drop")) {
      grid.querySelectorAll(".wkb-track.is-drop").forEach((t) => t.classList.remove("is-drop"));
      track.classList.add("is-drop");
    }
  });
  grid.addEventListener("drop", (e) => {
    const track = e.target.closest(".wkb-track");
    if (!track) return;
    e.preventDefault();
    track.classList.remove("is-drop");
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const day = track.getAttribute("data-day");
    const min = minFromTrack(e, track);
    act(() => api.tasks.update(id, { plannedDate: day, scheduledMin: min }));
  });

  function minFromTrack(e, track) {
    const r = track.getBoundingClientRect();
    const frac = clamp((e.clientY - r.top) / r.height, 0, 1);
    const min = WK_START_MIN + frac * WK_WINDOW;
    return clamp(roundToStep(min, SLOT_STEP_MIN), WK_START_MIN, WK_END_MIN - SLOT_STEP_MIN);
  }

  // ── Fokus-Erhalt ───────────────────────────────
  function captureFocus() {
    const a = document.activeElement;
    if (a?.dataset?.addKey && grid.contains(a)) {
      const c = { key: a.dataset.addKey, value: a.value };
      try { c.s = a.selectionStart; c.e = a.selectionEnd; } catch { /* egal */ }
      return c;
    }
    return null;
  }
  function restoreFocus(c) {
    if (!c) return;
    const inp = grid.querySelector(`.wkb-add[data-add-key="${c.key}"]`);
    if (!inp) return;
    inp.value = c.value;
    inp.focus();
    try { if (c.s != null) inp.setSelectionRange(c.s, c.e); } catch { /* egal */ }
  }

  // ── Datenauswahl je Tag ────────────────────────
  const weekDays = () => Array.from({ length: 7 }, (_, i) => addDaysKey(weekMonday, i));

  function dayData(dk) {
    const tasks = store.state.tasks;
    const metrics = store.state.recentMetrics || {};
    const timed = tasks
      .filter((t) => t.scheduledMin != null && (
        (!t.done && t.plannedDate === dk) ||
        (t.done && t.doneAt && dayKeyOf(t.doneAt) === dk)))
      .sort((a, b) => a.scheduledMin - b.scheduledMin);
    const untimedOpen = tasks
      .filter((t) => t.scheduledMin == null && !t.done && t.plannedDate === dk)
      .sort((a, b) => (a.priority || 2) - (b.priority || 2));
    const untimedDone = tasks
      .filter((t) => t.scheduledMin == null && t.done && t.doneAt && dayKeyOf(t.doneAt) === dk)
      .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const focusMs = metrics[dk]?.focusMs || 0;
    return { timed, untimed: [...untimedOpen, ...untimedDone], focusMs };
  }

  // ── Bausteine ──────────────────────────────────
  // Fachfarbe kommt über die Klasse subj-N aus tokens.css (nicht als Inline-Vars):
  // nur so greifen die Dark-Mode-Umrechnungen in adapt.css für [class*="subj-"].
  const scClass = (t) => subjectColor(t.subject).cls;
  // item = { task, dur, col, cols, span } aus layoutOverlaps().
  function blockHtml(item) {
    const t = item.task;
    const dur = item.dur;
    const top = clamp(topPct(t.scheduledMin), 0, 100);
    // Am unteren Rand KÜRZEN statt den Block nach oben zu schieben — sonst
    // stünde er an einer Uhrzeit, die nicht seine ist.
    const h = Math.min(Math.max(MIN_BLOCK_PCT, (dur / WK_WINDOW) * 100), Math.max(MIN_BLOCK_PCT, 100 - top));
    const { left, width } = laneStyle(item);
    const range = `${minToClock(t.scheduledMin)}–${minToClock(t.scheduledMin + dur)}`;
    return `<div class="wkb-block ${scClass(t)}${dur >= 45 ? " has-time" : ""}${t.done ? " is-done" : ""}${t.active ? " is-active" : ""}"
        data-id="${escapeHtml(String(t.id))}" draggable="true"
        style="top:${top.toFixed(2)}%;height:${h.toFixed(2)}%;left:calc(${left.toFixed(2)}% + 2px);width:calc(${width.toFixed(2)}% - 4px)"
        title="${escapeHtml(t.text)} · ${range}">
        <span class="wkb-block__name">${escapeHtml(t.text)}</span>
        <span class="wkb-block__time">${range}</span>
        <button class="wkb-select${selected.has(String(t.id)) ? " is-selected" : ""}" data-act="select" aria-label="Select task">${selected.has(String(t.id)) ? icon("check", { size: 10, stroke: 2.2 }) : ""}</button>
        <span class="wkb-block__actions">
          <button class="wkb-block__check" data-act="toggle" title="${t.done ? "Reopen" : "Done"}" aria-label="toggle done">${t.done ? icon("check", { size: 10, stroke: 2.2 }) : ""}</button>
          <button class="wkb-block__del" data-act="del" title="Delete" aria-label="delete">${icon("close", { size: 10, stroke: 2.2 })}</button>
        </span>
      </div>`;
  }

  function chipHtml(t) {
    return `<div class="wkb-chip ${scClass(t)}${t.done ? " is-done" : ""}${t.active ? " is-active" : ""}"
        data-id="${escapeHtml(String(t.id))}" draggable="true"
        title="${escapeHtml(t.text)}">
        <button class="wkb-select${selected.has(String(t.id)) ? " is-selected" : ""}" data-act="select" aria-label="Select task">${selected.has(String(t.id)) ? icon("check", { size: 10, stroke: 2.2 }) : ""}</button>
        <span class="wkb-chip__text">${escapeHtml(t.text)}</span>
        <button class="wkb-chip__del" data-act="del" title="Delete" aria-label="delete">${icon("close", { size: 10, stroke: 2.2 })}</button>
      </div>`;
  }

  function eventBlockHtml(item, dk) {
    const ev = item.event;
    const top = clamp(topPct(ev.startMin), 0, 100);
    const dur = Math.max(5, ev.durationMin || 30);
    const h = Math.min(Math.max(MIN_BLOCK_PCT, (dur / WK_WINDOW) * 100), Math.max(MIN_BLOCK_PCT, 100 - top));
    const { left, width } = laneStyle(item);
    const cal = ev.calendar?.name || "External calendar";
    const account = ev.calendar?.account ? ` · ${ev.calendar.account}` : "";
    const range = `${minToClock(ev.startMin)}–${minToClock(ev.startMin + dur)}`;
    const eventIndex = (calendarByDay.get(dk) || []).indexOf(ev);
    return `<div class="wkb-block wkb-block--external${dur >= 45 ? " has-time" : ""}" data-event-day="${dk}" data-event-index="${eventIndex}"
      style="--calendar-color:${escapeHtml(ev.calendar?.color || "#718096")};top:${top.toFixed(2)}%;height:${h.toFixed(2)}%;left:calc(${left.toFixed(2)}% + 2px);width:calc(${width.toFixed(2)}% - 4px)"
      title="${escapeHtml(ev.summary)} · ${range} · ${escapeHtml(cal + account)}">
      <span class="wkb-block__source"><i></i>${escapeHtml(cal)}</span>
      <span class="wkb-block__name">${escapeHtml(ev.summary)}</span>
      <span class="wkb-block__time">${range}</span>
    </div>`;
  }

  // Piktogramm ausschliesslich aus dem zentralen Icon-Set (kein handgerolltes SVG).
  const PLUS_SVG = icon("plus", { size: 11, stroke: 2.4 });

  function headCell(dk, todayKey) {
    const date = new Date(keyToMs(dk));
    const dow = date.toLocaleDateString("en-GB", { weekday: "short" });
    const num = date.getDate();
    const weekend = date.getDay() === 0;   // nur Sonntag blass (wie im Design)
    const cls = `wkb-daycell${dk === todayKey ? " is-today" : ""}${weekend ? " is-weekend" : ""}`;
    return `<div class="${cls}" data-act="add-open" data-day="${dk}" title="Add a task to ${dow}">
        <div class="wkb-daycell__label"><span class="wkb-dow">${dow}</span> <span class="wkb-date">${num}</span></div>
        <span class="wkb-plus" data-act="add-open" data-day="${dk}" aria-hidden="true">${PLUS_SVG}</span>
      </div>`;
  }

  function allCell(dk) {
    const d = dayData(dk);
    const taskChips = d.untimed.map(chipHtml).join("");
    const events = calendarByDay.get(dk) || [];
    const eventChips = events.filter((ev) => ev.allDay).map((ev) => {
      const cal = ev.calendar?.name || "External calendar";
      return `<div class="wkb-chip wkb-chip--external" data-event-day="${dk}" data-event-index="${events.indexOf(ev)}" style="--calendar-color:${escapeHtml(ev.calendar?.color || "#718096")}" title="${escapeHtml(cal)}">
        <i class="wkb-chip__source"></i><span class="wkb-chip__text">${escapeHtml(ev.summary)}</span><small>${escapeHtml(cal)}</small>
      </div>`;
    }).join("");
    const input = addOpenKey === dk
      ? `<input class="wkb-add" data-add-key="${dk}" placeholder="+ task…" maxlength="160" />`
      : "";
    return `<div class="wkb-allcell${addOpenKey === dk ? " is-adding" : ""}" data-day="${dk}">${taskChips}${eventChips}${input}</div>`;
  }

  function trackCell(dk, d, todayKey, nowMin) {
    const date = new Date(keyToMs(dk));
    const weekend = date.getDay() === 0;
    // Gleichzeitige Aufgaben teilen sich die Spaltenbreite (statt sich zu verdecken).
    const entries = d.timed.map((t) => {
      const dur = durOf(t);
      return { start: t.scheduledMin, end: t.scheduledMin + dur, task: t, dur };
    });
    for (const event of calendarByDay.get(dk) || []) {
      if (!event.allDay) entries.push({ start: event.startMin, end: event.startMin + event.durationMin, event });
    }
    const blocks = layoutOverlaps(entries).map((item) => item.event ? eventBlockHtml(item, dk) : blockHtml(item)).join("");
    const now = (dk === todayKey && nowMin >= WK_START_MIN && nowMin <= WK_END_MIN)
      ? `<div class="wkb-now" style="top:${topPct(nowMin).toFixed(2)}%"><span class="wkb-now__dot"></span></div>`
      : "";
    const cls = `wkb-track${dk === todayKey ? " is-today" : ""}${weekend ? " is-weekend" : ""}`;
    return `<div class="${cls}" data-day="${dk}">${blocks}${now}</div>`;
  }

  function axisHtml() {
    let h = "";
    for (let m = WK_START_MIN; m <= WK_END_MIN; m += AXIS_STEP_MIN) {
      // Nur zweistellige Stunde (Design: „08" statt „08:00").
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      h += `<span class="wkb-axis__lbl" style="top:${topPct(m).toFixed(3)}%">${hh}</span>`;
    }
    return h;
  }

  function buildBoard(days, todayKey, nowMin) {
    const data = days.map(dayData);
    const head = days.map((dk) => headCell(dk, todayKey)).join("");
    const body = days.map((dk, i) => trackCell(dk, data[i], todayKey, nowMin)).join("");
    // All-day-Band nur zeigen, wenn es ungetaktete geplante Aufgaben gibt (Mockup: keins).
    const hasUntimed = data.some((d, i) => d.untimed.length > 0 || (calendarByDay.get(days[i]) || []).some((ev) => ev.allDay));
    const allday = hasUntimed
      ? `<div class="wkb-allday"><div class="wkb-gutter wkb-gutter--allday">all&nbsp;day</div>${days.map(allCell).join("")}</div>`
      : "";
    return `
      <div class="wkb-head"><div class="wkb-gutter"></div>${head}</div>
      ${allday}
      <div class="wkb-body"><div class="wkb-gutter wkb-axis">${axisHtml()}</div>${body}</div>`;
  }

  // ── Legende: „All exams"-Pille + Fach-Pillen mit echtem Aufgaben-Zähler ──
  function renderLegend(days) {
    const legend = el("weekLegend");
    if (!legend) return;
    const set = new Set(days);
    const counts = new Map();  // key -> { name, count }
    for (const t of store.state.tasks) {
      const sub = (t.subject || "").trim();
      if (!sub || !t.plannedDate || !set.has(t.plannedDate)) continue;
      const key = sub.toLowerCase();
      const e = counts.get(key) || { name: sub, count: 0 };
      e.count += 1;
      counts.set(key, e);
    }
    let h = `<span class="week-legend__all">All</span>`;
    for (const { name, count } of counts.values()) {
      h += `<span class="week-legend__pill ${subjectColor(name).cls}"><i class="week-legend__dot"></i>${escapeHtml(name)}<span class="week-legend__count">${count}</span></span>`;
    }
    const sources = new Map();
    for (const dk of days) for (const ev of calendarByDay.get(dk) || []) {
      const id = ev.calendar?.id;
      if (id != null && !sources.has(id)) sources.set(id, ev.calendar);
    }
    for (const cal of sources.values()) {
      h += `<span class="week-legend__calendar" style="--calendar-color:${escapeHtml(cal.color || "#718096")}"><i></i>${escapeHtml(cal.name || "Calendar")}</span>`;
    }
    legend.innerHTML = h;
  }

  function renderSelection() {
    const count = selected.size;
    const label = el("weekSelection"), del = el("weekDeleteSelected"), clear = el("weekClearSelection");
    if (label) { label.hidden = !count; label.textContent = `${count} selected`; }
    if (del) del.hidden = !count;
    if (clear) clear.hidden = !count;
  }

  async function loadWeekEvents(force = false) {
    if (!weekMonday) return;
    const key = weekMonday;
    if (!force && calendarLoadKey === key) return;
    calendarLoadKey = key;
    try {
      const days = weekDays();
      const rows = await Promise.all(days.map((date) => api.calendar.day(date)));
      if (weekMonday !== key) return;
      calendarByDay = new Map(rows.map((r, i) => [days[i], r.events || []]));
      lastSig = null;
      render(true);
    } catch (e) { console.warn("[week events]", e.message); }
  }

  // ── Kopf-Texte ─────────────────────────────────
  function setLabel(days) {
    const label = el("weekLabel");
    if (!label) return;
    const d0 = new Date(keyToMs(days[0])), d6 = new Date(keyToMs(days[6]));
    const m0 = d0.toLocaleDateString("en-GB", { month: "long" });
    const m6 = d6.toLocaleDateString("en-GB", { month: "long" });
    label.textContent = m0 === m6
      ? `${d0.getDate()} – ${d6.getDate()} ${m6}`
      : `${d0.getDate()} ${m0} – ${d6.getDate()} ${m6}`;
  }
  function setSummary(days) {
    const sum = el("weekSummary");
    if (!sum) return;
    const set = new Set(days);
    const m = store.state.recentMetrics || {};
    let plannedMin = 0, doneMs = 0;
    for (const t of store.state.tasks) {
      if (t.plannedDate && set.has(t.plannedDate)) plannedMin += Number(t.estMinutes) || 0;
    }
    for (const dk of days) doneMs += m[dk]?.focusMs || 0;
    const ph = Math.floor(plannedMin / 60), pm = plannedMin % 60;
    const planned = pm ? `${ph} h ${String(pm).padStart(2, "0")}` : `${ph} h`;
    const doneH = Math.round((doneMs / 3_600_000) * 10) / 10;
    sum.innerHTML = `${planned} <span class="wk-planned__sub">· ${doneH} h done</span>`;
  }

  // ── Signatur ───────────────────────────────────
  function sig(days, todayKey) {
    const m = store.state.recentMetrics || {};
    return JSON.stringify({
      w: weekMonday, today: todayKey, add: addOpenKey,
      f: days.map((d) => m[d]?.focusMs || 0),
      t: store.state.tasks.map((t) => [t.id, t.text, t.subject, t.priority, t.plannedDate,
        t.scheduledMin, t.estMinutes, t.done, t.doneAt ? dayKeyOf(t.doneAt) : null, t.active ? 1 : 0]),
      c: [...calendarByDay].map(([d, events]) => [d, events.map((e) => [e.summary, e.startMin, e.durationMin, e.calendar?.id])]),
      s: [...selected].sort(),
    });
  }

  // ── Rendering ──────────────────────────────────
  function render(force) {
    if (!weekMonday) weekMonday = mondayOf(dayKeyOf(store.now()));
    const days = weekDays();
    const todayKey = dayKeyOf(store.now());
    const nowMin = nowMinOfDay(store.now());

    setLabel(days);
    setSummary(days);
    renderLegend(days);
    renderSelection();

    const s = sig(days, todayKey);
    if (!force && s === lastSig) return;

    const foc = captureFocus();
    grid.innerHTML = buildBoard(days, todayKey, nowMin);
    restoreFocus(foc);
    if (addOpenKey && !foc) grid.querySelector(`.wkb-add[data-add-key="${addOpenKey}"]`)?.focus();

    lastSig = s;
    lastMinFloor = Math.floor(nowMin);
    lastDayKey = todayKey;
    loadWeekEvents();
  }

  function tick() {
    const todayKey = dayKeyOf(store.now());
    if (todayKey !== lastDayKey) { render(true); return; }
    const nowMin = nowMinOfDay(store.now());
    const fl = Math.floor(nowMin);
    if (fl === lastMinFloor) return;
    lastMinFloor = fl;
    if (dragging) return;
    const line = grid.querySelector(".wkb-now");
    if (line) {
      if (nowMin < WK_START_MIN || nowMin > WK_END_MIN) render(true);
      else line.style.top = `${topPct(nowMin).toFixed(2)}%`;
    } else if (nowMin >= WK_START_MIN && nowMin <= WK_END_MIN && weekDays().includes(todayKey)) {
      render(true);
    }
  }

  store.subscribe(() => render());
  render();
  return { tick };
}
