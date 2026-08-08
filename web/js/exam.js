// Prüfungs-Modul: Chips oben (Auswahl der aktiven Prüfung + Hinzufügen) und
// die Countdown-Karte für die aktive Prüfung (Resttage, Sekunden-HMS, Pensum,
// Themen-Fortschritt). Liest store.state, schreibt ausschließlich über api.
import {
  daysUntil, toDatetimeLocal, fromDatetimeLocal, escapeHtml, subjectColor, formatHours,
  minToClock, formatMinutes, dayKeyOf,
} from "/js/util.js";
import { showToast } from "/js/toast.js";
import { confirmDialog } from "/js/dialog.js";
import { createFocusTrap } from "/js/focusTrap.js";
import { icon } from "/js/icons.js";
import { attachmentsFor, attachmentsHtml, initAttachments } from "/js/attachments.js";

const DAY_MS = 86_400_000;
const COUNTDOWN_HORIZON_DAYS = 60;   // Runway-Ring: mehr Tage übrig → vollerer Ring
const ENDSPURT_DAYS = 3;             // ab so wenigen Tagen bis zur Prüfung → Endspurt-Modus

// Themen nach Confidence gruppieren (solid / shaky / to-do) — ehrlich aus done/confidence.
function bucketTopics(topics) {
  const solid = [], shaky = [], todo = [];
  for (const t of topics) {
    const c = t.confidence || 0;
    if (t.done || c >= 3) solid.push(t);
    else if (c >= 1) shaky.push(t);
    else todo.push(t);
  }
  return { solid, shaky, todo };
}

// Menschlicher Countdown-Text aus Resttagen (statt h:m:s).
function weeksToGo(days) {
  if (days == null) return "–";
  if (days <= 0) return "today";
  if (days === 1) return "1 day to go";
  if (days < 14) return `${days} days to go`;
  const w = Math.round(days / 7);
  return `${w} weeks to go`;
}

export function initExam({ store, api }) {
  const el = (id) => document.getElementById(id);

  // ── DOM-Elemente ───────────────────────────────
  const examChips = el("examChips");
  const addExamBtn = el("addExamBtn");
  const examName = el("examName");
  const deleteExamBtn = el("deleteExamBtn");
  const examDaysNum = el("examDaysNum");
  const examHMS = el("examHMS");
  const examDate = el("examDate");
  const examColorPicker = el("examColorPicker"), examColorHex = el("examColorHex");
  const examWorkloadHours = el("examWorkloadHours");
  const topicChart = el("topicChart");
  const examRing = el("examRing");
  const examPensum = el("examPensum");
  const examRemainLabel = el("examRemainLabel");
  const examEmpty = el("examEmpty");
  const examIdentity = el("examIdentity");
  const examToolbar = el("examToolbar");
  const examGrid = el("examGrid");
  const examMeta = el("examMeta");
  // Dateien der Prüfung selbst (ohne Themenbezug) — derselbe Baustein wie an
  // Thema und Notiz, damit alles zu einem Fach an einem Ort liegt.
  const examFiles = el("examFiles");
  // Readiness-Karte („Will it fit?")
  const examFitPill = el("examFitPill"), examFitFill = el("examFitFill"), examFitNeed = el("examFitNeed");
  const examFitCushion = el("examFitCushion"), examFitNote = el("examFitNote"), examPlanNext = el("examPlanNext");
  // Endspurt-Modus
  const examEndspurt = el("examEndspurt");
  let endspurtOff = false, endspurtExamId = null;   // Nutzer kann in die volle Ansicht zurückschalten
  // Themen|Notizen|Lernroute-Umschalter (prüfungsbezogen). Die Lernroute ist kein
  // eigener Menüpunkt mehr — sie gehört zu genau einer Prüfung und lebt hier als Tab.
  const tabBtns = { topics: el("examTabTopics"), notes: el("examTabNotes"), path: el("examTabPath") };
  const panes = { topics: el("examTopicsPane"), notes: el("examNotesPane"), path: el("examPathPane") };
  for (const [tab, btn] of Object.entries(tabBtns)) {
    btn?.addEventListener("click", () => store.setUi({ examTab: tab }));
  }

  // ── Hilfen ─────────────────────────────────────
  function activeExam() {
    const { settings } = store.state;
    const exams = store.state.exams.filter((e) => !e.archived); // archivierte Prüfungen sind weg vom Tisch
    if (!exams.length) return null;
    return exams.find((e) => e.id === settings.activeExamId) || exams[0];
  }

  async function act(fn) {
    try { store.applySnapshot(await fn()); }
    catch (e) { console.warn("[exam]", e.message); }
  }

  // Die Prüfungsliste steht in JEDER Ansicht in der Seitenleiste. Ein Klick darf
  // deshalb nicht nur still die aktive Prüfung umschalten — er muss die Prüfung
  // auch öffnen, sonst wirkt der Eintrag von „Heute" aus wie tot. (nav.js hört
  // auf dieses Event.)
  const goExam = () => document.dispatchEvent(new CustomEvent("navigate", { detail: { view: "exam" } }));

  // ── Aktionen ───────────────────────────────────
  async function addExam() {
    const moduleButton = document.getElementById("navCustomAdd");
    if (moduleButton) { moduleButton.click(); return; }
    try {
      goExam();   // „+ Prüfung" steht auch in der Seitenleiste — die neue Prüfung gleich zeigen
      const prevIds = new Set(store.state.exams.map((e) => e.id));
      store.applySnapshot(await api.exams.create({
        name: "New module",
        date: store.now() + 14 * DAY_MS,
      }));
      const created = store.state.exams.find((e) => !prevIds.has(e.id));
      if (created) store.applySnapshot(await api.setSettings({ activeExamId: created.id }));
    } catch (e) { console.warn("[exam]", e.message); }
  }

  addExamBtn.addEventListener("click", addExam);

  // Endspurt-Modus umschalten (Fokus ⇄ volle Arbeitsfläche) + Themen auswählen.
  el("endspurtToggle")?.addEventListener("click", () => { endspurtOff = true; render(); });
  el("examEndspurtBtn")?.addEventListener("click", () => { endspurtOff = false; render(); });
  examPlanNext?.addEventListener("click", () => {
    const id = examPlanNext.dataset.id;
    if (id) store.setUi({ examTab: "topics", selectedTopicId: id });
  });
  examEndspurt?.addEventListener("click", (e) => {
    const row = e.target.closest("[data-act='select-topic']");
    if (!row) return;
    endspurtOff = true;
    store.setUi({ examTab: "topics", selectedTopicId: row.dataset.id });
  });

  // Chip-Klick (Delegation) → Prüfung öffnen und aktiv setzen.
  examChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".nav-sub__item");
    if (!chip || !examChips.contains(chip)) return;
    const ex = store.state.exams.find((x) => String(x.id) === chip.dataset.id);
    if (!ex) return;
    goExam();   // sofort sichtbar wechseln, das Umschalten läuft asynchron nach
    if (ex.id !== store.state.settings.activeExamId) act(() => api.setSettings({ activeExamId: ex.id }));
  });

  examName.addEventListener("change", () => {
    const ex = activeExam();
    if (ex) act(() => api.exams.update(ex.id, { name: examName.value.trim() }));
  });
  const saveExamColor = (raw) => {
    const ex = activeExam();
    const color = String(raw || "").trim().toUpperCase();
    if (!ex || !/^#[0-9A-F]{6}$/.test(color)) return;
    act(() => api.exams.update(ex.id, { color }));
  };
  examColorPicker?.addEventListener("change", () => saveExamColor(examColorPicker.value));
  examColorHex?.addEventListener("change", () => saveExamColor(examColorHex.value));

  examDate.addEventListener("change", () => {
    const ex = activeExam();
    if (ex) act(() => api.exams.update(ex.id, { date: fromDatetimeLocal(examDate.value) }));
  });

  examPensum.addEventListener("change", () => {
    const ex = activeExam();
    if (!ex) return;
    const hours = Math.max(0, Number(examPensum.value) || 0);
    act(() => api.exams.update(ex.id, { totalHours: hours }));
  });

  deleteExamBtn.addEventListener("click", async () => {
    const ex = activeExam();
    if (!ex) return;
    const nTopics = store.state.topics.filter((t) => t.examId === ex.id).length;
    // Prüfung löschen kaskadiert auf alle Themen (+ deren Links) → bewusste Rückfrage.
    // Der scham-freie, nicht-destruktive Weg bleibt „Wrap up" (archivieren).
    const ok = await confirmDialog({
      title: "Delete this module?",
      body: nTopics
        ? `“${ex.name || "Module"}” and its ${nTopics} topic${nTopics === 1 ? "" : "s"} (with their links) will be removed. Tasks stay but lose the module link. To keep the history, use “Wrap up” instead.`
        : `“${ex.name || "Module"}” will be removed.`,
      confirmLabel: "Delete exam",
    });
    if (ok) act(() => api.exams.remove(ex.id));
  });

  el("wrapExamBtn")?.addEventListener("click", openWrapUp);

  // ── Exam-Wrap-up + Retro (archivieren, Historie bleibt) ──
  function openWrapUp() {
    const ex = activeExam();
    if (!ex) return;
    const tasks = store.state.tasks.filter((t) => t.examId === ex.id);
    const topics = store.state.topics.filter((t) => t.examId === ex.id);
    const focusMs = tasks.reduce((n, t) => n + (t.spentMs || 0), 0);
    const solid = topics.filter((t) => t.done || (t.confidence || 0) >= 3).length;
    const shaky = topics.filter((t) => !t.done && (t.confidence || 0) === 1).length;
    const tasksDone = tasks.filter((t) => t.done).length;

    const overlay = document.createElement("div");
    overlay.className = "sheet-overlay sheet-overlay--green";
    overlay.innerHTML = `<div class="sheet-overlay__scrim"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Exam wrap-up">
        <div class="sheet__head">
          <div class="sheet__head-ic">${icon("trophy", { size: 28, stroke: 2 })}</div>
          <div><div class="sheet__kicker">Module finished</div><div class="sheet__title">${escapeHtml(ex.name || "Module")} — done ${icon("sparkle", { size: 20 })}</div></div>
        </div>
        <div class="sheet__tiles">
          <div class="sheet-tile"><div class="sheet-tile__val is-accent">${formatHours(focusMs)} h</div><div class="sheet-tile__lbl">focused</div></div>
          <div class="sheet-tile"><div class="sheet-tile__val">${solid}/${topics.length}</div><div class="sheet-tile__lbl">topics solid</div></div>
          <div class="sheet-tile"><div class="sheet-tile__val">${tasksDone}</div><div class="sheet-tile__lbl">tasks done</div></div>
        </div>
        <div class="sheet__carry">
          <div class="sheet__carry-title">Carry into your next exam</div>
          <ul>
            <li>${icon("check", { size: 13, stroke: 2.2 })}<span>${shaky ? `${shaky} topic${shaky === 1 ? "" : "s"} stayed shaky — start there earlier next time.` : "You reached solid on the topics you tracked — keep that rhythm."}</span></li>
            <li>${icon("check", { size: 13, stroke: 2.2 })}<span>${focusMs > 0 ? `You banked ${formatHours(focusMs)} h of focused time on this module.` : "Give tasks focus time next round to see where your hours go."}</span></li>
          </ul>
        </div>
        <p class="sheet__sub">Archiving keeps your focus history &amp; streak — it just clears this module from the top.</p>
        <div class="sheet__foot">
          <button class="btn btn--ghost" type="button" data-a="keep">Keep active</button>
          <button class="btn btn--primary" type="button" data-a="archive">Archive module</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const trap = createFocusTrap(overlay.querySelector(".sheet"), {});
    const close = () => { trap.release(); overlay.remove(); };
    trap.activate();
    overlay.addEventListener("click", async (e) => {
      if (e.target.classList.contains("sheet-overlay__scrim")) return close();
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "keep") close();
      else if (a === "archive") {
        await act(() => api.exams.update(ex.id, { archived: true }));
        showToast({ type: "success", title: `${ex.name || "Module"} archived`, body: "Your focus history stays." });
        close();
      }
    });
    document.addEventListener("keydown", function esc(ev) { if (ev.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
  }

  // ── Rendering ──────────────────────────────────
  function renderChips() {
    const { exams, settings } = store.state;
    const now = store.now();
    const active = activeExam();
    examChips.innerHTML = "";
    for (const ex of exams.filter((e) => !e.archived)) {
      const chip = document.createElement("button");
      chip.type = "button";
      const sc = subjectColor(ex.name);
      chip.className = `nav-sub__item ${sc.cls}`;
      if (active && ex.id === active.id) chip.classList.add("is-active");
      chip.dataset.id = String(ex.id);
      const days = ex.date ? daysUntil(ex.date, now) : null;
      const daysHtml = days === null ? "" : `<span class="nav-sub__days">${days}d</span>`;
      chip.innerHTML = `<span class="nav-sub__dot"></span><span class="nav-sub__name">${escapeHtml(ex.name || "Module")}</span>${daysHtml}`;
      examChips.appendChild(chip);
    }
  }

  const setFrac = (frac) => { if (examRing) examRing.style.setProperty("--frac", String(Math.max(0, Math.min(1, frac)))); };

  function renderCard() {
    const ex = activeExam();
    const hasExam = !!ex;

    // Ganze Identität/Toolbar/Inhalt vs. Leerzustand.
    if (examIdentity) examIdentity.hidden = !hasExam;
    if (examToolbar) examToolbar.hidden = !hasExam;
    if (examGrid) examGrid.hidden = !hasExam;
    if (examEmpty) examEmpty.hidden = hasExam;

    if (!hasExam) {
      if (document.activeElement !== examName) examName.value = "";
      examDaysNum.textContent = "–";
      examHMS.textContent = "–";
      setFrac(0);
      return;
    }

    const now = store.now();
    if (document.activeElement !== examName) examName.value = ex.name || "";
    const color = /^#[0-9a-f]{6}$/i.test(ex.color || "") ? ex.color.toUpperCase() : "#3E7D5E";
    if (examColorPicker && document.activeElement !== examColorPicker) examColorPicker.value = color;
    if (examColorHex && document.activeElement !== examColorHex) examColorHex.value = color;
    const days = ex.date ? daysUntil(ex.date, now) : null;
    examDaysNum.textContent = days == null ? "–" : String(days);
    examHMS.textContent = ex.date ? weeksToGo(days) : "–";
    setFrac(days == null ? 0 : days / COUNTDOWN_HORIZON_DAYS);
    if (document.activeElement !== examDate) examDate.value = ex.date ? toDatetimeLocal(ex.date) : "";
    if (examPensum && document.activeElement !== examPensum) {
      examPensum.value = String(ex.totalHours != null ? ex.totalHours : 0);
    }

    // Themen dieser Prüfung → EHRLICHE Workload-Darstellung (kein Zeit-/Schwierigkeits-Backend).
    const topics = store.state.topics.filter((t) => t.examId === ex.id);
    const total = topics.length;
    const done = topics.filter((t) => t.done).length;
    const open = total - done;
    if (examWorkloadHours) examWorkloadHours.textContent = (ex.totalHours && ex.totalHours > 0) ? `${ex.totalHours} h` : "—";
    if (examRemainLabel) examRemainLabel.textContent = total ? `${open} of ${total} topics left` : "No topics yet";
    if (topicChart) {
      // Balken nur aus echtem done/open-Zustand (erledigt = grün/voll, offen = grau/halb).
      topicChart.innerHTML = topics.slice(0, 8)
        .map((t) => `<div class="workload-bar${t.done ? " is-done" : ""}" style="height:${t.done ? 100 : 46}%"></div>`).join("");
    }

    // ── Confidence-Buckets → Status-Legende + Readiness-Karte (ehrliche Zahlen) ──
    const buckets = bucketTopics(topics);
    if (examMeta) examMeta.innerHTML =
      `<span class="exam-legend__item"><i style="background:var(--accent)"></i>${buckets.solid.length} solid</span>` +
      `<span class="exam-legend__item"><i style="background:var(--amber)"></i>${buckets.shaky.length} shaky</span>` +
      `<span class="exam-legend__item"><i style="background:#e0ddd3"></i>${buckets.todo.length} to do</span>`;
    renderReadiness(ex, days, total, buckets);

    // ── Endspurt-Modus: greift automatisch in den letzten Tagen (umschaltbar) ──
    if (endspurtExamId !== ex.id) { endspurtExamId = ex.id; endspurtOff = false; }
    const endspurtActive = days != null && days <= ENDSPURT_DAYS && !endspurtOff;
    if (examEndspurt) examEndspurt.hidden = !endspurtActive;
    if (examIdentity) examIdentity.hidden = endspurtActive;
    if (examToolbar) examToolbar.hidden = endspurtActive;
    if (examGrid) examGrid.hidden = endspurtActive;
    const endspurtBtn = el("examEndspurtBtn");
    if (endspurtBtn) endspurtBtn.hidden = !(days != null && days <= ENDSPURT_DAYS && endspurtOff);
    if (endspurtActive) renderEndspurt(ex, days, buckets);

    renderTabs();
  }

  // Readiness-Karte („Will it fit?") — STUNDEN-basiert: Pensum (Soll-Lernstunden)
  // gegen die verfügbaren Lernstunden bis zur Prüfung (Resttage × readiness-
  // angepasstes Tages-Soll) plus die bereits investierten Stunden. Ehrlicher
  // Rückfall auf Themen-Confidence, solange kein Pensum gesetzt ist; vergangene
  // Prüfungen zeigen keinen irreführenden „On track"-Countdown mehr.
  function renderReadiness(ex, days, total, buckets) {
    const round1 = (n) => Math.round(n * 10) / 10;
    const banked = store.state.tasks
      .filter((t) => t.examId === ex.id)
      .reduce((n, t) => n + (Number(t.spentMs) || 0), 0) / 3_600_000;   // Std bereits gelernt
    const pensum = Number(ex.totalHours) || 0;                          // Soll-Std (Pensum)
    // Readiness-angepasstes Tages-Soll aus dem Snapshot (server-autoritativ) — dieselbe
    // Zahl, die auch der Today-Ring nutzt; Fallback aufs gesetzte Ziel.
    const dailyH = Number(store.state.today?.effectiveGoalHours)
      || Number(store.state.settings.todayGoalHours) || 4;
    const past = ex.date != null && ex.date < store.now();

    let pill = "On track", cls = "is-ok", need = "", cushion = "";
    // Fortschrittsbalken: investierte vs. Soll-Std; ohne Pensum ehrlich Themen-Fortschritt.
    const frac = pensum > 0 ? Math.min(1, banked / pensum) : (total ? buckets.solid.length / total : 0);
    const doneLbl = pensum > 0 ? `${round1(banked)}/${pensum} h done` : "";

    if (past) {
      pill = "Past module"; cls = "is-muted"; need = doneLbl;
      cushion = "date passed · wrap up to archive";
    } else if (days === 0) {
      pill = "Module deadline"; cls = "is-crit"; need = doneLbl; cushion = "trust your prep";
    } else if (days == null) {
      pill = "No date yet"; cls = "is-muted"; need = doneLbl; cushion = "set a date to check fit";
    } else if (pensum <= 0) {
      pill = "Set Pensum"; cls = "is-muted"; cushion = "add target hours to check fit";
    } else {
      const remainingNeed = Math.max(0, pensum - banked);
      const available = days * dailyH;                 // verfügbare Lernstunden bis zur Prüfung
      const cush = available - remainingNeed;          // Puffer in Stunden
      if (cush >= dailyH) { pill = "Fits"; cls = "is-ok"; }
      else if (cush >= 0) { pill = "Tight"; cls = "is-warn"; }
      else { pill = "Over capacity"; cls = "is-crit"; }
      need = `${round1(remainingNeed)} h to go`;
      cushion = cush >= 0 ? `+${round1(cush)} h buffer` : `${round1(-cush)} h short`;
    }

    if (examFitPill) { examFitPill.textContent = pill; examFitPill.className = `exam-readiness__pill ${cls}`; }
    if (examFitFill) examFitFill.style.width = `${Math.round(frac * 100)}%`;
    if (examFitNeed) examFitNeed.textContent = need;
    if (examFitCushion) examFitCushion.textContent = cushion;
    if (examPlanNext) {
      const next = buckets.shaky[0] || buckets.todo[0] || null;
      if (next) { examPlanNext.hidden = false; examPlanNext.textContent = `Next up: ${next.text}`; examPlanNext.dataset.id = String(next.id); }
      else examPlanNext.hidden = true;
    }
  }

  // Endspurt-Ansicht: großes Fach-Heading, dunkle Tage-Karte, „Still shaky", Review-only, Sleep-Schutz.
  function renderEndspurt(ex, days, buckets) {
    const set = (id, txt) => { const e = el(id); if (e) e.textContent = txt; };
    set("endspurtName", ex.name || "Module");
    const hoursLeft = ex.date ? Math.max(0, Math.round((ex.date - store.now()) / 3_600_000)) : null;
    set("endspurtDays", days != null ? String(days) : "–");
    set("endspurtLeft", hoursLeft != null ? `days · ${hoursLeft} h left` : "days left");

    const notSolid = buckets.shaky.concat(buckets.todo);
    const totalTopics = buckets.solid.length + notSolid.length;
    set("endspurtShakyCount", `${notSolid.length} of ${totalTopics}`);
    const list = el("endspurtShakyList"), empty = el("endspurtShakyEmpty");
    if (empty) empty.hidden = notSolid.length > 0;
    if (list) list.innerHTML = notSolid.map((t) => {
      const c = t.confidence || 0, low = c <= 1;
      const on = low ? 1 : 2, col = low ? "var(--now)" : "var(--amber)";
      const dots = [0, 1, 2].map((i) => `<i style="background:${i < on ? col : "#eadfce"}"></i>`).join("");
      return `<div class="endspurt-row${low ? " is-low" : ""}" data-act="select-topic" data-id="${escapeHtml(String(t.id))}">
        <div class="endspurt-row__body"><div class="endspurt-row__name">${escapeHtml(t.text)}</div><div class="endspurt-row__sub">confidence ${low ? "low" : "medium"}</div></div>
        <span class="endspurt-dots">${dots}</span>
        <span class="endspurt-row__quiz">${icon("link", { size: 14 })}</span>
      </div>`;
    }).join("");
    const solidEl = el("endspurtSolid"), solidText = el("endspurtSolidText");
    if (solidEl) solidEl.hidden = buckets.solid.length === 0;
    if (solidText && buckets.solid.length) solidText.textContent = `${buckets.solid.length} topic${buckets.solid.length === 1 ? "" : "s"} solid — hidden to reduce noise`;

    const today = dayKeyOf(store.now());
    const blocks = store.state.tasks
      .filter((t) => t.examId === ex.id && t.scheduledMin != null && !t.done && (!t.plannedDate || t.plannedDate <= today))
      .sort((a, b) => a.scheduledMin - b.scheduledMin);
    const rl = el("endspurtReviewList"), re = el("endspurtReviewEmpty");
    if (re) re.hidden = blocks.length > 0;
    if (rl) rl.innerHTML = blocks.map((t, i) =>
      `<div class="endspurt-block${i === 0 ? " is-current" : ""}"><span class="endspurt-block__time">${minToClock(t.scheduledMin)}</span><span class="endspurt-block__name">${escapeHtml(t.text)}</span><span class="endspurt-block__dur">${t.estMinutes ? formatMinutes(t.estMinutes) : ""}</span></div>`
    ).join("");
  }

  function renderTabs() {
    // Gültig ist jeder Tab, für den es auch eine Fläche gibt — sonst zurück auf Themen.
    const wanted = store.state.ui.examTab;
    const tab = panes[wanted] ? wanted : "topics";
    for (const [k, btn] of Object.entries(tabBtns)) btn?.classList.toggle("is-active", k === tab);
    for (const [k, pane] of Object.entries(panes)) { if (pane) pane.hidden = k !== tab; }
  }

  // Nicht neu schreiben, während eine Datei über der Ablagefläche schwebt.
  function renderExamFiles() {
    if (!examFiles || examFiles.querySelector(".is-over")) return;
    const ex = activeExam();
    if (!ex) { examFiles.innerHTML = ""; return; }
    const list = attachmentsFor(store.state, { examId: ex.id });
    examFiles.innerHTML = attachmentsHtml(list, { id: "exam", label: "Files for this module" });
  }

  function render() {
    renderChips();
    renderCard();
    renderExamFiles();
  }

  // Tageswechsel-genauer Countdown (#examHMS/#examDaysNum), unabhängig vom Store-Emit.
  function tick() {
    const ex = activeExam();
    if (!ex || !ex.date) return;
    const days = daysUntil(ex.date, store.now());
    examHMS.textContent = weeksToGo(days);
    examDaysNum.textContent = String(days);
  }

  initAttachments(examFiles, {
    api,
    apply: (snap) => store.applySnapshot(snap),
    scope: () => {
      const ex = activeExam();
      return ex ? { examId: ex.id, subject: ex.name || undefined } : null;
    },
  });

  store.subscribe(render);
  render();
  return { tick };
}
