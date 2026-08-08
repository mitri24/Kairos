// Request-gebundener Nutzerkontext. Statt jede repo-Funktion um einen userId-
// Parameter zu erweitern, tragen wir die authentifizierte user_id im
// AsyncLocalStorage. repo.js liest sie über currentUserId() — fail-closed:
// ohne aktiven Kontext wirft es 401 (keine versehentlich un-skopierten Queries).
import { AsyncLocalStorage } from "node:async_hooks";
import { httpErr } from "./lib/util.js";

const als = new AsyncLocalStorage();

// Nur für Tests/Bootstrap: expliziter Fallback-Nutzer, wenn KEIN ALS-Kontext
// aktiv ist. In Produktion NIE gesetzt (bleibt null) → echte Requests laufen
// ausschließlich über runAs, unbegleitete repo-Aufrufe bleiben fail-closed (401).
let defaultUserId = null;
export function setDefaultUserId(id) { defaultUserId = id; }

// Handler im Nutzerkontext ausführen (Request-Dispatcher + Tick-Schleife pro Nutzer).
export function runAs(userId, fn) {
  return als.run({ userId }, fn);
}

// Aktuelle user_id oder 401. Jede per-Nutzer-Query in repo.js nutzt dies.
export function currentUserId() {
  const store = als.getStore();
  if (store && store.userId != null) return store.userId;
  if (defaultUserId != null) return defaultUserId;   // nur Tests/Bootstrap
  throw httpErr(401, "Nicht angemeldet");
}

// Wie currentUserId, aber null statt Fehler (für optionale/öffentliche Pfade).
export function optionalUserId() {
  const store = als.getStore();
  return store && store.userId != null ? store.userId : null;
}
