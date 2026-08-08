// Profile & Settings — erreichbar über den Benutzer-Chip (vorher Sackgasse).
// Editierbar, wo ein Backend existiert (Name/Ziel/Fokusdauer/Chronotyp/Körper/
// KI-Consent → /api/profile + /api/settings). Neu: Kalender-Konten (iCloud-CalDAV/
// ICS-Abo, mehrere möglich) und Task-Erinnerungen (Push-Vorlauf).
import { escapeHtml } from "/js/util.js";
import { icon } from "/js/icons.js";
import { showToast } from "/js/toast.js";
import { confirmDialog } from "/js/dialog.js";
import { t, getLang } from "/js/i18n.js";
import { LEARN_STYLES, CHALLENGES, HELPS } from "/shared/methods.js";
import { ACCENTS, THEMES, FONT_SCALES, FOCUS_SURFACES } from "/js/adapt.js";
// Quellen-Vokabular liegt bei dem, der es auswertet (session.js) — eine Quelle
// der Wahrheit für Fokusmodus UND Einstellungen.
import { FOCUS_SOURCES, DEFAULT_FOCUS_SOURCES } from "/js/session.js";
import { HIDEABLE_VIEWS } from "/js/nav.js";

export function initProfile({ store, api }) {
  const el = (id) => document.getElementById(id);
  const nav = (view) => document.dispatchEvent(new CustomEvent("navigate", { detail: { view } }));

  el("userChip")?.addEventListener("click", () => nav("profile"));
  el("profileBack")?.addEventListener("click", () => nav("today"));

  async function act(fn) { try { store.applySnapshot(await fn()); } catch (e) { console.warn("[profile]", e.message); } }
  const saveProfile = (patch) => act(() => api.profile.save(patch));
  const saveSettings = (patch) => act(() => api.setSettings(patch));

  const pfName = el("pfName"), pfGoal = el("pfGoal"), pfFocus = el("pfFocus");
  const pfHeight = el("pfHeight"), pfWeight = el("pfWeight"), pfChrono = el("pfChrono"), pfAi = el("pfAi");
  // Timer-/Pomodoro-Settings (Backend: PUT /api/settings — liefert vollen Snapshot).
  const pfShortBreak = el("pfShortBreak"), pfLongBreak = el("pfLongBreak"), pfCycles = el("pfCycles"), pfAutoStart = el("pfAutoStart");

  pfName?.addEventListener("change", () => saveProfile({ displayName: pfName.value.trim() }));
  pfGoal?.addEventListener("change", () => { const v = Number(pfGoal.value); if (Number.isFinite(v) && v > 0) saveSettings({ todayGoalHours: v }); });
  pfFocus?.addEventListener("change", () => { const v = Number(pfFocus.value); if (Number.isFinite(v) && v >= 5) saveSettings({ focusMinutes: v }); });
  // Ganzzahl-Settings: Server sanitisiert/klemmt (short 1–30, long 5–45, cycles 2–8) und echot den geklemmten Wert.
  const intSetting = (elm, key, min) => elm?.addEventListener("change", () => { const v = Math.round(Number(elm.value)); if (Number.isFinite(v) && v >= min) saveSettings({ [key]: v }); });
  intSetting(pfShortBreak, "shortBreakMinutes", 1);
  intSetting(pfLongBreak, "longBreakMinutes", 1);
  intSetting(pfCycles, "cyclesUntilLongBreak", 1);
  pfAutoStart?.addEventListener("click", () => saveSettings({ autoStartNextPhase: !store.state.settings.autoStartNextPhase }));
  pfHeight?.addEventListener("change", () => saveProfile({ heightCm: pfHeight.value === "" ? null : Number(pfHeight.value) }));
  pfWeight?.addEventListener("change", () => saveProfile({ weightKg: pfWeight.value === "" ? null : Number(pfWeight.value) }));
  pfChrono?.addEventListener("click", (e) => { const b = e.target.closest("[data-chrono]"); if (b) saveProfile({ chronotype: b.dataset.chrono }); });
  pfAi?.addEventListener("click", () => saveProfile({ aiEnabled: !store.state.profile.aiEnabled }));

  // Export JSON — echte Momentaufnahme als Datei (Datensparsamkeit: ohne raw health).
  el("pfExport")?.addEventListener("click", async () => {
    try {
      const snap = await api.getState();
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kairos-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { console.warn("[profile]", e.message); }
  });

  function setSwitch(id, on) { const b = el(id); if (b) { b.classList.toggle("is-on", !!on); b.setAttribute("aria-checked", on ? "true" : "false"); } }

  // ── Task-Erinnerungen (Push) ─────────────────────
  el("pfRemindTasks")?.addEventListener("click", () => saveSettings({ remindTasks: !store.state.settings.remindTasks }));
  el("pfRemindLead")?.addEventListener("change", () => {
    const v = Math.round(Number(el("pfRemindLead").value));
    if (Number.isFinite(v) && v >= 0) saveSettings({ remindLeadMin: v });
  });

  // ── Kalender-Konten (iCloud-CalDAV / ICS-Abo) ────
  const calList = el("calAccounts"), calAddBtn = el("calAddBtn"), calKindSeg = el("calKindSeg");
  let accounts = [];
  let calKind = "caldav";

  calKindSeg?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-kind]");
    if (!b) return;
    calKind = b.dataset.kind;
    for (const x of calKindSeg.querySelectorAll("[data-kind]")) x.classList.toggle("is-active", x === b);
    el("calFieldsCaldav").hidden = calKind !== "caldav";
    el("calFieldsIcs").hidden = calKind !== "ics";
  });

  async function loadAccounts() {
    try {
      const res = await api.calendar.accounts();
      accounts = res.accounts || [];
      renderAccounts();
    } catch (e) { console.warn("[profile]", e.message); }
  }

  function relTime(ms) {
    if (!ms) return t("cal.never");
    const diff = Date.now() - ms;
    if (diff < 90_000) return t("cal.synced_rel", { t: t("cal.just_now") });
    if (diff < 3_600_000) return t("cal.synced_rel", { t: t("cal.min_ago", { n: Math.round(diff / 60_000) }) });
    return t("cal.synced_rel", { t: t("cal.h_ago", { n: Math.round(diff / 3_600_000) }) });
  }

  function renderAccounts() {
    if (!calList) return;
    calList.innerHTML = accounts.map((a) => {
      const cals = (a.calendars || []).map((c) => `
        <label class="cal-acc__cal"><input type="checkbox" data-cal-id="${escapeHtml(String(c.id))}"${c.enabled ? " checked" : ""} />${escapeHtml(c.name || t("cal.unnamed"))}</label>`).join("");
      return `<div class="cal-acc" data-id="${escapeHtml(String(a.id))}">
        <div class="cal-acc__top">
          <span class="cal-acc__ic">${icon(a.kind === "ics" ? "link" : "calendar", { size: 16 })}</span>
          <div class="cal-acc__id">
            <div class="cal-acc__name">${escapeHtml(a.label || a.username || a.baseUrl || t("cal.unnamed"))}</div>
            <div class="cal-acc__meta">${a.kind === "ics" ? "ICS" : "iCloud · CalDAV"} · ${escapeHtml(relTime(a.lastSyncAt))} · ${escapeHtml(t("cal.events_n", { n: a.eventCount ?? 0 }))}</div>
            ${a.lastError ? `<div class="cal-acc__err">${icon("warning", { size: 13 })}<span>${escapeHtml(a.lastError)}</span></div>` : ""}
          </div>
          <div class="cal-acc__actions">
            <button type="button" class="icon-btn icon-btn--bare" data-act="cal-sync" title="${escapeHtml(t("cal.sync"))}" aria-label="${escapeHtml(t("cal.sync"))}">${icon("reset", { size: 16 })}</button>
            <button type="button" class="icon-btn icon-btn--bare icon-btn--danger" data-act="cal-del" title="${escapeHtml(t("cal.remove"))}" aria-label="${escapeHtml(t("cal.remove"))}">${icon("close", { size: 16 })}</button>
          </div>
        </div>
        ${cals ? `<div class="cal-acc__cals">${cals}</div>` : ""}
      </div>`;
    }).join("");
  }

  calList?.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const id = Number(row.dataset.id);
    if (e.target.closest('[data-act="cal-sync"]')) {
      try {
        const res = await api.calendar.syncAccount(id);
        store.applySnapshot(res);
        showToast({ type: "success", title: t("cal.synced_now") });
      } catch (err) { console.warn("[profile]", err.message); }
      loadAccounts();
      return;
    }
    if (e.target.closest('[data-act="cal-del"]')) {
      const ok = await confirmDialog({
        title: t("cal.remove_q_title"), body: t("cal.remove_q_body"),
        confirmLabel: t("cal.remove"), cancelLabel: t("common.cancel"),
      });
      if (!ok) return;
      await act(() => api.calendar.removeAccount(id));
      loadAccounts();
    }
  });
  calList?.addEventListener("change", async (e) => {
    const cb = e.target.closest("[data-cal-id]");
    if (!cb) return;
    await act(() => api.calendar.setCalendarEnabled(Number(cb.dataset.calId), cb.checked));
    loadAccounts();
  });

  calAddBtn?.addEventListener("click", async () => {
    if (calAddBtn.disabled) return;
    const data = calKind === "ics"
      ? { kind: "ics", url: el("calUrl")?.value.trim() }
      : { kind: "caldav", username: el("calUser")?.value.trim(), password: el("calPass")?.value };
    if (calKind === "ics" && !data.url) return;
    if (calKind === "caldav" && (!data.username || !data.password)) return;
    calAddBtn.disabled = true;
    const prevLabel = calAddBtn.textContent;
    calAddBtn.textContent = t("cal.connecting");
    try {
      const res = await api.calendar.addAccount(data);
      store.applySnapshot(res);
      showToast({ type: "success", title: t("cal.added", { n: res.account?.calendars?.length ?? 1 }) });
      if (el("calUser")) el("calUser").value = "";
      if (el("calPass")) el("calPass").value = "";
      if (el("calUrl")) el("calUrl").value = "";
      loadAccounts();
    } catch (err) {
      console.warn("[profile]", err.message);   // api.js hat den Fehler bereits getoastet
    } finally {
      calAddBtn.disabled = false;
      calAddBtn.textContent = prevLabel;
    }
  });

  loadAccounts();

  function render() {
    const p = store.state.profile || {}, s = store.state.settings || {};
    const name = p.displayName || "";
    if (pfName && document.activeElement !== pfName) pfName.value = name;
    if (el("profileAvatar")) el("profileAvatar").textContent = (name.trim()[0] || "K").toUpperCase();
    if (pfGoal && document.activeElement !== pfGoal) pfGoal.value = s.todayGoalHours != null ? s.todayGoalHours : 4;
    if (pfFocus && document.activeElement !== pfFocus) pfFocus.value = s.focusMinutes != null ? s.focusMinutes : 25;
    if (pfShortBreak && document.activeElement !== pfShortBreak) pfShortBreak.value = s.shortBreakMinutes != null ? s.shortBreakMinutes : 5;
    if (pfLongBreak && document.activeElement !== pfLongBreak) pfLongBreak.value = s.longBreakMinutes != null ? s.longBreakMinutes : 15;
    if (pfCycles && document.activeElement !== pfCycles) pfCycles.value = s.cyclesUntilLongBreak != null ? s.cyclesUntilLongBreak : 4;
    if (pfHeight && document.activeElement !== pfHeight) pfHeight.value = p.heightCm != null ? p.heightCm : "";
    if (pfWeight && document.activeElement !== pfWeight) pfWeight.value = p.weightKg != null ? p.weightKg : "";
    if (pfChrono) for (const b of pfChrono.querySelectorAll("[data-chrono]")) b.classList.toggle("is-active", b.dataset.chrono === (p.chronotype || "intermediate"));

    const win = (p.targetBedtime && p.targetWakeTime) ? `${p.targetBedtime}–${p.targetWakeTime}` : "";
    if (el("pfSleepWindow")) el("pfSleepWindow").textContent = win;
    if (el("pfConsent")) el("pfConsent").textContent = p.dataConsentAt
      ? `consented ${new Date(p.dataConsentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
      : "follows AI consent";

    setSwitch("pfAutoStart", s.autoStartNextPhase);
    setSwitch("pfRemindTasks", s.remindTasks !== false);
    const leadEl = el("pfRemindLead");
    if (leadEl && document.activeElement !== leadEl) leadEl.value = s.remindLeadMin != null ? s.remindLeadMin : 10;
    setSwitch("pfAi", p.aiEnabled);
    setSwitch("pfShare", p.aiEnabled);
    setSwitch("pfCycle", String(p.sex).toLowerCase() === "female");
    setSwitch("pfSleep", !!win);
  }

  // ═══════════ Wave 6: Lernprofil · Darstellung · Features · Geteilte Links ═══════════
  const W6 = {
    de: {
      learnTitle: "Lernprofil",
      learnEmpty: "Noch keine Analyse — beantworte 5 kurze Fragen, dann passt sich Kairos an (Methoden, KI, Darstellung).",
      styles: "Lernwege", challenges: "Herausforderungen", helps: "Das hilft dir",
      methodsN: (n) => `${n} Methoden aktiv`,
      rerun: "Analyse durchlaufen", methodsBtn: "Methoden ansehen",
      lookTitle: "Darstellung",
      accent: "Akzentfarbe", theme: "Helligkeit", font: "Schriftgröße", density: "Dichte",
      densities: [["cozy", "Luftig"], ["compact", "Kompakt"]],
      focusTitle: "Fokusmodus",
      focusSurface: "Fokusfläche",
      focusHint: "„Gedämpft“ senkt den Fokusmodus bewusst ab — in deiner Akzentfarbe getönt. „Wie App“ nimmt exakt die Farben der übrigen Ansichten.",
      focusSourcesTitle: "Welche Unterlagen liegen bereit",
      focusSourcesHint: "Im Fokusblock erscheint nur, was zur Aufgabe gehört. Angepinntes hat keinen Bezug zur Aufgabe — deshalb ist es aus.",
      reduceMotion: "Weniger Animationen", highContrast: "Hoher Kontrast",
      dyslexia: "Lesefreundliche Typografie (Legasthenie)", numberFriendly: "Zahlenarme Ansicht (Dyskalkulie)",
      featTitle: "Bereiche ein-/ausblenden",
      featSub: "Weniger ist mehr: Blende aus, was dich optisch verwirrt. Heute + Profil bleiben immer.",
      sharesTitle: "Geteilte Links",
      sharesEmpty: "Noch nichts geteilt. Teilen-Knöpfe findest du bei Prüfungen (Lernroute), in der Bibliothek und an Notizen.",
      sharesViews: (n) => `${n}× geöffnet`,
      revoke: "Widerrufen",
      revoked: "Link widerrufen",
      copy: "Link kopieren",
      copied: "Link kopiert",
      kinds: { exam: "Prüfungsplan", topic: "Thema", note: "Notiz", material: "Material" },
    },
    en: {
      learnTitle: "Learning profile",
      learnEmpty: "No analysis yet — answer 5 quick questions and Kairos adapts (methods, AI, appearance).",
      styles: "Ways of learning", challenges: "Challenges", helps: "What helps you",
      methodsN: (n) => `${n} methods active`,
      rerun: "Run the analysis", methodsBtn: "View methods",
      lookTitle: "Appearance",
      accent: "Accent colour", theme: "Brightness", font: "Font size", density: "Density",
      densities: [["cozy", "Cozy"], ["compact", "Compact"]],
      focusTitle: "Focus mode",
      focusSurface: "Focus surface",
      focusHint: "“Dimmed” deliberately lowers the focus mode — tinted with your accent colour. “Match app” uses exactly the colours of the other views.",
      focusSourcesTitle: "What’s waiting there",
      focusSourcesHint: "A focus block only shows what belongs to the task. Pinned items have no link to the task — that’s why they’re off.",
      reduceMotion: "Reduce motion", highContrast: "High contrast",
      dyslexia: "Reading-friendly typography (dyslexia)", numberFriendly: "Number-light view (dyscalculia)",
      featTitle: "Show/hide areas",
      featSub: "Less is more: hide what visually distracts you. Today + profile always stay.",
      sharesTitle: "Shared links",
      sharesEmpty: "Nothing shared yet. Share buttons live on exams (learning path), in the library and on notes.",
      sharesViews: (n) => `opened ${n}×`,
      revoke: "Revoke",
      revoked: "Link revoked",
      copy: "Copy link",
      copied: "Link copied",
      kinds: { exam: "exam plan", topic: "topic", note: "note", material: "material" },
    },
  };
  const w6root = el("profileWave6");
  let shares = null;
  let sharesLoading = false;

  const w6 = () => W6[getLang()] || W6.de;
  const prefsOf = () => store.state.prefs || {};
  const savePrefs = (patch) => act(() => api.prefs.save(patch));
  const appearance = () => ({ accent: "sage", theme: "system", fontScale: "m", density: "cozy", focusSurface: "dim", ...(prefsOf().appearance || {}) });
  const access = () => ({ reduceMotion: false, highContrast: false, dyslexiaFont: false, numberFriendly: false, ...(prefsOf().access || {}) });
  const focusSources = () => ({ ...DEFAULT_FOCUS_SOURCES, ...(prefsOf().focusSources || {}) });
  const todayWidgets = () => ({ checkin: true, attention: true, next: false, timeline: true, open: true, capacity: false, ...(prefsOf().todayWidgets || {}) });
  const todayLayout = () => {
    const out = { split: "balanced", order: ["checkin", "next", "timeline", "open"], ...(prefsOf().todayLayout || {}) };
    out.order = out.order.flatMap((k) => k === "workspace" ? ["timeline", "open"] : [k]).filter((k) => k !== "attention");
    return out;
  };

  async function loadShares() {
    if (sharesLoading) return;
    sharesLoading = true;
    try { shares = (await api.shares.list()).shares; }
    catch (e) { console.warn("[profile]", e.message); shares = shares || []; }
    sharesLoading = false;
    renderW6();
  }

  function chipRow(label, items, list) {
    if (!items.length) return "";
    // Icon aus dem Katalog (shared/methods.js) + Klartext — der Text bleibt
    // escaped, das Icon-SVG wird bewusst als Markup eingesetzt.
    const entry = (id) => list.find((x) => x.id === id);
    const chip = (id) => {
      const item = entry(id);
      const text = item ? item[getLang()] || item.de : id;
      return `<span class="w6-chip ico-row">${item?.icon ? icon(item.icon) : ""}${escapeHtml(text)}</span>`;
    };
    return `<div class="w6-chiprow"><span class="w6-chiprow__label">${escapeHtml(label)}</span>
      <span class="w6-chips">${items.map(chip).join("")}</span></div>`;
  }

  function renderW6() {
    if (!w6root) return;
    if (w6root.closest(".view")?.hidden) return;
    if (shares === null) loadShares();
    const x = w6();
    const p = prefsOf();
    const a = appearance();
    const acc = access();
    const src = focusSources();
    const styles = Array.isArray(p.learnStyles) ? p.learnStyles : [];
    const challenges = Array.isArray(p.challenges) ? p.challenges : [];
    const helps = Array.isArray(p.helps) ? p.helps : [];
    const hidden = new Set(Array.isArray(p.hiddenViews) ? p.hiddenViews : []);
    const hasProfile = styles.length || challenges.length || helps.length;
    const tw = todayWidgets(), tl = todayLayout();
    const ty = getLang() === "de"
      ? { title:"Today anpassen", sub:"Zeige nur, was dir heute wirklich hilft. Reihenfolge und Platz werden gespeichert.", split:"Platzverteilung", balanced:"Ausgeglichen", plan:"Mehr Tagesplan", tasks:"Mehr Inbox", show:"Sichtbare Bereiche", order:"Reihenfolge", checkin:"Tagesform", next:"Nächster Schritt", timeline:"Tagesplan", open:"Inbox", capacity:"Kapazitätsdetails" }
      : { title:"Customise Today", sub:"Show only what helps you today. Order and space are saved.", split:"Space", balanced:"Balanced", plan:"More day plan", tasks:"More Inbox", show:"Visible areas", order:"Order", checkin:"Today’s pace", next:"Next step", timeline:"Day plan", open:"Inbox", capacity:"Capacity details" };

    w6root.innerHTML = `
      <div class="profile-cols w6-cols">
        <div class="profile-col">
          <div class="card profile-card">
            <div class="profile-card__title">${escapeHtml(x.learnTitle)}</div>
            ${hasProfile ? `
              ${chipRow(x.styles, styles, LEARN_STYLES)}
              ${chipRow(x.challenges, challenges, CHALLENGES)}
              ${chipRow(x.helps, helps, HELPS)}
              <div class="w6-methods-n">${escapeHtml(x.methodsN((p.methods || []).length))}</div>
            ` : `<p class="profile-hint">${escapeHtml(x.learnEmpty)}</p>`}
            <div class="profile-actions">
              <button class="btn btn--primary btn--sm" data-w6="rerun">${escapeHtml(x.rerun)}</button>
              <button class="btn btn--ghost btn--sm" data-w6="knowledge">${escapeHtml(x.methodsBtn)}</button>
            </div>
          </div>

          <div class="card profile-card">
            <div class="profile-card__title">${escapeHtml(x.featTitle)}</div>
            <p class="profile-hint" style="margin-top:0">${escapeHtml(x.featSub)}</p>
            <div class="w6-features">
              ${HIDEABLE_VIEWS.map((v) => `
                <label class="w6-feature"><input type="checkbox" data-w6-view="${v}" ${hidden.has(v) ? "" : "checked"} /> ${escapeHtml(t("nav." + v))}</label>`).join("")}
            </div>
          </div>

          <div class="card profile-card today-settings">
            <div class="profile-card__title">${escapeHtml(ty.title)}</div>
            <p class="profile-hint" style="margin-top:0">${escapeHtml(ty.sub)}</p>
            <div class="w6-look__label">${escapeHtml(ty.show)}</div>
            <div class="w6-features today-settings__checks">
              ${["checkin","next","timeline","open","capacity"].map((k) => `<label class="w6-feature"><input type="checkbox" data-w6-today="${k}" ${tw[k] ? "checked" : ""}> ${escapeHtml(ty[k])}</label>`).join("")}
            </div>
            <div class="w6-look__row today-settings__split"><span>${escapeHtml(ty.split)}</span><span class="seg profile-seg">${[["balanced",ty.balanced],["plan",ty.plan],["tasks",ty.tasks]].map(([k,l]) => `<button class="seg__btn${tl.split === k ? " is-active" : ""}" data-w6-today-split="${k}" type="button">${escapeHtml(l)}</button>`).join("")}</span></div>
            <div class="w6-look__label">${escapeHtml(ty.order)}</div>
            <div class="today-settings__order">${tl.order.map((k, i) => `<div class="today-settings__row"><span class="today-settings__grip">⠿</span><span>${escapeHtml(ty[k])}</span><span class="today-settings__arrows"><button type="button" data-w6-today-move="${k}:up" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" data-w6-today-move="${k}:down" ${i === tl.order.length - 1 ? "disabled" : ""}>↓</button></span></div>`).join("")}</div>
          </div>
        </div>

        <div class="profile-col">
          <div class="card profile-card">
            <div class="profile-card__title">${escapeHtml(x.lookTitle)}</div>
            <div class="w6-look">
              <div class="w6-look__row"><span>${escapeHtml(x.accent)}</span>
                <span class="onb__swatches w6-swatches">
                  ${ACCENTS.map((c) => `<button class="onb__swatch${a.accent === c.id ? " is-active" : ""}" data-w6-accent="${c.id}" style="--sw:${c.color}" title="${escapeHtml(c.en)}" type="button"></button>`).join("")}
                </span>
              </div>
              <div class="w6-look__row"><span>${escapeHtml(x.theme)}</span>
                <span class="seg profile-seg">${THEMES.map((th) => `<button class="seg__btn${a.theme === th.id ? " is-active" : ""}" data-w6-theme="${th.id}" type="button">${escapeHtml(getLang() === "de" ? th.de : th.en)}</button>`).join("")}</span>
              </div>
              <div class="w6-look__row"><span>${escapeHtml(x.font)}</span>
                <span class="seg profile-seg">${FONT_SCALES.map((f) => `<button class="seg__btn${a.fontScale === f.id ? " is-active" : ""}" data-w6-font="${f.id}" type="button">${f.id.toUpperCase()}</button>`).join("")}</span>
              </div>
              <div class="w6-look__row"><span>${escapeHtml(x.density)}</span>
                <span class="seg profile-seg">${x.densities.map(([k, l]) => `<button class="seg__btn${a.density === k ? " is-active" : ""}" data-w6-density="${k}" type="button">${escapeHtml(l)}</button>`).join("")}</span>
              </div>
            </div>
          </div>

          <div class="card profile-card">
            <div class="profile-card__title">${escapeHtml(x.focusTitle)}</div>
            <div class="w6-look">
              <div class="w6-look__row"><span>${escapeHtml(x.focusSurface)}</span>
                <span class="seg profile-seg">${FOCUS_SURFACES.map((f) => `<button class="seg__btn${a.focusSurface === f.id ? " is-active" : ""}" data-w6-focus="${f.id}" type="button">${escapeHtml(getLang() === "en" ? f.en : f.de)}</button>`).join("")}</span>
              </div>
              <p class="profile-hint w6-look__hint">${escapeHtml(x.focusHint)}</p>
              <div class="w6-look__label">${escapeHtml(x.focusSourcesTitle)}</div>
              <p class="profile-hint w6-look__hint">${escapeHtml(x.focusSourcesHint)}</p>
              <div class="w6-features">
                ${FOCUS_SOURCES.map((s) => `
                  <label class="w6-feature"><input type="checkbox" data-w6-src="${s.id}" ${src[s.id] ? "checked" : ""} /> ${escapeHtml(getLang() === "en" ? s.en : s.de)}<span class="w6-feature__hint">${escapeHtml(getLang() === "en" ? s.enHint : s.deHint)}</span></label>`).join("")}
              </div>
              ${[["reduceMotion", x.reduceMotion], ["highContrast", x.highContrast], ["dyslexiaFont", x.dyslexia], ["numberFriendly", x.numberFriendly]]
                .map(([k, l]) => `<label class="w6-feature"><input type="checkbox" data-w6-access="${k}" ${acc[k] ? "checked" : ""} /> ${escapeHtml(l)}</label>`).join("")}
            </div>
          </div>

          <div class="card profile-card">
            <div class="profile-card__title">${escapeHtml(x.sharesTitle)}</div>
            ${(shares && shares.length) ? `<div class="w6-shares">
              ${shares.map((sh) => `
                <div class="w6-share" data-share="${sh.id}">
                  <span class="w6-share__kind">${escapeHtml(x.kinds[sh.kind] || sh.kind)}</span>
                  <span class="w6-share__meta">${escapeHtml(x.sharesViews(sh.viewCount || 0))}</span>
                  <button class="btn btn--ghost btn--sm" data-w6-copy="${escapeHtml(sh.url)}">${escapeHtml(x.copy)}</button>
                  <button class="btn btn--ghost btn--sm btn--danger" data-w6-revoke="${sh.id}">${escapeHtml(x.revoke)}</button>
                </div>`).join("")}
            </div>` : `<p class="profile-hint" style="margin-top:0">${escapeHtml(x.sharesEmpty)}</p>`}
          </div>
        </div>
      </div>`;
  }

  w6root?.addEventListener("click", async (e) => {
    const x = w6();
    if (e.target.closest('[data-w6="rerun"]')) {
      document.dispatchEvent(new CustomEvent("restart-onboarding"));
      return;
    }
    if (e.target.closest('[data-w6="knowledge"]')) {
      nav("knowledge");
      return;
    }
    const accBtn = e.target.closest("[data-w6-accent]");
    if (accBtn) { savePrefs({ appearance: { ...appearance(), accent: accBtn.dataset.w6Accent } }); return; }
    const themeBtn = e.target.closest("[data-w6-theme]");
    if (themeBtn) { savePrefs({ appearance: { ...appearance(), theme: themeBtn.dataset.w6Theme } }); return; }
    const fontBtn = e.target.closest("[data-w6-font]");
    if (fontBtn) { savePrefs({ appearance: { ...appearance(), fontScale: fontBtn.dataset.w6Font } }); return; }
    const densBtn = e.target.closest("[data-w6-density]");
    if (densBtn) { savePrefs({ appearance: { ...appearance(), density: densBtn.dataset.w6Density } }); return; }
    const focusBtn = e.target.closest("[data-w6-focus]");
    if (focusBtn) { savePrefs({ appearance: { ...appearance(), focusSurface: focusBtn.dataset.w6Focus } }); return; }
    const splitBtn = e.target.closest("[data-w6-today-split]");
    if (splitBtn) { savePrefs({ todayLayout: { ...todayLayout(), split: splitBtn.dataset.w6TodaySplit } }); return; }
    const moveBtn = e.target.closest("[data-w6-today-move]");
    if (moveBtn) {
      const [key, direction] = moveBtn.dataset.w6TodayMove.split(":");
      const order = [...todayLayout().order], from = order.indexOf(key), to = from + (direction === "up" ? -1 : 1);
      if (from >= 0 && to >= 0 && to < order.length) [order[from], order[to]] = [order[to], order[from]];
      savePrefs({ todayLayout: { ...todayLayout(), order } }); return;
    }
    const copyBtn = e.target.closest("[data-w6-copy]");
    if (copyBtn) {
      const url = new URL(copyBtn.dataset.w6Copy, location.origin).href;
      try { await navigator.clipboard.writeText(url); showToast({ type: "success", title: x.copied, body: url }); }
      catch { showToast({ type: "warn", title: url }); }
      return;
    }
    const revokeBtn = e.target.closest("[data-w6-revoke]");
    if (revokeBtn) {
      try {
        await api.shares.revoke(Number(revokeBtn.dataset.w6Revoke));
        showToast({ type: "success", title: x.revoked });
        shares = null;
        loadShares();
      } catch (err) { console.warn("[profile]", err.message); }
    }
  });
  w6root?.addEventListener("change", (e) => {
    const viewCb = e.target.closest("[data-w6-view]");
    if (viewCb) {
      const hidden = new Set(Array.isArray(prefsOf().hiddenViews) ? prefsOf().hiddenViews : []);
      if (viewCb.checked) hidden.delete(viewCb.dataset.w6View);
      else hidden.add(viewCb.dataset.w6View);
      savePrefs({ hiddenViews: [...hidden] });
      return;
    }
    const accessCb = e.target.closest("[data-w6-access]");
    const todayCb = e.target.closest("[data-w6-today]");
    if (todayCb) { savePrefs({ todayWidgets: { [todayCb.dataset.w6Today]: todayCb.checked } }); return; }
    if (accessCb) {
      savePrefs({ access: { ...access(), [accessCb.dataset.w6Access]: accessCb.checked } });
      return;
    }
    const srcCb = e.target.closest("[data-w6-src]");
    if (srcCb) {
      savePrefs({ focusSources: { ...focusSources(), [srcCb.dataset.w6Src]: srcCb.checked } });
    }
  });

  let lastW6Json = "";
  store.subscribe((s) => {
    const json = JSON.stringify([s.prefs, getLang(), shares?.length]);
    if (json !== lastW6Json) { lastW6Json = json; renderW6(); }
  });
  document.addEventListener("navigate", (e) => {
    if (e.detail?.view === "profile") setTimeout(renderW6, 0);
  });
  renderW6();

  store.subscribe(render);
  render();
  return {};
}
