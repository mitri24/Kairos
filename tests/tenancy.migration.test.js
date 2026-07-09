// Verifiziert die Stufe-1-Migration Single-Tenant → Multi-Tenant (server/migrations/multitenant.mjs):
// Verlustfreiheit, Owner-Backfill, PK-Umbau (daily_metrics/health_daily), Idempotenz,
// fehlende Health-Tabellen und Frischinstallation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  migrateToMultiTenant, createFreshSchema, isMultiTenant, SCHEMA_VERSION,
} from "../server/migrations/multitenant.mjs";

// ── Legacy-Schema (Stand VOR der Migration) ──────────────────────────
const LEGACY_SCHEMA = `
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id=1),
  focus_minutes INTEGER NOT NULL DEFAULT 25, short_break_minutes INTEGER NOT NULL DEFAULT 5,
  long_break_minutes INTEGER NOT NULL DEFAULT 15, cycles_until_long_break INTEGER NOT NULL DEFAULT 4,
  auto_start_next_phase INTEGER NOT NULL DEFAULT 0, today_goal_hours REAL NOT NULL DEFAULT 4,
  profile_name TEXT NOT NULL DEFAULT 'Prüfungsfokus', active_exam_id INTEGER);
CREATE TABLE timer_state (id INTEGER PRIMARY KEY CHECK (id=1), status TEXT NOT NULL DEFAULT 'idle',
  phase TEXT NOT NULL DEFAULT 'focus', cycle_in_block INTEGER NOT NULL DEFAULT 0,
  remaining_ms INTEGER NOT NULL DEFAULT 1500000, ends_at INTEGER, active_task_id INTEGER,
  phase_started_at INTEGER, updated_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE exams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT 'Prüfung',
  exam_date INTEGER, total_hours REAL NOT NULL DEFAULT 0, color TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, text TEXT NOT NULL, subject TEXT,
  priority INTEGER NOT NULL DEFAULT 2, due_date INTEGER, planned_date TEXT, est_minutes INTEGER NOT NULL DEFAULT 25,
  scheduled_min INTEGER, done INTEGER NOT NULL DEFAULT 0, done_at INTEGER, spent_ms INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE subtasks (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE topics (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, phase TEXT NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER, focus_ms INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE daily_metrics (day_key TEXT PRIMARY KEY, focus_ms INTEGER NOT NULL DEFAULT 0,
  sessions_done INTEGER NOT NULL DEFAULT 0);
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE push_subscriptions (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  user_agent TEXT, created_at INTEGER NOT NULL, last_ok_at INTEGER);
`;

const HEALTH_LEGACY = `
CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK (id=1), display_name TEXT, birth_date TEXT, sex TEXT,
  height_cm REAL, weight_kg REAL, timezone TEXT, chronotype TEXT, adhd INTEGER NOT NULL DEFAULT 0,
  conditions TEXT, primary_device TEXT NOT NULL DEFAULT 'ringconn', sleep_goal_hours REAL NOT NULL DEFAULT 8,
  target_bedtime TEXT, target_wake_time TEXT, resting_hr_baseline REAL, hrv_baseline_ms REAL,
  ai_enabled INTEGER NOT NULL DEFAULT 0, ai_notes TEXT, data_consent_at INTEGER, updated_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE health_daily (day_key TEXT NOT NULL, source TEXT NOT NULL, sleep_start INTEGER, sleep_end INTEGER,
  sleep_total_min INTEGER, sleep_deep_min INTEGER, sleep_rem_min INTEGER, sleep_light_min INTEGER,
  sleep_awake_min INTEGER, sleep_efficiency REAL, sleep_score INTEGER, resting_hr REAL, avg_hr REAL, min_hr REAL,
  max_hr REAL, hrv_ms REAL, respiratory_rate REAL, spo2_avg REAL, spo2_min REAL, skin_temp_c REAL,
  skin_temp_delta_c REAL, steps INTEGER, active_calories REAL, total_calories REAL, activity_min INTEGER,
  distance_m REAL, recovery_score INTEGER, strain_score REAL, stress_avg REAL, readiness INTEGER, raw_json TEXT,
  recorded_at INTEGER, imported_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (day_key, source));
CREATE TABLE health_samples (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, metric TEXT NOT NULL,
  t INTEGER NOT NULL, value REAL NOT NULL, unit TEXT);
`;

function seedLegacy(db, { withHealth = true } = {}) {
  db.exec(LEGACY_SCHEMA);
  if (withHealth) db.exec(HEALTH_LEGACY);
  db.exec("INSERT INTO settings (id, focus_minutes, profile_name) VALUES (1, 30, 'Test')");
  db.exec("INSERT INTO timer_state (id, status, remaining_ms) VALUES (1, 'running', 1234000)");
  db.exec("INSERT INTO exams (name, created_at) VALUES ('Mathe', 100), ('Bio', 101)");
  db.exec("INSERT INTO tasks (text, created_at) VALUES ('A', 1), ('B', 2), ('C', 3)");
  db.exec("INSERT INTO subtasks (task_id, text, created_at) VALUES (1, 'a1', 1)");
  db.exec("INSERT INTO topics (text, created_at) VALUES ('T1', 1), ('T2', 2)");
  db.exec("INSERT INTO sessions (phase, started_at, focus_ms, created_at) VALUES ('focus', 1, 500, 1)");
  db.exec("INSERT INTO daily_metrics (day_key, focus_ms, sessions_done) VALUES ('2026-07-01', 900, 3), ('2026-07-02', 100, 1)");
  db.exec("INSERT INTO app_meta (key, value) VALUES ('vapid_public_key', 'PUB'), ('vapid_private_key', 'PRIV')");
  db.exec("INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES ('https://push/x', 'p', 'a', 1)");
  if (withHealth) {
    db.exec("INSERT INTO profile (id, display_name, adhd) VALUES (1, 'Mira', 1)");
    db.exec("INSERT INTO health_daily (day_key, source, resting_hr, imported_at, updated_at) VALUES ('2026-07-01','ringconn',52,1,1)");
    db.exec("INSERT INTO health_samples (source, metric, t, value) VALUES ('ringconn','heart_rate',1,60)");
  }
}

const countsOf = (db, tables) =>
  Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c]));

test("Migration: verlustfrei, alle Zeilen dem Owner zugeordnet", () => {
  const db = new DatabaseSync(":memory:");
  seedLegacy(db);
  // app_meta bewusst ausgeklammert: global, gewinnt legitim die schema_version-Zeile hinzu.
  const before = countsOf(db, ["exams", "tasks", "subtasks", "topics", "sessions", "daily_metrics",
    "push_subscriptions", "health_daily", "health_samples"]);

  const res = migrateToMultiTenant(db, "Mira@Example.com ");
  assert.equal(res.migrated, true);
  assert.equal(res.ownerEmail, "mira@example.com"); // normalisiert
  assert.ok(res.ownerId >= 1);

  // Zeilenzahlen unverändert (kein Verlust, keine Duplikate).
  const after = countsOf(db, Object.keys(before));
  assert.deepEqual(after, before, "Zeilenzahlen müssen erhalten bleiben");

  // Singletons sind jetzt über user_id verschlüsselt und tragen die Werte.
  const s = db.prepare("SELECT * FROM settings").get();
  assert.equal(s.user_id, res.ownerId);
  assert.equal(s.focus_minutes, 30);
  assert.equal(s.profile_name, "Test");
  const ts = db.prepare("SELECT * FROM timer_state").get();
  assert.equal(ts.user_id, res.ownerId);
  assert.equal(ts.status, "running");
  assert.equal(ts.remaining_ms, 1234000);
  assert.equal(db.prepare("SELECT display_name FROM profile WHERE user_id=?").get(res.ownerId).display_name, "Mira");

  // Jede Sammlungszeile gehört dem Owner (keine NULL/fremde user_id).
  for (const t of ["exams", "tasks", "subtasks", "topics", "sessions", "daily_metrics",
    "health_daily", "health_samples", "push_subscriptions"]) {
    const bad = db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE user_id IS NOT ${res.ownerId}`).get().c;
    assert.equal(bad, 0, `${t}: alle Zeilen müssen user_id=${res.ownerId} haben`);
  }

  // Globale app_meta bleibt (VAPID-Keys erhalten), schema_version gesetzt.
  assert.equal(db.prepare("SELECT value FROM app_meta WHERE key='vapid_private_key'").get().value, "PRIV");
  assert.equal(db.prepare("SELECT value FROM app_meta WHERE key='schema_version'").get().value, String(SCHEMA_VERSION));
  assert.ok(isMultiTenant(db));
  db.close();
});

test("Migration: PK-Umbau erlaubt zweiten Nutzer mit gleichem day_key/source", () => {
  const db = new DatabaseSync(":memory:");
  seedLegacy(db);
  const { ownerId } = migrateToMultiTenant(db, "owner@localhost");

  const now = 1;
  db.prepare("INSERT INTO users (email, verified, created_at) VALUES ('two@x', 1, ?)").run(now);
  const u2 = db.prepare("SELECT id FROM users WHERE email='two@x'").get().id;
  assert.notEqual(u2, ownerId);

  // Gleicher day_key wie der Owner darf für u2 KEINE PK-Kollision geben.
  db.prepare("INSERT INTO daily_metrics (user_id, day_key, focus_ms) VALUES (?, '2026-07-01', 42)").run(u2);
  db.prepare("INSERT INTO health_daily (user_id, day_key, source, imported_at, updated_at) VALUES (?, '2026-07-01','ringconn',1,1)").run(u2);
  assert.equal(db.prepare("SELECT focus_ms FROM daily_metrics WHERE user_id=? AND day_key='2026-07-01'").get(u2).focus_ms, 42);
  assert.equal(db.prepare("SELECT focus_ms FROM daily_metrics WHERE user_id=? AND day_key='2026-07-01'").get(ownerId).focus_ms, 900);
  db.close();
});

test("Migration: idempotent (zweiter Aufruf ändert nichts)", () => {
  const db = new DatabaseSync(":memory:");
  seedLegacy(db);
  const first = migrateToMultiTenant(db, "owner@localhost");
  const usersAfter1 = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  const tasksAfter1 = db.prepare("SELECT COUNT(*) c FROM tasks").get().c;

  const second = migrateToMultiTenant(db, "owner@localhost");
  assert.equal(second.migrated, false, "zweiter Lauf darf nicht erneut migrieren");
  assert.equal(second.ownerId, first.ownerId);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM users").get().c, usersAfter1);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM tasks").get().c, tasksAfter1);
  db.close();
});

test("Migration: Legacy-DB OHNE Health-Tabellen (wie die reale DB)", () => {
  const db = new DatabaseSync(":memory:");
  seedLegacy(db, { withHealth: false });
  const res = migrateToMultiTenant(db, "owner@localhost");
  assert.equal(res.migrated, true);
  // Health-/profile-Tabellen werden leer angelegt, Owner bekommt frisches Profil beim Bootstrap (später).
  assert.equal(db.prepare("SELECT COUNT(*) c FROM health_daily").get().c, 0);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM profile").get().c, 0);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM tasks").get().c, 3);
  db.close();
});

test("Frischinstallation: leere DB bekommt Multi-Tenant-Schema, keine Nutzer", () => {
  const db = new DatabaseSync(":memory:");
  const res = migrateToMultiTenant(db, "owner@localhost");
  assert.equal(res.migrated, false);
  assert.ok(isMultiTenant(db));
  assert.equal(db.prepare("SELECT COUNT(*) c FROM users").get().c, 0);
  db.close();
});
