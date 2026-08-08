// Erststart-Assistent v2 — die Lerntyp-Analyse. Statt drei knappen Schritten:
// Wer bist du → WIE lernst du (Lernwege) → was fordert dich (Konzentration/Legasthenie/
// Dyskalkulie …) → was hilft dir → Methoden-Vorschlag (kein Pomodoro-Zwang) →
// Aussehen & Reizreduktion (Live-Vorschau) → erste Prüfung. Alles landet in
// profile + settings + prefs und steuert UI, Vorschläge und KI.
// Erneut durchlaufbar über das Profil (Event "restart-onboarding") — dann vorbefüllt.
import { fromDatetimeLocal, escapeHtml } from "/js/util.js";
import { icon } from "/js/icons.js";
import { showToast } from "/js/toast.js";
import { createFocusTrap } from "/js/focusTrap.js";
import { getLang } from "/js/i18n.js";
import { LEARN_STYLES, CHALLENGES, HELPS, CHRONOTYPES, METHODS, methodIcon, methodText, suggestMethods, timerMethods } from "/shared/methods.js";
import { ACCENTS, applyAppearance } from "/js/adapt.js";

const GOALS = [2, 3, 4, 5];

const TXT = {
  de: {
    headline: "Lass uns Kairos an DICH anpassen — nicht umgekehrt.",
    foot: "Alles später änderbar (Profil → Lernprofil). Gespeichert wird nur, was du angibst.",
    steps: ["Über dich", "Lernwege", "Herausforderungen", "Was hilft", "Methoden", "Aussehen", "Prüfung"],
    stepOf: (n, total) => `Schritt ${n} von ${total}`,
    skip: "Später einrichten",
    // Ohne Pfeil-Glyphen: die Beschriftungen werden per textContent gesetzt,
    // dort darf kein Icon-Markup landen (siehe web/js/icons.js).
    next: "Weiter",
    back: "Zurück",
    finish: "Los geht’s",
    s1title: "Über dich",
    s1name: "Wie sollen wir dich nennen?",
    s1namePh: "Dein Name",
    s1goal: "Tägliches Lernziel",
    s1chrono: "Wann denkst du am klarsten?",
    // Die drei Chronotypen selbst (Beschriftung + Icon) stehen in
    // CHRONOTYPES (shared/methods.js) — dieselbe Quelle wie #pfChrono im Profil.
    s2title: "Wie lernst du am besten?",
    s2lead: "Wähle alles, was auf dich zutrifft — die Auswahl steuert Vorschläge, Journal und KI-Erklärungen.",
    s3title: "Was fordert dich heraus?",
    s3lead: "Ehrlich hilft: Kairos passt Oberfläche, Methoden und Tonalität an. (Optional, bleibt privat auf deinem Server.)",
    s3none: "Nichts davon",
    s4title: "Was hilft dir beim Dranbleiben?",
    s4lead: "Auch hier: alles Zutreffende.",
    s5title: "Deine Methoden",
    s5lead: "Vorschlag auf Basis deiner Antworten — ab- und zuwählen erlaubt. Details & Wissenschaft: Bereich „Methoden“.",
    s5timer: "Timer-Rhythmus (statt Pomodoro-Zwang)",
    s6title: "Aussehen & Fokus",
    s6accent: "Akzentfarbe",
    s6theme: "Helligkeit",
    themes: [["system", "Auto"], ["light", "Hell"], ["dark", "Dunkel"]],
    s6calm: "Ruhemodus: weniger Bereiche (Gesundheit & Muster ausgeblendet), weniger Animationen",
    s6dyslexia: "Lesefreundliche Typografie (mehr Abstand, kürzere Zeilen)",
    s7title: "Deine erste Prüfung",
    s7name: "Name der Prüfung",
    s7namePh: "z. B. Biochemie",
    s7date: "Termin (optional)",
    done: "Eingerichtet! Kairos ist jetzt auf dich eingestellt.",
    doneBody: "Dein Lernprofil steuert Vorschläge, KI und Darstellung — änderbar im Profil.",
  },
  en: {
    headline: "Let’s fit Kairos to YOU — not the other way round.",
    foot: "Everything can be changed later (profile → learning profile). Only what you enter is saved.",
    steps: ["About you", "Ways", "Challenges", "What helps", "Methods", "Look", "Exam"],
    stepOf: (n, total) => `Step ${n} of ${total}`,
    skip: "Set up later",
    next: "Continue",
    back: "Back",
    finish: "Let’s go",
    s1title: "About you",
    s1name: "What should we call you?",
    s1namePh: "Your name",
    s1goal: "Daily study goal",
    s1chrono: "When is your head clearest?",
    s2title: "How do you learn best?",
    s2lead: "Pick everything that applies — it drives suggestions, the journal and AI explanations.",
    s3title: "What challenges you?",
    s3lead: "Honesty helps: Kairos adapts interface, methods and tone. (Optional, stays private on your server.)",
    s3none: "None of these",
    s4title: "What helps you keep going?",
    s4lead: "Again: everything that applies.",
    s5title: "Your methods",
    s5lead: "Suggested from your answers — toggle freely. Details & science: “Methods” area.",
    s5timer: "Timer rhythm (no forced Pomodoro)",
    s6title: "Look & focus",
    s6accent: "Accent colour",
    s6theme: "Brightness",
    themes: [["system", "Auto"], ["light", "Light"], ["dark", "Dark"]],
    s6calm: "Calm mode: fewer areas (health & insights hidden), fewer animations",
    s6dyslexia: "Reading-friendly typography (more spacing, shorter lines)",
    s7title: "Your first exam",
    s7name: "Exam name",
    s7namePh: "e.g. Biochemistry",
    s7date: "Date (optional)",
    done: "Set up! Kairos is now tuned to you.",
    doneBody: "Your learning profile drives suggestions, AI and appearance — editable in your profile.",
  },
};

export function initOnboarding({ store, api }) {
  const lang = () => getLang() === "en" ? "en" : "de";
  const t = () => TXT[lang()];
  const TOTAL = 7;

  let overlay = null;
  let trap = null;
  let step = 1;
  let finished = false;
  let shownOnce = false;
  let rerun = false;

  // ── Antworten (bei „erneut durchlaufen" vorbefüllt) ──
  const st = {
    name: "", goal: 3, chrono: "intermediate",
    styles: new Set(), challenges: new Set(), helps: new Set(),
    methods: new Set(), timerMethod: "pomodoro",
    accent: "sage", theme: "system", calm: false, dyslexia: false,
    examName: "", examDate: "",
  };
  function prefill(s) {
    const p = s.prefs || {};
    st.name = s.profile?.displayName || "";
    st.goal = s.settings?.todayGoalHours || 3;
    st.chrono = s.profile?.chronotype || "intermediate";
    st.styles = new Set(Array.isArray(p.learnStyles) ? p.learnStyles : []);
    st.challenges = new Set(Array.isArray(p.challenges) ? p.challenges : []);
    st.helps = new Set(Array.isArray(p.helps) ? p.helps : []);
    st.methods = new Set(Array.isArray(p.methods) ? p.methods : []);
    st.accent = p.appearance?.accent || "sage";
    st.theme = p.appearance?.theme || "system";
    st.calm = !!(Array.isArray(p.hiddenViews) && p.hiddenViews.length);
    st.dyslexia = !!p.access?.dyslexiaFont;
  }

  const chip = (id, label, on) =>
    `<button class="onb__choice onb__choice--multi${on ? " is-active" : ""}" type="button" data-multi="${id}">${label}</button>`;

  function suggested() {
    return suggestMethods({ styles: [...st.styles], challenges: [...st.challenges], helps: [...st.helps] });
  }
  function ensureMethodDefaults() {
    if (st.methods.size) return;
    for (const r of suggested().slice(0, 5)) st.methods.add(r.id);
  }
  function bestTimerMethod() {
    const ranked = suggested();
    const timers = new Set(timerMethods().map((m) => m.id));
    return ranked.find((r) => timers.has(r.id))?.id || "pomodoro";
  }

  function panelHtml() {
    const x = t();
    const L = lang();
    // Piktogramm eines Katalog-Eintrags (shared/methods.js): nur zeichnen, wenn
    // dort ein Icon-Name hinterlegt ist. Abstand zur Beschriftung macht das
    // Flex-Gap von .onb__choice.
    const pic = (item) => (item?.icon ? icon(item.icon) : "");
    const name = (item) => `${pic(item)}${item[L] || item.de}`;
    // Methoden erben ihr Piktogramm notfalls von der Kategorie — derselbe
    // Fallback wie im Wissen, damit dieselbe Methode überall gleich aussieht.
    const mpic = (m) => icon(methodIcon(m));
    if (step === 1) return `
      <div class="onb__title">${x.s1title}</div>
      <div class="onb__fields">
        <div class="onb__field"><label>${x.s1name}</label><input type="text" id="onbName" class="text-input" placeholder="${x.s1namePh}" maxlength="60" value="${st.name.replace(/"/g, "&quot;")}" /></div>
        <div class="onb__field"><label>${x.s1goal}</label><div class="onb__choices">${GOALS.map((g) => `<button class="onb__choice${g === st.goal ? " is-active" : ""}" type="button" data-goal="${g}">${g} h</button>`).join("")}</div></div>
        <div class="onb__field"><label>${x.s1chrono}</label><div class="onb__choices">${CHRONOTYPES.map((c) => `<button class="onb__choice${c.id === st.chrono ? " is-active" : ""}" type="button" data-chrono="${c.id}">${name(c)}</button>`).join("")}</div></div>
      </div>`;
    if (step === 2) return `
      <div class="onb__title">${x.s2title}</div>
      <p class="onb__lead">${x.s2lead}</p>
      <div class="onb__choices onb__choices--wrap">${LEARN_STYLES.map((s) => chip(`style:${s.id}`, name(s), st.styles.has(s.id))).join("")}</div>`;
    if (step === 3) return `
      <div class="onb__title">${x.s3title}</div>
      <p class="onb__lead">${x.s3lead}</p>
      <div class="onb__choices onb__choices--wrap">
        ${CHALLENGES.map((c) => chip(`chal:${c.id}`, name(c), st.challenges.has(c.id))).join("")}
        ${chip("chal:none", `${icon("check")}${x.s3none}`, st.challenges.size === 0 && st._noneTouched)}
      </div>`;
    if (step === 4) return `
      <div class="onb__title">${x.s4title}</div>
      <p class="onb__lead">${x.s4lead}</p>
      <div class="onb__choices onb__choices--wrap">${HELPS.map((h) => chip(`help:${h.id}`, name(h), st.helps.has(h.id))).join("")}</div>`;
    if (step === 5) {
      ensureMethodDefaults();
      const top = suggested().slice(0, 8);
      return `
      <div class="onb__title">${x.s5title}</div>
      <p class="onb__lead">${x.s5lead}</p>
      <div class="onb__choices onb__choices--wrap">
        ${top.map((r) => {
          const m = METHODS.find((mm) => mm.id === r.id);
          return chip(`method:${m.id}`, `${mpic(m)}${methodText(m, L).name}`, st.methods.has(m.id));
        }).join("")}
      </div>
      <div class="onb__field" style="margin-top:14px"><label>${x.s5timer}</label>
        <div class="onb__choices onb__choices--wrap">
          ${timerMethods().map((m) => `<button class="onb__choice${st.timerMethod === m.id ? " is-active" : ""}" type="button" data-timer="${m.id}">${mpic(m)}${methodText(m, L).name}</button>`).join("")}
        </div>
      </div>`;
    }
    if (step === 6) return `
      <div class="onb__title">${x.s6title}</div>
      <div class="onb__field"><label>${x.s6accent}</label>
        <div class="onb__swatches">
          ${ACCENTS.map((a) => `<button class="onb__swatch${st.accent === a.id ? " is-active" : ""}" type="button" data-accent="${a.id}" style="--sw:${a.color}" title="${escapeHtml(a.en)}"></button>`).join("")}
        </div>
      </div>
      <div class="onb__field"><label>${x.s6theme}</label>
        <div class="onb__choices">${x.themes.map(([k, l]) => `<button class="onb__choice${st.theme === k ? " is-active" : ""}" type="button" data-theme="${k}">${l}</button>`).join("")}</div>
      </div>
      <div class="onb__checks">
        <label class="onb__check"><input type="checkbox" id="onbCalm" ${st.calm ? "checked" : ""} /> <span>${icon("leaf")} ${x.s6calm}</span></label>
        <label class="onb__check"><input type="checkbox" id="onbDyslexia" ${st.dyslexia ? "checked" : ""} /> <span>${icon("type")} ${x.s6dyslexia}</span></label>
      </div>`;
    return `
      <div class="onb__title">${x.s7title}</div>
      <div class="onb__fields">
        <div class="onb__field"><label>${x.s7name}</label><input type="text" id="onbExam" class="text-input" placeholder="${x.s7namePh}" maxlength="80" value="${st.examName.replace(/"/g, "&quot;")}" /></div>
        <div class="onb__field"><label>${x.s7date}</label><input type="datetime-local" id="onbExamDate" class="text-input" value="${st.examDate}" /></div>
      </div>`;
  }

  function render() {
    if (!overlay) return;
    const x = t();
    overlay.querySelector(".onb__headline").textContent = x.headline;
    overlay.querySelector(".onb__foot").textContent = x.foot;
    const stepsEl = overlay.querySelector("#onbSteps");
    stepsEl.innerHTML = x.steps.map((label, i) => `
      <div class="onb__step${i + 1 === step ? " is-active" : ""}${i + 1 < step ? " is-done" : ""}" data-step="${i + 1}">
        <span class="onb__num">${i + 1 < step ? icon("check", { size: 15 }) : i + 1}</span><span>${label}</span>
      </div>`).join("");
    overlay.querySelector("#onbEyebrow").textContent = x.stepOf(step, TOTAL);
    overlay.querySelector("#onbPanel").innerHTML = panelHtml();
    overlay.querySelector("#onbBack").hidden = step === 1;
    overlay.querySelector("#onbBack").textContent = x.back;
    overlay.querySelector("#onbSkip").textContent = x.skip;
    overlay.querySelector("#onbNext").textContent = step === TOTAL ? x.finish : x.next;
  }

  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.className = "onb-overlay";
    overlay.innerHTML = `
      <div class="onb" role="dialog" aria-modal="true" aria-label="Kairos Setup">
        <div class="onb__rail">
          <div class="onb__brand">
            <svg class="onb__mark" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
              <g transform="translate(8 0)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <path d="M 158 34 C 101 25, 45 63, 32 119 C 17 183, 68 223, 128 221 C 190 219, 226 172, 220 117 C 216 84, 205 66, 194 56" stroke-width="20"/>
                <path d="M 112 69 C 108 94, 108 124, 110 171 M 111 122 C 132 105, 151 88, 169 72 M 112 123 C 133 137, 150 155, 164 173 C 170 181, 178 178, 183 166" stroke-width="18"/>
                <circle cx="179" cy="42" r="7.5" fill="currentColor" stroke="none"/>
              </g>
            </svg>
            <span>Kairos</span>
          </div>
          <div class="onb__headline"></div>
          <div class="onb__steps" id="onbSteps"></div>
          <div class="onb__foot"></div>
        </div>
        <div class="onb__main">
          <div class="onb__eyebrow" id="onbEyebrow"></div>
          <div class="onb__panelwrap" id="onbPanel"></div>
          <div class="onb__actions">
            <button class="onb__skip" id="onbSkip" type="button"></button>
            <div class="onb__actions-right">
              <button class="btn btn--ghost" id="onbBack" type="button" hidden></button>
              <button class="onb__next btn btn--primary" id="onbNext" type="button"></button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    trap = createFocusTrap(overlay.querySelector(".onb"), { initialFocus: false });

    overlay.addEventListener("click", (e) => {
      const goal = e.target.closest("[data-goal]");
      if (goal) { st.goal = Number(goal.dataset.goal); render(); return; }
      const chrono = e.target.closest("[data-chrono]");
      if (chrono) { st.chrono = chrono.dataset.chrono; render(); return; }
      const timer = e.target.closest("[data-timer]");
      if (timer) { st.timerMethod = timer.dataset.timer; render(); return; }
      const accent = e.target.closest("[data-accent]");
      if (accent) {
        st.accent = accent.dataset.accent;
        applyAppearance({ accent: st.accent, theme: st.theme }, { dyslexiaFont: st.dyslexia, reduceMotion: st.calm });
        render();
        return;
      }
      const theme = e.target.closest("[data-theme]");
      if (theme) {
        st.theme = theme.dataset.theme;
        applyAppearance({ accent: st.accent, theme: st.theme }, { dyslexiaFont: st.dyslexia, reduceMotion: st.calm });
        render();
        return;
      }
      const multi = e.target.closest("[data-multi]");
      if (multi) {
        const [kind, id] = multi.dataset.multi.split(":");
        if (kind === "style") st.styles.has(id) ? st.styles.delete(id) : st.styles.add(id);
        if (kind === "help") st.helps.has(id) ? st.helps.delete(id) : st.helps.add(id);
        if (kind === "method") st.methods.has(id) ? st.methods.delete(id) : st.methods.add(id);
        if (kind === "chal") {
          if (id === "none") { st.challenges.clear(); st._noneTouched = true; }
          else {
            st._noneTouched = false;
            st.challenges.has(id) ? st.challenges.delete(id) : st.challenges.add(id);
            // Sinnvolle Sofort-Ableitungen (im Schritt 6 änderbar):
            if (id === "dyslexia") st.dyslexia = st.challenges.has("dyslexia");
            if (id === "overwhelm") st.calm = st.challenges.has("overwhelm");
          }
        }
        // Methoden-Vorschlag folgt den Antworten, solange Schritt 5 nicht erreicht war.
        if (kind !== "method" && step < 5) st.methods.clear();
        render();
        return;
      }
    });
    overlay.addEventListener("change", (e) => {
      if (e.target.id === "onbCalm") {
        st.calm = e.target.checked;
        applyAppearance({ accent: st.accent, theme: st.theme }, { dyslexiaFont: st.dyslexia, reduceMotion: st.calm });
      }
      if (e.target.id === "onbDyslexia") {
        st.dyslexia = e.target.checked;
        applyAppearance({ accent: st.accent, theme: st.theme }, { dyslexiaFont: st.dyslexia, reduceMotion: st.calm });
      }
    });
    overlay.querySelector("#onbNext").addEventListener("click", () => next());
    overlay.querySelector("#onbBack").addEventListener("click", () => { captureInputs(); step = Math.max(1, step - 1); render(); });
    overlay.querySelector("#onbSkip").addEventListener("click", () => finish(false));
  }

  function captureInputs() {
    const name = overlay.querySelector("#onbName");
    if (name) st.name = name.value.trim();
    const exam = overlay.querySelector("#onbExam");
    if (exam) st.examName = exam.value.trim();
    const date = overlay.querySelector("#onbExamDate");
    if (date) st.examDate = date.value;
  }

  async function act(fn) {
    try { store.applySnapshot(await fn()); } catch (e) { console.warn("[onboarding]", e.message); }
  }

  async function next() {
    captureInputs();
    if (step === 4) st.timerMethod = bestTimerMethod();
    if (step < TOTAL) { step += 1; render(); return; }

    // ── Abschluss: alles speichern ──
    const x = t();
    const timerM = METHODS.find((m) => m.id === st.timerMethod && m.preset) || METHODS.find((m) => m.id === "pomodoro");
    await act(() => api.profile.save({
      displayName: st.name || undefined,
      chronotype: st.chrono,
      focus: st.challenges.has("focus"),
    }));
    await act(() => api.setSettings({
      todayGoalHours: st.goal,
      focusMinutes: timerM.preset.focus,
      shortBreakMinutes: timerM.preset.short,
      longBreakMinutes: timerM.preset.long,
      cyclesUntilLongBreak: timerM.preset.cycles,
      profileName: methodText(timerM, lang()).name,
    }));
    await act(() => api.prefs.save({
      learnStyles: [...st.styles],
      challenges: [...st.challenges],
      helps: [...st.helps],
      methods: [...st.methods],
      appearance: { accent: st.accent, theme: st.theme, fontScale: "m", density: "cozy" },
      access: {
        reduceMotion: st.calm,
        highContrast: false,
        dyslexiaFont: st.dyslexia,
        numberFriendly: st.challenges.has("dyscalculia"),
      },
      hiddenViews: st.calm ? ["health", "insights"] : [],
    }));
    if (st.examName && !rerun) {
      const snap = await api.exams.create({ name: st.examName, date: fromDatetimeLocal(st.examDate) || undefined });
      store.applySnapshot(snap);
      const created = snap.exams[snap.exams.length - 1];
      if (created) await act(() => api.setSettings({ activeExamId: created.id }));
    }
    showToast({ type: "success", title: x.done, body: x.doneBody });
    finish(true);
  }

  function finish(completed) {
    if (finished && !rerun) return;
    localStorage.setItem("kairos_onboarded", "1");
    if (!completed) {
      // Vorschau verwerfen → gespeicherte Darstellung wiederherstellen.
      applyAppearance(store.state.prefs?.appearance || {}, store.state.prefs?.access || {});
    }
    overlay?.remove();
    overlay = null;
    trap?.release();
    finished = true;
  }

  function openWizard({ asRerun = false } = {}) {
    rerun = asRerun;
    finished = false;
    step = 1;
    if (asRerun) prefill(store.state);
    if (!overlay) buildOverlay();
    render();
    trap = createFocusTrap(overlay.querySelector(".onb"), { initialFocus: false });
    trap.activate();
    setTimeout(() => overlay.querySelector("#onbName")?.focus(), 60);
  }

  // Erststart-Gate: einmalig nach dem ersten Snapshot, wenn noch kein Name existiert.
  let unsub = null;
  function gate(s) {
    if (shownOnce || finished) return;
    if (localStorage.getItem("kairos_onboarded")) { shownOnce = true; return; }
    if (!s.loaded) return;
    if (s.profile && s.profile.displayName) { localStorage.setItem("kairos_onboarded", "1"); shownOnce = true; return; }
    shownOnce = true;
    openWizard({ asRerun: false });
    unsub?.();
  }
  unsub = store.subscribe(gate);
  gate(store.state);

  // Aus dem Profil erneut durchlaufbar (vorbefüllt, ohne Prüfungs-Neuanlage-Zwang).
  document.addEventListener("restart-onboarding", () => openWizard({ asRerun: true }));

  return {};
}
