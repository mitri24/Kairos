// Tages-Todo + Zeitslot-Priorisierung: Logik und DOM-Rendering
import { TODO_STORAGE_KEY } from "./constants.js";

const todoInput = document.getElementById("todoInput");
const todoAddBtn = document.getElementById("todoAddBtn");
const todoList = document.getElementById("todoList");
const todoEmpty = document.getElementById("todoEmpty");
const todoDayInfo = document.getElementById("todoDayInfo");

let state = load();
let contextMenu = null;
let contextMenuDeleteBtn = null;
let contextMenuTodoId = null;

export function initTodo() {
  if (!todoInput || !todoAddBtn || !todoList) return;

  ensureToday();
  ensureContextMenu();
  render();
  mirrorCurrentTask();

  todoAddBtn.addEventListener("click", add);
  todoInput.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
  todoList.addEventListener("scroll", hideContextMenu);
}

// Spiegelt die oberste offene Aufgabe nach chrome.storage.local, damit das
// Content-Script-Overlay (auf allen Websites) „die Aufgabe, die ich gerade
// mache" anzeigen kann. No-op außerhalb des Extension-Kontexts.
function mirrorCurrentTask() {
  const store = globalThis.chrome?.storage?.local;
  if (!store) return;
  const top = getSortedTodos().find((todo) => !todo.done);
  try {
    store.set({ adhdCurrentTask: top ? { id: top.id, text: top.text } : null });
  } catch (_) {
    // noop
  }
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
    return {
      ...todo,
      done,
      prioritized: done ? false : todo.prioritized,
    };
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

// ── Rendering ────────────────────────────────────
function render() {
  ensureToday();
  hideContextMenu();

  const todos = getSortedTodos();
  todoList.innerHTML = "";
  if (todoEmpty) todoEmpty.style.display = todos.length === 0 ? "block" : "none";

  for (const todo of todos) {
    const li = document.createElement("li");
    li.className = "todo-item" + (todo.done ? " done" : "") + (todo.prioritized ? " prioritized" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "todo-check";
    checkbox.checked = todo.done;
    checkbox.setAttribute("aria-label", `Done: ${todo.text}`);
    checkbox.addEventListener("change", () => toggle(todo.id));

    const span = document.createElement("span");
    span.className = "todo-text";
    span.textContent = todo.text;

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

    li.append(checkbox, span, prioritizeBtn);
    todoList.appendChild(li);
  }

  if (todoDayInfo) {
    todoDayInfo.textContent = `Today · ${formatDate(new Date())}`;
  }
}

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
  } catch (_) {
    // noop
  }
  mirrorCurrentTask();
}

function load() {
  const emptyState = { dayKey: todayKey(), todos: [] };

  try {
    const raw = JSON.parse(localStorage.getItem(TODO_STORAGE_KEY) ?? "null");
    if (!raw) return emptyState;

    if (Array.isArray(raw)) {
      return {
        ...emptyState,
        todos: raw.map(normalizeTodo).filter(Boolean),
      };
    }

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

  return {
    id: Number.isFinite(Number(rawTodo.id)) ? Number(rawTodo.id) : Date.now() + Math.random(),
    text,
    done: Boolean(rawTodo.done),
    prioritized: Boolean(rawTodo.prioritized),
    createdAt: Number.isFinite(Number(rawTodo.createdAt)) ? Number(rawTodo.createdAt) : Date.now(),
  };
}

function getSortedTodos() {
  return [...state.todos].sort((left, right) => {
    if (left.done !== right.done) return Number(left.done) - Number(right.done);
    if (left.prioritized !== right.prioritized) return Number(right.prioritized) - Number(left.prioritized);
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
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
