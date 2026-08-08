// Aufgaben-Modul (Today): „Right now"-Hero, Unscheduled-Liste, aktuelle Aufgabe im
// Timer und der zentrierte Task-Detail-Editor (Modal). Liest store.state, schreibt via api.
import {
  formatMinutes, dueLabel, slotStatus, nowMinOfDay,
  escapeHtml, toDatetimeLocal, fromDatetimeLocal, dayKeyOf, keyToMs, PHASES,
  minToClock, clockToMin, subjectColor, safeUrl, prettyUrl, resourceIcon,
  DAY_START_MIN, DAY_END_MIN, SLOT_STEP_MIN,
} from "/js/util.js";
import { showToast } from "/js/toast.js";
import { confirmDialog } from "/js/dialog.js";
import { createFocusTrap } from "/js/focusTrap.js";
import { planFactor, planMinutes } from "/shared/pace.js";
import { t as tr } from "/js/i18n.js";
import { icon } from "/js/icons.js";

// Kompakte Prioritäts-Labels fürs Modal (Design: High / Med / Low).
const PRIO_SHORT = { 1: "High", 2: "Med", 3: "Low" };
const priorityShort = (p) => PRIO_SHORT[Math.min(3, Math.max(1, p || 2))] || "Med";
const priorityClass3 = (p) => `chip--prio${Math.min(3, Math.max(1, p || 2))}`;

export function initTasks({ store, api }) {
  const el = (id) => document.getElementById(id);

  // ── DOM (persistente Shell) ──────────────────────
  const taskInput = el("taskInput"), taskAddBtn = el("taskAddBtn");
  // „Was jetzt"-Held + ehrlicher Erstzustand
  const heroCard = el("nextTaskCard"), heroText = el("nextText"), heroPill = el("nextPill");
  const heroKicker = el("nextKicker"), heroRes = el("nextResource"), startNextBtn = el("startNextBtn");
  const heroEmpty = el("nextEmptyCard");
  // Offene Arbeit
  const unsList = el("unscheduledList"), unsMeta = el("unscheduledMeta"), unsEmpty = el("unscheduledEmpty");
  // Aktuelle Aufgabe (Sidebar-Timer)
  const currentTaskCard = el("currentTaskCard");
  const ctTitle = el("ctTitle"), ctChips = el("ctChips"), ctSub = el("ctSub");

  let nextId = null;
  let unsSig = null;

  // ── Aktionen ─────────────────────────────────────
  // Liefert true bei Erfolg (api.js toastet Fehler bereits) — Aufrufer leeren
  // Eingaben erst NACH Erfolg, damit nichts verloren geht.
  async function act(fn) {
    try { store.applySnapshot(await fn()); return true; }
    catch (e) { console.warn("[tasks]", e.message); return false; }
  }
  const taskById = (id) => store.state.tasks.find((t) => String(t.id) === String(id));
  // Offene (unerledigte) Abhängigkeiten einer Aufgabe → sie „wartet" noch.
  function openDeps(t) {
    return (t.dependsOn || [])
      .map((id) => taskById(id))
      .filter((d) => d && !d.done);
  }

  async function addTask() {
    const text = taskInput.value.trim();
    if (!text) {
      const row = taskInput.closest(".quick-compose, .task-input-row");
      row?.classList.add("is-error");
      taskInput.addEventListener("input", () => row?.classList.remove("is-error"), { once: true });
      taskInput.focus();
      return;
    }
    const data = { text, plannedDate: dayKeyOf(store.now()) };
    const exam = store.state.settings.activeExamId;
    if (exam) data.examId = exam;
    const ok = await act(() => api.tasks.create(data));
    if (ok) taskInput.value = "";   // erst nach Erfolg leeren
  }

  async function startNext() {
    if (!nextId) return;
    await act(() => api.timer.activeTask(nextId));
    await act(() => api.timer.start());
    // Design: „Start focus" führt in den Vollbild-Fokusmodus (Study Session).
    document.dispatchEvent(new CustomEvent("open-focus-session"));
  }

  // ── Aktionen ─────────────────────────────────────
  taskAddBtn?.addEventListener("click", addTask);
  taskInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } });
  startNextBtn?.addEventListener("click", startNext);
  // Kein „New task"- und kein Lupen-Knopf mehr im Kopf: beide fokussierten nur
  // dieses Feld, die Lupe versprach dabei fälschlich eine Suche. Diktieren macht
  // ausschließlich das Mikro der Eingabezeile (#voiceBtn → voice.js, mit Parser).

  // ── Offene Arbeit (Aufgaben ohne Uhrzeit) ────────
  function subjectPill(subject) {
    if (!subject) return "";
    const sc = subjectColor(subject);
    return `<span class="task__subj ${sc.cls}">${escapeHtml(subject)}</span>`;
  }

  // Wie lange schleppt der Nutzer die Aufgabe schon mit? plannedDate aus einem
  // früheren Tag hieß bisher: sieht aus wie frisch angelegt.
  function agedDays(t, todayKey, nowMs) {
    if (!t.plannedDate || t.plannedDate >= todayKey) return 0;
    const ms = keyToMs(t.plannedDate);
    return ms == null ? 0 : Math.max(0, Math.round((keyToMs(todayKey) - ms) / 86_400_000));
  }

  function buildRow(t, todayKey, nowMs) {
    const dur = t.estMinutes ? formatMinutes(t.estMinutes) : "";
    const waiting = openDeps(t);
    const blockedChip = waiting.length
      ? `<span class="uns-item__blocked" title="${escapeHtml(tr("task.blocked", { text: waiting.map((d) => d.text).join(", ") }))}">${icon("link", { size: 12 })}${escapeHtml(tr("task.blocked_short"))}</span>`
      : "";
    // dueLabel() gab es schon in util.js — es wurde nur nie aufgerufen.
    const due = dueLabel(t.dueDate, nowMs);
    const dueChip = due ? `<span class="uns-item__due${due.soon ? " is-soon" : ""}">${escapeHtml(due.text)}</span>` : "";
    const prio = Math.min(3, Math.max(1, t.priority || 2));
    const meta = [subjectPill(t.subject), dur ? `<span class="uns-item__dur">${dur}</span>` : "", dueChip, blockedChip]
      .filter(Boolean).join("");
    return `<div class="uns-item${t.active ? " is-active" : ""}" data-id="${escapeHtml(String(t.id))}" draggable="true">
      <span class="uns-item__prio uns-item__prio--${prio}" aria-hidden="true"></span>
      <span class="uns-item__grip" aria-hidden="true">${icon("grip", { size: 16 })}</span>
      <input type="checkbox" class="uns-item__check" data-act="toggle-done" aria-label="Mark done" />
      <button type="button" class="uns-item__body" data-act="open">
        <span class="uns-item__name">${escapeHtml(t.text)}</span>
        <span class="uns-item__meta">${meta}</span>
      </button>
    </div>`;
  }

  // Eine ruhige Inbox ohne Rückstandsgruppen oder belastende Summen. Reihenfolge
  // bleibt Priorität/Deadline (cmp), aber die Oberfläche bewertet sie nicht.
  function buildUnscheduled(list, todayKey, nowMs) {
    return list.map((t) => buildRow(t, todayKey, nowMs)).join("");
  }

  unsList?.addEventListener("click", (e) => {
    const openBtn = e.target.closest('[data-act="open"]');
    const row = e.target.closest("[data-id]"); if (!row) return;
    if (openBtn) store.setUi({ expandedTaskId: row.getAttribute("data-id") });
  });
  unsList?.addEventListener("change", async (e) => {
    const row = e.target.closest("[data-id]"); if (!row) return;
    if (!e.target.matches('[data-act="toggle-done"]')) return;
    const id = row.getAttribute("data-id");
    const done = e.target.checked;
    const ok = await act(() => api.tasks.update(id, { done }));
    // Abhaken lässt die Aufgabe verschwinden → scham-freies Undo anbieten.
    if (ok && done) {
      const t = taskById(id);
      showToast({
        type: "success", title: "Nice — one done", body: t ? t.text : "", timeout: 6000,
        action: { label: "Undo", onClick: () => act(() => api.tasks.update(id, { done: false })) },
      });
    }
  });
  unsList?.addEventListener("dragstart", (e) => {
    const row = e.target.closest("[data-id]"); if (!row) return;
    e.dataTransfer.setData("text/plain", row.getAttribute("data-id"));
    e.dataTransfer.effectAllowed = "move";
    row.classList.add("is-dragging");
  });
  unsList?.addEventListener("dragend", (e) => e.target.closest?.(".uns-item")?.classList.remove("is-dragging"));

  // ── „Was jetzt?" — EINE Wahrheitskette ───────────
  // Vorher gaben drei Elemente gleichzeitig drei verschiedene Antworten: der Held
  // nach Priorität, der Zeitstrahl nach Uhrzeit (is-now) und die Timer-Pille nach
  // t.active. Feste Rangfolge beendet den Widerspruch, und der Kicker macht die
  // Herkunft sichtbar — ein Vorschlag darf nicht wie eine Verpflichtung aussehen.
  function pickNow(open, s) {
    // 1) läuft gerade im Timer
    const active = s.tasks.find((t) => t.active && !t.done);
    if (active) return { task: active, kicker: "In focus", suggested: false };
    // 2) laut Plan ist jetzt dieser Block dran (dieselbe Quelle wie der Zeitstrahl)
    const nowMin = nowMinOfDay(store.now());
    const running = open
      .filter((t) => t.scheduledMin != null)
      .find((t) => slotStatus({ startMin: t.scheduledMin, durationMin: Math.max(SLOT_STEP_MIN, Math.round(Number(t.estMinutes) || 25)) }, nowMin) === "now");
    if (running) {
      const end = running.scheduledMin + Math.max(SLOT_STEP_MIN, Math.round(Number(running.estMinutes) || 25));
      return { task: running, kicker: `Right now · ${minToClock(running.scheduledMin)}–${minToClock(end)}`, suggested: false };
    }
    // 3) sonst ein Vorschlag aus der Prioritätsliste (Wartende überspringen)
    const next = open.find((t) => openDeps(t).length === 0) || open[0] || null;
    return next ? { task: next, kicker: "Suggested next", suggested: true } : null;
  }

  function primaryResource(taskId) {
    return (store.state.resources || [])
      .filter((r) => String(r.taskId) === String(taskId))
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || (a.sortOrder || 0) - (b.sortOrder || 0))[0] || null;
  }

  function renderHero(pick) {
    if (!heroCard) return;
    const next = pick ? pick.task : null;
    nextId = next ? next.id : null;
    if (!next) {
      heroCard.hidden = true;
      if (heroEmpty) heroEmpty.hidden = !store.state.loaded;   // vor dem Snapshot nichts behaupten
      return;
    }
    if (heroEmpty) heroEmpty.hidden = true;
    heroCard.hidden = false;
    heroCard.classList.toggle("is-suggested", !!pick.suggested);
    if (heroKicker) heroKicker.textContent = pick.kicker;
    heroText.textContent = next.text;
    // Fach · Dauer-Pille (nur wenn vorhanden — sonst ehrlich weglassen)
    const bits = [];
    if (next.subject) bits.push(next.subject);
    if (next.estMinutes) bits.push(formatMinutes(next.estMinutes));
    if (heroPill) {
      if (bits.length) { heroPill.hidden = false; heroPill.textContent = bits.join(" · "); }
      else heroPill.hidden = true;
    }
    // Lern-Link (Hand-off) — nur wenn verlinkt
    const res = primaryResource(next.id);
    if (heroRes) {
      if (res) {
        const href = safeUrl(res.url);
        heroRes.hidden = false;
        heroRes.innerHTML = `<span class="next-task__res-ic">${resourceIcon(res)}</span><span class="next-task__res-name">${escapeHtml(res.title || prettyUrl(res.url))}</span><span class="next-task__res-open">open ${icon("external", { size: 13 })}</span>`;
        if (href) { heroRes.setAttribute("href", href); heroRes.style.pointerEvents = ""; }
        else { heroRes.removeAttribute("href"); heroRes.style.pointerEvents = "none"; }
      } else { heroRes.hidden = true; }
    }
    // Readiness steht bewusst NUR noch in der Tageslast-Karte (today.js):
    // vorher meldeten zwei benachbarte Karten aus derselben Quelle dasselbe —
    // im Regelfall zweimal, dass gar keine Readiness-Daten vorliegen.
  }

  // ── Aktuelle-Aufgabe-Karte (Sidebar-Timer) ───────
  function renderCurrent(task, s) {
    if (!currentTaskCard) return;
    const isBreak = s.timer.phase !== PHASES.FOCUS;
    if (ctChips) ctChips.innerHTML = "";
    if (ctSub) ctSub.textContent = "";
    if (!task) {
      currentTaskCard.classList.add("is-empty");
      currentTaskCard.classList.remove("is-break");
      if (ctTitle) ctTitle.textContent = "No task selected";
      return;
    }
    currentTaskCard.classList.remove("is-empty");
    currentTaskCard.classList.toggle("is-break", isBreak);
    if (ctTitle) ctTitle.textContent = task.text;
  }

  // ── Sortierung ───────────────────────────────────
  function cmp(a, b) {
    const pa = a.priority || 2, pb = b.priority || 2;
    if (pa !== pb) return pa - pb;
    const da = a.dueDate || Infinity, db = b.dueDate || Infinity;
    if (da !== db) return da - db;
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  }

  // ══ Task-Detail-Modal ════════════════════════════
  const modal = buildTaskModal();
  document.body.appendChild(modal.overlay);
  const modalTrap = createFocusTrap(modal.overlay.querySelector(".task-modal__card"), { initialFocus: false });
  let modalId = null;   // aktuell im Modal bearbeitete Task-id
  let modalSig = null;  // Signatur des Modal-Inhalts → nur bei echter Änderung neu bauen

  // Nur die für das Modal relevanten Felder → verhindert Rebuilds bei unbezogenen Reconciles.
  function modalBodySig(t) {
    return JSON.stringify([
      t.text, t.subject, t.priority, t.estMinutes, t.scheduledMin, t.plannedDate, t.dueDate, t.examId,
      t.difficulty, t.topicId, t.room, t.location, t.mapsUrl, t.dependsOn || [],
      (t.subtasks || []).map((s) => [s.id, s.text, s.done, s.sortOrder]),
      (store.state.resources || []).filter((r) => String(r.taskId) === String(t.id)).map((r) => [r.id, r.title, r.url, r.isPrimary]),
    ]);
  }

  // Ressourcen des verknüpften Themas (Hand-off ohne Duplizieren: Task→Topic→Links).
  function topicResRow(t) {
    if (t.topicId == null) return "";
    const items = (store.state.resources || []).filter((r) => r.topicId === t.topicId);
    if (!items.length) return "";
    const links = items.slice(0, 3).map((r) => {
      const href = safeUrl(r.url);
      return href ? `<a class="task-topicres__link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${resourceIcon(r)}<span>${escapeHtml(r.title || prettyUrl(r.url))}</span></a>` : "";
    }).join("");
    return links ? `<div class="task-topicres">${links}</div>` : "";
  }

  // Abhängigkeiten-Sektion: Chips (mit Entfernen-Button) + „Grundlage hinzufügen"-Auswahl.
  function depsSection(t) {
    const deps = (t.dependsOn || []).map((id) => taskById(id)).filter(Boolean);
    const chips = deps.map((d) => `
      <span class="dep-chip${d.done ? " is-done" : ""}" data-dep-id="${escapeHtml(String(d.id))}">
        ${d.done ? icon("check", { size: 12 }) : ""}${escapeHtml(d.text)}
        <button type="button" class="dep-chip__x" data-act="dep-del" title="${escapeHtml(tr("common.delete"))}" aria-label="${escapeHtml(tr("common.delete"))}">${icon("close", { size: 12 })}</button>
      </span>`).join("");
    const taken = new Set(t.dependsOn || []);
    const candidates = store.state.tasks.filter((x) =>
      !x.done && String(x.id) !== String(t.id) && !taken.has(x.id)
      && !(x.dependsOn || []).includes(t.id));   // offensichtliche Zyklen gar nicht anbieten
    const opts = candidates.map((x) => `<option value="${escapeHtml(String(x.id))}">${escapeHtml(x.text)}</option>`).join("");
    return `<div class="task-deps">
      <div class="task-deps__head">${escapeHtml(tr("task.deps"))}</div>
      ${chips ? `<div class="task-deps__chips">${chips}</div>` : ""}
      ${opts ? `<select class="text-input task-deps__add" data-mfield="dep-add"><option value="">${escapeHtml(tr("task.deps_add"))}</option>${opts}</select>` : ""}
    </div>`;
  }

  function taskResSection(t) {
    const items = (store.state.resources || [])
      .filter((r) => String(r.taskId) === String(t.id))
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || (a.sortOrder || 0) - (b.sortOrder || 0));
    const rows = items.map((r) => {
      const href = safeUrl(r.url);
      const name = escapeHtml(r.title || prettyUrl(r.url));
      // Größen der vier Zeilen-Icons kommen ausschließlich aus .task-res__item svg
      // (tasks.css) — hier bewusst KEIN size-Argument, sonst gibt es zwei Quellen.
      const inner = `<span class="task-res__icon">${resourceIcon(r)}</span><span class="task-res__name">${name}</span>${href ? `<span class="task-res__open">open ${icon("external")}</span>` : ""}`;
      const open = href ? `<a class="task-res__link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` : `<span class="task-res__link">`;
      const close = href ? "</a>" : "</span>";
      const star = `<button type="button" class="task-res__star${r.isPrimary ? " is-primary" : ""}" data-act="task-res-primary" title="${r.isPrimary ? "Primary link — opens on Right now" : "Make primary link"}" aria-label="${r.isPrimary ? "Primary link" : "Make primary link"}" aria-pressed="${r.isPrimary ? "true" : "false"}">${icon("star")}</button>`;
      return `<div class="task-res__item${r.isPrimary ? " is-primary" : ""}" data-res-id="${escapeHtml(String(r.id))}">${open}${inner}${close}${star}<button type="button" class="task-res__del" data-act="task-res-del" title="Remove link" aria-label="Remove link">${icon("close")}</button></div>`;
    }).join("");
    const n = items.length;
    return `<div class="task-res">
      <div class="task-res__head"><span>Learn this</span><span class="task-res__count">${n ? `${n} link${n === 1 ? "" : "s"}` : "the page you study on"}</span></div>
      ${rows ? `<div class="task-res__list">${rows}</div>` : ""}
      <div class="task-res__add">
        <input type="text" class="text-input" data-mfield="res-url" placeholder="Paste a link to study on…" maxlength="600" />
        <button type="button" class="add-btn" data-act="task-res-add" title="Add link" aria-label="Add link">${icon("plus", { size: 16, stroke: 2 })}</button>
      </div>
    </div>`;
  }

  function examChipRow(t) {
    const ex = store.state.exams.find((e) => String(e.id) === String(t.examId));
    if (ex) {
      return `<div class="task-modal__exam"><span class="chip chip--exam"><i class="chip__dot"></i>${escapeHtml(ex.name || "Exam")}</span><button type="button" class="chip chip--exam-change" data-act="change-exam" title="Linking exams coming soon" disabled>change exam ${icon("chevronDown", { size: 12 })}</button></div>`;
    }
    return `<div class="task-modal__exam"><span class="chip chip--exam-none">No exam linked</span><button type="button" class="chip chip--exam-change" data-act="change-exam" title="Linking exams coming soon" disabled>link exam ${icon("chevronDown", { size: 12 })}</button></div>`;
  }

  function renderModalBody(t) {
    const subs = (t.subtasks || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const done = subs.filter((s) => s.done).length;
    const subRows = subs.map((st) => `
      <div class="subtask" data-sid="${escapeHtml(st.id)}">
        <input type="checkbox" data-act="toggle-sub"${st.done ? " checked" : ""} aria-label="Subtask done" />
        <span class="subtask__text${st.done ? " is-done" : ""}">${escapeHtml(st.text)}</span>
        <button type="button" class="icon-btn icon-btn--bare" data-act="del-sub" title="Delete subtask" aria-label="Delete subtask">${icon("close", { size: 16 })}</button>
      </div>`).join("");
    const prioOpts = [1, 2, 3].map((p) =>
      `<button type="button" class="prio-opt ${priorityClass3(p)}${(t.priority || 2) === p ? " is-active" : ""}" data-act="set-prio" data-prio="${p}">${priorityShort(p)}</button>`).join("");
    const diffOpts = [1, 2, 3].map((d) =>
      `<button type="button" class="seg__btn${(t.difficulty || 2) === d ? " is-active" : ""}" data-act="set-diff" data-diff="${d}">${escapeHtml(tr(`task.diff${d}`))}</button>`).join("");
    // Pace-Hinweis: weicht dein reales Tempo spürbar ab, zeigt der Plan die ehrliche Dauer.
    const pf = planFactor(store.state.pace, t.difficulty || 2);
    const planHint = (t.estMinutes > 0 && Math.abs(pf - 1) >= 0.15)
      ? `<div class="detail-hint">${escapeHtml(tr("task.plan_hint", { min: planMinutes(store.state.pace, t.difficulty || 2, t.estMinutes), f: pf }))}</div>`
      : "";
    const topicOpts = (store.state.topics || []).map((tp) => {
      const ex = store.state.exams.find((e) => e.id === tp.examId);
      const label = ex ? `${tp.text} · ${ex.name}` : tp.text;
      return `<option value="${escapeHtml(String(tp.id))}"${t.topicId === tp.id ? " selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
    modal.body.innerHTML = `
      <input type="text" class="task-modal__name" data-mfield="text" value="${escapeHtml(t.text)}" placeholder="Task name…" maxlength="160" />
      ${examChipRow(t)}
      <div class="subtasks-block">
        <div class="subtasks__head"><span>Subtasks</span><span class="subtasks__count">${done} / ${subs.length} done</span></div>
        <div class="subtasks">${subRows || `<div class="subtasks__empty">No subtasks yet</div>`}</div>
        <div class="subtask-add">
          <input type="text" class="text-input" data-mfield="new-sub" placeholder="Add a subtask…" maxlength="160" />
          <button type="button" class="add-btn" data-act="add-sub" title="Add subtask" aria-label="Add subtask">${icon("plus", { size: 16, stroke: 2 })}</button>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-field detail-field--wide">
          <span class="detail-label">Priority</span>
          <div class="seg prio-opts">${prioOpts}</div>
        </div>
        <div class="detail-field detail-field--wide">
          <span class="detail-label">${escapeHtml(tr("task.difficulty"))}</span>
          <div class="seg diff-opts">${diffOpts}</div>
        </div>
        <label class="detail-field">
          <span class="detail-label">Estimate (min)</span>
          <input type="number" data-mfield="estMinutes" min="0" step="5" value="${t.estMinutes || 0}" />
          ${planHint}
        </label>
        <label class="detail-field">
          <span class="detail-label">Time</span>
          <input type="time" data-mfield="scheduledMin" value="${t.scheduledMin != null ? minToClock(t.scheduledMin) : ""}" />
        </label>
        <label class="detail-field">
          <span class="detail-label">Planned date</span>
          <input type="date" data-mfield="plannedDate" value="${escapeHtml(t.plannedDate || "")}" />
        </label>
        <label class="detail-field">
          <span class="detail-label">Due</span>
          <input type="datetime-local" data-mfield="dueDate" value="${toDatetimeLocal(t.dueDate)}" />
        </label>
        <label class="detail-field detail-field--wide">
          <span class="detail-label">Subject</span>
          <input type="text" class="text-input" data-mfield="subject" value="${escapeHtml(t.subject || "")}" maxlength="60" placeholder="e.g. Anatomy" />
        </label>
        <label class="detail-field">
          <span class="detail-label">Room</span>
          <input type="text" class="text-input" data-mfield="room" value="${escapeHtml(t.room || "")}" maxlength="120" placeholder="e.g. B 2.14" />
        </label>
        <label class="detail-field">
          <span class="detail-label">Location / address</span>
          <input type="text" class="text-input" data-mfield="location" value="${escapeHtml(t.location || "")}" maxlength="300" placeholder="Building or full address" />
        </label>
        <label class="detail-field detail-field--wide">
          <span class="detail-label">Maps link</span>
          <input type="url" class="text-input" data-mfield="mapsUrl" value="${escapeHtml(t.mapsUrl || "")}" maxlength="1000" placeholder="https://maps.apple.com/… or Google Maps" />
          ${safeUrl(t.mapsUrl) ? `<a class="task-map-link" href="${escapeHtml(safeUrl(t.mapsUrl))}" target="_blank" rel="noopener noreferrer">${icon("external", { size: 13 })} Open map</a>` : ""}
        </label>
        <label class="detail-field detail-field--wide">
          <span class="detail-label">${escapeHtml(tr("task.topic"))}</span>
          <select class="text-input" data-mfield="topicId">
            <option value="">${escapeHtml(tr("task.topic_none"))}</option>
            ${topicOpts}
          </select>
          ${topicResRow(t)}
        </label>
      </div>
      ${depsSection(t)}
      ${taskResSection(t)}`;
  }

  function openModal(id) {
    const t = taskById(id);
    if (!t) return closeModal();
    modalId = String(id);
    renderModalBody(t);
    modalSig = modalBodySig(t);
    modal.overlay.hidden = false;
    modalTrap.activate();
    // Fokus auf den Namen (ans Ende)
    const nameEl = modal.body.querySelector('[data-mfield="text"]');
    if (nameEl) { nameEl.focus(); try { nameEl.setSelectionRange(nameEl.value.length, nameEl.value.length); } catch { /* ignore */ } }
  }
  function closeModal() {
    modal.overlay.hidden = true;
    modalTrap.release();
    modalId = null;
    if (store.state.ui.expandedTaskId != null) store.setUi({ expandedTaskId: null });
  }

  // Scalar-Feld eines Tasks live speichern.
  function saveField(field, rawValue) {
    if (!modalId) return;
    let patch = null;
    if (field === "text") { const v = rawValue.trim(); if (v) patch = { text: v }; }
    else if (field === "subject") patch = { subject: rawValue.trim() };
    else if (field === "estMinutes") patch = { estMinutes: Math.max(0, Math.round(Number(rawValue) || 0)) };
    else if (field === "dueDate") patch = { dueDate: fromDatetimeLocal(rawValue) };
    else if (field === "plannedDate") patch = { plannedDate: rawValue || null };
    else if (field === "room") patch = { room: rawValue.trim() || null };
    else if (field === "location") patch = { location: rawValue.trim() || null };
    else if (field === "mapsUrl") patch = { mapsUrl: safeUrl(rawValue) || null };
    else if (field === "scheduledMin") {
      const raw = clockToMin(rawValue);
      patch = { scheduledMin: raw == null ? null : Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - SLOT_STEP_MIN, raw)) };
    }
    else if (field === "topicId") patch = { topicId: rawValue ? Number(rawValue) : null };
    if (patch) act(() => api.tasks.update(modalId, patch));
  }

  modal.body.addEventListener("change", (e) => {
    const f = e.target.dataset.mfield;
    if (f === "dep-add") {
      const depId = Number(e.target.value);
      e.target.value = "";
      return depId && act(() => api.tasks.addDep(modalId, depId));
    }
    if (f && !["new-sub", "res-url"].includes(f)) return saveField(f, e.target.value);
    if (e.target.matches('[data-act="toggle-sub"]')) {
      const sid = e.target.closest("[data-sid]")?.getAttribute("data-sid");
      return sid && act(() => api.subtasks.update(sid, { done: e.target.checked }));
    }
  });
  modal.body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act2 = b.getAttribute("data-act");
    if (act2 === "set-prio") return act(() => api.tasks.update(modalId, { priority: Number(b.getAttribute("data-prio")) }));
    if (act2 === "set-diff") return act(() => api.tasks.update(modalId, { difficulty: Number(b.getAttribute("data-diff")) }));
    if (act2 === "dep-del") {
      const depId = b.closest("[data-dep-id]")?.getAttribute("data-dep-id");
      return depId && act(() => api.tasks.removeDep(modalId, depId));
    }
    if (act2 === "add-sub") return addSub(modal.body.querySelector('[data-mfield="new-sub"]'));
    if (act2 === "del-sub") { const sid = b.closest("[data-sid]")?.getAttribute("data-sid"); return sid && act(() => api.subtasks.remove(sid)); }
    if (act2 === "task-res-add") return addRes(modal.body.querySelector('[data-mfield="res-url"]'));
    if (act2 === "task-res-del") { const rid = b.closest("[data-res-id]")?.getAttribute("data-res-id"); return rid && act(() => api.resources.remove(rid)); }
    if (act2 === "task-res-primary") {
      const rid = b.closest("[data-res-id]")?.getAttribute("data-res-id");
      const r = (store.state.resources || []).find((x) => String(x.id) === String(rid));
      return rid && act(() => api.resources.update(rid, { isPrimary: !(r && r.isPrimary) }));
    }
  });
  modal.body.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.target.matches('[data-mfield="new-sub"]')) { e.preventDefault(); addSub(e.target); }
    else if (e.target.matches('[data-mfield="res-url"]')) { e.preventDefault(); addRes(e.target); }
    else if (e.target.matches('[data-mfield="text"]')) { e.preventDefault(); closeModal(); }
  });
  async function addSub(inputEl) {
    if (!inputEl || !modalId) return;
    const text = inputEl.value.trim(); if (!text) return;
    inputEl.value = "";
    await act(() => api.tasks.addSubtask(modalId, text));
  }
  async function addRes(inputEl) {
    if (!inputEl || !modalId) return;
    const url = safeUrl(inputEl.value);
    if (!url) {
      showToast({ type: "warn", title: "That doesn’t look like a link", body: "Paste a full web address, e.g. https://…" });
      inputEl.focus();
      return;
    }
    const ok = await act(() => api.resources.create({ taskId: Number(modalId), url }));
    if (ok) inputEl.value = "";       // erst nach Erfolg leeren
  }

  modal.close.addEventListener("click", closeModal);
  modal.cancel.addEventListener("click", closeModal);
  modal.save.addEventListener("click", closeModal);
  modal.del.addEventListener("click", async () => {
    if (!modalId) return;
    const id = modalId;
    const t = taskById(id);
    const text = t ? t.text : "";
    const subN = (t?.subtasks || []).length;
    const resN = (store.state.resources || []).filter((r) => String(r.taskId) === String(id)).length;
    // Mit Subtasks/Links → bewusste Rückfrage (Cascade). Sonst sofort + Undo.
    if (subN || resN) {
      const bits = [subN && `${subN} subtask${subN === 1 ? "" : "s"}`, resN && `${resN} link${resN === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
      const ok = await confirmDialog({ title: "Delete this task?", body: `“${text}” and its ${bits} will be removed.`, confirmLabel: "Delete task" });
      if (!ok) return;
      const done = await act(() => api.tasks.remove(id));
      if (done) closeModal();
      return;
    }
    const snap = t ? {
      text: t.text, subject: t.subject || undefined, priority: t.priority,
      estMinutes: t.estMinutes, plannedDate: t.plannedDate || undefined,
      scheduledMin: t.scheduledMin ?? undefined, dueDate: t.dueDate ?? undefined, examId: t.examId ?? undefined,
    } : null;
    const removed = await act(() => api.tasks.remove(id));
    if (!removed) return;
    closeModal();
    if (snap) showToast({
      type: "success", title: "Task deleted", body: text, timeout: 6000,
      action: { label: "Undo", onClick: () => act(() => api.tasks.create(snap)) },
    });
  });
  modal.overlay.addEventListener("mousedown", (e) => { if (e.target === modal.overlay || e.target.classList.contains("task-modal__scrim")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (!modal.overlay.hidden && e.key === "Escape") closeModal(); });

  // ── Render ───────────────────────────────────────
  function render() {
    const s = store.state;
    const nowMs = store.now();
    const today = dayKeyOf(nowMs);
    const open = s.tasks.filter((t) => !t.done && (!t.plannedDate || t.plannedDate <= today)).sort(cmp);
    const unscheduled = open.filter((t) => t.scheduledMin == null);

    renderHero(pickNow(open, s));
    renderCurrent(s.tasks.find((t) => t.active) || null, s);

    // Liste der offenen Arbeit (nur bei Änderung neu bauen → Scroll/Drag stabil)
    if (unsMeta) unsMeta.textContent = "";
    if (unsEmpty) unsEmpty.hidden = unscheduled.length > 0;
    // Signatur enthält das, was WIRKLICH gerendert wird (inkl. abgeleitetem
    // Fälligkeits-Text und Alter) — so baut die Liste weder jede Sekunde neu,
    // noch verpasst sie den Wechsel von „tomorrow" auf „due today".
    const sig = JSON.stringify(unscheduled.map((t) => [
      t.id, t.text, t.subject, t.estMinutes, t.active, t.priority,
      dueLabel(t.dueDate, nowMs)?.text ?? null, agedDays(t, today, nowMs), openDeps(t).length,
    ]));
    if (unsList && sig !== unsSig) { unsList.innerHTML = buildUnscheduled(unscheduled, today, nowMs); unsSig = sig; }

    // Modal: mit ui.expandedTaskId synchronisieren
    const want = s.ui.expandedTaskId;
    if (want != null && String(want) !== modalId) {
      openModal(want);
    } else if (want == null && modalId != null) {
      closeModal();
    } else if (modalId != null) {
      const t = taskById(modalId);
      if (!t) { closeModal(); return; }
      // Nur neu bauen, wenn sich Modal-relevante Daten änderten UND gerade kein Feld editiert wird
      // (sonst würde der 10s-Reconcile Fokus/Eingabe zerstören).
      const sig = modalBodySig(t);
      const editing = modal.body.contains(document.activeElement)
        && document.activeElement.matches("input, textarea");
      if (sig !== modalSig && !editing) { renderModalBody(t); modalSig = sig; }
    }
  }

  store.subscribe(render);
  render();
  return {};
}

// In-App-Task-Modal (Scrim + zentrierte 560px-Karte).
function buildTaskModal() {
  const overlay = document.createElement("div");
  overlay.className = "task-modal";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="task-modal__scrim"></div>
    <div class="task-modal__card" role="dialog" aria-modal="true" aria-label="Edit task">
      <div class="task-modal__bar">
        <span class="task-modal__eyebrow">Edit task</span>
        <button class="task-modal__close" data-a="close" title="Close" aria-label="Close">${icon("close", { size: 14 })}</button>
      </div>
      <div class="task-modal__body"></div>
      <div class="task-modal__foot">
        <button class="btn btn--ghost btn--danger" data-a="del">Delete</button>
        <span class="task-modal__spacer"></span>
        <button class="btn btn--ghost" data-a="cancel">Cancel</button>
        <button class="btn btn--primary" data-a="save">Save task</button>
      </div>
    </div>`;
  return {
    overlay,
    body: overlay.querySelector(".task-modal__body"),
    close: overlay.querySelector('[data-a="close"]'),
    cancel: overlay.querySelector('[data-a="cancel"]'),
    save: overlay.querySelector('[data-a="save"]'),
    del: overlay.querySelector('[data-a="del"]'),
  };
}
