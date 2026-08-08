// Journal: Tagesrückblick (alles Gemachte, gesichert & wiederfindbar — für
// Schreibtypen) + aktiver Abruf nach der Vergessenskurve: erst aus dem Kopf
// AUFSCHREIBEN, dann aufdecken, dann selbst bewerten → SRS terminiert neu.
import { escapeHtml as esc, formatMinutes } from "/js/util.js";
import { getLang } from "/js/i18n.js";
import { showToast } from "/js/toast.js";
import { intervalLabel } from "/shared/srs.js";
import { openInApp } from "/js/webview.js";
import { icon, fileIcon } from "/js/icons.js";

const TXT = {
  de: {
    eyebrow: "Dein Fortschritt",
    title: "Journal",
    sub: "Alles, was du gemacht hast — festgehalten, gesichert und abrufbar.",
    recallTitle: "Aktiver Abruf",
    recallDue: (n) => n === 1 ? "1 Abruf fällig" : `${n} Abrufe fällig`,
    recallDone: "Nichts fällig — alles im Rhythmus.",
    recallQ: (t) => `Was weißt du noch über „${t}“?`,
    recallHint: "Schreib aus dem Kopf auf, was hängen geblieben ist — genau DAS festigt. Erst danach aufdecken.",
    reveal: "Aufdecken",
    saveAsNote: "Aufgeschriebenes als Notiz sichern",
    noMaterial: "Zu diesem Thema ist noch kein Material hinterlegt — vergleiche mit deinen Unterlagen.",
    gradeQ: "Wie gut war dein Abruf?",
    grades: ["Weg", "Schwer", "Gut", "Leicht"],
    nextIn: (label) => `Kommt ${label} zurück.`,
    addTitle: "In den Abruf aufnehmen",
    addTopic: "Thema wählen …",
    addBtn: "Aufnehmen",
    addCards: "Karten aus der Bibliothek lassen sich dort in den Abruf aufnehmen.",
    historyTitle: "Rückblick",
    today: "Heute",
    yesterday: "Gestern",
    focus: "Fokus",
    sessions: "Lernblöcke",
    noTask: "ohne Aufgabe",
    notes: "Notizen",
    materials: "Neues Material",
    reviews: "Abrufe",
    emptyDays: "Noch keine Einträge — starte einen Fokus-Block, und dein Tag erscheint hier.",
    noteSaved: "Abruf als Notiz gesichert",
    recallSubject: "Abruf",
  },
  en: {
    eyebrow: "Your progress",
    title: "Journal",
    sub: "Everything you did — captured, safe and recallable.",
    recallTitle: "Active recall",
    recallDue: (n) => n === 1 ? "1 recall due" : `${n} recalls due`,
    recallDone: "Nothing due — you’re in rhythm.",
    recallQ: (t) => `What do you still know about “${t}”?`,
    recallHint: "Write down from memory what stuck — THAT is what consolidates. Reveal only afterwards.",
    reveal: "Reveal",
    saveAsNote: "Save what you wrote as a note",
    noMaterial: "No material stored for this topic yet — compare with your own documents.",
    gradeQ: "How good was your recall?",
    grades: ["Gone", "Hard", "Good", "Easy"],
    nextIn: (label) => `Comes back ${label}.`,
    addTitle: "Add to recall queue",
    addTopic: "Pick a topic …",
    addBtn: "Add",
    addCards: "Cards from the library can be added to the recall queue there.",
    historyTitle: "Look back",
    today: "Today",
    yesterday: "Yesterday",
    focus: "Focus",
    sessions: "Focus blocks",
    noTask: "no task",
    notes: "Notes",
    materials: "New material",
    reviews: "Recalls",
    emptyDays: "No entries yet — start a focus block and your day will appear here.",
    noteSaved: "Recall saved as note",
    recallSubject: "Recall",
  },
};

// Icon je SRS-Note (0..3): weg → zäh → ok → mühelos.
const GRADE_ICONS = ["faceBlank", "faceFrown", "faceNeutral", "faceSmile"];

export function initJournal({ store, api }) {
  const root = document.getElementById("journalRoot");
  if (!root) return {};
  let days = null;          // Rückblick-Daten (lazy)
  let loading = false;
  let revealed = false;     // aktueller Abruf aufgedeckt?
  let lastReviewId = null;  // erkennt Item-Wechsel → Textfeld/Reveal zurücksetzen

  const T = () => TXT[getLang()] || TXT.de;
  async function act(fn) {
    try { store.applySnapshot(await fn()); return true; }
    catch (e) { console.warn("[journal]", e.message); return false; }
  }

  async function loadDays() {
    if (loading) return;
    loading = true;
    try { days = (await api.journal.get(30)).days; }
    catch (e) { console.warn("[journal]", e.message); days = days || []; }
    loading = false;
    render(store.state);
  }

  const visible = () => !(root.closest(".view")?.hidden);

  function dueReviews(s) {
    const today = s.today?.dayKey || "";
    return (s.reviews || []).filter((r) => r.dueKey && today && r.dueKey <= today);
  }
  function reviewSubject(s, r) {
    if (r.kind === "topic") {
      const t = (s.topics || []).find((x) => x.id === r.refId);
      return t ? { title: t.text, topic: t } : null;
    }
    const m = (s.materials || []).find((x) => x.id === r.refId);
    return m ? { title: m.title, material: m } : null;
  }

  function dayLabel(key, s) {
    const t = T();
    const todayKey = s.today?.dayKey;
    if (key === todayKey) return t.today;
    const d = new Date(key + "T12:00:00");
    const yesterday = new Date(d);
    if (todayKey) {
      const td = new Date(todayKey + "T12:00:00");
      yesterday.setTime(td.getTime() - 86_400_000);
      if (key === `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`) return t.yesterday;
    }
    return d.toLocaleDateString(getLang() === "de" ? "de-DE" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  }

  function renderRecall(s) {
    const t = T();
    const due = dueReviews(s);
    const head = `
      <div class="recall-head">
        <span class="recall-head__title">${icon("brain", { size: 18 })} ${esc(t.recallTitle)}</span>
        <span class="recall-head__count${due.length ? "" : " is-zero"}">${due.length ? esc(t.recallDue(due.length)) : `${icon("leaf", { size: 14 })} ${esc(t.recallDone)}`}</span>
      </div>`;

    // Aufnahme-Zeile: Themen, die noch nicht in der Warteschlange sind.
    const queued = new Set((s.reviews || []).filter((r) => r.kind === "topic").map((r) => r.refId));
    const addable = (s.topics || []).filter((x) => !queued.has(x.id));
    const addRow = addable.length ? `
      <div class="recall-add">
        <span>${esc(t.addTitle)}:</span>
        <select id="recallAddSel"><option value="">${esc(t.addTopic)}</option>
          ${addable.map((x) => `<option value="${x.id}">${esc(x.text)}</option>`).join("")}
        </select>
        <button class="btn btn--ghost btn--sm" data-a="add">${esc(t.addBtn)}</button>
      </div>` : "";

    if (!due.length) return `<div class="card recall-card recall-card--empty">${head}${addRow}</div>`;

    const r = due[0];
    if (r.id !== lastReviewId) { revealed = false; lastReviewId = r.id; }
    const subject = reviewSubject(s, r);
    if (!subject) {
      // Bezug gelöscht → Eintrag räumen (still) und weiter.
      act(() => api.reviews.remove(r.id));
      return `<div class="card recall-card">${head}</div>`;
    }

    // Aufgedeckt: Material des Themas bzw. Karteninhalt zeigen.
    let revealHtml = "";
    if (revealed) {
      if (subject.material) {
        revealHtml = `<div class="recall-reveal">
          <div class="recall-reveal__card"><b>${esc(subject.material.title)}</b><pre>${esc(subject.material.content || "")}</pre></div>
        </div>`;
      } else {
        const mats = (s.materials || []).filter((m) => m.topicId === subject.topic.id);
        revealHtml = `<div class="recall-reveal">
          ${mats.length ? mats.map((m) => m.kind === "card"
            ? `<div class="recall-reveal__card"><b>${esc(m.title)}</b><pre>${esc(m.content || "")}</pre></div>`
            : m.kind === "link"
              ? `<button class="recall-reveal__link" data-a="open" data-url="${esc(m.url || "")}" data-title="${esc(m.title)}">${icon("link")} ${esc(m.title)}</button>`
              : `<button class="recall-reveal__link" data-a="openfile" data-id="${m.id}" data-title="${esc(m.title)}" data-mime="${esc(m.mime || "")}">${icon(fileIcon(m.mime || ""))} ${esc(m.title)}</button>`
          ).join("") : `<p class="recall-reveal__none">${esc(t.noMaterial)}</p>`}
        </div>`;
      }
      revealHtml += `
        <div class="recall-grade">
          <span class="recall-grade__q">${esc(t.gradeQ)}</span>
          <div class="recall-grade__btns">
            ${t.grades.map((g, i) => `<button class="recall-grade__btn recall-grade__btn--g${i}" data-a="grade" data-id="${r.id}" data-grade="${i}">${icon(GRADE_ICONS[i])} ${esc(g)}</button>`).join("")}
          </div>
        </div>`;
    }

    return `
      <div class="card recall-card" data-review="${r.id}">
        ${head}
        <div class="recall-q">${esc(t.recallQ(subject.title))}</div>
        <p class="recall-hint">${esc(t.recallHint)}</p>
        <textarea class="recall-input" id="recallInput" rows="4" placeholder="…"></textarea>
        <div class="recall-actions">
          <label class="recall-savenote"><input type="checkbox" id="recallSaveNote" checked /> ${esc(t.saveAsNote)}</label>
          ${revealed ? "" : `<button class="btn btn--primary" data-a="reveal">${esc(t.reveal)}</button>`}
        </div>
        ${revealHtml}
        ${addRow}
      </div>`;
  }

  function renderDays(s) {
    const t = T();
    if (!days) return `<div class="journal-loading">…</div>`;
    if (!days.length) return `<p class="empty">${esc(t.emptyDays)}</p>`;
    return days.map((d) => `
      <div class="card journal-day">
        <div class="journal-day__head">
          <span class="journal-day__date">${esc(dayLabel(d.dayKey, s))}</span>
          ${d.focusMs > 0 ? `<span class="journal-day__focus">${icon("timer", { size: 14 })} ${esc(formatMinutes(d.focusMs / 60000))} ${esc(t.focus)}</span>` : ""}
        </div>
        ${d.sessions.length ? `
          <div class="journal-sect">
            <div class="journal-sect__label">${esc(t.sessions)}</div>
            ${d.sessions.map((x) => `<div class="journal-row">${icon("timer")} ${esc(x.taskText || t.noTask)} <span class="journal-row__meta">${esc(formatMinutes(x.focusMs / 60000))}</span></div>`).join("")}
          </div>` : ""}
        ${d.reviews.length ? `
          <div class="journal-sect">
            <div class="journal-sect__label">${esc(t.reviews)}</div>
            ${d.reviews.map((x) => {
              const subj = reviewSubject(s, { kind: x.kind, refId: x.refId });
              return `<div class="journal-row">${icon(GRADE_ICONS[x.grade ?? 2] || "faceNeutral")} ${esc(subj?.title || "—")}</div>`;
            }).join("")}
          </div>` : ""}
        ${d.notes.length ? `
          <div class="journal-sect">
            <div class="journal-sect__label">${esc(t.notes)}</div>
            ${d.notes.map((n) => `<div class="journal-row journal-row--note">${icon("edit")} ${esc(n.text.length > 140 ? n.text.slice(0, 140) + "…" : n.text)}</div>`).join("")}
          </div>` : ""}
        ${d.materials.length ? `
          <div class="journal-sect">
            <div class="journal-sect__label">${esc(t.materials)}</div>
            ${d.materials.map((m) => {
              // Der Journal-Payload kennt keinen MIME-Typ — den holen wir aus dem Store.
              const mime = m.kind === "file" ? ((s.materials || []).find((x) => x.id === m.id)?.mime || "") : "";
              const name = m.kind === "file" ? fileIcon(mime) : m.kind === "card" ? "card" : "link";
              return `<div class="journal-row">${icon(name)} ${esc(m.title)}</div>`;
            }).join("")}
          </div>` : ""}
      </div>`).join("");
  }

  function render(s) {
    if (!visible()) return;
    if (days === null && !loading) loadDays();
    const t = T();
    // Eingetipptes über Re-Renders retten.
    const prevInput = root.querySelector("#recallInput")?.value ?? "";
    const prevSave = root.querySelector("#recallSaveNote")?.checked ?? true;
    root.innerHTML = `
      <div class="view__head">
        <div>
          <div class="view__eyebrow">${esc(t.eyebrow)}</div>
          <h1 class="view__title">${esc(t.title)}</h1>
          <p class="journal-sub">${esc(t.sub)}</p>
        </div>
      </div>
      ${renderRecall(s)}
      <div class="journal-history">
        <div class="section-title"><span class="section-title__name">${esc(t.historyTitle)}</span></div>
        ${renderDays(s)}
      </div>`;
    const input = root.querySelector("#recallInput");
    if (input) input.value = prevInput;
    const save = root.querySelector("#recallSaveNote");
    if (save) save.checked = prevSave;
  }

  root.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-a]");
    if (!a) return;
    const t = T();
    if (a.dataset.a === "reveal") { revealed = true; render(store.state); return; }
    if (a.dataset.a === "open") { if (a.dataset.url) openInApp(a.dataset.url, { title: a.dataset.title }); return; }
    if (a.dataset.a === "openfile") { openInApp(api.materials.fileUrl(a.dataset.id), { title: a.dataset.title, sameOrigin: true, mime: a.dataset.mime || "" }); return; }
    if (a.dataset.a === "add") {
      const sel = root.querySelector("#recallAddSel");
      const id = Number(sel?.value);
      if (id) act(() => api.reviews.add("topic", id));
      return;
    }
    if (a.dataset.a === "grade") {
      const id = Number(a.dataset.id);
      const grade = Number(a.dataset.grade);
      const text = root.querySelector("#recallInput")?.value.trim() || "";
      const saveNote = root.querySelector("#recallSaveNote")?.checked;
      const subjTitle = a.closest(".recall-card") && reviewSubject(store.state, (store.state.reviews || []).find((r) => r.id === id) || {})?.title;
      const ok = await act(() => api.reviews.answer(id, grade));
      if (!ok) return;
      revealed = false;
      const updated = (store.state.reviews || []).find((r) => r.id === id);
      // Toast-Titel wird per textContent gesetzt — hier darf kein Markup stehen.
      showToast({ type: "success", title: t.nextIn(intervalLabel(updated?.intervalDays || 1, getLang())) });
      if (saveNote && text.length >= 3) {
        // Gespeicherter Notiztext: reiner Text, kein Icon-Markup.
        const noteText = subjTitle ? `${subjTitle}: ${text}` : text;
        const okNote = await act(() => api.notes.create({ text: noteText.slice(0, 600), subject: t.recallSubject }));
        if (okNote) showToast({ type: "success", title: t.noteSaved });
      }
      loadDays();
    }
  });

  store.subscribe(render);
  render(store.state);
  return {};
}
