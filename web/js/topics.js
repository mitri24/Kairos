// Prüfungs-Themen-Checkliste: Themen der aktiven Prüfung (sonst alle),
// hinzufügen, abhaken (nach unten + durchgestrichen), löschen.
import { escapeHtml } from "/js/util.js";

export function initTopics({ store, api }) {
  const el = (id) => document.getElementById(id);
  const input = el("topicInput");
  const addBtn = el("topicAddBtn");
  const list = el("topicList");
  const count = el("topicCount");
  const empty = el("topicEmpty");

  // ── Aktionen ───────────────────────────────────
  async function act(fn) {
    try { store.applySnapshot(await fn()); }
    catch (e) { console.warn("[topics]", e.message); }
  }

  function addTopic() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const examId = store.state.settings.activeExamId;
    act(() => api.topics.create({ text, examId }));
    input.focus();
  }

  addBtn.addEventListener("click", addTopic);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addTopic(); }
  });

  // Event-Delegation: abhaken + löschen
  list.addEventListener("click", (e) => {
    const actBtn = e.target.closest("[data-act]");
    if (!actBtn) return;
    const row = actBtn.closest("[data-id]");
    if (!row) return;
    const topic = store.state.topics.find((t) => String(t.id) === row.dataset.id);
    if (!topic) return;
    if (actBtn.dataset.act === "toggle") act(() => api.topics.update(topic.id, { done: !topic.done }));
    else if (actBtn.dataset.act === "remove") act(() => api.topics.remove(topic.id));
  });

  // ── Rendering ──────────────────────────────────
  function visibleTopics() {
    const aid = store.state.settings.activeExamId;
    let topics = store.state.topics.slice();
    if (aid != null) topics = topics.filter((t) => t.examId === aid || t.examId == null);
    topics.sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;      // erledigte nach unten
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
    return topics;
  }

  function render() {
    const topics = visibleTopics();
    const total = topics.length;
    const done = topics.reduce((n, t) => n + (t.done ? 1 : 0), 0);

    count.textContent = `${done}/${total}`;
    empty.hidden = total > 0;

    if (!total) { list.innerHTML = ""; return; }

    list.innerHTML = topics.map((t) => {
      const doneCls = t.done ? " is-done" : "";
      return `<div class="topic-row${doneCls}" data-id="${t.id}">
        <button class="topic-check" data-act="toggle" aria-pressed="${t.done ? "true" : "false"}" title="${t.done ? "Als offen markieren" : "Als erledigt markieren"}">${t.done ? "✓" : ""}</button>
        <span class="topic-text">${escapeHtml(t.text)}</span>
        <button class="icon-btn topic-del" data-act="remove" title="Thema löschen">🗑</button>
      </div>`;
    }).join("");
  }

  store.subscribe(render);
  render();

  return {};
}
