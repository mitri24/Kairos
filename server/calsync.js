// Kalender-Sync-Engine: hält lokale Kopien der verbundenen Konten (iCloud-CalDAV
// oder ICS-Abo-URL) aktuell — effizient und speicherminimal:
//   · Delta-Sync per sync-token (RFC 6578): nur Änderungen wandern übers Netz
//   · ctag-Kurzschluss: unveränderte Kalender kosten genau einen PROPFIND
//   · Initial-Sync per Zeitfenster-Query statt Komplett-Abzug
//   · Serien werden als Master (RRULE) gespeichert und erst beim Lesen expandiert
//   · abgelaufene Einzeltermine werden regelmäßig gelöscht
import * as caldav from "./caldav.js";
import * as repo from "./repo.js";
import { runAs } from "./authctx.js";
import { decryptSecret } from "./lib/secret.js";
import { httpErr, nowMs } from "./lib/util.js";
import { parseIcs, expandEvents, wallToEpoch, unfoldIcs } from "../shared/icsParse.js";
import { keyToParts, addDaysKey } from "../shared/dateKey.js";

export const SYNC_INTERVAL_MS = Number(process.env.CAL_SYNC_INTERVAL_MS || 15 * 60_000);
const PAST_DAYS = 30;      // Fenster: so weit zurück …
const FUTURE_DAYS = 400;   // … und so weit voraus (ein Studienjahr + Puffer)

const windowOf = (now) => ({ fromMs: now - PAST_DAYS * 86_400_000, toMs: now + FUTURE_DAYS * 86_400_000 });

function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function userTz() {
  return repo.getProfile()?.timezone || null;
}

// ── Konto anlegen (inkl. Erst-Sync) — im Nutzerkontext ──
export async function addAccount({ kind, label, username, password, url }) {
  if (kind === "ics") {
    const icsUrl = String(url || "").trim().replace(/^webcal:\/\//i, "https://");
    if (!/^https?:\/\//i.test(icsUrl)) throw httpErr(400, "Gültige ICS-URL nötig (https:// oder webcal://)");
    const acc = repo.createCalendarAccount({ kind: "ics", label: label || null, baseUrl: icsUrl });
    await syncAccount(acc.id);
    return repo.getCalendarAccount(acc.id);
  }
  // CalDAV (iCloud-Default): Zugang sofort verifizieren — Fehler vor dem Speichern melden.
  const user = String(username || "").trim();
  if (!user || !password) throw httpErr(400, "Apple-ID und App-spezifisches Passwort nötig");
  const baseUrl = String(url || "").trim() || "https://caldav.icloud.com/";
  const { encryptSecret } = await import("./lib/secret.js");
  const home = await caldav.discover(baseUrl, { username: user, password });
  const acc = repo.createCalendarAccount({
    kind: "caldav", label: label || user, username: user,
    secretEnc: encryptSecret(password), baseUrl,
  });
  repo.updateCalendarAccount(acc.id, { homeUrl: home.homeUrl });
  await syncAccount(acc.id);
  return repo.getCalendarAccount(acc.id);
}

// ── Ein Konto synchronisieren — im Nutzerkontext ──
export async function syncAccount(accountId, now = nowMs()) {
  const acc = repo.getCalendarAccount(accountId);
  if (!acc) throw httpErr(404, "Kalender-Konto nicht gefunden");
  try {
    const result = acc.kind === "ics" ? await syncIcs(acc, now) : await syncCaldav(acc, now);
    repo.setCalendarAccountSync(acc.id, { lastSyncAt: now, lastError: null });
    return result;
  } catch (err) {
    repo.setCalendarAccountSync(acc.id, { lastSyncAt: now, lastError: String(err.message || err).slice(0, 300) });
    throw err;
  }
}

async function syncCaldav(acc, now) {
  const password = decryptSecret(acc.secretEnc);
  if (!password) throw httpErr(400, "Hinterlegtes Passwort nicht lesbar — Konto neu verbinden");
  const auth = { username: acc.username, password };

  let homeUrl = acc.homeUrl;
  if (!homeUrl) {
    homeUrl = (await caldav.discover(acc.baseUrl || "https://caldav.icloud.com/", auth)).homeUrl;
    repo.updateCalendarAccount(acc.id, { homeUrl });
  }
  const remote = await caldav.listCalendars(homeUrl, auth);
  const collections = repo.upsertCalendarCollections(acc.id, remote);
  const tz = userTz();

  let added = 0, updated = 0, removed = 0;
  for (const col of collections.filter((c) => c.enabled)) {
    const r = remote.find((x) => x.url === col.url);
    if (!r) continue;
    // ctag unverändert + Token vorhanden → Kalender ist aktuell (ein PROPFIND, fertig).
    if (col.ctag && r.ctag && col.ctag === r.ctag && col.syncToken) continue;
    const stats = col.syncToken
      ? await deltaSync(col, auth, tz, now)
      : await fullSync(col, auth, tz, now);
    added += stats.added; updated += stats.updated; removed += stats.removed;
    repo.setCollectionSyncState(col.id, { ctag: r.ctag ?? null, syncToken: stats.newToken });
  }
  repo.pruneCalendarEvents(now - (PAST_DAYS + 15) * 86_400_000);
  return { calendars: collections.length, added, updated, removed };
}

async function deltaSync(col, auth, tz, now) {
  const res = await caldav.syncCollection(col.url, auth, col.syncToken);
  if (res.invalidToken) return fullSync(col, auth, tz, now);   // Token abgelaufen → Fenster neu ziehen
  const removed = res.removed.length ? repo.deleteCalendarEventsByHrefs(col.id, res.removed) : 0;
  const objs = res.changed.length ? await caldav.multiget(col.url, auth, res.changed.map((c) => c.href)) : [];
  const { added, updated } = storeObjects(col, objs, tz, now);
  return { added, updated, removed, newToken: res.newToken ?? col.syncToken };
}

async function fullSync(col, auth, tz, now) {
  const { fromMs, toMs } = windowOf(now);
  const objs = await caldav.queryTimeRange(col.url, auth, utcStamp(fromMs), utcStamp(toMs));
  repo.clearCalendarEvents(col.id);
  const { added } = storeObjects(col, objs, tz, now);
  const newToken = await caldav.getSyncToken(col.url, auth);   // Basis für künftige Deltas
  return { added, updated: 0, removed: 0, newToken };
}

// Geparste VEVENTs eines Objekts speichern — Fensterfilter für Einzeltermine,
// Serien-Master/Overrides bleiben immer (Expansion braucht sie).
function storeObjects(col, objs, tz, now) {
  const { fromMs, toMs } = windowOf(now);
  let added = 0, updated = 0;
  for (const o of objs) {
    const events = parseIcs(o.ics, { defaultTz: tz });
    const keep = events.filter((ev) => ev.rrule || ev.recurrenceIdMs != null || (ev.endMs > fromMs && ev.startMs < toMs));
    const r = repo.replaceCalendarEventsForHref(col.id, o.href, o.etag, keep, now);
    if (r.existed) updated++; else if (keep.length) added++;
  }
  return { added, updated };
}

// ── ICS-Abo (z. B. private Google-/Uni-Kalender-URL) ──
async function syncIcs(acc, now) {
  const res = await fetch(acc.baseUrl, { signal: AbortSignal.timeout(25_000), redirect: "follow" });
  if (!res.ok) throw httpErr(502, `ICS-Abruf fehlgeschlagen (HTTP ${res.status})`);
  const text = await res.text();
  const tz = userTz();
  const name = /X-WR-CALNAME:(.+)/.exec(unfoldIcs(text))?.[1]?.trim() || acc.label || "ICS-Kalender";
  const [col] = repo.upsertCalendarCollections(acc.id, [{ url: acc.baseUrl, name, color: null, ctag: null, syncToken: null }]);
  if (!col.enabled) return { calendars: 1, added: 0, updated: 0, removed: 0 };

  const { fromMs, toMs } = windowOf(now);
  const events = parseIcs(text, { defaultTz: tz })
    .filter((ev) => ev.rrule || ev.recurrenceIdMs != null || (ev.endMs > fromMs && ev.startMs < toMs));
  repo.clearCalendarEvents(col.id);
  // Ein synthetischer href je UID (Master + Overrides teilen ihn wie bei CalDAV).
  const byHref = new Map();
  events.forEach((ev, i) => {
    const href = `ics:${ev.uid || `#${i}`}`;
    if (!byHref.has(href)) byHref.set(href, []);
    byHref.get(href).push(ev);
  });
  let added = 0;
  for (const [href, list] of byHref) {
    repo.replaceCalendarEventsForHref(col.id, href, null, list, now);
    added++;
  }
  repo.pruneCalendarEvents(now - (PAST_DAYS + 15) * 86_400_000);
  return { calendars: 1, added, updated: 0, removed: 0 };
}

// ── Periodische Schleife (index.js) — alle Nutzer, sequenziell & fehlertolerant ──
let syncing = false;
export async function syncDueAccounts(now = nowMs()) {
  if (syncing) return;                                          // Überlappung vermeiden
  syncing = true;
  try {
    for (const due of repo.dueCalendarAccounts(now - SYNC_INTERVAL_MS)) {
      await runAs(due.userId, () => syncAccount(due.id, now)).catch((err) => {
        console.warn(`[Kairos] Kalender-Sync (Konto ${due.id}): ${err.message}`);
      });
    }
  } finally {
    syncing = false;
  }
}

// ── Lesen: expandierte Termine eines Tages (Nutzer-Zeitzone) ──
// → [{ summary, location, calendar, allDay, startMin, durationMin }] — sortiert.
//   calendar = { id, name, color, account } | null (Herkunft des Termins)
export function eventsForDay(dayKey, tz = userTz()) {
  const p = keyToParts(dayKey);
  if (!p) return [];
  const dayStart = wallToEpoch({ ...p, h: 0, mi: 0, s: 0 }, tz);
  const p2 = keyToParts(addDaysKey(dayKey, 1));
  const dayEnd = wallToEpoch({ ...p2, h: 0, mi: 0, s: 0 }, tz);
  const rows = repo.calendarEventRows(dayStart, dayEnd);
  return expandEvents(rows, { fromMs: dayStart, toMs: dayEnd }).map((i) => ({
    summary: i.summary || "Event",
    location: i.location ?? null,
    // Herkunft: aus welchem Kalender kommt der Termin (Name + Quellfarbe + Konto)?
    calendar: i.calendar ?? null,
    allDay: i.allDay,
    startMin: Math.max(0, Math.round((Math.max(i.startMs, dayStart) - dayStart) / 60000)),
    durationMin: Math.max(5, Math.round((Math.min(i.endMs, dayEnd) - Math.max(i.startMs, dayStart)) / 60000)),
  }));
}
