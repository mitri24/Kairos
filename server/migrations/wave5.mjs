// Wave-5-Schema: adaptive Planung, Abhängigkeiten, Kalender-Sync, Erinnerungen.
//
// EINZIGE Quelle für diese Tabellen/Spalten — bewusst NICHT in MULTITENANT_SCHEMA
// dupliziert: ensureWave5() läuft in db.js nach der Multi-Tenant-Migration für
// frische UND bestehende DBs und ist vollständig idempotent (CREATE IF NOT EXISTS
// + geprüfte ALTER TABLE ADD COLUMN). So konvergieren beide Pfade ohne Drift.

function hasTable(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}
function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

export function ensureWave5(db) {
  const addCol = (t, c, ddl) => {
    if (hasTable(db, t) && !columns(db, t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`);
  };

  // ── Tasks: Schwierigkeit, Themen-Link, Planungs-Herkunft, Erinnerungs-Status ──
  addCol("tasks", "difficulty", "difficulty INTEGER NOT NULL DEFAULT 2");   // 1 leicht · 2 mittel · 3 schwer
  addCol("tasks", "topic_id", "topic_id INTEGER");                          // Bezug auf topics (Code-seitig gepflegt)
  addCol("tasks", "sched_source", "sched_source TEXT");                     // 'user' | 'auto' | NULL — Auto-Plan verschiebt nur 'auto'
  addCol("tasks", "remind_for", "remind_for TEXT");                         // "YYYY-MM-DD:min" — für welchen Slot erinnert wurde
  addCol("tasks", "remind_stage", "remind_stage INTEGER NOT NULL DEFAULT 0"); // 0 keine · 1 Vorlauf · 2 Start gesendet

  // ── Resources: durchsuchbarer Bericht/Zusammenfassung (z. B. NotebookLM-Report) ──
  addCol("resources", "notes", "notes TEXT");

  // ── Settings: Task-Erinnerungen ──
  addCol("settings", "remind_tasks", "remind_tasks INTEGER NOT NULL DEFAULT 1");
  addCol("settings", "remind_lead_min", "remind_lead_min INTEGER NOT NULL DEFAULT 10");

  // ── Aufgaben-Abhängigkeiten ("erst Grundlagen, dann Vertiefung") ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_deps (
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      created_at    INTEGER NOT NULL,
      PRIMARY KEY (task_id, depends_on_id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_deps_user ON task_deps(user_id);
    CREATE INDEX IF NOT EXISTS idx_task_deps_dep  ON task_deps(depends_on_id);
  `);

  // ── Kalender-Konten (iCloud-CalDAV oder ICS-Abo-URL, mehrere pro Nutzer) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_accounts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind         TEXT    NOT NULL DEFAULT 'caldav',    -- 'caldav' | 'ics'
      label        TEXT,
      username     TEXT,                                  -- Apple-ID (CalDAV)
      secret_enc   TEXT,                                  -- app-spezif. Passwort, AES-256-GCM (lib/secret.js)
      base_url     TEXT,                                  -- CalDAV-Basis bzw. ICS-URL
      home_url     TEXT,                                  -- entdecktes calendar-home-set (Cache)
      enabled      INTEGER NOT NULL DEFAULT 1,
      last_sync_at INTEGER,
      last_error   TEXT,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cal_accounts_user ON calendar_accounts(user_id);

    CREATE TABLE IF NOT EXISTS calendar_collections (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES calendar_accounts(id) ON DELETE CASCADE,
      url        TEXT    NOT NULL,
      name       TEXT,
      color      TEXT,
      enabled    INTEGER NOT NULL DEFAULT 1,
      ctag       TEXT,
      sync_token TEXT,
      UNIQUE (account_id, url)
    );
    CREATE INDEX IF NOT EXISTS idx_cal_collections_user ON calendar_collections(user_id);

    -- Speicherminimal: nur Fenster-relevante Events; wiederkehrende als Master
    -- (rrule) + Ausnahmen, Expansion erst beim Lesen (shared/icsParse.js).
    CREATE TABLE IF NOT EXISTS calendar_events (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      collection_id    INTEGER NOT NULL REFERENCES calendar_collections(id) ON DELETE CASCADE,
      href             TEXT    NOT NULL,               -- Objekt-Pfad auf dem Server (Sync-Schlüssel)
      etag             TEXT,
      uid              TEXT,
      summary          TEXT,
      location         TEXT,
      start_ms         INTEGER,                        -- Beginn (erste Instanz bei Serien)
      end_ms           INTEGER,
      duration_min     INTEGER,
      all_day          INTEGER NOT NULL DEFAULT 0,
      rrule            TEXT,                           -- roher RRULE-String (Serien-Master)
      exdates          TEXT,                           -- JSON-Array [epochMs, …]
      recurrence_id_ms INTEGER,                        -- Override-Instanz einer Serie
      tzid             TEXT,
      status           TEXT,
      updated_at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cal_events_user ON calendar_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_cal_events_coll ON calendar_events(collection_id, href);
    CREATE INDEX IF NOT EXISTS idx_cal_events_span ON calendar_events(user_id, start_ms, end_ms);
  `);
}
