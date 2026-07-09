// REST-API-Routen. Jede Mutation liefert die komplette Momentaufnahme zurück,
// damit Clients (PWA + Extension) ihren State einfach ersetzen können.
import * as timer from "./timer.js";
import * as repo from "./repo.js";
import * as push from "./push.js";
import { readJsonBody, toInt, toNum, str, nowMs } from "./lib/util.js";

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

// ── Dispatcher ───────────────────────────────────
export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Gibt { status, body } zurück oder null, wenn keine API-Route passt.
export async function handleApi(req, pathname) {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.pattern);
    if (!m) continue;
    const params = m.slice(1);
    let body = {};
    if (req.method !== "GET" && req.method !== "DELETE") {
      body = await readJsonBody(req);
    }
    const result = await r.handler(params, body); // Handler dürfen async sein (z. B. Push)
    return { status: 200, body: result };
  }
  return null;
}
