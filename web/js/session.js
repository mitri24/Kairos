// Study Session — Vollbild-Fokusmodus: Timer-Rail + Dokument-Tabs.
//
// Früher war das ein „Links-raus"-Bildschirm: der Timer lief hier, gelernt wurde
// auf einer externen Seite in einem anderen Tab. Genau dieses Hin-und-Her war das
// Problem. Jetzt liegt links eine schmale Rail (Ring, Transport, Aufgabe, Teil-
// aufgaben, Capture — läuft immer weiter) und rechts eine Arbeitsfläche mit Tabs
// über ALLEM, was zur Aufgabe gehört: Task-Links, Themen-Links, Dateien und
// Karten aus der Bibliothek, angepinnte Referenzen.
//
// Ehrlich bleiben: eigene Dateien (/api/materials/:id/file, same-origin) und
// Karten liegen verlässlich im Tab. Externe Seiten dürfen das Einbetten
// verbieten (X-Frame-Options/CSP) — das ist von außen nicht erkennbar, deshalb
// liegt hinter jedem Frame ein „Extern öffnen"-Ausweg, wie im In-App-Viewer.
//
// Farben kommen komplett aus web/css/session.css (Token-Scope --ses-*), nicht
// mehr aus hartcodierten Hex-Werten — Akzent/Helligkeit/Kontrast greifen hier.
import { escapeHtml, safeUrl, prettyUrl, resourceIcon, pad2, dayKeyOf, PHASES, STATUS } from "/js/util.js";
// (FOCUS_SOURCES/collectDocs stehen weiter unten in dieser Datei.)
import { getPhaseDurationMs } from "/shared/pomodoro.js";
import { showToast } from "/js/toast.js";
import { createFocusTrap } from "/js/focusTrap.js";
import { icon, fileIcon } from "/js/icons.js";
import { getLang } from "/js/i18n.js";

const TXT = {
  de: {
    banner: "Fokus — bitte nicht stören",
    railShow: "Timer-Leiste einblenden (Alt+0)",
    railHide: "Timer-Leiste ausblenden (Alt+0)",
    pause: "Pause", resume: "Weiter", start: "Start",
    end: "Beenden",
    reset: "Zurücksetzen", skip: "Überspringen",
    remaining: "verbleibend", onBreak: "Pause", paused: "pausiert",
    focusBlock: "Fokusblock", breakBlock: "Pause",
    task: "Aufgabe",
    capturePh: "Was du nicht verstanden hast → wird eine Aufgabe",
    captureBtn: "Als Aufgabe festhalten",
    addTab: "Material hinzufügen",
    addLinkPh: "https:// … Link zum Lernen einfügen",
    addLinkBtn: "Link anfügen",
    addFileBtn: "Datei hochladen",
    addClose: "Schließen",
    srcBtn: "Welche Unterlagen?",
    srcTitle: "Was liegt hier bereit?",
    srcHint: "Nur was zur Aufgabe gehört. Du bestimmst, wie weit der Kreis reicht.",
    srcNone: "Nichts ausgewählt — schalte mindestens eine Quelle ein.",
    filteredTitle: "Nichts passt zur Auswahl",
    filteredBody: (n) => `${n} ${n === 1 ? "Dokument liegt" : "Dokumente liegen"} außerhalb der gewählten Quellen. Erweitere oben die Auswahl — oder häng der Aufgabe etwas Eigenes an.`,
    emptyTitle: "Noch nichts hinterlegt",
    emptyBody: "Zieh eine Datei hierher oder füge oben mit „+“ einen Link an. Dateien und Karten aus deiner Bibliothek erscheinen hier automatisch, wenn sie zum Thema, zur Prüfung oder zum Fach der Aufgabe passen.",
    noTaskTitle: "Keine Aufgabe aktiv",
    noTaskBody: "Wähl auf „Heute“ eine Aufgabe aus, dann liegen ihre Unterlagen hier bereit.",
    blockedTail: "lädt hier nicht?",
    blockedSub: "Manche Seiten verbieten das Einbetten. Dann hilft nur:",
    openExternal: "Extern öffnen",
    uploaded: (n) => `„${n}“ hinzugefügt`,
    linkAdded: "Link angefügt",
    endTitle: "Block wird früh beendet",
    endQ: (t) => `„${t}“ — was ist passiert?`,
    endQnone: "Was ist passiert?",
    endSub: "Keine Wertung — wähl, was passt, den Rest macht Kairos.",
    reasons: {
      done: ["Fertig — erledigt", "abhaken, Zeit gutschreiben"],
      break: ["Ich brauch eine Pause", "pausieren, später weiter"],
      hard: ["Gerade zu schwer", "mehr Zeit geben, später nochmal"],
      time: ["Keine Zeit mehr", "auf morgen schieben"],
    },
    toasts: {
      done: "Stark — gutgeschrieben und erledigt.",
      break: "Pause läuft — weiter, wenn du bereit bist.",
      hard: "Wir geben der Aufgabe mehr Zeit.",
      time: "Auf morgen verschoben.",
    },
  },
  en: {
    banner: "Focus — do not disturb",
    railShow: "Show timer rail (Alt+0)",
    railHide: "Hide timer rail (Alt+0)",
    pause: "Pause", resume: "Resume", start: "Start",
    end: "End session",
    reset: "Reset", skip: "Skip",
    remaining: "remaining", onBreak: "on break", paused: "paused",
    focusBlock: "Focus block", breakBlock: "Break",
    task: "Task",
    capturePh: "Note what you didn’t understand → becomes a task",
    captureBtn: "Capture as a task",
    addTab: "Add material",
    addLinkPh: "https:// … paste a link to study on",
    addLinkBtn: "Add link",
    addFileBtn: "Upload file",
    addClose: "Close",
    srcBtn: "Which material?",
    srcTitle: "What’s waiting here?",
    srcHint: "Only what belongs to the task. You decide how wide the circle goes.",
    srcNone: "Nothing selected — switch on at least one source.",
    filteredTitle: "Nothing matches the selection",
    filteredBody: (n) => `${n} ${n === 1 ? "document sits" : "documents sit"} outside the selected sources. Widen the selection above — or attach something to the task itself.`,
    emptyTitle: "Nothing attached yet",
    emptyBody: "Drop a file here or add a link with “+” above. Files and cards from your library show up automatically when they match the task’s topic, exam or subject.",
    noTaskTitle: "No active task",
    noTaskBody: "Pick a task on “Today” and its material will be waiting here.",
    blockedTail: "not loading here?",
    blockedSub: "Some sites block embedding. Only one way out:",
    openExternal: "Open externally",
    uploaded: (n) => `“${n}” added`,
    linkAdded: "Link added",
    endTitle: "Ending block early",
    endQ: (t) => `“${t}” — what happened?`,
    endQnone: "What happened?",
    endSub: "No judgement — pick what fits and Kairos handles the rest.",
    reasons: {
      done: ["Done — finished it", "mark complete, bank the time"],
      break: ["Need a break", "pause, resume when ready"],
      hard: ["Too hard right now", "give it more time & come back"],
      time: ["Out of time", "move it to tomorrow"],
    },
    toasts: {
      done: "Nice — banked and done.",
      break: "Break time — resume when ready.",
      hard: "We’ll give it more time.",
      time: "Moved to tomorrow.",
    },
  },
};
const T = () => TXT[getLang()] || TXT.de;

const LS_RAIL = "kairos_focus_rail"; // "0" = Rail eingeklappt
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; };

// ── Quellen: woher ein Dokument kommen darf ──────────────────────────────────
// Jede Quelle ist einzeln abschaltbar, denn „alles, was irgendwie da ist" ist
// im Fokus das Gegenteil von Fokus. Angepinntes hat KEINEN Bezug zur Aufgabe
// (es hängt am Referenz-Panel) und ist deshalb standardmäßig aus — sonst liegt
// im Streifen Stoff aus fremden Fächern.
export const FOCUS_SOURCES = [
  { id: "task",    de: "Aufgabe",     en: "Task",    deHint: "Links direkt an dieser Aufgabe",       enHint: "links attached to this task" },
  { id: "topic",   de: "Thema",       en: "Topic",   deHint: "Material des verknüpften Themas",      enHint: "material of the linked topic" },
  { id: "exam",    de: "Prüfung",     en: "Exam",    deHint: "Material dieser Prüfung",              enHint: "material of this exam" },
  { id: "subject", de: "Fach",        en: "Subject", deHint: "Material mit demselben Fach",          enHint: "material with the same subject" },
  { id: "pinned",  de: "Angepinntes", en: "Pinned",  deHint: "auch ohne Bezug zur Aufgabe",          enHint: "even without a link to the task" },
];
export const DEFAULT_FOCUS_SOURCES = { task: true, topic: true, exam: true, subject: true, pinned: false };
export const ALL_FOCUS_SOURCES = { task: true, topic: true, exam: true, subject: true, pinned: true };

export const focusSourcesOf = (state) => ({ ...DEFAULT_FOCUS_SOURCES, ...(state?.prefs?.focusSources || {}) });

// ── Unterlagen der Aufgabe einsammeln ────────────────────────────────────────
// Reihenfolge = Nähe zur Aufgabe; bei Dubletten gewinnt die nächstliegende
// Quelle. Gefiltert wird VOR dem Deduplizieren: schaltet man „Thema" ab, darf
// dasselbe Material weiterhin über „Fach" hereinkommen.
// Dedupliziert wird über die Herkunfts-ID UND die URL, damit derselbe Link nicht
// als Task-Ressource und Bibliotheks-Material doppelt im Tab-Streifen landet.
export function collectDocs(state, task, sources) {
  const src = { ...DEFAULT_FOCUS_SOURCES, ...(sources || {}) };
  const docs = [];
  const seenKey = new Set();
  const seenUrl = new Set();
  const add = (doc) => {
    if (!doc || seenKey.has(doc.key)) return;
    const u = doc.url ? doc.url.replace(/\/+$/, "").toLowerCase() : null;
    if (u && seenUrl.has(u)) return;
    seenKey.add(doc.key);
    if (u) seenUrl.add(u);
    docs.push(doc);
  };
  const fromResource = (r, from) => ({
    key: `r${r.id}`, kind: "link", src: from,
    title: r.title || prettyUrl(r.url), url: safeUrl(r.url), raw: r,
    primary: !!r.isPrimary,
  });
  const fromMaterial = (m, from) => ({
    key: `m${m.id}`, kind: m.kind, src: from, id: m.id,
    title: m.title, url: m.kind === "link" ? safeUrl(m.url) : null,
    mime: m.mime, content: m.content, raw: m,
  });

  if (task) {
    const mats = state.materials || [];
    if (src.task) {
      (state.resources || [])
        .filter((r) => String(r.taskId) === String(task.id))
        .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || (a.sortOrder || 0) - (b.sortOrder || 0))
        .forEach((r) => add(fromResource(r, "task")));
    }
    if (src.topic && task.topicId != null) {
      (state.resources || [])
        .filter((r) => r.topicId === task.topicId)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .forEach((r) => add(fromResource(r, "topic")));
      mats.filter((m) => m.topicId === task.topicId).forEach((m) => add(fromMaterial(m, "topic")));
    }
    if (src.exam && task.examId != null) {
      mats.filter((m) => m.examId === task.examId).forEach((m) => add(fromMaterial(m, "exam")));
    }
    if (src.subject && task.subject) {
      const want = task.subject.toLowerCase();
      mats.filter((m) => m.subject && m.subject.toLowerCase() === want).forEach((m) => add(fromMaterial(m, "subject")));
    }
  }

  if (src.pinned) {
    (state.materials || []).filter((m) => m.pinned).forEach((m) => add(fromMaterial(m, "pinned")));
  }
  return docs;
}

export function initSession({ store, api }) {
  const overlay = document.createElement("div");
  overlay.className = "session-overlay";
  overlay.hidden = true;
  const t0 = T();
  overlay.innerHTML = `
    <div class="session-topbar">
      <span class="session-topbar__dot"></span>
      <span class="session-topbar__label" id="sesBanner">${escapeHtml(t0.banner)}</span>
      <span class="session-topbar__r">
        <span class="session-btn session-btn--time" id="sesTimeTop" hidden>--:--</span>
        <button class="session-btn session-btn--icon" id="sesRail" type="button"></button>
        <button class="session-btn" id="sesPauseTop" type="button">${escapeHtml(t0.pause)}</button>
        <button class="session-btn session-btn--end" id="sesEnd" type="button">${escapeHtml(t0.end)}</button>
      </span>
    </div>
    <div class="session-body">
      <aside class="session-rail">
        <div class="session-focus">
          <div class="ring session-ring" id="sesRing" style="--frac:1">
            <div class="ring__hole">
              <div class="session-time" id="sesTime">--:--</div>
              <div class="session-sub" id="sesPhase">${escapeHtml(t0.remaining)}</div>
            </div>
          </div>
          <div class="session-controls">
            <button class="session-ctl" id="sesReset" type="button" title="${escapeHtml(t0.reset)}" aria-label="${escapeHtml(t0.reset)}">${icon("reset", { size: 17 })}</button>
            <button class="session-ctl session-ctl--primary" id="sesToggle" type="button"><span id="sesToggleIcon">${icon("pause", { size: 17 })}</span><span id="sesToggleLbl">${escapeHtml(t0.pause)}</span></button>
            <button class="session-ctl" id="sesSkip" type="button" title="${escapeHtml(t0.skip)}" aria-label="${escapeHtml(t0.skip)}">${icon("skip", { size: 17 })}</button>
          </div>
        </div>
        <div class="session-task">
          <div class="session-task__kicker" id="sesTaskKicker">${escapeHtml(t0.task)}</div>
          <div class="session-task__title" id="sesTaskTitle">${escapeHtml(t0.focusBlock)}</div>
          <div class="session-task__sub" id="sesTaskSub"></div>
          <div class="session-subs" id="sesSubs"></div>
        </div>
        <div class="session-capture">
          ${icon("mic", { cls: "mic" })}
          <input id="sesCapture" placeholder="${escapeHtml(t0.capturePh)}" maxlength="200" />
          <button class="session-capture__go" id="sesCaptureBtn" type="button" title="${escapeHtml(t0.captureBtn)}" aria-label="${escapeHtml(t0.captureBtn)}">${icon("plus", { size: 14 })}</button>
        </div>
      </aside>

      <section class="session-work">
        <div class="session-tabsbar">
          <div class="session-tabs" id="sesTabs" role="tablist"></div>
          <button class="session-srcbtn" id="sesSrcBtn" type="button" title="${escapeHtml(t0.srcBtn)}" aria-label="${escapeHtml(t0.srcBtn)}" aria-expanded="false">
            ${icon("settings", { size: 15 })}<span class="session-srcbtn__dot" id="sesSrcDot" hidden></span>
          </button>
          <div class="session-srcmenu" id="sesSrcMenu" hidden role="dialog" aria-label="${escapeHtml(t0.srcTitle)}"></div>
        </div>
        <div class="session-addbar" id="sesAddbar" hidden>
          <input type="text" id="sesAddUrl" placeholder="${escapeHtml(t0.addLinkPh)}" maxlength="600" />
          <button class="session-btn" id="sesAddLink" type="button">${escapeHtml(t0.addLinkBtn)}</button>
          <button class="session-btn" id="sesAddFile" type="button">${icon("paperclip", { size: 15 })}${escapeHtml(t0.addFileBtn)}</button>
          <button class="session-btn session-btn--icon" id="sesAddClose" type="button" title="${escapeHtml(t0.addClose)}" aria-label="${escapeHtml(t0.addClose)}">${icon("close", { size: 15 })}</button>
          <input type="file" id="sesFileInput" multiple hidden />
        </div>
        <div class="session-doc" id="sesDoc"></div>
      </section>
    </div>`;
  document.body.appendChild(overlay);

  const $ = (id) => overlay.querySelector("#" + id);
  const ring = $("sesRing");
  const timeEl = $("sesTime"), timeTop = $("sesTimeTop"), phaseEl = $("sesPhase");
  const toggleIcon = $("sesToggleIcon"), toggleLbl = $("sesToggleLbl");
  const titleEl = $("sesTaskTitle"), subEl = $("sesTaskSub"), subsEl = $("sesSubs");
  const tabsEl = $("sesTabs"), docEl = $("sesDoc");
  const srcBtn = $("sesSrcBtn"), srcDot = $("sesSrcDot"), srcMenu = $("sesSrcMenu");
  const addbar = $("sesAddbar"), addUrl = $("sesAddUrl"), fileInput = $("sesFileInput");
  const captureInput = $("sesCapture");

  let open = false;
  let railOpen = localStorage.getItem(LS_RAIL) !== "0";
  let activeKey = null;   // aktuell im Tab geöffnetes Dokument
  let lastTaskId = null;  // Aufgabenwechsel → Tabs neu aufsetzen
  let tabsSig = null;     // nur neu zeichnen, wenn sich wirklich etwas ändert
  let docSig = null;      // verhindert Frame-Reloads bei jedem Timer-Tick

  async function act(fn) { try { store.applySnapshot(await fn()); return true; } catch (e) { console.warn("[session]", e.message); return false; } }
  const activeTask = () => store.state.tasks.find((x) => x.active) || null;
  const sources = () => focusSourcesOf(store.state);
  const docs = () => collectDocs(store.state, activeTask(), sources());
  // Was die Auswahl gerade wegfiltert — Grundlage für Zähler und Hinweis.
  const allDocs = () => collectDocs(store.state, activeTask(), ALL_FOCUS_SOURCES);

  function show() {
    open = true;
    overlay.hidden = false;
    document.body.classList.add("session-open");
    applyRail();
    render();
    renderTime();
  }
  function hide() {
    open = false;
    overlay.hidden = true;
    document.body.classList.remove("session-open");
    // Frame entladen: ein unsichtbares iframe soll weder Video noch Netz halten.
    docEl.innerHTML = "";
    docSig = null;
  }
  function toggleTimer() {
    const s = store.state.timer.status;
    if (s === STATUS.RUNNING) return act(api.timer.pause);
    if (s === STATUS.PAUSED) return act(api.timer.resume);
    return act(api.timer.start);
  }
  function applyRail() {
    const x = T();
    overlay.classList.toggle("is-railhidden", !railOpen);
    timeTop.hidden = railOpen;
    const btn = $("sesRail");
    btn.innerHTML = icon(railOpen ? "chevronLeft" : "chevronRight", { size: 15 });
    btn.title = railOpen ? x.railHide : x.railShow;
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-expanded", railOpen ? "true" : "false");
  }
  function toggleRail() {
    railOpen = !railOpen;
    try { localStorage.setItem(LS_RAIL, railOpen ? "1" : "0"); } catch { /* privat */ }
    applyRail();
  }

  // ── Steuerung ──
  document.addEventListener("open-focus-session", show);
  $("sesToggle").addEventListener("click", toggleTimer);
  $("sesPauseTop").addEventListener("click", toggleTimer);
  $("sesReset").addEventListener("click", () => act(api.timer.reset));
  $("sesSkip").addEventListener("click", () => act(api.timer.skip));
  $("sesRail").addEventListener("click", toggleRail);
  $("sesEnd").addEventListener("click", openCancel);

  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape" && !document.querySelector(".sheet-overlay")) { hide(); return; }
    // Alt statt Cmd/Ctrl: Cmd+Ziffer gehört dem Browser (Tab-Wechsel) und lässt
    // sich nicht abfangen. e.code, damit Alt+1 auch auf Layouts greift, die
    // damit Sonderzeichen erzeugen.
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === "Digit0") { e.preventDefault(); toggleRail(); return; }
    const m = /^Digit([1-9])$/.exec(e.code);
    if (!m) return;
    const list = docs();
    const pick = list[Number(m[1]) - 1];
    if (pick) { e.preventDefault(); activeKey = pick.key; render(); }
  });

  // ── Beenden ohne Scham ──
  const REASON_KEYS = [
    { key: "done", ic: "check", cls: "done" },
    { key: "break", ic: "bulb", cls: "" },
    { key: "hard", ic: "question", cls: "" },
    { key: "time", ic: "arrowRight", cls: "" },
  ];
  function openCancel() {
    const x = T();
    const task = activeTask();
    const box = document.createElement("div");
    box.className = "sheet-overlay";
    box.innerHTML = `<div class="sheet-overlay__scrim"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(x.endTitle)}">
        <div class="sheet__kicker">${escapeHtml(x.endTitle)}</div>
        <div class="sheet__title">${task ? escapeHtml(x.endQ(task.text)) : escapeHtml(x.endQnone)}</div>
        <div class="sheet__sub">${escapeHtml(x.endSub)}</div>
        <div class="cancel-opts">
          ${REASON_KEYS.map((r) => {
            const [title, sub] = x.reasons[r.key];
            return `<button class="cancel-opt${r.cls ? ` cancel-opt--${r.cls}` : ""}" type="button" data-reason="${r.key}">
              <span class="cancel-opt__ic">${icon(r.ic, { size: 15 })}</span>
              <span><span class="cancel-opt__title">${escapeHtml(title)}</span><span class="cancel-opt__sub">${escapeHtml(sub)}</span></span></button>`;
          }).join("")}
        </div>
      </div>`;
    document.body.appendChild(box);
    const trap = createFocusTrap(box.querySelector(".sheet"), { initialFocus: () => box.querySelector("[data-reason]") });
    const close = () => { trap.release(); box.remove(); document.removeEventListener("keydown", esc); };
    function esc(ev) { if (ev.key === "Escape") { ev.stopPropagation(); close(); } }
    trap.activate();
    box.addEventListener("click", async (e) => {
      if (e.target.classList.contains("sheet-overlay__scrim")) return close();
      const r = e.target.closest("[data-reason]")?.dataset.reason;
      if (!r) return;
      if (store.state.timer.status === STATUS.RUNNING) await act(api.timer.pause); // Fokuszeit gutschreiben
      if (task) {
        if (r === "done") await act(() => api.tasks.update(task.id, { done: true }));
        else if (r === "hard") { const est = task.estMinutes || 25; await act(() => api.tasks.update(task.id, { estMinutes: Math.ceil((est * 1.2) / 5) * 5 })); }
        else if (r === "time") await act(() => api.tasks.update(task.id, { plannedDate: dayKeyOf(store.now() + 86_400_000) }));
      }
      if (r === "break") { await act(() => api.timer.phase("short-break")); await act(api.timer.start); }
      showToast({ type: "success", title: T().toasts[r] });
      close(); hide();
    });
    document.addEventListener("keydown", esc);
  }

  // ── Quick-Capture → neue Aufgabe ──
  function capture() {
    const v = captureInput.value.trim();
    if (!v) return;
    captureInput.value = "";
    const data = { text: v, plannedDate: dayKeyOf(store.now()) };
    const ex = store.state.settings.activeExamId;
    if (ex) data.examId = ex;
    act(() => api.tasks.create(data));
  }
  $("sesCaptureBtn").addEventListener("click", capture);
  captureInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); capture(); } });

  // ── Material anfügen (Link oder Datei) ──
  function openAddbar(on) {
    addbar.hidden = !on;
    if (on) addUrl.focus();
    render();
  }
  async function addLink() {
    const task = activeTask();
    const url = safeUrl(addUrl.value);
    if (!url) return;
    addUrl.value = "";
    // An die Aufgabe binden, wenn es eine gibt — sonst als Bibliotheks-Link.
    const ok = task
      ? await act(() => api.resources.create({ taskId: Number(task.id), url }))
      : await act(() => api.materials.create({ kind: "link", title: prettyUrl(url), url }));
    if (ok) { showToast({ type: "success", title: T().linkAdded }); openAddbar(false); }
  }
  async function uploadFiles(files) {
    const task = activeTask();
    const x = T();
    for (const file of files) {
      try {
        // Metadaten der Aufgabe mitgeben: dann taucht die Datei beim nächsten
        // Fokusblock zu diesem Thema/Fach von selbst wieder auf.
        const res = await api.materials.upload(file, {
          title: file.name,
          topicId: task?.topicId ?? undefined,
          examId: task?.examId ?? undefined,
          subject: task?.subject || undefined,
        });
        store.applySnapshot(res);
        // Frisch Hochgeladenes sofort öffnen (höchste ID = neuestes Material).
        const newest = (store.state.materials || []).reduce((a, m) => (!a || m.id > a.id ? m : a), null);
        if (newest) activeKey = `m${newest.id}`;
        showToast({ type: "success", title: x.uploaded(file.name) });
      } catch (e) { console.warn("[session]", e.message); }
    }
    openAddbar(false);
  }
  $("sesAddLink").addEventListener("click", addLink);
  addUrl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } });
  $("sesAddFile").addEventListener("click", () => fileInput.click());
  $("sesAddClose").addEventListener("click", () => openAddbar(false));
  fileInput.addEventListener("change", () => { uploadFiles([...fileInput.files]); fileInput.value = ""; });

  docEl.addEventListener("dragover", (e) => { e.preventDefault(); docEl.classList.add("is-dropping"); });
  docEl.addEventListener("dragleave", (e) => { if (e.target === docEl) docEl.classList.remove("is-dropping"); });
  docEl.addEventListener("drop", (e) => {
    e.preventDefault();
    docEl.classList.remove("is-dropping");
    if (e.dataTransfer?.files?.length) uploadFiles([...e.dataTransfer.files]);
  });

  tabsEl.addEventListener("click", (e) => {
    if (e.target.closest("#sesTabAdd")) { openAddbar(addbar.hidden); return; }
    const tab = e.target.closest("[data-doc]");
    if (!tab) return;
    activeKey = tab.dataset.doc;
    render();
  });

  // ── Quellen-Auswahl („welche Unterlagen gehören hierher?") ──
  // Die Zahlen stammen aus einem Durchlauf mit ALLEN Quellen — sie zeigen also,
  // was eine Quelle beisteuert, unabhängig davon, was gerade eingeschaltet ist.
  function renderSrcMenu() {
    const x = T();
    const on = sources();
    const counts = {};
    for (const d of allDocs()) counts[d.src] = (counts[d.src] || 0) + 1;
    const lang = getLang() === "en" ? "en" : "de";
    srcMenu.innerHTML = `
      <div class="session-srcmenu__head">${escapeHtml(x.srcTitle)}</div>
      <p class="session-srcmenu__hint">${escapeHtml(x.srcHint)}</p>
      ${FOCUS_SOURCES.map((s) => `
        <label class="session-srcrow${on[s.id] ? " is-on" : ""}">
          <input type="checkbox" data-src="${s.id}"${on[s.id] ? " checked" : ""} />
          <span class="session-srcrow__text">
            <span class="session-srcrow__name">${escapeHtml(lang === "en" ? s.en : s.de)}</span>
            <span class="session-srcrow__hint">${escapeHtml(lang === "en" ? s.enHint : s.deHint)}</span>
          </span>
          <span class="session-srcrow__n">${counts[s.id] || 0}</span>
        </label>`).join("")}
      ${Object.values(on).some(Boolean) ? "" : `<p class="session-srcmenu__warn">${escapeHtml(x.srcNone)}</p>`}`;
  }
  function openSrcMenu(open) {
    srcMenu.hidden = !open;
    srcBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) renderSrcMenu();
  }
  srcBtn.addEventListener("click", (e) => { e.stopPropagation(); openSrcMenu(srcMenu.hidden); });
  srcMenu.addEventListener("click", (e) => e.stopPropagation());
  srcMenu.addEventListener("change", (e) => {
    const box = e.target.closest("[data-src]");
    if (!box) return;
    const next = { ...sources(), [box.dataset.src]: box.checked };
    // Sofort sichtbar machen, ohne auf die Antwort des Servers zu warten:
    // die Prefs liegen im Snapshot, den act() gleich darüberlegt.
    store.state.prefs = { ...(store.state.prefs || {}), focusSources: next };
    render();
    renderSrcMenu();
    act(() => api.prefs.save({ focusSources: next }));
  });
  overlay.addEventListener("click", () => { if (!srcMenu.hidden) openSrcMenu(false); });

  subsEl.addEventListener("click", (e) => {
    const row = e.target.closest("[data-sub]");
    if (!row) return;
    const id = row.dataset.sub;
    const task = activeTask();
    const st = (task?.subtasks || []).find((s) => String(s.id) === String(id));
    if (st) act(() => api.subtasks.update(id, { done: !st.done }));
  });

  // ── Rendering ──
  function render() {
    if (!open) return;
    const x = T();
    const task = activeTask();
    const isBreak = store.state.timer.phase !== PHASES.FOCUS;

    if (String(task?.id ?? "") !== String(lastTaskId ?? "")) { lastTaskId = task?.id ?? null; activeKey = null; }

    // Rail: Aufgabe + Teilaufgaben
    titleEl.textContent = task ? task.text : (isBreak ? x.breakBlock : x.focusBlock);
    const subs = (task?.subtasks || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const doneN = subs.filter((s) => s.done).length;
    subEl.textContent = [task?.subject, subs.length ? `${doneN}/${subs.length}` : null].filter(Boolean).join(" · ");
    subsEl.innerHTML = subs.map((s) => `
      <button class="session-sub-row${s.done ? " is-done" : ""}" type="button" data-sub="${escapeHtml(String(s.id))}" aria-pressed="${s.done ? "true" : "false"}">
        <span class="session-sub-row__box">${icon("check", { size: 11 })}</span>
        <span class="session-sub-row__text">${escapeHtml(s.text)}</span>
      </button>`).join("");
    ring.classList.toggle("is-break", isBreak);

    // Arbeitsfläche: Tabs + Dokument
    const list = docs();
    if (activeKey && !list.some((d) => d.key === activeKey)) activeKey = null;
    if (!activeKey && list.length) activeKey = list[0].key;
    renderTabs(list);
    // Der Punkt am Quellen-Knopf meldet NUR, wenn die Auswahl gerade wirklich
    // etwas wegnimmt — ein Dauer-Signal würde man nach zwei Tagen übersehen.
    const hidden = Math.max(0, allDocs().length - list.length);
    srcDot.hidden = hidden === 0;
    srcBtn.title = hidden ? `${x.srcBtn} — ${hidden} ${getLang() === "en" ? "hidden" : "ausgeblendet"}` : x.srcBtn;
    renderDoc(list.find((d) => d.key === activeKey) || null, !!task, hidden);
    renderTime();
  }

  function docIcon(d) {
    if (d.kind === "file") return icon(fileIcon(d.mime), { size: 14 });
    if (d.kind === "card") return icon("card", { size: 14 });
    return resourceIcon(d.raw || d);
  }
  // Herkunft im Tooltip: erklärt, WARUM ein Dokument im Streifen liegt.
  function srcLabel(d) {
    const s = FOCUS_SOURCES.find((f) => f.id === d.src);
    return s ? (getLang() === "en" ? s.en : s.de) : "";
  }

  function renderTabs(list) {
    const x = T();
    const sig = JSON.stringify([list.map((d) => [d.key, d.title, d.kind]), activeKey, getLang()]);
    if (sig === tabsSig) return;
    tabsSig = sig;
    tabsEl.innerHTML = list.map((d, i) => {
      const hint = [srcLabel(d), i < 9 ? `Alt+${i + 1}` : null].filter(Boolean).join(" · ");
      return `<button class="session-tab${d.key === activeKey ? " is-active" : ""}" type="button" role="tab"
        aria-selected="${d.key === activeKey ? "true" : "false"}" data-doc="${escapeHtml(d.key)}" title="${escapeHtml(`${d.title} — ${hint}`)}">
        <span class="session-tab__ic">${docIcon(d)}</span>
        <span class="session-tab__name">${escapeHtml(d.title)}</span>
        ${d.kind === "link" ? `<span class="session-tab__ext">${icon("external", { size: 11 })}</span>` : ""}
      </button>`;
    }).join("") +
      `<button class="session-tab session-tab--add" id="sesTabAdd" type="button" title="${escapeHtml(x.addTab)}" aria-label="${escapeHtml(x.addTab)}">${icon("plus", { size: 15 })}</button>`;
  }

  // Der Frame wird NUR bei echtem Dokumentwechsel neu gesetzt — sonst würde jede
  // Sekunde (Timer-Tick → render) die Seite neu laden und die Leseposition
  // verlieren. Deshalb die Signatur statt eines pauschalen innerHTML.
  function renderDoc(d, hasTask, hidden = 0) {
    const x = T();
    const sig = d ? `${d.key}:${d.kind}:${d.url || ""}:${d.content || ""}` : `${hasTask ? "empty" : "notask"}:${hidden}`;
    if (sig === docSig) return;
    docSig = sig;

    if (!d) {
      // Leer ist nicht gleich leer: liegt Material NUR hinter der Quellenwahl,
      // muss das dastehen — sonst sucht man den Fehler bei der Aufgabe.
      const filtered = hasTask && hidden > 0;
      const title = filtered ? x.filteredTitle : hasTask ? x.emptyTitle : x.noTaskTitle;
      const body = filtered ? x.filteredBody(hidden) : hasTask ? x.emptyBody : x.noTaskBody;
      docEl.innerHTML = `<div class="session-doc__empty"><div class="session-doc__empty-inner">
        <div class="session-doc__empty-ic">${icon(filtered ? "settings" : "paperclip", { size: 34 })}</div>
        <h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></div></div>`;
      return;
    }

    if (d.kind === "card") {
      docEl.innerHTML = `<div class="session-doc__card"><div class="session-doc__card-inner">
        <h2>${escapeHtml(d.title)}</h2><pre>${escapeHtml(d.content || "")}</pre></div></div>`;
      return;
    }

    if (d.kind === "file") {
      const src = api.materials.fileUrl(d.id);
      const mime = d.mime || "";
      // Eigene Dateien nach Art behandeln, statt pauschal in einen Frame zu
      // stecken — Sicherheit und Darstellbarkeit hängen am Typ:
      //   Bild (auch SVG) → <img>: rendert zuverlässig und führt kein Skript aus.
      //   PDF            → Frame ohne sandbox: der eingebaute PDF-Betrachter
      //                    braucht ihn, und ein PDF kann in unserer Origin kein
      //                    Skript ausführen — hier ist nichts zu gewinnen.
      //   alles andere   → strenger sandbox OHNE allow-same-origin: ein
      //                    hochgeladenes HTML liefe sonst in unserer Origin und
      //                    käme an Sitzungs-Cookie und localStorage.
      if (/^image\//i.test(mime)) {
        docEl.innerHTML = `<img class="session-doc__img" src="${escapeHtml(src)}" alt="${escapeHtml(d.title)}" />`;
        return;
      }
      const sandbox = /pdf/i.test(mime) ? "" : ` sandbox="allow-scripts allow-popups allow-downloads"`;
      docEl.innerHTML = fallbackHtml(d.title, src, x) +
        `<iframe class="session-doc__frame" src="${escapeHtml(src)}" title="${escapeHtml(d.title)}"${sandbox} referrerpolicy="no-referrer"></iframe>`;
      return;
    }

    if (!d.url) { docEl.innerHTML = ""; return; }
    let host = "";
    try { host = new URL(d.url).hostname; } catch { /* darstellbar lassen */ }
    docEl.innerHTML = fallbackHtml(host || d.title, d.url, x) +
      `<iframe class="session-doc__frame" src="${escapeHtml(d.url)}" title="${escapeHtml(d.title)}"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer"></iframe>`;
  }

  // Liegt HINTER dem Frame: bleibt der Frame leer (X-Frame-Options), steht der
  // Ausweg schon da. data-ext-open hält den globalen In-App-Viewer davon ab,
  // genau diesen Rettungs-Link wieder einzufangen.
  function fallbackHtml(name, url, x) {
    return `<div class="session-doc__fallback"><div class="session-doc__fallback-inner">
      <p><b>${escapeHtml(name)}</b> ${escapeHtml(x.blockedTail)}</p>
      <p class="session-doc__fallback-sub">${escapeHtml(x.blockedSub)}</p>
      <a class="session-doc__ext" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" data-ext-open="1">${escapeHtml(x.openExternal)}${icon("external", { size: 13 })}</a>
    </div></div>`;
  }

  // Ring + Zeit jede Sekunde (aus store.state.timer.remainingMs, das main.js tickt).
  function renderTime() {
    if (!open) return;
    const x = T();
    const t = store.state.timer, s = store.state.settings;
    const total = getPhaseDurationMs(t.phase, s) || 1;
    const frac = Math.max(0, Math.min(1, t.remainingMs / total));
    ring.style.setProperty("--frac", String(frac));
    timeEl.textContent = mmss(t.remainingMs);
    timeTop.textContent = mmss(t.remainingMs);
    const running = t.status === STATUS.RUNNING;
    phaseEl.textContent = running
      ? `${t.phase === PHASES.FOCUS ? x.remaining : x.onBreak} · ${Math.round(total / 60000)} min`
      : (t.status === STATUS.PAUSED ? x.paused : x.remaining);
    toggleIcon.innerHTML = icon(running ? "pause" : "play", { size: 17 });
    toggleLbl.textContent = running ? x.pause : (t.status === STATUS.PAUSED ? x.resume : x.start);
    $("sesPauseTop").textContent = running ? x.pause : x.resume;
  }

  store.subscribe(render);
  return { tick: renderTime };
}
