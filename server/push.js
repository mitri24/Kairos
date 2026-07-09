// Push-Anwendungsschicht: VAPID-Schlüssel verwalten, Abonnements pflegen und
// Benachrichtigungen an alle Clients senden (auch bei geschlossener App).
// Nutzt die reine Protokollschicht (webpush.js) und den Datenzugriff (repo.js).
import * as webpush from "./webpush.js";
import * as repo from "./repo.js";
import { nowMs } from "./lib/util.js";

// ── VAPID-Schlüssel ──────────────────────────────
// Reihenfolge: ENV (Produktion) → DB (persistiert) → einmalig generieren + speichern.
// So läuft die Dev-Umgebung ohne Konfiguration, Produktion kann feste Keys setzen.
let vapidCache = null;

export function getVapid() {
  if (vapidCache) return vapidCache;

  const subject = process.env.VAPID_SUBJECT || "mailto:lernuhr@localhost";
  const envPublic = process.env.VAPID_PUBLIC_KEY || null;
  const envPrivate = process.env.VAPID_PRIVATE_KEY || null;
  // Nur EIN ENV-Schlüssel gesetzt ⇒ mit hoher Wahrscheinlichkeit Fehlkonfiguration.
  // Deutlich warnen statt still ein anderes Paar zu verwenden (bricht sonst Abos).
  if (Boolean(envPublic) !== Boolean(envPrivate)) {
    console.warn(
      "[Lernuhr] WARNUNG: Nur EINER von VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ist gesetzt — " +
      "beide werden ignoriert. Setze beide oder keinen (dann DB/Autogen)."
    );
  }
  let publicKey = envPublic && envPrivate ? envPublic : null;
  let privateKey = envPublic && envPrivate ? envPrivate : null;

  if (!publicKey || !privateKey) {
    publicKey = repo.getMeta("vapid_public_key");
    privateKey = repo.getMeta("vapid_private_key");
  }
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVapidKeys();
    repo.setMeta("vapid_public_key", keys.publicKey);
    repo.setMeta("vapid_private_key", keys.privateKey);
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    console.log("[push] New VAPID keys generated and stored in the DB.");
  }

  vapidCache = { publicKey, privateKey, subject };
  return vapidCache;
}

export function getPublicKey() {
  return getVapid().publicKey;
}

// ── Abonnements ──────────────────────────────────
function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

export function subscribe(sub) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    throw badRequest("Invalid push subscription");
  }
  repo.saveSubscription({
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    userAgent: typeof sub.userAgent === "string" ? sub.userAgent.slice(0, 256) : null,
  });
  return { ok: true, count: repo.countSubscriptions() };
}

export function unsubscribe(endpoint) {
  if (endpoint) repo.deleteSubscription(endpoint);
  return { ok: true, count: repo.countSubscriptions() };
}

// ── Broadcast an alle Abonnements ────────────────
// Tote Endpunkte (404/410) werden automatisch entfernt.
export async function broadcast(payload, opts = {}) {
  const vapid = getVapid();
  const subs = repo.listSubscriptions();
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map((s) => deliver(s, json, vapid, opts))
  );

  let sent = 0;
  let pruned = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status !== "fulfilled") { failed++; continue; }
    if (r.value.sent) sent++;
    if (r.value.pruned) pruned++;
    if (r.value.failed) failed++;
  }
  return { total: subs.length, sent, pruned, failed };
}

async function deliver(sub, json, vapid, opts) {
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      json,
      vapid,
      opts
    );
    if (res.statusCode === 404 || res.statusCode === 410) {
      repo.deleteSubscription(sub.endpoint); // Endpunkt abgelaufen → aufräumen
      return { pruned: true };
    }
    if (res.ok) {
      repo.touchSubscription(sub.endpoint);
      return { sent: true };
    }
    console.warn(`[push] HTTP ${res.statusCode} for …${sub.endpoint.slice(-24)}: ${res.body?.slice(0, 120) || ""}`);
    return { failed: true };
  } catch (err) {
    console.warn(`[Lernuhr] Push-Versand fehlgeschlagen: ${err.message}`);
    return { failed: true };
  }
}

// ── Konkrete Benachrichtigungen ──────────────────
const LABEL = {
  focus: "Focus",
  "short-break": "Short break",
  "long-break": "Long break",
};

// Wird vom Server-Tick aufgerufen, sobald eine Phase real abläuft.
export async function notifyPhaseComplete({ from, to } = {}) {
  const fromLabel = LABEL[from] || LABEL.focus;
  const toLabel = LABEL[to] || LABEL.focus;
  const focusDone = from === "focus";

  const payload = {
    title: `${fromLabel} done`,
    body: focusDone
      ? `Nice work! Now ${toLabel}. Take a breath 🌿`
      : `Break over — back to ${toLabel}. You've got this 💪`,
    tag: "lernuhr-phase",
    renotify: true,
    requireInteraction: focusDone, // Fokus-Ende bleibt stehen, bis quittiert
    phase: to,
    url: "/",
    timestamp: nowMs(),
  };
  return broadcast(payload, { urgency: "high", ttl: 5 * 60, topic: "lernuhr-phase" });
}

// Testbenachrichtigung (z. B. Button in der PWA nach dem Aktivieren).
export async function sendTest() {
  const payload = {
    title: "🔔 Test · Kairos",
    body: "Notifications are working — even when the app is closed.",
    tag: "lernuhr-test",
    renotify: true,
    url: "/",
    timestamp: nowMs(),
  };
  return broadcast(payload, { urgency: "high", ttl: 2 * 60, topic: "lernuhr-test" });
}
