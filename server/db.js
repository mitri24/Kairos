// SQLite-Zugriff über das eingebaute node:sqlite (Node 22.5+). Keine externen Deps.
// Schema-Quelle ist jetzt das Multi-Tenant-Schema aus migrations/multitenant.mjs:
// frische DBs bekommen es direkt, bestehende Single-Tenant-DBs werden verlustfrei
// migriert (alle Alt-Daten dem Owner-Konto zugeordnet).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { migrateToMultiTenant } from "./migrations/multitenant.mjs";
import { ensureWave5 } from "./migrations/wave5.mjs";
import { ensureWave6 } from "./migrations/wave6.mjs";
import { ensureWave7 } from "./migrations/wave7.mjs";
import { ensureWave8 } from "./migrations/wave8.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Datei-Pfad: über KAIROS_DB überschreibbar (LERNUHR_DB bleibt als Alias für
// bestehende Deployments erhalten), sonst server/data/lernuhr.db (Dateiname für
// bereits vorhandene Installationen unverändert).
export const DB_PATH = process.env.KAIROS_DB || process.env.LERNUHR_DB || join(__dirname, "data", "lernuhr.db");

// E-Mail des Owner-Kontos, dem bestehende Single-Tenant-Daten bei der Migration
// zugeordnet werden. Zum Zugriff auf migrierte Daten mit DIESER Adresse einloggen.
export const OWNER_EMAIL = (process.env.OWNER_EMAIL || "owner@localhost").trim().toLowerCase();

let db = null;

export function getDb() {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  backfillLegacyColumns(db);              // Legacy-Spalten VOR der Migration vervollständigen
  migrateToMultiTenant(db, OWNER_EMAIL);  // fresh → Schema anlegen · legacy → migrieren · sonst no-op
  ensureExtraColumns(db);                 // Wave-4-Spalten NACH der Migration idempotent nachziehen
  ensureWave5(db);                        // Wave-5: Planung/Deps/Kalender/Erinnerungen (einzige Quelle)
  ensureWave6(db);                        // Wave-6: Lernprofil/Bibliothek/Teilen/Abruf/KI (einzige Quelle)
  ensureWave7(db);                        // Wave-7: Notiz-Dokumente + Anhänge an Notizen (einzige Quelle)
  ensureWave8(db);                        // Wave-8: eigene, verschachtelte Sidebar-Ordner
  return db;
}

// Nach der Multi-Tenant-Migration ergänzte Spalten (Recurrence, Postpone, DND,
// Break-Overrun) für bereits migrierte DBs idempotent nachziehen. Frische DBs
// haben sie schon aus MULTITENANT_SCHEMA → dann No-op.
function ensureExtraColumns(database) {
  if (!hasTable(database, "tasks")) return;
  const add = (t, c, ddl) => {
    if (hasTable(database, t) && !columns(database, t).includes(c)) database.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`);
  };
  add("tasks", "recurrence", "recurrence TEXT");
  add("tasks", "recur_parent_id", "recur_parent_id INTEGER");
  add("tasks", "postpone_count", "postpone_count INTEGER NOT NULL DEFAULT 0");
  add("tasks", "room", "room TEXT");
  add("tasks", "location", "location TEXT");
  add("tasks", "maps_url", "maps_url TEXT");
  add("timer_state", "break_over_since", "break_over_since INTEGER");
  add("timer_state", "break_over_notified", "break_over_notified INTEGER NOT NULL DEFAULT 0");
  add("settings", "dnd_enabled", "dnd_enabled INTEGER NOT NULL DEFAULT 0");
  add("settings", "dnd_start_min", "dnd_start_min INTEGER");
  add("settings", "dnd_end_min", "dnd_end_min INTEGER");
}

function hasTable(database, name) {
  return !!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}
function columns(database, table) {
  return database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

// Alte Single-Tenant-DBs (ohne user_id) um zwischenzeitlich ergänzte Spalten
// erweitern, damit die Multi-Tenant-Migration confidence/archived/… verlustfrei
// mitkopiert (CREATE TABLE IF NOT EXISTS legt neue Spalten nicht an).
function backfillLegacyColumns(database) {
  if (!hasTable(database, "tasks")) return;                    // ganz frische DB → nichts zu tun
  if (columns(database, "tasks").includes("user_id")) return; // bereits multi-tenant
  const add = (t, c, ddl) => {
    if (hasTable(database, t) && !columns(database, t).includes(c)) database.exec(`ALTER TABLE ${t} ADD COLUMN ${ddl}`);
  };
  add("tasks", "planned_date", "planned_date TEXT");
  add("tasks", "scheduled_min", "scheduled_min INTEGER");
  add("topics", "confidence", "confidence INTEGER NOT NULL DEFAULT 0");
  add("exams", "archived", "archived INTEGER NOT NULL DEFAULT 0");
  add("exams", "archived_at", "archived_at INTEGER");
}
