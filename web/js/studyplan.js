// Lernziel → Themen & Ablauf.
//
// „Sag der App was du lernen willst, und sie baut dir Themen und einen Ablauf."
// Zwei Schritte, bewusst getrennt:
//   1. Ziel + optional eingefügter Text + Aufgabentypen der Prüfung
//   2. VORSCHLAG ansehen, bearbeiten, dann übernehmen
// Der Vorschlag schreibt nichts — erst „Übernehmen" legt Themen (und wahlweise
// Aufgaben mit Dauer/Schwierigkeit/Abhängigkeit) an.
//
// Zwei Quellen, eine Darstellung:
//   · KI (server/ai.js) — wenn eingewilligt und ein Anbieter eingerichtet ist
//   · Gliederungs-Erkennung (shared/outline.js) — deterministisch aus dem Text
// Welche gegriffen hat, steht sichtbar am Ergebnis. Kein stiller Rückfall.
import { escapeHtml, dayKeyOf, keyToMs } from "/js/util.js";
import { showToast } from "/js/toast.js";
import { createFocusTrap } from "/js/focusTrap.js";
import { icon } from "/js/icons.js";
import { getLang } from "/js/i18n.js";

const TXT = {
  de: {
    open: "Lernplan bauen",
    title: "Was willst du lernen?",
    sub: "Sag es in einem Satz. Hast du ein Modulhandbuch, ein Inhaltsverzeichnis oder eine Altklausur — füg sie unten ein.",
    goalPh: "z. B. Theoretische Informatik für die Klausur am 3.9.",
    materialLabel: "Text einfügen (optional)",
    materialPh: "Inhaltsverzeichnis, Modulhandbuch, Skript-Gliederung, Altklausur, eigene Stichpunkte …",
    typesLabel: "Aufgabentypen der Prüfung (optional)",
    typesPh: "z. B. Beweise führen, Automaten konstruieren, Rechenaufgaben",
    examLabel: "Gehört zu",
    examNew: "Neue Prüfung anlegen",
    examNamePh: "Name der Prüfung",
    build: "Themen vorschlagen",
    building: "Baue Vorschlag …",
    aiOn: (m) => `Nutzt deine KI (${m}). Dein Text wird dorthin gesendet.`,
    aiOff: "Keine KI eingerichtet — Kairos liest die Struktur deines eingefügten Textes.",
    aiOffNoText: "Keine KI eingerichtet — füge unten Text ein, damit Kairos die Gliederung lesen kann.",
    back: "Zurück",
    proposal: "Vorschlag",
    fromAi: (m) => `von deiner KI (${m})`,
    fromOutline: { heading: "aus den Überschriften deines Textes", numbered: "aus der Nummerierung deines Textes", chapter: "aus den Kapitelangaben deines Textes", bullet: "aus den Aufzählungspunkten deines Textes", lines: "aus den Zeilen deines Textes" },
    aiFailed: (why) => `KI nicht erreichbar (${why}) — stattdessen die Gliederung deines Textes.`,
    est: "Min",
    diff: ["Mittel (Standard)", "Leicht", "Mittel", "Schwer"],
    estDefault: "Ohne Angabe rechnet Kairos mit 25 Min — dein echtes Tempo lernt es aus erledigten Aufgaben.",
    needs: (n) => `braucht zuerst #${n}`,
    remove: "Entfernen",
    withTasks: "Auch Aufgaben anlegen — erst dadurch wird daraus ein planbarer Ablauf",
    apply: (n) => (n === 1 ? "1 Thema übernehmen" : `${n} Themen übernehmen`),
    applying: "Übernehme …",
    doneToast: "Lernplan angelegt",
    doneBody: (t, a) => (a ? `${t} Themen · ${a} Aufgaben` : `${t} Themen`),
    emptyResult: "Daraus konnte nichts gelesen werden. Formuliere das Ziel konkreter oder füge einen strukturierten Text ein.",
    headline: (n) => (n === 1 ? "1 Thema gefunden" : `${n} Themen gefunden`),
    headlineNone: "Nichts gefunden",
    close: "Schließen",
  },
  en: {
    open: "Build a study plan",
    title: "What do you want to learn?",
    sub: "Say it in one sentence. Got a syllabus, a table of contents or a past exam — paste it below.",
    goalPh: "e.g. Theory of computation for the exam on 3 Sept",
    materialLabel: "Paste text (optional)",
    materialPh: "Table of contents, syllabus, script outline, past exam, your own bullet points …",
    typesLabel: "Exam task types (optional)",
    typesPh: "e.g. write proofs, construct automata, calculations",
    examLabel: "Belongs to",
    examNew: "Create a new exam",
    examNamePh: "Exam name",
    build: "Suggest topics",
    building: "Building …",
    aiOn: (m) => `Uses your AI (${m}). Your text is sent there.`,
    aiOff: "No AI configured — Kairos reads the structure of your pasted text.",
    aiOffNoText: "No AI configured — paste text below so Kairos can read its outline.",
    back: "Back",
    proposal: "Proposal",
    fromAi: (m) => `from your AI (${m})`,
    fromOutline: { heading: "from your text’s headings", numbered: "from your text’s numbering", chapter: "from your text’s chapters", bullet: "from your text’s bullet points", lines: "from your text’s lines" },
    aiFailed: (why) => `AI unavailable (${why}) — using your text’s outline instead.`,
    est: "min",
    diff: ["Medium (default)", "Easy", "Medium", "Hard"],
    estDefault: "Without a number Kairos uses 25 min — it learns your real pace from finished tasks.",
    needs: (n) => `needs #${n} first`,
    remove: "Remove",
    withTasks: "Also create tasks — that’s what makes it a schedulable sequence",
    apply: (n) => (n === 1 ? "Add 1 topic" : `Add ${n} topics`),
    applying: "Adding …",
    doneToast: "Study plan created",
    doneBody: (t, a) => (a ? `${t} topics · ${a} tasks` : `${t} topics`),
    emptyResult: "Nothing readable in there. Make the goal more concrete or paste structured text.",
    headline: (n) => (n === 1 ? "1 topic found" : `${n} topics found`),
    headlineNone: "Nothing found",
    close: "Close",
  },
};
const T = () => TXT[getLang()] || TXT.de;

export function initStudyPlan({ store, api }) {
  const overlay = document.createElement("div");
  overlay.className = "sheet-overlay splan-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `<div class="sheet-overlay__scrim"></div>
    <div class="sheet splan" role="dialog" aria-modal="true" aria-label="Study plan">
      <div class="splan__body" id="splanBody"></div>
    </div>`;
  document.body.appendChild(overlay);
  const bodyEl = overlay.querySelector("#splanBody");
  const trap = createFocusTrap(overlay.querySelector(".splan"), { initialFocus: false });

  let step = "input";      // "input" | "proposal"
  let busy = false;
  let proposal = null;     // { source, structure, summary, topics[], aiError?, model? }
  let aiCfg = null;        // { provider, model, ready } — einmal geladen
  // Eingaben überleben den Schritt-Wechsel (Zurück verliert nichts).
  const form = { goal: "", material: "", taskTypes: "", examId: "", examName: "", examDate: "", createTasks: true };

  const esc = escapeHtml;

  function open() {
    step = "input";
    proposal = null;
    // Aus einer offenen Prüfung heraus gestartet → dorthin gehören die Themen.
    // Vorher stand die Auswahl immer auf „Neue Prüfung anlegen", was still eine
    // zweite Prüfung erzeugte und danach die aktive umschaltete.
    if (!form.examId) {
      const active = store.state.settings?.activeExamId;
      if (active != null && (store.state.exams || []).some((e) => e.id === active && !e.archived)) {
        form.examId = String(active);
      }
    }
    overlay.hidden = false;
    render();
    trap.activate();
    requestAnimationFrame(() => bodyEl.querySelector("[data-f='goal']")?.focus());
    // KI-Status nachladen (nur fürs ehrliche Hinweis-Label; Fehler = einfach keins).
    // Beim nächsten Öffnen erneut versuchen: ein einmaliger Netzfehler darf
    // nicht dauerhaft „keine KI eingerichtet" behaupten.
    if (!aiCfg || aiCfg.unknown) {
      api.ai.getConfig()
        .then((c) => { aiCfg = c; if (!overlay.hidden && step === "input") render(); })
        .catch(() => { aiCfg = { ready: false, unknown: true }; if (!overlay.hidden && step === "input") render(); });
    }
  }
  function close() {
    overlay.hidden = true;
    trap.release();
  }

  // ── Schritt 1: Eingabe ──────────────────────────
  function renderInput() {
    const t = T();
    const exams = (store.state.exams || []).filter((e) => !e.archived);
    const aiReady = !!aiCfg?.ready;
    const hint = aiReady
      ? t.aiOn(aiCfg.model || aiCfg.provider)
      : (form.material.trim() ? t.aiOff : t.aiOffNoText);

    bodyEl.innerHTML = `
      <div class="sheet__kicker">${esc(t.proposal)}</div>
      <div class="sheet__title">${esc(t.title)}</div>
      <div class="sheet__sub">${esc(t.sub)}</div>

      <textarea class="splan__goal" data-f="goal" rows="2" maxlength="2000"
        placeholder="${esc(t.goalPh)}">${esc(form.goal)}</textarea>

      <label class="splan__label">${esc(t.materialLabel)}</label>
      <textarea class="splan__material" data-f="material" rows="6" maxlength="20000"
        placeholder="${esc(t.materialPh)}">${esc(form.material)}</textarea>

      <label class="splan__label">${esc(t.typesLabel)}</label>
      <input type="text" class="text-input" data-f="taskTypes" maxlength="400"
        placeholder="${esc(t.typesPh)}" value="${esc(form.taskTypes)}" />

      <label class="splan__label">${esc(t.examLabel)}</label>
      <div class="splan__examrow">
        <select class="text-input" data-f="examId">
          <option value="">${esc(t.examNew)}</option>
          ${exams.map((e) => `<option value="${e.id}"${String(form.examId) === String(e.id) ? " selected" : ""}>${esc(e.name || "Exam")}</option>`).join("")}
        </select>
        ${form.examId ? "" : `
          <input type="text" class="text-input" data-f="examName" maxlength="80"
            placeholder="${esc(t.examNamePh)}" value="${esc(form.examName)}" />
          <input type="date" class="text-input splan__date" data-f="examDate" value="${esc(form.examDate)}" />`}
      </div>

      <p class="splan__hint">${icon(aiReady ? "sparkle" : "layers", { size: 14 })}<span>${esc(hint)}</span></p>

      <div class="sheet__foot splan__foot">
        <button class="btn btn--ghost" data-a="close">${esc(t.close)}</button>
        <button class="btn btn--primary" data-a="build"${busy ? " disabled" : ""}>
          ${busy ? esc(t.building) : esc(t.build)}
        </button>
      </div>`;
  }

  // ── Schritt 2: Vorschlag ────────────────────────
  function sourceLabel() {
    const t = T();
    if (proposal.source === "ai") return t.fromAi(proposal.model || "AI");
    return t.fromOutline[proposal.structure] || t.fromOutline.lines;
  }

  function renderProposal() {
    const t = T();
    const topics = proposal.topics;
    const keepN = topics.filter((tp) => String(tp.text || "").trim()).length;
    const rows = topics.map((tp, i) => `
      <li class="splan-row" data-i="${i}">
        <span class="splan-row__num">${i + 1}</span>
        <div class="splan-row__main">
          <input type="text" class="splan-row__text" data-e="text" value="${esc(tp.text)}" maxlength="160" />
          ${tp.why ? `<p class="splan-row__why">${esc(tp.why)}</p>` : ""}
          ${tp.practice ? `<p class="splan-row__why">${icon("target", { size: 12 })}${esc(tp.practice)}</p>` : ""}
          ${tp.dependsOn?.length ? `<p class="splan-row__dep">${icon("link", { size: 12 })}${esc(t.needs(tp.dependsOn.map((d) => d + 1).join(", #")))}</p>` : ""}
        </div>
        <span class="splan-row__num-in">
          <input type="number" data-e="estMinutes" min="5" max="600" step="5"
            value="${tp.estMinutes ?? ""}" placeholder="25" title="${esc(t.estDefault)}" /> ${esc(t.est)}
        </span>
        <select class="splan-row__diff" data-e="difficulty">
          ${[0, 1, 2, 3].map((d) => `<option value="${d || ""}"${(tp.difficulty ?? 0) === d ? " selected" : ""}>${esc(t.diff[d])}</option>`).join("")}
        </select>
        <button class="icon-btn icon-btn--bare splan-row__del" data-a="del" title="${esc(t.remove)}" aria-label="${esc(t.remove)}">${icon("close", { size: 15 })}</button>
      </li>`).join("");

    bodyEl.innerHTML = `
      <div class="sheet__kicker">${esc(t.proposal)} · ${esc(sourceLabel())}</div>
      <div class="sheet__title">${esc(proposal.summary || (topics.length ? t.headline(topics.length) : t.headlineNone))}</div>
      ${proposal.aiError ? `<p class="splan__warn">${icon("warning", { size: 14 })}${esc(t.aiFailed(proposal.aiError))}</p>` : ""}
      ${topics.length ? `<ol class="splan-list">${rows}</ol>` : `<p class="splan__warn">${esc(t.emptyResult)}</p>`}
      <label class="splan__check">
        <input type="checkbox" data-f="createTasks"${form.createTasks ? " checked" : ""} />
        <span>${esc(t.withTasks)}</span>
      </label>
      <div class="sheet__foot splan__foot">
        <button class="btn btn--ghost" data-a="back">${esc(t.back)}</button>
        <button class="btn btn--primary" data-a="apply"${busy || !keepN ? " disabled" : ""}>
          ${busy ? esc(t.applying) : esc(t.apply(keepN))}
        </button>
      </div>`;
  }

  const render = () => (step === "input" ? renderInput() : renderProposal());

  // ── Eingaben festhalten (Re-Render darf nichts verlieren) ──
  bodyEl.addEventListener("input", (e) => {
    const f = e.target.dataset.f;
    if (f) {
      form[f] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      // Der Hinweis sagt zu, was beim Klick passiert — er muss mitziehen, sobald
      // Text da ist. Gezielt nur diese Zeile ersetzen, damit der Cursor bleibt.
      if (f === "material" && !aiCfg?.ready) {
        const hintEl = bodyEl.querySelector(".splan__hint span");
        if (hintEl) hintEl.textContent = form.material.trim() ? T().aiOff : T().aiOffNoText;
      }
      return;
    }
    const row = e.target.closest("[data-i]");
    const key = e.target.dataset.e;
    if (!row || !key) return;
    const tp = proposal?.topics?.[Number(row.dataset.i)];
    if (!tp) return;
    if (key === "text") { tp.text = e.target.value; syncApplyLabel(); }
    else if (key === "estMinutes") tp.estMinutes = e.target.value === "" ? null : Number(e.target.value);
    else if (key === "difficulty") tp.difficulty = e.target.value === "" ? null : Number(e.target.value);
  });

  // Der Knopf muss zählen, was tatsächlich übernommen wird — leergemachte Zeilen
  // fallen weg. Nur die Beschriftung anfassen, kein Re-Render: sonst springt der
  // Cursor aus dem Feld, in dem gerade getippt wird.
  function syncApplyLabel() {
    const btn = bodyEl.querySelector("[data-a='apply']");
    if (!btn || busy) return;
    const n = (proposal?.topics || []).filter((tp) => String(tp.text || "").trim()).length;
    btn.textContent = T().apply(n);
    btn.disabled = n === 0;
  }
  // Prüfungswahl blendet die Felder für eine neue Prüfung ein/aus.
  bodyEl.addEventListener("change", (e) => {
    if (e.target.dataset.f === "examId") { form.examId = e.target.value; render(); }
  });

  bodyEl.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "close") return close();
    if (a === "back") { step = "input"; render(); return; }
    if (a === "build") return build();
    if (a === "apply") return apply();
    if (a === "del") {
      const i = Number(e.target.closest("[data-i]").dataset.i);
      proposal.topics.splice(i, 1);
      // Abhängigkeiten neu ausrichten: Verweise auf das entfernte Thema fallen
      // weg, spätere Indizes rutschen eine Position nach vorn.
      proposal.topics.forEach((tp, k) => {
        tp.order = k;
        tp.dependsOn = (tp.dependsOn || [])
          .filter((d) => d !== i)
          .map((d) => (d > i ? d - 1 : d))
          .filter((d) => d < k);
      });
      render();
    }
  });

  overlay.addEventListener("mousedown", (e) => { if (e.target.classList.contains("sheet-overlay__scrim")) close(); });
  document.addEventListener("keydown", (e) => { if (!overlay.hidden && e.key === "Escape") close(); });

  // ── Aktionen ────────────────────────────────────
  async function build() {
    if (busy) return;
    if (!form.goal.trim() && !form.material.trim()) {
      bodyEl.querySelector("[data-f='goal']")?.focus();
      return;
    }
    busy = true; render();
    try {
      const res = await api.plan.topics({
        goal: form.goal, material: form.material, taskTypes: form.taskTypes,
        examName: form.examName || null, examDate: form.examDate || null,
        // Ist bekannt, dass keine KI bereitsteht, gar nicht erst fragen: sonst
        // kommt ein Fehler zurück für etwas, das die Person nie angefordert hat.
        useAi: aiCfg ? !!aiCfg.ready : true,
        lang: getLang(),
      });
      proposal = res;
      step = "proposal";
    } catch (err) {
      // api.js hat den Fehler bereits als Toast gezeigt — hier nur im Schritt bleiben.
      console.warn("[studyplan]", err.message);
    } finally {
      busy = false; render();
    }
  }

  // Leergemachte Zeilen werden VOR dem Senden entfernt — und die
  // Abhängigkeits-Indizes dabei mitgezogen. Sonst zählt der Server anders als
  // die Anzeige: die Zeile fällt serverseitig weg, die Indizes der folgenden
  // rutschen, und es werden andere Voraussetzungen verdrahtet als angezeigt.
  function compactTopics(list) {
    const keep = list.map((tp) => !!String(tp.text || "").trim());
    // alter Index → neuer Index (null, wenn die Zeile wegfällt)
    const remap = [];
    let n = 0;
    for (const k of keep) remap.push(k ? n++ : null);
    return list
      .filter((_, i) => keep[i])
      .map((tp, k) => ({
        ...tp,
        order: k,
        dependsOn: (tp.dependsOn || [])
          .map((d) => remap[d])
          .filter((d) => d != null && d < k),
      }));
  }

  async function apply() {
    if (busy || !proposal?.topics?.length) return;
    busy = true; render();
    try {
      const res = await api.plan.applyTopics({
        examId: form.examId || null,
        examName: form.examName || null,
        examDate: form.examDate || null,
        createTasks: form.createTasks,
        material: form.material, taskTypes: form.taskTypes,
        topics: compactTopics(proposal.topics),
        lang: getLang(),
      });
      store.applySnapshot(res);
      const t = T();
      const a = res.applied || {};
      showToast({ type: "success", title: t.doneToast, body: t.doneBody(a.topics || 0, a.tasks || 0), timeout: 6000 });
      close();
      // Direkt dorthin, wo das Ergebnis liegt.
      if (a.examId != null) {
        await api.setSettings({ activeExamId: a.examId }).then((s) => store.applySnapshot(s)).catch(() => {});
      }
      document.dispatchEvent(new CustomEvent("navigate", { detail: { view: "exam" } }));
    } catch (err) {
      console.warn("[studyplan]", err.message);
    } finally {
      busy = false;
      if (!overlay.hidden) render();
    }
  }

  // Öffnen von überall: <button data-open-studyplan> oder das Event.
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-open-studyplan]")) { e.preventDefault(); open(); }
  });
  document.addEventListener("open-studyplan", open);

  document.addEventListener("langchange", () => { if (!overlay.hidden) render(); });
  return {};
}
