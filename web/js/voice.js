// Sprach-Capture: Mikro (oder „Hey“-Dauerlauschen solange das Sheet offen ist) →
// deutscher Parser (shared/voiceParse.js) → editierbare Vorschau mit Pace-
// Vorschlag + Lernmaterial-Match (shared/learnOptions.js) → Aufgaben anlegen →
// Tag automatisch neu planen. Web Speech API; ohne Support wird der Button
// ausgeblendet (ehrlich statt kaputt).
import { parseVoiceCapture } from "/shared/voiceParse.js";
import { findLearnOptions } from "/shared/learnOptions.js";
import { suggestEstimate } from "/shared/pace.js";
import { t, getLang } from "/js/i18n.js";
import { escapeHtml, dayKeyOf, keyToMs, minToClock, clockToMin, safeUrl, resourceIcon, prettyUrl } from "/js/util.js";
import { showToast } from "/js/toast.js";
import { createFocusTrap } from "/js/focusTrap.js";
import { icon } from "/js/icons.js";

// Piktogramme kommen ausschließlich aus /js/icons.js (eine Quelle, currentColor).
const MIC_SVG = icon("mic", { size: 24 });

export function initVoice({ store, api }) {
  const btn = document.getElementById("voiceBtn");
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!btn) return {};
  if (!SR) { btn.hidden = true; return {}; }

  const sheet = buildSheet();
  document.body.appendChild(sheet.overlay);
  const trap = createFocusTrap(sheet.overlay.querySelector(".voice"), { initialFocus: false });

  let rec = null;
  let listening = false;
  let heyMode = false;
  let drafts = [];              // [{ ...Draft, estSuggestion, learn, topicId, examId }]
  let busy = false;

  const todayKey = () => dayKeyOf(store.now());

  async function act(fn) {
    try { const res = await fn(); store.applySnapshot(res); return res; }
    catch (e) { console.warn("[voice]", e.message); return null; }
  }

  // ── Aufnahme ─────────────────────────────────────
  function startRec() {
    stopRec();
    try {
      rec = new SR();
      rec.lang = getLang() === "de" ? "de-DE" : "en-US";
      rec.interimResults = true;
      rec.continuous = heyMode;
      rec.onstart = () => { listening = true; renderState(); };
      rec.onend = () => {
        listening = false;
        renderState();
        // Hey-Modus: solange das Sheet offen ist, automatisch weiterlauschen.
        if (heyMode && !sheet.overlay.hidden) startRec();
      };
      rec.onerror = (e) => {
        listening = false;
        renderState();
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          showToast({ type: "warn", title: t("voice.mic_error"), body: e.error });
        }
      };
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) handleTranscript(r[0]?.transcript || "");
          else interim += r[0]?.transcript || "";
        }
        sheet.live.textContent = interim;
      };
      rec.start();
    } catch (err) {
      console.warn("[voice]", err.message);
      showToast({ type: "warn", title: t("voice.mic_error") });
    }
  }
  function stopRec() {
    if (rec) { try { rec.onend = null; rec.stop(); } catch { /* egal */ } rec = null; }
    listening = false;
  }

  // ── Transkript → Drafts ──────────────────────────
  function handleTranscript(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    const parsed = parseVoiceCapture(trimmed, { todayKey: todayKey() });
    // Im Hey-Modus zählt nur, was mit „hey“ beginnt (Umgebungsgespräche ignorieren).
    if (heyMode && !parsed.wake) return;
    for (const d of parsed.items) drafts.push(enrich(d));
    sheet.live.textContent = "";
    renderDrafts();
  }

  // Draft anreichern: Pace-Vorschlag + Lernmaterial-Suche aus dem Store.
  function enrich(d) {
    const s = store.state;
    const out = { ...d, topicId: null, examId: s.settings.activeExamId ?? null, estSuggestion: null, learn: null };
    if (!out.estMinutes) {
      out.estSuggestion = suggestEstimate(s.pace, out.difficulty ?? 2);
      out.estMinutes = out.estSuggestion.minutes;
    }
    if (d.learnQuery) {
      out.learn = findLearnOptions({
        query: d.learnQuery, topics: s.topics, resources: s.resources,
        notes: s.notes, exams: s.exams, now: store.now(),
      });
      const best = out.learn.topics[0];
      if (best) {
        out.topicId = best.id;
        if (best.examId != null) out.examId = best.examId;
      }
    }
    return out;
  }

  // ── Anlegen + Replan ─────────────────────────────
  async function createAll() {
    if (busy || !drafts.length) return;
    busy = true;
    renderFoot();
    let created = 0;
    let anyToday = false;
    for (const d of drafts) {
      const data = {
        text: d.text,
        plannedDate: d.plannedDate || (d.scheduledMin != null ? todayKey() : todayKey()),
        estMinutes: d.estMinutes || 25,
        difficulty: d.difficulty ?? 2,
      };
      if (d.scheduledMin != null) data.scheduledMin = d.scheduledMin;
      if (d.priority) data.priority = d.priority;
      if (d.topicId != null) data.topicId = d.topicId;
      if (d.examId != null) data.examId = d.examId;
      if (d.dueKey) { const ms = keyToMs(d.dueKey); if (ms != null) data.dueDate = ms + 86_399_000; }
      const ok = await act(() => api.tasks.create(data));
      if (ok) { created++; if (data.plannedDate === todayKey()) anyToday = true; }
    }
    let planBody = "";
    if (anyToday) {
      const res = await act(() => api.plan.day());
      if (res?.plan) planBody = planSummary(res.plan);
    }
    busy = false;
    if (created) showToast({ type: "success", title: t("voice.created_n", { n: created }), body: planBody, timeout: 6000 });
    close();
  }

  // ── Sheet-Lebenszyklus ───────────────────────────
  function open() {
    drafts = [];
    sheet.live.textContent = "";
    sheet.overlay.hidden = false;
    trap.activate();
    renderDrafts();
    startRec();
  }
  function close() {
    stopRec();
    heyMode = false;
    sheet.hey.classList.remove("is-on");
    sheet.hey.setAttribute("aria-checked", "false");
    sheet.overlay.hidden = true;
    trap.release();
    drafts = [];
  }

  btn.addEventListener("click", open);
  sheet.mic.addEventListener("click", () => (listening ? stopRec() : startRec()) || renderState());
  sheet.hey.addEventListener("click", () => {
    heyMode = !heyMode;
    sheet.hey.classList.toggle("is-on", heyMode);
    sheet.hey.setAttribute("aria-checked", heyMode ? "true" : "false");
    startRec();
  });
  sheet.retry.addEventListener("click", () => { drafts = []; renderDrafts(); startRec(); });
  sheet.cancel.addEventListener("click", close);
  sheet.create.addEventListener("click", createAll);
  sheet.overlay.addEventListener("mousedown", (e) => { if (e.target.classList.contains("sheet-overlay__scrim")) close(); });
  document.addEventListener("keydown", (e) => { if (!sheet.overlay.hidden && e.key === "Escape") close(); });

  // ── Draft-Editing (delegiert) ────────────────────
  sheet.drafts.addEventListener("change", (e) => {
    const card = e.target.closest("[data-i]");
    if (!card) return;
    const d = drafts[Number(card.dataset.i)];
    if (!d) return;
    const f = e.target.dataset.f;
    if (f === "text") d.text = e.target.value.trim() || d.text;
    else if (f === "plannedDate") d.plannedDate = e.target.value || null;
    else if (f === "time") d.scheduledMin = clockToMin(e.target.value);
    else if (f === "estMinutes") { d.estMinutes = Math.max(0, Math.round(Number(e.target.value) || 0)) || null; d.estSuggestion = null; }
  });
  sheet.drafts.addEventListener("click", (e) => {
    const del = e.target.closest('[data-act="draft-del"]');
    if (del) {
      drafts.splice(Number(del.closest("[data-i]").dataset.i), 1);
      renderDrafts();
    }
  });

  // ── Rendering ────────────────────────────────────
  function renderState() {
    sheet.mic.classList.toggle("is-live", listening);
    sheet.status.textContent = listening ? t("voice.listening") : t("voice.tap_to_talk");
  }
  function renderFoot() {
    const n = drafts.length;
    sheet.create.disabled = !n || busy;
    sheet.create.textContent = n > 1 ? t("voice.create", { n }) : t("voice.create_one");
  }
  function renderDrafts() {
    renderState();
    renderFoot();
    if (!drafts.length) {
      sheet.drafts.innerHTML = `<p class="voice__empty">${escapeHtml(t("voice.empty"))}</p>`;
      return;
    }
    sheet.drafts.innerHTML = drafts.map((d, i) => draftCard(d, i)).join("");
  }

  function draftCard(d, i) {
    const chips = [];
    if (d.priority === 1) chips.push(`<span class="chip chip--prio1">P1</span>`);
    if (d.difficulty === 3) chips.push(`<span class="chip">${escapeHtml(t("task.diff3"))}</span>`);
    if (d.difficulty === 1) chips.push(`<span class="chip">${escapeHtml(t("task.diff1"))}</span>`);
    if (d.dueKey) chips.push(`<span class="chip chip--due">due ${escapeHtml(d.dueKey.slice(5))}</span>`);
    if (d.estSuggestion) {
      const key = d.estSuggestion.basis === "history" ? "voice.suggest_history" : "voice.suggest_baseline";
      chips.push(`<span class="chip chip--sched">${escapeHtml(t(key, { min: d.estSuggestion.minutes }))}</span>`);
    }
    return `<div class="vdraft" data-i="${i}">
      <div class="vdraft__row">
        <input type="text" class="text-input vdraft__text" data-f="text" value="${escapeHtml(d.text)}" maxlength="160" />
        <button type="button" class="icon-btn icon-btn--bare" data-act="draft-del" title="${escapeHtml(t("voice.discard"))}" aria-label="${escapeHtml(t("voice.discard"))}">${icon("close", { size: 16 })}</button>
      </div>
      <div class="vdraft__grid">
        <input type="date" data-f="plannedDate" value="${escapeHtml(d.plannedDate || "")}" />
        <input type="time" data-f="time" value="${d.scheduledMin != null ? minToClock(d.scheduledMin) : ""}" />
        <span class="vdraft__min"><input type="number" data-f="estMinutes" min="0" step="5" value="${d.estMinutes || 0}" /> min</span>
      </div>
      ${chips.length ? `<div class="vdraft__chips">${chips.join("")}</div>` : ""}
      ${learnBlock(d)}
    </div>`;
  }

  function learnBlock(d) {
    if (!d.learn) return "";
    const L = d.learn;
    const best = L.topics[0];
    const q = escapeHtml(d.learnQuery || "");
    const resList = [...(best?.resources || []), ...L.resources].slice(0, 3);
    if (best || resList.length) {
      const verdictKey = { learn: "voice.verdict_learn", refresh: "voice.verdict_refresh", covered: "voice.verdict_covered" }[L.assessment.verdict];
      const examBit = best?.examName && best.daysLeft != null
        ? ` · ${escapeHtml(t("voice.exam_in", { exam: best.examName, n: best.daysLeft }))}` : "";
      const head = best
        ? `<div class="vdraft__topic"><i class="chip__dot"></i>${escapeHtml(best.text)}${examBit}${verdictKey ? ` — <em>${escapeHtml(t(verdictKey))}</em>` : ""}</div>`
        : "";
      const links = resList.map((r) => {
        const href = safeUrl(r.url);
        return href
          ? `<a class="vdraft__res" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${resourceIcon(r)}<span>${escapeHtml(r.title || prettyUrl(r.url))}</span></a>`
          : "";
      }).join("");
      return `<div class="vdraft__learn"><div class="vdraft__learn-head">${escapeHtml(t("voice.learn_found", { q: d.learnQuery }))}</div>${head}${links ? `<div class="vdraft__resrow">${links}</div>` : ""}</div>`;
    }
    // Nichts gefunden → Methoden-Vorschläge (wie lerne ich das am besten?)
    const methods = L.suggestions.filter((s) => !s.exists).slice(0, 3)
      .map((s) => `<span class="chip">${escapeHtml(t(`voice.method_${s.id}`))}</span>`).join("");
    return `<div class="vdraft__learn"><div class="vdraft__learn-head">${escapeHtml(t("voice.learn_none", { q: d.learnQuery }))}</div><div class="vdraft__chips">${methods}</div></div>`;
  }

  function planSummary(plan) {
    const bits = [];
    if (plan.placements.length) bits.push(t("plan.scheduled_n", { n: plan.placements.length }));
    if (plan.blocked.length) bits.push(t("plan.blocked_n", { n: plan.blocked.length }));
    if (plan.overCapacity.length) bits.push(t("plan.capacity_n", { n: plan.overCapacity.length }));
    if (plan.overflow.length) bits.push(t("plan.overflow_n", { n: plan.overflow.length }));
    return bits.join(" · ");
  }

  return {};
}

// ── Sheet-Markup (einmalig gebaut, an <body>) ──────
function buildSheet() {
  const overlay = document.createElement("div");
  overlay.className = "sheet-overlay voice-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `<div class="sheet-overlay__scrim"></div>
    <div class="sheet voice" role="dialog" aria-modal="true" aria-label="Voice capture">
      <div class="voice__head">
        <button type="button" class="voice__mic" id="voiceMicBig" aria-label="Microphone">${MIC_SVG}</button>
        <div class="voice__status" id="voiceStatus"></div>
        <div class="voice__live" id="voiceLive" aria-live="polite"></div>
        <button type="button" class="switch voice__hey" id="voiceHey" role="switch" aria-checked="false"></button>
        <label class="voice__hey-lbl" for="voiceHey" data-i18n="voice.hey_mode">Hey mode</label>
      </div>
      <div class="voice__drafts" id="voiceDrafts"></div>
      <div class="sheet__foot voice__foot">
        <button type="button" class="btn btn--ghost btn--sm" id="voiceRetry" data-i18n="voice.retry">Record again</button>
        <span class="task-modal__spacer"></span>
        <button type="button" class="btn btn--ghost" id="voiceCancel" data-i18n="common.cancel">Cancel</button>
        <button type="button" class="btn btn--primary" id="voiceCreate" disabled></button>
      </div>
    </div>`;
  return {
    overlay,
    mic: overlay.querySelector("#voiceMicBig"),
    status: overlay.querySelector("#voiceStatus"),
    live: overlay.querySelector("#voiceLive"),
    hey: overlay.querySelector("#voiceHey"),
    drafts: overlay.querySelector("#voiceDrafts"),
    retry: overlay.querySelector("#voiceRetry"),
    cancel: overlay.querySelector("#voiceCancel"),
    create: overlay.querySelector("#voiceCreate"),
  };
}
