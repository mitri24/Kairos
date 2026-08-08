// Bibliothek: dein ganzer Stoff in Kairos — Dateien (PDF/Bilder/…, in der DB),
// Links und Karten (Formeln, Grammatikregeln, Merksätze) je Thema/Prüfung.
// Angepinnte Einträge erscheinen im globalen Referenz-Panel (schwebend über
// jeder Ansicht) — die Antwort auf „ständiges Hin-und-her-Switchen".
import { escapeHtml as esc, safeUrl, prettyUrl, subjectColor } from "/js/util.js";
import { icon, fileIcon } from "/js/icons.js";
import { getLang } from "/js/i18n.js";
import { showToast } from "/js/toast.js";
import { confirmDialog } from "/js/dialog.js";
import { openInApp } from "/js/webview.js";
import { shareContent } from "/js/share.js";
import { firstLine } from "/js/markdown.js";

const TXT = {
  de: {
    eyebrow: "Dein Stoff",
    title: "Bibliothek",
    sub: "Bücher, Skripte, Formeln, Regeln — alles an einem Ort, nichts mehr suchen.",
    tabs: { file: "Datei", link: "Link", card: "Karte" },
    drop: "Datei hierher ziehen oder klicken (PDF, Bilder, … max. 25 MB)",
    titlePh: "Titel …",
    urlPh: "https:// … Link einfügen",
    contentPh: "Inhalt — Formel, Regel, Merksatz …",
    subjectPh: "Fach (optional)",
    noTopic: "Ohne Thema",
    noExam: "Ohne Prüfung",
    addBtn: "Speichern",
    searchPh: "Bibliothek durchsuchen …",
    fAll: "Alle",
    fFiles: "Dateien",
    fLinks: "Links",
    fCards: "Karten",
    fPinned: "Angepinnt",
    empty: "Noch leer — lade dein erstes Skript hoch oder lege eine Formelkarte an.",
    emptyFilter: "Nichts gefunden.",
    pin: "Anpinnen — überall griffbereit",
    unpin: "Losmachen",
    recall: "In den aktiven Abruf",
    recallDone: "In der Abruf-Warteschlange",
    share: "Per Link teilen",
    del: "Löschen",
    delTitle: "Material löschen?",
    delBodyFile: (n) => `„${n}“ wird endgültig gelöscht — auch die Datei.`,
    delBody: (n) => `„${n}“ wird endgültig gelöscht.`,
    delOk: "Löschen",
    delCancel: "Behalten",
    uploaded: (n) => `„${n}“ gespeichert`,
    refTitle: "Angepinnt",
    refNotes: "Notizen",
    refMaterials: "Material",
    untitledNote: "Ohne Titel",
    refEmpty: "Pinne eine Notiz oder ein Material an — dann liegt es hier, in jeder Ansicht.",
    refBtn: "Angepinntes",
    close: "Schließen",
  },
  en: {
    eyebrow: "Your material",
    title: "Library",
    sub: "Books, scripts, formulas, rules — all in one place, no more hunting.",
    tabs: { file: "File", link: "Link", card: "Card" },
    drop: "Drop a file here or click (PDF, images, … max 25 MB)",
    titlePh: "Title …",
    urlPh: "https:// … paste a link",
    contentPh: "Content — formula, rule, mnemonic …",
    subjectPh: "Subject (optional)",
    noTopic: "No topic",
    noExam: "No exam",
    addBtn: "Save",
    searchPh: "Search the library …",
    fAll: "All",
    fFiles: "Files",
    fLinks: "Links",
    fCards: "Cards",
    fPinned: "Pinned",
    empty: "Empty so far — upload your first script or create a formula card.",
    emptyFilter: "Nothing found.",
    pin: "Pin — keep it at hand everywhere",
    unpin: "Unpin",
    recall: "Add to active recall",
    recallDone: "In the recall queue",
    share: "Share via link",
    del: "Delete",
    delTitle: "Delete material?",
    delBodyFile: (n) => `“${n}” will be deleted for good — including the file.`,
    delBody: (n) => `“${n}” will be deleted for good.`,
    delOk: "Delete",
    delCancel: "Keep",
    uploaded: (n) => `“${n}” saved`,
    refTitle: "Pinned",
    refNotes: "Notes",
    refMaterials: "Material",
    untitledNote: "Untitled",
    refEmpty: "Pin a note or a material and it lives here — on every view.",
    refBtn: "Pinned items",
    close: "Close",
  },
};

// Icon-Name je Material-Art (Dateien richten sich nach dem MIME-Typ).
const kindIconName = (m) =>
  m.kind === "file" ? fileIcon(m.mime) : m.kind === "card" ? "card" : "link";
// Icon-Name je Composer-Tab bzw. Filter-Chip.
const KIND_ICON = { file: "file", link: "link", card: "card", pinned: "pin" };

export function initLibrary({ store, api }) {
  const root = document.getElementById("libraryRoot");
  if (!root) return {};
  let composerKind = "file";
  let filter = "all";
  let query = "";
  let expanded = new Set();

  const T = () => TXT[getLang()] || TXT.de;
  async function act(fn) {
    try { store.applySnapshot(await fn()); return true; }
    catch (e) { console.warn("[library]", e.message); return false; }
  }

  const inRecall = (s, id) => (s.reviews || []).some((r) => r.kind === "material" && r.refId === id);

  function topicName(s, id) {
    return (s.topics || []).find((x) => x.id === id)?.text || null;
  }

  function matches(m) {
    if (filter === "file" && m.kind !== "file") return false;
    if (filter === "link" && m.kind !== "link") return false;
    if (filter === "card" && m.kind !== "card") return false;
    if (filter === "pinned" && !m.pinned) return false;
    if (query) {
      const hay = `${m.title} ${m.subject || ""} ${m.content || ""} ${m.url || ""}`.toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  }

  function composerHtml(s) {
    const t = T();
    const topicOpts = `<option value="">${esc(t.noTopic)}</option>` +
      (s.topics || []).map((x) => `<option value="${x.id}">${esc(x.text)}</option>`).join("");
    const examOpts = `<option value="">${esc(t.noExam)}</option>` +
      (s.exams || []).filter((e) => !e.archived).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
    return `
      <div class="card lib-composer">
        <div class="seg lib-composer__tabs">
          ${["file", "link", "card"].map((k) => `<button class="seg__btn${composerKind === k ? " is-active" : ""}" data-ck="${k}"><span class="ico-row">${icon(KIND_ICON[k])}${esc(t.tabs[k])}</span></button>`).join("")}
        </div>
        ${composerKind === "file" ? `
          <label class="lib-drop" id="libDrop">
            <input type="file" id="libFile" multiple hidden />
            <span>${icon("paperclip", { size: 18 })} ${esc(t.drop)}</span>
          </label>` : ""}
        ${composerKind !== "file" ? `<input type="text" id="libTitle" class="text-input" placeholder="${esc(t.titlePh)}" maxlength="160" />` : ""}
        ${composerKind === "link" ? `<input type="text" id="libUrl" class="text-input" placeholder="${esc(t.urlPh)}" maxlength="600" />` : ""}
        ${composerKind === "card" ? `<textarea id="libContent" class="lib-composer__content" rows="4" placeholder="${esc(t.contentPh)}" maxlength="4000"></textarea>` : ""}
        <div class="lib-composer__meta">
          <input type="text" id="libSubject" class="text-input lib-composer__subject" placeholder="${esc(t.subjectPh)}" maxlength="60" />
          <select id="libTopic">${topicOpts}</select>
          <select id="libExam">${examOpts}</select>
          ${composerKind !== "file" ? `<button class="btn btn--primary" id="libAdd">${esc(t.addBtn)}</button>` : ""}
        </div>
      </div>`;
  }

  function materialCard(s, m) {
    const t = T();
    const open = expanded.has(m.id);
    const topic = topicName(s, m.topicId);
    const subj = m.subject ? subjectColor(m.subject) : null;
    const kindIcon = icon(kindIconName(m), { size: 22 });
    const sizeKb = m.size ? (m.size > 1024 * 1024 ? `${(m.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(m.size / 1024))} KB`) : "";
    const meta = m.kind === "link" ? prettyUrl(m.url) : m.kind === "file" ? sizeKb : "";
    return `
      <article class="lib-item${m.pinned ? " is-pinned" : ""}" data-id="${m.id}">
        <button class="lib-item__main" type="button" data-a="open" data-id="${m.id}">
          <span class="lib-item__icon">${kindIcon}</span>
          <span class="lib-item__text">
            <span class="lib-item__title">${esc(m.title)}</span>
            <span class="lib-item__meta">
              ${meta ? `<span>${esc(meta)}</span>` : ""}
              ${topic ? `<span class="lib-item__topic">${esc(topic)}</span>` : ""}
              ${m.subject ? `<span class="lib-item__subj ${subj.cls}">${esc(m.subject)}</span>` : ""}
            </span>
          </span>
        </button>
        ${m.kind === "card" && open ? `<pre class="lib-item__content">${esc(m.content || "")}</pre>` : ""}
        <div class="lib-item__actions">
          <button class="lib-act${m.pinned ? " is-on" : ""}" data-a="pin" data-id="${m.id}" title="${esc(m.pinned ? t.unpin : t.pin)}" aria-label="${esc(m.pinned ? t.unpin : t.pin)}">${icon("pin")}</button>
          ${m.kind === "card" ? `<button class="lib-act${inRecall(s, m.id) ? " is-on" : ""}" data-a="recall" data-id="${m.id}" title="${esc(inRecall(s, m.id) ? t.recallDone : t.recall)}" aria-label="${esc(inRecall(s, m.id) ? t.recallDone : t.recall)}" ${inRecall(s, m.id) ? "disabled" : ""}>${icon("brain")}</button>` : ""}
          <button class="lib-act" data-a="share" data-id="${m.id}" title="${esc(t.share)}" aria-label="${esc(t.share)}">${icon("share")}</button>
          <button class="lib-act lib-act--danger" data-a="del" data-id="${m.id}" title="${esc(t.del)}" aria-label="${esc(t.del)}">${icon("trash")}</button>
        </div>
      </article>`;
  }

  function render(s) {
    if (root.closest(".view")?.hidden) return;
    const t = T();
    const prevQuery = root.querySelector("#libSearch")?.value ?? query;
    query = prevQuery;
    const list = (s.materials || []).filter(matches);
    root.innerHTML = `
      <div class="view__head">
        <div>
          <div class="view__eyebrow">${esc(t.eyebrow)}</div>
          <h1 class="view__title">${esc(t.title)}</h1>
          <p class="lib-sub">${esc(t.sub)}</p>
        </div>
      </div>
      ${composerHtml(s)}
      <div class="lib-toolbar">
        <input type="search" id="libSearch" class="text-input lib-search" placeholder="${esc(t.searchPh)}" value="${esc(query)}" />
        <div class="lib-filters">
          ${[["all", t.fAll], ["file", t.fFiles], ["link", t.fLinks], ["card", t.fCards], ["pinned", t.fPinned]]
            .map(([k, label]) => {
              // „Alle" trägt kein Icon — die übrigen Chips zeigen Icon + Text.
              const inner = KIND_ICON[k] ? `<span class="ico-row">${icon(KIND_ICON[k])}${esc(label)}</span>` : esc(label);
              return `<button class="method-filter${filter === k ? " is-active" : ""}" data-lf="${k}">${inner}</button>`;
            }).join("")}
        </div>
      </div>
      ${list.length ? `<div class="lib-grid">${list.map((m) => materialCard(s, m)).join("")}</div>`
        : `<p class="empty">${esc((s.materials || []).length ? t.emptyFilter : t.empty)}</p>`}
    `;
    const search = root.querySelector("#libSearch");
    if (search && document.activeElement?.id === "libSearch") search.focus();
  }

  // ── Composer-Aktionen ──
  function composerMeta() {
    return {
      subject: root.querySelector("#libSubject")?.value.trim() || null,
      topicId: Number(root.querySelector("#libTopic")?.value) || null,
      examId: Number(root.querySelector("#libExam")?.value) || null,
    };
  }
  async function uploadFiles(files) {
    const t = T();
    const meta = composerMeta();
    for (const file of files) {
      try {
        const res = await api.materials.upload(file, { ...meta, title: file.name });
        store.applySnapshot(res);
        showToast({ type: "success", title: t.uploaded(file.name) });
      } catch (e) { console.warn("[library]", e.message); }
    }
  }
  async function addFromComposer() {
    const t = T();
    const meta = composerMeta();
    const title = root.querySelector("#libTitle")?.value.trim();
    if (composerKind === "link") {
      const url = safeUrl(root.querySelector("#libUrl")?.value);
      if (!url) return;
      const ok = await act(() => api.materials.create({ kind: "link", title: title || prettyUrl(url), url, ...meta }));
      if (ok) showToast({ type: "success", title: t.uploaded(title || prettyUrl(url)) });
    } else if (composerKind === "card") {
      const content = root.querySelector("#libContent")?.value.trim();
      if (!title || !content) return;
      const ok = await act(() => api.materials.create({ kind: "card", title, content, ...meta }));
      if (ok) showToast({ type: "success", title: t.uploaded(title) });
    }
  }

  root.addEventListener("click", async (e) => {
    const ck = e.target.closest("[data-ck]");
    if (ck) { composerKind = ck.dataset.ck; render(store.state); return; }
    const lf = e.target.closest("[data-lf]");
    if (lf) { filter = lf.dataset.lf; render(store.state); return; }
    if (e.target.closest("#libAdd")) { addFromComposer(); return; }
    const a = e.target.closest("[data-a]");
    if (!a) return;
    const id = Number(a.dataset.id);
    const m = (store.state.materials || []).find((x) => x.id === id);
    if (!m) return;
    const t = T();
    if (a.dataset.a === "open") {
      if (m.kind === "card") {
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        render(store.state);
      } else if (m.kind === "link" && m.url) {
        openInApp(m.url, { title: m.title });
      } else if (m.kind === "file") {
        openInApp(api.materials.fileUrl(id), { title: m.title, sameOrigin: true, mime: m.mime });
      }
    } else if (a.dataset.a === "pin") {
      act(() => api.materials.update(id, { pinned: !m.pinned }));
    } else if (a.dataset.a === "recall") {
      act(() => api.reviews.add("material", id));
    } else if (a.dataset.a === "share") {
      shareContent(api, "material", id);
    } else if (a.dataset.a === "del") {
      const ok = await confirmDialog({
        title: t.delTitle,
        body: m.kind === "file" ? t.delBodyFile(m.title) : t.delBody(m.title),
        confirmLabel: t.delOk, cancelLabel: t.delCancel,
      });
      if (ok) act(() => api.materials.remove(id));
    }
  });
  root.addEventListener("input", (e) => {
    if (e.target.id === "libSearch") { query = e.target.value; render(store.state); }
  });
  root.addEventListener("change", (e) => {
    if (e.target.id === "libFile") {
      uploadFiles([...e.target.files]);
      e.target.value = "";
    }
  });
  // Drag & Drop auf die Drop-Zone.
  root.addEventListener("dragover", (e) => {
    const drop = e.target.closest?.("#libDrop");
    if (drop) { e.preventDefault(); drop.classList.add("is-over"); }
  });
  root.addEventListener("dragleave", (e) => {
    e.target.closest?.("#libDrop")?.classList.remove("is-over");
  });
  root.addEventListener("drop", (e) => {
    const drop = e.target.closest?.("#libDrop");
    if (!drop) return;
    e.preventDefault();
    drop.classList.remove("is-over");
    if (e.dataTransfer?.files?.length) uploadFiles([...e.dataTransfer.files]);
  });

  initRefPanel({ store, api });
  store.subscribe(render);
  render(store.state);
  return {};
}

// ── Globales Referenz-Panel (schwebend, in jeder Ansicht) ────────────────
// ── Die EINE Pinnwand ────────────────────────────────────────────────────
// „Pinnen" bedeutet in der ganzen App genau eine Sache: das hier will ich
// überall griffbereit haben. Deshalb liegt beides in DIESER Schublade —
// angepinnte Materialien (Dateien/Links/Karten) UND angepinnte Notizen.
//
// Vorher gab es zwei Pin-Orte: diese Schublade und eine eigene Karte für die
// oberste angepinnte Notiz auf „Today". Zwei Pinnadeln an zwei Stellen für zwei
// verschiedene Datentypen — man konnte nicht wissen, was wo landet. Die Notiz-
// Karte auf Today ist entfallen; die Notizen stehen jetzt hier oben.
//
// Nur LESEN aus fremden State-Slices (notes) — das Panel bleibt DOM-Eigentum
// dieses Moduls, und eine Notiz wird hier nicht verändert, sondern geöffnet.
function initRefPanel({ store, api }) {
  const t = () => TXT[getLang()] || TXT.de;
  const wrap = document.createElement("div");
  wrap.className = "refpanel-wrap";
  wrap.innerHTML = `
    <button class="refpanel-fab" id="refFab" type="button" hidden title="${esc(t().refBtn)}" aria-label="${esc(t().refBtn)}">
      ${icon("pin", { size: 18 })}<span class="refpanel-fab__count" id="refFabCount">0</span>
    </button>
    <aside class="refpanel" id="refPanel" hidden aria-label="${esc(t().refTitle)}">
      <div class="refpanel__head">
        <span class="ico-row">${icon("pin", { size: 18 })}${esc(t().refTitle)}</span>
        <button class="refpanel__close" id="refClose" type="button" title="${esc(t().close)}" aria-label="${esc(t().close)}">${icon("close")}</button>
      </div>
      <div class="refpanel__list" id="refList"></div>
    </aside>`;
  document.body.appendChild(wrap);
  const fab = wrap.querySelector("#refFab");
  const panel = wrap.querySelector("#refPanel");
  const listEl = wrap.querySelector("#refList");
  let open = false;
  let expandedRef = new Set();

  // Anzeigename einer Notiz: eigener Titel, sonst die erste sinnvolle Zeile.
  const noteLabel = (n) => (n.title || firstLine(n.text) || esc(t().untitledNote));

  function render(s) {
    const mats = (s.materials || []).filter((m) => m.pinned);
    const notes = (s.notes || []).filter((n) => n.pinned);
    const total = mats.length + notes.length;
    fab.hidden = total === 0 && !open;
    wrap.querySelector("#refFabCount").textContent = String(total);
    panel.hidden = !open;
    if (!open) return;

    if (!total) { listEl.innerHTML = `<p class="refpanel__empty">${esc(t().refEmpty)}</p>`; return; }

    // Überschriften nur, wenn beide Sorten da sind — sonst erklären sie nichts.
    const head = (label) => (mats.length && notes.length ? `<div class="refpanel__group">${esc(label)}</div>` : "");
    listEl.innerHTML =
      (notes.length ? head(t().refNotes) + notes.map((n) => `
        <div class="refpanel__item" data-note="${n.id}">
          <button class="refpanel__item-head" type="button">
            ${icon("doc", { size: 18 })}
            <span class="refpanel__item-title">${esc(noteLabel(n))}</span>
          </button>
        </div>`).join("") : "") +
      (mats.length ? head(t().refMaterials) + mats.map((m) => `
        <div class="refpanel__item" data-id="${m.id}" data-kind="${m.kind}">
          <button class="refpanel__item-head" type="button">
            ${icon(kindIconName(m), { size: 18 })}
            <span class="refpanel__item-title">${esc(m.title)}</span>
          </button>
          ${m.kind === "card" && expandedRef.has(m.id) ? `<pre class="refpanel__content">${esc(m.content || "")}</pre>` : ""}
        </div>`).join("") : "");
  }

  fab.addEventListener("click", () => { open = !open; render(store.state); });
  panel.addEventListener("click", (e) => {
    if (e.target.closest("#refClose")) { open = false; render(store.state); return; }
    const item = e.target.closest(".refpanel__item");
    if (!item) return;

    // Notiz → in der Notizen-Ansicht öffnen (notes.js reagiert auf ui.openNoteId).
    if (item.dataset.note) {
      open = false;
      render(store.state);
      store.setUi({ openNoteId: Number(item.dataset.note) });
      document.dispatchEvent(new CustomEvent("navigate", { detail: { view: "notes" } }));
      return;
    }

    const id = Number(item.dataset.id);
    const m = (store.state.materials || []).find((x) => x.id === id);
    if (!m) return;
    if (m.kind === "card") {
      if (expandedRef.has(id)) expandedRef.delete(id); else expandedRef.add(id);
      render(store.state);
    } else if (m.kind === "link" && m.url) {
      openInApp(m.url, { title: m.title });
    } else if (m.kind === "file") {
      openInApp(api.materials.fileUrl(id), { title: m.title, sameOrigin: true, mime: m.mime });
    }
  });
  store.subscribe(render);
  render(store.state);
}
