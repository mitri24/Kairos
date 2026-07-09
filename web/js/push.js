// Client-Push-Steuerung: Toggle in der Sidebar, Abo-Lebenszyklus, Statusanzeige.
// Der eigentliche Empfang läuft im Service Worker (sw.js: "push"-Event) — auch bei
// geschlossener App. Dieses Modul verbindet nur UI ↔ PushManager ↔ Backend.

// Von main.js gelesen: wenn Push aktiv ist, unterdrückt die Seite ihre lokale
// new-Notification (der Service Worker zeigt sie), um Doppel-Notifications zu vermeiden.
export const pushState = { active: false };

// base64url-VAPID-Key → Uint8Array (applicationServerKey erwartet Bytes).
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function initPush(ctx) {
  const btn = document.getElementById("pushToggle");
  const label = document.getElementById("pushLabel");
  const hint = document.getElementById("pushHint");
  if (!btn) return null;

  const supported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  if (!supported) {
    btn.hidden = true;
    if (hint) { hint.hidden = false; hint.textContent = "Dieser Browser unterstützt keine Push-Benachrichtigungen."; }
    return null;
  }
  btn.hidden = false;

  let subscribed = false;
  let busy = false;

  function render() {
    const blocked = Notification.permission === "denied";
    btn.classList.toggle("is-on", subscribed && !blocked);
    btn.classList.toggle("is-blocked", blocked);
    btn.setAttribute("aria-pressed", String(subscribed));
    btn.disabled = busy || blocked;
    if (label) {
      label.textContent = blocked
        ? "Benachrichtigungen blockiert"
        : subscribed
          ? "Benachrichtigungen an"
          : "Benachrichtigungen aktivieren";
    }
    if (hint) {
      if (blocked) { hint.hidden = false; hint.textContent = "In den Browser-Einstellungen für diese Seite erlauben."; }
      else { hint.hidden = true; }
    }
  }

  async function refresh() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      subscribed = !!sub && Notification.permission === "granted";
    } catch {
      subscribed = false;
    }
    pushState.active = subscribed;
    render();
  }

  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const { publicKey } = await ctx.api.push.publicKey();
    const sub = existing || (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
    // ATOMAR: schlägt die Backend-Registrierung fehl, das Browser-Abo zurückrollen —
    // sonst gälte die App als "an", das Backend kennt das Abo aber nicht → es käme
    // NIE ein Push (und die lokale Fallback-Notification wäre unterdrückt).
    try {
      await ctx.api.push.subscribe(sub.toJSON());
    } catch (err) {
      if (!existing) await sub.unsubscribe().catch(() => {}); // nur ein NEU angelegtes Abo zurückrollen
      throw err;
    }
    // Sofortige Bestätigung: eine echte Testbenachrichtigung.
    ctx.api.push.test().catch(() => {});
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    // Reihenfolge: erst das Browser-Abo kündigen, dann das Backend aufräumen.
    // Scheitert die Browser-Kündigung, bleibt das Backend-Abo bestehen (Pushes
    // funktionieren weiter) und der Zustand bleibt konsistent "an".
    await sub.unsubscribe();
    await ctx.api.push.unsubscribe(sub.endpoint).catch(() => {});
  }

  btn.addEventListener("click", async () => {
    if (busy || Notification.permission === "denied") return;
    busy = true;
    render();
    try {
      if (subscribed) await disable();
      else await enable();
    } catch (err) {
      console.error("[Lernuhr] Push umschalten:", err);
    } finally {
      busy = false;
      await refresh();
    }
  });

  refresh();
  return { refresh };
}
