// Stufe-1-Migration: Single-Tenant (id=1-Singletons) → Multi-Tenant (user_id).
//
// Strategie "rename-old → fresh-schema → copy-in": alle bestehenden Tabellen werden
// auf <t>_old umbenannt, das vollständige Multi-Tenant-Schema frisch angelegt und die
// Daten mit der Owner-user_id zurückkopiert. So sind migrierte und frisch angelegte
// Datenbanken schema-identisch (kein Drift), und PK-Wechsel (daily_metrics,
// health_daily) sind sauber statt via ALTER gefrickelt.
//
// Idempotent: erkennt an app_meta.schema_version == 2, ob bereits migriert wurde.
// Verlustfrei: jede Alt-Zeile landet mit user_id = Owner in der neuen Tabelle.

export const SCHEMA_VERSION = 2;

// ── Multi-Tenant-Schema (Frischinstallation) ─────────────────────────
// Wird auch von db.js für neue DBs genutzt (single source of truth).
// WICHTIG: reine DDL, KEINE Verbindungs-PRAGMAs (journal_mode/foreign_keys) —
// die dürfen nicht innerhalb der Migrations-Transaktion laufen. db.js setzt sie
// einmalig beim Verbindungsaufbau.
export const MULTITENANT_SCHEMA = `
-- ── Nutzer & Auth ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE,          -- normalisiert (lowercase, trim)
  verified   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Server-seitige Sitzungen (Cookie trägt nur die opake id).
CREATE TABLE IF NOT EXISTS auth_sessions (
  id         TEXT    PRIMARY KEY,              -- zufälliger, opaker Token
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Einmal-Login-Token (Magic-Link). Gespeichert wird nur der SHA-256-Hash.
CREATE TABLE IF NOT EXISTS magic_tokens (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Pro-Nutzer-Singletons (user_id als PK) ──────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  user_id                 INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  focus_minutes           INTEGER NOT NULL DEFAULT 25,
  short_break_minutes     INTEGER NOT NULL DEFAULT 5,
  long_break_minutes      INTEGER NOT NULL DEFAULT 15,
  cycles_until_long_break INTEGER NOT NULL DEFAULT 4,
  auto_start_next_phase   INTEGER NOT NULL DEFAULT 0,
  today_goal_hours        REAL    NOT NULL DEFAULT 4,
  profile_name            TEXT    NOT NULL DEFAULT 'Prüfungsfokus',
  active_exam_id          INTEGER,
  dnd_enabled             INTEGER NOT NULL DEFAULT 0,   -- Ruhezeiten (kein Push im Fenster)
  dnd_start_min           INTEGER,                       -- Fensterbeginn (Minuten ab Mitternacht, lokal)
  dnd_end_min             INTEGER                        -- Fensterende (Umschlag über Mitternacht erlaubt)
);

CREATE TABLE IF NOT EXISTS timer_state (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status           TEXT    NOT NULL DEFAULT 'idle',
  phase            TEXT    NOT NULL DEFAULT 'focus',
  cycle_in_block   INTEGER NOT NULL DEFAULT 0,
  remaining_ms     INTEGER NOT NULL DEFAULT 1500000,
  ends_at          INTEGER,
  active_task_id   INTEGER,
  phase_started_at INTEGER,
  updated_at       INTEGER NOT NULL DEFAULT 0,
  break_over_since INTEGER,                              -- Pause endete, Fokus pausiert → Overrun-Uhr
  break_over_notified INTEGER NOT NULL DEFAULT 0         -- Anzahl bereits gesendeter Overrun-Erinnerungen
);

CREATE TABLE IF NOT EXISTS profile (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name       TEXT,
  birth_date         TEXT,
  sex                TEXT,
  height_cm          REAL,
  weight_kg          REAL,
  timezone           TEXT,
  chronotype         TEXT,
  adhd               INTEGER NOT NULL DEFAULT 0,
  conditions         TEXT,
  primary_device     TEXT    NOT NULL DEFAULT 'ringconn',
  sleep_goal_hours   REAL    NOT NULL DEFAULT 8,
  target_bedtime     TEXT,
  target_wake_time   TEXT,
  resting_hr_baseline REAL,
  hrv_baseline_ms    REAL,
  ai_enabled         INTEGER NOT NULL DEFAULT 0,
  ai_notes           TEXT,
  data_consent_at    INTEGER,
  updated_at         INTEGER NOT NULL DEFAULT 0
);

-- ── Besitzer-Sammlungen (user_id NOT NULL) ──────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL DEFAULT 'Prüfung',
  exam_date   INTEGER,
  total_hours REAL    NOT NULL DEFAULT 0,
  color       TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id      INTEGER,
  text         TEXT    NOT NULL,
  subject      TEXT,
  priority     INTEGER NOT NULL DEFAULT 2,
  due_date     INTEGER,
  planned_date TEXT,
  est_minutes  INTEGER NOT NULL DEFAULT 25,
  scheduled_min INTEGER,
  done         INTEGER NOT NULL DEFAULT 0,
  done_at      INTEGER,
  spent_ms     INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  recurrence      TEXT,                                  -- ""/null | daily | weekdays | weekly | every:N
  recur_parent_id INTEGER,                               -- Ursprungs-Aufgabe der Serie (Verkettung)
  postpone_count  INTEGER NOT NULL DEFAULT 0,            -- wie oft verschoben (ADHS-Signal „aufteilen?")
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subtasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id    INTEGER NOT NULL,
  text       TEXT    NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS topics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id    INTEGER,
  text       TEXT    NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

-- Freie Notizen (optional Fach/Prüfung), angepinnte zuerst.
CREATE TABLE IF NOT EXISTS notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  subject     TEXT,
  exam_id     INTEGER REFERENCES exams(id) ON DELETE SET NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT 0
);

-- Lern-Ressourcen (Hand-off-Links) an Thema ODER Aufgabe.
CREATE TABLE IF NOT EXISTS resources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id   INTEGER REFERENCES topics(id) ON DELETE CASCADE,
  task_id    INTEGER REFERENCES tasks(id)  ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  url        TEXT    NOT NULL,
  kind       TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id    INTEGER,
  phase      TEXT    NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,
  focus_ms   INTEGER NOT NULL DEFAULT 0,
  completed  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key       TEXT    NOT NULL,
  focus_ms      INTEGER NOT NULL DEFAULT 0,
  sessions_done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day_key)
);

CREATE TABLE IF NOT EXISTS health_daily (
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key           TEXT NOT NULL,
  source            TEXT NOT NULL,
  sleep_start       INTEGER,
  sleep_end         INTEGER,
  sleep_total_min   INTEGER,
  sleep_deep_min    INTEGER,
  sleep_rem_min     INTEGER,
  sleep_light_min   INTEGER,
  sleep_awake_min   INTEGER,
  sleep_efficiency  REAL,
  sleep_score       INTEGER,
  resting_hr        REAL,
  avg_hr            REAL,
  min_hr            REAL,
  max_hr            REAL,
  hrv_ms            REAL,
  respiratory_rate  REAL,
  spo2_avg          REAL,
  spo2_min          REAL,
  skin_temp_c       REAL,
  skin_temp_delta_c REAL,
  steps             INTEGER,
  active_calories   REAL,
  total_calories    REAL,
  activity_min      INTEGER,
  distance_m        REAL,
  recovery_score    INTEGER,
  strain_score      REAL,
  stress_avg        REAL,
  readiness         INTEGER,
  raw_json          TEXT,
  recorded_at       INTEGER,
  imported_at       INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (user_id, day_key, source)
);

CREATE TABLE IF NOT EXISTS health_samples (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source  TEXT    NOT NULL,
  metric  TEXT    NOT NULL,
  t       INTEGER NOT NULL,
  value   REAL    NOT NULL,
  unit    TEXT
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,                 -- global eindeutig (ein Gerät = ein Endpunkt)
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  last_ok_at INTEGER
);

-- Globale App-Metadaten (u. a. VAPID-Schlüssel, schema_version) — nicht pro Nutzer.
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ── Indizes (inkl. Mandanten-Scans) ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exams_user      ON exams(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user      ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_exam      ON tasks(exam_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_user   ON subtasks(user_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task   ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_topics_user     ON topics(user_id);
CREATE INDEX IF NOT EXISTS idx_topics_exam     ON topics(exam_id);
CREATE INDEX IF NOT EXISTS idx_notes_user      ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_exam      ON notes(exam_id);
CREATE INDEX IF NOT EXISTS idx_resources_user  ON resources(user_id);
CREATE INDEX IF NOT EXISTS idx_resources_topic ON resources(topic_id);
CREATE INDEX IF NOT EXISTS idx_resources_task  ON resources(task_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_task   ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_health_daily_user ON health_daily(user_id, day_key);
CREATE INDEX IF NOT EXISTS idx_health_samples_user ON health_samples(user_id, metric, t);
CREATE INDEX IF NOT EXISTS idx_push_user       ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_magic_tokens_user  ON magic_tokens(user_id);
`;

// Spaltenlisten der zu kopierenden Tabellen. `extraFirst` markiert, dass user_id
// als erste Spalte VOR die Alt-Spalten eingefügt wird (Owner-Backfill).
// singleton: Alt-Tabelle hat eine feste id=1-Zeile, deren id-Spalte wegfällt.
const COPY_SPECS = [
  { table: "settings", singleton: true,
    cols: ["focus_minutes", "short_break_minutes", "long_break_minutes", "cycles_until_long_break",
           "auto_start_next_phase", "today_goal_hours", "profile_name", "active_exam_id"] },
  { table: "timer_state", singleton: true,
    cols: ["status", "phase", "cycle_in_block", "remaining_ms", "ends_at", "active_task_id",
           "phase_started_at", "updated_at"] },
  { table: "profile", singleton: true,
    cols: ["display_name", "birth_date", "sex", "height_cm", "weight_kg", "timezone", "chronotype",
           "adhd", "conditions", "primary_device", "sleep_goal_hours", "target_bedtime",
           "target_wake_time", "resting_hr_baseline", "hrv_baseline_ms", "ai_enabled", "ai_notes",
           "data_consent_at", "updated_at"] },
  { table: "exams",
    cols: ["id", "name", "exam_date", "total_hours", "color", "archived", "archived_at", "sort_order", "created_at"] },
  { table: "tasks",
    cols: ["id", "exam_id", "text", "subject", "priority", "due_date", "planned_date", "est_minutes",
           "scheduled_min", "done", "done_at", "spent_ms", "active", "sort_order", "created_at"] },
  { table: "subtasks",
    cols: ["id", "task_id", "text", "done", "sort_order", "created_at"] },
  { table: "topics",
    cols: ["id", "exam_id", "text", "done", "confidence", "sort_order", "created_at"] },
  { table: "notes",
    cols: ["id", "text", "subject", "exam_id", "pinned", "sort_order", "created_at", "updated_at"] },
  { table: "resources",
    cols: ["id", "topic_id", "task_id", "title", "url", "kind", "is_primary", "sort_order", "created_at"] },
  { table: "sessions",
    cols: ["id", "task_id", "phase", "started_at", "ended_at", "focus_ms", "completed", "created_at"] },
  { table: "daily_metrics",
    cols: ["day_key", "focus_ms", "sessions_done"] },
  { table: "health_daily",
    cols: ["day_key", "source", "sleep_start", "sleep_end", "sleep_total_min", "sleep_deep_min",
           "sleep_rem_min", "sleep_light_min", "sleep_awake_min", "sleep_efficiency", "sleep_score",
           "resting_hr", "avg_hr", "min_hr", "max_hr", "hrv_ms", "respiratory_rate", "spo2_avg",
           "spo2_min", "skin_temp_c", "skin_temp_delta_c", "steps", "active_calories", "total_calories",
           "activity_min", "distance_m", "recovery_score", "strain_score", "stress_avg", "readiness",
           "raw_json", "recorded_at", "imported_at", "updated_at"] },
  { table: "health_samples",
    cols: ["id", "source", "metric", "t", "value", "unit"] },
  { table: "push_subscriptions",
    cols: ["endpoint", "p256dh", "auth", "user_agent", "created_at", "last_ok_at"] },
];

const normalizeEmail = (e) => String(e || "owner@localhost").trim().toLowerCase();

function tableExists(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}
function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}
function getSchemaVersion(db) {
  if (!tableExists(db, "app_meta")) return 0;
  const r = db.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get();
  return r ? Number(r.value) || 0 : 0;
}

// Ist das eine bereits mehrmandantenfähige DB? (users-Tabelle vorhanden)
export function isMultiTenant(db) {
  return tableExists(db, "users") && getSchemaVersion(db) >= SCHEMA_VERSION;
}

// Frisches Multi-Tenant-Schema anlegen (leere/neue DB).
export function createFreshSchema(db) {
  db.exec(MULTITENANT_SCHEMA);
  db.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_version', ?)")
    .run(String(SCHEMA_VERSION));
}

// Kern: Legacy-DB (id=1-Singletons, keine user_id) → Multi-Tenant. Idempotent.
// Gibt { migrated: boolean, ownerId, ownerEmail, copied: {table: rows} } zurück.
export function migrateToMultiTenant(db, ownerEmail) {
  ownerEmail = normalizeEmail(ownerEmail);

  // Bereits migriert? Nichts tun (idempotent).
  if (isMultiTenant(db)) {
    const owner = db.prepare("SELECT id, email FROM users ORDER BY id LIMIT 1").get();
    return { migrated: false, ownerId: owner?.id ?? null, ownerEmail: owner?.email ?? null, copied: {} };
  }

  // Ganz frische DB ohne Legacy-Tabellen? Nur Schema anlegen.
  const hasLegacy = tableExists(db, "settings") && !columnNames(db, "settings").includes("user_id");
  if (!hasLegacy && !tableExists(db, "users")) {
    createFreshSchema(db);
    return { migrated: false, ownerId: null, ownerEmail: null, copied: {} };
  }

  // Welche Legacy-Tabellen sind wirklich vorhanden (health/profile evtl. nicht)?
  const present = COPY_SPECS.filter((s) => tableExists(db, s.table));

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    // 1) Legacy-Tabellen zur Seite umbenennen.
    for (const s of present) db.exec(`ALTER TABLE ${s.table} RENAME TO ${s.table}_old`);
    // app_meta ist global — bleibt unverändert bestehen (nicht umbenennen).

    // 2) Vollständiges Multi-Tenant-Schema anlegen (alle Tabellen, inkl. neuer).
    db.exec(MULTITENANT_SCHEMA);

    // 3) Owner-Konto anlegen (verifiziert) und Alt-Daten übernehmen.
    const now = nowSafe();
    db.prepare("INSERT OR IGNORE INTO users (email, verified, created_at) VALUES (?, 1, ?)")
      .run(ownerEmail, now);
    const ownerId = db.prepare("SELECT id FROM users WHERE email = ?").get(ownerEmail).id;

    const copied = {};
    for (const s of present) {
      const oldCols = columnNames(db, `${s.table}_old`);
      // Nur Spalten kopieren, die es in der Alt-Tabelle wirklich gibt (Robustheit
      // gegenüber Zwischenständen). user_id wird als Owner injiziert.
      const cols = s.cols.filter((c) => oldCols.includes(c));
      const where = s.singleton ? " WHERE id = 1" : "";
      const targetCols = ["user_id", ...cols].join(", ");
      const selectCols = [String(ownerId), ...cols].join(", ");
      const sql = `INSERT INTO ${s.table} (${targetCols}) SELECT ${selectCols} FROM ${s.table}_old${where}`;
      const info = db.prepare(sql).run();
      copied[s.table] = Number(info.changes);
      db.exec(`DROP TABLE ${s.table}_old`);
    }

    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)")
      .run(String(SCHEMA_VERSION));

    db.exec("COMMIT");
    db.exec("PRAGMA foreign_keys = ON");
    return { migrated: true, ownerId, ownerEmail, copied };
  } catch (err) {
    db.exec("ROLLBACK");
    db.exec("PRAGMA foreign_keys = ON");
    throw err;
  }
}

// Date.now() ist in manchen Sandboxes gekappt; hier bewusst direkt genutzt, da die
// Migration Laufzeitcode ist (kein Workflow-Replay). Gekapselt für Testbarkeit.
function nowSafe() {
  return Date.now();
}
