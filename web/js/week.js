// Wochenkalender: 7 Tage nebeneinander. Pro Tag: geplante Aufgaben (planbar),
// erledigte Aufgaben des Tages + Fokuszeit ("was habe ich wann gemacht").
import {
  dayKeyOf, keyToMs, addDaysKey, mondayOf, formatHours, escapeHtml, priorityClass,
} from "/js/util.js";

export function initWeek({ store, api }) {
  const grid = document.getElementById("weekGrid");
  const label = document.getElementById("weekLabel");
  const el = (id) => document.getElementById(id);

  let weekMonday = null;   // Montag der angezeigten Woche
  let lastSig = null;

  async function act(fn) {
    try { store.applySnapshot(await fn()); }
    catch (e) { console.warn("[week]", e.message); }
  }

  // ── Navigation ─────────────────────────────────
  el("weekPrev")?.addEventListener("click", () => { weekMonday = addDaysKey(weekMonday, -7); lastSig = null; render(); });
  el("weekNext")?.addEventListener("click", () => { weekMonday = addDaysKey(weekMonday, 7); lastSig = null; render(); });
  el("weekToday")?.addEventListener("click", () => { weekMonday = mondayOf(dayKeyOf(store.now())); lastSig = null; render(); });

  // ── Interaktion (Delegation) ───────────────────
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.closest("[data-id]")?.getAttribute("data-id");
    if (btn.dataset.act === "toggle" && id) {
      const t = store.state.tasks.find((x) => String(x.id) === id);
      if (t) act(() => api.tasks.update(id, { done: !t.done }));
    } else if (btn.dataset.act === "del" && id) {
      act(() => api.tasks.remove(id));
    }
  });
  grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const inp = e.target.closest("[data-add-key]");
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;
    inp.value = "";
    act(() => api.tasks.create({ text, plannedDate: inp.getAttribute("data-add-key") }));
  });

  // ── Fokus-Erhalt für die Tages-Eingaben ─────────
  function captureFocus() {
    const a = document.activeElement;
    if (a?.dataset?.addKey && grid.contains(a)) return { key: a.dataset.addKey, value: a.value };
    return null;
  }
  function restoreFocus(c) {
    if (!c) return;
    const inp = grid.querySelector(`[data-add-key="${c.key}"]`);
    if (inp) { inp.value = c.value; inp.focus(); }
  }

  // ── Rendering ──────────────────────────────────
  function weekDays() {
    return Array.from({ length: 7 }, (_, i) => addDaysKey(weekMonday, i));
  }

  function sig(days, todayKey) {
    const m = store.state.recentMetrics || {};
    return JSON.stringify({
      w: weekMonday, today: todayKey,
      f: days.map((d) => m[d]?.focusMs || 0),
      t: store.state.tasks.map((t) => [t.id, t.text, t.priority, t.plannedDate, t.done,
        t.doneAt ? dayKeyOf(t.doneAt) : null]),
    });
  }

  function dayColumn(dayKey, todayKey) {
    const tasks = store.state.tasks;
    const metrics = store.state.recentMetrics || {};
    const planned = tasks
      .filter((t) => !t.done && t.plannedDate === dayKey)
      .sort((a, b) => (a.priority || 2) - (b.priority || 2));
    const doneToday = tasks.filter((t) => t.done && t.doneAt && dayKeyOf(t.doneAt) === dayKey);
    const focusMs = metrics[dayKey]?.focusMs || 0;

    const dow = new Date(keyToMs(dayKey)).toLocaleDateString("en-GB", { weekday: "short" });
    const dnum = new Date(keyToMs(dayKey)).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });

    const openRows = planned.map((t) => `
      <div class="wk-task" data-id="${t.id}">
        <button class="wk-check" data-act="toggle" title="Done"></button>
        <span class="wk-dot ${priorityClass(t.priority)}"></span>
        <span class="wk-text">${escapeHtml(t.text)}</span>
        <button class="wk-del" data-act="del" title="Delete">✕</button>
      </div>`).join("");

    const doneRows = doneToday.map((t) => `
      <div class="wk-task wk-task--done" data-id="${t.id}">
        <button class="wk-check is-done" data-act="toggle" title="Reopen">✓</button>
        <span class="wk-text">${escapeHtml(t.text)}</span>
        <button class="wk-del" data-act="del" title="Delete">✕</button>
      </div>`).join("");

    const meta = (doneToday.length || focusMs)
      ? `<div class="week-day__meta">${doneToday.length ? `✓ ${doneToday.length}` : ""}${focusMs ? ` · ⏱ ${formatHours(focusMs)} h` : ""}</div>`
      : `<div class="week-day__meta week-day__meta--empty">–</div>`;

    return `<div class="week-day${dayKey === todayKey ? " is-today" : ""}">
      <div class="week-day__head">
        <span class="week-day__dow">${dow}</span>
        <span class="week-day__date">${dnum}</span>
      </div>
      ${meta}
      <div class="week-day__tasks">
        ${openRows}
        ${doneRows ? `<div class="wk-divider"></div>${doneRows}` : ""}
        ${!openRows && !doneRows ? `<div class="wk-empty">–</div>` : ""}
      </div>
      <input class="wk-add" data-add-key="${dayKey}" placeholder="+ Task" maxlength="160" />
    </div>`;
  }

  function render() {
    if (!weekMonday) weekMonday = mondayOf(dayKeyOf(store.now()));
    const todayKey = dayKeyOf(store.now());
    const days = weekDays();

    if (label) {
      const a = new Date(keyToMs(days[0])).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
      const b = new Date(keyToMs(days[6])).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
      label.textContent = `${a} – ${b}`;
    }

    const s = sig(days, todayKey);
    if (s === lastSig) return;      // nichts geändert → Fokus/Scroll erhalten
    const foc = captureFocus();
    grid.innerHTML = days.map((d) => dayColumn(d, todayKey)).join("");
    restoreFocus(foc);
    lastSig = s;
  }

  store.subscribe(render);
  render();
  return { render };
}
