// Datenzugriff: mappt SQLite-Zeilen (snake_case) auf JS-Objekte (camelCase).
import { getDb } from "./db.js";
import { nowMs, toBool, httpErr } from "./lib/util.js";
import { DAILY_FIELDS, DAILY_COLS } from "./health/fields.js";

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
const mapNote = (r) => r && ({
  id: r.id, text: r.text, subject: r.subject, examId: r.exam_id,
  pinned: !!r.pinned, sortOrder: r.sort_order,
  createdAt: r.created_at, updatedAt: r.updated_at,
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

// ── Notes (Notizen) ──────────────────────────────
export function listNotes() {
  return getDb().prepare("SELECT * FROM notes ORDER BY pinned DESC, sort_order DESC, created_at DESC")
    .all().map(mapNote);
}
export function getNote(id) {
  return mapNote(getDb().prepare("SELECT * FROM notes WHERE id = ?").get(id));
}
export function createNote(p = {}) {
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM notes").get().m;
  const now = nowMs();
  const info = getDb().prepare(`
    INSERT INTO notes (text, subject, exam_id, pinned, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(p.text, p.subject ?? null, p.examId ?? null, p.pinned ? 1 : 0, max + 1, now, now);
  return getNote(Number(info.lastInsertRowid));
}
export function updateNote(id, patch) {
  const cur = getNote(id);
  if (!cur) return null;
  const text = patch.text !== undefined ? patch.text : cur.text;
  const subject = patch.subject !== undefined ? patch.subject : cur.subject;
  const examId = patch.examId !== undefined ? patch.examId : cur.examId;
  const pinned = patch.pinned !== undefined ? patch.pinned : cur.pinned;
  getDb().prepare("UPDATE notes SET text=?, subject=?, exam_id=?, pinned=?, updated_at=? WHERE id=?")
    .run(text, subject, examId, pinned ? 1 : 0, nowMs(), id);
  return getNote(id);
}
export function deleteNote(id) {
  getDb().prepare("DELETE FROM notes WHERE id = ?").run(id);
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

// ── Profil (Singleton) ───────────────────────────
const mapProfile = (r) => r && ({
  displayName: r.display_name, birthDate: r.birth_date, sex: r.sex,
  heightCm: r.height_cm, weightKg: r.weight_kg, timezone: r.timezone,
  chronotype: r.chronotype, adhd: !!r.adhd, conditions: r.conditions,
  primaryDevice: r.primary_device, sleepGoalHours: r.sleep_goal_hours,
  targetBedtime: r.target_bedtime, targetWakeTime: r.target_wake_time,
  restingHrBaseline: r.resting_hr_baseline, hrvBaselineMs: r.hrv_baseline_ms,
  aiEnabled: !!r.ai_enabled, aiNotes: r.ai_notes,
  dataConsentAt: r.data_consent_at, updatedAt: r.updated_at,
});

// Profil-Felder: key (camelCase) → col (snake_case) + Coercion-Kind.
const PROFILE_FIELDS = [
  ["displayName", "display_name", "text"], ["birthDate", "birth_date", "text"],
  ["sex", "sex", "text"], ["heightCm", "height_cm", "num"], ["weightKg", "weight_kg", "num"],
  ["timezone", "timezone", "text"], ["chronotype", "chronotype", "text"],
  ["adhd", "adhd", "bool"], ["conditions", "conditions", "text"],
  ["primaryDevice", "primary_device", "text"], ["sleepGoalHours", "sleep_goal_hours", "num"],
  ["targetBedtime", "target_bedtime", "text"], ["targetWakeTime", "target_wake_time", "text"],
  ["restingHrBaseline", "resting_hr_baseline", "num"], ["hrvBaselineMs", "hrv_baseline_ms", "num"],
  ["aiEnabled", "ai_enabled", "bool"], ["aiNotes", "ai_notes", "text"],
];

export function getProfile() {
  return mapProfile(getDb().prepare("SELECT * FROM profile WHERE id = 1").get());
}

// Partielles Update: nur mitgeschickte Felder ändern, Rest bleibt bestehen.
export function saveProfile(patch = {}) {
  const sets = [];
  const vals = [];
  for (const [key, col, kind] of PROFILE_FIELDS) {
    if (patch[key] === undefined) continue;
    let v = patch[key];
    // Bool robust coercen: "false"/"0"/0/"" ⇒ false (nicht JS-truthy), damit ein
    // Widerruf (aiEnabled:"false") die Einwilligung wirklich deaktiviert.
    if (kind === "bool") v = toBool(v) ? 1 : 0;
    else if (kind === "num") v = v === null || v === "" ? null : Number(v);
    else v = v === null ? null : String(v);
    if (kind === "num" && v !== null && !Number.isFinite(v)) continue;
    sets.push(`${col} = ?`);
    vals.push(v);
  }
  // Consent-Zeitstempel setzen, sobald KI erstmals AKTIV eingewilligt wird.
  if (patch.aiEnabled !== undefined && toBool(patch.aiEnabled)) {
    sets.push("data_consent_at = COALESCE(data_consent_at, ?)"); vals.push(nowMs());
  }
  sets.push("updated_at = ?");
  vals.push(nowMs());
  getDb().prepare(`UPDATE profile SET ${sets.join(", ")} WHERE id = 1`).run(...vals);
  return getProfile();
}

// ── Health: tägliche Rollups ─────────────────────
const mapDaily = (r, includeRaw = false) => {
  if (!r) return null;
  const out = { dayKey: r.day_key, source: r.source };
  for (const f of DAILY_FIELDS) out[f.key] = r[f.col];
  out.recordedAt = r.recorded_at;
  out.importedAt = r.imported_at;
  out.updatedAt = r.updated_at;
  if (includeRaw && r.raw_json) { try { out.raw = JSON.parse(r.raw_json); } catch { out.raw = null; } }
  return out;
};

// Upsert-SQL einmalig aus der Feld-Spec bauen (Spaltennamen sind statisch/sicher).
const DAILY_INSERT_SQL = (() => {
  const cols = ["day_key", "source", ...DAILY_COLS, "raw_json", "recorded_at", "imported_at", "updated_at"];
  const placeholders = cols.map(() => "?").join(", ");
  const merge = [...DAILY_COLS, "raw_json", "recorded_at"]
    .map((c) => `${c} = COALESCE(excluded.${c}, health_daily.${c})`)
    .join(", ");
  return `INSERT INTO health_daily (${cols.join(", ")}) VALUES (${placeholders})
    ON CONFLICT(day_key, source) DO UPDATE SET ${merge}, updated_at = excluded.updated_at`;
})();

// Einen normalisierten Tagesdatensatz schreiben (neue Werte überschreiben,
// fehlende Felder bleiben erhalten → mehrfacher Teil-Import ist idempotent).
export function upsertDaily({ dayKey, source, cols = {}, raw = null, recordedAt = null } = {}) {
  const now = nowMs();
  const vals = [
    dayKey, source,
    ...DAILY_COLS.map((c) => (cols[c] === undefined ? null : cols[c])),
    raw == null ? null : JSON.stringify(raw),
    recordedAt ?? null, now, now,
  ];
  getDb().prepare(DAILY_INSERT_SQL).run(...vals);
  return getDaily(dayKey, source, true); // Echo inkl. raw an den Aufrufer (hat er selbst geschickt)
}

// includeRaw defaultet auf false: raw_json (sensible Rohdaten) nur auf explizite
// Anforderung ausliefern (Datensparsamkeit).
export function getDaily(dayKey, source, includeRaw = false) {
  const r = getDb().prepare("SELECT * FROM health_daily WHERE day_key = ? AND source = ?").get(dayKey, source);
  return mapDaily(r, includeRaw);
}

// Alle Quellen eines Tages (z. B. RingConn + WHOOP parallel).
export function getDayAllSources(dayKey, includeRaw = false) {
  return getDb().prepare("SELECT * FROM health_daily WHERE day_key = ? ORDER BY source")
    .all(dayKey).map((r) => mapDaily(r, includeRaw));
}

// Bereichsabfrage (ohne raw_json, um große Antworten zu vermeiden).
export function listDaily({ from = null, to = null, source = null, limit = 400 } = {}) {
  const where = [];
  const args = [];
  if (from) { where.push("day_key >= ?"); args.push(from); }
  if (to) { where.push("day_key <= ?"); args.push(to); }
  if (source) { where.push("source = ?"); args.push(source); }
  const sql = `SELECT * FROM health_daily ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY day_key DESC, source LIMIT ?`;
  return getDb().prepare(sql).all(...args, Math.max(1, Math.min(2000, limit))).map((r) => mapDaily(r, false));
}

// Jüngster Tagesdatensatz — optional auf eine Quelle beschränkt.
export function latestDaily(source = null, includeRaw = false) {
  const sql = source
    ? "SELECT * FROM health_daily WHERE source = ? ORDER BY day_key DESC LIMIT 1"
    : "SELECT * FROM health_daily ORDER BY day_key DESC LIMIT 1";
  const r = source ? getDb().prepare(sql).get(source) : getDb().prepare(sql).get();
  return mapDaily(r, includeRaw);
}

// Letzte `n` Tage einer Quelle, absteigend — Eingabe für den Health-Kontext.
export function recentDaily(source, n = 14) {
  return getDb().prepare("SELECT * FROM health_daily WHERE source = ? ORDER BY day_key DESC LIMIT ?")
    .all(source, Math.max(1, Math.min(90, n))).map((r) => mapDaily(r, false));
}

// Welche Quelle liefert die Kontextbasis? Bevorzugt profile.primaryDevice,
// fällt sonst auf die Quelle mit den jüngsten Daten zurück. Das Profil kann
// durchgereicht werden, um einen doppelten getProfile()-Query zu sparen.
export function resolveContextSource(profile = null) {
  const prof = profile || getProfile();
  const preferred = prof?.primaryDevice || "ringconn";
  const hasPreferred = getDb().prepare("SELECT 1 FROM health_daily WHERE source = ? LIMIT 1").get(preferred);
  if (hasPreferred) return preferred;
  const any = getDb().prepare("SELECT source FROM health_daily ORDER BY day_key DESC LIMIT 1").get();
  return any?.source ?? preferred;
}

export function deleteDaily(dayKey, source = null) {
  if (source) getDb().prepare("DELETE FROM health_daily WHERE day_key = ? AND source = ?").run(dayKey, source);
  else getDb().prepare("DELETE FROM health_daily WHERE day_key = ?").run(dayKey);
}

// ── Health: Intraday-Samples ─────────────────────
export const MAX_SAMPLES_PER_CALL = 20000;

export function insertSamples(samples = []) {
  if (!samples.length) return 0;
  if (samples.length > MAX_SAMPLES_PER_CALL) {
    throw httpErr(413, `Zu viele Samples pro Anfrage (max. ${MAX_SAMPLES_PER_CALL})`);
  }
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO health_samples (source, metric, t, value, unit) VALUES (?, ?, ?, ?, ?)"
  );
  // Eine Transaktion: atomar und deutlich schneller als N Einzel-Commits.
  db.exec("BEGIN");
  try {
    let n = 0;
    for (const s of samples) { stmt.run(s.source, s.metric, s.t, s.value, s.unit ?? null); n++; }
    db.exec("COMMIT");
    return n;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function listSamples({ metric = null, from = null, to = null, limit = 2000 } = {}) {
  const where = [];
  const args = [];
  if (metric) { where.push("metric = ?"); args.push(metric); }
  if (from != null) { where.push("t >= ?"); args.push(from); }
  if (to != null) { where.push("t <= ?"); args.push(to); }
  const sql = `SELECT source, metric, t, value, unit FROM health_samples
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY t DESC LIMIT ?`;
  return getDb().prepare(sql).all(...args, Math.max(1, Math.min(10000, limit)));
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
