// Teilen per Link (Client): Link erzeugen + kopieren, Import-Flow (?import=TOKEN),
// Verwaltung (Liste/Widerruf) im Profil. Server: server/share.js.
import { getLang } from "/js/i18n.js";
import { showToast } from "/js/toast.js";
import { confirmDialog } from "/js/dialog.js";

const TXT = {
  de: {
    copied: "Link kopiert — teile ihn, wo du willst",
    copiedBody: (u) => u,
    failed: "Link konnte nicht erstellt werden",
    importTitle: "Geteilten Inhalt übernehmen?",
    importBody: (what) => `„${what}“ wird in dein Kairos kopiert (Prüfung, Themen, Materialien, Notizen — je nach Inhalt).`,
    importOk: "Übernehmen",
    importCancel: "Nicht jetzt",
    imported: (c) => {
      const bits = [];
      if (c.exams) bits.push(`${c.exams} Prüfung`);
      if (c.topics) bits.push(`${c.topics} Themen`);
      if (c.materials) bits.push(`${c.materials} Materialien`);
      if (c.notes) bits.push(`${c.notes} Notizen`);
      return bits.length ? `Übernommen: ${bits.join(", ")}` : "Übernommen";
    },
    importFailed: "Import fehlgeschlagen",
    kinds: { exam: "Prüfungsplan", topic: "Thema", note: "Notiz", material: "Material" },
  },
  en: {
    copied: "Link copied — share it anywhere",
    copiedBody: (u) => u,
    failed: "Couldn’t create the link",
    importTitle: "Import shared content?",
    importBody: (what) => `“${what}” will be copied into your Kairos (exam, topics, materials, notes — depending on content).`,
    importOk: "Import",
    importCancel: "Not now",
    imported: (c) => {
      const bits = [];
      if (c.exams) bits.push(`${c.exams} exam`);
      if (c.topics) bits.push(`${c.topics} topics`);
      if (c.materials) bits.push(`${c.materials} materials`);
      if (c.notes) bits.push(`${c.notes} notes`);
      return bits.length ? `Imported: ${bits.join(", ")}` : "Imported";
    },
    importFailed: "Import failed",
    kinds: { exam: "exam plan", topic: "topic", note: "note", material: "material" },
  },
};
const T = () => TXT[getLang()] || TXT.de;

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    // Fallback ohne Clipboard-Berechtigung.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

// Von überall aufrufbar: Share anlegen (idempotent) + absolute URL kopieren.
export async function shareContent(api, kind, refId) {
  const t = T();
  try {
    const { share } = await api.shares.create(kind, refId);
    const url = new URL(share.url, location.origin).href;
    const copied = await copyText(url);
    showToast({
      type: "success",
      title: copied ? t.copied : url,
      body: copied ? url : undefined,
    });
    return url;
  } catch (e) {
    showToast({ type: "error", title: t.failed, body: e.message });
    return null;
  }
}

// Beim App-Start: ?import=TOKEN → Inhalt anzeigen, nachfragen, übernehmen.
export function initShareImport({ store, api }) {
  const token = new URLSearchParams(location.search).get("import");
  if (!token) return {};
  // URL sofort säubern (kein Re-Import bei Reload).
  try { history.replaceState(null, "", location.pathname); } catch { /* ignore */ }

  (async () => {
    const t = T();
    let what = t.kinds.material;
    try {
      const { kind, payload } = await api.shares.resolve(token);
      what = payload?.exam?.name || payload?.topic?.text || payload?.material?.title
        || payload?.note?.text?.slice(0, 60) || t.kinds[kind] || what;
    } catch { /* Vorschau optional — Import fragt trotzdem */ }
    const ok = await confirmDialog({
      title: t.importTitle,
      body: t.importBody(String(what)),
      confirmLabel: t.importOk,
      cancelLabel: t.importCancel,
      danger: false,
    });
    if (!ok) return;
    try {
      const res = await api.shares.importToken(token);
      store.applySnapshot(res);
      showToast({ type: "success", title: t.imported(res.imported || {}) });
    } catch (e) {
      showToast({ type: "error", title: t.importFailed, body: e.message });
    }
  })();
  return {};
}
