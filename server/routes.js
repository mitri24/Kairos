// REST-API-Routen. Jede Mutation liefert die komplette Momentaufnahme zurück,
// damit Clients (PWA + Extension) ihren State einfach ersetzen können.
import * as timer from "./timer.js";
import * as repo from "./repo.js";
import * as push from "./push.js";
import { readJsonBody, toInt, toNum, str, nowMs } from "./lib/util.js";
import { normalizeDaily, normalizeSamples, normalizeSource, SUPPORTED_SOURCES } from "./health/normalize.js";
import { computeHealthContext } from "./health/context.js";
import { DAILY_FIELDS } from "./health/fields.js";

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
  return timer.setSettings(patch);
});

// ── Exams ────────────────────────────────────────
add("POST", /^\/api\/exams$/, (_p, b) => {
  repo.createExam({
    name: str(b.name, "Prüfung"), date: toInt(b.date, null),
    totalHours: toNum(b.totalHours, 0), color: b.color ?? null,
  });
  return timer.getSnapshot();
});
add("PUT", /^\/api\/exams\/(\d+)$/, (p, b) => {
  repo.updateExam(Number(p[0]), {
    name: b.name, date: b.date !== undefined ? toInt(b.date, null) : undefined,
    totalHours: b.totalHours !== undefined ? toNum(b.totalHours, 0) : undefined, color: b.color,
  });
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/exams\/(\d+)$/, (p) => { repo.deleteExam(Number(p[0])); return timer.getSnapshot(); });

// ── Tasks ────────────────────────────────────────
add("POST", /^\/api\/tasks$/, (_p, b) => {
  const text = str(b.text).trim();
  if (!text) throw httpError(400, "text fehlt");
  repo.createTask({
    text, examId: toInt(b.examId, null), subject: b.subject ? str(b.subject) : null,
    priority: toInt(b.priority, 2), dueDate: toInt(b.dueDate, null),
    plannedDate: b.plannedDate ? str(b.plannedDate) : null, estMinutes: toInt(b.estMinutes, 25),
    scheduledMin: toInt(b.scheduledMin, null),
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
  repo.updateTask(Number(p[0]), patch);
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/tasks\/(\d+)$/, (p) => { repo.deleteTask(Number(p[0])); return timer.getSnapshot(); });
add("POST", /^\/api\/tasks\/reorder$/, (_p, b) => {
  if (Array.isArray(b.ids)) repo.reorderTasks(b.ids.map((x) => Number(x)));
  return timer.getSnapshot();
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
  if (b.examId !== undefined) patch.examId = toInt(b.examId, null);
  repo.updateTopic(Number(p[0]), patch);
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/topics\/(\d+)$/, (p) => { repo.deleteTopic(Number(p[0])); return timer.getSnapshot(); });

// ── Notes (Notizen) ──────────────────────────────
add("POST", /^\/api\/notes$/, (_p, b) => {
  const text = str(b.text).trim();
  if (!text) throw httpError(400, "text fehlt");
  repo.createNote({
    text, subject: b.subject != null ? str(b.subject) : null,
    examId: toInt(b.examId, null), pinned: !!b.pinned,
  });
  return timer.getSnapshot();
});
add("PUT", /^\/api\/notes\/(\d+)$/, (p, b) => {
  const patch = {};
  if (b.text !== undefined) patch.text = str(b.text);
  if (b.subject !== undefined) patch.subject = b.subject != null ? str(b.subject) : null;
  if (b.examId !== undefined) patch.examId = toInt(b.examId, null);
  if (b.pinned !== undefined) patch.pinned = !!b.pinned;
  repo.updateNote(Number(p[0]), patch);
  return timer.getSnapshot();
});
add("DELETE", /^\/api\/notes\/(\d+)$/, (p) => { repo.deleteNote(Number(p[0])); return timer.getSnapshot(); });

// ── Profil (persönliche Informationen) ───────────
add("GET", /^\/api\/profile$/, () => repo.getProfile());
add("PUT", /^\/api\/profile$/, (_p, b) => repo.saveProfile(b || {}));

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

// Gibt { status, body } zurück oder null, wenn keine API-Route passt.
export async function handleApi(req, pathname) {
  const query = parseQuery(req.url);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.pattern);
    if (!m) continue;
    const params = m.slice(1);
    let body = {};
    if (req.method !== "GET" && req.method !== "DELETE") {
      body = await readJsonBody(req);
    }
    const result = await r.handler(params, body, query); // Handler dürfen async sein (z. B. Push)
    return { status: 200, body: result };
  }
  return null;
}
