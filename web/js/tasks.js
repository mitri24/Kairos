// Aufgaben-Modul: Liste (offen/erledigt), Subtasks, „Als Nächstes“ und die
// Aktuelle-Aufgabe-Karte im Timer. Liest ausschließlich store.state, schreibt über api.
import {
  formatDurationHM, formatMinutes, priorityLabel, priorityClass, dueLabel,
  escapeHtml, toDatetimeLocal, fromDatetimeLocal, dayKeyOf, formatDayShort, PHASES,
  minToClock, clockToMin, DAY_START_MIN, DAY_END_MIN, SLOT_STEP_MIN,
} from "/js/util.js";

export function initTasks({ store, api }) {
  const el = (id) => document.getElementById(id);

  // ── DOM-Elemente (persistente Shell) ────────────
  const taskInput = el("taskInput"), taskAddBtn = el("taskAddBtn");
  const taskCount = el("taskCount"), taskExamName = el("taskExamName");
  const nextCard = el("nextTaskCard"), nextText = el("nextText");
  const nextChips = el("nextChips"), startNextBtn = el("startNextBtn");
  const openList = el("taskListOpen"), taskEmpty = el("taskEmpty");
  const doneWrap = el("doneWrap"), doneList = el("taskListDone"), doneCount = el("doneCount");
  const currentTaskCard = el("currentTaskCard");
  const ctKicker = el("ctKicker"), ctTitle = el("ctTitle"), ctChips = el("ctChips"), ctSub = el("ctSub");

  let nextId = null;     // id der „Als Nächstes“-Aufgabe (für den Start-Button)
  let lastSig = null;    // Signatur der zuletzt gerenderten Liste (spart Rebuilds)

  // ── Aktionen ────────────────────────────────────
  async function act(fn) {
    try { store.applySnapshot(await fn()); }
    catch (e) { console.warn("[tasks]", e.message); }
  }
  // data-id ist ein String, t.id eine Zahl → immer über String vergleichen.
  const taskById = (id) => store.state.tasks.find((t) => String(t.id) === String(id));

  function addTask() {
    const text = taskInput.value.trim();
    if (!text) return;
    taskInput.value = "";
    // In der Heute-Ansicht hinzugefügte Aufgaben werden auf HEUTE geplant.
    const data = { text, plannedDate: dayKeyOf(store.now()) };
    const exam = store.state.settings.activeExamId;
    if (exam) data.examId = exam;
    act(() => api.tasks.create(data));
  }

  async function addSub(taskId, inputEl) {
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";                 // vor dem Rebuild leeren (Fokus bleibt erhalten)
    await act(() => api.tasks.addSubtask(taskId, text));
  }

  async function startNext() {
    if (!nextId) return;
    await act(() => api.timer.activeTask(nextId));
    await act(() => api.timer.start());
  }

  // ── Handler (einmalig, Event-Delegation) ────────
  taskAddBtn.addEventListener("click", addTask);
  taskInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } });
  startNextBtn.addEventListener("click", startNext);

  openList.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const row = t.closest("[data-id]"); if (!row) return;
    const id = row.getAttribute("data-id");
    switch (t.getAttribute("data-act")) {
      case "expand": {
        const cur = store.state.ui.expandedTaskId;
        store.setUi({ expandedTaskId: cur === id ? null : id });
        break;
      }
      case "cycle-prio": {
        const p = taskById(id)?.priority || 2;
        act(() => api.tasks.update(id, { priority: p >= 4 ? 1 : p + 1 }));
        break;
      }
      case "set-prio":
        act(() => api.tasks.update(id, { priority: Number(t.getAttribute("data-prio")) }));
        break;
      case "del-sub": {
        const sid = t.closest("[data-sid]")?.getAttribute("data-sid");
        if (sid) act(() => api.subtasks.remove(sid));
        break;
      }
      case "add-sub":
        addSub(id, row.querySelector('[data-act-input="new-sub"]'));
        break;
      case "activate":
        act(() => api.timer.activeTask(id));
        break;
      case "del-task":
        act(() => api.tasks.remove(id));
        break;
    }
  });

  openList.addEventListener("change", (e) => {
    const elm = e.target, row = elm.closest("[data-id]"); if (!row) return;
    const id = row.getAttribute("data-id");
    if (elm.matches('[data-act="toggle-done"]')) return act(() => api.tasks.update(id, { done: elm.checked }));
    if (elm.matches('[data-act="toggle-sub"]')) {
      const sid = elm.closest("[data-sid]")?.getAttribute("data-sid");
      return sid && act(() => api.subtasks.update(sid, { done: elm.checked }));
    }
    if (elm.dataset.field === "estMinutes") {
      const v = elm.value === "" ? 0 : Math.max(0, Math.round(Number(elm.value) || 0));
      return act(() => api.tasks.update(id, { estMinutes: v }));
    }
    if (elm.dataset.field === "dueDate") return act(() => api.tasks.update(id, { dueDate: fromDatetimeLocal(elm.value) }));
    if (elm.dataset.field === "plannedDate") return act(() => api.tasks.update(id, { plannedDate: elm.value || null }));
    if (elm.dataset.field === "subject") return act(() => api.tasks.update(id, { subject: elm.value.trim() }));
    if (elm.dataset.field === "scheduledMin") {
      // Uhrzeit setzen → auf den Tages-Zeitstrahl (aufs Tagesfenster begrenzt); leeren → herunternehmen.
      const raw = clockToMin(elm.value);
      const min = raw == null ? null : Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - SLOT_STEP_MIN, raw));
      return act(() => api.tasks.update(id, { scheduledMin: min }));
    }
  });

  // Aufgabe per Griff auf den Zeitstrahl ziehen (dayTimeline.js liest die id).
  openList.addEventListener("dragstart", (e) => {
    const grip = e.target.closest(".task__grip");
    const row = grip && e.target.closest("[data-id]");
    if (!row) return;
    e.dataTransfer.setData("text/plain", row.getAttribute("data-id"));
    e.dataTransfer.effectAllowed = "move";
  });

  openList.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const elm = e.target;
    if (elm.matches('[data-act-input="new-sub"]')) {
      e.preventDefault();
      const row = elm.closest("[data-id]");
      if (row) addSub(row.getAttribute("data-id"), elm);
    }
  });

  doneList.addEventListener("change", (e) => {
    const row = e.target.closest("[data-id]");
    if (row && e.target.matches('[data-act="toggle-done"]')) act(() => api.tasks.update(row.getAttribute("data-id"), { done: e.target.checked }));
  });
  doneList.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const row = t.closest("[data-id]");
    if (row && t.getAttribute("data-act") === "del-task") act(() => api.tasks.remove(row.getAttribute("data-id")));
  });

  // ── Sortierung & Filter ─────────────────────────
  function cmp(a, b) {
    const pa = a.priority || 2, pb = b.priority || 2;
    if (pa !== pb) return pa - pb;
    const da = a.dueDate || Infinity, db = b.dueDate || Infinity;
    if (da !== db) return da - db;
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  }
  const doneCmp = (a, b) => (b.doneAt || 0) - (a.doneAt || 0);

  // ── Chip-Bausteine ──────────────────────────────
  function readonlyChips(t, includeSub) {
    const now = store.now();
    let h = `<span class="chip ${priorityClass(t.priority)}">${escapeHtml(priorityLabel(t.priority))}</span>`;
    const dl = dueLabel(t.dueDate, now);
    if (dl) h += `<span class="chip ${dl.soon ? "chip--due-soon" : "chip--due"}">${escapeHtml(dl.text)}</span>`;
    if (t.subject) h += `<span class="chip chip--subject">${escapeHtml(t.subject)}</span>`;
    const subs = t.subtasks || [];
    if (includeSub && subs.length) h += `<span class="chip chip--sub">☑ ${subs.filter((x) => x.done).length}/${subs.length}</span>`;
    return h;
  }

  function rowChips(t) {
    const now = store.now();
    const today = dayKeyOf(now);
    let h = `<button type="button" class="chip ${priorityClass(t.priority)}" data-act="cycle-prio" title="Change priority">${escapeHtml(priorityLabel(t.priority))}</button>`;
    // Überfällig/anders geplant sichtbar machen
    if (t.plannedDate && t.plannedDate < today) h += `<span class="chip chip--due-soon">⚠ ${escapeHtml(formatDayShort(t.plannedDate))}</span>`;
    else if (t.plannedDate && t.plannedDate > today) h += `<span class="chip chip--planned">📅 ${escapeHtml(formatDayShort(t.plannedDate))}</span>`;
    if (t.scheduledMin != null) h += `<span class="chip chip--sched" title="Scheduled time">🕒 ${minToClock(t.scheduledMin)}</span>`;
    const dl = dueLabel(t.dueDate, now);
    if (dl) h += `<span class="chip ${dl.soon ? "chip--due-soon" : "chip--due"}">${escapeHtml(dl.text)}</span>`;
    if (t.subject) h += `<span class="chip chip--subject">${escapeHtml(t.subject)}</span>`;
    const subs = t.subtasks || [];
    if (subs.length) h += `<span class="chip chip--sub">☑ ${subs.filter((x) => x.done).length}/${subs.length}</span>`;
    if (t.estMinutes) h += `<span class="chip chip--est">${escapeHtml(formatMinutes(t.estMinutes))}</span>`;
    if (t.spentMs) h += `<span class="chip chip--spent">⏱ ${formatDurationHM(t.spentMs)}</span>`;
    if (t.active) h += `<span class="chip chip--active">● Active</span>`;
    return h;
  }

  // ── Zeilen-/Detail-Templates ────────────────────
  function buildDetail(t) {
    const subs = (t.subtasks || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const subRows = subs.map((st) => `
      <div class="subtask" data-sid="${escapeHtml(st.id)}">
        <input type="checkbox" data-act="toggle-sub"${st.done ? " checked" : ""} aria-label="Subtask done" />
        <span class="subtask__text${st.done ? " is-done" : ""}">${escapeHtml(st.text)}</span>
        <button type="button" class="icon-btn" data-act="del-sub" title="Delete subtask">✕</button>
      </div>`).join("");
    const prioOpts = [1, 2, 3, 4].map((p) =>
      `<button type="button" class="prio-opt ${priorityClass(p)}${t.priority === p ? " is-active" : ""}" data-act="set-prio" data-prio="${p}">${escapeHtml(priorityLabel(p))}</button>`).join("");
    return `<div class="task__detail">
      <div class="subtasks">${subRows || `<div class="subtasks__empty">No subtasks yet</div>`}</div>
      <div class="subtask-add">
        <input type="text" class="text-input" data-act-input="new-sub" data-guard="newsub-${escapeHtml(t.id)}" placeholder="Add a subtask…" maxlength="160" />
        <button type="button" class="add-btn" data-act="add-sub" title="Add subtask">+</button>
      </div>
      <div class="detail-grid">
        <div class="detail-field detail-field--wide">
          <span class="detail-label">Priority</span>
          <div class="prio-opts">${prioOpts}</div>
        </div>
        <label class="detail-field">
          <span class="detail-label">Estimate (min)</span>
          <input type="number" data-field="estMinutes" data-guard="est-${escapeHtml(t.id)}" min="0" step="5" value="${t.estMinutes || 0}" />
        </label>
        <label class="detail-field">
          <span class="detail-label">Time</span>
          <input type="time" data-field="scheduledMin" data-guard="sched-${escapeHtml(t.id)}" value="${t.scheduledMin != null ? minToClock(t.scheduledMin) : ""}" />
        </label>
        <label class="detail-field">
          <span class="detail-label">Planned date</span>
          <input type="date" data-field="plannedDate" data-guard="plan-${escapeHtml(t.id)}" value="${escapeHtml(t.plannedDate || "")}" />
        </label>
        <label class="detail-field">
          <span class="detail-label">Due</span>
          <input type="datetime-local" data-field="dueDate" data-guard="due-${escapeHtml(t.id)}" value="${toDatetimeLocal(t.dueDate)}" />
        </label>
        <label class="detail-field detail-field--wide">
          <span class="detail-label">Subject</span>
          <input type="text" class="text-input" data-field="subject" data-guard="subj-${escapeHtml(t.id)}" value="${escapeHtml(t.subject || "")}" maxlength="60" placeholder="e.g. Anatomy" />
        </label>
      </div>
      <div class="detail-actions">
        <button type="button" class="btn btn--soft" data-act="activate">▶ Activate in timer</button>
        <button type="button" class="btn btn--ghost btn--danger" data-act="del-task">🗑 Delete</button>
      </div>
    </div>`;
  }

  function buildOpen(open, expandedId) {
    return open.map((t) => {
      const isExp = String(t.id) === String(expandedId);
      return `<div class="task${t.active ? " is-active" : ""}${isExp ? " is-expanded" : ""}" data-id="${escapeHtml(t.id)}">
        <div class="task__head">
          <span class="task__grip" draggable="true" title="Drag onto the timeline" aria-label="Drag onto the timeline">⠿</span>
          <input type="checkbox" class="task__check" data-act="toggle-done"${t.done ? " checked" : ""} aria-label="Task done" />
          <button type="button" class="task__text" data-act="expand">${escapeHtml(t.text)}</button>
        </div>
        <div class="task__chips">${rowChips(t)}</div>
        ${isExp ? buildDetail(t) : ""}
      </div>`;
    }).join("");
  }

  function buildDone(done) {
    return done.map((t) => `<div class="task task--done" data-id="${escapeHtml(t.id)}">
      <div class="task__head">
        <input type="checkbox" class="task__check" data-act="toggle-done" checked aria-label="Task done" />
        <span class="task__text task__text--done">${escapeHtml(t.text)}</span>
        ${t.spentMs ? `<span class="chip chip--spent">⏱ ${formatDurationHM(t.spentMs)}</span>` : ""}
        <button type="button" class="icon-btn" data-act="del-task" title="Delete">✕</button>
      </div>
    </div>`).join("");
  }

  // ── Aktuelle-Aufgabe-Karte im Timer ─────────────
  function renderCurrent(task, s) {
    const isBreak = s.timer.phase !== PHASES.FOCUS;
    if (!task) {
      currentTaskCard.classList.add("is-empty");
      currentTaskCard.classList.remove("is-break");
      ctKicker.textContent = "FOCUS NOW";
      ctTitle.textContent = "No task selected";
      ctChips.innerHTML = "";
      ctSub.textContent = "";
      return;
    }
    currentTaskCard.classList.remove("is-empty");
    currentTaskCard.classList.toggle("is-break", isBreak);
    ctKicker.textContent = "FOCUS NOW";
    ctTitle.textContent = task.text;
    ctChips.innerHTML = readonlyChips(task, true);
    const subs = task.subtasks || [];
    let sub = `Focus time: ${formatDurationHM(task.spentMs || 0)}`;
    if (subs.length) sub += ` · Subtasks ${subs.filter((x) => x.done).length}/${subs.length}`;
    ctSub.textContent = sub;
  }

  // ── Fokus-Erhalt über Rebuilds (kein fokussierter Input überschreiben) ──
  function captureFocus() {
    const a = document.activeElement;
    if (!a || !a.dataset || !a.dataset.guard || !openList.contains(a)) return null;
    const c = { key: a.dataset.guard, value: a.value };
    try { c.s = a.selectionStart; c.e = a.selectionEnd; } catch { /* number/datetime: keine Selektion */ }
    return c;
  }
  function restoreFocus(c) {
    if (!c) return;
    const elm = openList.querySelector(`[data-guard="${c.key}"]`);
    if (!elm) return;
    elm.value = c.value;
    elm.focus();
    try { if (c.s != null) elm.setSelectionRange(c.s, c.e); } catch { /* ignore */ }
  }

  function listSig(s) {
    return JSON.stringify({
      d: dayKeyOf(store.now()),
      x: s.ui.expandedTaskId,
      t: s.tasks.map((t) => [t.id, t.text, t.subject, t.priority, t.dueDate, t.plannedDate,
        t.scheduledMin, t.estMinutes, t.done, t.doneAt, t.spentMs, t.active, t.sortOrder,
        (t.subtasks || []).map((st) => [st.id, st.text, st.done, st.sortOrder])]),
    });
  }

  // ── Render ──────────────────────────────────────
  function render() {
    const s = store.state;
    const today = dayKeyOf(store.now());
    // Heute-Liste: für heute geplant, überfällig (offen & Datum in der Vergangenheit)
    // oder ohne Datum. Zukünftig geplante erscheinen nur im Wochenkalender.
    const open = s.tasks.filter((t) => !t.done && (!t.plannedDate || t.plannedDate <= today)).sort(cmp);
    // Erledigt-Sektion zeigt die HEUTE erledigten Aufgaben.
    const done = s.tasks.filter((t) => t.done && t.doneAt && dayKeyOf(t.doneAt) === today).sort(doneCmp);

    // Persistente, fokus-sichere Anzeigen (jeder Render)
    taskCount.textContent = String(open.length);
    doneCount.textContent = String(done.length);
    doneWrap.hidden = done.length === 0;
    taskEmpty.hidden = open.length > 0;

    const next = open[0] || null;
    nextId = next ? next.id : null;
    if (next) {
      nextCard.hidden = false;
      nextText.textContent = next.text;
      nextChips.innerHTML = readonlyChips(next, false);
    } else {
      nextCard.hidden = true;
      nextText.textContent = "–";
      nextChips.innerHTML = "";
    }

    renderCurrent(s.tasks.find((t) => t.active) || null, s);

    // Listen nur bei echter Änderung neu aufbauen (Scroll & Fokus erhalten)
    const sig = listSig(s);
    if (sig !== lastSig) {
      const foc = captureFocus();
      const so = openList.scrollTop, sd = doneList.scrollTop;
      openList.innerHTML = buildOpen(open, s.ui.expandedTaskId);
      doneList.innerHTML = buildDone(done);
      openList.scrollTop = so;
      doneList.scrollTop = sd;
      restoreFocus(foc);
      lastSig = sig;
    }
  }

  store.subscribe(render);
  render();
  return {};
}
