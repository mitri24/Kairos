// Abgeleiteter Health-Kontext — die Brücke zwischen gemessenen Wearable-Daten
// und der adaptiven Planung (und später der KI).
//
// Aus den letzten Tagesdatensätzen + persönlichen Baselines entsteht ein
// kompaktes, *transparentes* Readiness-Objekt: Schlafschuld, HRV-/Ruhepuls-
// Abweichung, kanonische Tagesbereitschaft und ein `capacityMultiplier`, mit dem
// die Tages-Lernlast skaliert wird — ohne je das Schlaffenster anzutasten
// (harte Constraint laut SPEC). `reasons` macht jede Empfehlung erklärbar.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round = (n, d = 0) => (n == null ? null : Number(n.toFixed(d)));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// rows: absteigend nach day_key sortierte kanonische Tagesobjekte EINER Quelle.
// profile: aus repo.getProfile() (Baselines, Schlafziel, Consent).
export function computeHealthContext(rows = [], profile = {}, now = Date.now()) {
  const goalHours = Number(profile.sleepGoalHours) > 0 ? Number(profile.sleepGoalHours) : 8;
  const reasons = [];

  if (!rows.length) {
    return {
      hasData: false,
      source: null,
      aiEnabled: !!profile.aiEnabled,
      goalHours,
      readiness: null,
      capacityMultiplier: 1,
      recommendation: "unknown",
      reasons: ["Noch keine Wearable-Daten importiert — Planung nutzt Standardannahmen."],
      generatedAt: now,
    };
  }

  const latest = rows[0];
  const source = latest.source;

  // ── Schlaf ─────────────────────────────────────────────────
  const hoursOf = (r) => (r.sleepTotalMin != null ? r.sleepTotalMin / 60 : null);
  const lastNightHours = hoursOf(latest);
  const last7 = rows.slice(0, 7).map(hoursOf).filter((x) => x != null);
  const avg7 = avg(last7);
  // Schlafschuld = aufsummiertes Defizit ggü. Ziel über die letzten 7 Nächte.
  const debt7d = last7.reduce((acc, h) => acc + Math.max(0, goalHours - h), 0);
  const deficit = lastNightHours != null ? goalHours - lastNightHours : null;

  // ── HRV / Ruhepuls ggü. persönlicher Baseline ──────────────
  const hrvBase = Number(profile.hrvBaselineMs) || avg(rows.slice(0, 14).map((r) => r.hrvMs).filter((x) => x != null));
  const rhrBase = Number(profile.restingHrBaseline) || avg(rows.slice(0, 14).map((r) => r.restingHr).filter((x) => x != null));
  const hrvDeltaPct = hrvBase && latest.hrvMs != null ? ((latest.hrvMs - hrvBase) / hrvBase) * 100 : null;
  const rhrDelta = rhrBase && latest.restingHr != null ? latest.restingHr - rhrBase : null;

  // ── Kanonische Readiness ──────────────────────────────────
  // Priorität: WHOOP-Recovery → RingConn-Readiness/Wellness → selbst abgeleitet.
  let readiness = latest.recoveryScore ?? latest.readiness ?? null;
  if (readiness == null) readiness = deriveReadiness({ lastNightHours, goalHours, hrvDeltaPct, rhrDelta });

  // ── Kapazitäts-Multiplikator (0.6 … 1.15) ─────────────────
  let mult = 1;
  if (deficit != null && deficit >= 1.5) {
    mult -= Math.min(0.25, (deficit - 1.0) * 0.12);
    reasons.push(`Letzte Nacht ${round(lastNightHours, 1)} h — ${round(deficit, 1)} h unter Ziel (${goalHours} h).`);
  } else if (deficit != null && deficit <= -0.5) {
    mult += 0.05;
    reasons.push(`Gut geschlafen (${round(lastNightHours, 1)} h ≥ Ziel).`);
  }
  if (debt7d >= 4) {
    mult -= Math.min(0.15, (debt7d - 3) * 0.03);
    reasons.push(`Schlafschuld der letzten 7 Nächte: ${round(debt7d, 1)} h.`);
  }
  if (hrvDeltaPct != null && hrvDeltaPct <= -15) {
    mult -= 0.1;
    reasons.push(`HRV ${round(hrvDeltaPct, 0)} % unter Baseline (Erholungssignal).`);
  } else if (hrvDeltaPct != null && hrvDeltaPct >= 10) {
    mult += 0.05;
    reasons.push(`HRV ${round(hrvDeltaPct, 0)} % über Baseline.`);
  }
  if (rhrDelta != null && rhrDelta >= 5) {
    mult -= 0.05;
    reasons.push(`Ruhepuls +${round(rhrDelta, 0)} bpm über Baseline.`);
  }
  if (readiness != null) {
    if (readiness < 34) { mult -= 0.1; reasons.push(`Readiness niedrig (${readiness}/100).`); }
    else if (readiness >= 67) { mult += 0.05; reasons.push(`Readiness hoch (${readiness}/100).`); }
  }
  mult = clamp(mult, 0.6, 1.15);

  const recommendation = mult >= 1.05 ? "increase" : mult <= 0.85 ? "reduce" : "maintain";
  if (!reasons.length) reasons.push("Werte im Normbereich — Plan wie vorgesehen.");

  return {
    hasData: true,
    source,
    aiEnabled: !!profile.aiEnabled,
    latestDay: latest.dayKey,
    goalHours,
    sleep: {
      lastNightHours: round(lastNightHours, 1),
      avg7dHours: round(avg7, 1),
      deficitHours: round(deficit, 1),
      debt7dHours: round(debt7d, 1),
    },
    hrv: { latestMs: round(latest.hrvMs, 0), baselineMs: round(hrvBase, 0), deltaPct: round(hrvDeltaPct, 0) },
    restingHr: { latest: round(latest.restingHr, 0), baseline: round(rhrBase, 0), delta: round(rhrDelta, 0) },
    recoveryScore: latest.recoveryScore ?? null,
    strainScore: latest.strainScore ?? null,
    readiness: readiness == null ? null : Math.round(readiness),
    capacityMultiplier: round(mult, 2),
    recommendation,
    reasons,
    generatedAt: now,
  };
}

// Fallback-Readiness, wenn das Gerät keinen eigenen Score liefert (RingConn ohne
// Wellness, reine Apple-Health-Daten): gewichteter Mix aus Schlaf-Adäquanz,
// HRV- und Ruhepuls-Abweichung, gerundet auf 0..100.
function deriveReadiness({ lastNightHours, goalHours, hrvDeltaPct, rhrDelta }) {
  if (lastNightHours == null && hrvDeltaPct == null && rhrDelta == null) return null;
  let score = 65; // neutraler Anker
  if (lastNightHours != null) score += clamp((lastNightHours - goalHours) * 12, -30, 15);
  if (hrvDeltaPct != null) score += clamp(hrvDeltaPct * 0.6, -20, 15);
  if (rhrDelta != null) score += clamp(-rhrDelta * 2, -15, 10);
  return Math.round(clamp(score, 1, 100));
}
