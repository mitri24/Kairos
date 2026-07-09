// Tests für die Health-/Profil-Backend-API: Normalisierung (RingConn/WHOOP),
// Persistenz (Upsert-Merge), Readiness-Kontext und die HTTP-Schicht (handleApi
// inkl. Query-Parsing). Kein offener Port — Module direkt, DB auf Tempdatei.
import test from "node:test";
import { after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { Readable } from "node:stream";

const DB_FILE = join(tmpdir(), `lernuhr-health-${randomUUID()}.db`);
process.env.LERNUHR_DB = DB_FILE;

// Import NACH dem Setzen von LERNUHR_DB (server/db.js wertet DB_PATH beim Laden aus).
const repo = await import("../server/repo.js");
const routes = await import("../server/routes.js");
const { normalizeDaily, normalizeSamples, normalizeSource } = await import("../server/health/normalize.js");
const { computeHealthContext } = await import("../server/health/context.js");

after(() => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try { rmSync(DB_FILE + suffix, { force: true }); } catch { /* ignore */ }
  }
});

// Fake http.IncomingMessage für handleApi.
function mkReq(method, url, body) {
  const req = Readable.from(body != null ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = url;
  return req;
}
const pathOf = (url) => url.split("?")[0];
const call = (method, url, body) => routes.handleApi(mkReq(method, url, body), pathOf(url));

// Beispiel-Exporte
const ringConnDay = {
  date: "2026-07-08",
  sleep: {
    start: "2026-07-07T23:10:00", end: "2026-07-08T06:40:00",
    totalMinutes: 430, deepMinutes: 90, remMinutes: 100, lightMinutes: 230,
    awakeMinutes: 10, score: 82, efficiency: 94,
  },
  restingHeartRate: 54, heartRate: { avg: 62, min: 48, max: 120 },
  hrv: 65, spo2: { avg: 97, min: 94 },
  skinTemperature: 33.2, skinTemperatureDelta: -0.2,
  steps: 8200, activeCalories: 540, stress: 34, wellnessScore: 78,
};
const whoopDay = {
  date: "2026-07-08",
  recovery: { score: { recovery_score: 71, hrv_rmssd_milli: 68, resting_heart_rate: 53, spo2_percentage: 97, skin_temp_celsius: 33.1 } },
  sleep: {
    start: "2026-07-07T23:00:00Z", end: "2026-07-08T06:30:00Z",
    score: {
      stage_summary: {
        total_slow_wave_sleep_time_milli: 5_400_000, total_rem_sleep_time_milli: 6_000_000,
        total_light_sleep_time_milli: 13_800_000, total_awake_time_milli: 600_000,
      },
      sleep_performance_percentage: 84, sleep_efficiency_percentage: 93,
    },
  },
  cycle: { score: { strain: 12.4, average_heart_rate: 61, max_heart_rate: 150, kilojoule: 9000 } },
};

// ── Quellen-Alias-Normalisierung ─────────────────
test("normalizeSource führt Aliasse zusammen", () => {
  assert.equal(normalizeSource("RingConn"), "ringconn");
  assert.equal(normalizeSource("ring-conn"), "ringconn");
  assert.equal(normalizeSource("WHOOP 4.0"), "whoop");
  assert.equal(normalizeSource("HealthKit"), "apple_health");
  assert.equal(normalizeSource(""), "manual");
  assert.equal(normalizeSource("fitbit"), "generic");
});

// ── RingConn-Mapping ─────────────────────────────
test("normalizeDaily(ringconn) mappt Felder und löst den Tag auf", () => {
  const n = normalizeDaily("ringconn", ringConnDay);
  assert.equal(n.dayKey, "2026-07-08");
  assert.equal(n.source, "ringconn");
  assert.equal(n.cols.sleep_total_min, 430);
  assert.equal(n.cols.sleep_deep_min, 90);
  assert.equal(n.cols.resting_hr, 54);
  assert.equal(n.cols.hrv_ms, 65);
  assert.equal(n.cols.spo2_avg, 97);
  assert.equal(n.cols.stress_avg, 34);
  assert.equal(n.cols.readiness, 78); // wellnessScore → readiness
  assert.ok(n.cols.sleep_start > 0 && n.cols.sleep_end > n.cols.sleep_start);
});

// ── WHOOP-Mapping inkl. Einheiten-Umrechnung ─────
test("normalizeDaily(whoop) rechnet ms→min und kJ→kcal um", () => {
  const n = normalizeDaily("whoop", whoopDay);
  assert.equal(n.dayKey, "2026-07-08");
  assert.equal(n.cols.sleep_deep_min, 90);   // 5_400_000 ms
  assert.equal(n.cols.sleep_rem_min, 100);
  assert.equal(n.cols.sleep_light_min, 230);
  assert.equal(n.cols.sleep_total_min, 420); // Summe der Phasen
  assert.equal(n.cols.recovery_score, 71);
  assert.equal(n.cols.strain_score, 12.4);
  assert.equal(n.cols.hrv_ms, 68);
  assert.equal(Math.round(n.cols.active_calories), 2151); // 9000 kJ / 4.184
});

// ── Bereichs-Clamping ────────────────────────────
test("coerceDaily klemmt unplausible Werte statt sie zu verwerfen", () => {
  const n = normalizeDaily("manual", { date: "2026-07-08", spo2Avg: 130, hrvMs: -5, restingHr: 55 });
  assert.equal(n.cols.spo2_avg, 100); // auf max geklemmt
  assert.equal(n.cols.hrv_ms, 0);     // auf min geklemmt
  assert.equal(n.cols.resting_hr, 55);
});

// ── Upsert-Merge ─────────────────────────────────
test("upsertDaily behält bestehende Felder bei Teil-Import", () => {
  repo.upsertDaily({ dayKey: "2026-06-01", source: "ringconn", cols: { sleep_total_min: 420, resting_hr: 55 }, raw: { a: 1 } });
  repo.upsertDaily({ dayKey: "2026-06-01", source: "ringconn", cols: { hrv_ms: 60 } });
  const d = repo.getDaily("2026-06-01", "ringconn");
  assert.equal(d.sleepTotalMin, 420); // erhalten
  assert.equal(d.restingHr, 55);      // erhalten
  assert.equal(d.hrvMs, 60);          // ergänzt
  assert.deepEqual(d.raw, { a: 1 });  // raw erhalten
});

// ── Listen / Latest / Kontextquelle ──────────────
test("listDaily filtert nach Zeitraum & Quelle; resolveContextSource bevorzugt primaryDevice", () => {
  repo.upsertDaily({ dayKey: "2026-06-02", source: "ringconn", cols: { sleep_total_min: 400 } });
  repo.upsertDaily({ dayKey: "2026-06-02", source: "whoop", cols: { sleep_total_min: 410 } });

  const ring = repo.listDaily({ from: "2026-06-01", to: "2026-06-30", source: "ringconn" });
  assert.ok(ring.length >= 2);
  assert.ok(ring.every((r) => r.source === "ringconn"));
  // Absteigend nach Tag
  assert.ok(ring[0].dayKey >= ring[ring.length - 1].dayKey);

  repo.saveProfile({ primaryDevice: "whoop" });
  assert.equal(repo.resolveContextSource(), "whoop");
  repo.saveProfile({ primaryDevice: "ringconn" });
  assert.equal(repo.resolveContextSource(), "ringconn");
});

// ── Profil + Consent ─────────────────────────────
test("saveProfile aktualisiert partiell und setzt Consent-Zeitstempel", () => {
  const p0 = repo.getProfile();
  assert.equal(p0.aiEnabled, false);
  assert.equal(p0.sleepGoalHours, 8);

  const p1 = repo.saveProfile({ displayName: "Mira", sleepGoalHours: 7.5, aiEnabled: true });
  assert.equal(p1.displayName, "Mira");
  assert.equal(p1.sleepGoalHours, 7.5);
  assert.equal(p1.aiEnabled, true);
  assert.ok(p1.dataConsentAt > 0);

  // displayName bleibt bei weiterem Teil-Update erhalten
  const p2 = repo.saveProfile({ chronotype: "late" });
  assert.equal(p2.displayName, "Mira");
  assert.equal(p2.chronotype, "late");
});

// ── Readiness-Kontext: Reduzieren ────────────────
test("computeHealthContext empfiehlt reduzieren bei Schlafmangel + niedriger Readiness", () => {
  const rows = [
    { dayKey: "2026-07-08", source: "ringconn", sleepTotalMin: 300, hrvMs: 50, restingHr: 60, readiness: 30 },
    { dayKey: "2026-07-07", source: "ringconn", sleepTotalMin: 330 },
    { dayKey: "2026-07-06", source: "ringconn", sleepTotalMin: 320 },
  ];
  const ctx = computeHealthContext(rows, { sleepGoalHours: 8, hrvBaselineMs: 70, restingHrBaseline: 52 }, 1_000_000);
  assert.equal(ctx.hasData, true);
  assert.equal(ctx.source, "ringconn");
  assert.equal(ctx.recommendation, "reduce");
  assert.ok(ctx.capacityMultiplier < 1);
  assert.ok(ctx.sleep.deficitHours > 0);
  assert.ok(ctx.sleep.debt7dHours > 0);
  assert.ok(ctx.reasons.length > 0);
});

// ── Readiness-Kontext: Steigern & Fallback-Readiness ─
test("computeHealthContext erlaubt mehr Last bei guter Erholung", () => {
  const rows = [{ dayKey: "2026-07-08", source: "whoop", sleepTotalMin: 540, hrvMs: 80, restingHr: 48, recoveryScore: 80 }];
  const ctx = computeHealthContext(rows, { sleepGoalHours: 8, hrvBaselineMs: 70, restingHrBaseline: 52 }, 1_000_000);
  assert.equal(ctx.recommendation, "increase");
  assert.ok(ctx.capacityMultiplier > 1);
  assert.equal(ctx.readiness, 80); // WHOOP-Recovery

  // Ohne Geräte-Score wird Readiness abgeleitet (0..100)
  const derived = computeHealthContext(
    [{ dayKey: "2026-07-08", source: "ringconn", sleepTotalMin: 480, hrvMs: 70, restingHr: 52 }],
    { sleepGoalHours: 8 }, 1_000_000,
  );
  assert.ok(derived.readiness >= 1 && derived.readiness <= 100);
});

test("computeHealthContext ohne Daten liefert neutralen Standard", () => {
  const ctx = computeHealthContext([], { sleepGoalHours: 8 }, 1_000_000);
  assert.equal(ctx.hasData, false);
  assert.equal(ctx.capacityMultiplier, 1);
  assert.equal(ctx.recommendation, "unknown");
});

// ── Samples ──────────────────────────────────────
test("normalizeSamples akzeptiert beide Formen; insert/list funktioniert", () => {
  const a = normalizeSamples("ringconn", [{ metric: "heart_rate", t: "2026-07-08T10:00:00Z", value: 72, unit: "bpm" }]);
  assert.equal(a.length, 1);
  assert.equal(a[0].metric, "heart_rate");
  assert.ok(a[0].t > 0);

  const b = normalizeSamples("ringconn", { spo2: [{ t: "2026-07-08T10:05:00Z", value: 98 }, { t: "2026-07-08T10:06:00Z", value: 97 }] });
  assert.equal(b.length, 2);

  const n = repo.insertSamples([...a, ...b]);
  assert.equal(n, 3);
  const hr = repo.listSamples({ metric: "heart_rate" });
  assert.ok(hr.some((s) => s.value === 72));
});

// ── HTTP-Schicht: Import + Query-Parsing ─────────
test("handleApi: /api/health/import speist Daten ein und liefert Kontext", async () => {
  const res = await call("POST", "/api/health/import", { source: "ringconn", days: [ringConnDay] });
  assert.equal(res.status, 200);
  assert.equal(res.body.source, "ringconn");
  assert.equal(res.body.imported, 1);
  assert.equal(res.body.skipped, 0);
  assert.ok(res.body.context);
  assert.equal(res.body.context.hasData, true);
});

test("handleApi: /api/health/latest liest den source-Query-Parameter", async () => {
  const res = await call("GET", "/api/health/latest?source=RingConn");
  assert.equal(res.status, 200);
  assert.equal(res.body.source, "ringconn");
  assert.ok(res.body.day);
  assert.equal(res.body.day.dayKey, "2026-07-08");
});

test("handleApi: einzelner Tag ohne day/date wird abgelehnt (400)", async () => {
  await assert.rejects(
    () => call("POST", "/api/health/daily", { source: "ringconn", hrvMs: 60 }),
    (err) => err.status === 400,
  );
});

test("handleApi: /api/health/da/:day fällt bei unbekannter Route auf null", async () => {
  const res = await routes.handleApi(mkReq("GET", "/api/unknown"), "/api/unknown");
  assert.equal(res, null);
});
