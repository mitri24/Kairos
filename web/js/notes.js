// Notizen-Modul. Eine Notiz ist ein DOKUMENT: Titel, Fließtext in Markdown und
// eigene Dateien — wie eine Seite in Notion, nur schlanker und offline-fähig.
//
// Zwei Zustände in der Ansicht: Übersicht (Filter + Schnellnotiz + Karten) ODER
// ein geöffnetes Dokument (ui.openNoteId). Dazu wie bisher die prüfungsbezogenen
// Notizen im Exam-Tab und die angepinnte Notiz auf „Today". Liest ausschließlich
// store.state und schreibt über api.
//
// Im Dokument wird beim Tippen automatisch gespeichert (entprellt). Beim Neuaufbau
// durch einen Snapshot werden fokussierte Felder NIE überschrieben — sonst würde
// einem der Cursor unter den Fingern wegspringen.
import {
  escapeHtml, subjectColor, dayKeyOf, keyToMs, formatDayShort, weekdayName,
} from "/js/util.js";
import { showToast } from "/js/toast.js";
import { icon } from "/js/icons.js";
import { confirmDialog } from "/js/dialog.js";
import { renderMarkdown, firstLine, excerpt, excerptBody } from "/js/markdown.js";
import { attachmentsFor, attachmentsHtml, initAttachments } from "/js/attachments.js";

const DAY_MS = 86_400_000;
const SAVE_DEBOUNCE_MS = 700;

export function initNotes({ store, api }) {
  const el = (id) => document.getElementById(id);

  // ── DOM (persistente Shell) ─────────────────────
  // Notes-Ansicht
  const notesListWrap = el("notesList");
  const notesFilters = el("notesFilters");
  const noteInput = el("noteInput");
  const noteSubject = el("noteSubject");
  const noteSubjectDot = el("noteSubjectDot");
  const notePinBtn = el("notePinBtn");
  const noteAddBtn = el("noteAddBtn");
  const noteNewDocBtn = el("noteNewDocBtn");
  const notesGrid = el("notesGrid");
  const notesEmpty = el("notesEmpty");
  // Dokument-Ansicht
  const noteDoc = el("noteDoc");
  const docBack = el("noteDocBack");
  const docTitle = el("noteDocTitle");
  const docSubject = el("noteDocSubject");
  const docDot = el("noteDocDot");
  const docExam = el("noteDocExam");
  const docStamp = el("noteDocStamp");
  const docBody = el("noteDocBody");
  const docRender = el("noteDocRender");
  const docFiles = el("noteDocFiles");
  const docSaved = el("noteDocSaved");
  const docPin = el("noteDocPin");
  const docDel = el("noteDocDel");
  const docWrite = el("noteDocWrite");
  const docRead = el("noteDocRead");
  // Exam-Notizen-Pane
  const examNoteInput = el("examNoteInput");
  const examNoteAddBtn = el("examNoteAddBtn");
  const examNotesList = el("examNotesList");
  const examNotesEmpty = el("examNotesEmpty");
  // Angepinnte Notizen haben KEINE eigene Karte auf „Today" mehr — sie liegen
  // zusammen mit den angepinnten Materialien in der Pinnwand-Schublade
  // (web/js/library.js, initRefPanel). Ein Pin, ein Ort.

  let newPin = false;      // lokales Pin-Flag für die zu erstellende Notiz
  let docMode = "write";   // Dokument: schreiben oder lesen
  let pending = {};        // noch nicht geschriebene Feldänderungen
  let saveTimer = null;

  // ── Aktionen ────────────────────────────────────
  // Liefert true bei Erfolg. api.js toastet Netz-/HTTP-Fehler bereits; wir
  // geben den Erfolg zurück, damit Aufrufer Eingaben erst DANACH leeren.
  async function act(fn) {
    try { store.applySnapshot(await fn()); return true; }
    catch (e) { console.warn("[notes]", e.message); return false; }
  }
  // data-id ist String, note.id ggf. Zahl → immer über String vergleichen.
  const noteById = (id) => store.state.notes.find((n) => String(n.id) === String(id));
  const openNote = () => {
    const id = store.state.ui.openNoteId;
    return id != null ? noteById(id) : null;
  };
  // Anzeigename: eigener Titel, sonst die erste sinnvolle Zeile des Textes.
  const docLabel = (note) => (note.title || firstLine(note.text) || "Untitled");

  async function addNote() {
    const text = noteInput.value.trim();
    if (!text) return;
    const subject = noteSubject.value.trim();
    const pinned = newPin;
    // Erst speichern, dann leeren — bei Fehlschlag bleibt der Text erhalten.
    const ok = await act(() => api.notes.create({ text, subject, examId: null, pinned }));
    if (!ok) return;
    noteInput.value = "";
    noteSubject.value = "";
    newPin = false;
    syncComposeControls();
    noteInput.focus();
  }

  // Leeres Dokument anlegen und direkt öffnen (der Notion-Weg: erst die Seite,
  // dann der Inhalt). Die neue ID ist die einzige, die vorher noch nicht da war.
  async function newDocument() {
    const before = new Set(store.state.notes.map((n) => String(n.id)));
    const ok = await act(() => api.notes.create({ title: "Untitled", text: "" }));
    if (!ok) return;
    const created = store.state.notes.find((n) => !before.has(String(n.id)));
    if (!created) return;
    docMode = "write";
    store.setUi({ openNoteId: created.id });
    requestAnimationFrame(() => { docTitle?.focus(); docTitle?.select(); });
  }

  async function addExamNote() {
    const text = examNoteInput.value.trim();
    if (!text) return;
    const examId = store.state.settings.activeExamId;
    if (examId == null) {                    // ohne aktive Prüfung nicht zuordenbar
      showToast({ type: "warn", title: "Pick an exam first", body: "Select an active exam to attach this note to it." });
      return;
    }
    const ok = await act(() => api.notes.create({ text, examId }));
    if (!ok) return;
    examNoteInput.value = "";
    examNoteInput.focus();
  }

  // Notiz → Aufgabe für HEUTE anlegen (Notiz bleibt bestehen).
  async function planNote(note) {
    if (!note) return;
    const label = docLabel(note);
    const before = new Set(store.state.tasks.map((t) => String(t.id)));
    const ok = await act(() => api.tasks.create({
      text: label,
      subject: note.subject || undefined,
      plannedDate: dayKeyOf(store.now()),
      examId: note.examId || undefined,
    }));
    if (!ok) return;                          // bei Fehlschlag NICHT wegnavigieren
    // Undo wie überall sonst: die eben angelegte Aufgabe ist die einzige neue ID.
    const created = store.state.tasks.find((t) => !before.has(String(t.id)));
    showToast({
      type: "success", title: "Added to today", body: label, timeout: 6000,
      action: created ? { label: "Undo", onClick: () => act(() => api.tasks.remove(created.id)) } : undefined,
    });
    // Nur wechseln, wenn man nicht ohnehin schon auf Today steht.
    if (document.getElementById("viewToday")?.hidden !== false) {
      document.dispatchEvent(new CustomEvent("navigate", { detail: { view: "today" } }));
    }
  }

  // Löschen mit Wiederherstellung (Undo) — die Notiz wird sofort neu angelegt.
  // Hängen Dateien am Dokument, gehen die MIT und lassen sich nicht zurückholen:
  // dann lieber vorher fragen als hinterher ein wirkungsloses „Undo" anbieten.
  async function deleteNote(note) {
    if (!note) return;
    const label = docLabel(note);
    const files = attachmentsFor(store.state, { noteId: note.id });
    if (files.length) {
      const sure = await confirmDialog({
        title: "Delete this document?",
        body: `“${label}” and its ${files.length} file${files.length === 1 ? "" : "s"} will be removed. Files can’t be restored.`,
        confirmLabel: "Delete",
      });
      if (!sure) return;
    }
    const snap = {
      title: note.title || null, text: note.text,
      subject: note.subject || "", examId: note.examId ?? null, pinned: !!note.pinned,
    };
    const ok = await act(() => api.notes.remove(note.id));
    if (!ok) return;
    if (String(store.state.ui.openNoteId) === String(note.id)) store.setUi({ openNoteId: null });
    showToast({
      type: "success", title: "Note deleted", body: label, timeout: 6000,
      action: files.length ? undefined : { label: "Undo", onClick: () => act(() => api.notes.create(snap)) },
    });
  }

  // ── Automatisches Speichern (entprellt) ─────────
  const setSaved = (text) => { if (docSaved) docSaved.textContent = text; };

  function queueSave(id, patch) {
    pending = { ...pending, ...patch };
    setSaved("Saving…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      const body = pending;
      pending = {};
      const ok = await act(() => api.notes.update(id, body));
      setSaved(ok ? "Saved" : "Not saved");
    }, SAVE_DEBOUNCE_MS);
  }

  // Beim Schließen sofort schreiben statt auf den Timer zu warten.
  async function flushSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    const id = store.state.ui.openNoteId;
    const body = pending;
    pending = {};
    if (id == null || !Object.keys(body).length) return;
    const ok = await act(() => api.notes.update(id, body));
    setSaved(ok ? "Saved" : "Not saved");
  }

  function closeDoc() {
    flushSave();
    setSaved("");
    store.setUi({ openNoteId: null });
  }

  // ── Compose-Steuerelemente (client-only) ────────
  function syncComposeControls() {
    if (noteSubjectDot) noteSubjectDot.style.background = subjectColor(noteSubject.value).color;
    if (notePinBtn) {
      notePinBtn.setAttribute("aria-pressed", newPin ? "true" : "false");
      notePinBtn.classList.toggle("is-on", newPin);
    }
  }

  // ── Handler (einmalig, Event-Delegation) ────────
  noteAddBtn?.addEventListener("click", addNote);
  noteNewDocBtn?.addEventListener("click", newDocument);
  // Textarea: Enter = Zeilenumbruch, ⌘/Ctrl+Enter = speichern.
  noteInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addNote(); }
  });
  noteSubject?.addEventListener("input", syncComposeControls);
  notePinBtn?.addEventListener("click", () => { newPin = !newPin; syncComposeControls(); });

  examNoteAddBtn?.addEventListener("click", addExamNote);
  examNoteInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addExamNote(); }
  });

  // Filter-Chips: „All notes" (null) oder ein Fach.
  notesFilters?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn || !notesFilters.contains(btn)) return;
    const val = btn.getAttribute("data-filter");
    store.setUi({ notesFilter: val ? val : null });
  });

  // ── Dokument: Bedienung ─────────────────────────
  docBack?.addEventListener("click", closeDoc);
  docTitle?.addEventListener("input", () => {
    const id = store.state.ui.openNoteId;
    if (id != null) queueSave(id, { title: docTitle.value.trim() });
  });
  // Enter im Titel springt in den Text (wie in Notion), statt nichts zu tun.
  docTitle?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); docBody?.focus(); }
  });
  docBody?.addEventListener("input", () => {
    const id = store.state.ui.openNoteId;
    if (id != null) queueSave(id, { text: docBody.value });
  });
  docSubject?.addEventListener("input", () => {
    const id = store.state.ui.openNoteId;
    if (docDot) docDot.style.background = subjectColor(docSubject.value).color;
    if (id != null) queueSave(id, { subject: docSubject.value.trim() });
  });
  docExam?.addEventListener("change", () => {
    const id = store.state.ui.openNoteId;
    if (id != null) queueSave(id, { examId: docExam.value ? Number(docExam.value) : null });
  });
  docPin?.addEventListener("click", () => {
    const note = openNote();
    if (note) act(() => api.notes.update(note.id, { pinned: !note.pinned }));
  });
  docDel?.addEventListener("click", () => deleteNote(openNote()));
  docWrite?.addEventListener("click", () => { docMode = "write"; render(); docBody?.focus(); });
  docRead?.addEventListener("click", () => { docMode = "read"; render(); });
  // Escape: erst aus dem Feld heraus, dann das Dokument schließen.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !noteDoc || noteDoc.hidden) return;
    const a = document.activeElement;
    if (a && noteDoc.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { a.blur(); return; }
    closeDoc();
  });

  // Dateien am Dokument (derselbe Baustein wie an Prüfung und Thema).
  initAttachments(docFiles, {
    api,
    apply: (snap) => store.applySnapshot(snap),
    scope: () => {
      const note = openNote();
      return note ? { noteId: note.id, subject: note.subject || undefined } : null;
    },
  });

  // Karten-Aktionen (open/pin/del/plan) + „New note"-Kachel — für beide Grids.
  function onGridClick(e) {
    const actBtn = e.target.closest("[data-act]");
    if (!actBtn) return;
    const action = actBtn.getAttribute("data-act");
    if (action === "focus-compose") { noteInput?.focus(); return; }
    const card = actBtn.closest("[data-id]");
    if (!card) return;
    const note = noteById(card.getAttribute("data-id"));
    if (!note) return;
    if (action === "open") { docMode = "write"; return store.setUi({ openNoteId: note.id }); }
    if (action === "pin") return act(() => api.notes.update(note.id, { pinned: !note.pinned }));
    if (action === "del") return deleteNote(note);
    if (action === "plan") return planNote(note);
  }
  notesGrid?.addEventListener("click", onGridClick);
  examNotesList?.addEventListener("click", onGridClick);

  // ── Labels ──────────────────────────────────────
  // „Wie lange her": Today / Yesterday / Wochentag / Datum.
  function relDay(ts, now) {
    if (!ts) return "";
    const ck = dayKeyOf(ts), tk = dayKeyOf(now);
    if (ck === tk) return "Today";
    const diff = Math.round((keyToMs(tk) - keyToMs(ck)) / DAY_MS);
    if (diff === 1) return "Yesterday";
    if (diff >= 2 && diff <= 6) return weekdayName(ck);   // „Monday"
    return formatDayShort(ck);                             // „Mon, 07/07"
  }

  // ── Templates ───────────────────────────────────
  // Piktogramme kommen ausschließlich aus icons.js (dieselbe Pin-Zeichnung wie
  // in der Bibliothek — Notes und Library liegen in der Navigation nebeneinander).

  function noteCard(note) {
    const sc = subjectColor(note.subject);
    const pinned = !!note.pinned;
    const files = attachmentsFor(store.state, { noteId: note.id }).length;
    const eyebrow = pinned
      ? `<span class="note-card__pinned-label">${icon("pin", { size: 13, cls: "pin" })}Pinned</span>`
      : `<span class="note-card__eyebrow">${escapeHtml(relDay(note.updatedAt || note.createdAt, store.now()))}</span>`;
    const subj = note.subject
      ? `<span class="note-card__subj">${escapeHtml(note.subject)}</span>`
      : `<span class="note-card__nosub">no subject</span>`;
    const clip = files
      ? `<span class="note-card__files" title="${files} file${files === 1 ? "" : "s"}">${icon("paperclip", { size: 12 })}${files}</span>`
      : "";
    // „plan it" nur auf der angepinnten Karte (wie im Design).
    const plan = pinned
      ? `<button type="button" class="note-card__plan" data-act="plan" title="Plan as a task">${icon("arrowRight", { size: 13 })}plan it</button>`
      : "";
    // Ohne eigenen Titel IST die erste Textzeile die Überschrift — sie darf im
    // Auszug direkt darunter nicht ein zweites Mal stehen.
    const body = note.title ? excerpt(note.text) : excerptBody(note.text);
    return `<article class="note-card ${sc.cls}${pinned ? " note-card--pinned" : ""}" data-id="${escapeHtml(String(note.id))}">
      <div class="note-card__top">
        ${eyebrow}
        <div class="note-card__actions">
          <button type="button" class="note-card__icon" data-act="pin" aria-pressed="${pinned ? "true" : "false"}" title="${pinned ? "Unpin note" : "Pin note"}">${icon("pin", { size: 15 })}</button>
          <button type="button" class="note-card__icon note-card__icon--danger" data-act="del" title="Delete note">${icon("trash", { size: 15 })}</button>
        </div>
      </div>
      <button type="button" class="note-card__open" data-act="open" title="Open document">
        <span class="note-card__title">${escapeHtml(docLabel(note))}</span>
        ${body ? `<span class="note-card__text">${escapeHtml(body)}</span>` : ""}
      </button>
      <div class="note-card__foot">${subj}${clip}${plan}</div>
    </article>`;
  }

  function newTile() {
    return `<button type="button" class="note-tile" data-act="focus-compose" title="Write a new note">
      ${icon("plus", { size: 16, cls: "plus", stroke: 2 })}
      <span class="note-tile__label">New note</span>
    </button>`;
  }

  // Grid neu aufbauen und dabei Scroll (+ evtl. fokussiertes data-guard-Feld) erhalten.
  function rebuild(container, html) {
    if (!container) return;
    const a = document.activeElement;
    const guard = a && container.contains(a) ? a.getAttribute("data-guard") : null;
    let sel = null;
    if (guard) { try { sel = [a.selectionStart, a.selectionEnd]; } catch { /* keine Selektion */ } }
    const scroll = container.scrollTop;
    container.innerHTML = html;
    container.scrollTop = scroll;
    if (guard) {
      const next = container.querySelector(`[data-guard="${guard}"]`);
      if (next) { next.focus(); if (sel) { try { next.setSelectionRange(sel[0], sel[1]); } catch { /* ignore */ } } }
    }
  }

  // ── Teil-Renderer ───────────────────────────────
  function distinctSubjects(notes) {
    const out = [], seen = new Set();
    for (const n of notes) {
      const sub = (n.subject || "").trim();
      if (!sub) continue;
      const key = sub.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(sub);
    }
    return out;
  }

  function renderFilters(s) {
    if (!notesFilters) return;
    const active = s.ui.notesFilter;
    let h = `<button type="button" class="notes-filter${active ? "" : " is-active"}" data-filter="">All notes</button>`;
    for (const sub of distinctSubjects(s.notes)) {
      const sc = subjectColor(sub);
      const on = active && active.toLowerCase() === sub.toLowerCase();
      h += `<button type="button" class="notes-filter ${sc.cls}${on ? " is-active" : ""}" data-filter="${escapeHtml(sub)}">`
        + `<span class="dot"></span>${escapeHtml(sub)}</button>`;
    }
    notesFilters.innerHTML = h;
  }

  function renderMainGrid(s) {
    if (!notesGrid) return;
    const active = s.ui.notesFilter;
    const filtered = active
      ? s.notes.filter((n) => (n.subject || "").toLowerCase() === active.toLowerCase())
      : s.notes;
    const has = filtered.length > 0;
    if (notesEmpty) notesEmpty.hidden = has;
    // Bei Inhalt: Karten + „New note"-Kachel; leer: nur die Leernachricht.
    rebuild(notesGrid, has ? filtered.map(noteCard).join("") + newTile() : "");
  }

  // Ein Feld nur setzen, wenn es NICHT gerade bearbeitet wird.
  function setField(input, value) {
    if (!input || document.activeElement === input) return;
    if (input.value !== value) input.value = value;
  }

  function renderDoc(note, s) {
    setField(docTitle, note.title || "");
    setField(docSubject, note.subject || "");
    setField(docBody, note.text || "");
    if (docDot) docDot.style.background = subjectColor(note.subject).color;

    if (docExam && document.activeElement !== docExam) {
      const opts = [`<option value="">No exam</option>`].concat(
        s.exams.filter((e) => !e.archived).map((e) =>
          `<option value="${escapeHtml(String(e.id))}">${escapeHtml(e.name || "Exam")}</option>`)
      );
      docExam.innerHTML = opts.join("");
      docExam.value = note.examId != null ? String(note.examId) : "";
    }

    if (docStamp) {
      const stamp = relDay(note.updatedAt || note.createdAt, store.now());
      docStamp.textContent = note.updatedAt ? `edited ${stamp.toLowerCase()}` : stamp;
    }
    if (docPin) {
      docPin.setAttribute("aria-pressed", note.pinned ? "true" : "false");
      docPin.classList.toggle("is-on", !!note.pinned);
    }

    const reading = docMode === "read";
    docWrite?.classList.toggle("is-active", !reading);
    docRead?.classList.toggle("is-active", reading);
    if (docBody) docBody.hidden = reading;
    if (docRender) {
      docRender.hidden = !reading;
      if (reading) {
        docRender.innerHTML = note.text?.trim()
          ? renderMarkdown(note.text)
          : `<p class="empty">Nothing written yet.</p>`;
      }
    }

    if (docFiles) {
      // Nicht neu schreiben, während gerade eine Datei über der Fläche schwebt.
      if (!docFiles.querySelector(".is-over")) {
        const list = attachmentsFor(s, { noteId: note.id });
        docFiles.innerHTML = attachmentsHtml(list, { id: "note", label: "Files in this document" });
      }
    }
  }

  function renderExamNotes(s) {
    if (!examNotesList) return;
    const aid = s.settings.activeExamId;
    const list = aid == null ? [] : s.notes.filter((n) => n.examId != null && String(n.examId) === String(aid));
    if (examNotesEmpty) examNotesEmpty.hidden = list.length > 0;
    rebuild(examNotesList, list.map(noteCard).join(""));
  }

  // ── Render ──────────────────────────────────────
  function render() {
    const s = store.state;
    const note = openNote();
    // Ist die geöffnete Notiz verschwunden (gelöscht, anderes Gerät) → zurück zur Liste.
    if (s.ui.openNoteId != null && !note) { store.setUi({ openNoteId: null }); return; }

    if (notesListWrap) notesListWrap.hidden = !!note;
    if (noteDoc) noteDoc.hidden = !note;

    if (note) {
      renderDoc(note, s);
    } else {
      syncComposeControls();   // Compose bleibt client-only, aber konsistent halten
      renderFilters(s);
      renderMainGrid(s);
    }
    renderExamNotes(s);
  }

  store.subscribe(render);
  render();
  return {};
}
