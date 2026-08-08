// Teilen per Link: Prüfungs-Lernpläne, Themen, Notizen und Materialien werden
// über ein Bearer-Token öffentlich lesbar (LIVE, kein eingefrorener Stand) und
// können auf jedem Gerät in das eigene Konto importiert werden.
//
// Sicherheitsmodell: Das Token ist das Geheimnis (128 Bit, base64url). Öffentliche
// Handler laufen OHNE Sitzung — jeder Datenzugriff wird hier explizit in den
// Kontext des Share-BESITZERS gehoben (runAs), nie in einen Request-Nutzer.
import { randomBytes } from "node:crypto";
import * as repo from "./repo.js";
import { runAs } from "./authctx.js";
import { httpErr } from "./lib/util.js";
// Dasselbe Icon-Set wie die PWA — die geteilte Seite soll aussehen wie die App.
// (icons.js ist reines ESM ohne DOM-Zugriff und daher auch im Server nutzbar.)
import { icon } from "../web/js/icons.js";

export function newToken() {
  return randomBytes(16).toString("base64url");
}

export const SHARE_KINDS = ["exam", "topic", "note", "material"];

// Besitz prüfen + Share anlegen (im Kontext des angemeldeten Nutzers).
export function createShareFor(kind, refId) {
  if (!SHARE_KINDS.includes(kind)) throw httpErr(400, "Unbekannter Share-Typ");
  const exists =
    kind === "exam" ? repo.getExam(refId)
    : kind === "topic" ? repo.listTopics().find((t) => t.id === Number(refId))
    : kind === "note" ? repo.getNote(refId)
    : repo.getMaterial(refId);
  if (!exists) throw httpErr(404, "Inhalt nicht gefunden");
  return repo.createShare(kind, Number(refId), newToken());
}

// Material fürs Payload (ohne BLOB; Dateien bekommen einen öffentlichen Abruf-Pfad).
function materialView(m, token) {
  return {
    kind: m.kind, title: m.title, subject: m.subject, url: m.url,
    content: m.content, mime: m.mime, size: m.size,
    fileUrl: m.kind === "file" ? `/api/shares/public/${token}/file/${m.id}` : null,
    id: m.id,
  };
}

// Live-Payload eines Shares — läuft IM BESITZER-Kontext.
export function buildPayload(share) {
  return runAs(share.userId, () => {
    const token = share.token;
    if (share.kind === "note") {
      const n = repo.getNote(share.refId);
      if (!n) return null;
      return { kind: "note", note: { text: n.text, subject: n.subject } };
    }
    if (share.kind === "material") {
      const m = repo.getMaterial(share.refId);
      if (!m) return null;
      return { kind: "material", material: materialView(m, token) };
    }
    if (share.kind === "topic") {
      const t = repo.listTopics().find((x) => x.id === share.refId);
      if (!t) return null;
      const materials = repo.listMaterials().filter((m) => m.topicId === t.id);
      return {
        kind: "topic",
        topic: { text: t.text, done: t.done, confidence: t.confidence },
        materials: materials.map((m) => materialView(m, token)),
      };
    }
    // exam: kompletter Lernplan (Thema-Liste, Materialien, Notizen, Pensum, Termin)
    const e = repo.getExam(share.refId);
    if (!e) return null;
    const topics = repo.listTopics().filter((t) => t.examId === e.id);
    const topicIds = new Set(topics.map((t) => t.id));
    const materials = repo.listMaterials().filter((m) => m.examId === e.id || (m.topicId && topicIds.has(m.topicId)));
    const notes = repo.listNotes().filter((n) => n.examId === e.id);
    return {
      kind: "exam",
      exam: { name: e.name, date: e.date, totalHours: e.totalHours, color: e.color },
      topics: topics.map((t) => ({
        id: t.id, text: t.text, done: t.done, confidence: t.confidence,
        materials: materials.filter((m) => m.topicId === t.id).map((m) => materialView(m, token)),
      })),
      materials: materials.filter((m) => !m.topicId).map((m) => materialView(m, token)),
      notes: notes.map((n) => ({ text: n.text, subject: n.subject })),
    };
  });
}

// Token → { share, payload } oder null (unbekannt/widerrufen/Inhalt gelöscht).
export function resolveShare(token, { countView = false } = {}) {
  const share = repo.getShareByToken(token);
  if (!share) return null;
  const payload = buildPayload(share);
  if (!payload) return null;
  if (countView) repo.bumpShareViews(share.id);
  return { share, payload };
}

// Datei eines geteilten Inhalts ausliefern (nur wenn die Datei zum Share gehört).
export function resolveShareFile(token, materialId) {
  const share = repo.getShareByToken(token);
  if (!share) return null;
  return runAs(share.userId, () => {
    const m = repo.getMaterial(Number(materialId));
    if (!m || m.kind !== "file") return null;
    const allowed =
      share.kind === "material" ? m.id === share.refId
      : share.kind === "topic" ? m.topicId === share.refId
      : share.kind === "exam" ? (m.examId === share.refId ||
          (m.topicId != null && repo.listTopics().some((t) => t.id === m.topicId && t.examId === share.refId)))
      : false;
    if (!allowed) return null;
    return repo.getMaterialData(m.id);
  });
}

// ── Import in das EIGENE Konto ──────────────────────────────────────────
// Läuft im Kontext des angemeldeten Nutzers; Blob-Kopien werden vorab im
// Besitzer-Kontext gelesen (verschachteltes runAs ist mit ALS unproblematisch).
export function importShare(token) {
  const share = repo.getShareByToken(token);
  if (!share) throw httpErr(404, "Link unbekannt oder widerrufen");
  const payload = buildPayload(share);
  if (!payload) throw httpErr(410, "Der geteilte Inhalt existiert nicht mehr");

  // Datei-Inhalte im Besitzer-Kontext einsammeln (id → {mime,size,data}).
  const fileIds = [];
  const collect = (materials = []) => { for (const m of materials) if (m.kind === "file") fileIds.push(m.id); };
  if (payload.kind === "material") collect([payload.material]);
  if (payload.kind === "topic") collect(payload.materials);
  if (payload.kind === "exam") {
    collect(payload.materials);
    for (const t of payload.topics) collect(t.materials);
  }
  const blobs = new Map();
  runAs(share.userId, () => {
    for (const id of fileIds) {
      const d = repo.getMaterialData(id);
      if (d) blobs.set(id, d);
    }
  });

  const counts = { exams: 0, topics: 0, materials: 0, notes: 0 };
  const importMaterial = (m, { topicId = null, examId = null } = {}) => {
    const blob = m.kind === "file" ? blobs.get(m.id) : null;
    if (m.kind === "file" && !blob) return; // Datei nicht lesbar → still überspringen
    repo.createMaterial({
      topicId, examId, kind: m.kind, title: m.title, subject: m.subject,
      url: m.url, content: m.content,
      mime: blob?.mime ?? m.mime, size: blob?.size ?? m.size, data: blob?.data ?? null,
    });
    counts.materials++;
  };

  if (payload.kind === "note") {
    repo.createNote({ text: payload.note.text, subject: payload.note.subject });
    counts.notes++;
  } else if (payload.kind === "material") {
    importMaterial(payload.material);
  } else if (payload.kind === "topic") {
    const t = repo.createTopic({ text: payload.topic.text });
    counts.topics++;
    for (const m of payload.materials) importMaterial(m, { topicId: t.id });
  } else if (payload.kind === "exam") {
    const e = repo.createExam({
      name: payload.exam.name, date: payload.exam.date,
      totalHours: payload.exam.totalHours, color: payload.exam.color,
    });
    counts.exams++;
    for (const pt of payload.topics) {
      // Frischer Start beim Empfänger: done/confidence bewusst NICHT übernommen.
      const t = repo.createTopic({ text: pt.text, examId: e.id });
      counts.topics++;
      for (const m of pt.materials) importMaterial(m, { topicId: t.id });
    }
    for (const m of payload.materials) importMaterial(m, { examId: e.id });
    for (const n of payload.notes) {
      repo.createNote({ text: n.text, subject: n.subject, examId: e.id });
      counts.notes++;
    }
  }
  return counts;
}

// ── Öffentliche HTML-Seite (/s/:token) ──────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

function fmtDate(ms) {
  if (!ms) return null;
  try {
    return new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));
  } catch { return null; }
}
const confLabel = ["", "wackelig", "okay", "sicher"];

function materialLine(m) {
  const ico = icon(m.kind === "file" ? "file" : m.kind === "card" ? "card" : "link");
  if (m.kind === "link" && m.url) return `<li>${ico} <a href="${esc(m.url)}" rel="noopener noreferrer">${esc(m.title)}</a></li>`;
  if (m.kind === "file" && m.fileUrl) return `<li>${ico} <a href="${esc(m.fileUrl)}">${esc(m.title)}</a> <span class="mut">(${esc(m.mime || "Datei")})</span></li>`;
  if (m.kind === "card") return `<li>${ico} <b>${esc(m.title)}</b>${m.content ? `<pre>${esc(m.content)}</pre>` : ""}</li>`;
  return `<li>${ico} ${esc(m.title)}</li>`;
}

export function renderShareHtml(share, payload) {
  const p = payload;
  let title = "Geteilter Inhalt";
  let body = "";
  if (p.kind === "note") {
    title = "Geteilte Notiz";
    body = `<div class="card"><p class="note">${esc(p.note.text)}</p>${p.note.subject ? `<span class="pill">${esc(p.note.subject)}</span>` : ""}</div>`;
  } else if (p.kind === "material") {
    title = esc(p.material.title);
    body = `<div class="card"><ul class="mats">${materialLine(p.material)}</ul></div>`;
  } else if (p.kind === "topic") {
    title = `Thema: ${esc(p.topic.text)}`;
    body = `<div class="card">${p.materials.length ? `<ul class="mats">${p.materials.map(materialLine).join("")}</ul>` : '<p class="mut">Keine Materialien angehängt.</p>'}</div>`;
  } else if (p.kind === "exam") {
    title = esc(p.exam.name);
    const date = fmtDate(p.exam.date);
    body = `
      <div class="meta">${date ? `<span class="pill">${icon("calendar", { size: 14 })} ${esc(date)}</span>` : ""}${p.exam.totalHours ? `<span class="pill">${icon("hourglass", { size: 14 })} ${esc(p.exam.totalHours)} h Pensum</span>` : ""}<span class="pill">${p.topics.length} Themen</span></div>
      <div class="card">
        <h2>Lernplan · Themen</h2>
        <ol class="topics">
          ${p.topics.map((t) => `<li><span>${esc(t.text)}</span>${t.confidence ? `<em class="conf">${confLabel[t.confidence] || ""}</em>` : ""}${t.materials.length ? `<ul class="mats">${t.materials.map(materialLine).join("")}</ul>` : ""}</li>`).join("")}
        </ol>
        ${p.materials.length ? `<h2>Weitere Materialien</h2><ul class="mats">${p.materials.map(materialLine).join("")}</ul>` : ""}
        ${p.notes.length ? `<h2>Notizen</h2><ul class="notes">${p.notes.map((n) => `<li>${esc(n.text)}</li>`).join("")}</ul>` : ""}
      </div>`;
  }

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} — Kairos</title>
<link rel="icon" href="/icons/favicon.ico" sizes="32x32">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#DDDBD3">
<style>
  :root { color-scheme: light; }
  body { margin:0; padding:32px 20px 64px; background:#DDDBD3; color:#1E211D;
         font-family:"Hanken Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .wrap { max-width:660px; margin:0 auto; }
  .brand { display:flex; align-items:center; gap:8px; font-weight:800; color:#2F6349; letter-spacing:.02em; margin-bottom:18px; }
  .brand__mark { width:22px; height:22px; flex:none; }
  h1 { margin:.1em 0 .35em; font-size:1.7rem; color:#26261F; }
  h2 { font-size:.95rem; text-transform:uppercase; letter-spacing:.06em; color:#8F8D82; margin:1.4em 0 .5em; }
  .card { background:#FFFFFF; border:1px solid #EAE8E0; border-radius:18px; padding:22px 24px;
          box-shadow:0 12px 30px -24px rgba(30,33,29,.55); margin-top:14px; }
  .meta { display:flex; gap:8px; flex-wrap:wrap; }
  .pill { background:#EBF1EC; color:#2F6349; border-radius:999px; padding:4px 12px; font-size:.85rem; font-weight:600; }
  .topics { padding-left:1.2em; } .topics > li { margin:.45em 0; }
  .conf { color:#8A6D3B; font-style:normal; font-size:.82rem; margin-left:.5em; }
  .mats { list-style:none; padding-left:.2em; margin:.35em 0; } .mats li { margin:.3em 0; }
  .mats pre { background:#F4F2EC; border-radius:9px; padding:10px 12px; white-space:pre-wrap; font-size:.9rem; }
  .notes { padding-left:1.2em; }
  .note { font-size:1.05rem; }
  .mut { color:#93978B; font-size:.85rem; }
  .ico { vertical-align:-.18em; flex:none; }
  .pill .ico { color:#2F6349; margin-right:2px; }
  .mats .ico { color:#8F8D82; margin-right:4px; }
  a { color:#2F6349; }
  .cta { display:inline-block; margin-top:20px; background:#3E7D5E; color:#fff; text-decoration:none;
         font-weight:700; border-radius:999px; padding:12px 22px; box-shadow:0 8px 18px -8px rgba(62,125,94,.55); }
  .cta:hover { background:#2F6349; }
  .foot { margin-top:26px; color:#93978B; font-size:.85rem; }
</style></head>
<body><div class="wrap">
  <div class="brand">
    <svg class="brand__mark" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <g transform="translate(8 0)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 158 34 C 101 25, 45 63, 32 119 C 17 183, 68 223, 128 221 C 190 219, 226 172, 220 117 C 216 84, 205 66, 194 56" stroke-width="20"/>
        <path d="M 112 69 C 108 94, 108 124, 110 171 M 111 122 C 132 105, 151 88, 169 72 M 112 123 C 133 137, 150 155, 164 173 C 170 181, 178 178, 183 166" stroke-width="18"/>
        <circle cx="179" cy="42" r="7.5" fill="currentColor" stroke="none"/>
      </g>
    </svg>
    <span>Kairos</span>
  </div>
  <h1>${title}</h1>
  ${body}
  <a class="cta" href="/?import=${esc(share.token)}">In meine Kairos-App übernehmen</a>
  <p class="foot">Mit Kairos geteilt — wer diesen Link hat, kann den Inhalt sehen. Die Person, die geteilt hat, kann den Link jederzeit widerrufen.</p>
</div></body></html>`;
}
