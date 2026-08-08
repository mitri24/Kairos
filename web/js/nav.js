// Ansichts-Navigation (Sidebar). Wave 6: Gruppen (Planen/Lernen/Verstehen),
// einklappbar + gemerkt, Features über das Lernprofil ausblendbar
// (prefs.hiddenViews), Abruf-Badge am Journal. Andere Module wechseln die
// Ansicht per document-Event: dispatchEvent(new CustomEvent("navigate", {detail:{view}})).
import { t } from "/js/i18n.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

// Die Lernroute ist KEINE eigene Ansicht mehr — sie lebt als Tab im
// Prüfungs-Workspace (jede Route gehört zu genau einer Prüfung).
const VIEWS = [
  "today", "week", "exam", "library", "journal",
  "notes", "health", "insights", "knowledge", "profile",
];
// Über Profil/Onboarding ausblendbar („weniger ist mehr"). Today + Profil nie.
export const HIDEABLE_VIEWS = [
  "week", "exam", "library", "journal", "notes", "health", "insights", "knowledge",
];
const LS_COLLAPSED = "kairos_nav_collapsed";
const LS_CUSTOM_CLOSED = "kairos_custom_folders_closed";

export function initNav({ store, api }) {
  const el = (id) => document.getElementById(id);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const views = {}, navBtns = {};
  for (const v of VIEWS) {
    views[v] = el(`view${cap(v)}`);
    navBtns[v] = el(`nav${cap(v)}`);
  }
  const examSubnav = el("examSubnav");
  const main = document.querySelector(".main");
  const windowTitle = el("windowTitle");
  let current = "today";

  const hiddenViews = () => {
    const list = store.state.prefs?.hiddenViews;
    return new Set(Array.isArray(list) ? list : []);
  };
  const moduleNavOnly = () => store.state.prefs?.moduleNavOnly === true;

  // ── Eigene Ordner (beliebig tief) ─────────────
  const customTree = el("navCustomTree");
  const customAdd = el("navCustomAdd");
  let closedCustom = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(LS_CUSTOM_CLOSED) || "[]");
    if (Array.isArray(saved)) closedCustom = new Set(saved.map(Number).filter(Number.isFinite));
  } catch { /* ungültiger alter Zustand → alle offen */ }
  const saveClosedCustom = () => {
    try { localStorage.setItem(LS_CUSTOM_CLOSED, JSON.stringify([...closedCustom])); } catch { /* privat */ }
  };
  const viewNames = {
    today: "Heute", week: "Woche", exam: "Module", library: "Bibliothek",
    journal: "Journal", notes: "Notizen", health: "Energie", insights: "Insights",
    knowledge: "Methoden", profile: "Profil",
  };

  async function mutate(work) {
    try { store.applySnapshot(await work()); } catch { /* API zeigt Fehler */ }
  }

  async function createModule() {
    const name = window.prompt("Name des neuen Moduls", "Neues Modul");
    if (!name?.trim()) return;
    const color = window.prompt("Modulfarbe als Hex-Code", "#3E7D5E")?.trim() || "#3E7D5E";
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      window.alert("Bitte eine Farbe im Format #3E7D5E eingeben.");
      return;
    }
    try {
      const examIds = new Set(store.state.exams.map((item) => item.id));
      store.applySnapshot(await api.exams.create({ name: name.trim(), color }));
      const module = store.state.exams.find((item) => !examIds.has(item.id));
      if (!module) return;

      const createNode = async (data) => {
        const ids = new Set((store.state.navNodes || []).map((item) => item.id));
        store.applySnapshot(await api.navNodes.create(data));
        return store.state.navNodes.find((item) => !ids.has(item.id));
      };
      const root = await createNode({ parentId: null, name: name.trim(), kind: "folder" });
      if (root) {
        await createNode({ parentId: root.id, name: "Modulübersicht", kind: "exam", examId: module.id });
        const planning = await createNode({ parentId: root.id, name: "Planung", kind: "folder" });
        if (planning) {
          await createNode({ parentId: planning.id, name: "Woche", kind: "view", view: "week" });
          await createNode({ parentId: planning.id, name: "Heute", kind: "view", view: "today" });
        }
        const learning = await createNode({ parentId: root.id, name: "Lernen & Material", kind: "folder" });
        if (learning) {
          await createNode({ parentId: learning.id, name: "Bibliothek", kind: "view", view: "library" });
          await createNode({ parentId: learning.id, name: "Notizen", kind: "view", view: "notes" });
        }
      }
      store.applySnapshot(await api.setSettings({ activeExamId: module.id }));
      show("exam");
    } catch (error) { console.warn("[modules]", error.message); }
  }

  // Ein kleiner, absichtlich linearer Flow: erst Name, dann optional die
  // Funktion. Leere Funktion = echter Ordner; "exam:12" = konkrete Prüfung.
  function addCustom(parentId = null) {
    const name = window.prompt("Name des Ordners oder Eintrags");
    if (!name?.trim()) return;
    const choices = Object.entries(viewNames).map(([k, v]) => `${k} (${v})`).join(", ");
    const target = window.prompt(`Was soll er öffnen?\nLeer lassen = Unterordner\n${choices}\nOder exam:<ID>`, "")?.trim().toLowerCase() || "";
    let data = { parentId, name: name.trim(), kind: "folder" };
    if (target.startsWith("exam:")) data = { ...data, kind: "exam", examId: Number(target.slice(5)) };
    else if (viewNames[target]) data = { ...data, kind: "view", view: target };
    mutate(() => api.navNodes.create(data));
  }

  function openCustom(node) {
    if (node.kind === "folder") {
      closedCustom.has(node.id) ? closedCustom.delete(node.id) : closedCustom.add(node.id);
      saveClosedCustom();
      renderCustom(store.state);
      return;
    }
    if (node.kind === "exam") {
      mutate(() => api.setSettings({ activeExamId: node.examId }));
      show("exam");
      return;
    }
    if (node.view) show(node.view);
  }

  function renderCustom(s) {
    if (!customTree) return;
    const nodes = Array.isArray(s.navNodes) ? s.navNodes : [];
    const byParent = new Map();
    for (const n of nodes) {
      const key = n.parentId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(n);
    }
    const rows = [];
    const walk = (parentId, depth) => {
      for (const n of byParent.get(parentId) || []) {
        const folder = n.kind === "folder";
        const glyph = folder ? `<svg class="nav-tree__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>` : `<span aria-hidden="true">${n.kind === "exam" ? "◎" : "↗"}</span>`;
        const closed = folder && closedCustom.has(n.id);
        rows.push(`<div class="nav-tree__row${closed ? " is-closed" : ""}" draggable="true" style="--depth:${depth}" data-node="${n.id}"><button class="nav-tree__main" type="button"${folder ? ` aria-expanded="${!closed}" aria-label="${closed ? "Aufklappen" : "Zuklappen"}: ${escapeHtml(n.name)}"` : ""}>${glyph}<span>${escapeHtml(n.name)}</span></button>${folder ? '<button class="nav-tree__add" type="button" title="Unterordner oder Funktion hinzufügen">+</button>' : ""}<button class="nav-tree__more" type="button" title="Umbenennen oder löschen">•••</button></div>`);
        if (folder && !closedCustom.has(n.id)) walk(n.id, depth + 1);
      }
    };
    walk(null, 0);
    customTree.innerHTML = rows.join("") || `<div class="nav-tree__empty">Eigene Bereiche anlegen</div>`;
  }

  customAdd?.addEventListener("click", createModule);
  let draggedNodeId = null;
  let ignoreClickAfterDrag = false;
  const clearDropTargets = () => customTree?.querySelectorAll(".is-drop-target").forEach((row) => row.classList.remove("is-drop-target"));
  customTree?.addEventListener("dragstart", (e) => {
    if (e.target.closest(".nav-tree__add, .nav-tree__more")) { e.preventDefault(); return; }
    const row = e.target.closest("[data-node]");
    if (!row) return;
    draggedNodeId = Number(row.dataset.node);
    row.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(draggedNodeId));
  });
  customTree?.addEventListener("dragover", (e) => {
    clearDropTargets();
    const row = e.target.closest("[data-node]");
    if (!row) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; return; }
    const node = store.state.navNodes.find((item) => item.id === Number(row.dataset.node));
    if (node?.kind === "folder" && node.id !== draggedNodeId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      row.classList.add("is-drop-target");
    }
  });
  customTree?.addEventListener("dragleave", (e) => {
    if (!customTree.contains(e.relatedTarget)) clearDropTargets();
  });
  customTree?.addEventListener("drop", (e) => {
    e.preventDefault();
    const sourceId = draggedNodeId || Number(e.dataTransfer.getData("text/plain"));
    const row = e.target.closest("[data-node]");
    const target = row && store.state.navNodes.find((item) => item.id === Number(row.dataset.node));
    const parentId = target?.kind === "folder" ? target.id : null;
    clearDropTargets();
    if (sourceId && sourceId !== parentId) mutate(() => api.navNodes.update(sourceId, { parentId }));
    ignoreClickAfterDrag = true;
  });
  customTree?.addEventListener("dragend", () => {
    customTree.querySelectorAll(".is-dragging").forEach((row) => row.classList.remove("is-dragging"));
    clearDropTargets();
    draggedNodeId = null;
    window.setTimeout(() => { ignoreClickAfterDrag = false; }, 0);
  });
  customTree?.addEventListener("click", (e) => {
    if (ignoreClickAfterDrag) return;
    const row = e.target.closest("[data-node]");
    if (!row) return;
    const node = store.state.navNodes.find((n) => n.id === Number(row.dataset.node));
    if (!node) return;
    if (e.target.closest(".nav-tree__add")) { addCustom(node.id); return; }
    if (e.target.closest(".nav-tree__more")) {
      const next = window.prompt("Neuer Name (leer = löschen)", node.name);
      if (next === null) return;
      if (!next.trim()) {
        if (window.confirm(`„${node.name}“ samt Unterordnern löschen?`)) mutate(() => api.navNodes.remove(node.id));
      } else mutate(() => api.navNodes.update(node.id, { name: next.trim() }));
      return;
    }
    openCustom(node);
  });

  // ── Zurück-Verlauf ───────────────────────────────
  // „Wieder dahin, wo ich vorher war" heißt nicht nur: dieselbe Ansicht. Es heißt
  // auch: dieselbe Prüfung, dasselbe Dokument, derselbe Prüfungs-Tab. Deshalb
  // wird pro Schritt ein kleiner Zustandsabzug mitgelegt und beim Zurück wieder
  // eingespielt. Der Verlauf ist bewusst flüchtig (kein localStorage): nach einem
  // Neuladen gibt es kein „vorher", und ein erfundenes wäre schlimmer als keins.
  const backBtn = el("navBack");
  const history = [];
  const MAX_HISTORY = 50;
  let restoring = false;

  const snapshotUi = () => ({
    view: current,
    ui: {
      expandedTaskId: store.state.ui.expandedTaskId ?? null,
      openNoteId: store.state.ui.openNoteId ?? null,
      examTab: store.state.ui.examTab ?? null,
      selectedTopicId: store.state.ui.selectedTopicId ?? null,
      libraryFilter: store.state.ui.libraryFilter ?? null,
    },
    activeExamId: store.state.settings?.activeExamId ?? null,
  });

  function syncBackBtn() {
    if (!backBtn) return;
    backBtn.disabled = history.length === 0;
    backBtn.title = history.length
      ? `${t("nav.back")} — ${t("nav." + history[history.length - 1].view)}`
      : t("nav.back_none");
  }

  function goBack() {
    const prev = history.pop();
    if (!prev) return;
    restoring = true;
    try {
      // Erst den Zustand setzen, dann die Ansicht wechseln — sonst rendert die
      // Zielansicht einmal mit dem alten Kontext und springt sichtbar um.
      store.setUi(prev.ui);
      show(prev.view);
    } finally {
      restoring = false;
    }
    syncBackBtn();
  }

  function show(view) {
    if (!views[view]) return;
    if (view !== "today" && view !== "profile" && hiddenViews().has(view)) view = "today";
    // Nur echte Sprünge merken — ein Klick auf die bereits offene Ansicht ist
    // kein Schritt, und beim Zurückgehen darf nichts nachgelegt werden.
    if (!restoring && view !== current) {
      history.push(snapshotUi());
      if (history.length > MAX_HISTORY) history.shift();
      syncBackBtn();
    }
    current = view;
    for (const v of VIEWS) {
      if (views[v]) views[v].hidden = v !== view;
      if (navBtns[v]) navBtns[v].classList.toggle("is-active", v === view);
    }
    if (windowTitle) windowTitle.textContent = `Kairos — ${t("nav." + view)}`;
    if (main) main.scrollTop = 0;
    store.emit(); // sichtbar gewordene Ansicht frisch rendern
  }

  for (const v of VIEWS) navBtns[v]?.addEventListener("click", () => show(v));
  document.addEventListener("navigate", (e) => { if (e.detail?.view) show(e.detail.view); });

  backBtn?.addEventListener("click", goBack);
  // Tastatur + Maus-Zurücktaste, wie man es von einem Browser erwartet.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" || !(e.altKey || e.metaKey) || e.ctrlKey) return;
    const el2 = document.activeElement;
    if (el2 && el2.matches("input, textarea, select, [contenteditable='true']")) return;
    e.preventDefault();
    goBack();
  });
  window.addEventListener("mouseup", (e) => { if (e.button === 3) { e.preventDefault(); goBack(); } });

  // ── Gruppen: auf-/zuklappen, Zustand bleibt erhalten ──
  let collapsed;
  try { collapsed = new Set(JSON.parse(localStorage.getItem(LS_COLLAPSED) || "[]")); }
  catch { collapsed = new Set(); }
  const saveCollapsed = () => {
    try { localStorage.setItem(LS_COLLAPSED, JSON.stringify([...collapsed])); } catch { /* privat */ }
  };
  for (const group of document.querySelectorAll(".nav-group")) {
    const key = group.dataset.group;
    const head = group.querySelector(".nav-group__head");
    const apply = () => {
      const isCollapsed = collapsed.has(key);
      group.classList.toggle("is-collapsed", isCollapsed);
      head?.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    };
    head?.addEventListener("click", () => {
      if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
      saveCollapsed();
      apply();
    });
    apply();
  }

  // ── Prüfungsliste: standardmäßig AUSGEFAHREN ──
  // Sie hängt nicht mehr an der aktiven Ansicht (vorher nur im Prüfungs-Tab
  // sichtbar) — die Prüfungen sind von überall erreichbar. Wer es ruhiger mag,
  // klappt sie über den Pfeil ein; der Zustand bleibt erhalten.
  const examSubToggle = el("examSubToggle");
  const examNavRow = el("examNavRow");
  function applyExamSub() {
    const isCollapsed = collapsed.has("examSub");
    const examOff = hiddenViews().has("exam") || moduleNavOnly();
    if (examNavRow) examNavRow.hidden = examOff;
    if (examSubnav) examSubnav.hidden = isCollapsed || examOff;
    examSubToggle?.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    examSubToggle?.classList.toggle("is-collapsed", isCollapsed);
  }
  examSubToggle?.addEventListener("click", () => {
    if (collapsed.has("examSub")) collapsed.delete("examSub"); else collapsed.add("examSub");
    saveCollapsed();
    applyExamSub();
  });

  // ── Sichtbarkeit (Feature-Ausblenden) + Journal-Badge ──
  function render(s) {
    const hidden = hiddenViews();
    const modulesOnly = moduleNavOnly();
    if (navBtns.today) navBtns.today.hidden = modulesOnly;
    for (const v of HIDEABLE_VIEWS) {
      if (navBtns[v]) navBtns[v].hidden = hidden.has(v) || modulesOnly;
    }
    applyExamSub();   // Prüfungs-Feature aus-/eingeblendet → Liste nachziehen
    // Gruppen ohne sichtbares Element komplett ausblenden.
    for (const group of document.querySelectorAll(".nav-group")) {
      if (group.classList.contains("nav-custom")) { group.hidden = false; continue; }
      const anyVisible = [...group.querySelectorAll(".nav-item")].some((b) => !b.hidden);
      group.hidden = modulesOnly || !anyVisible;
    }
    const badge = el("navJournalBadge");
    if (badge) {
      const n = s.reviewsDueToday || 0;
      badge.textContent = n > 9 ? "9+" : String(n);
      badge.hidden = n === 0;
    }
    // Aktive Ansicht wurde gerade ausgeblendet → sanft zurück zu Heute.
    if (current !== "today" && current !== "profile" && hidden.has(current)) show("today");
    renderCustom(s);
  }
  store.subscribe(render);
  render(store.state);

  // Sprachwechsel: Fenstertitel nachziehen.
  document.addEventListener("langchange", () => {
    if (windowTitle) windowTitle.textContent = `Kairos — ${t("nav." + current)}`;
    syncBackBtn();
  });

  show("today");
  syncBackBtn();   // Startzustand: nichts dahinter, Knopf inaktiv
  return { show, getCurrent: () => current };
}
