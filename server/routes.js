// REST-API-Routen. Jede Mutation liefert die komplette Momentaufnahme zurück,
// damit Clients (PWA + Extension) ihren State einfach ersetzen können.
import * as timer from "./timer.js";
import * as repo from "./repo.js";
import * as push from "./push.js";
import * as auth from "./auth.js";
import * as calsync from "./calsync.js";
import * as shareMod from "./share.js";
import * as ai from "./ai.js";
import { runAs } from "./authctx.js";
import { gradeReview, nextDueKey } from "../shared/srs.js";
import { readJsonBody, readRawBody, toInt, toNum, str, nowMs, dayKeyTz, localMinutesInTz } from "./lib/util.js";
import { computePace, planMinutes } from "../shared/pace.js";
import { planDay } from "../shared/planner.js";
import { normalizeDaily, normalizeSamples, normalizeSource, SUPPORTED_SOURCES } from "./health/normalize.js";
import { computeHealthContext } from "./health/context.js";
import { DAILY_FIELDS } from "./health/fields.js";
import { normalizeRecurrence } from "../shared/recurrence.js";
import { outlineProposal, parseTaskTypes } from "../shared/outline.js";
import { keyToParts, addDaysKey } from "../shared/dateKey.js";
import { buildCalendar, formatIcsLocal, formatIcsDate, formatIcsUtc } from "../shared/ics.js";

// Route-Tabelle: [METHOD, RegExp, handler(params, body) → responseObj]
const routes = [];
const add = (method, pattern, handler) => routes.push({ method, pattern, handler });

// ── Basis ────────────────────────────────────────
add("GET", /^\/api\/time$/, () => ({ serverTime: nowMs() }));
add("GET", /^\/api\/state$/, () => timer.getSnapshot());
add("GET", /^\/api\/health$/, () => ({ ok: true }));

// ── Web Push ─────────────────────────────────────
add("GET", /^\/api\/push\/public-key$/, () => ({ publicKey: push.getPublicKey() }));
add("POST", /^\/api\/push\/subscribe$/, (_p, b) => push.subscribe(b));
add("POST", /^\/api\/push\/unsubscribe$/, (_p, b) => push.unsubscribe(str(b.endpoint)));
add("POST", /^\/api\/push\/test$/, () => push.sendTest());

// ── Timer ────────────────────────────────────────
add("POST", /^\/api\/timer\/start$/, () => timer.start());
add("POST", /^\/api\/timer\/pause$/, () => timer.pause());
add("POST", /^\/api\/timer\/resume$/, () => timer.resume());
add("POST", /^\/api\/timer\/skip$/, () => timer.skip());
add("POST", /^\/api\/timer\/reset$/, () => timer.reset());
add("POST", /^\/api\/timer\/phase$/, (_p, b) => timer.selectPhase(str(b.phase)));
add("POST", /^\/api\/timer\/active-task$/, (_p, b) => timer.setActiveTask(toInt(b.taskId, null)));

// ── Settings ─────────────────────────────────────
add("PUT", /^\/api\/settings$/, (_p, b) => {
  const patch = {};
  for (const k of [
    "focusMinutes", "shortBreakMinutes", "longBreakMinutes",
    "cyclesUntilLongBreak", "todayGoalHours",
  ]) if (b[k] !== undefined) patch[k] = toNum(b[k]);
  if (b.autoStartNextPhase !== undefined) patch.autoStartNextPhase = !!b.autoStartNextPhase;
  if (b.profileName !== undefined) patch.profileName = str(b.profileName);
  if (b.activeExamId !== undefined) patch.activeExamId = toInt(b.activeExamId, null);
  // Ruhezeiten / DND (Fenster in Minuten ab Mitternacht, lokal; Umschlag erlaubt).
  if (b.dndEnabled !== undefined) patch.dndEnabled = !!b.dndEnabled;
  if (b.dndStartMin !== undefined) patch.dndStartMin = toInt(b.dndStartMin, null);
  if (b.dndEndMin !== undefined) patch.dndEndMin = toInt(b.dndEndMin, null);
  // Task-Erinnerungen (Push): an/aus + Vorlauf in Minuten.
  if (b.remindTasks !== undefined) patch.remindTasks = !!b.remindTasks;
  if (b.remindLeadMin !== undefined) patch.remindLeadMin = Math.max(0, Math.min(120, toInt(b.remindLeadMin, 10)));
  return timer.setSettings(patch);
});

// ── Exams ────────────────────────────────────────
add("POST", /^\/api\/exams$/, (_p, b) => {
  const color = /^#[0-9a-f]{6}$/i.test(str(b.color)) ? str(b.color).toUpperCase() : null;
  repo.createExam({
    name: str(b.name, "Prüfung"), date: toInt(b.date, null),
    totalHours: toNum(b.totalHours, 0), color,
  });
  return timer.getSnapshot();
});
add("PUT", /^\/api\/exams\/(\d+)$/, (p, b) => {
  const color = b.color === undefined ? undefined : (/^#[0-9a-f]{6}$/i.test(str(b.color)) ? str(b.color).toUpperCase() : null);
  repo.updateExam(Number(p[0]), {
    name: b.name, date: b.date !== undefined ? toInt(b.date, null) : undefined,
    totalHours: b.totalHours !== undefined ? toNum(b.totalHours, 0) : undefined, color,
    archived: b.archived !== undefined ? !!b.archived : undefined,
  });
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/exams\/(\d+)$/, (p) => { repo.deleteExam(Number(p[0])); return timer.getSnapshot(); });

// ── Eigene Sidebar-Ordner ───────────────────────
const NAV_VIEWS = new Set(["today", "week", "exam", "library", "journal", "notes", "health", "insights", "knowledge", "profile"]);
add("POST", /^\/api\/nav-nodes$/, (_p, b) => {
  const name = str(b.name).trim().slice(0, 80);
  const kind = ["folder", "view", "exam"].includes(b.kind) ? b.kind : "folder";
  const view = kind === "view" && NAV_VIEWS.has(str(b.view)) ? str(b.view) : null;
  const examId = kind === "exam" ? toInt(b.examId, null) : null;
  if (!name || (kind === "view" && !view) || (kind === "exam" && examId == null)) throw httpError(400, "Ungültiger Sidebar-Eintrag");
  repo.createNavNode({ parentId: toInt(b.parentId, null), name, kind, view, examId });
  return timer.getSnapshot();
});
add("PUT", /^\/api\/nav-nodes\/(\d+)$/, (p, b) => {
  const patch = {};
  if (b.name !== undefined) { patch.name = str(b.name).trim().slice(0, 80); if (!patch.name) throw httpError(400, "Name fehlt"); }
  if (b.parentId !== undefined) patch.parentId = toInt(b.parentId, null);
  if (b.sortOrder !== undefined) patch.sortOrder = toInt(b.sortOrder, 0);
  if (!repo.updateNavNode(Number(p[0]), patch)) throw httpError(404, "Sidebar-Eintrag nicht gefunden");
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/nav-nodes\/(\d+)$/, (p) => { repo.deleteNavNode(Number(p[0])); return timer.getSnapshot(); });

// ── Tasks ────────────────────────────────────────
add("POST", /^\/api\/tasks$/, (_p, b) => {
  const text = str(b.text).trim();
  if (!text) throw httpError(400, "text fehlt");
  repo.createTask({
    text, examId: toInt(b.examId, null), subject: b.subject ? str(b.subject) : null,
    priority: toInt(b.priority, 2), dueDate: toInt(b.dueDate, null),
    plannedDate: b.plannedDate ? str(b.plannedDate) : null, estMinutes: toInt(b.estMinutes, 25),
    scheduledMin: toInt(b.scheduledMin, null),
    recurrence: b.recurrence !== undefined ? normalizeRecurrence(b.recurrence) : null,
    difficulty: toInt(b.difficulty, 2), topicId: toInt(b.topicId, null),
    room: b.room ? str(b.room).trim().slice(0, 120) : null,
    location: b.location ? str(b.location).trim().slice(0, 300) : null,
    mapsUrl: b.mapsUrl ? str(b.mapsUrl).trim().slice(0, 1000) : null,
  });
  return timer.getSnapshot();
});
add("PUT", /^\/api\/tasks\/(\d+)$/, (p, b) => {
  const patch = {};
  if (b.text !== undefined) patch.text = str(b.text);
  if (b.subject !== undefined) patch.subject = b.subject ? str(b.subject) : null;
  if (b.priority !== undefined) patch.priority = toInt(b.priority, 2);
  if (b.dueDate !== undefined) patch.dueDate = toInt(b.dueDate, null);
  if (b.plannedDate !== undefined) patch.plannedDate = b.plannedDate ? str(b.plannedDate) : null;
  if (b.estMinutes !== undefined) patch.estMinutes = toInt(b.estMinutes, 25);
  if (b.scheduledMin !== undefined) patch.scheduledMin = toInt(b.scheduledMin, null);
  if (b.examId !== undefined) patch.examId = toInt(b.examId, null);
  if (b.done !== undefined) patch.done = !!b.done;
  if (b.sortOrder !== undefined) patch.sortOrder = toInt(b.sortOrder, 0);
  if (b.recurrence !== undefined) patch.recurrence = normalizeRecurrence(b.recurrence);
  if (b.difficulty !== undefined) patch.difficulty = Math.max(1, Math.min(3, toInt(b.difficulty, 2)));
  if (b.topicId !== undefined) patch.topicId = toInt(b.topicId, null);
  if (b.schedSource !== undefined) patch.schedSource = b.schedSource ? str(b.schedSource) : null;
  if (b.room !== undefined) patch.room = b.room ? str(b.room).trim().slice(0, 120) : null;
  if (b.location !== undefined) patch.location = b.location ? str(b.location).trim().slice(0, 300) : null;
  if (b.mapsUrl !== undefined) patch.mapsUrl = b.mapsUrl ? str(b.mapsUrl).trim().slice(0, 1000) : null;
  // Über die Timer-Engine: erledigt-Melden der aktiven Aufgabe entkoppelt sie
  // sauber vom laufenden Fokus (Rest-Zeit gutschreiben, Zeiger räumen) und legt
  // bei Wiederholung die nächste Instanz an.
  return timer.updateTask(Number(p[0]), patch);
});
add("DELETE", /^\/api\/tasks\/(\d+)$/, (p) => { repo.deleteTask(Number(p[0])); return timer.getSnapshot(); });
// Verschieben (Tomorrow / Reschedule / „keine Zeit mehr"): erhöht postpone_count
// UND setzt Datum/Uhrzeit in einem Schritt (ADHS-Signal „aufteilen?").
add("POST", /^\/api\/tasks\/(\d+)\/postpone$/, (p, b) => {
  const id = Number(p[0]);
  repo.incrementPostpone(id);
  const patch = {};
  if (b.plannedDate !== undefined) patch.plannedDate = b.plannedDate ? str(b.plannedDate) : null;
  if (b.scheduledMin !== undefined) patch.scheduledMin = toInt(b.scheduledMin, null);
  if (Object.keys(patch).length) repo.updateTask(id, patch);
  return timer.getSnapshot();
});
add("POST", /^\/api\/tasks\/reorder$/, (_p, b) => {
  if (Array.isArray(b.ids)) repo.reorderTasks(b.ids.map((x) => Number(x)));
  return timer.getSnapshot();
});

// ── Task-Abhängigkeiten (erst Grundlage, dann Vertiefung) ──
add("POST", /^\/api\/tasks\/(\d+)\/deps$/, (p, b) => {
  const depId = toInt(b.dependsOnId, null);
  if (depId == null) throw httpError(400, "dependsOnId fehlt");
  repo.addTaskDep(Number(p[0]), depId);
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/tasks\/(\d+)\/deps\/(\d+)$/, (p) => {
  repo.removeTaskDep(Number(p[0]), Number(p[1]));
  return timer.getSnapshot();
});

// ── Auto-Tagesplan ───────────────────────────────
// Plant offene Aufgaben des Tages: Prio → Deadline → Reihenfolge, respektiert
// Abhängigkeiten, Kalender-Termine, Nutzer-getimte Blöcke und die Readiness-
// Kapazität. Nutzer-Zeiten werden NIE verschoben; 'auto'-Zeiten dürfen wandern.
add("POST", /^\/api\/plan\/day$/, (_p, b) => {
  const now = nowMs();
  const tz = repo.getProfile()?.timezone || null;
  const todayKey = dayKeyTz(new Date(now), tz);
  const date = b.date ? str(b.date) : todayKey;
  const isToday = date === todayKey;

  const all = repo.listTasks();
  const pace = computePace(all);
  // Für HEUTE zählt genau das, was die Today-Ansicht als heutige Arbeit zeigt:
  // auch Liegengebliebenes (plannedDate < heute) und Undatiertes. Vorher war die
  // Auswahl strikt `=== date` — wer im Rückstand war, bekam auf „Plan my day"
  // die Antwort „nichts zu planen", während unter dem Knopf die offenen
  // Aufgaben standen. Für ein ZUKÜNFTIGES Datum bleibt die Auswahl strikt.
  const belongsToDay = (t) => (isToday
    ? (!t.plannedDate || t.plannedDate <= date)
    : t.plannedDate === date);
  const dayTasks = all
    .filter((t) => !t.done && belongsToDay(t))
    .map((t) => ({ ...t, durationMin: planMinutes(pace, t.difficulty, t.estMinutes) }));
  const doneIds = new Set(all.filter((t) => t.done).map((t) => t.id));
  const busy = calsync.eventsForDay(date, tz).filter((e) => !e.allDay);

  // Kapazität: Readiness-skaliertes Tagesziel minus bereits fokussierte Zeit.
  const snap0 = timer.getSnapshot(now);
  // Freiwilliger Tages-Check-in: skaliert nur DIESEN Planungslauf, nicht das
  // dauerhafte Ziel. 0.55..1.2 verhindert sowohl Null-Tage als auch Übermut.
  const checkInMultiplier = Math.max(0.55, Math.min(1.2, toNum(b.capacityMultiplier, 1)));
  const capacityMin = (isToday
    ? Math.max(0, Math.round(snap0.today.effectiveGoalHours * 60 - snap0.today.focusMs / 60000))
    : Math.round(snap0.today.effectiveGoalHours * 60)) * checkInMultiplier;

  const result = planDay({
    tasks: dayTasks, busy, doneIds,
    nowMin: isToday ? localMinutesInTz(now, tz) : null,
    capacityMin,
  });
  for (const pl of result.placements) {
    // Wer eine Uhrzeit für DIESEN Tag bekommt, ist auch auf diesen Tag geplant —
    // sonst bliebe eine mitgeschleppte Aufgabe für immer „seit N Tagen offen".
    repo.updateTask(pl.id, { scheduledMin: pl.startMin, schedSource: "auto", plannedDate: date });
  }
  // Nicht mehr platzierbare 'auto'-Blöcke räumen (keine veralteten Zeiten stehen lassen).
  const unplaced = new Set([...result.overCapacity, ...result.overflow, ...result.blocked.map((x) => x.id)]);
  for (const t of dayTasks) {
    if (unplaced.has(t.id) && t.schedSource === "auto" && t.scheduledMin != null) {
      repo.updateTask(t.id, { scheduledMin: null, schedSource: null });
    }
  }
  return { ...timer.getSnapshot(), plan: { date, ...result } };
});

// ── Kalender-Konten (iCloud-CalDAV / ICS-Abo) ────
// Ohne Secrets nach außen; Collections mit Event-Zahl für die Profil-Ansicht.
function accountView(a) {
  return {
    id: a.id, kind: a.kind, label: a.label, username: a.username,
    baseUrl: a.kind === "ics" ? a.baseUrl : null, enabled: a.enabled,
    lastSyncAt: a.lastSyncAt, lastError: a.lastError,
    calendars: repo.listCalendarCollections(a.id).map((c) => ({
      id: c.id, name: c.name, color: c.color, enabled: c.enabled,
    })),
    eventCount: repo.countCalendarEvents(a.id),
  };
}
add("GET", /^\/api\/calendar\/accounts$/, () => ({
  accounts: repo.listCalendarAccounts().map(accountView),
}));
add("POST", /^\/api\/calendar\/accounts$/, async (_p, b) => {
  const acc = await calsync.addAccount({
    kind: b.kind === "ics" ? "ics" : "caldav",
    label: b.label ? str(b.label) : null,
    username: b.username ? str(b.username) : null,
    password: b.password ? str(b.password) : null,
    url: b.url ? str(b.url) : null,
  });
  return { account: accountView(acc), ...timer.getSnapshot() };
});
add("PUT", /^\/api\/calendar\/accounts\/(\d+)$/, async (p, b) => {
  const patch = {};
  if (b.label !== undefined) patch.label = b.label ? str(b.label) : null;
  if (b.enabled !== undefined) patch.enabled = !!b.enabled;
  if (b.password) {
    const { encryptSecret } = await import("./lib/secret.js");
    patch.secretEnc = encryptSecret(str(b.password));
  }
  const acc = repo.updateCalendarAccount(Number(p[0]), patch);
  if (!acc) throw httpError(404, "Kalender-Konto nicht gefunden");
  return { account: accountView(acc), ...timer.getSnapshot() };
});
add("DELETE", /^\/api\/calendar\/accounts\/(\d+)$/, (p) => {
  repo.deleteCalendarAccount(Number(p[0]));
  return timer.getSnapshot();
});
add("POST", /^\/api\/calendar\/accounts\/(\d+)\/sync$/, async (p) => {
  const result = await calsync.syncAccount(Number(p[0]));
  const acc = repo.getCalendarAccount(Number(p[0]));
  return { sync: result, account: accountView(acc), ...timer.getSnapshot() };
});
add("PUT", /^\/api\/calendar\/collections\/(\d+)$/, (p, b) => {
  const col = repo.setCalendarCollectionEnabled(Number(p[0]), !!b.enabled);
  if (!col) throw httpError(404, "Kalender nicht gefunden");
  return timer.getSnapshot();
});
// Kalender lokal entfernen: Quelle deaktivieren und ihre gecachten Termine löschen.
// Der Remote-Kalender selbst wird dabei nicht verändert.
add("DELETE", /^\/api\/calendar\/collections\/(\d+)$/, (p) => {
  const id = Number(p[0]);
  const col = repo.setCalendarCollectionEnabled(id, false);
  if (!col) throw httpError(404, "Kalender nicht gefunden");
  repo.clearCalendarEvents(id);
  return timer.getSnapshot();
});
// Expandierte Termine eines Tages (Woche/Detail; "heute" steckt im Snapshot).
add("GET", /^\/api\/calendar\/day$/, (_p, _b, q) => {
  const date = str(q.date).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, "date (YYYY-MM-DD) fehlt");
  return { date, events: calsync.eventsForDay(date) };
});

// ── Subtasks ─────────────────────────────────────
add("POST", /^\/api\/tasks\/(\d+)\/subtasks$/, (p, b) => {
  const text = str(b.text).trim();
  if (!text) throw httpError(400, "text fehlt");
  repo.createSubtask(Number(p[0]), text);
  return timer.getSnapshot();
});
add("PUT", /^\/api\/subtasks\/(\d+)$/, (p, b) => {
  const patch = {};
  if (b.text !== undefined) patch.text = str(b.text);
  if (b.done !== undefined) patch.done = !!b.done;
  repo.updateSubtask(Number(p[0]), patch);
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/subtasks\/(\d+)$/, (p) => { repo.deleteSubtask(Number(p[0])); return timer.getSnapshot(); });

// ── Topics ───────────────────────────────────────
add("POST", /^\/api\/topics$/, (_p, b) => {
  const text = str(b.text).trim();
  if (!text) throw httpError(400, "text fehlt");
  repo.createTopic({ text, examId: toInt(b.examId, null) });
  return timer.getSnapshot();
});
add("PUT", /^\/api\/topics\/(\d+)$/, (p, b) => {
  const patch = {};
  if (b.text !== undefined) patch.text = str(b.text);
  if (b.done !== undefined) patch.done = !!b.done;
  if (b.confidence !== undefined) patch.confidence = toInt(b.confidence, 0);
  if (b.examId !== undefined) patch.examId = toInt(b.examId, null);
  repo.updateTopic(Number(p[0]), patch);
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/topics\/(\d+)$/, (p) => { repo.deleteTopic(Number(p[0])); return timer.getSnapshot(); });

// ── Notes (Notizen) ──────────────────────────────
add("POST", /^\/api\/notes$/, (_p, b) => {
  const text = str(b.text ?? "");
  const title = b.title != null ? str(b.title).trim() : "";
  // Dokument: Titel ODER Text reicht — ein leeres Dokument wäre nur Rauschen.
  if (!text.trim() && !title) throw httpError(400, "title oder text fehlt");
  repo.createNote({
    title: title || null, text,
    subject: b.subject != null ? str(b.subject) : null,
    examId: toInt(b.examId, null), pinned: !!b.pinned,
  });
  return timer.getSnapshot();
});
add("PUT", /^\/api\/notes\/(\d+)$/, (p, b) => {
  const patch = {};
  if (b.title !== undefined) patch.title = b.title != null && str(b.title).trim() ? str(b.title).trim() : null;
  if (b.text !== undefined) patch.text = str(b.text);
  if (b.subject !== undefined) patch.subject = b.subject != null ? str(b.subject) : null;
  if (b.examId !== undefined) patch.examId = toInt(b.examId, null);
  if (b.pinned !== undefined) patch.pinned = !!b.pinned;
  repo.updateNote(Number(p[0]), patch);
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/notes\/(\d+)$/, (p) => { repo.deleteNote(Number(p[0])); return timer.getSnapshot(); });

// ── Resources (Lern-Links / Hand-off zu externen Seiten) ──
add("POST", /^\/api\/resources$/, (_p, b) => {
  const url = str(b.url).trim();
  if (!url) throw httpError(400, "url fehlt");
  const topicId = toInt(b.topicId, null);
  const taskId = toInt(b.taskId, null);
  if (topicId == null && taskId == null) throw httpError(400, "topicId oder taskId nötig");
  const title = b.title != null && str(b.title).trim() ? str(b.title).trim() : url;
  repo.createResource({
    topicId, taskId, url, title, kind: b.kind ? str(b.kind) : null,
    notes: b.notes != null ? str(b.notes) : null, isPrimary: !!b.isPrimary,
  });
  return timer.getSnapshot();
});
add("PUT", /^\/api\/resources\/(\d+)$/, (p, b) => {
  const patch = {};
  if (b.title !== undefined) patch.title = str(b.title);
  if (b.url !== undefined) patch.url = str(b.url);
  if (b.kind !== undefined) patch.kind = b.kind ? str(b.kind) : null;
  if (b.notes !== undefined) patch.notes = b.notes != null ? str(b.notes) : null;
  if (b.isPrimary !== undefined) patch.isPrimary = !!b.isPrimary;
  if (b.sortOrder !== undefined) patch.sortOrder = toInt(b.sortOrder, 0);
  repo.updateResource(Number(p[0]), patch);
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/resources\/(\d+)$/, (p) => { repo.deleteResource(Number(p[0])); return timer.getSnapshot(); });

// ── Prefs: Lernprofil, Darstellung, Features, Methoden (JSON-KV) ──
add("GET", /^\/api\/prefs$/, () => ({ prefs: repo.getPrefs() }));
add("PUT", /^\/api\/prefs$/, (_p, b) => {
  repo.setPrefs(b && typeof b === "object" && !Array.isArray(b) ? b : {});
  return timer.getSnapshot();
});

// ── Material-Bibliothek (Links + Karten als JSON; Dateien über /upload) ──
add("POST", /^\/api\/materials$/, (_p, b) => {
  const kind = ["link", "card"].includes(b.kind) ? b.kind : "link";
  const title = str(b.title).trim();
  if (!title) throw httpError(400, "title fehlt");
  if (kind === "link" && !str(b.url).trim()) throw httpError(400, "url fehlt");
  if (kind === "card" && !str(b.content).trim()) throw httpError(400, "content fehlt");
  repo.createMaterial({
    kind, title,
    subject: b.subject ? str(b.subject) : null,
    url: b.url ? str(b.url).trim() : null,
    content: b.content != null ? str(b.content) : null,
    topicId: toInt(b.topicId, null), examId: toInt(b.examId, null),
    noteId: toInt(b.noteId, null),
    pinned: !!b.pinned,
  });
  return timer.getSnapshot();
});
add("PUT", /^\/api\/materials\/(\d+)$/, (p, b) => {
  const patch = {};
  if (b.title !== undefined) patch.title = str(b.title);
  if (b.subject !== undefined) patch.subject = b.subject ? str(b.subject) : null;
  if (b.url !== undefined) patch.url = b.url ? str(b.url) : null;
  if (b.content !== undefined) patch.content = b.content != null ? str(b.content) : null;
  if (b.topicId !== undefined) patch.topicId = toInt(b.topicId, null);
  if (b.examId !== undefined) patch.examId = toInt(b.examId, null);
  if (b.noteId !== undefined) patch.noteId = toInt(b.noteId, null);
  if (b.pinned !== undefined) patch.pinned = !!b.pinned;
  if (b.sortOrder !== undefined) patch.sortOrder = toInt(b.sortOrder, 0);
  repo.updateMaterial(Number(p[0]), patch);
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/materials\/(\d+)$/, (p) => { repo.deleteMaterial(Number(p[0])); return timer.getSnapshot(); });
// Datei-Inhalt ausliefern (PDF/Bild öffnet im In-App-Viewer, same-origin iframe).
const dispositionName = (title) => String(title || "datei").replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "datei";
add("GET", /^\/api\/materials\/(\d+)\/file$/, (p, _b, q) => {
  const d = repo.getMaterialData(Number(p[0]));
  if (!d) throw httpError(404, "Datei nicht gefunden");
  const mode = q.download === "1" ? "attachment" : "inline";
  return {
    __raw: Buffer.from(d.data),
    __headers: {
      "Content-Type": d.mime || "application/octet-stream",
      "Content-Disposition": `${mode}; filename="${dispositionName(d.title)}"`,
    },
  };
});

// ── Aktiver Abruf (SRS-Reviews) ──────────────────
const userTodayKey = () => dayKeyTz(new Date(nowMs()), repo.getProfile()?.timezone || null);
add("POST", /^\/api\/reviews$/, (_p, b) => {
  const kind = b.kind === "material" ? "material" : "topic";
  const refId = toInt(b.refId, null);
  if (refId == null) throw httpError(400, "refId fehlt");
  const owns = kind === "topic"
    ? repo.listTopics().some((t) => t.id === refId)
    : !!repo.getMaterial(refId);
  if (!owns) throw httpError(404, "Inhalt nicht gefunden");
  repo.ensureReview(kind, refId, userTodayKey());
  return timer.getSnapshot();
});
add("POST", /^\/api\/reviews\/(\d+)\/answer$/, (p, b) => {
  const r = repo.getReview(Number(p[0]));
  if (!r) throw httpError(404, "Abruf-Eintrag nicht gefunden");
  const grade = Math.max(0, Math.min(3, toInt(b.grade, 0)));
  const next = gradeReview(r, grade);
  repo.saveReviewState(r.id, {
    dueKey: nextDueKey(userTodayKey(), next.intervalDays),
    intervalDays: next.intervalDays, ease: next.ease, reps: next.reps, lapses: next.lapses,
    lastGrade: grade, lastReviewAt: nowMs(),
  });
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/reviews\/(\d+)$/, (p) => { repo.deleteReview(Number(p[0])); return timer.getSnapshot(); });

// ── Journal: Tagesrückblick (Sessions/Notizen/Material/Abrufe je Tag) ──
add("GET", /^\/api\/journal$/, (_p, _b, q) => {
  const now = nowMs();
  const tz = repo.getProfile()?.timezone || null;
  const days = Math.max(1, Math.min(90, toInt(q.days, 14)));
  const fromMs = now - days * 86_400_000;
  const dk = (ms) => dayKeyTz(new Date(ms), tz);
  const byDay = {};
  const bucket = (key) => (byDay[key] ??= { dayKey: key, focusMs: 0, sessions: [], notes: [], materials: [], reviews: [] });
  for (const s of repo.journalSessions(fromMs)) {
    const b = bucket(dk(s.startedAt));
    b.focusMs += s.focusMs;
    b.sessions.push(s);
  }
  for (const n of repo.listNotes()) if (n.createdAt >= fromMs) {
    bucket(dk(n.createdAt)).notes.push({ id: n.id, text: n.text, subject: n.subject });
  }
  for (const m of repo.listMaterials()) if (m.createdAt >= fromMs) {
    bucket(dk(m.createdAt)).materials.push({ id: m.id, title: m.title, kind: m.kind });
  }
  for (const r of repo.listReviews()) if (r.lastReviewAt && r.lastReviewAt >= fromMs) {
    bucket(dk(r.lastReviewAt)).reviews.push({ id: r.id, kind: r.kind, refId: r.refId, grade: r.lastGrade });
  }
  return { days: Object.values(byDay).sort((a, b2) => b2.dayKey.localeCompare(a.dayKey)) };
});

// ── Teilen per Link ──────────────────────────────
add("GET", /^\/api\/shares$/, () => ({
  shares: repo.listShares().map((s) => ({ id: s.id, kind: s.kind, refId: s.refId, createdAt: s.createdAt, viewCount: s.viewCount, url: `/s/${s.token}` })),
}));
add("POST", /^\/api\/shares$/, (_p, b) => {
  const s = shareMod.createShareFor(str(b.kind), toInt(b.refId, null));
  return { share: { id: s.id, kind: s.kind, refId: s.refId, createdAt: s.createdAt, viewCount: s.viewCount, url: `/s/${s.token}` } };
});
add("DELETE", /^\/api\/shares\/(\d+)$/, (p) => { repo.revokeShare(Number(p[0])); return { ok: true }; });
add("POST", /^\/api\/shares\/import$/, (_p, b) => {
  const imported = shareMod.importShare(str(b.token).trim());
  return { imported, ...timer.getSnapshot() };
});
// Öffentlich (ohne Login): Payload + Dateien eines geteilten Inhalts.
add("GET", /^\/api\/shares\/public\/([A-Za-z0-9_-]+)$/, (p) => {
  const r = shareMod.resolveShare(p[0], { countView: true });
  if (!r) throw httpError(404, "Link unbekannt oder widerrufen");
  return { kind: r.share.kind, payload: r.payload };
});
add("GET", /^\/api\/shares\/public\/([A-Za-z0-9_-]+)\/file\/(\d+)$/, (p) => {
  const d = shareMod.resolveShareFile(p[0], Number(p[1]));
  if (!d) throw httpError(404, "Datei nicht gefunden");
  return {
    __raw: Buffer.from(d.data),
    __headers: {
      "Content-Type": d.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${dispositionName(d.title)}"`,
    },
  };
});

// ── KI-Buddy ─────────────────────────────────────
add("GET", /^\/api\/ai\/config$/, () => ai.getConfigView());
add("PUT", /^\/api\/ai\/config$/, (_p, b) => ai.saveConfig(b || {}));
add("POST", /^\/api\/ai\/chat$/, (_p, b) => ai.chat({
  messages: b.messages, context: b.context, lang: b.lang === "en" ? "en" : "de",
}));

// ── Lernziel → Themen & Ablauf ───────────────────
// Zwei Schritte, bewusst getrennt: erst VORSCHLAGEN (schreibt nichts), dann auf
// Bestätigung ÜBERNEHMEN. Ein Zerlegungsvorschlag ist eine Meinung, keine Tatsache
// — er gehört vor die Augen der Person, bevor er ihre Prüfung umbaut.
//
// Ohne KI-Einwilligung/Anbieter greift die deterministische Gliederungs-Erkennung
// (shared/outline.js) auf den eingefügten Text. Das ist kein Trostpreis: bei einem
// Modulhandbuch oder Inhaltsverzeichnis ist sie oft die genauere Quelle.
add("POST", /^\/api\/plan\/topics$/, async (_p, b) => {
  const lang = b.lang === "en" ? "en" : "de";
  // Klemmen VOR jeder Textarbeit. readJsonBody lässt 1 MB durch; ungekürzt liefe
  // die Gliederungs-Erkennung darauf minutenlang und blockierte den einzigen
  // Node-Thread für alle Mandanten. Die KI-Seite kappt intern ohnehin bei 12 000.
  const MAX_MATERIAL = 12_000;
  const MAX_TASKTYPES = 2_000;
  const goal = str(b.goal || "").trim().slice(0, 2_000);
  const material = str(b.material || "").trim().slice(0, MAX_MATERIAL);
  if (!goal && !material) throw httpError(400, lang === "de" ? "Kein Lernziel angegeben" : "No learning goal given");
  const taskTypes = parseTaskTypes(str(b.taskTypes || "").slice(0, MAX_TASKTYPES));

  const wantAi = b.useAi !== false;
  if (wantAi) {
    try {
      return await ai.planTopics({
        goal, material, taskTypes,
        examName: b.examName ? str(b.examName).trim() : null,
        examDate: b.examDate ? str(b.examDate).trim() : null,
        lang,
      });
    } catch (err) {
      // Kein stiller Rückfall: die Person soll wissen, WARUM sie gerade die
      // Gliederungs-Erkennung sieht — sonst hält sie das Ergebnis für die KI.
      if (!material) throw err;
      const fallback = outlineProposal(material, { taskTypes });
      return { ...fallback, aiError: err?.message || "AI unavailable" };
    }
  }
  return outlineProposal(material, { taskTypes });
});

// Übernehmen: Themen anlegen (Reihenfolge = Vorschlagsreihenfolge), optional je
// Thema eine Aufgabe mit Dauer/Schwierigkeit/Abhängigkeit — erst DIE macht aus
// der Liste einen planbaren Ablauf (der Auto-Plan verteilt sie danach auf Tage).
// Das eingefügte Material wird als Notiz an der Prüfung festgehalten, damit die
// Quelle nachlesbar bleibt statt nach dem Import zu verschwinden.
add("POST", /^\/api\/plan\/topics\/apply$/, (_p, b) => {
  const lang = b.lang === "en" ? "en" : "de";
  const items = Array.isArray(b.topics) ? b.topics : [];
  if (!items.length) throw httpError(400, lang === "de" ? "Keine Themen zum Übernehmen" : "No topics to apply");
  // Obergrenze: der Vorschlag deckelt bei 25 (KI) bzw. 40 (Gliederung), aber der
  // Endpunkt darf sich nicht darauf verlassen. Ohne Grenze würde ein 1-MB-Body
  // (readJsonBody-Limit) Zehntausende Schreibvorgänge auslösen. Ablehnen statt
  // stillschweigend abschneiden — abgeschnittene Themen fielen sonst lautlos weg.
  const MAX_APPLY = 60;
  if (items.length > MAX_APPLY) {
    throw httpError(400, lang === "de"
      ? `Zu viele Themen auf einmal (${items.length}) — höchstens ${MAX_APPLY}.`
      : `Too many topics at once (${items.length}) — at most ${MAX_APPLY}.`);
  }

  let examId = b.examId != null ? toInt(b.examId) : null;
  if (examId != null && !repo.getExam(examId)) examId = null;
  if (examId == null) {
    const name = str(b.examName || "").trim() || (lang === "de" ? "Neue Prüfung" : "New exam");
    // "2026-09-03" via Date.parse() ist UTC-Mitternacht — westlich von
    // Greenwich zeigt die App dann den Vortag. Lokale Mitternacht bauen.
    const p = b.examDate ? keyToParts(str(b.examDate)) : null;
    const date = p ? new Date(p.y, p.mo - 1, p.d).getTime() : null;
    examId = repo.createExam({ name, date }).id;
  }

  const createTasks = b.createTasks !== false;
  const subject = b.subject ? str(b.subject).trim().slice(0, 60) : null;
  const topicIds = [];
  const taskIds = [];

  for (const it of items) {
    const text = str(it?.text || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!text) { topicIds.push(null); taskIds.push(null); continue; }
    topicIds.push(repo.createTopic({ examId, text }).id);
    if (!createTasks) { taskIds.push(null); continue; }
    const est = it?.estMinutes != null ? Math.max(5, Math.min(600, Math.round(Number(it.estMinutes) || 0))) : null;
    const diff = it?.difficulty != null ? Math.max(1, Math.min(3, Math.round(Number(it.difficulty) || 0))) : null;
    const task = repo.createTask({
      text, examId, topicId: topicIds[topicIds.length - 1],
      subject: subject || undefined,
      estMinutes: est ?? undefined,
      difficulty: diff ?? undefined,
    });
    taskIds.push(task.id);
  }

  // Abhängigkeiten erst NACH dem Anlegen verdrahten — vorher gibt es keine IDs.
  // Nur rückwärts gerichtete Indizes, damit kein Zyklus entstehen kann.
  if (createTasks) {
    items.forEach((it, i) => {
      if (taskIds[i] == null) return;
      // Kantenzahl deckeln: MAX_APPLY begrenzt die Themen, nicht die
      // Abhängigkeiten je Thema — ein präparierter Body könnte sonst
      // zehntausende Schreibvorgänge auslösen.
      for (const depIdx of (Array.isArray(it?.dependsOn) ? it.dependsOn : []).slice(0, MAX_APPLY)) {
        const j = toInt(depIdx);
        if (!Number.isInteger(j) || j < 0 || j >= i) continue;
        if (taskIds[j] == null) continue;
        try { repo.addTaskDep(taskIds[i], taskIds[j]); } catch { /* Zyklus/doppelt: überspringen */ }
      }
    });
  }

  // Quelle festhalten: eingefügtes Material + Aufgabentypen als Prüfungs-Notiz.
  const srcBits = [];
  if (b.taskTypes) srcBits.push((lang === "de" ? "Aufgabentypen: " : "Task types: ") + str(b.taskTypes).trim());
  if (b.material) srcBits.push(str(b.material).trim());
  if (srcBits.length) {
    repo.createNote({
      examId,
      title: lang === "de" ? "Quelle des Lernplans" : "Study plan source",
      text: srcBits.join("\n\n").slice(0, 20_000),
    });
  }

  return {
    ...timer.getSnapshot(),
    applied: {
      examId,
      topics: topicIds.filter((x) => x != null).length,
      tasks: taskIds.filter((x) => x != null).length,
    },
  };
});

// ── Profil (persönliche Informationen) ───────────
add("GET", /^\/api\/profile$/, () => repo.getProfile());
add("PUT", /^\/api\/profile$/, (_p, b) => repo.saveProfile(b || {}));

// ── Export: ICS (Kalender-Abo/Download) ──────────
add("GET", /^\/api\/export\.ics$/, () => ({
  __raw: buildIcsForUser(),
  __headers: {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'attachment; filename="kairos.ics"',
  },
}));

// key (YYYY-MM-DD) + Minute-ab-Mitternacht → Wanduhr-Bestandteile (Umschlag über Mitternacht).
function wallFromKeyMin(key, minOfDay) {
  const dayShift = Math.floor(minOfDay / 1440);
  const p = keyToParts(dayShift ? addDaysKey(key, dayShift) : key);
  if (!p) return null;
  const m = ((minOfDay % 1440) + 1440) % 1440;
  return { y: p.y, mo: p.mo, d: p.d, h: Math.floor(m / 60), mi: m % 60 };
}

// VCALENDAR aus geplanten (getimten, offenen) Aufgaben + aktiven Prüfungen. Aufgaben =
// getimte Blöcke (floating local aus plannedDate+scheduledMin), Prüfungen = Ganztags-
// Marker am (nach Profil-Zeitzone berechneten) Prüfungstag.
function buildIcsForUser() {
  const tz = repo.getProfile()?.timezone || null;
  const events = [];
  for (const t of repo.listTasks()) {
    if (t.done || t.plannedDate == null || t.scheduledMin == null) continue;
    const dur = Math.max(5, Math.round(t.estMinutes || 25));
    const start = wallFromKeyMin(t.plannedDate, t.scheduledMin);
    const end = wallFromKeyMin(t.plannedDate, t.scheduledMin + dur);
    if (!start || !end) continue;
    events.push({
      uid: `task-${t.id}@kairos`,
      summary: t.subject ? `${t.text} · ${t.subject}` : t.text,
      dtStart: formatIcsLocal(start),
      dtEnd: formatIcsLocal(end),
    });
  }
  for (const e of repo.listExams()) {
    if (e.archived || e.date == null) continue;
    const p = keyToParts(dayKeyTz(new Date(e.date), tz));
    const p2 = p && keyToParts(addDaysKey(dayKeyTz(new Date(e.date), tz), 1));
    if (!p || !p2) continue;
    events.push({
      uid: `exam-${e.id}@kairos`,
      summary: `Exam · ${e.name}`,
      allDay: true,
      dtStart: formatIcsDate({ y: p.y, mo: p.mo, d: p.d }),
      dtEnd: formatIcsDate({ y: p2.y, mo: p2.mo, d: p2.d }),
    });
  }
  return buildCalendar({ calName: "Kairos", events, dtStamp: formatIcsUtc(nowMs()) });
}

// ── Health: Import & Abfrage ─────────────────────
// Abgeleiteter Readiness-/Kapazitäts-Kontext (Brücke zu KI + Planung).
function healthContext() {
  const profile = repo.getProfile();
  const source = repo.resolveContextSource(profile);
  return computeHealthContext(repo.recentDaily(source, 14), profile, nowMs());
}
// raw_json (sensible Rohdaten) nur bei ?raw=1/true ausliefern.
const wantsRaw = (q) => q.raw === "1" || q.raw === "true";

// Einen Rohtag einer Quelle normalisieren und schreiben. Ohne auflösbaren
// Tagesschlüssel wird der Datensatz übersprungen (statt Fehler zu werfen).
function ingestDay(source, raw) {
  const norm = normalizeDaily(source, raw);
  if (!norm.dayKey) return { stored: null, skipped: true };
  const stored = repo.upsertDaily({
    dayKey: norm.dayKey, source: norm.source, cols: norm.cols,
    raw: norm.raw, recordedAt: norm.recordedAt,
  });
  return { stored, skipped: false };
}

// Maschinenlesbare Feld-/Quellen-Referenz (für Doku, Clients, KI-Prompts).
add("GET", /^\/api\/health\/schema$/, () => ({
  sources: SUPPORTED_SOURCES,
  fields: DAILY_FIELDS.map(({ key, unit, min, max }) => ({ key, unit, min, max })),
}));

// Batch-Import — der Haupteinstieg. Body: { source, days:[…], samples?:[…]|{…} }
add("POST", /^\/api\/health\/import$/, (_p, b) => {
  const source = normalizeSource(b.source);
  const list = Array.isArray(b.days) ? b.days
    : Array.isArray(b.records) ? b.records
    : Array.isArray(b.daily) ? b.daily
    : b.day ? [b.day] : [];
  let imported = 0;
  let skipped = 0;
  const days = [];
  for (const raw of list) {
    const { stored, skipped: sk } = ingestDay(source, raw);
    if (sk) skipped++; else { imported++; days.push(stored.dayKey); }
  }
  const samples = b.samples ? repo.insertSamples(normalizeSamples(source, b.samples)) : 0;
  return { source, imported, skipped, days, samples, context: healthContext() };
});

// Einzelnen Tag einspeisen. Body: { source, day/date/…, …kanonisch } oder { source, raw:{…} }
add("POST", /^\/api\/health\/daily$/, (_p, b) => {
  const source = normalizeSource(b.source);
  const { stored, skipped } = ingestDay(source, b.raw ?? b);
  if (skipped) throw httpError(400, "Kein Tagesschlüssel (day/date) erkennbar");
  return { day: stored, context: healthContext() };
});

// Intraday-Zeitreihen. Body: { source, samples:[{metric,t,value,unit}]|{metric:[…]} }
add("POST", /^\/api\/health\/samples$/, (_p, b) => {
  const source = normalizeSource(b.source);
  const n = repo.insertSamples(normalizeSamples(source, b.samples ?? b));
  return { source, samples: n };
});

add("GET", /^\/api\/health\/context$/, () => healthContext());

add("GET", /^\/api\/health\/latest$/, (_p, _b, q) => {
  const source = q.source ? normalizeSource(q.source) : repo.resolveContextSource();
  return { source, day: repo.latestDaily(source, wantsRaw(q)) };
});

add("GET", /^\/api\/health\/daily$/, (_p, _b, q) => ({
  days: repo.listDaily({
    from: q.from || null, to: q.to || null,
    source: q.source ? normalizeSource(q.source) : null,
    limit: toInt(q.limit, 400),
  }),
}));

add("GET", /^\/api\/health\/daily\/(\d{4}-\d{2}-\d{2})$/, (p, _b, q) => {
  const raw = wantsRaw(q);
  if (q.source) return { dayKey: p[0], sources: [repo.getDaily(p[0], normalizeSource(q.source), raw)].filter(Boolean) };
  return { dayKey: p[0], sources: repo.getDayAllSources(p[0], raw) };
});

add("DELETE", /^\/api\/health\/daily\/(\d{4}-\d{2}-\d{2})$/, (p, _b, q) => {
  repo.deleteDaily(p[0], q.source ? normalizeSource(q.source) : null);
  return { deleted: true, dayKey: p[0] };
});

add("GET", /^\/api\/health\/samples$/, (_p, _b, q) => ({
  samples: repo.listSamples({
    metric: q.metric || null, from: toInt(q.from, null), to: toInt(q.to, null),
    limit: toInt(q.limit, 2000),
  }),
}));

// ── Dispatcher ───────────────────────────────────
export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Query-Parameter als einfaches Objekt (letzter Wert gewinnt bei Duplikaten).
function parseQuery(url) {
  try {
    return Object.fromEntries(new URL(url, "http://localhost").searchParams);
  } catch {
    return {};
  }
}

// Öffentliche API-Pfade (ohne Login erreichbar).
const PUBLIC_PATHS = new Set(["/api/time", "/api/health", "/api/push/public-key"]);

function requestOrigin(req) {
  const proto = str(req.headers["x-forwarded-proto"]).split(",")[0].trim() || "http";
  const host = str(req.headers.host) || "localhost";
  return `${proto}://${host}`;
}
function isLocal(req) {
  const a = req.socket?.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}
const EXPIRED_HTML = "<!doctype html><meta charset=utf-8><body style=\"font-family:system-ui;padding:48px;max-width:32rem;margin:auto\"><h2>Link abgelaufen</h2><p>Dieser Login-Link ist ungültig oder abgelaufen (max. 15 min gültig, einmalig nutzbar).</p><p><a href=\"/\">Neuen Link anfordern</a></p>";

// Auth-Endpunkte: Login anfordern / Magic-Link einlösen / abmelden. Diese setzen
// bzw. löschen das Sitzungs-Cookie und brauchen KEINEN bestehenden Login.
// Gibt { status, body?, headers?, raw? } zurück oder null, wenn kein Auth-Pfad passt.
async function handleAuth(req, pathname, query, readBody) {
  if (req.method === "POST" && pathname === "/api/auth/request") {
    const body = await readBody();
    const email = auth.normalizeEmail(body.email);
    if (!auth.isEmail(email)) throw httpError(400, "Bitte eine gültige E-Mail angeben");
    const user = auth.findOrCreateUser(email);
    const raw = auth.createMagicToken(user.id);
    const link = `${requestOrigin(req)}/api/auth/verify?token=${raw}`;
    const devLink = auth.deliverMagicLink(email, link, { local: isLocal(req) });
    return { status: 200, body: { ok: true, email, devLink } };
  }
  if (req.method === "GET" && pathname === "/api/auth/verify") {
    const userId = auth.consumeMagicToken(query.token);
    if (!userId) return { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" }, raw: EXPIRED_HTML };
    repo.ensureUser(userId);
    const s = auth.createSession(userId, str(req.headers["user-agent"]));
    return { status: 302, headers: { Location: "/", "Set-Cookie": auth.sessionCookie(s.id) }, body: null };
  }
  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const sid = auth.parseCookies(req.headers.cookie)[auth.COOKIE_NAME];
    auth.deleteSession(sid);
    return { status: 200, headers: { "Set-Cookie": auth.clearCookie() }, body: { ok: true } };
  }
  return null;
}

// Gibt { status, body?, headers?, raw? } zurück oder null, wenn keine Route passt.
export async function handleApi(req, pathname) {
  const query = parseQuery(req.url);
  let bodyCache;
  const readBody = async () => {
    if (bodyCache !== undefined) return bodyCache;
    bodyCache = (req.method !== "GET" && req.method !== "DELETE") ? await readJsonBody(req) : {};
    return bodyCache;
  };

  // Aktuellen Nutzer aus dem Sitzungs-Cookie auflösen.
  const sid = auth.parseCookies(req.headers.cookie)[auth.COOKIE_NAME];
  const user = auth.getUserBySession(sid);

  // „Wer bin ich?" — immer beantwortbar (auch unangemeldet).
  if (req.method === "GET" && pathname === "/api/auth/me") {
    return { status: 200, body: user ? { user: { id: user.id, email: user.email } } : { user: null } };
  }

  // Login/Logout/Verify (kein bestehender Login nötig).
  const authResult = await handleAuth(req, pathname, query, readBody);
  if (authResult) return authResult;

  // Datei-Upload: Roh-Body statt JSON (Metadaten via Query, Dateityp via Content-Type).
  // Bewusst VOR der Route-Tabelle — readJsonBody würde am Binär-Body scheitern.
  if (req.method === "POST" && pathname === "/api/materials/upload") {
    if (!user) throw httpError(401, "Nicht angemeldet");
    const buf = await readRawBody(req, repo.MAX_FILE_BYTES);
    if (!buf.length) throw httpError(400, "Leere Datei");
    return await runAs(user.id, () => {
      repo.ensureUser(user.id);
      const material = repo.createMaterial({
        kind: "file",
        title: str(query.title).trim() || "File",
        topicId: toInt(query.topicId, null),
        examId: toInt(query.examId, null),
        noteId: toInt(query.noteId, null),
        subject: query.subject ? str(query.subject) : null,
        mime: str(req.headers["content-type"]).split(";")[0].trim() || "application/octet-stream",
        data: buf,
      });
      return { status: 200, body: { material, ...timer.getSnapshot() } };
    });
  }

  // Öffentliche Share-Pfade sind tokenisiert → Regex statt exakter Pfad-Menge.
  const isPublic = PUBLIC_PATHS.has(pathname) || /^\/api\/shares\/public\//.test(pathname);

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.pattern);
    if (!m) continue;
    // Geschützte Route ohne gültige Sitzung → 401 (fail-closed).
    if (!isPublic && !user) throw httpError(401, "Nicht angemeldet");
    const params = m.slice(1);
    const body = await readBody();
    const runHandler = () => r.handler(params, body, query); // Handler dürfen async sein
    // Geschützte Routen im Nutzerkontext ausführen (repo skopiert automatisch).
    const result = user
      ? await runAs(user.id, async () => { repo.ensureUser(user.id); return runHandler(); })
      : await runHandler();
    // Rohantwort (z. B. ICS-Datei) mit eigenem Content-Type/Disposition durchreichen.
    if (result && typeof result === "object" && result.__raw !== undefined) {
      return { status: 200, raw: result.__raw, headers: result.__headers || {} };
    }
    return { status: 200, body: result };
  }
  return null;
}
