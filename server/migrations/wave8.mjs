// Wave 8: frei verschachtelbare Sidebar-Ordner und Funktions-Verknüpfungen.
// Ein Knoten ist entweder ein Ordner oder öffnet eine vorhandene App-Ansicht
// bzw. eine konkrete Prüfung. parent_id bildet einen beliebig tiefen Baum.

export function ensureWave8(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nav_nodes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id  INTEGER REFERENCES nav_nodes(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      kind       TEXT NOT NULL DEFAULT 'folder' CHECK(kind IN ('folder','view','exam')),
      view_key   TEXT,
      exam_id    INTEGER REFERENCES exams(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nav_nodes_user_parent
      ON nav_nodes(user_id, parent_id, sort_order, id);
  `);
}
