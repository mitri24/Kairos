// Client-Login (Magic-Link). Self-contained: erzeugt eigenes Overlay + Styling
// (keine index.html-Abhängigkeit). Blockiert den App-Boot, solange nicht
// angemeldet. Nach dem Login-Klick lädt der Verify-Redirect die Seite neu (→ /),
// dann liefert /api/auth/me den Nutzer und der Boot läuft normal durch.
import { api } from "/js/api.js";
import { confirmDialog } from "/js/dialog.js";

let overlayEl = null;

// Beim Boot aufgerufen: gibt den Nutzer zurück, sonst null (Login sichtbar).
// Bei Netzfehler (offline) NICHT blockieren — die PWA läuft mit Cache weiter.
export async function ensureAuthed() {
  try {
    const { user } = await api.auth.me();
    if (user) { wireLogout(user); return user; }
    showLogin();
    return null;
  } catch {
    return { offline: true };
  }
}

// Sitzung mitten in der Nutzung abgelaufen → Login erneut zeigen.
window.addEventListener("auth-required", () => showLogin());

function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }

function showLogin() {
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.setAttribute("role", "dialog");
  overlayEl.setAttribute("aria-modal", "true");
  overlayEl.setAttribute("aria-label", "Sign in to Kairos");
  overlayEl.style.cssText = "position:fixed;inset:0;z-index:9000;display:grid;place-items:center;padding:24px;background:var(--bg,#F3F1EA);font-family:var(--font,ui-sans-serif,system-ui,sans-serif)";
  overlayEl.innerHTML = `
    <div style="width:min(420px,100%);background:var(--card,#fff);border:1px solid var(--line,#E2DFD4);border-radius:20px;box-shadow:0 30px 70px -30px rgba(30,33,29,.5);padding:34px 30px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <svg viewBox="0 0 256 256" aria-hidden="true" focusable="false" style="width:30px;height:30px;flex:none;color:var(--accent,#3E7D5E)">
          <g transform="translate(8 0)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M 158 34 C 101 25, 45 63, 32 119 C 17 183, 68 223, 128 221 C 190 219, 226 172, 220 117 C 216 84, 205 66, 194 56" stroke-width="20"/>
            <path d="M 112 69 C 108 94, 108 124, 110 171 M 111 122 C 132 105, 151 88, 169 72 M 112 123 C 133 137, 150 155, 164 173 C 170 181, 178 178, 183 166" stroke-width="18"/>
            <circle cx="179" cy="42" r="7.5" fill="currentColor" stroke="none"/>
          </g>
        </svg>
        <span style="font-weight:800;font-size:19px;letter-spacing:-.02em;color:var(--ink,#26302A)">Kairos</span>
      </div>
      <h1 style="font-size:23px;letter-spacing:-.02em;margin:14px 0 4px;color:var(--ink,#26302A)">Sign in</h1>
      <p style="color:var(--muted-2,#6B7169);font-size:14px;margin:0 0 20px;line-height:1.5">Enter your email and we'll send you a one-time login link. No password needed.</p>
      <form id="authForm" novalidate>
        <input id="authEmail" type="email" autocomplete="email" required placeholder="you@example.com"
          style="width:100%;font:500 15px var(--font,system-ui);color:var(--ink,#26302A);background:var(--card,#fff);border:1px solid var(--line,#E2DFD4);border-radius:10px;padding:12px 14px;outline:none" />
        <button id="authSend" type="submit"
          style="width:100%;margin-top:12px;height:46px;border:0;border-radius:11px;background:var(--accent,#3E7D5E);color:#fff;font:700 15px var(--font,system-ui);cursor:pointer">Send login link</button>
      </form>
      <div id="authMsg" style="margin-top:16px;font-size:13.5px;color:var(--ink-soft,#3B463F);line-height:1.5"></div>
    </div>`;
  document.body.appendChild(overlayEl);

  const form = overlayEl.querySelector("#authForm");
  const emailEl = overlayEl.querySelector("#authEmail");
  const sendBtn = overlayEl.querySelector("#authSend");
  const msg = overlayEl.querySelector("#authMsg");
  emailEl.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailEl.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) { emailEl.focus(); msg.textContent = "Please enter a valid email address."; return; }
    sendBtn.disabled = true; sendBtn.textContent = "Sending…";
    try {
      const res = await api.auth.request(email);
      const devLink = res && res.devLink;
      msg.innerHTML = `We sent a login link to <b>${esc(email)}</b>. Open it to continue — the link is valid for 15 minutes.`
        + (devLink ? `<div style="margin-top:12px"><a href="${esc(devLink)}" style="display:inline-block;padding:9px 14px;border-radius:10px;border:1px solid var(--accent,#3E7D5E);color:var(--accent-ink,#2F6349);text-decoration:none;font-weight:700">Open login link</a><div style="margin-top:6px;color:var(--muted-2,#6B7169);font-size:11.5px">(local dev — shown because email delivery isn't configured)</div></div>` : "");
    } catch (err) {
      msg.textContent = err.message || "Couldn't send the link. Try again.";
    } finally {
      sendBtn.disabled = false; sendBtn.textContent = "Send login link";
    }
  });
}

// „Sign out" an den Benutzer-Chip hängen (falls vorhanden) — self-contained.
function wireLogout(user) {
  const chip = document.getElementById("userAvatar") || document.getElementById("userName");
  const target = chip ? (chip.closest("[data-user-chip], .user-chip, button") || chip) : null;
  if (!target || target.__logoutWired) return;
  target.__logoutWired = true;
  target.style.cursor = "pointer";
  target.title = `Signed in as ${user.email} — click to sign out`;
  target.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Sign out?", body: `You're signed in as ${user.email}.`, confirmLabel: "Sign out", danger: false });
    if (!ok) return;
    try { await api.auth.logout(); } catch { /* egal */ }
    location.reload();
  });
}
