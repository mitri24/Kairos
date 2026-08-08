// Prüfungs-Themen: Themen der aktiven Prüfung, hinzufügen, abhaken, löschen,
// auswählen (→ Detailspalte) und externe Lern-Ressourcen ("Learn this") verwalten.
// Der Hand-off: Kairos plant & timet — gelernt wird auf der VERLINKTEN Seite.
// EHRLICH: Themen tragen nur text/done — Schwierigkeit/Mastery gibt es (noch) nicht.
import { escapeHtml, safeUrl, prettyUrl, resourceIcon } from "/js/util.js";
import { showToast } from "/js/toast.js";
import { confirmDialog } from "/js/dialog.js";
import { icon } from "/js/icons.js";
import { attachmentsFor, attachmentsHtml, initAttachments } from "/js/attachments.js";

// Piktogramme kommen ausschließlich aus /js/icons.js (eine Quelle, currentColor).
const TRASH = icon("trash", { size: 14 });
const STAR = icon("star", { size: 14 });
// Ein Haken für beide Zustände des Toggles (offen = Vorschau, erledigt = Bestätigung):
// eine Konstante, damit die zwei Zweige nicht auseinanderlaufen können.
const CHECK = icon("check", { size: 12, stroke: 2.2 });

export function initTopics({ store, api }) {
  const el = (id) => document.getElementById(id);
  const input = el("topicInput");
  const addBtn = el("topicAddBtn");
  const list = el("topicList");
  const count = el("topicCount");
  const empty = el("topicEmpty");
  // Ressourcen-Panel (Detailspalte)
  const resList = el("examResourceList");
  const resEmpty = el("examResEmpty");
  const resCount = el("examResCount");
  const resName = el("examResName");
  const resUrl = el("examResUrl");
  const resAddBtn = el("examResAddBtn");
  // Dateien zum ausgewählten Thema (derselbe Baustein wie an Notiz und Prüfung).
  const topicFiles = el("examTopicFiles");

  async function act(fn) {
    try { store.applySnapshot(await fn()); return true; }
    catch (e) { console.warn("[topics]", e.message); return false; }
  }

  async function addTopic() {
    const text = input.value.trim();
    if (!text) return;
    const examId = store.state.settings.activeExamId;
    const ok = await act(() => api.topics.create({ text, examId }));
    if (!ok) return;               // erst nach Erfolg leeren
    input.value = "";
    input.focus();
  }

  // Themen-Löschen: mit Links → bewusste Rückfrage (Cascade); sonst Undo.
  async function removeTopic(topic) {
    const nRes = (store.state.resources || []).filter((r) => String(r.topicId) === String(topic.id)).length;
    if (nRes) {
      const ok = await confirmDialog({ title: "Delete this topic?", body: `“${topic.text}” and its ${nRes} link${nRes === 1 ? "" : "s"} will be removed.`, confirmLabel: "Delete topic" });
      if (!ok) return;
      await act(() => api.topics.remove(topic.id));
      return;
    }
    const snap = { text: topic.text, examId: topic.examId ?? undefined };
    const ok = await act(() => api.topics.remove(topic.id));
    if (!ok) return;
    showToast({
      type: "success", title: "Topic deleted", body: topic.text, timeout: 6000,
      action: { label: "Undo", onClick: () => act(() => api.topics.create(snap)) },
    });
  }

  addBtn.addEventListener("click", addTopic);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTopic(); } });

  list.addEventListener("click", (e) => {
    const actBtn = e.target.closest("[data-act]");
    if (!actBtn) return;
    const row = actBtn.closest("[data-id]");
    if (!row) return;
    const topic = store.state.topics.find((t) => String(t.id) === row.dataset.id);
    if (!topic) return;
    const a = actBtn.dataset.act;
    if (a === "toggle") act(() => api.topics.update(topic.id, { done: !topic.done }));
    else if (a === "remove") removeTopic(topic);
    else if (a === "select") store.setUi({ selectedTopicId: topic.id });
    else if (a === "conf") {
      const v = Number(actBtn.dataset.conf) || 0;
      const newv = (topic.confidence || 0) === v ? v - 1 : v; // gleiche Stufe erneut → eins runter
      act(() => api.topics.update(topic.id, { confidence: Math.max(0, newv) }));
    }
  });

  // ── Ressourcen: hinzufügen / löschen / öffnen ──
  async function addResource() {
    const selId = store.state.ui.selectedTopicId;
    if (selId == null) return;
    const url = safeUrl(resUrl && resUrl.value);
    if (!url) {
      showToast({ type: "warn", title: "That doesn’t look like a link", body: "Paste a full web address, e.g. https://…" });
      resUrl && resUrl.focus();
      return;
    }
    const title = (resName && resName.value.trim()) || "";
    const ok = await act(() => api.resources.create({ topicId: selId, url, title: title || undefined }));
    if (!ok) return;               // erst nach Erfolg leeren
    if (resName) resName.value = "";
    if (resUrl) resUrl.value = "";
    resUrl && resUrl.focus();
  }
  resAddBtn && resAddBtn.addEventListener("click", addResource);
  resUrl && resUrl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addResource(); } });
  resName && resName.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); resUrl && resUrl.focus(); } });
  resList && resList.addEventListener("click", (e) => {
    const primary = e.target.closest("[data-act='res-primary']");
    if (primary) {
      e.preventDefault();
      const id = primary.closest("[data-res-id]")?.getAttribute("data-res-id");
      const r = (store.state.resources || []).find((x) => String(x.id) === String(id));
      // Toggle: „primär" ist exklusiv je Thema (Backend räumt Geschwister auf).
      if (id) act(() => api.resources.update(id, { isPrimary: !(r && r.isPrimary) }));
      return;
    }
    const del = e.target.closest("[data-act='res-del']");
    if (!del) return;
    e.preventDefault();
    const id = del.closest("[data-res-id]")?.getAttribute("data-res-id");
    if (id) act(() => api.resources.remove(id));
  });

  function visibleTopics() {
    const aid = store.state.settings.activeExamId;
    let topics = store.state.topics.slice();
    if (aid != null) topics = topics.filter((t) => t.examId === aid || t.examId == null);
    topics.sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
    return topics;
  }

  function renderList() {
    const topics = visibleTopics();
    const total = topics.length;
    const done = topics.reduce((n, t) => n + (t.done ? 1 : 0), 0);
    if (count) count.textContent = `${done}/${total}`;
    if (empty) empty.hidden = total > 0;
    if (!total) { list.innerHTML = ""; return; }

    const selId = store.state.ui.selectedTopicId;
    list.innerHTML = topics.map((t) => {
      const sel = String(t.id) === String(selId) ? " is-selected" : "";
      const doneCls = t.done ? " is-done" : "";
      const conf = t.confidence || 0;
      const nRes = (store.state.resources || []).filter((r) => String(r.topicId) === String(t.id)).length;
      const CONF_WORD = ["not rated", "shaky", "getting there", "solid"];
      const subLabel = t.done ? "done" : (nRes ? `${nRes} link${nRes === 1 ? "" : "s"} · ${CONF_WORD[conf]}` : CONF_WORD[conf]);
      // Rechts: erledigt → grüne Check-Kachel; offen → klickbarer 3-Punkt-Konfidenz-Meter + Hover-Check.
      // Beide Zweige rendern DENSELBEN Haken (CHECK); der offene Zustand blendet
      // ihn per CSS zur blassen Vorschau ab — Markup und .topic-check-Regel bleiben so deckungsgleich.
      const right = t.done
        ? `<button class="topic-check is-done" data-act="toggle" title="Mark as open" aria-label="Mark as open">${CHECK}</button>`
        : `<span class="topic-conf lvl-${conf}" title="How well do you know this? (${conf}/3)">
             <i data-act="conf" data-conf="1"></i><i data-act="conf" data-conf="2"></i><i data-act="conf" data-conf="3"></i>
           </span>
           <button class="topic-check" data-act="toggle" title="Mark as done" aria-label="Mark as done">${CHECK}</button>`;
      return `<div class="topic-row${sel}${doneCls}" data-id="${t.id}">
        <span class="topic-row__handle" aria-hidden="true">${"<i></i>".repeat(6)}</span>
        <button class="topic-row__body" data-act="select">
          <span class="topic-text">${escapeHtml(t.text)}</span>
          <span class="topic-row__sub">${subLabel}</span>
        </button>
        ${right}
        <button class="topic-del" data-act="remove" title="Delete topic" aria-label="Delete topic">${TRASH}</button>
      </div>`;
    }).join("");
  }

  // Rechte Detailspalte: Titel + „Learn this"-Ressourcen (echt); Schätzung = Platzhalter.
  function renderDetail() {
    const emptyEl = el("examDetailEmpty"), bodyEl = el("examDetailBody");
    if (!emptyEl || !bodyEl) return;
    const aid = store.state.settings.activeExamId;
    const selId = store.state.ui.selectedTopicId;
    const topic = selId != null
      ? store.state.topics.find((t) => String(t.id) === String(selId) && (t.examId === aid || aid == null))
      : null;
    if (!topic) { emptyEl.hidden = false; bodyEl.hidden = true; return; }
    emptyEl.hidden = true; bodyEl.hidden = false;
    const title = el("examDetailTitle"), est = el("examDetailEst"), diff = el("examDetailDiff");
    if (title) title.textContent = topic.text;
    if (est) est.textContent = "Estimate —";
    if (diff) diff.textContent = topic.done ? "Done" : "Topic";
    renderResources(topic);
    renderTopicFiles(topic);
  }

  // Dateien am Thema. Nicht neu schreiben, während eine Datei über der Fläche
  // schwebt — sonst verschwindet das Ziel unter dem Cursor.
  function renderTopicFiles(topic) {
    if (!topicFiles || topicFiles.querySelector(".is-over")) return;
    const list = attachmentsFor(store.state, { topicId: topic.id });
    topicFiles.innerHTML = attachmentsHtml(list, { id: "topic", label: "Files for this topic" });
  }

  function renderResources(topic) {
    if (!resList) return;
    const items = (store.state.resources || [])
      .filter((r) => String(r.topicId) === String(topic.id))
      .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || (a.sortOrder || 0) - (b.sortOrder || 0));
    if (resCount) resCount.textContent = items.length ? `${items.length} link${items.length === 1 ? "" : "s"}` : "no links yet";
    if (resEmpty) resEmpty.hidden = items.length > 0;
    resList.innerHTML = items.map((r) => {
      const href = safeUrl(r.url);
      const nameHtml = escapeHtml(r.title || prettyUrl(r.url));
      const urlHtml = escapeHtml(prettyUrl(r.url));
      const link = href
        ? `<a class="res-item__link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">`
        : `<span class="res-item__link">`;
      const linkEnd = href ? "</a>" : "</span>";
      const open = href ? `<span class="res-item__open">Open ${icon("external", { size: 13 })}</span>` : "";
      return `<div class="res-item${r.isPrimary ? " is-primary" : ""}" data-res-id="${escapeHtml(String(r.id))}">
        ${link}
          <span class="res-item__icon">${resourceIcon(r)}</span>
          <span class="res-item__body">
            <span class="res-item__name">${nameHtml}</span>
            <span class="res-item__url">${urlHtml}</span>
          </span>
          ${open}
        ${linkEnd}
        <button class="res-item__star${r.isPrimary ? " is-primary" : ""}" data-act="res-primary" title="${r.isPrimary ? "Primary link — shown first" : "Make primary link"}" aria-label="${r.isPrimary ? "Primary link" : "Make primary link"}" aria-pressed="${r.isPrimary ? "true" : "false"}">${STAR}</button>
        <button class="res-item__del" data-act="res-del" title="Remove link" aria-label="Remove link">${TRASH}</button>
      </div>`;
    }).join("");
  }

  initAttachments(topicFiles, {
    api,
    apply: (snap) => store.applySnapshot(snap),
    scope: () => {
      const id = store.state.ui.selectedTopicId;
      if (id == null) return null;
      const topic = store.state.topics.find((t) => String(t.id) === String(id));
      return topic ? { topicId: topic.id, examId: topic.examId ?? undefined } : null;
    },
  });

  function render() { renderList(); renderDetail(); }

  store.subscribe(render);
  render();
  return {};
}
