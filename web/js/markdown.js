// Kleiner Markdown-Renderer für Notiz-Dokumente — zero-dependency wie der Rest.
//
// Sicherheitsmodell: der Text wird ZUERST vollständig HTML-escaped, danach
// werden nur die erkannten Markdown-Muster durch Tags ersetzt. Damit kann aus
// dem Nutzertext niemals Markup entstehen; Links werden zusätzlich auf
// http/https/mailto begrenzt (kein javascript:).
//
// Unterstützt bewusst nur, was beim Lernen zählt: Überschriften, Listen,
// Aufgabenhaken, Zitate, Code, Trennlinien, fett/kursiv, Links.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function safeHref(url) {
  const u = String(url).trim();
  return /^(https?:|mailto:)/i.test(u) ? u : "";
}

// Inline-Auszeichnung INNERHALB einer bereits escapten Zeile.
function inline(s) {
  return s
    // `code` zuerst — darin soll nichts weiter interpretiert werden.
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
      const href = safeHref(url.replace(/&amp;/g, "&"));
      return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : m;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

export function renderMarkdown(src) {
  const lines = esc(String(src ?? "")).split("\n");
  const out = [];
  let list = null;          // "ul" | "ol" | null
  let inCode = false;
  let para = [];

  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closePara = () => {
    if (para.length) { out.push(`<p>${inline(para.join("<br>"))}</p>`); para = []; }
  };
  const openList = (kind) => {
    if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    // Code-Block: alles dazwischen bleibt unangetastet.
    if (/^```/.test(line)) {
      closePara(); closeList();
      out.push(inCode ? "</code></pre>" : '<pre class="md-code"><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(raw + "\n"); continue; }

    if (!line.trim()) { closePara(); closeList(); continue; }

    // Trennlinie
    if (/^(---+|\*\*\*+)$/.test(line.trim())) { closePara(); closeList(); out.push("<hr>"); continue; }

    // Überschriften
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closePara(); closeList();
      const lvl = Math.min(6, h[1].length + 1);   // # → h2, damit der Dokumenttitel h1 bleibt
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }

    // Zitat
    const q = line.match(/^&gt;\s?(.*)$/);
    if (q) { closePara(); closeList(); out.push(`<blockquote>${inline(q[1])}</blockquote>`); continue; }

    // Aufgabenhaken (vor der normalen Liste prüfen)
    const task = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      closePara(); openList("ul");
      const done = task[1].toLowerCase() === "x";
      out.push(`<li class="md-task${done ? " is-done" : ""}"><input type="checkbox" disabled${done ? " checked" : ""}> ${inline(task[2])}</li>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) { closePara(); openList("ul"); out.push(`<li>${inline(ul[1])}</li>`); continue; }

    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ol) { closePara(); openList("ol"); out.push(`<li>${inline(ol[1])}</li>`); continue; }

    closeList();
    para.push(line);
  }

  closePara();
  closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("");
}

// Erste sinnvolle Zeile — Fallback-Titel für Dokumente ohne eigenen Titel.
export function firstLine(text, max = 80) {
  const line = String(text ?? "").split("\n").map((l) => l.replace(/^[#>\-*\s]+/, "").trim()).find(Boolean) || "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// Vorschautext OHNE die erste Zeile. Für Karten von Dokumenten ohne eigenen
// Titel: dort IST die erste Zeile die Überschrift und soll nicht direkt
// darunter ein zweites Mal stehen.
export function excerptBody(text, max = 160) {
  const lines = String(text ?? "").split("\n");
  const i = lines.findIndex((l) => l.replace(/^[#>\-*\s]+/, "").trim());
  return i < 0 ? "" : excerpt(lines.slice(i + 1).join("\n"), max);
}

// Kurzer Vorschautext ohne Markdown-Zeichen (für Karten).
export function excerpt(text, max = 160) {
  const flat = String(text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`_\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
