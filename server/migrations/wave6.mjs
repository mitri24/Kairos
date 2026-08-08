// Wave-6-Schema: Lernprofil/Prefs, Material-Bibliothek, Teilen, aktiver Abruf, KI.
//
// Wie Wave 5: EINZIGE Quelle für diese Tabellen — ensureWave6() läuft in db.js
// nach Multi-Tenant-Migration + Wave 5 für frische UND bestehende DBs und ist
// vollständig idempotent (CREATE IF NOT EXISTS + geprüfte ALTER TABLE).

function hasTable(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}
function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

export function ensureWave6(db) {
  const addCol = (t, c, ddl) => {
    if (hasTable(db, t) && !columns(db, t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`);
  };

  // ── Nutzer-Präferenzen als JSON-KV (Lernprofil, Darstellung, Features, Methoden) ──
  // Bewusst KV statt Spalten: die Wave-6-Prefs sind viele, klein und strukturiert
  // (Arrays/Objekte) — ein starres Spaltenschema würde bei jeder Iteration wachsen.
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key        TEXT    NOT NULL,
      value      TEXT,                                 -- JSON-serialisiert
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, key)
    );
    CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON user_prefs(user_id);
  `);

  // ── Material-Bibliothek: Dateien (BLOB), Links und Karten (Formeln/Regeln) ──
  // Dateien liegen als BLOB in der DB (ein Deployment, ein Backup, kein Datei-
  // system-Pfadmanagement). Themen-/Prüfungsbezug ist optional; beim Löschen des
  // Bezugs bleibt das Material erhalten (SET NULL) — die Bibliothek ist der Besitz.
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      topic_id   INTEGER REFERENCES topics(id) ON DELETE SET NULL,
      exam_id    INTEGER REFERENCES exams(id)  ON DELETE SET NULL,
      kind       TEXT    NOT NULL DEFAULT 'link',      -- 'file' | 'link' | 'card'
      title      TEXT    NOT NULL,
      subject    TEXT,
      url        TEXT,                                 -- kind=link
      content    TEXT,                                 -- kind=card (Formel/Regel/Merksatz, Markdown-nah)
      mime       TEXT,                                 -- kind=file
      size       INTEGER,
      data       BLOB,
      pinned     INTEGER NOT NULL DEFAULT 0,           -- im Referenz-Panel angeheftet
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_materials_user  ON materials(user_id);
    CREATE INDEX IF NOT EXISTS idx_materials_topic ON materials(topic_id);
    CREATE INDEX IF NOT EXISTS idx_materials_exam  ON materials(exam_id);
  `);

  // ── Teilen per Link: Token zeigt LIVE auf Inhalt (kind + ref_id) ──
  // Kein Payload-Einfrieren: der Link zeigt immer den aktuellen Stand; Widerruf
  // über revoked_at. Token ist ein Bearer-Geheimnis für GENAU diesen Inhalt.
  db.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT    NOT NULL UNIQUE,
      kind       TEXT    NOT NULL,                     -- 'exam' | 'topic' | 'note' | 'material'
      ref_id     INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER,
      view_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
  `);

  // ── Aktiver Abruf (SRS): ein Scheduling-Datensatz je Thema/Karte ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind           TEXT    NOT NULL DEFAULT 'topic', -- 'topic' | 'material'
      ref_id         INTEGER NOT NULL,
      due_key        TEXT    NOT NULL,                 -- YYYY-MM-DD (Nutzer-Zeitzone)
      interval_days  REAL    NOT NULL DEFAULT 0,
      ease           REAL    NOT NULL DEFAULT 2.5,
      reps           INTEGER NOT NULL DEFAULT 0,
      lapses         INTEGER NOT NULL DEFAULT 0,
      last_grade     INTEGER,
      last_review_at INTEGER,
      created_at     INTEGER NOT NULL,
      UNIQUE (user_id, kind, ref_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_user_due ON reviews(user_id, due_key);
  `);

  // ── KI-Buddy: Provider-Konfiguration je Nutzer (Key AES-verschlüsselt) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_config (
      user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      provider    TEXT    NOT NULL DEFAULT 'none',     -- 'none'|'ollama'|'openai'|'anthropic'
      base_url    TEXT,
      model       TEXT,
      api_key_enc TEXT,                                -- lib/secret.js (AES-256-GCM)
      updated_at  INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Journal-Rückblick braucht schnelle Zeitfenster-Reads auf Sessions.
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_user_time ON sessions(user_id, started_at)");
  // Platzhalter für spätere Spalten-Nachzüge (Muster bleibt einheitlich).
  addCol("materials", "updated_at", "updated_at INTEGER NOT NULL DEFAULT 0");
}
