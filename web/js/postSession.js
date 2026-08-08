// Post-Session-Review — kurzes, ehrliches „geschafft?"-Fenster nach jedem Fokus-
// block. Zeigt echte Stats, fragt „wie lief's" (Tough/Solid/Easy) und passt bei
// „Tough" die Aufgaben-Schätzung an, damit der Plan realistisch bleibt.
// Ausgelöst durch das „focus-complete"-Event aus main.js.
import { formatHours } from "/js/util.js";
import { showToast } from "/js/toast.js";
import { createFocusTrap } from "/js/focusTrap.js";
import { icon } from "/js/icons.js";

export function initPostSession({ store, api }) {
  // Haken aus /js/icons.js — kräftigerer Strich, weil er hier groß im Kopf sitzt.
  const CHECK = icon("check", { size: 28, stroke: 2.2 });
  const overlay = document.createElement("div");
  overlay.className = "sheet-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `<div class="sheet-overlay__scrim"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Focus block review">
      <div class="sheet__head sheet__head--center">
        <div class="sheet__head-ic sheet__head-ic--lg">${CHECK}</div>
        <div class="sheet__title" id="psTitle">Block done</div>
        <div class="sheet__sub" id="psSub"></div>
      </div>
      <div class="sheet__tiles">
        <div class="sheet-tile"><div class="sheet-tile__val" id="psFocused">–</div><div class="sheet-tile__lbl">focused</div></div>
        <div class="sheet-tile"><div class="sheet-tile__val is-amber" id="psFlagged">0</div><div class="sheet-tile__lbl">flagged</div></div>
        <div class="sheet-tile"><div class="sheet-tile__val" id="psToday">–</div><div class="sheet-tile__lbl">today</div></div>
      </div>
      <div class="sheet__q">How did it go?</div>
      <div class="sheet__rate" id="psRate">
        <button class="sheet-rate" type="button" data-rate="tough">${icon("faceFrown", { size: 20 })}<span>Tough</span></button>
        <button class="sheet-rate" type="button" data-rate="solid">${icon("faceNeutral", { size: 20 })}<span>Solid</span></button>
        <button class="sheet-rate" type="button" data-rate="easy">${icon("faceSmile", { size: 20 })}<span>Easy</span></button>
      </div>
      <div class="sheet__note" id="psNote" hidden></div>
      <div class="sheet__foot">
        <button class="btn btn--ghost" type="button" id="psBreak">Take a break</button>
        <button class="btn btn--primary" type="button" id="psNext">Next block</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (id) => overlay.querySelector("#" + id);
  const trap = createFocusTrap(overlay.querySelector(".sheet"), { initialFocus: () => $("psNext") });

  let rating = null;
  const activeTask = () => store.state.tasks.find((t) => t.active) || null;
  async function act(fn) { try { store.applySnapshot(await fn()); } catch (e) { console.warn("[post-session]", e.message); } }

  function open() {
    rating = null;
    const s = store.state, task = activeTask();
    const focusMin = s.settings.focusMinutes || 25;
    $("psTitle").textContent = `Block done · ${focusMin} min`;
    $("psSub").textContent = task ? (task.subject ? `${task.text} · ${task.subject}` : task.text) : "How did it feel?";
    $("psFocused").textContent = `${focusMin}m`;
    $("psToday").textContent = `+${formatHours(s.today.focusMs || 0)}h`;
    for (const b of $("psRate").children) b.classList.remove("is-active");
    $("psNote").hidden = true;
    overlay.hidden = false;
    trap.activate();
  }
  function close() { overlay.hidden = true; trap.release(); }

  $("psRate").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rate]"); if (!b) return;
    rating = b.dataset.rate;
    for (const x of $("psRate").children) x.classList.toggle("is-active", x === b);
    const note = $("psNote");
    note.hidden = false;
    if (rating === "tough") note.innerHTML = "Noted — I’ll <b>nudge this task’s estimate up</b> so the plan stays realistic.";
    else if (rating === "easy") note.innerHTML = "Momentum’s on your side — keep the streak going.";
    else note.innerHTML = "Solid work. Onward.";
  });

  async function applyRating() {
    if (rating !== "tough") return;
    const task = activeTask();
    if (task && task.estMinutes) {
      const bumped = Math.max(task.estMinutes + 5, Math.ceil((task.estMinutes * 1.15) / 5) * 5);
      await act(() => api.tasks.update(task.id, { estMinutes: bumped }));
      showToast({ type: "success", title: "Estimate nudged up", body: `${task.text} · now ~${bumped} min` });
    }
  }

  $("psNext").addEventListener("click", async () => { await applyRating(); await act(() => api.timer.phase("focus")); await act(() => api.timer.start()); close(); });
  $("psBreak").addEventListener("click", async () => { await applyRating(); await act(() => api.timer.phase("short-break")); await act(() => api.timer.start()); close(); });
  document.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") close(); });

  document.addEventListener("focus-complete", open);
  return {};
}
