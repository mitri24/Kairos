// Tages-Todo mit Zeitstrahl: Todos an ihrer Uhrzeit auf einem Tages-Zeitstrahl,
// der mit der Systemuhr mitläuft. Vergangene/erledigte Blöcke werden umgefärbt;
// überfällige & offene Todos fragen nach ("erledigt?" → Ja=fertig, Nein=neuer Slot).
// Reine localStorage-Persistenz (kein Backend). Nutzt die geteilte Tagesplan-Logik.
import { TODO_STORAGE_KEY } from "./constants.js";
import {
  minToClock, clockToMin, nowMinOfDay, slotStatus, isOverdue, nextFreeSlot,
  roundToStep, ceilToStep, DAY_START_MIN, DAY_END_MIN, SLOT_STEP_MIN,
} from "../../../shared/daySchedule.js";

const PX_PER_MIN = 0.7;                          // 18 h ≈ 756 px (scrollbar)
const WINDOW_MIN = DAY_END_MIN - DAY_START_MIN;
const MIN_BLOCK_MIN = 24;
const DEFAULT_DUR = 25;
const SNOOZE_MIN = 5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const todoInput = document.getElementById("todoInput");
const todoAddBtn = document.getElementById("todoAddBtn");
const todoList = document.getElementById("todoList");
const todoEmpty = document.getElementById("todoEmpty");
const todoDayInfo = document.getElementById("todoDayInfo");
const tlRoot = document.getElementById("todoTimeline");
const tlInner = document.getElementById("todoTimelineInner");
const tlClock = document.getElementById("todoClock");

let state = load();
let contextMenu = null;
let contextMenuDeleteBtn = null;
let contextMenuTodoId = null;
let modal = null;
let lastMin = -1;
let lastDayKey = null;         // Tageswechsel → handled/snoozed leeren
const handled = new Set();     // key `${id}:${startMin}` bereits beantwortet
const snoozed = new Map();     // key -> absolute epoch ms, bis dahin nicht erneut fragen
let currentKey = null;

export function initTodo() {
  if (!todoInput || !todoAddBtn || !todoList) return;

  ensureToday();
  lastDayKey = todayKey();
  ensureContextMenu();
  ensureModal();
  if (tlInner) tlInner.style.height = `${WINDOW_MIN * PX_PER_MIN}px`;

  render();
  mirrorCurrentTask();

  todoAddBtn.addEventListener("click", add);
  todoInput.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
  todoList.addEventListener("scroll", hideContextMenu);
  wireTimeline();
  scrollTimelineToNow();

  setInterval(tick, 1000);
}

// Spiegelt die oberste offene Aufgabe nach chrome.storage.local (All-Sites-Overlay).
function mirrorCurrentTask() {
  const store = globalThis.chrome?.storage?.local;
  if (!store) return;
  const top = getSortedTodos().find((todo) => !todo.done);
  try {
    store.set({ adhdCurrentTask: top ? { id: top.id, text: top.text } : null });
  } catch (_) { /* noop */ }
}

// ── Aktionen ─────────────────────────────────────
function add() {
  const text = todoInput.value.trim();
  if (!text) return;

  ensureToday();
  state.todos.push({
    id: Date.now(),
    text,
    done: false,
    prioritized: false,
    createdAt: Date.now(),
    startMin: null,
    durationMin: DEFAULT_DUR,
  });

  save();
  render();
  todoInput.value = "";
  todoInput.focus();
}

function remove(id) {
  state.todos = state.todos.filter((todo) => todo.id !== id);
  save();
  hideContextMenu();
  render();
}

function toggle(id) {
  state.todos = state.todos.map((todo) => {
    if (todo.id !== id) return todo;
    const done = !todo.done;
    return { ...todo, done, prioritized: done ? false : todo.prioritized };
  });
  save();
  render();
}

function togglePrioritized(id) {
  state.todos = state.todos.map((todo) => {
    if (todo.id !== id || todo.done) return todo;
    return { ...todo, prioritized: !todo.prioritized };
  });
  save();
  render();
}

// Uhrzeit setzen/ändern/entfernen (null = vom Zeitstrahl nehmen).
// Aufs Tagesfenster begrenzt, damit ein Block nie außerhalb des Zeitstrahls landet.
function setStartMin(id, startMin) {
  const v = startMin == null ? null : clamp(Math.round(startMin), DAY_START_MIN, DAY_END_MIN - SLOT_STEP_MIN);
  state.todos = state.todos.map((todo) => (todo.id === id ? { ...todo, startMin: v } : todo));
  save();
  render();
}

const byId = (id) => state.todos.find((t) => String(t.id) === String(id));
const durOf = (t) => Math.max(SLOT_STEP_MIN, Math.round(Number(t.durationMin) || DEFAULT_DUR));

// ── Rendering ────────────────────────────────────
function render() {
  ensureToday();
  hideContextMenu();
  renderList();
  renderTimeline();
  if (todoDayInfo) todoDayInfo.textContent = `Today · ${formatDate(new Date())}`;
}

function renderList() {
  const todos = getSortedTodos();
  todoList.innerHTML = "";
  if (todoEmpty) todoEmpty.style.display = todos.length === 0 ? "block" : "none";

  for (const todo of todos) {
    const li = document.createElement("li");
    li.className = "todo-item" + (todo.done ? " done" : "") + (todo.prioritized ? " prioritized" : "");

    const grip = document.createElement("span");
    grip.className = "todo-grip";
    grip.textContent = "⠿";
    grip.title = "Drag onto the timeline";
    grip.setAttribute("draggable", "true");
    grip.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", String(todo.id));
      e.dataTransfer.effectAllowed = "move";
    });

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "todo-check";
    checkbox.checked = todo.done;
    checkbox.setAttribute("aria-label", `Done: ${todo.text}`);
    checkbox.addEventListener("change", () => toggle(todo.id));

    const span = document.createElement("span");
    span.className = "todo-text";
    span.textContent = todo.text;

    const time = document.createElement("input");
    time.type = "time";
    time.className = "todo-time";
    time.value = todo.startMin != null ? minToClock(todo.startMin) : "";
    time.title = "Scheduled time";
    time.setAttribute("aria-label", `Time for ${todo.text}`);
    time.addEventListener("change", () => setStartMin(todo.id, clockToMin(time.value)));

    const prioritizeBtn = document.createElement("button");
    prioritizeBtn.type = "button";
    prioritizeBtn.className = "todo-priority-btn" + (todo.prioritized ? " active" : "");
    prioritizeBtn.textContent = todo.prioritized ? "♥" : "♡";
    prioritizeBtn.setAttribute("aria-label", `Prioritize: ${todo.text}`);
    prioritizeBtn.title = todo.prioritized ? "Unprioritize" : "Prioritize";
    prioritizeBtn.disabled = todo.done;
    prioritizeBtn.addEventListener("click", () => togglePrioritized(todo.id));

    li.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showContextMenu(event.clientX, event.clientY, todo.id);
    });

    li.append(grip, checkbox, span, time, prioritizeBtn);
    todoList.appendChild(li);
  }
}

function yOf(min) { return (min - DAY_START_MIN) * PX_PER_MIN; }

function renderTimeline() {
  if (!tlInner) return;
  const nowMin = nowMinOfDay(Date.now());
  lastMin = Math.floor(nowMin);
  if (tlClock) tlClock.textContent = minToClock(nowMin);

  const scheduled = state.todos
    .filter((t) => t.startMin != null)
    .sort((a, b) => a.startMin - b.startMin);

  let h = "";
  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 60) {
    h += `<div class="tl-hour" style="top:${yOf(m)}px"><span class="tl-hour__lbl">${minToClock(m)}</span></div>`;
  }
  for (const t of scheduled) {
    const dur = durOf(t);
    const height = Math.max(MIN_BLOCK_MIN, dur) * PX_PER_MIN - 2;
    const top = clamp(yOf(t.startMin), 0, WINDOW_MIN * PX_PER_MIN - height);
    const status = t.done ? "done" : slotStatus({ startMin: t.startMin, durationMin: dur }, nowMin);
    const range = `${minToClock(t.startMin)}–${minToClock(t.startMin + dur)}`;
    h += `<div class="tl-item is-${status}${t.prioritized ? " is-prio" : ""}" data-id="${t.id}"
            draggable="true" style="top:${top}px;height:${height}px" title="${escapeAttr(t.text)} · ${range}">
            <button class="tl-item__check" data-act="toggle" title="toggle done" aria-label="toggle done">${t.done ? "✓" : ""}</button>
            <div class="tl-item__body">
              <div class="tl-item__name">${escapeHtml(t.text)}</div>
              <div class="tl-item__range">${range}</div>
            </div>
          </div>`;
  }
  if (nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN) {
    h += `<div class="tl-now" style="top:${yOf(nowMin)}px" aria-hidden="true"><span class="tl-now__dot"></span></div>`;
  }
  tlInner.innerHTML = h;

  maybePrompt(scheduled, nowMin);
}

function tick() {
  // Tageswechsel erkennen: ensureToday() wischt für den neuen Tag, Nachfragen zurücksetzen.
  const dk = todayKey();
  if (dk !== lastDayKey) {
    lastDayKey = dk;
    handled.clear();
    snoozed.clear();
    render();               // ruft ensureToday() → Liste + Timeline neu
    return;
  }
  const nowMin = nowMinOfDay(Date.now());
  if (Math.floor(nowMin) !== lastMin) renderTimeline();
  else maybePrompt(state.todos.filter((t) => t.startMin != null), nowMin);
}

function scrollTimelineToNow() {
  if (!tlRoot || !tlInner) return;
  const nowMin = nowMinOfDay(Date.now());
  tlRoot.scrollTop = clamp(yOf(nowMin) - tlRoot.clientHeight / 2, 0, tlInner.clientHeight);
}

// ── Timeline-Interaktion (Drag & Drop, Klick) ────
function minFromEvent(e) {
  const rect = tlInner.getBoundingClientRect();
  const min = DAY_START_MIN + (e.clientY - rect.top) / PX_PER_MIN;
  return clamp(roundToStep(min, SLOT_STEP_MIN), DAY_START_MIN, DAY_END_MIN - SLOT_STEP_MIN);
}

function wireTimeline() {
  if (!tlRoot || !tlInner) return;

  tlRoot.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; tlRoot.classList.add("is-drop"); });
  tlRoot.addEventListener("dragleave", (e) => { if (!tlRoot.contains(e.relatedTarget)) tlRoot.classList.remove("is-drop"); });
  tlRoot.addEventListener("drop", (e) => {
    e.preventDefault();
    tlRoot.classList.remove("is-drop");
    const id = Number(e.dataTransfer.getData("text/plain"));
    if (!id) return;
    setStartMin(id, minFromEvent(e));
  });

  tlInner.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".tl-item");
    if (!item) return;
    e.dataTransfer.setData("text/plain", item.dataset.id);
    e.dataTransfer.effectAllowed = "move";
    item.classList.add("is-dragging");
  });
  tlInner.addEventListener("dragend", (e) => { e.target.closest?.(".tl-item")?.classList.remove("is-dragging"); });

  tlInner.addEventListener("click", (e) => {
    const item = e.target.closest(".tl-item");
    if (!item) return;
    if (e.target.closest("[data-act='toggle']")) toggle(Number(item.dataset.id));
  });
}

// ── Überfällig-Nachfrage ─────────────────────────
function maybePrompt(scheduled, nowMin) {
  if (currentKey) return;
  for (const t of scheduled) {
    if (t.done) continue;
    if (!isOverdue({ startMin: t.startMin, durationMin: durOf(t) }, nowMin)) continue;
    const key = `${t.id}:${t.startMin}`;
    if (handled.has(key)) continue;
    const until = snoozed.get(key);
    if (until != null && Date.now() < until) continue;
    showPrompt(t, key);
    return;
  }
}

function showPrompt(todo, key) {
  currentKey = key;
  modal.msg.textContent = `"${todo.text}" was planned for ${minToClock(todo.startMin)} and is now past. Did you finish it?`;
  modal.overlay.hidden = false;
  modal.yes.focus();

  modal.onYes = () => { handled.add(key); closeModal(); toggle(todo.id); };
  modal.onNo = () => {
    handled.add(key);
    closeModal();
    const nowMin = nowMinOfDay(Date.now());
    const occupied = state.todos
      .filter((x) => x.startMin != null && x.id !== todo.id && !x.done)
      .map((x) => ({ startMin: x.startMin, durationMin: durOf(x) }));
    const from = Math.max(ceilToStep(nowMin, SLOT_STEP_MIN), DAY_START_MIN);
    setStartMin(todo.id, nextFreeSlot(occupied, durOf(todo), from));
  };
  modal.onLater = () => { snoozed.set(key, Date.now() + SNOOZE_MIN * 60_000); closeModal(); };
}

function closeModal() {
  if (modal) modal.overlay.hidden = true;
  currentKey = null;
}

function ensureModal() {
  if (modal) return;
  const overlay = document.createElement("div");
  overlay.className = "todo-modal";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="todo-modal__box" role="dialog" aria-modal="true">
      <div class="todo-modal__title">Done?</div>
      <div class="todo-modal__msg"></div>
      <div class="todo-modal__actions">
        <button class="btn" data-a="yes">Yes, done</button>
        <button class="btn" data-a="no">No → new slot</button>
      </div>
      <button class="todo-modal__later" data-a="later">remind me later</button>
    </div>`;
  const box = overlay.querySelector(".todo-modal__box");
  modal = { overlay, msg: overlay.querySelector(".todo-modal__msg"), yes: overlay.querySelector('[data-a="yes"]'), onYes: null, onNo: null, onLater: null };
  overlay.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "yes") return modal.onYes?.();
    if (a === "no") return modal.onNo?.();
    if (a === "later") return modal.onLater?.();
    if (!box.contains(e.target)) modal.onLater?.();
  });
  document.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") modal.onLater?.(); });
  document.body.appendChild(overlay);
}

// ── Kontextmenü (Löschen) ────────────────────────
function ensureContextMenu() {
  if (contextMenu && contextMenuDeleteBtn) return;

  contextMenu = document.createElement("div");
  contextMenu.className = "todo-context-menu";
  contextMenu.hidden = true;

  contextMenuDeleteBtn = document.createElement("button");
  contextMenuDeleteBtn.type = "button";
  contextMenuDeleteBtn.className = "todo-context-action";
  contextMenuDeleteBtn.textContent = "Delete task";
  contextMenuDeleteBtn.addEventListener("click", () => {
    if (contextMenuTodoId == null) return;
    remove(contextMenuTodoId);
  });

  contextMenu.appendChild(contextMenuDeleteBtn);
  document.body.appendChild(contextMenu);

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
  window.addEventListener("blur", hideContextMenu);
}

function showContextMenu(clientX, clientY, todoId) {
  if (!contextMenu) return;
  contextMenuTodoId = todoId;
  contextMenu.hidden = false;
  contextMenu.style.left = "0px";
  contextMenu.style.top = "0px";

  const { innerWidth, innerHeight } = window;
  const menuRect = contextMenu.getBoundingClientRect();
  const left = Math.min(clientX, innerWidth - menuRect.width - 8);
  const top = Math.min(clientY, innerHeight - menuRect.height - 8);
  contextMenu.style.left = `${Math.max(8, left)}px`;
  contextMenu.style.top = `${Math.max(8, top)}px`;
}

function hideContextMenu() {
  if (!contextMenu) return;
  contextMenu.hidden = true;
  contextMenuTodoId = null;
}

function onDocumentClick(event) {
  if (!contextMenu || contextMenu.hidden) return;
  if (contextMenu.contains(event.target)) return;
  hideContextMenu();
}

function onDocumentKeydown(event) {
  if (event.key === "Escape") hideContextMenu();
}

// ── Persistenz ───────────────────────────────────
function save() {
  try {
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(state));
  } catch (_) { /* noop */ }
  mirrorCurrentTask();
}

function load() {
  const emptyState = { dayKey: todayKey(), todos: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(TODO_STORAGE_KEY) ?? "null");
    if (!raw) return emptyState;
    if (Array.isArray(raw)) return { ...emptyState, todos: raw.map(normalizeTodo).filter(Boolean) };
    if (typeof raw === "object") {
      return {
        dayKey: typeof raw.dayKey === "string" ? raw.dayKey : todayKey(),
        todos: Array.isArray(raw.todos) ? raw.todos.map(normalizeTodo).filter(Boolean) : [],
      };
    }
  } catch (_) {
    return emptyState;
  }
  return emptyState;
}

function ensureToday() {
  const currentKey = todayKey();
  if (state.dayKey === currentKey) return;
  state = { dayKey: currentKey, todos: [] };
  save();
}

function normalizeTodo(rawTodo) {
  if (!rawTodo || typeof rawTodo !== "object") return null;
  const text = typeof rawTodo.text === "string" ? rawTodo.text.trim() : "";
  if (!text) return null;

  const startMin = Number.isFinite(Number(rawTodo.startMin)) && rawTodo.startMin != null
    ? clamp(Math.round(Number(rawTodo.startMin)), 0, 1439) : null;

  return {
    id: Number.isFinite(Number(rawTodo.id)) ? Number(rawTodo.id) : Date.now() + Math.random(),
    text,
    done: Boolean(rawTodo.done),
    prioritized: Boolean(rawTodo.prioritized),
    createdAt: Number.isFinite(Number(rawTodo.createdAt)) ? Number(rawTodo.createdAt) : Date.now(),
    startMin,
    durationMin: Number.isFinite(Number(rawTodo.durationMin)) ? Math.max(SLOT_STEP_MIN, Math.round(Number(rawTodo.durationMin))) : DEFAULT_DUR,
  };
}

function getSortedTodos() {
  return [...state.todos].sort((left, right) => {
    if (left.done !== right.done) return Number(left.done) - Number(right.done);
    if (left.prioritized !== right.prioritized) return Number(right.prioritized) - Number(left.prioritized);
    // geplante zuerst nach Uhrzeit, dann ungeplante nach Anlagezeit
    const la = left.startMin, ra = right.startMin;
    if (la != null && ra != null) return la - ra;
    if (la != null) return -1;
    if (ra != null) return 1;
    return left.createdAt - right.createdAt;
  });
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
