// Today-Kopf & Kontext:
//  · Aufmerksamkeits-Leiste („was brennt?") — überfällig / heute fällig /
//    fällige Wiederholungen / nächste Prüfung. Rendert NUR, was wirklich anliegt.
//  · Tageslast als Balken: gemessene Fokuszeit + geplante Restzeit gegen das
//    readiness-angepasste Tagesziel. Der Ring bleibt exklusiv dem Timer.
//  · „Plan my day" (server-seitiger Auto-Plan) — jetzt MIT Undo, weil der
//    Aufruf den kompletten Tagesplan überschreibt.
// Alle Zahlen kommen aus store.state bzw. der API. Fehlt eine Quelle, bleibt die
// Stelle leer — es wird nichts geschätzt und keine Abwesenheit vermeldet.
import { dayKeyOf, escapeHtml, daysUntil } from "/js/util.js";
import { showToast } from "/js/toast.js";
import { icon } from "/js/icons.js";
import { t, getLang } from "/js/i18n.js";

const round1 = (n) => Math.round(n * 10) / 10;
const MS_PER_H = 3_600_000;

export function initToday({ store, api }) {
  const el = (id) => document.getElementById(id);
  const valEl = el("capacityValue"), noteEl = el("capacityNote"), legendEl = el("loadLegend");
  const meter = el("capacityCard"), doneSeg = el("loadDone"), plannedSeg = el("loadPlanned");
  const attentionEl = el("todayAttention");
  const planBtn = el("planDayBtn");
  const intent = el("dayIntent"), intentChoices = el("dayIntentChoices"), intentResponse = el("dayIntentResponse");
  const view = el("viewToday"), viewBtn = el("todayViewBtn"), viewPanel = el("todayViewPanel");
  const sizesPanel = el("todayContainerSizes");

  let attentionSig = null;

  // Today ist ein persönlicher Workspace. Die Defaults zeigen nur Dinge, die
  // unmittelbar eine Entscheidung oder Handlung ermöglichen; Detailmetriken
  // sind opt-in. Kein Bereich hinterlässt beim Ausblenden eine leere Spalte.
  const WIDGET_DEFAULTS = { checkin: true, attention: true, next: false, timeline: true, open: true, capacity: false };
  const SIZE_DEFAULTS = {
    checkin: { columns: 12, height: 190 }, attention: { columns: 12, height: 80 },
    next: { columns: 12, height: 130 }, timeline: { columns: 8, height: 520 }, open: { columns: 4, height: 520 },
  };
  const widgets = () => ({ ...WIDGET_DEFAULTS, ...(store.state.prefs?.todayWidgets || {}) });

  function renderWidgetPrefs() {
    if (!view) return;
    const w = widgets();
    for (const [key, visible] of Object.entries(w)) view.classList.toggle(`tw-hide-${key}`, !visible);
    view.classList.toggle("tw-only-timeline", w.timeline && !w.open);
    view.classList.toggle("tw-only-open", !w.timeline && w.open);
    view.classList.toggle("tw-no-workspace", !w.timeline && !w.open);
    const layout = { split: "balanced", order: ["checkin", "next", "timeline", "open"], ...(store.state.prefs?.todayLayout || {}) };
    if (layout.order.includes("workspace")) layout.order = layout.order.flatMap((k) => k === "workspace" ? ["timeline", "open"] : [k]);
    layout.order = layout.order.filter((k) => k !== "attention");
    view.dataset.todaySplit = ["plan", "tasks"].includes(layout.split) ? layout.split : "balanced";
    const blocks = { checkin: intent, attention: attentionEl, next: el("nextTaskCard")?.parentElement, timeline: el("todayPlanCard"), open: el("unscheduledCard")?.parentElement };
    const savedSizes = layout.sizes || {};
    for (const [key, node] of Object.entries(blocks)) {
      if (!node || !SIZE_DEFAULTS[key]) continue;
      const size = { ...SIZE_DEFAULTS[key], ...(savedSizes[key] || {}) };
      const columns = Math.max(2, Math.min(12, Number(size.columns) || SIZE_DEFAULTS[key].columns));
      const height = Math.max(70, Math.min(1000, Number(size.height) || SIZE_DEFAULTS[key].height));
      node.style.gridColumn = `span ${columns}`;
      node.style.height = `${height}px`;
      node.style.minHeight = `${height}px`;
    }
    layout.order.forEach((key, index) => { if (blocks[key]) blocks[key].style.order = String(index + 1); });
    for (const input of viewPanel?.querySelectorAll("[data-today-widget]") || []) input.checked = !!w[input.dataset.todayWidget];
    const de = getLang() === "de";
    const labels = de ? {
      todayViewBtnLabel: "Ansicht", todayViewTitle: "Auf Heute anzeigen",
      todayWidgetCheckin: "Tagesform",
      todayWidgetAttention: "Hinweise",
      todayWidgetNext: "Nächster Schritt", todayWidgetTimeline: "Tagesplan",
      todayWidgetOpen: "Inbox", todayWidgetCapacity: "Kapazitätsdetails",
      todayWidgetsAll: "Alle an", todayWidgetsNone: "Alle aus", todaySizeTitle: "Größe je Container",
    } : {
      todayViewBtnLabel: "View", todayViewTitle: "Show on Today",
      todayWidgetCheckin: "Today’s pace",
      todayWidgetAttention: "Attention",
      todayWidgetNext: "Next step", todayWidgetTimeline: "Day plan",
      todayWidgetOpen: "Inbox", todayWidgetCapacity: "Capacity details",
      todayWidgetsAll: "All on", todayWidgetsNone: "All off", todaySizeTitle: "Size per container",
    };
    for (const [id, label] of Object.entries(labels)) if (el(id)) el(id).textContent = label;
    if (sizesPanel) sizesPanel.innerHTML = `<div class="today-viewmenu__sizetitle">${labels.todaySizeTitle}</div>` + Object.keys(SIZE_DEFAULTS).map((key) => {
      const size = { ...SIZE_DEFAULTS[key], ...(savedSizes[key] || {}) };
      const name = labels[`todayWidget${key[0].toUpperCase()}${key.slice(1)}`];
      return `<div class="today-viewmenu__size"><strong>${name}</strong>
        <label><span>${de ? "Breite" : "Width"}</span><input type="range" min="2" max="12" step="1" value="${size.columns}" data-today-size="${key}" data-size-axis="columns"><output>${Math.round(size.columns / 12 * 100)}%</output></label>
        <label><span>${de ? "Höhe" : "Height"}</span><input type="range" min="70" max="1000" step="10" value="${size.height}" data-today-size="${key}" data-size-axis="height"><output>${size.height} px</output></label>
      </div>`;
    }).join("");
  }

  function closeViewMenu() { if (viewPanel) viewPanel.hidden = true; viewBtn?.setAttribute("aria-expanded", "false"); }
  viewBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = viewPanel.hidden;
    viewPanel.hidden = !open;
    viewBtn.setAttribute("aria-expanded", String(open));
  });
  viewPanel?.addEventListener("click", (e) => e.stopPropagation());
  viewPanel?.addEventListener("change", async (e) => {
    const key = e.target.dataset.todayWidget;
    if (!key) {
      const sizeKey = e.target.dataset.todaySize, axis = e.target.dataset.sizeAxis;
      if (!SIZE_DEFAULTS[sizeKey] || !["columns", "height"].includes(axis)) return;
      const currentLayout = { ...(store.state.prefs?.todayLayout || {}) };
      const sizes = { ...(currentLayout.sizes || {}), [sizeKey]: { ...SIZE_DEFAULTS[sizeKey], ...(currentLayout.sizes?.[sizeKey] || {}), [axis]: Number(e.target.value) } };
      try {
        store.applySnapshot(await api.prefs.save({ todayLayout: { ...currentLayout, sizes } }));
      } catch (err) { console.warn("[today layout]", err.message); }
      return;
    }
    try {
      const snap = await api.prefs.save({ todayWidgets: { [key]: e.target.checked } });
      store.applySnapshot(snap);
    } catch (err) { e.target.checked = !e.target.checked; console.warn("[today widgets]", err.message); }
  });
  async function setAllWidgets(visible) {
    const todayWidgets = Object.fromEntries(Object.keys(WIDGET_DEFAULTS).map((key) => [key, visible]));
    try { store.applySnapshot(await api.prefs.save({ todayWidgets })); }
    catch (err) { console.warn("[today widgets]", err.message); }
  }
  el("todayWidgetsAll")?.addEventListener("click", () => setAllWidgets(true));
  el("todayWidgetsNone")?.addEventListener("click", () => setAllWidgets(false));
  sizesPanel?.addEventListener("input", (e) => {
    const key = e.target.dataset.todaySize, axis = e.target.dataset.sizeAxis;
    const node = gridBlocks[key];
    if (!node || !axis) return;
    if (axis === "columns") node.style.gridColumn = `span ${e.target.value}`;
    if (axis === "height") { node.style.height = `${e.target.value}px`; node.style.minHeight = `${e.target.value}px`; }
    const output = e.target.parentElement.querySelector("output");
    if (output) output.textContent = axis === "columns" ? `${Math.round(Number(e.target.value) / 12 * 100)}%` : `${e.target.value} px`;
  });
  document.addEventListener("click", closeViewMenu);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeViewMenu(); });

  // Echtes Dashboard-Grid: freie Reihenfolge per Drag-and-drop. Interaktive
  // Inhalte (Buttons, Inputs, Links) bleiben normal bedienbar; gezogen wird an
  // der freien Kartenfläche. Die Reihenfolge wird kontoweit gespeichert.
  const gridBlocks = {
    checkin: intent, attention: attentionEl, next: el("nextTaskCard")?.parentElement,
    timeline: el("todayPlanCard"), open: el("unscheduledCard")?.parentElement,
  };
  for (const [key, node] of Object.entries(gridBlocks)) {
    if (!node) continue;
    node.classList.add("today-grid-item");
    node.dataset.gridWidget = key;
    node.draggable = true;
  }
  let dragging = null;
  view?.addEventListener("dragstart", (e) => {
    const item = e.target.closest("[data-grid-widget]");
    if (!item || e.target.closest("button,input,textarea,select,a,[contenteditable]")) { e.preventDefault(); return; }
    dragging = item.dataset.gridWidget;
    item.classList.add("is-grid-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragging);
  });
  view?.addEventListener("dragover", (e) => {
    const over = e.target.closest("[data-grid-widget]");
    if (!dragging || !over || over.dataset.gridWidget === dragging) return;
    e.preventDefault(); over.classList.add("is-grid-over");
  });
  view?.addEventListener("dragleave", (e) => e.target.closest("[data-grid-widget]")?.classList.remove("is-grid-over"));
  view?.addEventListener("drop", async (e) => {
    const over = e.target.closest("[data-grid-widget]");
    if (!dragging || !over) return;
    e.preventDefault();
    const current = store.state.prefs?.todayLayout?.order || ["checkin", "next", "timeline", "open"];
    const order = current.flatMap((k) => k === "workspace" ? ["timeline", "open"] : [k]).filter((k) => k !== dragging && k !== "attention");
    order.splice(Math.max(0, order.indexOf(over.dataset.gridWidget)), 0, dragging);
    try { store.applySnapshot(await api.prefs.save({ todayLayout: { ...(store.state.prefs?.todayLayout || {}), order } })); }
    catch (err) { console.warn("[today grid]", err.message); }
  });
  view?.addEventListener("dragend", () => {
    dragging = null;
    for (const node of Object.values(gridBlocks)) node?.classList.remove("is-grid-dragging", "is-grid-over");
  });

  const go = (view) => document.dispatchEvent(new CustomEvent("navigate", { detail: { view } }));

  const ENERGY = {
    gentle: { multiplier: .65, de: "Wir halten den Tag klein. Ein sinnvoller Schritt reicht.", en: "We’ll keep today light. One meaningful step is enough." },
    steady: { multiplier: 1, de: "Ein ruhiger, realistischer Rhythmus — ohne den Tag vollzustopfen.", en: "A calm, realistic pace — without filling every gap." },
    strong: { multiplier: 1.15, de: "Heute ist mehr Spielraum da. Pausen bleiben trotzdem Teil des Plans.", en: "There’s more room today. Breaks still stay part of the plan." },
  };
  const todayCheckIn = () => {
    const c = store.state.prefs?.todayCheckIn;
    return c?.dayKey === dayKeyOf(store.now()) && ENERGY[c.energy] ? c.energy : null;
  };

  function renderIntent() {
    if (!intent) return;
    const de = getLang() === "de";
    el("dayIntentEyebrow").textContent = de ? "Dein Tempo heute" : "Today’s pace";
    el("dayIntentTitle").textContent = de ? "Was für ein Tag ist heute möglich?" : "What kind of day is possible today?";
    el("dayIntentHint").textContent = de ? "Nicht, was du schaffen solltest — sondern was sich realistisch anfühlt." : "Not what you should manage — what feels realistic.";
    const copy = de
      ? { gentle: ["Sanft", "Weniger ist genug"], steady: ["Stabil", "Ein normaler Rhythmus"], strong: ["Viel Energie", "Heute ist mehr möglich"] }
      : { gentle: ["Gentle", "Less is enough"], steady: ["Steady", "A normal pace"], strong: ["Plenty", "Room for more"] };
    const selected = todayCheckIn();
    for (const btn of intentChoices.querySelectorAll("[data-energy]")) {
      const active = btn.dataset.energy === selected;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", String(active));
      const [title, sub] = copy[btn.dataset.energy];
      btn.querySelector("b").textContent = title;
      btn.querySelector("small").textContent = sub;
    }
    intent.classList.toggle("has-answer", !!selected);
    intentResponse.textContent = selected ? ENERGY[selected][de ? "de" : "en"] : "";
  }

  intentChoices?.addEventListener("click", async (e) => {
    const energy = e.target.closest("[data-energy]")?.dataset.energy;
    if (!ENERGY[energy]) return;
    try {
      const snap = await api.prefs.save({ todayCheckIn: { dayKey: dayKeyOf(store.now()), energy } });
      store.applySnapshot(snap);
    } catch (err) { console.warn("[today check-in]", err.message); }
  });

  // ── „Plan my day" ────────────────────────────────
  // Der Server plant den ganzen Tag neu (Prio/Deps/Kalender/Kapazität). Damit das
  // keine Einbahnstraße ist, merken wir uns vorher Uhrzeit + Datum aller heute
  // relevanten Aufgaben und bieten im Toast ein echtes Rückgängig an.
  function snapshotPlan() {
    const today = dayKeyOf(store.now());
    return store.state.tasks
      .filter((x) => !x.done && (!x.plannedDate || x.plannedDate <= today))
      .map((x) => ({ id: x.id, scheduledMin: x.scheduledMin ?? null, plannedDate: x.plannedDate ?? null }));
  }

  async function undoPlan(before) {
    // Nur zurückschreiben, was der Planer wirklich verändert hat.
    const now = new Map(store.state.tasks.map((x) => [String(x.id), x]));
    const changed = before.filter((b) => {
      const cur = now.get(String(b.id));
      return cur && ((cur.scheduledMin ?? null) !== b.scheduledMin || (cur.plannedDate ?? null) !== b.plannedDate);
    });
    if (!changed.length) return;
    let last = null;
    for (const b of changed) {
      try { last = await api.tasks.update(b.id, { scheduledMin: b.scheduledMin, plannedDate: b.plannedDate }); }
      catch (e) { console.warn("[today] undo", e.message); }
    }
    if (last) store.applySnapshot(last);
  }

  planBtn?.addEventListener("click", async () => {
    if (planBtn.disabled) return;
    planBtn.disabled = true;
    const before = snapshotPlan();
    try {
      const energy = todayCheckIn();
      const res = await api.plan.day(null, ENERGY[energy]?.multiplier ?? 1);
      store.applySnapshot(res);
      const p = res.plan || {};
      const bits = [];
      if (p.placements?.length) bits.push(t("plan.scheduled_n", { n: p.placements.length }));
      if (p.blocked?.length) bits.push(t("plan.blocked_n", { n: p.blocked.length }));
      if (p.overCapacity?.length) bits.push(t("plan.capacity_n", { n: p.overCapacity.length }));
      if (p.overflow?.length) bits.push(t("plan.overflow_n", { n: p.overflow.length }));
      const moved = p.placements?.length || 0;
      showToast({
        type: moved ? "success" : "warn",
        title: t("plan.title"),
        body: bits.join(" · ") || t("plan.nothing"),
        timeout: 8000,
        // Undo nur anbieten, wenn tatsächlich etwas verschoben wurde.
        action: moved ? { label: t("common.undo"), onClick: () => undoPlan(before) } : undefined,
      });
    } catch (e) {
      console.warn("[today]", e.message);
    } finally {
      planBtn.disabled = false;
    }
  });

  // ── Tageslast ────────────────────────────────────
  // done    = heute gemessene Fokuszeit (today.focusMs)
  // planned = Restdauer der offenen Aufgaben, die HEUTE eine Uhrzeit haben
  //           (Schätzungen → im Balken schraffiert, nicht als harte Zahl verkauft)
  function renderLoad(s) {
    if (!meter) return;
    const today = dayKeyOf(store.now());
    const goalH = s.today && s.today.effectiveGoalHours != null
      ? Number(s.today.effectiveGoalHours)
      : Number(s.settings.todayGoalHours) || 4;
    const doneH = (Number(s.today.focusMs) || 0) / MS_PER_H;

    const open = s.tasks.filter((x) => !x.done && (!x.plannedDate || x.plannedDate <= today));
    const scheduled = open.filter((x) => x.scheduledMin != null);
    const unscheduled = open.length - scheduled.length;
    const plannedH = scheduled.reduce((sum, x) => sum + (Number(x.estMinutes) || 0), 0) / 60;

    // Der Balken skaliert auf das Ziel — passt mehr rein als das Ziel hergibt,
    // wird auf 100 % gekappt und die Karte markiert sich als überbucht.
    const total = doneH + plannedH;
    const scale = goalH > 0 ? goalH : Math.max(total, 1);
    const donePct = Math.max(0, Math.min(100, (doneH / scale) * 100));
    const plannedPct = Math.max(0, Math.min(100 - donePct, (plannedH / scale) * 100));
    if (doneSeg) doneSeg.style.width = `${donePct}%`;
    if (plannedSeg) plannedSeg.style.width = `${plannedPct}%`;
    meter.classList.toggle("is-over", goalH > 0 && total > goalH + 0.05);

    // Die Leitzahl ist „geschafft von Soll" — der Rest ist Kontext dahinter.
    if (valEl) valEl.textContent = `${round1(doneH)} of ${round1(goalH)} h focused`;

    if (legendEl) {
      const bits = [];
      if (plannedH > 0) bits.push(`${round1(plannedH)} h planned`);
      if (unscheduled > 0) bits.push(`${unscheduled} without a time`);
      legendEl.textContent = bits.length ? `· ${bits.join(" · ")}` : "";
    }

    // Begründung NUR mit echter Readiness-Quelle. Ohne Wearable bleibt die Zeile
    // weg — die Abwesenheit einer Datenquelle ist für den Studenten keine Info.
    if (noteEl) {
      const h = s.health || {};
      if (h.hasData) {
        const slept = h.sleep && h.sleep.lastNightHours != null ? `Slept ${h.sleep.lastNightHours} h — ` : "";
        const rec = {
          increase: "there’s room for more today.",
          maintain: "today’s goal is unchanged.",
          reduce: "today’s goal is dialled down.",
        }[h.recommendation] || "today’s goal is unchanged.";
        noteEl.hidden = false;
        noteEl.textContent = `${slept}${rec}`;
      } else {
        noteEl.hidden = true;
        noteEl.textContent = "";
      }
    }
  }

  // ── Aufmerksamkeits-Leiste ───────────────────────
  function attentionChips(s) {
    const chips = [];
    const now = store.now();
    const today = dayKeyOf(store.now());
    // Der Chip zählt GENAU die Menge, die ein Klick sichtbar macht: offene
    // Aufgaben ohne Uhrzeit. Aufgaben MIT Uhrzeit stehen im Zeitstrahl und
    // bekommen dort die „Missed block"-Nachfrage — sonst stünden zwei
    // verschiedene Zahlen für dieselbe Sache nebeneinander.
    // (gleicher Filter wie die Liste in tasks.js — sonst zeigt ein Klick
    //  weniger Zeilen, als der Chip versprochen hat)
    const open = s.tasks.filter((x) =>
      !x.done && x.scheduledMin == null && (!x.plannedDate || x.plannedDate <= today));

    // 1) Überfällig: echte Deadline verstrichen ODER von einem früheren Tag
    //    mitgeschleppt. Bewusst getrennt formuliert — „mitgenommen" ist nicht
    //    dasselbe wie „versäumt", und künstlicher Druck hilft niemandem.
    const pastDue = open.filter((x) => x.dueDate && x.dueDate < now);
    const carried = open.filter((x) => !(x.dueDate && x.dueDate < now) && x.plannedDate && x.plannedDate < today);
    const overdueN = pastDue.length + carried.length;
    if (overdueN) {
      const label = pastDue.length && carried.length
        ? `${overdueN} overdue &amp; carried over`
        : (pastDue.length ? `${overdueN} overdue` : `${overdueN} carried over`);
      chips.push({
        cls: "attention__chip--urgent", act: "open-work",
        html: `${icon("warning", { size: 14 })}<span><b>${label}</b></span>`,
      });
    }

    // 2) Heute fällig (ohne die bereits überfälligen)
    const dueToday = open.filter((x) => x.dueDate && x.dueDate >= now && dayKeyOf(x.dueDate) === today);
    if (dueToday.length) {
      chips.push({
        cls: "attention__chip--soon", act: "open-work",
        html: `${icon("flag", { size: 14 })}<span><b>${dueToday.length}</b> due today</span>`,
      });
    }

    // 3) Fällige Wiederholungen (SRS) — server-autoritative Zahl
    const reviews = Number(s.reviewsDueToday) || 0;
    if (reviews) {
      chips.push({
        cls: "attention__chip--info", act: "journal",
        html: `${icon("spiral", { size: 14 })}<span><b>${reviews}</b> review${reviews === 1 ? "" : "s"} due</span>`,
      });
    }

    // 4) Nächste anstehende Prüfung (Feldname ist `date`, s. server/repo.js mapExam)
    const nextExam = (s.exams || [])
      .filter((e) => !e.archived && e.date && e.date >= now)
      .sort((a, b) => a.date - b.date)[0];
    if (nextExam) {
      const d = daysUntil(nextExam.date, now);
      chips.push({
        cls: d <= 3 ? "attention__chip--urgent" : "attention__chip--soon", act: "exam",
        html: `${icon("target", { size: 14 })}<span>${escapeHtml(nextExam.name || "Exam")} in <b>${d} d</b></span>`,
      });
    }

    return chips;
  }

  function renderAttention(s) {
    if (!attentionEl) return;
    // Vor dem ersten Snapshot nichts behaupten (auch keine Entwarnung).
    if (!s.loaded) { attentionEl.hidden = true; return; }
    const chips = attentionChips(s);
    const sig = JSON.stringify(chips);
    if (sig === attentionSig) return;      // 10-s-Reconcile darf nichts neu bauen
    attentionSig = sig;
    if (!chips.length) { attentionEl.hidden = true; attentionEl.innerHTML = ""; return; }
    attentionEl.hidden = false;
    attentionEl.innerHTML = chips
      .map((c) => `<button type="button" class="attention__chip ${c.cls}" data-act="${c.act}">${c.html}</button>`)
      .join("");
  }

  attentionEl?.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "journal") return go("journal");
    if (act === "exam") return go("exam");
    if (act === "open-work") {
      // Innerhalb von Today bleiben: zur Liste der offenen Arbeit scrollen.
      const card = document.getElementById("unscheduledCard");
      card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      document.getElementById("unscheduledList")?.focus?.();
    }
  });

  function render() {
    const s = store.state;
    renderWidgetPrefs();
    renderIntent();
    renderLoad(s);
    renderAttention(s);
  }

  store.subscribe(render);
  document.addEventListener("langchange", () => { renderIntent(); renderWidgetPrefs(); });
  render();
  return {};
}
