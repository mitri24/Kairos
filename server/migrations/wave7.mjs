// Wave-7-Schema: Notizen werden Dokumente, Materialien hängen überall dran.
//
// Wie Wave 5/6: EINZIGE Quelle für diese Änderungen — ensureWave7() läuft in
// db.js nach Wave 6 für frische UND bestehende DBs und ist idempotent
// (geprüfte ALTER TABLE + CREATE IF NOT EXISTS).
//
// Zwei Erweiterungen:
//   1. notes.title — eine Notiz ist ein Dokument mit Titel und Fließtext
//      (Markdown). Bestehende Notizen behalten ihren Text und bekommen den
//      Titel NULL; die Oberfläche fällt dann auf die erste Zeile zurück.
//   2. materials.note_id — Dateien lassen sich an eine Notiz hängen, so wie
//      bisher schon an Thema und Prüfung. Damit liegt alles zu einer Sache an
//      einem Ort. Beim Löschen der Notiz gehen ihre Anhänge mit (CASCADE):
//      sie gehören zum Dokument, nicht zur Bibliothek.

function hasTable(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}
function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

export function ensureWave7(db) {
  const addCol = (t, c, ddl) => {
    if (hasTable(db, t) && !columns(db, t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`);
  };

  // ── Notiz = Dokument ──
  addCol("notes", "title", "title TEXT");

  // ── Anhänge an Notizen ──
  // SQLite kann per ALTER TABLE keine Spalte mit REFERENCES + CASCADE ergänzen,
  // die Fremdschlüssel-Aktion würde erst beim Neuaufbau der Tabelle greifen.
  // Deshalb: schlichte Spalte + Index, das Aufräumen erledigt repo.deleteNote().
  addCol("materials", "note_id", "note_id INTEGER");
  if (hasTable(db, "materials")) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_materials_note ON materials(note_id)`);
  }
}
