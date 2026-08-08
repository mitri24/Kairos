// Zero-dependency CalDAV-Client (RFC 4791/6578) — genug für iCloud & Co.:
// Principal-Discovery, Kalenderliste, Delta-Sync per sync-collection und
// Objektabruf per calendar-multiget / calendar-query (Zeitfenster).
//
// XML wird mit einem bewusst kleinen Namespace-agnostischen Scanner gelesen
// (kontrolliertes DAV-Vokabular, keine verschachtelten gleichnamigen Tags in
// den Antworten, die wir auswerten). Fixtures-getestet in tests/caldav.test.js.
import { httpErr } from "./lib/util.js";

const TIMEOUT_MS = 25_000;

// ── XML-Helfer ───────────────────────────────────
export function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function xmlUnescape(s) {
  return String(s ?? "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

// Alle Inhalte von <prefix:localName …>…</prefix:localName> (bzw. selbstschließend → "").
export function xmlFindAll(xml, localName) {
  const out = [];
  const re = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${localName}(?=[\\s/>])([^>]*)>`, "g");
  let m;
  while ((m = re.exec(xml))) {
    if (m[1].endsWith("/")) { out.push(""); continue; }
    const closeRe = new RegExp(`</(?:[A-Za-z0-9_.-]+:)?${localName}\\s*>`, "g");
    closeRe.lastIndex = re.lastIndex;
    const c = closeRe.exec(xml);
    if (!c) break;
    out.push(xml.slice(re.lastIndex, c.index));
    re.lastIndex = closeRe.lastIndex;
  }
  return out;
}

const firstTag = (xml, name) => xmlFindAll(xml, name)[0];
const textOf = (v) => (v == null ? null : xmlUnescape(v.trim()) || null);

// ── Multistatus-Antwort auswerten ────────────────
// → [{ href, status, props }] — props enthält nur, was da war.
export function parseMultistatus(xml) {
  const out = [];
  for (const resp of xmlFindAll(xml, "response")) {
    const href = textOf(firstTag(resp, "href")) || "";
    const topStatus = statusCode(firstTag(resp, "status"));
    const props = {};
    const propstats = xmlFindAll(resp, "propstat");
    for (const ps of propstats) {
      const st = statusCode(firstTag(ps, "status"));
      if (propstats.length > 1 && st !== 200) continue;
      const prop = firstTag(ps, "prop") ?? "";
      collectProps(prop, props);
    }
    if (!propstats.length) collectProps(resp, props);   // manche Server inline'n props
    out.push({ href, status: topStatus, props });
  }
  return out;
}

function collectProps(prop, props) {
  const set = (k, v) => { if (v != null) props[k] = v; };
  set("etag", textOf(firstTag(prop, "getetag")));
  set("ctag", textOf(firstTag(prop, "getctag")));
  set("syncToken", textOf(firstTag(prop, "sync-token")));
  set("displayname", textOf(firstTag(prop, "displayname")));
  set("color", textOf(firstTag(prop, "calendar-color")));
  const calData = firstTag(prop, "calendar-data");
  if (calData != null) props.calendarData = xmlUnescape(calData);
  const principal = firstTag(prop, "current-user-principal");
  if (principal != null) set("principalHref", textOf(firstTag(principal, "href")));
  const home = firstTag(prop, "calendar-home-set");
  if (home != null) set("homeHref", textOf(firstTag(home, "href")));
  const rt = firstTag(prop, "resourcetype");
  if (rt != null) props.isCalendar = /<(?:[A-Za-z0-9_.-]+:)?calendar[\s/>]/.test(rt);
  const comps = firstTag(prop, "supported-calendar-component-set");
  if (comps != null) props.supportsVevent = /name="VEVENT"/i.test(comps);
}

function statusCode(statusLine) {
  const m = /\b(\d{3})\b/.exec(statusLine || "");
  return m ? Number(m[1]) : null;
}

// Wurzel-sync-token (nach dem letzten </response>) eines sync-collection-REPORTs.
export function extractRootSyncToken(xml) {
  const lastResponse = xml.lastIndexOf("response>");
  const tail = lastResponse >= 0 ? xml.slice(lastResponse) : xml;
  return textOf(firstTag(tail, "sync-token"));
}

// ── HTTP ─────────────────────────────────────────
async function davRequest(url, { method, auth, body = null, depth = null, timeoutMs = TIMEOUT_MS } = {}) {
  let target = url;
  for (let hop = 0; hop < 4; hop++) {
    const headers = { "Content-Type": "application/xml; charset=utf-8" };
    if (depth != null) headers.Depth = String(depth);
    if (auth) headers.Authorization = "Basic " + Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
    const res = await fetch(target, {
      method, headers, body, redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
    });
    // Redirects manuell folgen (fetch würde Methode/Autorisierung nicht überall erhalten).
    if ([301, 302, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) throw httpErr(502, "Kalender-Server: Redirect ohne Ziel");
      target = new URL(loc, target).href;
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw httpErr(401, "Kalender-Login abgelehnt — Apple-ID/App-spezifisches Passwort prüfen");
    }
    return { status: res.status, text: await res.text(), url: target };
  }
  throw httpErr(502, "Kalender-Server: zu viele Redirects");
}

const abs = (href, baseUrl) => new URL(href, baseUrl).href;

// ── Discovery: Principal → calendar-home-set ─────
export async function discover(baseUrl, auth) {
  const propfindPrincipal =
    '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>';
  const r1 = await davRequest(baseUrl, { method: "PROPFIND", auth, depth: 0, body: propfindPrincipal });
  if (r1.status >= 400) throw httpErr(502, `Kalender-Discovery fehlgeschlagen (HTTP ${r1.status})`);
  const principalHref = parseMultistatus(r1.text).map((r) => r.props.principalHref).find(Boolean);
  if (!principalHref) throw httpErr(502, "Kalender-Discovery: kein Principal gefunden");
  const principalUrl = abs(principalHref, r1.url);

  const propfindHome =
    '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
    "<d:prop><c:calendar-home-set/></d:prop></d:propfind>";
  const r2 = await davRequest(principalUrl, { method: "PROPFIND", auth, depth: 0, body: propfindHome });
  if (r2.status >= 400) throw httpErr(502, `Kalender-Discovery fehlgeschlagen (HTTP ${r2.status})`);
  const homeHref = parseMultistatus(r2.text).map((r) => r.props.homeHref).find(Boolean);
  if (!homeHref) throw httpErr(502, "Kalender-Discovery: kein Kalender-Home gefunden");
  return { principalUrl, homeUrl: abs(homeHref, r2.url) };
}

// ── Kalender einer Home-Collection ───────────────
export async function listCalendars(homeUrl, auth) {
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/">' +
    "<d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><cs:getctag/><d:sync-token/><a:calendar-color/></d:prop>" +
    "</d:propfind>";
  const r = await davRequest(homeUrl, { method: "PROPFIND", auth, depth: 1, body });
  if (r.status >= 400) throw httpErr(502, `Kalenderliste fehlgeschlagen (HTTP ${r.status})`);
  return parseMultistatus(r.text)
    .filter((x) => x.props.isCalendar && x.props.supportsVevent !== false)
    .map((x) => ({
      url: abs(x.href, r.url),
      name: x.props.displayname || decodeURIComponent(x.href.split("/").filter(Boolean).pop() || "Kalender"),
      color: x.props.color || null,
      ctag: x.props.ctag || null,
      syncToken: x.props.syncToken || null,
    }));
}

// Aktuellen sync-token einer Collection holen (nach einem Full-Sync).
export async function getSyncToken(calUrl, auth) {
  const body = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:sync-token/></d:prop></d:propfind>';
  const r = await davRequest(calUrl, { method: "PROPFIND", auth, depth: 0, body });
  if (r.status >= 400) return null;
  return parseMultistatus(r.text).map((x) => x.props.syncToken).find(Boolean) || null;
}

// ── Delta-Sync (RFC 6578) ────────────────────────
// → { changed: [{href, etag}], removed: [href], newToken, invalidToken }
export async function syncCollection(calUrl, auth, syncToken) {
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:sync-collection xmlns:d="DAV:">' +
    `<d:sync-token>${xmlEscape(syncToken || "")}</d:sync-token>` +
    "<d:sync-level>1</d:sync-level>" +
    "<d:prop><d:getetag/></d:prop>" +
    "</d:sync-collection>";
  const r = await davRequest(calUrl, { method: "REPORT", auth, depth: 1, body });
  if (r.status === 507 || (r.status === 403 && /valid-sync-token/i.test(r.text))) {
    return { changed: [], removed: [], newToken: null, invalidToken: true };
  }
  if (r.status >= 400) throw httpErr(502, `Kalender-Sync fehlgeschlagen (HTTP ${r.status})`);
  const changed = [];
  const removed = [];
  for (const resp of parseMultistatus(r.text)) {
    if (!resp.href) continue;
    if (resp.status === 404) removed.push(resp.href);
    else if (!resp.href.endsWith("/")) changed.push({ href: resp.href, etag: resp.props.etag || null });
  }
  return { changed, removed, newToken: extractRootSyncToken(r.text), invalidToken: false };
}

// ── Objekte laden ────────────────────────────────
export async function multiget(calUrl, auth, hrefs) {
  const out = [];
  for (let i = 0; i < hrefs.length; i += 50) {                  // sanfte Batches
    const chunk = hrefs.slice(i, i + 50);
    const body =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
      "<d:prop><d:getetag/><c:calendar-data/></d:prop>" +
      chunk.map((h) => `<d:href>${xmlEscape(h)}</d:href>`).join("") +
      "</c:calendar-multiget>";
    const r = await davRequest(calUrl, { method: "REPORT", auth, depth: 1, body });
    if (r.status >= 400) throw httpErr(502, `Kalender-Abruf fehlgeschlagen (HTTP ${r.status})`);
    for (const resp of parseMultistatus(r.text)) {
      if (resp.props.calendarData) out.push({ href: resp.href, etag: resp.props.etag || null, ics: resp.props.calendarData });
    }
  }
  return out;
}

// Zeitfenster-Abfrage (Initial-Sync, speicherminimal): nur Events im Fenster.
// start/end: "YYYYMMDDTHHMMSSZ".
export async function queryTimeRange(calUrl, auth, startUtc, endUtc) {
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
    "<d:prop><d:getetag/><c:calendar-data/></d:prop>" +
    '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">' +
    `<c:time-range start="${startUtc}" end="${endUtc}"/>` +
    "</c:comp-filter></c:comp-filter></c:filter>" +
    "</c:calendar-query>";
  const r = await davRequest(calUrl, { method: "REPORT", auth, depth: 1, body });
  if (r.status >= 400) throw httpErr(502, `Kalender-Abfrage fehlgeschlagen (HTTP ${r.status})`);
  return parseMultistatus(r.text)
    .filter((resp) => resp.props.calendarData)
    .map((resp) => ({ href: resp.href, etag: resp.props.etag || null, ics: resp.props.calendarData }));
}
