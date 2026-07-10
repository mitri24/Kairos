-- ADHD Lernuhr — SQLite-Schema (node:sqlite).
-- Singletons (settings, timer_state) haben feste id = 1.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  focus_minutes           INTEGER NOT NULL DEFAULT 25,
  short_break_minutes     INTEGER NOT NULL DEFAULT 5,
  long_break_minutes      INTEGER NOT NULL DEFAULT 15,
  cycles_until_long_break INTEGER NOT NULL DEFAULT 4,
  auto_start_next_phase   INTEGER NOT NULL DEFAULT 0,
  today_goal_hours        REAL    NOT NULL DEFAULT 4,
  profile_name            TEXT    NOT NULL DEFAULT 'Prüfungsfokus',
  active_exam_id          INTEGER
);

CREATE TABLE IF NOT EXISTS timer_state (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  status           TEXT    NOT NULL DEFAULT 'idle',
  phase            TEXT    NOT NULL DEFAULT 'focus',
  cycle_in_block   INTEGER NOT NULL DEFAULT 0,
  remaining_ms     INTEGER NOT NULL DEFAULT 1500000,
  ends_at          INTEGER,
  active_task_id   INTEGER,
  phase_started_at INTEGER,
  updated_at       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL DEFAULT 'Prüfung',
  exam_date   INTEGER,                       -- epoch ms
  total_hours REAL    NOT NULL DEFAULT 0,     -- Pensum
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id      INTEGER,
  text         TEXT    NOT NULL,
  subject      TEXT,
  priority     INTEGER NOT NULL DEFAULT 2,     -- 1..4 (1 = dringend)
  due_date     INTEGER,                        -- epoch ms (Deadline)
  planned_date TEXT,                           -- YYYY-MM-DD: an welchem Tag geplant
  est_minutes  INTEGER NOT NULL DEFAULT 25,
  scheduled_min INTEGER,                        -- Startzeit auf dem Tages-Zeitstrahl (Minuten ab Mitternacht) oder NULL
  done        INTEGER NOT NULL DEFAULT 0,
  done_at     INTEGER,
  spent_ms    INTEGER NOT NULL DEFAULT 0,     -- akkumulierte Fokuszeit
  active      INTEGER NOT NULL DEFAULT 0,     -- aktuell im Timer aktiv
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subtasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL,
  text       TEXT    NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Prüfungs-Themen-Checkliste (getrennt von den Todos)
CREATE TABLE IF NOT EXISTS topics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id    INTEGER,
  text       TEXT    NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

-- Freie Notizen (Zettelkasten): optional einem Fach/einer Prüfung zugeordnet,
-- angepinnte zuerst. Beim Löschen der Prüfung bleibt die Notiz (exam_id → NULL).
CREATE TABLE IF NOT EXISTS notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT NOT NULL,
  subject     TEXT,
  exam_id     INTEGER REFERENCES exams(id) ON DELETE SET NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT 0
);

-- Append-only Log abgeschlossener/abgebrochener Fokus-Sessions (Metriken)
CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER,
  phase      TEXT    NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,
  focus_ms   INTEGER NOT NULL DEFAULT 0,
  completed  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  day_key       TEXT PRIMARY KEY,            -- YYYY-MM-DD (lokal)
  focus_ms      INTEGER NOT NULL DEFAULT 0,
  sessions_done INTEGER NOT NULL DEFAULT 0
);

-- Schlüssel/Wert-Ablage für App-Metadaten (u. a. persistente VAPID-Schlüssel)
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ── Persönliches Profil (Singleton, id = 1) ─────────────────────────
-- Backend des "Persönliche Informationen"-Tabs. Speist später KI + Planung:
-- Baselines (Ruhepuls/HRV), Schlafziel & -fenster, Chronotyp, Consent-Flag.
CREATE TABLE IF NOT EXISTS profile (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  display_name       TEXT,
  birth_date         TEXT,                         -- YYYY-MM-DD (→ Alter)
  sex                TEXT,                          -- 'female'|'male'|'diverse'|'unspecified'
  height_cm          REAL,
  weight_kg          REAL,
  timezone           TEXT,                          -- IANA, z. B. Europe/Zurich
  chronotype         TEXT,                          -- 'early'|'intermediate'|'late'
  adhd               INTEGER NOT NULL DEFAULT 0,     -- 0/1
  conditions         TEXT,                          -- freie Notiz (sensibel)
  primary_device     TEXT    NOT NULL DEFAULT 'ringconn',
  sleep_goal_hours   REAL    NOT NULL DEFAULT 8,     -- ≥7 h harte Constraint (SPEC)
  target_bedtime     TEXT,                          -- HH:MM (Schlaffenster-Start)
  target_wake_time   TEXT,                          -- HH:MM (Schlaffenster-Ende)
  resting_hr_baseline REAL,                          -- persönliche Baseline für Abweichungen
  hrv_baseline_ms    REAL,
  ai_enabled         INTEGER NOT NULL DEFAULT 0,     -- Einwilligung: Daten für KI-Planung nutzen
  ai_notes           TEXT,                          -- Ziele/Vorlieben, die die KI kennen soll
  data_consent_at    INTEGER,                        -- Zeitpunkt der Einwilligung (epoch ms)
  updated_at         INTEGER NOT NULL DEFAULT 0
);

-- ── Tägliche Health-Rollups (eine Zeile je Tag + Quelle) ────────────
-- Kanonische Spalten siehe server/health/fields.js. raw_json bewahrt den
-- Originalexport (zukunfts-/KI-fest). Upsert über (day_key, source).
CREATE TABLE IF NOT EXISTS health_daily (
  day_key           TEXT NOT NULL,                  -- YYYY-MM-DD (lokal)
  source            TEXT NOT NULL,                  -- 'ringconn'|'whoop'|'apple_health'|…
  sleep_start       INTEGER,                        -- epoch ms
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
  raw_json          TEXT,                           -- Originalexport (JSON)
  recorded_at       INTEGER,                        -- vom Gerät (epoch ms)
  imported_at       INTEGER NOT NULL,               -- Zeitpunkt des Imports
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (day_key, source)
);

-- ── Intraday-Zeitreihen (z. B. Live-Herzfrequenz, SpO₂, Stress) ─────
CREATE TABLE IF NOT EXISTS health_samples (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  source  TEXT    NOT NULL,
  metric  TEXT    NOT NULL,                          -- 'heart_rate'|'spo2'|'hrv'|'stress'|…
  t       INTEGER NOT NULL,                          -- epoch ms
  value   REAL    NOT NULL,
  unit    TEXT
);

-- Web-Push-Abonnements (Browser/PWA). endpoint ist eindeutig.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,               -- öffentlicher Client-Schlüssel (base64url)
  auth       TEXT NOT NULL,               -- Auth-Secret (base64url)
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  last_ok_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_exam ON tasks(exam_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_topics_exam ON topics(exam_id);
CREATE INDEX IF NOT EXISTS idx_notes_exam ON notes(exam_id);
CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_health_daily_day ON health_daily(day_key);
CREATE INDEX IF NOT EXISTS idx_health_samples_metric ON health_samples(metric, t);

-- Singleton-Zeilen anlegen, falls nicht vorhanden
INSERT OR IGNORE INTO settings (id) VALUES (1);
INSERT OR IGNORE INTO timer_state (id, remaining_ms) VALUES (1, 1500000);
INSERT OR IGNORE INTO profile (id) VALUES (1);
