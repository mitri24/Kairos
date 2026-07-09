// Service Worker für die ADHD-Lernuhr (Offline-PWA).
// Strategie:
//   • /api/*            → immer Netzwerk (nie cachen). Bei Fehler JSON-Fehler durchreichen.
//   • Navigation/statisch → network-first mit Fallback auf den Cache
//                          (Code-Updates greifen sofort, offline bleibt bedienbar).
// Version im Cache-Namen erzwingt saubere Aktualisierung beim Aktivieren.

const VERSION = "v6";
const CACHE = `lernuhr-shell-${VERSION}`;

// App-Shell: alles, was zum Kaltstart offline nötig ist.
const APP_SHELL = [
  "/",
  "/index.html",
  "/css/tokens.css",
  "/css/base.css",
  "/css/timer.css",
  "/css/tasks.css",
  "/css/exam.css",
  "/css/today.css",
  "/css/timeline.css",
  "/css/topics.css",
  "/css/week.css",
  "/css/push.css",
  "/js/main.js",
  "/js/store.js",
  "/js/api.js",
  "/js/push.js",
  "/js/util.js",
  "/js/clock.js",
  "/js/nav.js",
  "/js/timer.js",
  "/js/tasks.js",
  "/js/exam.js",
  "/js/today.js",
  "/js/timeline.js",
  "/js/topics.js",
  "/js/week.js",
  "/shared/pomodoro.js",
  "/manifest.webmanifest",
  "/icons/icon.svg",
];

// ── Install: App-Shell vorcachen ────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Einzeln hinzufügen: ein fehlendes Asset soll die Installation nicht abbrechen.
      await Promise.all(
        APP_SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

// ── Activate: alte Caches entfernen ─────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => (key === CACHE ? null : caches.delete(key)))
      );
      await self.clients.claim();
    })()
  );
});

// ── Fetch ───────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Nur GET behandeln; Mutationen (POST/PUT/DELETE) direkt ans Netz.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Fremde Origins nicht anfassen (Offline-PWA hat ohnehin keine externen Assets).
  if (url.origin !== self.location.origin) return;

  // /api/* → niemals cachen. Netzwerk erzwingen; bei Fehler JSON-Fehler durchreichen.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            JSON.stringify({ error: "offline", offline: true }),
            {
              status: 503,
              statusText: "Service Unavailable",
              headers: { "Content-Type": "application/json" },
            }
          )
      )
    );
    return;
  }

  // Navigation/statisch: network-first, Fallback auf Cache.
  event.respondWith(networkFirst(req, url));
});

async function networkFirst(req, url) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    // Nur erfolgreiche Basis-Antworten der eigenen Origin cachen.
    if (res && res.ok && (res.type === "basic" || res.type === "default")) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (e) {
    // Offline: exakten Treffer versuchen …
    const cached = await cache.match(req);
    if (cached) return cached;
    // … dann sinnvolle Fallbacks für Navigationen.
    if (req.mode === "navigate" || url.pathname === "/") {
      const shell =
        (await cache.match("/index.html")) || (await cache.match("/"));
      if (shell) return shell;
    }
    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

// ── Web Push ─────────────────────────────────────────────────────────────
// Empfängt Nachrichten vom Backend — auch wenn keine App-Seite offen ist.
// Zuständigkeit: Der SW zeigt die Notification, WENN keine sichtbare Seite offen
// ist. Bei sichtbarer Seite übernimmt die Seite (Ton + UI); der SW meldet den
// Push nur weiter (postMessage) und zeigt keine doppelte OS-Notification.
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data ? event.data.json() : {};
      } catch {
        data = { title: "Kairos", body: event.data ? event.data.text() : "" };
      }

      const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Nur FOKUSSIERT (aktiv im Vordergrund) zählt als "Nutzer schaut hin". Ein bloß
      // sichtbares Fenster (zweiter Monitor, Split-View) soll die OS-Notification NICHT
      // unterdrücken — sonst ginge die Benachrichtigung dort verloren.
      const hasFocused = clientsArr.some((c) => c.focused);

      // Offene Seiten informieren (sie stoßen ein sofortiges Reconcile/Chime an).
      for (const c of clientsArr) c.postMessage({ type: "push", data });

      // Fokussierte Seite → Nutzer schaut ohnehin hin; keine zusätzliche OS-Notification.
      if (hasFocused) return;

      await self.registration.showNotification(data.title || "Kairos", {
        body: data.body || "",
        tag: data.tag || "lernuhr",
        renotify: !!data.renotify,
        requireInteraction: !!data.requireInteraction,
        icon: data.icon || "/icons/icon-192.png",
        badge: data.badge || "/icons/icon.svg",
        timestamp: data.timestamp || Date.now(),
        lang: "en",
        data: { url: data.url || "/" },
      });
    })()
  );
});

// Klick auf die Notification → App fokussieren oder öffnen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) { await c.focus(); return; }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});

// Abo-Rotation durch den Browser → neu abonnieren und beim Backend registrieren.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/api/push/public-key");
        const { publicKey } = await res.json();
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        /* Best effort — beim nächsten App-Start korrigiert die Seite das Abo. */
      }
    })()
  );
});

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
