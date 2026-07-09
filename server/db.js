// SQLite-Zugriff über das eingebaute node:sqlite (Node 22.5+). Keine externen Deps.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Datei-Pfad: über LERNUHR_DB überschreibbar, sonst server/data/lernuhr.db
export const DB_PATH = process.env.LERNUHR_DB || join(__dirname, "data", "lernuhr.db");

let db = null;

export function getDb() {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(readFileSync(join(__dirname, "schema.sql"), "utf8"));
  migrate(db);
  return db;
}

// Idempotente Migrationen für bereits bestehende Datenbanken (CREATE TABLE IF NOT
// EXISTS legt neue Spalten nicht an).
function migrate(database) {
  const cols = database.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name);
  if (!cols.includes("planned_date")) {
    database.exec("ALTER TABLE tasks ADD COLUMN planned_date TEXT");
  }
  if (!cols.includes("scheduled_min")) {
    database.exec("ALTER TABLE tasks ADD COLUMN scheduled_min INTEGER");
  }
}
