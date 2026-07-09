// Datenzugriff: mappt SQLite-Zeilen (snake_case) auf JS-Objekte (camelCase).
import { getDb } from "./db.js";
import { nowMs } from "./lib/util.js";

// ── Mapper ───────────────────────────────────────
const mapExam = (r) => r && ({
  id: r.id, name: r.name, date: r.exam_date, totalHours: r.total_hours,
  color: r.color, sortOrder: r.sort_order, createdAt: r.created_at,
});
const mapTask = (r) => r && ({
  id: r.id, examId: r.exam_id, text: r.text, subject: r.subject,
  priority: r.priority, dueDate: r.due_date, plannedDate: r.planned_date,
  estMinutes: r.est_minutes, scheduledMin: r.scheduled_min,
  done: !!r.done, doneAt: r.done_at, spentMs: r.spent_ms, active: !!r.active,
  sortOrder: r.sort_order, createdAt: r.created_at, subtasks: [],
});
const mapSubtask = (r) => r && ({
  id: r.id, taskId: r.task_id, text: r.text, done: !!r.done,
  sortOrder: r.sort_order, createdAt: r.created_at,
});
const mapTopic = (r) => r && ({
  id: r.id, examId: r.exam_id, text: r.text, done: !!r.done,
  sortOrder: r.sort_order, createdAt: r.created_at,
});

// ── Settings (Singleton) ─────────────────────────
export function getSettingsRow() {
  return getDb().prepare("SELECT * FROM settings WHERE id = 1").get();
}

export function getSettings() {
  const r = getSettingsRow();
  return {
    focusMinutes: r.focus_minutes,
    shortBreakMinutes: r.short_break_minutes,
    longBreakMinutes: r.long_break_minutes,
    cyclesUntilLongBreak: r.cycles_until_long_break,
    autoStartNextPhase: !!r.auto_start_next_phase,
    todayGoalHours: r.today_goal_hours,
    profileName: r.profile_name,
    activeExamId: r.active_exam_id,
  };
}

export function saveSettings(s) {
  getDb().prepare(`
    UPDATE settings SET
      focus_minutes = ?, short_break_minutes = ?, long_break_minutes = ?,
      cycles_until_long_break = ?, auto_start_next_phase = ?, today_goal_hours = ?,
      profile_name = ?, active_exam_id = ?
    WHERE id = 1
  `).run(
    s.focusMinutes, s.shortBreakMinutes, s.longBreakMinutes,
    s.cyclesUntilLongBreak, s.autoStartNextPhase ? 1 : 0, s.todayGoalHours,
    s.profileName, s.activeExamId ?? null,
  );
  return getSettings();
}

// ── Timer-State (Singleton) ──────────────────────
export function getTimerRow() {
  return getDb().prepare("SELECT * FROM timer_state WHERE id = 1").get();
}

export function getTimerState() {
  const r = getTimerRow();
  return {
    status: r.status, phase: r.phase, cycleInBlock: r.cycle_in_block,
    remainingMs: r.remaining_ms, endsAt: r.ends_at, activeTaskId: r.active_task_id,
    phaseStartedAt: r.phase_started_at, updatedAt: r.updated_at,
  };
}

export function saveTimerState(t) {
  getDb().prepare(`
    UPDATE timer_state SET
      status = ?, phase = ?, cycle_in_block = ?, remaining_ms = ?,
      ends_at = ?, active_task_id = ?, phase_started_at = ?, updated_at = ?
    WHERE id = 1
  `).run(
    t.status, t.phase, t.cycleInBlock, t.remainingMs,
    t.endsAt ?? null, t.activeTaskId ?? null, t.phaseStartedAt ?? null, t.updatedAt,
  );
  return getTimerState();
}

// ── Exams ────────────────────────────────────────
export function listExams() {
  return getDb().prepare("SELECT * FROM exams ORDER BY sort_order, id").all().map(mapExam);
}
export function getExam(id) {
  return mapExam(getDb().prepare("SELECT * FROM exams WHERE id = ?").get(id));
}
export function createExam({ name = "Prüfung", date = null, totalHours = 0, color = null } = {}) {
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM exams").get().m;
  const info = getDb().prepare(`
    INSERT INTO exams (name, exam_date, total_hours, color, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, date, totalHours, color, max + 1, nowMs());
  return getExam(Number(info.lastInsertRowid));
}
export function updateExam(id, patch) {
  const cur = getExam(id);
  if (!cur) return null;
  const name = patch.name ?? cur.name;
  const date = patch.date !== undefined ? patch.date : cur.date;
  const totalHours = patch.totalHours !== undefined ? patch.totalHours : cur.totalHours;
  const color = patch.color !== undefined ? patch.color : cur.color;
  getDb().prepare("UPDATE exams SET name=?, exam_date=?, total_hours=?, color=? WHERE id=?")
    .run(name, date, totalHours, color, id);
  return getExam(id);
}
export function deleteExam(id) {
  const db = getDb();
  db.prepare("DELETE FROM exams WHERE id = ?").run(id);
  // Verwaisten Zeiger in den Settings räumen (sonst danglt activeExamId).
  db.prepare("UPDATE settings SET active_exam_id = NULL WHERE active_exam_id = ?").run(id);
}

// ── Tasks ────────────────────────────────────────
export function listTasks() {
  const tasks = getDb().prepare("SELECT * FROM tasks ORDER BY sort_order, id").all().map(mapTask);
  const subs = getDb().prepare("SELECT * FROM subtasks ORDER BY sort_order, id").all().map(mapSubtask);
  const byTask = new Map();
  for (const t of tasks) byTask.set(t.id, t);
  for (const s of subs) byTask.get(s.taskId)?.subtasks.push(s);
  return tasks;
}
export function getTask(id) {
  const t = mapTask(getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id));
  if (!t) return null;
  t.subtasks = getDb().prepare("SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order, id")
    .all(id).map(mapSubtask);
  return t;
}
export function createTask(p = {}) {
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM tasks").get().m;
  const info = getDb().prepare(`
    INSERT INTO tasks (exam_id, text, subject, priority, due_date, planned_date, est_minutes, scheduled_min, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    p.examId ?? null, p.text, p.subject ?? null, p.priority ?? 2,
    p.dueDate ?? null, p.plannedDate ?? null, p.estMinutes ?? 25,
    p.scheduledMin ?? null, max + 1, nowMs(),
  );
  return getTask(Number(info.lastInsertRowid));
}
export function updateTask(id, patch) {
  const cur = getTask(id);
  if (!cur) return null;
  const f = (k, col) => (patch[k] !== undefined ? patch[k] : cur[k]);
  const done = patch.done !== undefined ? patch.done : cur.done;
  const doneAt = patch.done !== undefined ? (patch.done ? (cur.doneAt ?? nowMs()) : null) : cur.doneAt;
  getDb().prepare(`
    UPDATE tasks SET exam_id=?, text=?, subject=?, priority=?, due_date=?, planned_date=?, est_minutes=?,
      scheduled_min=?, done=?, done_at=?, spent_ms=?, active=?, sort_order=? WHERE id=?
  `).run(
    f("examId"), f("text"), f("subject"), f("priority"), f("dueDate"), f("plannedDate"), f("estMinutes"),
    f("scheduledMin"), done ? 1 : 0, doneAt, f("spentMs"), f("active") ? 1 : 0, f("sortOrder"), id,
  );
  return getTask(id);
}
export function addTaskSpent(id, ms) {
  if (!ms) return;
  getDb().prepare("UPDATE tasks SET spent_ms = spent_ms + ? WHERE id = ?").run(Math.max(0, ms), id);
}
export function setActiveTask(id) {
  const db = getDb();
  db.prepare("UPDATE tasks SET active = 0 WHERE active = 1").run();
  if (id != null) db.prepare("UPDATE tasks SET active = 1 WHERE id = ?").run(id);
}
export function deleteTask(id) {
  const db = getDb();
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  // War die Aufgabe im Timer aktiv, den Zeiger räumen.
  db.prepare("UPDATE timer_state SET active_task_id = NULL WHERE active_task_id = ?").run(id);
}
export function reorderTasks(ids) {
  const stmt = getDb().prepare("UPDATE tasks SET sort_order = ? WHERE id = ?");
  ids.forEach((id, i) => stmt.run(i, id));
}

// ── Subtasks ─────────────────────────────────────
export function createSubtask(taskId, text) {
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM subtasks WHERE task_id = ?").get(taskId).m;
  const info = getDb().prepare(
    "INSERT INTO subtasks (task_id, text, sort_order, created_at) VALUES (?, ?, ?, ?)"
  ).run(taskId, text, max + 1, nowMs());
  return mapSubtask(getDb().prepare("SELECT * FROM subtasks WHERE id = ?").get(Number(info.lastInsertRowid)));
}
export function updateSubtask(id, patch) {
  const cur = getDb().prepare("SELECT * FROM subtasks WHERE id = ?").get(id);
  if (!cur) return null;
  const text = patch.text ?? cur.text;
  const done = patch.done !== undefined ? (patch.done ? 1 : 0) : cur.done;
  getDb().prepare("UPDATE subtasks SET text=?, done=? WHERE id=?").run(text, done, id);
  return mapSubtask(getDb().prepare("SELECT * FROM subtasks WHERE id = ?").get(id));
}
export function deleteSubtask(id) {
  getDb().prepare("DELETE FROM subtasks WHERE id = ?").run(id);
}

// ── Topics (Prüfungs-Themen) ─────────────────────
export function listTopics() {
  return getDb().prepare("SELECT * FROM topics ORDER BY sort_order, id").all().map(mapTopic);
}
export function createTopic(p = {}) {
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM topics").get().m;
  const info = getDb().prepare(
    "INSERT INTO topics (exam_id, text, sort_order, created_at) VALUES (?, ?, ?, ?)"
  ).run(p.examId ?? null, p.text, max + 1, nowMs());
  return mapTopic(getDb().prepare("SELECT * FROM topics WHERE id = ?").get(Number(info.lastInsertRowid)));
}
export function updateTopic(id, patch) {
  const cur = getDb().prepare("SELECT * FROM topics WHERE id = ?").get(id);
  if (!cur) return null;
  const text = patch.text ?? cur.text;
  const done = patch.done !== undefined ? (patch.done ? 1 : 0) : cur.done;
  const examId = patch.examId !== undefined ? patch.examId : cur.exam_id;
  getDb().prepare("UPDATE topics SET text=?, done=?, exam_id=? WHERE id=?").run(text, done, examId, id);
  return mapTopic(getDb().prepare("SELECT * FROM topics WHERE id = ?").get(id));
}
export function deleteTopic(id) {
  getDb().prepare("DELETE FROM topics WHERE id = ?").run(id);
}

// ── Sessions & Tages-Metriken ────────────────────
export function logSession({ taskId = null, phase, startedAt, endedAt, focusMs, completed }) {
  getDb().prepare(`
    INSERT INTO sessions (task_id, phase, started_at, ended_at, focus_ms, completed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(taskId, phase, startedAt, endedAt ?? null, focusMs, completed ? 1 : 0, nowMs());
}
export function addDailyFocus(key, ms, sessionsDone = 0) {
  getDb().prepare(`
    INSERT INTO daily_metrics (day_key, focus_ms, sessions_done) VALUES (?, ?, ?)
    ON CONFLICT(day_key) DO UPDATE SET
      focus_ms = focus_ms + excluded.focus_ms,
      sessions_done = sessions_done + excluded.sessions_done
  `).run(key, Math.max(0, ms), sessionsDone);
}
export function getDailyMetrics(key) {
  const r = getDb().prepare("SELECT * FROM daily_metrics WHERE day_key = ?").get(key);
  return { dayKey: key, focusMs: r?.focus_ms ?? 0, sessionsDone: r?.sessions_done ?? 0 };
}

// Tages-Metriken der letzten `days` Tage als { "YYYY-MM-DD": { focusMs, sessionsDone } }.
export function getRecentMetrics(fromKey) {
  const rows = getDb().prepare("SELECT * FROM daily_metrics WHERE day_key >= ? ORDER BY day_key").all(fromKey);
  const out = {};
  for (const r of rows) out[r.day_key] = { focusMs: r.focus_ms, sessionsDone: r.sessions_done };
  return out;
}

// ── App-Metadaten (Key/Value) ────────────────────
export function getMeta(key) {
  return getDb().prepare("SELECT value FROM app_meta WHERE key = ?").get(key)?.value ?? null;
}
export function setMeta(key, value) {
  getDb().prepare(`
    INSERT INTO app_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

// ── Push-Abonnements ─────────────────────────────
const mapSubscription = (r) => r && ({
  endpoint: r.endpoint,
  keys: { p256dh: r.p256dh, auth: r.auth },
  userAgent: r.user_agent,
  createdAt: r.created_at,
  lastOkAt: r.last_ok_at,
});

export function listSubscriptions() {
  return getDb().prepare("SELECT * FROM push_subscriptions ORDER BY created_at").all().map(mapSubscription);
}
export function countSubscriptions() {
  return getDb().prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get().n;
}
export function saveSubscription({ endpoint, p256dh, auth, userAgent = null }) {
  // Upsert: gleicher Endpunkt aktualisiert Schlüssel (Rotation), statt zu duplizieren.
  getDb().prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
  `).run(endpoint, p256dh, auth, userAgent, nowMs());
  return mapSubscription(getDb().prepare("SELECT * FROM push_subscriptions WHERE endpoint = ?").get(endpoint));
}
export function touchSubscription(endpoint) {
  getDb().prepare("UPDATE push_subscriptions SET last_ok_at = ? WHERE endpoint = ?").run(nowMs(), endpoint);
}
export function deleteSubscription(endpoint) {
  getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}
