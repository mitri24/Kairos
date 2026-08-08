// Task-Erinnerungen per Push: "gleich dran" (Vorlauf, konfigurierbar) und
// "jetzt dran" (Startminute) für getimte Aufgaben des Tages. Läuft als eigene
// Schleife über ALLE Nutzer mit Push-Abo (der Timer-Tick sieht nur laufende
// Timer). Dedup über tasks.remind_for/remind_stage — ein Slot erinnert genau
// einmal je Stufe; wird die Aufgabe umgeplant, zählt der neue Slot frisch.
// Ruhezeiten (DND): Stufe wird gesetzt, aber nicht gesendet (kein Nachhol-Spam).
import * as repo from "./repo.js";
import * as push from "./push.js";
import { runAs } from "./authctx.js";
import { nowMs, dayKeyTz, localMinutesInTz } from "./lib/util.js";
import { isQuietTime } from "../shared/quietHours.js";

const START_WINDOW_MIN = 5;   // "jetzt dran" nur in den ersten 5 min (danach greift der Overdue-Flow)

export function checkTaskReminders(now = nowMs()) {
  for (const userId of repo.pushUserIds()) {
    try {
      runAs(userId, () => checkUser(userId, now));
    } catch (err) {
      console.warn(`[Kairos] Erinnerungen (Nutzer ${userId}): ${err.message}`);
    }
  }
}

function checkUser(userId, now) {
  const settings = repo.getSettings();
  if (!settings.remindTasks) return;
  const tz = repo.getProfile()?.timezone || null;
  const dayKey = dayKeyTz(new Date(now), tz);
  const nowMin = localMinutesInTz(now, tz);
  const quiet = settings.dndEnabled && isQuietTime(nowMin, {
    enabled: true, startMin: settings.dndStartMin, endMin: settings.dndEndMin,
  });
  const lead = Math.max(0, settings.remindLeadMin ?? 10);

  for (const t of repo.scheduledTasksForDay(dayKey)) {
    const key = `${dayKey}:${t.scheduledMin}`;
    const stage = t.remindFor === key ? t.remindStage : 0;   // umgeplant → Stufen zählen neu

    if (stage < 1 && lead > 0 && nowMin >= t.scheduledMin - lead && nowMin < t.scheduledMin) {
      repo.setTaskRemindStage(t.id, key, 1);
      if (!quiet) {
        const minutes = Math.max(1, Math.round(t.scheduledMin - nowMin));
        push.notifyTaskReminder({ userId, task: t, kind: "upcoming", minutes })
          .catch((err) => console.warn(`[Kairos] Push (Task-Vorlauf): ${err.message}`));
      }
    } else if (stage < 2 && nowMin >= t.scheduledMin && nowMin <= t.scheduledMin + START_WINDOW_MIN) {
      repo.setTaskRemindStage(t.id, key, 2);
      if (!quiet) {
        push.notifyTaskReminder({ userId, task: t, kind: "start" })
          .catch((err) => console.warn(`[Kairos] Push (Task-Start): ${err.message}`));
      }
    }
  }
}
