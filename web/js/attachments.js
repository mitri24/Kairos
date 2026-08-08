// Anhänge-Leiste: eine Datei-Liste mit Ablagefläche, die überall dort steckt,
// wo etwas Eigenes Dateien haben soll — an einer Notiz, an einer Prüfung, an
// einem Thema. Ein Baustein statt drei Kopien, damit „alles zu einer Sache an
// einem Ort" überall gleich aussieht und sich gleich verhält.
//
// Datenquelle sind die materials aus dem Snapshot (kind = "file"), der Bezug
// steckt in note_id / exam_id / topic_id. Hochgeladen wird über den bestehenden
// Roh-Body-Upload; gelöscht über die normale Material-Route.
import { escapeHtml as esc } from "/js/util.js";
import { icon, fileIcon } from "/js/icons.js";
import { showToast } from "/js/toast.js";
import { openInApp } from "/js/webview.js";

export const formatBytes = (n) => {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};

// Alle Datei-Materialien zu einem Bezug. scope = { noteId } | { topicId } | { examId }.
export function attachmentsFor(state, scope) {
  const all = state.materials || [];
  if (scope.noteId != null) return all.filter((m) => m.kind === "file" && String(m.noteId) === String(scope.noteId));
  if (scope.topicId != null) return all.filter((m) => m.kind === "file" && String(m.topicId) === String(scope.topicId));
  if (scope.examId != null) {
    // An der Prüfung hängen die Dateien, die KEINEM Thema zugeordnet sind —
    // sonst tauchte jedes Thema-Material zusätzlich auf der Prüfungsebene auf.
    return all.filter((m) => m.kind === "file" && m.topicId == null && String(m.examId) === String(scope.examId));
  }
  return [];
}

// Markup der Leiste. `id` macht Ablagefläche und Datei-Feld eindeutig, wenn
// mehrere Leisten gleichzeitig im DOM stehen (Notiz-Editor + Themen-Detail).
export function attachmentsHtml(list, { id = "att", label = "Files", hint = "Drop a file here or click (max 25 MB)" } = {}) {
  const items = list.map((m) => `
    <li class="att" data-att-id="${esc(String(m.id))}" data-att-mime="${esc(m.mime || "")}">
      <button type="button" class="att__open" data-att-act="open" title="${esc(m.title)}">
        <span class="att__icon">${icon(fileIcon(m.mime), { size: 16 })}</span>
        <span class="att__name">${esc(m.title)}</span>
        <span class="att__size">${esc(formatBytes(m.size))}</span>
      </button>
      <button type="button" class="att__del" data-att-act="del" title="Remove file" aria-label="Remove file">${icon("close", { size: 13, stroke: 2.2 })}</button>
    </li>`).join("");
  return `
    <div class="att-block" data-att-block="${esc(id)}">
      <div class="att-block__head">${esc(label)}${list.length ? `<span class="att-block__count">${list.length}</span>` : ""}</div>
      ${list.length ? `<ul class="att-list">${items}</ul>` : ""}
      <label class="att-drop" data-att-drop>
        <input type="file" multiple hidden data-att-input />
        ${icon("paperclip", { size: 16 })}<span>${esc(hint)}</span>
      </label>
    </div>`;
}

// Verdrahtet Öffnen / Löschen / Upload (Klick + Drag & Drop) per Delegation auf
// einem Container, der die Leiste enthält. Der Container darf bei jedem Render
// neu aufgebaut werden — es hängt kein Handler an den einzelnen Elementen.
export function initAttachments(container, { api, apply, scope, onUploaded } = {}) {
  if (!container) return;

  async function act(fn) {
    try { apply(await fn()); return true; }
    catch (e) { console.warn("[attachments]", e.message); return false; }
  }

  async function upload(files) {
    const target = scope();
    if (!target) return;
    for (const file of files) {
      const ok = await act(() => api.materials.upload(file, { ...target, title: file.name }));
      if (ok) {
        showToast({ type: "success", title: `“${file.name}” attached` });
        onUploaded?.(file);
      }
    }
  }

  container.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-att-act]");
    if (!btn || !container.contains(btn)) return;
    const row = btn.closest("[data-att-id]");
    const id = row?.getAttribute("data-att-id");
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.dataset.attAct === "open") {
      const name = row.querySelector(".att__name")?.textContent || "";
      openInApp(api.materials.fileUrl(id), { title: name, sameOrigin: true, mime: row.getAttribute("data-att-mime") || "" });
    } else if (btn.dataset.attAct === "del") {
      act(() => api.materials.remove(id));
    }
  });

  container.addEventListener("change", (e) => {
    const input = e.target.closest?.("[data-att-input]");
    if (!input || !input.files?.length) return;
    upload([...input.files]);
    input.value = "";
  });

  container.addEventListener("dragover", (e) => {
    const drop = e.target.closest?.("[data-att-drop]");
    if (!drop) return;
    e.preventDefault();
    drop.classList.add("is-over");
  });
  container.addEventListener("dragleave", (e) => {
    e.target.closest?.("[data-att-drop]")?.classList.remove("is-over");
  });
  container.addEventListener("drop", (e) => {
    const drop = e.target.closest?.("[data-att-drop]");
    if (!drop) return;
    e.preventDefault();
    e.stopPropagation();          // sonst greift die Tages-Timeline als Drop-Ziel
    drop.classList.remove("is-over");
    if (e.dataTransfer?.files?.length) upload([...e.dataTransfer.files]);
  });
}
