// API- und Engine-Tests für Wave 5: Schwierigkeit/Deps/Auto-Plan/Kalender-Lese-
// pfad/Erinnerungen. Muster wie tests/health.test.js (handleApi + Session-Cookie).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

const DB_FILE = join(tmpdir(), `lernuhr-wave5-${randomUUID()}.db`);
process.env.LERNUHR_DB = DB_FILE;

const routes = await import("../server/routes.js");
const repo = await import("../server/repo.js");
const auth = await import("../server/auth.js");
const calsync = await import("../server/calsync.js");
const reminders = await import("../server/reminders.js");
const { setDefaultUserId } = await import("../server/authctx.js");
const { dayKey } = await import("../server/lib/util.js");
const { addDaysKey } = await import("../shared/dateKey.js");
const { wallToEpoch } = await import("../shared/icsParse.js");

const __testUser = auth.findOrCreateUser("wave5@example.com");
repo.ensureUser(__testUser.id);
setDefaultUserId(__testUser.id);
const __session = auth.createSession(__testUser.id);
const __cookie = `${auth.COOKIE_NAME}=${__session.id}`;

function mkReq(method, url, body) {
  const req = Readable.from(body != null ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = url;
  req.headers = { cookie: __cookie, host: "localhost" };
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}
const call = (method, url, body) => routes.handleApi(mkReq(method, url, body), url.split("?")[0]);

after(() => {
  for (const s of ["", "-wal", "-shm", "-journal"]) {
    try { rmSync(DB_FILE + s, { force: true }); } catch { /* egal */ }
  }
});

// ── Schwierigkeit / Thema am Task ────────────────
test("Task mit Schwierigkeit + Thema anlegen; Snapshot trägt neue Felder", async () => {
  const topic = repo.createTopic({ text: "Kellerautomaten" });
  const res = await call("POST", "/api/tasks", { text: "PDA Übungsblatt", difficulty: 3, topicId: topic.id });
  assert.equal(res.status, 200);
  const t = res.body.tasks.find((x) => x.text === "PDA Übungsblatt");
  assert.equal(t.difficulty, 3);
  assert.equal(t.topicId, topic.id);
  assert.deepEqual(t.dependsOn, []);
  assert.ok(res.body.pace);                                     // Pace-Statistik im Snapshot
  assert.ok(Array.isArray(res.body.calendarToday));             // Kalender-Feld vorhanden
});

// ── Abhängigkeiten ───────────────────────────────
test("Deps: anlegen, Zyklus abgelehnt, entfernen", async () => {
  const a = repo.createTask({ text: "Grundlagen NFA" });
  const b = repo.createTask({ text: "Vertiefung PDA" });
  let res = await call("POST", `/api/tasks/${b.id}/deps`, { dependsOnId: a.id });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.tasks.find((t) => t.id === b.id).dependsOn, [a.id]);

  await assert.rejects(() => call("POST", `/api/tasks/${a.id}/deps`, { dependsOnId: b.id }), /Zirkul/);
  await assert.rejects(() => call("POST", `/api/tasks/${a.id}/deps`, { dependsOnId: a.id }), /selbst/);

  res = await call("DELETE", `/api/tasks/${b.id}/deps/${a.id}`);
  assert.deepEqual(res.body.tasks.find((t) => t.id === b.id).dependsOn, []);
});

// ── Ressourcen-Bericht (notes) ───────────────────
test("Resource mit durchsuchbarem Bericht (notes)", async () => {
  const topic = repo.createTopic({ text: "Turingmaschinen" });
  let res = await call("POST", "/api/resources", {
    topicId: topic.id, url: "https://notebooklm.google.com/x",
    title: "TM Video-Overview", kind: "notebooklm",
    notes: "Zusammenfassung: Band, Kopf, Übergangsfunktion, Halteproblem",
  });
  const r = res.body.resources.find((x) => x.title === "TM Video-Overview");
  assert.match(r.notes, /Halteproblem/);
  res = await call("PUT", `/api/resources/${r.id}`, { notes: "Neu" });
  assert.equal(res.body.resources.find((x) => x.id === r.id).notes, "Neu");
});

// ── Erinnerungs-Einstellungen ────────────────────
test("Settings: remindTasks/remindLeadMin persistieren (geklemmt)", async () => {
  let res = await call("PUT", "/api/settings", { remindLeadMin: 500, remindTasks: false });
  assert.equal(res.body.settings.remindLeadMin, 120);           // Klemme bei 120
  assert.equal(res.body.settings.remindTasks, false);
  res = await call("PUT", "/api/settings", { remindLeadMin: 15, remindTasks: true });
  assert.equal(res.body.settings.remindLeadMin, 15);
  assert.equal(res.body.settings.remindTasks, true);
});

// ── Auto-Tagesplan ───────────────────────────────
test("POST /api/plan/day: Prio-Reihenfolge, feste Blöcke bleiben, Deps ordnen, auto-Zeiten gesetzt", async () => {
  const tomorrow = addDaysKey(dayKey(new Date()), 1);
  const fix = repo.createTask({ text: "P Fix", plannedDate: tomorrow, scheduledMin: 8 * 60, estMinutes: 30 }); // user-fixiert 08:00
  const base = repo.createTask({ text: "P Grundlage", plannedDate: tomorrow, priority: 3, estMinutes: 30 });
  const deep = repo.createTask({ text: "P Vertiefung", plannedDate: tomorrow, priority: 1, estMinutes: 30 });
  repo.addTaskDep(deep.id, base.id);

  const res = await call("POST", "/api/plan/day", { date: tomorrow });
  assert.equal(res.status, 200);
  const plan = res.body.plan;
  assert.equal(plan.date, tomorrow);
  assert.deepEqual(plan.kept, [fix.id]);
  const at = (id) => plan.placements.find((p) => p.id === id)?.startMin;
  assert.equal(at(base.id), 6 * 60);                            // 06:00 — Grundlage zuerst (Dep)
  assert.equal(at(deep.id), 6 * 60 + 40);                       // nach Grundlage + Puffer
  const tasks = res.body.tasks;
  assert.equal(tasks.find((t) => t.id === base.id).schedSource, "auto");
  assert.equal(tasks.find((t) => t.id === fix.id).schedSource, "user");
  assert.equal(tasks.find((t) => t.id === fix.id).scheduledMin, 8 * 60);
  // aufräumen, damit spätere Tests unbeeinflusst bleiben
  for (const t of [fix, base, deep]) repo.deleteTask(t.id);
});

test("POST /api/plan/day (heute): plant auch Liegengebliebenes und Undatiertes ein", async () => {
  const today = dayKey(new Date());
  const yesterday = addDaysKey(today, -1);
  const nextWeek = addDaysKey(today, 7);

  const carried = repo.createTask({ text: "P mitgeschleppt", plannedDate: yesterday, estMinutes: 20 });
  const undated = repo.createTask({ text: "P undatiert", estMinutes: 20 });
  const future = repo.createTask({ text: "P nächste Woche", plannedDate: nextWeek, estMinutes: 20 });

  const res = await call("POST", "/api/plan/day", {});
  assert.equal(res.status, 200);
  const plan = res.body.plan;
  // Geprüft wird die AUSWAHL, nicht der konkrete Slot: ob am Ende Platz ist,
  // hängt von der Uhrzeit und der Tageskapazität ab (läuft der Test spät am
  // Abend, landen Aufgaben ehrlich in overflow statt irgendwo). „Berücksichtigt"
  // heißt: taucht in irgendeiner der Ergebnislisten auf.
  const considered = new Set([
    ...plan.placements.map((p) => p.id),
    ...plan.overCapacity, ...plan.overflow, ...plan.blocked.map((x) => x.id), ...plan.kept,
  ]);
  assert.ok(considered.has(carried.id), "gestern geplante Aufgabe zählt zu heute");
  assert.ok(considered.has(undated.id), "undatierte Aufgabe zählt zu heute");
  assert.ok(!considered.has(future.id), "künftig geplante Aufgabe bleibt unberührt");

  // Wer heute eine Uhrzeit BEKOMMT, ist auch auf heute datiert — sonst bliebe
  // die Aufgabe für immer als „seit N Tagen offen" markiert. Umdatiert wird
  // aber nur, was auch platziert wurde: ist der Tag voll, landet die Aufgabe
  // ehrlich in overflow und behält ihr altes Datum.
  const tasks = res.body.tasks;
  const placedIds = new Set(plan.placements.map((p) => p.id));
  if (placedIds.has(carried.id)) {
    assert.equal(tasks.find((t) => t.id === carried.id).plannedDate, today);
  }
  assert.equal(tasks.find((t) => t.id === future.id).plannedDate, nextWeek,
    "unberührt — und zwar unabhängig davon, ob heute noch Platz war");

  for (const t of [carried, undated, future]) repo.deleteTask(t.id);
});

test("POST /api/plan/day (künftiges Datum): Auswahl bleibt strikt auf dieses Datum", async () => {
  const today = dayKey(new Date());
  const target = addDaysKey(today, 3);
  const onTarget = repo.createTask({ text: "P Zieltag", plannedDate: target, estMinutes: 20 });
  const undated = repo.createTask({ text: "P undatiert 2", estMinutes: 20 });

  const res = await call("POST", "/api/plan/day", { date: target });
  const placed = new Set(res.body.plan.placements.map((p) => p.id));
  assert.ok(placed.has(onTarget.id));
  assert.ok(!placed.has(undated.id), "undatierte Aufgaben wandern nicht in einen künftigen Tag");

  for (const t of [onTarget, undated]) repo.deleteTask(t.id);
});

// ── Kalender: Lesepfad ohne Netz (Repo → Expansion → API) ──
test("Kalender: gespeicherte Events (einzeln + Serie) erscheinen expandiert im Tages-Lesepfad", async () => {
  const acc = repo.createCalendarAccount({ kind: "ics", label: "Test", baseUrl: "https://example.test/cal.ics" });
  const [col] = repo.upsertCalendarCollections(acc.id, [{ url: "https://example.test/cal.ics", name: "Uni", color: null, ctag: null, syncToken: null }]);

  const today = dayKey(new Date());
  const [y, mo, d] = today.split("-").map(Number);
  const single = {
    uid: "s@x", summary: "Zahnarzt", allDay: false,
    startMs: wallToEpoch({ y, mo, d, h: 10, mi: 0 }, null),
    endMs: wallToEpoch({ y, mo, d, h: 11, mi: 0 }, null),
    durationMin: 60, tzid: null, rrule: null, exdates: [], recurrenceIdMs: null, status: null,
  };
  const weeklyStart = addDaysKey(today, -14);                    // Serie startete vor 2 Wochen, gleicher Wochentag
  const [wy, wmo, wd] = weeklyStart.split("-").map(Number);
  const series = {
    uid: "w@x", summary: "Vorlesung", allDay: false,
    startMs: wallToEpoch({ y: wy, mo: wmo, d: wd, h: 14, mi: 0 }, null),
    endMs: wallToEpoch({ y: wy, mo: wmo, d: wd, h: 15, mi: 30 }, null),
    durationMin: 90, tzid: null, rrule: "FREQ=WEEKLY", exdates: [], recurrenceIdMs: null, status: null,
  };
  repo.replaceCalendarEventsForHref(col.id, "ics:test", null, [single, series]);

  const blocks = calsync.eventsForDay(today, null);
  const zahnarzt = blocks.find((b) => b.summary === "Zahnarzt");
  const vorlesung = blocks.find((b) => b.summary === "Vorlesung");
  assert.deepEqual({ s: zahnarzt.startMin, d: zahnarzt.durationMin }, { s: 600, d: 60 });
  assert.deepEqual({ s: vorlesung.startMin, d: vorlesung.durationMin }, { s: 840, d: 90 });

  const api = await call("GET", `/api/calendar/day?date=${today}`);
  assert.equal(api.body.events.length, 2);

  // Konto-Übersicht: kein Secret nach außen, Event-Zähler stimmt
  const accs = await call("GET", "/api/calendar/accounts");
  const view = accs.body.accounts.find((a) => a.id === acc.id);
  assert.equal(view.eventCount, 2);
  assert.equal(view.secretEnc, undefined);
  assert.equal(view.calendars.length, 1);

  // Kalender deaktivieren → verschwindet aus dem Lesepfad
  await call("PUT", `/api/calendar/collections/${view.calendars[0].id}`, { enabled: false });
  assert.equal(calsync.eventsForDay(today, null).length, 0);
  await call("PUT", `/api/calendar/collections/${view.calendars[0].id}`, { enabled: true });
  repo.deleteCalendarAccount(acc.id);
});

// Herkunft: der Zeitstrahl muss zeigen, AUS WELCHEM Kalender ein Termin stammt.
// Die Kette ist repo.calendarEventRows (JOIN) → icsParse.expandEvents (instanceOf
// reicht `calendar` durch) → calsync.eventsForDay — jedes Glied kann sie verlieren.
test("Kalender: Herkunft (Name, Quellfarbe, Konto) überlebt die Serien-Expansion", async () => {
  const acc = repo.createCalendarAccount({ kind: "ics", label: "iCloud privat", baseUrl: "https://example.test/src.ics" });
  const [col] = repo.upsertCalendarCollections(acc.id, [
    { url: "https://example.test/src.ics", name: "Vorlesungen", color: "#7C9AC2", ctag: null, syncToken: null },
  ]);

  const today = dayKey(new Date());
  const weeklyStart = addDaysKey(today, -7);                     // Serie → Instanz von heute ist EXPANDIERT
  const [wy, wmo, wd] = weeklyStart.split("-").map(Number);
  repo.replaceCalendarEventsForHref(col.id, "ics:src", null, [{
    uid: "src@x", summary: "Analysis II", allDay: false,
    startMs: wallToEpoch({ y: wy, mo: wmo, d: wd, h: 9, mi: 0 }, null),
    endMs: wallToEpoch({ y: wy, mo: wmo, d: wd, h: 10, mi: 30 }, null),
    durationMin: 90, tzid: null, rrule: "FREQ=WEEKLY", exdates: [], recurrenceIdMs: null, status: null,
  }]);

  const block = calsync.eventsForDay(today, null).find((b) => b.summary === "Analysis II");
  assert.ok(block, "expandierte Serien-Instanz vorhanden");
  assert.equal(block.calendar.name, "Vorlesungen");
  assert.equal(block.calendar.color, "#7C9AC2");
  assert.equal(block.calendar.account, "iCloud privat");

  // Auch über die API (die der Client liest).
  const api = await call("GET", `/api/calendar/day?date=${today}`);
  assert.equal(api.body.events[0].calendar.name, "Vorlesungen");

  repo.deleteCalendarAccount(acc.id);
});

// ── Erinnerungs-Stufen (ohne echten Versand: Endpunkt unerreichbar) ──
test("Erinnerungen: Vorlauf → Start, Dedup, Umplanen setzt Stufen zurück", () => {
  repo.saveSubscription({ endpoint: "https://127.0.0.1:9/push-test", p256dh: "AA", auth: "BB" });
  const today = dayKey(new Date());
  const [y, mo, d] = today.split("-").map(Number);
  const at = (h, mi) => new Date(y, mo - 1, d, h, mi).getTime();
  const t = repo.createTask({ text: "Erinnerung", plannedDate: today, scheduledMin: 600 });   // 10:00

  reminders.checkTaskReminders(at(9, 40));                       // vor dem Vorlauf (15 min Lead aus Settings-Test)
  assert.equal(repo.getTask(t.id).remindStage, 0);

  reminders.checkTaskReminders(at(9, 50));                       // im Vorlauf-Fenster
  assert.equal(repo.getTask(t.id).remindStage, 1);
  reminders.checkTaskReminders(at(9, 51));                       // Dedup: bleibt 1
  assert.equal(repo.getTask(t.id).remindStage, 1);

  reminders.checkTaskReminders(at(10, 2));                       // Startfenster
  assert.equal(repo.getTask(t.id).remindStage, 2);

  repo.updateTask(t.id, { scheduledMin: 720 });                  // umgeplant auf 12:00
  reminders.checkTaskReminders(at(11, 50));                      // neuer Slot → Vorlauf zählt frisch
  const after1 = repo.getTask(t.id);
  assert.equal(after1.remindStage, 1);
  assert.equal(after1.remindFor, `${today}:720`);

  repo.deleteTask(t.id);
  repo.deleteSubscription("https://127.0.0.1:9/push-test");
});

// ── Lernoptionen (shared, aus Store-Daten) ───────
test("findLearnOptions: Thema + Ressource gefunden, Einschätzung + Methoden-Vorschläge", async () => {
  const { findLearnOptions } = await import("../shared/learnOptions.js");
  const exam = repo.createExam({ name: "TI Endterm", date: Date.now() + 10 * 86_400_000 });
  const topic = repo.createTopic({ text: "Keller-Automaten (PDA)", examId: exam.id });
  repo.createResource({ topicId: topic.id, url: "https://nblm/x", title: "PDA Overview", kind: "notebooklm" });

  const out = findLearnOptions({
    // "pda" im Query lässt das spezifischere Thema gewinnen (ein weiteres
    // "Kellerautomaten"-Topic existiert aus einem früheren Test).
    query: "keller automaten pda",
    topics: repo.listTopics(), resources: repo.listResources(),
    notes: repo.listNotes(), exams: repo.listExams(), now: Date.now(),
  });
  assert.equal(out.topics[0].text, "Keller-Automaten (PDA)");
  assert.equal(out.topics[0].examName, "TI Endterm");
  assert.equal(out.topics[0].resources.length, 1);
  assert.equal(out.assessment.verdict, "learn");                 // confidence 0 + Prüfung nah
  assert.ok(out.assessment.reasons.includes("exam_soon"));
  assert.ok(out.suggestions.length >= 1);
  assert.ok(!out.suggestions.find((s) => s.id === "notebooklm" && !s.exists)); // vorhandene Art markiert
});

// ── Lernziel → Themen & Ablauf ───────────────────
// Ohne KI-Einwilligung/Anbieter MUSS der Weg trotzdem funktionieren: die
// Gliederungs-Erkennung liest die Struktur des eingefügten Textes.
test("POST /api/plan/topics: schlägt ohne KI aus eingefügtem Text vor — und schreibt nichts", async () => {
  const topicsBefore = repo.listTopics().length;
  const res = await call("POST", "/api/plan/topics", {
    goal: "Theoretische Informatik lernen",
    material: "## Endliche Automaten\n## Kellerautomaten\n## Turingmaschinen",
    taskTypes: "Beweise, Automaten konstruieren",
    useAi: false,
    lang: "de",
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.source, "outline");
  assert.equal(res.body.structure, "heading");
  assert.deepEqual(res.body.topics.map((t) => t.text),
    ["Endliche Automaten", "Kellerautomaten", "Turingmaschinen"]);
  assert.deepEqual(res.body.taskTypes, ["Beweise", "Automaten konstruieren"]);
  // Ehrlich: ohne KI keine erfundene Dauer.
  assert.equal(res.body.topics[0].estMinutes, null);
  // Ein Vorschlag ist noch keine Tatsache — es darf nichts angelegt worden sein.
  assert.equal(repo.listTopics().length, topicsBefore, "Vorschlag persistiert nichts");
});

test("POST /api/plan/topics: ohne Ziel und ohne Material → 400 statt leerem Vorschlag", async () => {
  // handleApi wirft; erst server/index.js macht daraus eine HTTP-Antwort.
  await assert.rejects(() => call("POST", "/api/plan/topics", { useAi: false }),
    (err) => err.status === 400);
});

test("POST /api/plan/topics/apply: legt Prüfung, Themen, Aufgaben, Abhängigkeiten und Quell-Notiz an", async () => {
  const res = await call("POST", "/api/plan/topics/apply", {
    examName: "TheoInf Klausur",
    examDate: "2026-09-03",
    subject: "TheoInf",
    material: "## Automaten\n## Grammatiken",
    taskTypes: "Beweise",
    topics: [
      { text: "Endliche Automaten", estMinutes: 60, difficulty: 2, dependsOn: [] },
      { text: "Kellerautomaten", estMinutes: 90, difficulty: 3, dependsOn: [0] },
    ],
    lang: "de",
  });
  assert.equal(res.status, 200);
  const { examId, topics: nTopics, tasks: nTasks } = res.body.applied;
  assert.equal(nTopics, 2);
  assert.equal(nTasks, 2);

  const exam = repo.getExam(examId);
  assert.equal(exam.name, "TheoInf Klausur");

  // Themen in der Vorschlagsreihenfolge.
  const mine = repo.listTopics().filter((t) => t.examId === examId).sort((a, b) => a.sortOrder - b.sortOrder);
  assert.deepEqual(mine.map((t) => t.text), ["Endliche Automaten", "Kellerautomaten"]);

  // Aufgaben tragen Dauer/Schwierigkeit/Fach und hängen am Thema.
  const tasks = repo.listTasks().filter((t) => t.examId === examId).sort((a, b) => a.id - b.id);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].estMinutes, 60);
  assert.equal(tasks[1].difficulty, 3);
  assert.equal(tasks[0].subject, "TheoInf");
  assert.ok(tasks[0].topicId != null, "Aufgabe ist mit dem Thema verknüpft");
  // Grundlage vor Vertiefung: Kellerautomaten wartet auf Endliche Automaten.
  assert.deepEqual(tasks[1].dependsOn, [tasks[0].id]);

  // Die Quelle bleibt nachlesbar.
  const note = repo.listNotes().find((n) => n.examId === examId);
  assert.ok(note, "Quell-Notiz angelegt");
  assert.match(note.text, /Automaten/);
  assert.match(note.text, /Beweise/);

  repo.deleteExam(examId);
});

test("POST /api/plan/topics/apply: Vorwärts-Abhängigkeiten werden verworfen (kein Zyklus)", async () => {
  const res = await call("POST", "/api/plan/topics/apply", {
    examName: "Zyklus-Test",
    topics: [
      { text: "A", dependsOn: [1] },   // zeigt nach VORNE → muss ignoriert werden
      { text: "B", dependsOn: [0] },
    ],
    lang: "de",
  });
  const examId = res.body.applied.examId;
  const tasks = repo.listTasks().filter((t) => t.examId === examId).sort((a, b) => a.id - b.id);
  assert.deepEqual(tasks[0].dependsOn, [], "Vorwärts-Kante verworfen");
  assert.deepEqual(tasks[1].dependsOn, [tasks[0].id]);
  repo.deleteExam(examId);
});

test("POST /api/plan/topics/apply: createTasks=false legt nur Themen an", async () => {
  const res = await call("POST", "/api/plan/topics/apply", {
    examName: "Nur Themen", createTasks: false,
    topics: [{ text: "Alpha" }, { text: "Beta" }], lang: "de",
  });
  assert.equal(res.body.applied.topics, 2);
  assert.equal(res.body.applied.tasks, 0);
  const examId = res.body.applied.examId;
  assert.equal(repo.listTasks().filter((t) => t.examId === examId).length, 0);
  repo.deleteExam(examId);
});
