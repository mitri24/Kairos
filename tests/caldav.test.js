// Fixture-Tests für den CalDAV-XML-Leser (server/caldav.js) — reale
// Antwortformen von iCloud/DAV-Servern, ohne Netzwerk.
import test from "node:test";
import assert from "node:assert/strict";

import { xmlFindAll, xmlUnescape, parseMultistatus, extractRootSyncToken, xmlEscape } from "../server/caldav.js";

test("xmlFindAll: Präfixe egal, selbstschließend → leer", () => {
  const xml = `<d:a><x>1</x></d:a><D:x>2</D:x><x/><ns2:x attr="y">3</ns2:x>`;
  assert.deepEqual(xmlFindAll(xml, "x"), ["1", "2", "", "3"]);
});

test("xmlUnescape: Entities inkl. numerisch", () => {
  assert.equal(xmlUnescape("a&amp;b &lt;c&gt; &quot;d&quot; &#13;&#10; &#x41;"), 'a&b <c> "d" \r\n A');
});

test("xmlEscape ↔ xmlUnescape Roundtrip", () => {
  const s = `<a href="x">&'täst'</a>`;
  assert.equal(xmlUnescape(xmlEscape(s)), s);
});

const DISCOVERY_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:">
 <response>
  <href>/</href>
  <propstat>
   <prop>
    <current-user-principal><href>/123456789/principal/</href></current-user-principal>
   </prop>
   <status>HTTP/1.1 200 OK</status>
  </propstat>
 </response>
</multistatus>`;

test("parseMultistatus: current-user-principal (iCloud-Form)", () => {
  const [r] = parseMultistatus(DISCOVERY_FIXTURE);
  assert.equal(r.href, "/");
  assert.equal(r.props.principalHref, "/123456789/principal/");
});

const CALENDARS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/">
 <D:response>
  <D:href>/123456789/calendars/</D:href>
  <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop>
   <D:status>HTTP/1.1 200 OK</D:status></D:propstat>
 </D:response>
 <D:response>
  <D:href>/123456789/calendars/home/</D:href>
  <D:propstat><D:prop>
    <D:displayname>Uni &amp; Arbeit</D:displayname>
    <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
    <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>
    <CS:getctag>ct-42</CS:getctag>
    <D:sync-token>https://token/1</D:sync-token>
   </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
 </D:response>
 <D:response>
  <D:href>/123456789/calendars/tasks/</D:href>
  <D:propstat><D:prop>
    <D:displayname>Erinnerungen</D:displayname>
    <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
    <C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>
   </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
 </D:response>
</D:multistatus>`;

test("parseMultistatus: Kalenderliste — Typ, Name, ctag, sync-token, VEVENT-Fähigkeit", () => {
  const rows = parseMultistatus(CALENDARS_FIXTURE);
  assert.equal(rows.length, 3);
  const home = rows.find((r) => r.href.endsWith("/home/"));
  assert.equal(home.props.displayname, "Uni & Arbeit");
  assert.equal(home.props.isCalendar, true);
  assert.equal(home.props.supportsVevent, true);
  assert.equal(home.props.ctag, "ct-42");
  assert.equal(home.props.syncToken, "https://token/1");
  const root = rows.find((r) => r.href === "/123456789/calendars/");
  assert.equal(root.props.isCalendar, false);           // Home selbst ist kein Kalender
  const tasks = rows.find((r) => r.href.endsWith("/tasks/"));
  assert.equal(tasks.props.supportsVevent, false);      // reine VTODO-Liste → wird gefiltert
});

const SYNC_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:">
 <D:response>
  <D:href>/cal/ev1.ics</D:href>
  <D:propstat><D:prop><D:getetag>"e1"</D:getetag></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
 </D:response>
 <D:response>
  <D:href>/cal/gone.ics</D:href>
  <D:status>HTTP/1.1 404 Not Found</D:status>
 </D:response>
 <D:sync-token>https://token/2</D:sync-token>
</D:multistatus>`;

test("parseMultistatus + extractRootSyncToken: Delta-Antwort (geändert/gelöscht/Token)", () => {
  const rows = parseMultistatus(SYNC_FIXTURE);
  const changed = rows.filter((r) => r.status !== 404);
  const removed = rows.filter((r) => r.status === 404);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].props.etag, '"e1"');
  assert.deepEqual(removed.map((r) => r.href), ["/cal/gone.ics"]);
  assert.equal(extractRootSyncToken(SYNC_FIXTURE), "https://token/2");
});

const MULTIGET_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
 <D:response>
  <D:href>/cal/ev1.ics</D:href>
  <D:propstat><D:prop>
   <D:getetag>"e1"</D:getetag>
   <C:calendar-data>BEGIN:VCALENDAR&#13;
BEGIN:VEVENT&#13;
UID:x@y&#13;
SUMMARY:K&#252;che &amp; Bad&#13;
DTSTART:20260801T080000Z&#13;
END:VEVENT&#13;
END:VCALENDAR&#13;
</C:calendar-data>
  </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
 </D:response>
</D:multistatus>`;

test("parseMultistatus: calendar-data wird entescaped (inkl. &#13; und Umlaut-Entities)", () => {
  const [r] = parseMultistatus(MULTIGET_FIXTURE);
  assert.ok(r.props.calendarData.includes("SUMMARY:Küche & Bad"));
  assert.ok(r.props.calendarData.includes("BEGIN:VEVENT"));
  assert.equal(r.props.etag, '"e1"');
});
