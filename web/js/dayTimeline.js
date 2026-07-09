// Tages-Zeitstrahl (Heute-Ansicht, linke Spalte).
// - Vertikaler Zeitstrahl 06:00–24:00, läuft mit der (NTP-)Systemuhr mit (Now-Linie).
// - Aufgaben mit scheduledMin erscheinen als Blöcke an ihrer Uhrzeit.
// - Farben: future / now / past; erledigt = grün, überfällig & offen = Warnfarbe.
// - Drop-Ziel für Drag & Drop aus der Aufgabenliste; Blöcke selbst verschiebbar.
// - Überfällige, offene Aufgaben: Nachfrage „erledigt?" — Ja → fertig,
//   Nein → automatisch in den nächsten freien Slot.
import {
  minToClock, nowMinOfDay, slotStatus, isOverdue, nextFreeSlot,
  roundToStep, ceilToStep, escapeHtml, dayKeyOf,
  DAY_START_MIN, DAY_END_MIN, SLOT_STEP_MIN,
} from "/js/util.js";

const PX_PER_MIN = 0.8;                        // 18 h ≈ 864 px (scrollbar)
const WINDOW_MIN = DAY_END_MIN - DAY_START_MIN;
const MIN_BLOCK_MIN = 22;                       // Mindesthöhe eines Blocks (Lesbarkeit)
const SNOOZE_MIN = 5;                           // „später": so lange nicht erneut fragen

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const durOf = (t) => Math.max(SLOT_STEP_MIN, Math.round(Number(t.estMinutes) || 25));

export function initDayTimeline({ store, api }) {
  const el = (id) => document.getElementById(id);
  const root = el("dayTimeline");
  const inner = el("dayTimelineInner");
  const clockLabel = el("planClock");
  const emptyHint = el("planEmpty");
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

    let h = "";
    // Stundenraster
    for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 60) {
      h += `<div class="tl-hour" style="top:${yOf(m)}px"><span class="tl-hour__lbl">${minToClock(m)}</span></div>`;
    }
    // Aufgaben-Blöcke
    for (const t of tasks) {
      const dur = durOf(t);
      const height = Math.max(MIN_BLOCK_MIN, dur) * PX_PER_MIN - 2;
      // Außerhalb des Fensters (z. B. < 06:00) sichtbar halten statt abschneiden.
      const top = clamp(yOf(t.scheduledMin), 0, WINDOW_MIN * PX_PER_MIN - height);
      const status = t.done ? "done" : slotStatus({ startMin: t.scheduledMin, durationMin: dur }, nowMin);
      const range = `${minToClock(t.scheduledMin)}–${minToClock(t.scheduledMin + dur)}`;
      h += `<div class="tl-item is-${status}${t.active ? " is-active" : ""}" data-id="${escapeHtml(String(t.id))}"
              draggable="true" style="top:${top}px;height:${height}px" title="${escapeHtml(t.text)} · ${range}">
              <button class="tl-item__check" data-act="toggle" title="toggle done" aria-label="toggle done">${t.done ? "✓" : ""}</button>
              <div class="tl-item__body">
                <div class="tl-item__name">${escapeHtml(t.text)}</div>
                <div class="tl-item__range">${range}</div>
              </div>
            </div>`;
    }
    // Now-Linie (zuletzt → oben drüber)
    if (nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN) {
      h += `<div class="tl-now" style="top:${yOf(nowMin)}px" aria-hidden="true"><span class="tl-now__dot"></span></div>`;
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
    modal.msg.textContent = `"${task.text}" was planned for ${minToClock(task.scheduledMin)} and is now past. Did you finish it?`;
    modal.overlay.hidden = false;
    modal.yes.focus();

    // handled erst NACH erfolgreichem Update setzen; scheitert es (offline),
    // bleibt der Slot re-promptbar (kurz zurückgestellt, statt für immer stumm).
    modal.onYes = async () => {
      close();
      if (await act(() => api.tasks.update(task.id, { done: true }))) handled.add(key);
      else snoozed.set(key, store.now() + SNOOZE_MIN * 60_000);
    };
    modal.onNo = async () => {
      close();
      const today = dayKeyOf(store.now());
      const nowMin = nowMinOfDay(store.now());
      const occupied = scheduledToday()
        .filter((x) => String(x.id) !== String(task.id) && !x.done)
        .map((x) => ({ startMin: x.scheduledMin, durationMin: durOf(x) }));
      const from = Math.max(ceilToStep(nowMin, SLOT_STEP_MIN), DAY_START_MIN);
      const newMin = nextFreeSlot(occupied, durOf(task), from);
      if (await act(() => api.tasks.update(task.id, { scheduledMin: newMin, plannedDate: today }))) handled.add(key);
      else snoozed.set(key, store.now() + SNOOZE_MIN * 60_000);
    };
    modal.onLater = () => {
      snoozed.set(key, store.now() + SNOOZE_MIN * 60_000);
      close();
    };
  }

  function close() {
    modal.overlay.hidden = true;
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
    if (!item) return;
    e.dataTransfer.setData("text/plain", item.dataset.id);
    e.dataTransfer.effectAllowed = "move";
    item.classList.add("is-dragging");
  });
  inner.addEventListener("dragend", (e) => {
    e.target.closest?.(".tl-item")?.classList.remove("is-dragging");
  });

  // Klick: Checkbox → erledigt umschalten; sonst Aufgabe rechts aufklappen.
  inner.addEventListener("click", (e) => {
    const item = e.target.closest(".tl-item");
    if (!item) return;
    const id = item.dataset.id;
    if (e.target.closest("[data-act='toggle']")) {
      const t = store.state.tasks.find((x) => String(x.id) === String(id));
      return act(() => api.tasks.update(id, { done: !t?.done }));
    }
    store.setUi({ expandedTaskId: id });
  });

  store.subscribe(render);
  render();
  scrollToNow();
  return { tick };
}

// ── In-App-Modal (statt window.confirm — testbar, stilkonform) ──
function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "plan-modal";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="plan-modal__box" role="dialog" aria-modal="true" aria-labelledby="planModalTitle">
      <div class="plan-modal__title" id="planModalTitle">Done?</div>
      <div class="plan-modal__msg" id="planModalMsg"></div>
      <div class="plan-modal__actions">
        <button class="btn btn--primary" data-a="yes">Yes, done</button>
        <button class="btn btn--ghost" data-a="no">No → new slot</button>
      </div>
      <button class="plan-modal__later" data-a="later">remind me later</button>
    </div>`;

  const box = overlay.querySelector(".plan-modal__box");
  const handles = {
    overlay,
    msg: overlay.querySelector("#planModalMsg"),
    yes: overlay.querySelector('[data-a="yes"]'),
    onYes: null, onNo: null, onLater: null,
  };

  overlay.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "yes") return handles.onYes?.();
    if (a === "no") return handles.onNo?.();
    if (a === "later") return handles.onLater?.();
    if (!box.contains(e.target)) handles.onLater?.(); // Klick auf den Hintergrund = später
  });
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") handles.onLater?.();
  });

  return handles;
}
