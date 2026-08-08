// Reine Streak-Berechnung mit Konzentration-freundlichem Gnadentag: ein einzelner Fehltag
// bricht die Serie NICHT (er wird übersprungen und verbraucht die „Gnade"); erst
// ein zweiter (ununterbrochen fehlender) Tag beendet die Serie. Kein Side-Effect.
//
// metrics: { "YYYY-MM-DD": { focusMs } }  — wie store.recentMetrics.
// Rückgabe: { streak, graceUsed, graceDays } (streak = Anzahl aktiver Tage).
import { addDaysKey } from "./dateKey.js";

export function computeStreak(metrics, todayKey, opts = {}) {
  const graceDays = opts.graceDays ?? 1;
  const minFocusMs = opts.minFocusMs ?? 1;
  const m = metrics || {};
  const active = (k) => (((m[k] && m[k].focusMs) || 0) >= minFocusMs);

  let k = todayKey;
  // Heute noch nicht begonnen → zählt nicht als Fehltag (Serie läuft bis gestern).
  if (!active(k)) k = addDaysKey(k, -1);

  let streak = 0;
  let graceUsed = 0;
  let pendingGaps = 0;                        // übersprungene Fehltage, noch nicht durch aktiven Tag bestätigt
  for (let i = 0; i < 3660; i++) {            // harte Obergrenze gegen Endlosschleifen
    if (active(k)) {
      streak++;
      graceUsed += pendingGaps;               // Gnade zählt erst, wenn sie zu weiteren aktiven Tagen brückt
      pendingGaps = 0;
      k = addDaysKey(k, -1);
      continue;
    }
    if (graceUsed + pendingGaps < graceDays) { pendingGaps++; k = addDaysKey(k, -1); continue; }
    break;                                    // Gnade erschöpft → Serie endet (nachlaufende Gnade verfällt)
  }
  return { streak, graceUsed, graceDays };
}
