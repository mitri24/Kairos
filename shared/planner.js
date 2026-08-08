// Reiner Auto-Tagesplaner. Kein DOM, kein Storage, kein Side-Effect.
//
// Grundidee (bewusst simpel & vorhersagbar, ADHS-freundlich): der Plan ist eine
// GEORDNETE Liste — Priorität → Deadline → manuelle Reihenfolge. Aufgaben werden
// sequenziell ab "jetzt" platziert, mit Puffer dazwischen; feste (vom Nutzer
// getimte) Blöcke und Kalender-Termine werden umflossen, nie verschoben.
// Abhängigkeiten erzwingen: erst die Grundlage, dann die Vertiefung.
import {
  DAY_START_MIN, DAY_END_MIN, SLOT_STEP_MIN, DEFAULT_DURATION_MIN,
  ceilToStep, nextFreeSlot,
} from "./daySchedule.js";

// tasks: [{ id, priority?, dueDate?, sortOrder?, estMinutes?, durationMin?,
//           scheduledMin?, schedSource?, dependsOn?: [taskId] }]
//   durationMin (falls gesetzt) ist die pace-adjustierte Plan-Dauer.
// busy:  [{ startMin, durationMin }] — Kalender-Termine u. Ä. (werden umflossen)
// doneIds: Set erledigter Task-IDs (erfüllt Abhängigkeiten)
// nowMin: heute nicht in der Vergangenheit planen (null → ab Tagesbeginn)
// capacityMin: Tageskapazität in Minuten (Readiness-skaliert); null → unbegrenzt
export function planDay({
  tasks = [],
  busy = [],
  doneIds = new Set(),
  nowMin = null,
  capacityMin = null,
  bufferMin = 10,
  dayStartMin = DAY_START_MIN,
  dayEndMin = DAY_END_MIN,
  step = SLOT_STEP_MIN,
} = {}) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const durOf = (t) => Math.max(step, Math.round(t.durationMin || t.estMinutes || DEFAULT_DURATION_MIN));

  // Vom Nutzer getimte Blöcke bleiben stehen; nur 'auto'/ungetimte werden geplant.
  const fixed = tasks.filter((t) => t.scheduledMin != null && t.schedSource !== "auto");
  const fixedIds = new Set(fixed.map((t) => t.id));
  const movable = tasks.filter((t) => !fixedIds.has(t.id));

  const occupied = [
    ...busy.filter((b) => b && Number.isFinite(b.startMin)),
    ...fixed.map((t) => ({ startMin: t.scheduledMin, durationMin: durOf(t) })),
  ];
  const fixedMin = fixed.reduce((sum, t) => sum + durOf(t), 0);

  // Endminute einer erfüllbaren Abhängigkeit (fix geplant oder bereits platziert).
  const endOf = new Map(fixed.map((t) => [t.id, t.scheduledMin + durOf(t)]));

  const order = [...movable].sort(cmpTasks);
  const placements = [];
  const blocked = [];
  const overCapacity = [];
  const overflow = [];
  const blockedIds = new Set();
  const placedIds = new Set();

  // Extern blockiert: hängt an einer unerledigten Aufgabe außerhalb des Tages.
  for (const t of order) {
    const missing = (t.dependsOn || []).filter((id) => !doneIds.has(id) && !byId.has(id));
    if (missing.length) { blocked.push({ id: t.id, missing }); blockedIds.add(t.id); }
  }

  const floor = ceilToStep(Math.max(dayStartMin, nowMin ?? dayStartMin), step);
  let cursor = floor;          // sequenzieller Zeiger: Ende des zuletzt platzierten Blocks + Puffer
  let usedMin = fixedMin;      // feste Blöcke zählen in die Tageskapazität
  let stopped = null;          // "capacity" | "overflow" — Stop-the-line, ehrlich statt Lücken stopfen

  // Topologische Wellen: eine Aufgabe ist dran, sobald alle Abhängigkeiten
  // erledigt, fix geplant oder bereits platziert sind.
  let pending = order.filter((t) => !blockedIds.has(t.id));
  while (pending.length && !stopped) {
    let progressed = false;
    const rest = [];
    for (const t of pending) {
      if (stopped) { rest.push(t); continue; }
      const deps = (t.dependsOn || []).filter((id) => !doneIds.has(id));
      if (deps.some((id) => blockedIds.has(id))) {
        blocked.push({ id: t.id, missing: deps.filter((id) => blockedIds.has(id)) });
        blockedIds.add(t.id);
        progressed = true;
        continue;
      }
      if (deps.some((id) => !endOf.has(id))) { rest.push(t); continue; } // Abhängigkeit noch nicht platziert

      const d = durOf(t);
      if (capacityMin != null && usedMin + d > capacityMin) { stopped = "capacity"; rest.push(t); continue; }
      const earliest = Math.max(cursor, ...deps.map((id) => endOf.get(id) + bufferMin));
      const startMin = nextFreeSlot(occupied, d, earliest, { step, dayEnd: dayEndMin });
      if (startMin + d > dayEndMin) { stopped = "overflow"; rest.push(t); continue; }

      placements.push({ id: t.id, startMin, durationMin: d });
      occupied.push({ startMin, durationMin: d });
      endOf.set(t.id, startMin + d);
      placedIds.add(t.id);
      cursor = ceilToStep(startMin + d + bufferMin, step);
      usedMin += d;
      progressed = true;
    }
    if (stopped) {
      // Rest ehrlich ausweisen: Tag ist (kapazitäts- oder zeitmäßig) voll.
      const bucket = stopped === "capacity" ? overCapacity : overflow;
      for (const t of rest) if (!blockedIds.has(t.id)) bucket.push(t.id);
      pending = [];
      break;
    }
    if (!progressed) {
      // Zyklus: gegenseitige Abhängigkeiten — als blockiert ausweisen.
      for (const t of rest) {
        const missing = (t.dependsOn || []).filter((id) => !doneIds.has(id) && !endOf.has(id));
        blocked.push({ id: t.id, missing });
        blockedIds.add(t.id);
      }
      pending = [];
      break;
    }
    pending = rest;
  }

  return {
    placements,
    kept: fixed.map((t) => t.id),
    blocked,
    overCapacity,
    overflow,
    plannedMin: usedMin,
    fixedMin,
    capacityMin,
  };
}

// Reihenfolge: Priorität (1 zuerst) → Deadline (früh zuerst, ohne zuletzt) →
// manuelle Sortierung → ID (stabil).
export function cmpTasks(a, b) {
  const pa = a.priority ?? 2;
  const pb = b.priority ?? 2;
  if (pa !== pb) return pa - pb;
  const da = a.dueDate ?? Infinity;
  const db = b.dueDate ?? Infinity;
  if (da !== db) return da - db;
  const sa = a.sortOrder ?? 0;
  const sb = b.sortOrder ?? 0;
  if (sa !== sb) return sa - sb;
  return (a.id ?? 0) - (b.id ?? 0);
}
