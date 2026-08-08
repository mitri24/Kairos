// Datenzugriff: mappt SQLite-Zeilen (snake_case) auf JS-Objekte (camelCase).
// MULTI-TENANT: jede per-Nutzer-Query ist über currentUserId() (AsyncLocalStorage)
// skopiert. Ohne aktiven Nutzerkontext wirft currentUserId() 401 — fail-closed,
// damit keine Query versehentlich mandantenübergreifend läuft. app_meta (VAPID,
// schema_version) bleibt global.
import { getDb } from "./db.js";
import { nowMs, toBool, httpErr } from "./lib/util.js";
import { currentUserId } from "./authctx.js";
import { DAILY_FIELDS, DAILY_COLS } from "./health/fields.js";

const uid = () => currentUserId();

// Legt die Singleton-Zeilen (settings/timer_state/profile) für einen Nutzer an,
// falls noch nicht vorhanden. Vom Request-Dispatcher nach dem Login aufgerufen.
export function ensureUser(userId) {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO settings (user_id) VALUES (?)").run(userId);
  db.prepare("INSERT OR IGNORE INTO timer_state (user_id, remaining_ms) VALUES (?, 1500000)").run(userId);
  db.prepare("INSERT OR IGNORE INTO profile (user_id) VALUES (?)").run(userId);
}

// Nutzer mit laufendem Timer — Eingabe für die (nutzerübergreifende) Tick-Schleife.
export function runningTimerUserIds() {
  // Laufende Timer ODER pausierter Fokus mit offener Pausen-Overrun-Uhr (Nudge).
  return getDb().prepare(
    "SELECT user_id FROM timer_state WHERE (status = 'running' AND ends_at IS NOT NULL) OR break_over_since IS NOT NULL"
  ).all().map((r) => r.user_id);
}

// ── Mapper ───────────────────────────────────────
const mapExam = (r) => r && ({
  id: r.id, name: r.name, date: r.exam_date, totalHours: r.total_hours,
  color: r.color, archived: !!r.archived, archivedAt: r.archived_at,
  sortOrder: r.sort_order, createdAt: r.created_at,
});
const mapTask = (r) => r && ({
  id: r.id, examId: r.exam_id, text: r.text, subject: r.subject,
  priority: r.priority, dueDate: r.due_date, plannedDate: r.planned_date,
  estMinutes: r.est_minutes, scheduledMin: r.scheduled_min,
  done: !!r.done, doneAt: r.done_at, spentMs: r.spent_ms, active: !!r.active,
  sortOrder: r.sort_order, createdAt: r.created_at,
  recurrence: r.recurrence || "", recurParentId: r.recur_parent_id ?? null,
  postponeCount: r.postpone_count ?? 0,
  difficulty: r.difficulty ?? 2, topicId: r.topic_id ?? null,
  room: r.room ?? null, location: r.location ?? null, mapsUrl: r.maps_url ?? null,
  schedSource: r.sched_source ?? null,
  remindFor: r.remind_for ?? null, remindStage: r.remind_stage ?? 0,
  subtasks: [], dependsOn: [],
});
const mapSubtask = (r) => r && ({
  id: r.id, taskId: r.task_id, text: r.text, done: !!r.done,
  sortOrder: r.sort_order, createdAt: r.created_at,
});
const mapTopic = (r) => r && ({
  id: r.id, examId: r.exam_id, text: r.text, done: !!r.done, confidence: r.confidence ?? 0,
  sortOrder: r.sort_order, createdAt: r.created_at,
});
const mapNote = (r) => r && ({
  id: r.id, title: r.title ?? null, text: r.text, subject: r.subject, examId: r.exam_id,
  pinned: !!r.pinned, sortOrder: r.sort_order,
  createdAt: r.created_at, updatedAt: r.updated_at,
});
const mapNavNode = (r) => r && ({
  id: r.id, parentId: r.parent_id ?? null, name: r.name, kind: r.kind,
  view: r.view_key ?? null, examId: r.exam_id ?? null,
  sortOrder: r.sort_order, createdAt: r.created_at,
});

// ── Eigene Sidebar-Struktur ─────────────────────
export function listNavNodes() {
  return getDb().prepare("SELECT * FROM nav_nodes WHERE user_id = ? ORDER BY sort_order, id").all(uid()).map(mapNavNode);
}
export function getNavNode(id) {
  return mapNavNode(getDb().prepare("SELECT * FROM nav_nodes WHERE id = ? AND user_id = ?").get(id, uid()));
}
export function createNavNode({ parentId = null, name, kind = "folder", view = null, examId = null } = {}) {
  const u = uid();
  if (parentId != null) {
    const parent = getNavNode(parentId);
    if (!parent || parent.kind !== "folder") throw httpErr(400, "Zielordner existiert nicht");
  }
  if (kind === "exam" && !getExam(examId)) throw httpErr(400, "Prüfung existiert nicht");
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM nav_nodes WHERE user_id = ? AND parent_id IS ?").get(u, parentId).m;
  const info = getDb().prepare(`INSERT INTO nav_nodes
    (user_id,parent_id,name,kind,view_key,exam_id,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(u, parentId, name, kind, kind === "view" ? view : null, kind === "exam" ? examId : null, max + 1, nowMs());
  return getNavNode(Number(info.lastInsertRowid));
}
export function updateNavNode(id, patch = {}) {
  const cur = getNavNode(id);
  if (!cur) return null;
  const parentId = patch.parentId !== undefined ? patch.parentId : cur.parentId;
  if (parentId === id) throw httpErr(400, "Ein Ordner kann nicht in sich selbst liegen");
  if (parentId != null) {
    const parent = getNavNode(parentId);
    if (!parent || parent.kind !== "folder") throw httpErr(400, "Zielordner existiert nicht");
    // Zyklusprüfung: vom neuen Elternknoten nach oben laufen.
    let p = parent;
    while (p) {
      if (p.id === id) throw httpErr(400, "Ordner-Zyklus nicht erlaubt");
      p = p.parentId == null ? null : getNavNode(p.parentId);
    }
  }
  const name = patch.name !== undefined ? patch.name : cur.name;
  getDb().prepare("UPDATE nav_nodes SET name=?, parent_id=?, sort_order=? WHERE id=? AND user_id=?")
    .run(name, parentId, patch.sortOrder ?? cur.sortOrder, id, uid());
  return getNavNode(id);
}
export function deleteNavNode(id) {
  getDb().prepare("DELETE FROM nav_nodes WHERE id = ? AND user_id = ?").run(id, uid());
}

// ── Settings (pro Nutzer) ────────────────────────
export function getSettingsRow() {
  return getDb().prepare("SELECT * FROM settings WHERE user_id = ?").get(uid());
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
    dndEnabled: !!r.dnd_enabled,
    dndStartMin: r.dnd_start_min ?? null,
    dndEndMin: r.dnd_end_min ?? null,
    remindTasks: r.remind_tasks == null ? true : !!r.remind_tasks,
    remindLeadMin: r.remind_lead_min ?? 10,
  };
}
export function saveSettings(s) {
  getDb().prepare(`
    UPDATE settings SET
      focus_minutes = ?, short_break_minutes = ?, long_break_minutes = ?,
      cycles_until_long_break = ?, auto_start_next_phase = ?, today_goal_hours = ?,
      profile_name = ?, active_exam_id = ?, dnd_enabled = ?, dnd_start_min = ?, dnd_end_min = ?,
      remind_tasks = ?, remind_lead_min = ?
    WHERE user_id = ?
  `).run(
    s.focusMinutes, s.shortBreakMinutes, s.longBreakMinutes,
    s.cyclesUntilLongBreak, s.autoStartNextPhase ? 1 : 0, s.todayGoalHours,
    s.profileName, s.activeExamId ?? null,
    s.dndEnabled ? 1 : 0, s.dndStartMin ?? null, s.dndEndMin ?? null,
    s.remindTasks === false ? 0 : 1, s.remindLeadMin ?? 10, uid(),
  );
  return getSettings();
}

// ── Timer-State (pro Nutzer) ─────────────────────
export function getTimerRow() {
  return getDb().prepare("SELECT * FROM timer_state WHERE user_id = ?").get(uid());
}
export function getTimerState() {
  const r = getTimerRow();
  return {
    status: r.status, phase: r.phase, cycleInBlock: r.cycle_in_block,
    remainingMs: r.remaining_ms, endsAt: r.ends_at, activeTaskId: r.active_task_id,
    phaseStartedAt: r.phase_started_at, updatedAt: r.updated_at,
    breakOverSince: r.break_over_since ?? null, breakOverNotified: r.break_over_notified ?? 0,
  };
}
export function saveTimerState(t) {
  // break_over_since/notified fließen über den Domain-Spread (...state) mit durch und
  // werden hier persistiert; die Timer-Engine setzt/räumt sie an den passenden Stellen.
  getDb().prepare(`
    UPDATE timer_state SET
      status = ?, phase = ?, cycle_in_block = ?, remaining_ms = ?,
      ends_at = ?, active_task_id = ?, phase_started_at = ?, updated_at = ?,
      break_over_since = ?, break_over_notified = ?
    WHERE user_id = ?
  `).run(
    t.status, t.phase, t.cycleInBlock, t.remainingMs,
    t.endsAt ?? null, t.activeTaskId ?? null, t.phaseStartedAt ?? null, t.updatedAt,
    t.breakOverSince ?? null, t.breakOverNotified ?? 0, uid(),
  );
  return getTimerState();
}

// ── Exams ────────────────────────────────────────
export function listExams() {
  return getDb().prepare("SELECT * FROM exams WHERE user_id = ? ORDER BY sort_order, id").all(uid()).map(mapExam);
}
export function getExam(id) {
  return mapExam(getDb().prepare("SELECT * FROM exams WHERE id = ? AND user_id = ?").get(id, uid()));
}
export function createExam({ name = "Prüfung", date = null, totalHours = 0, color = null } = {}) {
  const u = uid();
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM exams WHERE user_id = ?").get(u).m;
  const info = getDb().prepare(`
    INSERT INTO exams (user_id, name, exam_date, total_hours, color, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(u, name, date, totalHours, color, max + 1, nowMs());
  return getExam(Number(info.lastInsertRowid));
}
export function updateExam(id, patch) {
  const cur = getExam(id);
  if (!cur) return null;
  const name = patch.name ?? cur.name;
  const date = patch.date !== undefined ? patch.date : cur.date;
  const totalHours = patch.totalHours !== undefined ? patch.totalHours : cur.totalHours;
  const color = patch.color !== undefined ? patch.color : cur.color;
  const archived = patch.archived !== undefined ? (patch.archived ? 1 : 0) : (cur.archived ? 1 : 0);
  const archivedAt = patch.archived !== undefined ? (patch.archived ? (cur.archivedAt ?? nowMs()) : null) : (cur.archivedAt ?? null);
  getDb().prepare("UPDATE exams SET name=?, exam_date=?, total_hours=?, color=?, archived=?, archived_at=? WHERE id=? AND user_id=?")
    .run(name, date, totalHours, color, archived, archivedAt, id, uid());
  return getExam(id);
}
export function deleteExam(id) {
  const db = getDb();
  const u = uid();
  db.prepare("DELETE FROM exams WHERE id = ? AND user_id = ?").run(id, u);
  // Verwaisten Zeiger in den Settings räumen (sonst danglt activeExamId).
  db.prepare("UPDATE settings SET active_exam_id = NULL WHERE active_exam_id = ? AND user_id = ?").run(id, u);
}

// ── Tasks ────────────────────────────────────────
export function listTasks() {
  const u = uid();
  const tasks = getDb().prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY sort_order, id").all(u).map(mapTask);
  const subs = getDb().prepare("SELECT * FROM subtasks WHERE user_id = ? ORDER BY sort_order, id").all(u).map(mapSubtask);
  const byTask = new Map();
  for (const t of tasks) byTask.set(t.id, t);
  for (const s of subs) byTask.get(s.taskId)?.subtasks.push(s);
  // Abhängigkeiten anreichern (t hängt an dependsOn — erst Grundlage, dann Vertiefung).
  for (const d of getDb().prepare("SELECT task_id, depends_on_id FROM task_deps WHERE user_id = ?").all(u)) {
    byTask.get(d.task_id)?.dependsOn.push(d.depends_on_id);
  }
  return tasks;
}
export function getTask(id) {
  const u = uid();
  const t = mapTask(getDb().prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, u));
  if (!t) return null;
  t.subtasks = getDb().prepare("SELECT * FROM subtasks WHERE task_id = ? AND user_id = ? ORDER BY sort_order, id")
    .all(id, u).map(mapSubtask);
  return t;
}
export function createTask(p = {}) {
  const u = uid();
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM tasks WHERE user_id = ?").get(u).m;
  const info = getDb().prepare(`
    INSERT INTO tasks (user_id, exam_id, text, subject, priority, due_date, planned_date, est_minutes, scheduled_min, sort_order, created_at, recurrence, recur_parent_id, difficulty, topic_id, sched_source, room, location, maps_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    u, p.examId ?? null, p.text, p.subject ?? null, p.priority ?? 2,
    p.dueDate ?? null, p.plannedDate ?? null, p.estMinutes ?? 25,
    p.scheduledMin ?? null, max + 1, nowMs(),
    p.recurrence || null, p.recurParentId ?? null,
    p.difficulty ?? 2, p.topicId ?? null,
    p.schedSource ?? (p.scheduledMin != null ? "user" : null),
    p.room ?? null, p.location ?? null, p.mapsUrl ?? null,
  );
  return getTask(Number(info.lastInsertRowid));
}
export function updateTask(id, patch) {
  const cur = getTask(id);
  if (!cur) return null;
  const f = (k) => (patch[k] !== undefined ? patch[k] : cur[k]);
  const done = patch.done !== undefined ? patch.done : cur.done;
  const doneAt = patch.done !== undefined ? (patch.done ? (cur.doneAt ?? nowMs()) : null) : cur.doneAt;
  // recur_parent_id + postpone_count werden hier NICHT geschrieben → bleiben erhalten
  // (postpone_count nur über incrementPostpone, recur_parent_id nur bei createTask).
  // sched_source: Zeitänderung ohne expliziten Absender gilt als Nutzer-Entscheidung.
  const schedSource = patch.schedSource !== undefined ? patch.schedSource
    : (patch.scheduledMin !== undefined ? (patch.scheduledMin == null ? null : "user") : cur.schedSource);
  getDb().prepare(`
    UPDATE tasks SET exam_id=?, text=?, subject=?, priority=?, due_date=?, planned_date=?, est_minutes=?,
      scheduled_min=?, done=?, done_at=?, spent_ms=?, active=?, sort_order=?, recurrence=?,
      difficulty=?, topic_id=?, sched_source=?, room=?, location=?, maps_url=? WHERE id=? AND user_id=?
  `).run(
    f("examId"), f("text"), f("subject"), f("priority"), f("dueDate"), f("plannedDate"), f("estMinutes"),
    f("scheduledMin"), done ? 1 : 0, doneAt, f("spentMs"), f("active") ? 1 : 0, f("sortOrder"),
    (f("recurrence") || null),
    f("difficulty") ?? 2, f("topicId"), schedSource, f("room"), f("location"), f("mapsUrl"), id, uid(),
  );
  return getTask(id);
}
// Verschiebe-Zähler erhöhen (Tomorrow / Reschedule / „keine Zeit mehr"). Konzentration-Signal.
export function incrementPostpone(id) {
  getDb().prepare("UPDATE tasks SET postpone_count = postpone_count + 1 WHERE id = ? AND user_id = ?").run(id, uid());
}
export function addTaskSpent(id, ms) {
  if (!ms) return;
  getDb().prepare("UPDATE tasks SET spent_ms = spent_ms + ? WHERE id = ? AND user_id = ?").run(Math.max(0, ms), id, uid());
}
export function setActiveTask(id) {
  const db = getDb();
  const u = uid();
  db.prepare("UPDATE tasks SET active = 0 WHERE active = 1 AND user_id = ?").run(u);
  if (id != null) db.prepare("UPDATE tasks SET active = 1 WHERE id = ? AND user_id = ?").run(id, u);
}
export function deleteTask(id) {
  const db = getDb();
  const u = uid();
  db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, u);
  db.prepare("UPDATE timer_state SET active_task_id = NULL WHERE active_task_id = ? AND user_id = ?").run(id, u);
}
export function reorderTasks(ids) {
  const u = uid();
  const stmt = getDb().prepare("UPDATE tasks SET sort_order = ? WHERE id = ? AND user_id = ?");
  ids.forEach((id, i) => stmt.run(i, id, u));
}

// ── Subtasks (scope: user_id + Eltern-Task-Besitz) ──
export function createSubtask(taskId, text) {
  const u = uid();
  const owns = getDb().prepare("SELECT 1 FROM tasks WHERE id = ? AND user_id = ?").get(taskId, u);
  if (!owns) throw httpErr(404, "Aufgabe nicht gefunden");
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM subtasks WHERE task_id = ? AND user_id = ?").get(taskId, u).m;
  const info = getDb().prepare(
    "INSERT INTO subtasks (user_id, task_id, text, sort_order, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(u, taskId, text, max + 1, nowMs());
  return mapSubtask(getDb().prepare("SELECT * FROM subtasks WHERE id = ?").get(Number(info.lastInsertRowid)));
}
export function updateSubtask(id, patch) {
  const u = uid();
  const cur = getDb().prepare("SELECT * FROM subtasks WHERE id = ? AND user_id = ?").get(id, u);
  if (!cur) return null;
  const text = patch.text ?? cur.text;
  const done = patch.done !== undefined ? (patch.done ? 1 : 0) : cur.done;
  getDb().prepare("UPDATE subtasks SET text=?, done=? WHERE id=? AND user_id=?").run(text, done, id, u);
  return mapSubtask(getDb().prepare("SELECT * FROM subtasks WHERE id = ?").get(id));
}
export function deleteSubtask(id) {
  getDb().prepare("DELETE FROM subtasks WHERE id = ? AND user_id = ?").run(id, uid());
}

// ── Topics (Prüfungs-Themen) ─────────────────────
export function listTopics() {
  return getDb().prepare("SELECT * FROM topics WHERE user_id = ? ORDER BY sort_order, id").all(uid()).map(mapTopic);
}
export function createTopic(p = {}) {
  const u = uid();
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM topics WHERE user_id = ?").get(u).m;
  const info = getDb().prepare(
    "INSERT INTO topics (user_id, exam_id, text, sort_order, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(u, p.examId ?? null, p.text, max + 1, nowMs());
  return mapTopic(getDb().prepare("SELECT * FROM topics WHERE id = ?").get(Number(info.lastInsertRowid)));
}
export function updateTopic(id, patch) {
  const u = uid();
  const cur = getDb().prepare("SELECT * FROM topics WHERE id = ? AND user_id = ?").get(id, u);
  if (!cur) return null;
  const text = patch.text ?? cur.text;
  const done = patch.done !== undefined ? (patch.done ? 1 : 0) : cur.done;
  const examId = patch.examId !== undefined ? patch.examId : cur.exam_id;
  const confidence = patch.confidence !== undefined ? Math.max(0, Math.min(3, Number(patch.confidence) || 0)) : (cur.confidence ?? 0);
  getDb().prepare("UPDATE topics SET text=?, done=?, confidence=?, exam_id=? WHERE id=? AND user_id=?").run(text, done, confidence, examId, id, u);
  return mapTopic(getDb().prepare("SELECT * FROM topics WHERE id = ?").get(id));
}
export function deleteTopic(id) {
  getDb().prepare("DELETE FROM topics WHERE id = ? AND user_id = ?").run(id, uid());
}

// ── Notes (Notizen) ──────────────────────────────
export function listNotes() {
  return getDb().prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, sort_order DESC, created_at DESC")
    .all(uid()).map(mapNote);
}
export function getNote(id) {
  return mapNote(getDb().prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?").get(id, uid()));
}
export function createNote(p = {}) {
  const u = uid();
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM notes WHERE user_id = ?").get(u).m;
  const now = nowMs();
  const info = getDb().prepare(`
    INSERT INTO notes (user_id, title, text, subject, exam_id, pinned, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(u, p.title ?? null, p.text, p.subject ?? null, p.examId ?? null, p.pinned ? 1 : 0, max + 1, now, now);
  return getNote(Number(info.lastInsertRowid));
}
export function updateNote(id, patch) {
  const cur = getNote(id);
  if (!cur) return null;
  const title = patch.title !== undefined ? patch.title : cur.title;
  const text = patch.text !== undefined ? patch.text : cur.text;
  const subject = patch.subject !== undefined ? patch.subject : cur.subject;
  const examId = patch.examId !== undefined ? patch.examId : cur.examId;
  const pinned = patch.pinned !== undefined ? patch.pinned : cur.pinned;
  getDb().prepare("UPDATE notes SET title=?, text=?, subject=?, exam_id=?, pinned=?, updated_at=? WHERE id=? AND user_id=?")
    .run(title, text, subject, examId, pinned ? 1 : 0, nowMs(), id, uid());
  return getNote(id);
}
export function deleteNote(id) {
  const u = uid();
  // Anhänge gehören zum Dokument, nicht zur Bibliothek — sie gehen mit.
  // (Von Hand statt per FK-CASCADE: die Spalte kam per ALTER TABLE dazu.)
  getDb().prepare("DELETE FROM materials WHERE note_id = ? AND user_id = ?").run(id, u);
  getDb().prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").run(id, u);
}

// ── Resources (Lern-Links / Hand-off zu externen Seiten) ──
const mapResource = (r) => r && ({
  id: r.id, topicId: r.topic_id, taskId: r.task_id, title: r.title, url: r.url,
  kind: r.kind, notes: r.notes ?? null, isPrimary: !!r.is_primary,
  sortOrder: r.sort_order, createdAt: r.created_at,
});
export function listResources() {
  return getDb().prepare("SELECT * FROM resources WHERE user_id = ? ORDER BY is_primary DESC, sort_order, id").all(uid()).map(mapResource);
}
export function getResource(id) {
  return mapResource(getDb().prepare("SELECT * FROM resources WHERE id = ? AND user_id = ?").get(id, uid()));
}
export function createResource({ topicId = null, taskId = null, title, url, kind = null, notes = null, isPrimary = false } = {}) {
  const u = uid();
  const scopeCol = topicId != null ? "topic_id" : "task_id";
  const scopeId = topicId != null ? topicId : taskId;
  const max = getDb().prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM resources WHERE ${scopeCol} = ? AND user_id = ?`).get(scopeId, u).m;
  const info = getDb().prepare(`
    INSERT INTO resources (user_id, topic_id, task_id, title, url, kind, notes, is_primary, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(u, topicId, taskId, title, url, kind, notes, isPrimary ? 1 : 0, max + 1, nowMs());
  return getResource(Number(info.lastInsertRowid));
}
export function updateResource(id, patch) {
  const cur = getResource(id);
  if (!cur) return null;
  const title = patch.title !== undefined ? patch.title : cur.title;
  const url = patch.url !== undefined ? patch.url : cur.url;
  const kind = patch.kind !== undefined ? patch.kind : cur.kind;
  const notes = patch.notes !== undefined ? patch.notes : cur.notes;
  const isPrimary = patch.isPrimary !== undefined ? (patch.isPrimary ? 1 : 0) : (cur.isPrimary ? 1 : 0);
  const sortOrder = patch.sortOrder !== undefined ? patch.sortOrder : cur.sortOrder;
  // „Primär" ist exklusiv je Bezug (Task/Topic): andere zurücksetzen.
  if (patch.isPrimary && isPrimary) {
    const col = cur.topicId != null ? "topic_id" : "task_id";
    const scopeId = cur.topicId != null ? cur.topicId : cur.taskId;
    getDb().prepare(`UPDATE resources SET is_primary = 0 WHERE ${col} = ? AND user_id = ? AND id != ?`).run(scopeId, uid(), id);
  }
  getDb().prepare("UPDATE resources SET title=?, url=?, kind=?, notes=?, is_primary=?, sort_order=? WHERE id=? AND user_id=?")
    .run(title, url, kind, notes, isPrimary, sortOrder, id, uid());
  return getResource(id);
}
export function deleteResource(id) {
  getDb().prepare("DELETE FROM resources WHERE id = ? AND user_id = ?").run(id, uid());
}

// ── Sessions & Tages-Metriken (pro Nutzer) ───────
export function logSession({ taskId = null, phase, startedAt, endedAt, focusMs, completed }) {
  getDb().prepare(`
    INSERT INTO sessions (user_id, task_id, phase, started_at, ended_at, focus_ms, completed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uid(), taskId, phase, startedAt, endedAt ?? null, focusMs, completed ? 1 : 0, nowMs());
}
export function addDailyFocus(key, ms, sessionsDone = 0) {
  getDb().prepare(`
    INSERT INTO daily_metrics (user_id, day_key, focus_ms, sessions_done) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, day_key) DO UPDATE SET
      focus_ms = focus_ms + excluded.focus_ms,
      sessions_done = sessions_done + excluded.sessions_done
  `).run(uid(), key, Math.max(0, ms), sessionsDone);
}
export function getDailyMetrics(key) {
  const r = getDb().prepare("SELECT * FROM daily_metrics WHERE day_key = ? AND user_id = ?").get(key, uid());
  return { dayKey: key, focusMs: r?.focus_ms ?? 0, sessionsDone: r?.sessions_done ?? 0 };
}
// Tages-Metriken der letzten Tage als { "YYYY-MM-DD": { focusMs, sessionsDone } }.
export function getRecentMetrics(fromKey) {
  const rows = getDb().prepare("SELECT * FROM daily_metrics WHERE day_key >= ? AND user_id = ? ORDER BY day_key").all(fromKey, uid());
  const out = {};
  for (const r of rows) out[r.day_key] = { focusMs: r.focus_ms, sessionsDone: r.sessions_done };
  return out;
}
// Jüngste Fokus-Session des Nutzers (Post-Session-Review: Ist-Dauer statt Soll).
export function lastFocusSession() {
  const r = getDb().prepare(
    "SELECT task_id, phase, started_at, ended_at, focus_ms, completed FROM sessions WHERE user_id = ? AND phase = 'focus' ORDER BY id DESC LIMIT 1"
  ).get(uid());
  return r && { taskId: r.task_id, phase: r.phase, startedAt: r.started_at, endedAt: r.ended_at, focusMs: r.focus_ms, completed: !!r.completed };
}

// Roh-Sessions eines Zeitraums (für Insights-Aggregate wie Fokus je Stunde).
export function listSessions({ from = null, to = null, phase = "focus", limit = 5000 } = {}) {
  const where = ["user_id = ?"];
  const args = [uid()];
  if (phase) { where.push("phase = ?"); args.push(phase); }
  if (from != null) { where.push("started_at >= ?"); args.push(from); }
  if (to != null) { where.push("started_at <= ?"); args.push(to); }
  const sql = `SELECT task_id, phase, started_at, ended_at, focus_ms, completed FROM sessions
    WHERE ${where.join(" AND ")} ORDER BY started_at DESC LIMIT ?`;
  return getDb().prepare(sql).all(...args, Math.max(1, Math.min(20000, limit)));
}

// ── App-Metadaten (Key/Value) — GLOBAL (kein Nutzer-Scope) ──
export function getMeta(key) {
  return getDb().prepare("SELECT value FROM app_meta WHERE key = ?").get(key)?.value ?? null;
}
export function setMeta(key, value) {
  getDb().prepare(`
    INSERT INTO app_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

// ── Profil (pro Nutzer) ──────────────────────────
const mapProfile = (r) => r && ({
  displayName: r.display_name, birthDate: r.birth_date, sex: r.sex,
  heightCm: r.height_cm, weightKg: r.weight_kg, timezone: r.timezone,
  chronotype: r.chronotype, focus: !!r.focus, conditions: r.conditions,
  primaryDevice: r.primary_device, sleepGoalHours: r.sleep_goal_hours,
  targetBedtime: r.target_bedtime, targetWakeTime: r.target_wake_time,
  restingHrBaseline: r.resting_hr_baseline, hrvBaselineMs: r.hrv_baseline_ms,
  aiEnabled: !!r.ai_enabled, aiNotes: r.ai_notes,
  dataConsentAt: r.data_consent_at, updatedAt: r.updated_at,
});

const PROFILE_FIELDS = [
  ["displayName", "display_name", "text"], ["birthDate", "birth_date", "text"],
  ["sex", "sex", "text"], ["heightCm", "height_cm", "num"], ["weightKg", "weight_kg", "num"],
  ["timezone", "timezone", "text"], ["chronotype", "chronotype", "text"],
  ["focus", "focus", "bool"], ["conditions", "conditions", "text"],
  ["primaryDevice", "primary_device", "text"], ["sleepGoalHours", "sleep_goal_hours", "num"],
  ["targetBedtime", "target_bedtime", "text"], ["targetWakeTime", "target_wake_time", "text"],
  ["restingHrBaseline", "resting_hr_baseline", "num"], ["hrvBaselineMs", "hrv_baseline_ms", "num"],
  ["aiEnabled", "ai_enabled", "bool"], ["aiNotes", "ai_notes", "text"],
];

export function getProfile() {
  return mapProfile(getDb().prepare("SELECT * FROM profile WHERE user_id = ?").get(uid()));
}
export function saveProfile(patch = {}) {
  const sets = [];
  const vals = [];
  for (const [key, col, kind] of PROFILE_FIELDS) {
    if (patch[key] === undefined) continue;
    let v = patch[key];
    if (kind === "bool") v = toBool(v) ? 1 : 0;
    else if (kind === "num") v = v === null || v === "" ? null : Number(v);
    else v = v === null ? null : String(v);
    if (kind === "num" && v !== null && !Number.isFinite(v)) continue;
    sets.push(`${col} = ?`);
    vals.push(v);
  }
  if (patch.aiEnabled !== undefined && toBool(patch.aiEnabled)) {
    sets.push("data_consent_at = COALESCE(data_consent_at, ?)"); vals.push(nowMs());
  }
  sets.push("updated_at = ?");
  vals.push(nowMs());
  getDb().prepare(`UPDATE profile SET ${sets.join(", ")} WHERE user_id = ?`).run(...vals, uid());
  return getProfile();
}

// ── Health: tägliche Rollups (pro Nutzer) ────────
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

const DAILY_INSERT_SQL = (() => {
  const cols = ["user_id", "day_key", "source", ...DAILY_COLS, "raw_json", "recorded_at", "imported_at", "updated_at"];
  const placeholders = cols.map(() => "?").join(", ");
  const merge = [...DAILY_COLS, "raw_json", "recorded_at"]
    .map((c) => `${c} = COALESCE(excluded.${c}, health_daily.${c})`)
    .join(", ");
  return `INSERT INTO health_daily (${cols.join(", ")}) VALUES (${placeholders})
    ON CONFLICT(user_id, day_key, source) DO UPDATE SET ${merge}, updated_at = excluded.updated_at`;
})();

export function upsertDaily({ dayKey, source, cols = {}, raw = null, recordedAt = null } = {}) {
  const now = nowMs();
  const vals = [
    uid(), dayKey, source,
    ...DAILY_COLS.map((c) => (cols[c] === undefined ? null : cols[c])),
    raw == null ? null : JSON.stringify(raw),
    recordedAt ?? null, now, now,
  ];
  getDb().prepare(DAILY_INSERT_SQL).run(...vals);
  return getDaily(dayKey, source, true);
}
export function getDaily(dayKey, source, includeRaw = false) {
  const r = getDb().prepare("SELECT * FROM health_daily WHERE day_key = ? AND source = ? AND user_id = ?").get(dayKey, source, uid());
  return mapDaily(r, includeRaw);
}
export function getDayAllSources(dayKey, includeRaw = false) {
  return getDb().prepare("SELECT * FROM health_daily WHERE day_key = ? AND user_id = ? ORDER BY source")
    .all(dayKey, uid()).map((r) => mapDaily(r, includeRaw));
}
export function listDaily({ from = null, to = null, source = null, limit = 400 } = {}) {
  const where = ["user_id = ?"];
  const args = [uid()];
  if (from) { where.push("day_key >= ?"); args.push(from); }
  if (to) { where.push("day_key <= ?"); args.push(to); }
  if (source) { where.push("source = ?"); args.push(source); }
  const sql = `SELECT * FROM health_daily WHERE ${where.join(" AND ")}
    ORDER BY day_key DESC, source LIMIT ?`;
  return getDb().prepare(sql).all(...args, Math.max(1, Math.min(2000, limit))).map((r) => mapDaily(r, false));
}
export function latestDaily(source = null, includeRaw = false) {
  const u = uid();
  const sql = source
    ? "SELECT * FROM health_daily WHERE source = ? AND user_id = ? ORDER BY day_key DESC LIMIT 1"
    : "SELECT * FROM health_daily WHERE user_id = ? ORDER BY day_key DESC LIMIT 1";
  const r = source ? getDb().prepare(sql).get(source, u) : getDb().prepare(sql).get(u);
  return mapDaily(r, includeRaw);
}
export function recentDaily(source, n = 14) {
  return getDb().prepare("SELECT * FROM health_daily WHERE source = ? AND user_id = ? ORDER BY day_key DESC LIMIT ?")
    .all(source, uid(), Math.max(1, Math.min(90, n))).map((r) => mapDaily(r, false));
}
export function resolveContextSource(profile = null) {
  const u = uid();
  const prof = profile || getProfile();
  const preferred = prof?.primaryDevice || "ringconn";
  const hasPreferred = getDb().prepare("SELECT 1 FROM health_daily WHERE source = ? AND user_id = ? LIMIT 1").get(preferred, u);
  if (hasPreferred) return preferred;
  const any = getDb().prepare("SELECT source FROM health_daily WHERE user_id = ? ORDER BY day_key DESC LIMIT 1").get(u);
  return any?.source ?? preferred;
}
export function deleteDaily(dayKey, source = null) {
  const u = uid();
  if (source) getDb().prepare("DELETE FROM health_daily WHERE day_key = ? AND source = ? AND user_id = ?").run(dayKey, source, u);
  else getDb().prepare("DELETE FROM health_daily WHERE day_key = ? AND user_id = ?").run(dayKey, u);
}

// ── Health: Intraday-Samples (pro Nutzer) ────────
export const MAX_SAMPLES_PER_CALL = 20000;
export function insertSamples(samples = []) {
  if (!samples.length) return 0;
  if (samples.length > MAX_SAMPLES_PER_CALL) {
    throw httpErr(413, `Zu viele Samples pro Anfrage (max. ${MAX_SAMPLES_PER_CALL})`);
  }
  const db = getDb();
  const u = uid();
  const stmt = db.prepare(
    "INSERT INTO health_samples (user_id, source, metric, t, value, unit) VALUES (?, ?, ?, ?, ?, ?)"
  );
  db.exec("BEGIN");
  try {
    let n = 0;
    for (const s of samples) { stmt.run(u, s.source, s.metric, s.t, s.value, s.unit ?? null); n++; }
    db.exec("COMMIT");
    return n;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
export function listSamples({ metric = null, from = null, to = null, limit = 2000 } = {}) {
  const where = ["user_id = ?"];
  const args = [uid()];
  if (metric) { where.push("metric = ?"); args.push(metric); }
  if (from != null) { where.push("t >= ?"); args.push(from); }
  if (to != null) { where.push("t <= ?"); args.push(to); }
  const sql = `SELECT source, metric, t, value, unit FROM health_samples
    WHERE ${where.join(" AND ")} ORDER BY t DESC LIMIT ?`;
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
// Abos des aktuellen Nutzers (request-gebunden).
export function listSubscriptions() {
  return getDb().prepare("SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY created_at").all(uid()).map(mapSubscription);
}
// Abos eines expliziten Nutzers — für den Push-Versand aus der Tick-Schleife (ohne ALS).
export function listSubscriptionsForUser(userId) {
  return getDb().prepare("SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY created_at").all(userId).map(mapSubscription);
}
export function countSubscriptions() {
  return getDb().prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?").get(uid()).n;
}
export function saveSubscription({ endpoint, p256dh, auth, userAgent = null }) {
  // endpoint ist global eindeutig; ein Gerät wird dem aktuellen Nutzer zugeordnet.
  getDb().prepare(`
    INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
  `).run(endpoint, uid(), p256dh, auth, userAgent, nowMs());
  return mapSubscription(getDb().prepare("SELECT * FROM push_subscriptions WHERE endpoint = ?").get(endpoint));
}
export function touchSubscription(endpoint) {
  getDb().prepare("UPDATE push_subscriptions SET last_ok_at = ? WHERE endpoint = ?").run(nowMs(), endpoint);
}
export function deleteSubscription(endpoint) {
  getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}
// Alle Nutzer mit mindestens einem Push-Abo — Eingabe für die Erinnerungs-Schleife (GLOBAL).
export function pushUserIds() {
  return getDb().prepare("SELECT DISTINCT user_id FROM push_subscriptions").all().map((r) => r.user_id);
}

// ── Aufgaben-Abhängigkeiten ──────────────────────
export function listTaskDeps() {
  return getDb().prepare("SELECT task_id, depends_on_id FROM task_deps WHERE user_id = ?").all(uid())
    .map((r) => ({ taskId: r.task_id, dependsOnId: r.depends_on_id }));
}
// Kante task → dependsOn anlegen. Wirft 400 bei Selbstbezug/Zyklus, 404 bei Fremd-IDs.
export function addTaskDep(taskId, dependsOnId) {
  const u = uid();
  if (Number(taskId) === Number(dependsOnId)) throw httpErr(400, "Aufgabe kann nicht von sich selbst abhängen");
  const owns = (id) => getDb().prepare("SELECT 1 FROM tasks WHERE id = ? AND user_id = ?").get(id, u);
  if (!owns(taskId) || !owns(dependsOnId)) throw httpErr(404, "Aufgabe nicht gefunden");
  // Zyklus-Check: ist taskId von dependsOnId aus (über bestehende Kanten) erreichbar?
  const edges = new Map();
  for (const d of listTaskDeps()) {
    if (!edges.has(d.taskId)) edges.set(d.taskId, []);
    edges.get(d.taskId).push(d.dependsOnId);
  }
  const stack = [Number(dependsOnId)];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (cur === Number(taskId)) throw httpErr(400, "Zirkuläre Abhängigkeit");
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of edges.get(cur) || []) stack.push(next);
  }
  getDb().prepare("INSERT OR IGNORE INTO task_deps (user_id, task_id, depends_on_id, created_at) VALUES (?, ?, ?, ?)")
    .run(u, taskId, dependsOnId, nowMs());
}
export function removeTaskDep(taskId, dependsOnId) {
  getDb().prepare("DELETE FROM task_deps WHERE task_id = ? AND depends_on_id = ? AND user_id = ?")
    .run(taskId, dependsOnId, uid());
}

// ── Task-Erinnerungen (geplante Blöcke des Tages) ──
export function scheduledTasksForDay(dayKey) {
  return getDb().prepare(
    "SELECT * FROM tasks WHERE user_id = ? AND done = 0 AND planned_date = ? AND scheduled_min IS NOT NULL"
  ).all(uid(), dayKey).map(mapTask);
}
// Erinnerungs-Fortschritt festhalten (key = "YYYY-MM-DD:minute" des Slots).
export function setTaskRemindStage(id, key, stage) {
  getDb().prepare("UPDATE tasks SET remind_for = ?, remind_stage = ? WHERE id = ? AND user_id = ?")
    .run(key, stage, id, uid());
}

// ── Kalender-Konten (CalDAV/ICS) ─────────────────
const mapCalAccount = (r) => r && ({
  id: r.id, kind: r.kind, label: r.label, username: r.username,
  secretEnc: r.secret_enc, baseUrl: r.base_url, homeUrl: r.home_url,
  enabled: !!r.enabled, lastSyncAt: r.last_sync_at, lastError: r.last_error,
  createdAt: r.created_at,
});
const mapCalCollection = (r) => r && ({
  id: r.id, accountId: r.account_id, url: r.url, name: r.name, color: r.color,
  enabled: !!r.enabled, ctag: r.ctag, syncToken: r.sync_token,
});
// Event-Zeile im Format von shared/icsParse.js (Expansion direkt möglich).
// `calendar` (Herkunft) wird nur befüllt, wenn die Abfrage die Collection
// mitgejoint hat — die Expansion in shared/icsParse.js reicht das Feld durch,
// damit im Zeitstrahl sichtbar ist, AUS WELCHEM Kalender ein Termin stammt.
const mapCalEvent = (r) => r && ({
  id: r.id, collectionId: r.collection_id, href: r.href, etag: r.etag, uid: r.uid,
  summary: r.summary, location: r.location, startMs: r.start_ms, endMs: r.end_ms,
  durationMin: r.duration_min, allDay: !!r.all_day, rrule: r.rrule,
  exdates: r.exdates ? JSON.parse(r.exdates) : [], recurrenceIdMs: r.recurrence_id_ms,
  tzid: r.tzid, status: r.status,
  calendar: r.cal_name === undefined ? null : {
    id: r.collection_id,
    name: r.cal_name || null,
    color: r.cal_color || null,          // Farbe aus dem Quell-Kalender (CalDAV/ICS)
    account: r.acc_label || null,
  },
});

export function listCalendarAccounts() {
  return getDb().prepare("SELECT * FROM calendar_accounts WHERE user_id = ? ORDER BY id").all(uid()).map(mapCalAccount);
}
export function getCalendarAccount(id) {
  return mapCalAccount(getDb().prepare("SELECT * FROM calendar_accounts WHERE id = ? AND user_id = ?").get(id, uid()));
}
export function createCalendarAccount({ kind = "caldav", label = null, username = null, secretEnc = null, baseUrl = null } = {}) {
  const info = getDb().prepare(`
    INSERT INTO calendar_accounts (user_id, kind, label, username, secret_enc, base_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uid(), kind, label, username, secretEnc, baseUrl, nowMs());
  return getCalendarAccount(Number(info.lastInsertRowid));
}
export function updateCalendarAccount(id, patch) {
  const cur = getCalendarAccount(id);
  if (!cur) return null;
  const label = patch.label !== undefined ? patch.label : cur.label;
  const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : (cur.enabled ? 1 : 0);
  const secretEnc = patch.secretEnc !== undefined ? patch.secretEnc : cur.secretEnc;
  const homeUrl = patch.homeUrl !== undefined ? patch.homeUrl : cur.homeUrl;
  const baseUrl = patch.baseUrl !== undefined ? patch.baseUrl : cur.baseUrl;
  getDb().prepare("UPDATE calendar_accounts SET label=?, enabled=?, secret_enc=?, home_url=?, base_url=? WHERE id=? AND user_id=?")
    .run(label, enabled, secretEnc, homeUrl, baseUrl, id, uid());
  return getCalendarAccount(id);
}
export function setCalendarAccountSync(id, { lastSyncAt, lastError }) {
  getDb().prepare("UPDATE calendar_accounts SET last_sync_at = ?, last_error = ? WHERE id = ? AND user_id = ?")
    .run(lastSyncAt ?? null, lastError ?? null, id, uid());
}
export function deleteCalendarAccount(id) {
  getDb().prepare("DELETE FROM calendar_accounts WHERE id = ? AND user_id = ?").run(id, uid());
}
// Fällige Konten ALLER Nutzer (Sync-Schleife; global, ohne ALS).
export function dueCalendarAccounts(before) {
  return getDb().prepare(`
    SELECT id, user_id FROM calendar_accounts
    WHERE enabled = 1 AND (last_sync_at IS NULL OR last_sync_at < ?) ORDER BY id
  `).all(before).map((r) => ({ id: r.id, userId: r.user_id }));
}

// Remote-Kalenderliste in lokale Collections spiegeln (enabled-Flag bleibt erhalten).
export function upsertCalendarCollections(accountId, remote) {
  const u = uid();
  const db = getDb();
  const existing = db.prepare("SELECT * FROM calendar_collections WHERE account_id = ? AND user_id = ?").all(accountId, u).map(mapCalCollection);
  const seen = new Set();
  for (const r of remote) {
    seen.add(r.url);
    const ex = existing.find((c) => c.url === r.url);
    if (ex) db.prepare("UPDATE calendar_collections SET name = ?, color = ? WHERE id = ?").run(r.name, r.color ?? ex.color, ex.id);
    else db.prepare("INSERT INTO calendar_collections (user_id, account_id, url, name, color) VALUES (?, ?, ?, ?, ?)")
      .run(u, accountId, r.url, r.name, r.color ?? null);
  }
  for (const ex of existing) {
    if (!seen.has(ex.url)) db.prepare("DELETE FROM calendar_collections WHERE id = ?").run(ex.id);
  }
  return db.prepare("SELECT * FROM calendar_collections WHERE account_id = ? AND user_id = ? ORDER BY name").all(accountId, u).map(mapCalCollection);
}
export function listCalendarCollections(accountId = null) {
  const u = uid();
  if (accountId != null) {
    return getDb().prepare("SELECT * FROM calendar_collections WHERE account_id = ? AND user_id = ? ORDER BY name").all(accountId, u).map(mapCalCollection);
  }
  return getDb().prepare("SELECT * FROM calendar_collections WHERE user_id = ? ORDER BY name").all(u).map(mapCalCollection);
}
export function getCalendarCollection(id) {
  return mapCalCollection(getDb().prepare("SELECT * FROM calendar_collections WHERE id = ? AND user_id = ?").get(id, uid()));
}
export function setCalendarCollectionEnabled(id, enabled) {
  getDb().prepare("UPDATE calendar_collections SET enabled = ? WHERE id = ? AND user_id = ?").run(enabled ? 1 : 0, id, uid());
  return getCalendarCollection(id);
}
export function setCollectionSyncState(id, { ctag, syncToken }) {
  getDb().prepare("UPDATE calendar_collections SET ctag = ?, sync_token = ? WHERE id = ? AND user_id = ?")
    .run(ctag ?? null, syncToken ?? null, id, uid());
}

// Alle Events eines Objekt-Pfads ersetzen (ein href kann Master + Overrides tragen).
export function replaceCalendarEventsForHref(collectionId, href, etag, events, now = nowMs()) {
  const u = uid();
  const db = getDb();
  const existed = db.prepare("SELECT COUNT(*) AS n FROM calendar_events WHERE collection_id = ? AND href = ? AND user_id = ?")
    .get(collectionId, href, u).n > 0;
  db.prepare("DELETE FROM calendar_events WHERE collection_id = ? AND href = ? AND user_id = ?").run(collectionId, href, u);
  const stmt = db.prepare(`
    INSERT INTO calendar_events (user_id, collection_id, href, etag, uid, summary, location, start_ms, end_ms,
      duration_min, all_day, rrule, exdates, recurrence_id_ms, tzid, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const ev of events) {
    stmt.run(
      u, collectionId, href, etag ?? null, ev.uid ?? null, ev.summary ?? "", ev.location ?? null,
      ev.startMs ?? null, ev.endMs ?? null, ev.durationMin ?? null, ev.allDay ? 1 : 0,
      ev.rrule ?? null, ev.exdates?.length ? JSON.stringify(ev.exdates) : null,
      ev.recurrenceIdMs ?? null, ev.tzid ?? null, ev.status ?? null, now,
    );
  }
  return { existed, inserted: events.length };
}
export function deleteCalendarEventsByHrefs(collectionId, hrefs) {
  const u = uid();
  const stmt = getDb().prepare("DELETE FROM calendar_events WHERE collection_id = ? AND href = ? AND user_id = ?");
  let n = 0;
  for (const h of hrefs) n += Number(stmt.run(collectionId, h, u).changes);
  return n;
}
export function clearCalendarEvents(collectionId) {
  getDb().prepare("DELETE FROM calendar_events WHERE collection_id = ? AND user_id = ?").run(collectionId, uid());
}
// Event-Zeilen fürs Expansions-Fenster: Einzeltermine im Fenster + alle Serien-Master/Overrides.
// Nur aktivierte Collections aktivierter Konten.
export function calendarEventRows(fromMs, toMs) {
  return getDb().prepare(`
    SELECT e.*, c.name AS cal_name, c.color AS cal_color, a.label AS acc_label
    FROM calendar_events e
    JOIN calendar_collections c ON c.id = e.collection_id
    JOIN calendar_accounts a ON a.id = c.account_id
    WHERE e.user_id = ? AND c.enabled = 1 AND a.enabled = 1
      AND (e.rrule IS NOT NULL OR e.recurrence_id_ms IS NOT NULL OR (e.end_ms > ? AND e.start_ms < ?))
  `).all(uid(), fromMs, toMs).map(mapCalEvent);
}
// Speicherminimal: abgelaufene Einzeltermine löschen (Serien-Master bleiben).
export function pruneCalendarEvents(beforeMs) {
  getDb().prepare(
    "DELETE FROM calendar_events WHERE user_id = ? AND rrule IS NULL AND recurrence_id_ms IS NULL AND end_ms < ?"
  ).run(uid(), beforeMs);
}
export function countCalendarEvents(accountId) {
  return getDb().prepare(`
    SELECT COUNT(*) AS n FROM calendar_events e
    JOIN calendar_collections c ON c.id = e.collection_id
    WHERE e.user_id = ? AND c.account_id = ?
  `).get(uid(), accountId).n;
}

// ═════════════════════════ Wave 6 ═════════════════════════

// ── Nutzer-Präferenzen (JSON-KV): Lernprofil, Darstellung, Features, Methoden ──
export function getPrefs() {
  const out = {};
  for (const r of getDb().prepare("SELECT key, value FROM user_prefs WHERE user_id = ?").all(uid())) {
    try { out[r.key] = r.value == null ? null : JSON.parse(r.value); } catch { /* kaputter Wert → weglassen */ }
  }
  return out;
}
// Patch mergen; value === null löscht den Schlüssel. Liefert den Gesamtstand.
export function setPrefs(patch = {}) {
  const db = getDb();
  const u = uid();
  const del = db.prepare("DELETE FROM user_prefs WHERE user_id = ? AND key = ?");
  const put = db.prepare(`
    INSERT INTO user_prefs (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  for (const [key, value] of Object.entries(patch)) {
    if (typeof key !== "string" || !key || key.length > 64) continue;
    if (value === null || value === undefined) del.run(u, key);
    else put.run(u, key, JSON.stringify(value), nowMs());
  }
  return getPrefs();
}

// ── Material-Bibliothek (Dateien/Links/Karten) ───
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB je Datei

const mapMaterial = (r) => r && ({
  id: r.id, topicId: r.topic_id, examId: r.exam_id, noteId: r.note_id ?? null, kind: r.kind,
  title: r.title, subject: r.subject, url: r.url, content: r.content,
  mime: r.mime, size: r.size, pinned: !!r.pinned,
  sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at,
});
// Liste OHNE Blob (Snapshot-tauglich; Datei-Inhalt nur über getMaterialData).
const MATERIAL_COLS = "id, user_id, topic_id, exam_id, note_id, kind, title, subject, url, content, mime, size, pinned, sort_order, created_at, updated_at";
export function listMaterials() {
  return getDb().prepare(`SELECT ${MATERIAL_COLS} FROM materials WHERE user_id = ? ORDER BY pinned DESC, sort_order, id DESC`)
    .all(uid()).map(mapMaterial);
}
export function getMaterial(id) {
  return mapMaterial(getDb().prepare(`SELECT ${MATERIAL_COLS} FROM materials WHERE id = ? AND user_id = ?`).get(id, uid()));
}
// Datei-Inhalt (BLOB) separat — bewusst nie im Listen-/Snapshot-Pfad.
export function getMaterialData(id) {
  const r = getDb().prepare("SELECT mime, size, title, data FROM materials WHERE id = ? AND user_id = ?").get(id, uid());
  if (!r || r.data == null) return null;
  return { mime: r.mime, size: r.size, title: r.title, data: r.data };
}
export function createMaterial(p = {}) {
  const u = uid();
  const kind = ["file", "link", "card"].includes(p.kind) ? p.kind : "link";
  if (p.data && p.data.length > MAX_FILE_BYTES) throw httpErr(413, "Datei zu groß (max. 25 MB)");
  const max = getDb().prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM materials WHERE user_id = ?").get(u).m;
  const now = nowMs();
  const info = getDb().prepare(`
    INSERT INTO materials (user_id, topic_id, exam_id, note_id, kind, title, subject, url, content, mime, size, data, pinned, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    u, p.topicId ?? null, p.examId ?? null, p.noteId ?? null, kind,
    p.title, p.subject ?? null, p.url ?? null, p.content ?? null,
    p.mime ?? null, p.size ?? (p.data ? p.data.length : null), p.data ?? null,
    p.pinned ? 1 : 0, max + 1, now, now,
  );
  return getMaterial(Number(info.lastInsertRowid));
}
export function updateMaterial(id, patch) {
  const cur = getMaterial(id);
  if (!cur) return null;
  const f = (k) => (patch[k] !== undefined ? patch[k] : cur[k]);
  getDb().prepare(`
    UPDATE materials SET topic_id=?, exam_id=?, note_id=?, title=?, subject=?, url=?, content=?, pinned=?, sort_order=?, updated_at=?
    WHERE id=? AND user_id=?
  `).run(
    f("topicId"), f("examId"), f("noteId"), f("title"), f("subject"), f("url"), f("content"),
    f("pinned") ? 1 : 0, f("sortOrder"), nowMs(), id, uid(),
  );
  return getMaterial(id);
}
export function deleteMaterial(id) {
  const u = uid();
  getDb().prepare("DELETE FROM materials WHERE id = ? AND user_id = ?").run(id, u);
  getDb().prepare("DELETE FROM reviews WHERE kind = 'material' AND ref_id = ? AND user_id = ?").run(id, u);
}

// ── Aktiver Abruf (SRS-Zustand je Thema/Karte) ───
const mapReview = (r) => r && ({
  id: r.id, kind: r.kind, refId: r.ref_id, dueKey: r.due_key,
  intervalDays: r.interval_days, ease: r.ease, reps: r.reps, lapses: r.lapses,
  lastGrade: r.last_grade, lastReviewAt: r.last_review_at, createdAt: r.created_at,
});
export function listReviews() {
  return getDb().prepare("SELECT * FROM reviews WHERE user_id = ? ORDER BY due_key, id").all(uid()).map(mapReview);
}
export function getReviewByRef(kind, refId) {
  return mapReview(getDb().prepare("SELECT * FROM reviews WHERE user_id = ? AND kind = ? AND ref_id = ?").get(uid(), kind, refId));
}
export function getReview(id) {
  return mapReview(getDb().prepare("SELECT * FROM reviews WHERE id = ? AND user_id = ?").get(id, uid()));
}
// In die Abruf-Warteschlange aufnehmen (idempotent). Fällig ab todayKey.
export function ensureReview(kind, refId, todayKey) {
  const existing = getReviewByRef(kind, refId);
  if (existing) return existing;
  getDb().prepare(`
    INSERT INTO reviews (user_id, kind, ref_id, due_key, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(uid(), kind, refId, todayKey, nowMs());
  return getReviewByRef(kind, refId);
}
export function saveReviewState(id, { dueKey, intervalDays, ease, reps, lapses, lastGrade, lastReviewAt }) {
  getDb().prepare(`
    UPDATE reviews SET due_key=?, interval_days=?, ease=?, reps=?, lapses=?, last_grade=?, last_review_at=?
    WHERE id=? AND user_id=?
  `).run(dueKey, intervalDays, ease, reps, lapses, lastGrade ?? null, lastReviewAt ?? null, id, uid());
  return getReview(id);
}
export function deleteReview(id) {
  getDb().prepare("DELETE FROM reviews WHERE id = ? AND user_id = ?").run(id, uid());
}
export function countDueReviews(todayKey) {
  return getDb().prepare("SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND due_key <= ?").get(uid(), todayKey).n;
}

// ── Teilen per Link ──────────────────────────────
const mapShare = (r) => r && ({
  id: r.id, userId: r.user_id, token: r.token, kind: r.kind, refId: r.ref_id,
  createdAt: r.created_at, revokedAt: r.revoked_at, viewCount: r.view_count,
});
export function listShares() {
  return getDb().prepare("SELECT * FROM shares WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC").all(uid()).map(mapShare);
}
// Bestehenden aktiven Link wiederverwenden (gleicher Inhalt → gleicher Link).
export function createShare(kind, refId, token) {
  const u = uid();
  const existing = getDb().prepare(
    "SELECT * FROM shares WHERE user_id = ? AND kind = ? AND ref_id = ? AND revoked_at IS NULL"
  ).get(u, kind, refId);
  if (existing) return mapShare(existing);
  const info = getDb().prepare(
    "INSERT INTO shares (user_id, token, kind, ref_id, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(u, token, kind, refId, nowMs());
  return mapShare(getDb().prepare("SELECT * FROM shares WHERE id = ?").get(Number(info.lastInsertRowid)));
}
export function revokeShare(id) {
  getDb().prepare("UPDATE shares SET revoked_at = ? WHERE id = ? AND user_id = ?").run(nowMs(), id, uid());
}
// GLOBAL (öffentliche Auflösung ohne Nutzerkontext): Token → Share-Zeile.
export function getShareByToken(token) {
  return mapShare(getDb().prepare("SELECT * FROM shares WHERE token = ? AND revoked_at IS NULL").get(String(token || "")));
}
export function bumpShareViews(id) {
  getDb().prepare("UPDATE shares SET view_count = view_count + 1 WHERE id = ?").run(id);
}

// ── KI-Konfiguration (Key verschlüsselt via lib/secret.js) ──
export function getAiConfigRow() {
  return getDb().prepare("SELECT * FROM ai_config WHERE user_id = ?").get(uid()) || null;
}
export function saveAiConfig({ provider, baseUrl, model, apiKeyEnc } = {}) {
  const cur = getAiConfigRow();
  const next = {
    provider: provider !== undefined ? provider : (cur?.provider ?? "none"),
    base_url: baseUrl !== undefined ? baseUrl : (cur?.base_url ?? null),
    model: model !== undefined ? model : (cur?.model ?? null),
    api_key_enc: apiKeyEnc !== undefined ? apiKeyEnc : (cur?.api_key_enc ?? null),
  };
  getDb().prepare(`
    INSERT INTO ai_config (user_id, provider, base_url, model, api_key_enc, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      provider = excluded.provider, base_url = excluded.base_url,
      model = excluded.model, api_key_enc = excluded.api_key_enc, updated_at = excluded.updated_at
  `).run(uid(), next.provider, next.base_url, next.model, next.api_key_enc, nowMs());
  return getAiConfigRow();
}

// ── Journal: Sessions eines Zeitfensters mit Aufgabentext (Rückblick) ──
export function journalSessions(fromMs, toMs = null) {
  const where = ["s.user_id = ?", "s.phase = 'focus'", "s.started_at >= ?"];
  const args = [uid(), fromMs];
  if (toMs != null) { where.push("s.started_at <= ?"); args.push(toMs); }
  return getDb().prepare(`
    SELECT s.started_at, s.ended_at, s.focus_ms, s.completed, s.task_id,
           t.text AS task_text, t.subject AS task_subject, t.topic_id AS topic_id
    FROM sessions s LEFT JOIN tasks t ON t.id = s.task_id
    WHERE ${where.join(" AND ")} ORDER BY s.started_at
  `).all(...args).map((r) => ({
    startedAt: r.started_at, endedAt: r.ended_at, focusMs: r.focus_ms,
    completed: !!r.completed, taskId: r.task_id,
    taskText: r.task_text ?? null, taskSubject: r.task_subject ?? null, topicId: r.topic_id ?? null,
  }));
}
