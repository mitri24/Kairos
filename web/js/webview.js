// In-App-Viewer: öffnet Links, PDFs und Bilder in einem Rahmen IN der App,
// statt extern weiterzuleiten (Wunsch: „nicht ständig hin- und herspringen").
//
// Realität externer Seiten: Manche blocken das Einbetten (X-Frame-Options/CSP).
// Das ist vom Einbetter aus nicht zuverlässig erkennbar — deshalb zeigt der
// Viewer IMMER eine „Extern öffnen"-Leiste und einen Hinweis hinter dem Frame;
// bleibt der Frame leer, ist der Ausweg einen Klick entfernt. Die Wahl
// „immer extern" wird pro Domain gemerkt (localStorage).
//
// Globale Übernahme: Klicks auf Cross-Origin-Links (topics, Materialien,
// „Jetzt dran"-Ressource …) werden abgefangen und hier geöffnet — außer die
// Person hält ⌘/Ctrl gedrückt oder hat „immer extern" gewählt.
import { escapeHtml } from "/js/util.js";
import { icon } from "/js/icons.js";
import { getLang } from "/js/i18n.js";

// Sichtbare Texte zweisprachig (Muster wie knowledge.js/library.js).
const TXT = {
  de: {
    close: "Schließen",
    closeEsc: "Schließen (Esc)",
    alwaysExternal: "immer extern",
    openExternal: "Extern öffnen",
    thisPage: "Diese Seite",
    notLoading: "lädt hier nicht?",
    blockHint: "Manche Seiten verbieten das Einbetten (z.&nbsp;B. Google, YouTube-Startseite). Dann hilft nur:",
  },
  en: {
    close: "Close",
    closeEsc: "Close (Esc)",
    alwaysExternal: "always open externally",
    openExternal: "Open externally",
    thisPage: "This page",
    notLoading: "not loading here?",
    blockHint: "Some sites block embedding (e.g.&nbsp;Google, the YouTube home page). Only one way out:",
  },
};
const T = () => TXT[getLang()] || TXT.de;

const LS_EXTERNAL = "kairos_open_external"; // JSON-Array von Hostnamen

function externalHosts() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_EXTERNAL) || "[]")); } catch { return new Set(); }
}
function rememberExternal(host) {
  const set = externalHosts();
  set.add(host);
  try { localStorage.setItem(LS_EXTERNAL, JSON.stringify([...set].slice(-100))); } catch { /* ignore */ }
}
function forgetExternal(host) {
  const set = externalHosts();
  set.delete(host);
  try { localStorage.setItem(LS_EXTERNAL, JSON.stringify([...set])); } catch { /* ignore */ }
}

let overlay = null;

function close() {
  overlay?.remove();
  overlay = null;
  document.removeEventListener("keydown", onKey, true);
}
function onKey(e) {
  if (e.key === "Escape") { e.preventDefault(); close(); }
}

// url: absolute URL (same-origin Dateien ODER extern). title: Anzeigename.
// sameOrigin=true meint eine EIGENE Datei aus der Bibliothek. Die bekommt einen
// strengen sandbox OHNE allow-same-origin — ein hochgeladenes HTML/SVG liefe
// sonst in unserer Origin und käme an Sitzungs-Cookie und localStorage.
// Ausnahme PDF: der eingebaute Betrachter braucht den Frame ungefesselt, und ein
// PDF kann in unserer Origin ohnehin kein Skript ausführen (mime durchreichen!).
export function openInApp(url, { title = "", sameOrigin = false, mime = "" } = {}) {
  close();
  let host = "";
  try { host = new URL(url, location.origin).hostname; } catch { /* darstellbar lassen */ }
  const sandbox = sameOrigin
    ? (/pdf/i.test(mime) ? "" : ' sandbox="allow-scripts allow-popups allow-downloads"')
    : ' sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"';

  overlay = document.createElement("div");
  overlay.className = "webview-overlay";
  const tx = T();
  overlay.innerHTML = `
    <div class="webview" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || url)}">
      <div class="webview__bar">
        <button class="webview__close" type="button" title="${escapeHtml(tx.closeEsc)}" aria-label="${escapeHtml(tx.close)}">
          ${icon("close", { size: 14, stroke: 2.2 })}
        </button>
        <div class="webview__title">
          <span class="webview__name">${escapeHtml(title || host || url)}</span>
          <span class="webview__host">${escapeHtml(host)}</span>
        </div>
        <div class="webview__actions">
          ${sameOrigin ? "" : `<label class="webview__remember"><input type="checkbox" id="wvRemember" /> ${escapeHtml(tx.alwaysExternal)}</label>`}
          <a class="webview__ext btn btn--ghost btn--sm" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tx.openExternal)}${icon("external", { size: 13 })}</a>
        </div>
      </div>
      <div class="webview__body">
        <div class="webview__fallback">
          <div class="webview__fallback-inner">
            <p><b>${escapeHtml(host || tx.thisPage)}</b> ${escapeHtml(tx.notLoading)}</p>
            <p class="webview__fallback-sub">${tx.blockHint}</p>
            <a class="btn btn--primary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tx.openExternal)}${icon("external", { size: 13 })}</a>
          </div>
        </div>
        <iframe class="webview__frame" src="${escapeHtml(url)}" title="${escapeHtml(title || url)}"${sandbox} referrerpolicy="no-referrer"></iframe>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".webview__close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#wvRemember")?.addEventListener("change", (e) => {
    if (e.target.checked && host) rememberExternal(host); else if (host) forgetExternal(host);
  });
  // Externer Klick aus der Leiste heraus schließt den Viewer gleich mit.
  for (const a of overlay.querySelectorAll("a[target=_blank]")) a.addEventListener("click", () => setTimeout(close, 50));
  document.addEventListener("keydown", onKey, true);
}

export function initWebview() {
  // Globale Übernahme externer Links (Capture-Phase, vor target=_blank).
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const a = e.target.closest?.("a[href]");
    if (!a || a.closest(".webview")) return;          // Viewer-eigene Links durchlassen
    if (a.dataset.extOpen) return;                     // ausdrücklich extern (Fokusmodus-Ausweg)
    let u;
    try { u = new URL(a.href, location.origin); } catch { return; }
    if (u.origin === location.origin) return;          // eigene Seiten (Login, Share) normal
    if (u.protocol !== "http:" && u.protocol !== "https:") return;
    if (externalHosts().has(u.hostname)) return;       // Wunsch „immer extern" respektieren
    e.preventDefault();
    openInApp(u.href, { title: a.textContent?.trim() || u.hostname });
  }, true);
  return {};
}
