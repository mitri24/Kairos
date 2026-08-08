// Wissen-Seite: ALLE Lernmethoden erklärt (Evidenz, Anwendung, Integration in
// Kairos) + „Was ist neu". Kein Pomodoro-Zwang: Jede Methode mit Preset lässt
// sich als Timer-Modus aktivieren; „Meine Methoden" speist Vorschläge + KI.
import { METHODS, METHOD_CATEGORIES, methodIcon, methodText, suggestMethods, getMethod } from "/shared/methods.js";
import { escapeHtml as esc } from "/js/util.js";
import { getLang } from "/js/i18n.js";
import { showToast } from "/js/toast.js";
import { icon } from "/js/icons.js";

const TXT = {
  de: {
    eyebrow: "Lernpsychologie",
    title: "Methoden & Wissen",
    sub: "Kairos geht nicht von Pomodoro aus — wähle, was zu DIR passt. Empfehlungen folgen deinem Lernprofil.",
    tabs: { methods: "Methoden", news: "Was ist neu" },
    filterAll: "Alle",
    filterFit: "Passt zu mir",
    filterTimer: "Timer-Modi",
    evidence: ["", "bewährte Praxis", "gut belegt", "stark belegt (Meta-Analysen)"],
    how: "So geht’s",
    science: "Warum es wirkt",
    inApp: "So hilft dir Kairos",
    useTimer: "Als Timer-Modus nutzen",
    timerActive: "Aktiver Timer-Modus",
    inMyMethods: "In meinen Methoden",
    addMethod: "Zu meinen Methoden",
    presetToast: (n) => `Timer läuft jetzt im Modus „${n}“`,
    profileHint: "Dein Lernprofil ist noch leer — beantworte die Fragen im Profil, dann sortiert Kairos die Methoden nach Passung.",
    profileBtn: "Lernprofil ausfüllen",
    fitBadge: "passt zu deinem Profil",
    newsTitle: "Neu in Kairos",
    adaptTitle: "So passt sich Kairos dir an",
    adaptBody: "Aus deinem Lernprofil (Profil → Lernprofil) leitet Kairos ab: welche Methoden vorgeschlagen werden, wie der KI-Buddy erklärt (z. B. Diagramme für visuelle Lerntypen), welche Timer-Längen passen, und welche Bereiche ausgeblendet werden, wenn dich viele Reize stören. Alles lässt sich jederzeit ändern — nichts ist fest verdrahtet.",
  },
  en: {
    eyebrow: "Learning science",
    title: "Methods & knowledge",
    sub: "Kairos doesn’t assume Pomodoro — pick what fits YOU. Recommendations follow your learning profile.",
    tabs: { methods: "Methods", news: "What’s new" },
    filterAll: "All",
    filterFit: "Fits me",
    filterTimer: "Timer modes",
    evidence: ["", "established practice", "well supported", "strongly supported (meta-analyses)"],
    how: "How to do it",
    science: "Why it works",
    inApp: "How Kairos helps",
    useTimer: "Use as timer mode",
    timerActive: "Active timer mode",
    inMyMethods: "In my methods",
    addMethod: "Add to my methods",
    presetToast: (n) => `Timer now runs in “${n}” mode`,
    profileHint: "Your learning profile is empty — answer the questions in your profile and Kairos will sort methods by fit.",
    profileBtn: "Fill in learning profile",
    fitBadge: "fits your profile",
    newsTitle: "New in Kairos",
    adaptTitle: "How Kairos adapts to you",
    adaptBody: "From your learning profile Kairos derives: which methods are suggested, how the AI buddy explains (e.g. diagrams for visual learners), which timer lengths fit, and which areas get hidden when visual clutter bothers you. Everything can be changed at any time — nothing is hard-wired.",
  },
};

const CHANGELOG = {
  de: [
    { tag: "Neu", title: "Lernmethoden statt Pomodoro-Zwang", body: "Katalog mit über 25 Methoden inkl. Evidenz; jede Timer-Methode (25/5, 50/10, 52/17, 90er-Zyklen, Flowtime) als Modus aktivierbar." },
    { tag: "Neu", title: "Lernprofil & anpassbares UI", body: "Ausführliches Onboarding: Lernwege, ADHS/Legasthenie/Dyskalkulie, was hilft. Darauf passen sich Vorschläge, KI und Oberfläche an — inklusive ausblendbarer Bereiche." },
    { tag: "Neu", title: "Darstellung wie bei Apple", body: "Akzentfarben, Hell/Dunkel/Automatisch, Schriftgröße, Dichte, hoher Kontrast, weniger Animationen, Legasthenie-Typografie." },
    { tag: "Neu", title: "Bibliothek + Referenz-Panel", body: "Dateien (PDF, Bilder …), Links und Formel-/Regelkarten je Thema speichern. Angepinnte Karten schweben als Referenz-Panel über jeder Ansicht — Schluss mit Hin-und-her-Switchen." },
    { tag: "Neu", title: "Journal mit aktivem Abruf", body: "Jeder Tag wird festgehalten (Sessions, Notizen, Material). Gelerntes kommt nach der Vergessenskurve zurück: erst aufschreiben, dann aufdecken, dann bewerten." },
    { tag: "Neu", title: "Lernroute", body: "Deine Themen als Weg mit Stationen — sichtbar, wo du stehst und was als Nächstes kommt." },
    { tag: "Neu", title: "Alles teilbar", body: "Prüfungspläne, Themen, Materialien und Notizen per Link teilen — auf jedem Gerät zu öffnen und mit einem Klick ins eigene Kairos übernehmbar." },
    { tag: "Neu", title: "Links öffnen in der App", body: "Lernlinks öffnen in einem Rahmen in Kairos (mit „Extern öffnen“-Ausweg, falls eine Seite das Einbetten blockt)." },
    { tag: "Neu", title: "KI-Lernbuddy", body: "Seitlicher Chat, der sich deinem Lerntyp anpasst. Kostenlos mit lokalem Ollama; alternativ OpenAI-kompatible Anbieter oder Claude." },
    { tag: "Zuvor", title: "Adaptive Planung (Wave 5)", body: "Auto-Tagesplan nach deinem Tempo, Aufgaben-Abhängigkeiten, iCloud-Kalender, Push-Erinnerungen, Spracherfassung." },
    { tag: "Zuvor", title: "Grundlagen", body: "Tages-Zeitstrahl, Wochenplan, Prüfungs-Workspace mit Endspurt, Web-Push, Wearable-Readiness, Serien mit Gnadentag." },
  ],
  en: [
    { tag: "New", title: "Study methods instead of forced Pomodoro", body: "Catalogue of 25+ methods incl. evidence; every timer method (25/5, 50/10, 52/17, 90-min cycles, flowtime) can be activated as a mode." },
    { tag: "New", title: "Learning profile & adaptive UI", body: "In-depth onboarding: ways of learning, ADHD/dyslexia/dyscalculia, what helps. Suggestions, AI and the interface adapt — including hideable areas." },
    { tag: "New", title: "Appearance like Apple", body: "Accent colours, light/dark/auto, font size, density, high contrast, reduced motion, dyslexia-friendly typography." },
    { tag: "New", title: "Library + reference panel", body: "Store files, links and formula/rule cards per topic. Pinned cards float as a reference panel over any view — no more tab-hopping." },
    { tag: "New", title: "Journal with active recall", body: "Every day is captured (sessions, notes, material). What you learned comes back along the forgetting curve: write first, reveal, then rate." },
    { tag: "New", title: "Learning path", body: "Your topics as a route with stations — see where you stand and what’s next." },
    { tag: "New", title: "Share everything", body: "Share exam plans, topics, materials and notes via link — opens on any device, importable into someone’s own Kairos in one click." },
    { tag: "New", title: "Links open inside the app", body: "Study links open in a frame inside Kairos (with an “open externally” escape if a site blocks embedding)." },
    { tag: "New", title: "AI study buddy", body: "A side chat that adapts to your learning type. Free with local Ollama; alternatively OpenAI-compatible providers or Claude." },
    { tag: "Before", title: "Adaptive planning (wave 5)", body: "Auto day plan at your pace, task dependencies, iCloud calendar, push reminders, voice capture." },
    { tag: "Before", title: "Foundations", body: "Day timeline, week planner, exam workspace with final-days mode, web push, wearable readiness, streaks with grace day." },
  ],
};

// Piktogramme kommen aus dem Katalog selbst: shared/methods.js führt je Methode
// und je Kategorie ein `icon`-Feld (Name aus web/js/icons.js). Keine zweite
// Zuordnungstabelle hier — sonst zeigt dieselbe Methode im Wissen etwas anderes
// als im Onboarding. Der Fallback (Methode → Kategorie → „book") steht ebenfalls
// dort: methodIcon() aus shared/methods.js, von Wissen UND Onboarding benutzt.
const catIcon = (id) => METHOD_CATEGORIES.find((c) => c.id === id)?.icon || "book";

export function initKnowledge({ store, api }) {
  const root = document.getElementById("knowledgeRoot");
  if (!root) return {};
  let tab = "methods";
  let filter = "all";
  let expanded = new Set();

  async function act(fn) {
    try { store.applySnapshot(await fn()); return true; }
    catch (e) { console.warn("[knowledge]", e.message); return false; }
  }

  const presetActive = (m, s) => m.preset
    && s.settings.focusMinutes === m.preset.focus
    && s.settings.shortBreakMinutes === m.preset.short
    && s.settings.longBreakMinutes === m.preset.long
    && s.settings.cyclesUntilLongBreak === m.preset.cycles;

  function profileOf(s) {
    const p = s.prefs || {};
    return {
      styles: Array.isArray(p.learnStyles) ? p.learnStyles : [],
      challenges: Array.isArray(p.challenges) ? p.challenges : [],
      helps: Array.isArray(p.helps) ? p.helps : [],
    };
  }

  function render(s) {
    if (root.closest(".view")?.hidden) return;
    const lang = getLang();
    const T = TXT[lang] || TXT.de;
    const prof = profileOf(s);
    const hasProfile = prof.styles.length || prof.challenges.length || prof.helps.length;
    const ranked = suggestMethods(prof);
    const rankIndex = new Map(ranked.map((r, i) => [r.id, i]));
    const fitIds = new Set(ranked.filter((r) => r.reasons.length > 0).map((r) => r.id));
    const myMethods = new Set(Array.isArray(s.prefs?.methods) ? s.prefs.methods : []);

    let list = [...METHODS];
    if (filter === "fit") list = list.filter((m) => fitIds.has(m.id));
    else if (filter === "timer") list = list.filter((m) => m.preset);
    else if (filter !== "all") list = list.filter((m) => m.cat === filter);
    // „Passt zu mir" nach Score, sonst Katalogreihenfolge (Kategorien zusammen).
    if (filter === "fit" || (filter === "all" && hasProfile)) {
      list.sort((a, b) => rankIndex.get(a.id) - rankIndex.get(b.id));
    }

    // Reiner Text — das Piktogramm setzt der Aufrufer als Icon davor.
    const catName = (id) => {
      const c = METHOD_CATEGORIES.find((x) => x.id === id);
      return c ? (c[lang] || c.de) : id;
    };

    root.innerHTML = `
      <div class="view__head">
        <div>
          <div class="view__eyebrow">${esc(T.eyebrow)}</div>
          <h1 class="view__title">${esc(T.title)}</h1>
          <p class="knowledge-sub">${esc(T.sub)}</p>
        </div>
        <div class="seg" role="tablist">
          <button class="seg__btn${tab === "methods" ? " is-active" : ""}" data-tab="methods" role="tab">${esc(T.tabs.methods)}</button>
          <button class="seg__btn${tab === "news" ? " is-active" : ""}" data-tab="news" role="tab">${esc(T.tabs.news)}</button>
        </div>
      </div>
      ${tab === "methods" ? `
        ${hasProfile ? "" : `
          <div class="knowledge-hint card">
            <span>${icon("bulb")} ${esc(T.profileHint)}</span>
            <button class="btn btn--primary btn--sm" data-a="profile">${esc(T.profileBtn)}</button>
          </div>`}
        <div class="knowledge-filters">
          <button class="method-filter${filter === "all" ? " is-active" : ""}" data-f="all">${esc(T.filterAll)}</button>
          ${hasProfile ? `<button class="method-filter method-filter--fit${filter === "fit" ? " is-active" : ""}" data-f="fit">${icon("sparkle")}${esc(T.filterFit)}</button>` : ""}
          <button class="method-filter${filter === "timer" ? " is-active" : ""}" data-f="timer">${icon("timer")}${esc(T.filterTimer)}</button>
          ${METHOD_CATEGORIES.map((c) => `<button class="method-filter${filter === c.id ? " is-active" : ""}" data-f="${c.id}">${icon(catIcon(c.id))}${esc(c[lang] || c.de)}</button>`).join("")}
        </div>
        <div class="method-grid">
          ${list.map((m) => {
            const t = methodText(m, lang);
            const open = expanded.has(m.id);
            const active = presetActive(m, s);
            const mine = myMethods.has(m.id);
            const fits = hasProfile && fitIds.has(m.id);
            // Evidenzgrad: Punkte sind reine Dekoration (aria-hidden), die
            // Bedeutung trägt das aria-label des Meters.
            const evLabel = T.evidence[m.evidence] || "";
            return `
            <article class="method-card${open ? " is-open" : ""}${active ? " is-timer-active" : ""}" data-id="${m.id}">
              <button class="method-card__head" type="button" data-a="toggle" data-id="${m.id}" aria-expanded="${open}">
                <span class="method-card__icon">${icon(methodIcon(m), { size: 22 })}</span>
                <span class="method-card__titles">
                  <span class="method-card__name">${esc(t.name)}</span>
                  <span class="method-card__cat">${icon(catIcon(m.cat), { size: 13 })}${esc(catName(m.cat))}</span>
                </span>
                <span class="method-card__badges">
                  ${fits ? `<span class="method-badge method-badge--fit" title="${esc(T.fitBadge)}">${icon("sparkle", { label: T.fitBadge })}</span>` : ""}
                  ${active ? `<span class="method-badge method-badge--active">${esc(T.timerActive)}</span>` : ""}
                  <span class="method-evidence lvl-${m.evidence}" role="img" aria-label="${esc(evLabel)}" title="${esc(evLabel)}"><span class="method-evidence__dots" aria-hidden="true"><i></i><i></i><i></i></span></span>
                </span>
              </button>
              <p class="method-card__short">${esc(t.short)}</p>
              <div class="method-card__body" ${open ? "" : "hidden"}>
                <div class="method-card__sect"><b>${esc(T.how)}</b><p>${esc(t.how)}</p></div>
                <div class="method-card__sect"><b>${esc(T.science)}</b><p>${esc(t.science)}</p></div>
                <div class="method-card__sect method-card__sect--app"><b>${esc(T.inApp)}</b><p>${esc(t.inApp)}</p></div>
              </div>
              <div class="method-card__foot">
                ${m.preset ? `<button class="btn btn--sm ${active ? "btn--ghost" : "btn--primary"}" data-a="preset" data-id="${m.id}" ${active ? "disabled" : ""}>${active ? esc(T.timerActive) : esc(T.useTimer)}</button>` : ""}
                <label class="method-mine${mine ? " is-on" : ""}">
                  <input type="checkbox" data-a="mine" data-id="${m.id}" ${mine ? "checked" : ""} />
                  <span>${esc(mine ? T.inMyMethods : T.addMethod)}</span>
                </label>
              </div>
            </article>`;
          }).join("")}
        </div>
      ` : `
        <div class="news-list">
          <div class="card news-adapt">
            <div class="news-adapt__title">${icon("compass", { size: 18 })}${esc(T.adaptTitle)}</div>
            <p>${esc(T.adaptBody)}</p>
          </div>
          ${(CHANGELOG[lang] || CHANGELOG.de).map((e) => `
            <div class="card news-item">
              <span class="news-item__tag${/Zuvor|Before/.test(e.tag) ? " news-item__tag--old" : ""}">${esc(e.tag)}</span>
              <div>
                <div class="news-item__title">${esc(e.title)}</div>
                <p class="news-item__body">${esc(e.body)}</p>
              </div>
            </div>`).join("")}
        </div>
      `}`;
  }

  root.addEventListener("click", (e) => {
    const tabBtn = e.target.closest("[data-tab]");
    if (tabBtn) { tab = tabBtn.dataset.tab; render(store.state); return; }
    const f = e.target.closest("[data-f]");
    if (f) { filter = f.dataset.f; render(store.state); return; }
    const a = e.target.closest("[data-a]");
    if (!a) return;
    if (a.dataset.a === "profile") {
      document.dispatchEvent(new CustomEvent("navigate", { detail: { view: "profile" } }));
      document.dispatchEvent(new CustomEvent("open-learn-profile"));
      return;
    }
    if (a.dataset.a === "toggle") {
      const id = a.dataset.id;
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      render(store.state);
      return;
    }
    if (a.dataset.a === "preset") {
      const m = getMethod(a.dataset.id);
      if (!m?.preset) return;
      const name = methodText(m, getLang()).name;
      act(() => api.setSettings({
        focusMinutes: m.preset.focus, shortBreakMinutes: m.preset.short,
        longBreakMinutes: m.preset.long, cyclesUntilLongBreak: m.preset.cycles,
        profileName: name,
      })).then((ok) => {
        if (ok) showToast({ type: "success", title: (TXT[getLang()] || TXT.de).presetToast(name) });
      });
    }
  });
  root.addEventListener("change", (e) => {
    const c = e.target.closest('input[data-a="mine"]');
    if (!c) return;
    const cur = new Set(Array.isArray(store.state.prefs?.methods) ? store.state.prefs.methods : []);
    if (c.checked) cur.add(c.dataset.id); else cur.delete(c.dataset.id);
    act(() => api.prefs.save({ methods: [...cur] }));
  });

  store.subscribe(render);
  render(store.state);
  return {};
}
