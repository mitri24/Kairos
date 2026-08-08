// Leichtgewichtige i18n-Schicht (Gerüst + Umschalter). Englisch ist Standard,
// Deutsch als zweite Sprache. Dynamische Module rufen t(key, params); statisches
// HTML wird über data-i18n / data-i18n-ph / data-i18n-title / data-i18n-aria
// befüllt. Beim Sprachwechsel: Persistenz + <html lang> + „langchange"-Event
// (main.js löst darauf ein Re-Render aller Ansichten aus).

const CATALOG = {
  en: {
    // Navigation / Titel
    "nav.today": "Today", "nav.week": "Week", "nav.exam": "Module", "nav.notes": "Notes",
    "nav.library": "Library", "nav.journal": "Journal", "nav.path": "Path", "nav.knowledge": "Methods",
    "nav.g_plan": "Plan", "nav.g_learn": "Learn", "nav.g_understand": "Understand",
    "nav.health": "Health", "nav.insights": "Insights", "nav.profile": "Profile",
    "nav.exam_list": "Show/hide the module list",
    "nav.back": "Back", "nav.back_none": "Nothing to go back to",
    // Prüfungs-Workspace: Tabs
    "exam.tab_topics": "Topics", "exam.tab_notes": "Notes", "exam.tab_path": "Path",
    // Gemeinsame Aktionen
    "common.saved": "Saved", "common.cancel": "Cancel", "common.save": "Save", "common.close": "Close",
    "common.delete": "Delete", "common.undo": "Undo", "common.today": "Today", "common.tomorrow": "Tomorrow",
    "common.done": "Done", "common.back_today": "Back to Today",
    // Today-Kopf
    "today.new_task": "New task", "today.search": "Search",
    // Timer-Pille
    "timer.left": "left", "timer.no_task": "No task selected",
    "timer.open_focus": "Open focus mode", "timer.start_pause": "Start / pause",
    // Overdue / Wiedereinstieg (Batch)
    "overdue.title_one": "Missed block", "overdue.title_many": "{n} missed blocks",
    "overdue.subtitle": "Missed ≠ failed. Pick up where it fits — one tap does them all.",
    "overdue.was_due": "was due {time}",
    "overdue.reschedule": "Reschedule", "overdue.mark_done": "I did it", "overdue.tomorrow": "Tomorrow",
    "overdue.drop": "Drop", "overdue.later": "Later",
    "overdue.reschedule_all": "Reschedule all to free time", "overdue.tomorrow_all": "Move all to tomorrow",
    "overdue.done_all": "Mark all done", "overdue.dropped": "Dropped “{text}”",
    "overdue.moved_n": "moved {n}×", "overdue.break_down": "Keeps slipping — break it smaller?",
    // Positiver Tagesabschluss
    "dayend.wrap_up": "Wrap up day",
    "dayend.title_goal": "Goal reached — nice", "dayend.title_done": "All done for today",
    "dayend.title_manual": "Today, wrapped",
    "dayend.focus_time": "Focused", "dayend.tasks_done": "Tasks done", "dayend.streak": "Day streak",
    "dayend.encourage": "Rest is part of the plan. See you tomorrow.",
    "dayend.close": "Close for today",
    // Pausen-Overrun (In-App-Toast)
    "overrun.toast_min": "Break ended {n} min ago — ready to focus?",
    "overrun.toast_now": "Break's over — ready to focus?",
    "overrun.resume": "Start focus",
    // Globale Suche
    "search.placeholder": "Search tasks, notes, modules…", "search.empty": "No matches.",
    "search.hint": "↑↓ to move · ↵ to open · esc to close",
    "search.g_tasks": "Tasks", "search.g_notes": "Notes", "search.g_exams": "Modules", "search.g_topics": "Topics",
    // Wiederholung
    "recur.label": "Repeat", "recur.none": "Doesn't repeat", "recur.daily": "Daily",
    "recur.weekdays": "Weekdays (Mon–Fri)", "recur.weekly": "Weekly",
    // Profil: Sprache / Ruhezeiten / Zeitzone / Export
    "profile.language": "Language", "profile.dnd": "Quiet hours (no notifications)",
    "profile.dnd_from": "From", "profile.dnd_to": "To", "profile.timezone": "Time zone",
    "profile.tz_auto": "detected automatically", "profile.export_ics": "Export .ics",
    "profile.quiet_now": "Quiet hours active now",
    // Insights
    "insights.grace_used": "grace day used",
    "insights.pace_title": "Estimates vs reality",
    "insights.pace_sub": "how long things really take you",
    "insights.pace_row": "plan ×{f} · {n} done",
    "insights.pace_empty": "Finish estimated tasks and Kairos learns your real pace.",
    // Sprachaufnahme
    "voice.button": "Say it", "voice.title": "Say your tasks",
    "voice.listening": "Listening…", "voice.tap_to_talk": "Tap the mic and talk",
    "voice.hey_mode": "Hey mode — keep listening, start lines with “hey”",
    "voice.retry": "Record again", "voice.create": "Add {n} tasks", "voice.create_one": "Add task",
    "voice.empty": "Nothing captured yet.", "voice.discard": "Discard",
    "voice.suggest_history": "~{min} min — your real pace", "voice.suggest_baseline": "~{min} min to start with",
    "voice.learn_found": "Found for “{q}”", "voice.learn_none": "No material yet for “{q}” — ideas:",
    "voice.verdict_learn": "worth learning", "voice.verdict_refresh": "just refresh it",
    "voice.verdict_covered": "already solid", "voice.exam_in": "{exam} · {n} d left",
    "voice.method_notebooklm": "NotebookLM video/audio overview",
    "voice.method_summary": "Write a summary sheet",
    "voice.method_practice": "Work through past exams",
    "voice.method_flashcards": "Flashcards (Anki)",
    "voice.method_teach": "Explain it out loud (Feynman)",
    "voice.created_n": "{n} task(s) added", "voice.mic_error": "Microphone didn’t start",
    // Auto-Plan
    "plan.button": "Find time for my tasks", "plan.title": "Times assigned",
    "plan.hint": "Give every open task a time today — in priority order, around your calendar. You can undo it.",
    "plan.scheduled_n": "{n} scheduled", "plan.blocked_n": "{n} waiting on prerequisites",
    "plan.capacity_n": "{n} beyond today’s capacity", "plan.overflow_n": "{n} don’t fit before midnight",
    "plan.nothing": "Nothing open to plan for today.",
    "splan.open": "Build from a goal or pasted text",
    // Task-Editor
    "task.difficulty": "Difficulty", "task.diff1": "Easy", "task.diff2": "Medium", "task.diff3": "Hard",
    "task.topic": "Module topic", "task.topic_none": "No topic linked",
    "task.add": "Add", "task.deps": "Depends on", "task.deps_add": "+ add prerequisite…",
    "task.blocked": "waiting on {text}", "task.blocked_short": "waiting",
    "task.plan_hint": "Plan reckons ~{min} min (your pace ×{f})",
    // Kalender-Konten
    "cal.title": "Calendars", "cal.connect": "Connect", "cal.connecting": "Connecting…",
    "cal.sync": "Sync now", "cal.remove": "Disconnect", "cal.events_n": "{n} events",
    "cal.synced_rel": "synced {t}", "cal.never": "not synced yet", "cal.just_now": "just now",
    "cal.min_ago": "{n} min ago", "cal.h_ago": "{n} h ago",
    "cal.hint_apppw": "iCloud needs an app-specific password: appleid.apple.com → Sign-In & Security → App-Specific Passwords.",
    "cal.placeholder_user": "Apple ID (email)", "cal.placeholder_pass": "App-specific password",
    "cal.placeholder_url": "https://… or webcal://… (ICS feed)",
    "cal.added": "Calendar connected — {n} calendars", "cal.synced_now": "Synced",
    "cal.remove_q_title": "Disconnect this calendar account?",
    "cal.remove_q_body": "Synced events disappear from your timeline. Your calendar itself is untouched.",
    "cal.busy": "busy", "cal.unnamed": "Calendar",
    // Erinnerungen
    "remind.title": "Reminders", "remind.tasks": "Task reminders (push)",
    "remind.tasks_sub": "a heads-up before and a nudge when a timed task starts",
    "remind.lead": "Heads-up lead time",
  },
  de: {
    "nav.today": "Heute", "nav.week": "Woche", "nav.exam": "Modul", "nav.notes": "Notizen",
    "nav.library": "Bibliothek", "nav.journal": "Journal", "nav.path": "Lernroute", "nav.knowledge": "Methoden",
    "nav.g_plan": "Planen", "nav.g_learn": "Lernen", "nav.g_understand": "Verstehen",
    "nav.health": "Gesundheit", "nav.insights": "Muster", "nav.profile": "Profil",
    "nav.exam_list": "Modulliste ein-/ausblenden",
    "nav.back": "Zurück", "nav.back_none": "Kein Schritt zurück vorhanden",
    // Prüfungs-Workspace: Tabs
    "exam.tab_topics": "Themen", "exam.tab_notes": "Notizen", "exam.tab_path": "Lernroute",
    "common.saved": "Gespeichert", "common.cancel": "Abbrechen", "common.save": "Speichern", "common.close": "Schließen",
    "common.delete": "Löschen", "common.undo": "Rückgängig", "common.today": "Heute", "common.tomorrow": "Morgen",
    "common.done": "Erledigt", "common.back_today": "Zurück zu Heute",
    "today.new_task": "Neue Aufgabe", "today.search": "Suchen",
    "timer.left": "übrig", "timer.no_task": "Keine Aufgabe gewählt",
    "timer.open_focus": "Fokusmodus öffnen", "timer.start_pause": "Start / Pause",
    "overdue.title_one": "Verpasster Block", "overdue.title_many": "{n} verpasste Blöcke",
    "overdue.subtitle": "Verpasst ≠ gescheitert. Mach weiter, wo es passt — ein Tipp erledigt alle.",
    "overdue.was_due": "war fällig {time}",
    "overdue.reschedule": "Neu planen", "overdue.mark_done": "Hab ich gemacht", "overdue.tomorrow": "Morgen",
    "overdue.drop": "Verwerfen", "overdue.later": "Später",
    "overdue.reschedule_all": "Alle in freie Zeit", "overdue.tomorrow_all": "Alle auf morgen",
    "overdue.done_all": "Alle als erledigt", "overdue.dropped": "„{text}“ verworfen",
    "overdue.moved_n": "{n}× verschoben", "overdue.break_down": "Rutscht immer weiter — kleiner aufteilen?",
    "dayend.wrap_up": "Tag abschließen",
    "dayend.title_goal": "Ziel erreicht — stark", "dayend.title_done": "Heute alles geschafft",
    "dayend.title_manual": "Tag im Rückblick",
    "dayend.focus_time": "Fokus", "dayend.tasks_done": "Aufgaben erledigt", "dayend.streak": "Tage in Folge",
    "dayend.encourage": "Ruhe gehört zum Plan. Bis morgen.",
    "dayend.close": "Für heute schließen",
    "overrun.toast_min": "Pause endete vor {n} Min — bereit für den Fokus?",
    "overrun.toast_now": "Pause vorbei — bereit für den Fokus?",
    "overrun.resume": "Fokus starten",
    "search.placeholder": "Aufgaben, Notizen, Module suchen…", "search.empty": "Keine Treffer.",
    "search.hint": "↑↓ bewegen · ↵ öffnen · esc schließen",
    "search.g_tasks": "Aufgaben", "search.g_notes": "Notizen", "search.g_exams": "Module", "search.g_topics": "Themen",
    "recur.label": "Wiederholen", "recur.none": "Keine Wiederholung", "recur.daily": "Täglich",
    "recur.weekdays": "Wochentags (Mo–Fr)", "recur.weekly": "Wöchentlich",
    "profile.language": "Sprache", "profile.dnd": "Ruhezeiten (keine Benachrichtigungen)",
    "profile.dnd_from": "Von", "profile.dnd_to": "Bis", "profile.timezone": "Zeitzone",
    "profile.tz_auto": "automatisch erkannt", "profile.export_ics": ".ics exportieren",
    "profile.quiet_now": "Ruhezeit gerade aktiv",
    "insights.grace_used": "Gnadentag genutzt",
    "insights.pace_title": "Schätzung vs. Realität",
    "insights.pace_sub": "wie lange du wirklich brauchst",
    "insights.pace_row": "Plan ×{f} · {n} erledigt",
    "insights.pace_empty": "Erledige geschätzte Aufgaben — Kairos lernt dein echtes Tempo.",
    "voice.button": "Ansagen", "voice.title": "Sag deine Aufgaben",
    "voice.listening": "Ich höre zu…", "voice.tap_to_talk": "Aufs Mikro tippen und sprechen",
    "voice.hey_mode": "Hey-Modus — hört weiter zu, beginne mit „hey“",
    "voice.retry": "Neu aufnehmen", "voice.create": "{n} Aufgaben anlegen", "voice.create_one": "Aufgabe anlegen",
    "voice.empty": "Noch nichts aufgenommen.", "voice.discard": "Verwerfen",
    "voice.suggest_history": "~{min} Min — dein echtes Tempo", "voice.suggest_baseline": "~{min} Min als Start",
    "voice.learn_found": "Gefunden zu „{q}“", "voice.learn_none": "Noch kein Material zu „{q}“ — Ideen:",
    "voice.verdict_learn": "lohnt sich zu lernen", "voice.verdict_refresh": "nur auffrischen",
    "voice.verdict_covered": "sitzt schon", "voice.exam_in": "{exam} · noch {n} T.",
    "voice.method_notebooklm": "NotebookLM Video-/Audio-Overview",
    "voice.method_summary": "Zusammenfassung schreiben",
    "voice.method_practice": "Altklausuren durchrechnen",
    "voice.method_flashcards": "Karteikarten (Anki)",
    "voice.method_teach": "Laut erklären (Feynman)",
    "voice.created_n": "{n} Aufgabe(n) angelegt", "voice.mic_error": "Mikrofon startete nicht",
    "plan.button": "Zeiten finden", "plan.title": "Zeiten vergeben",
    "plan.hint": "Gibt jeder offenen Aufgabe heute eine Uhrzeit — nach Priorität, um deine Termine herum. Rückgängig machbar.",
    "plan.scheduled_n": "{n} eingeplant", "plan.blocked_n": "{n} warten auf Grundlagen",
    "plan.capacity_n": "{n} über der heutigen Kapazität", "plan.overflow_n": "{n} passen nicht mehr vor Mitternacht",
    "plan.nothing": "Für heute ist nichts Offenes zu planen.",
    "splan.open": "Aus Ziel oder eingefügtem Text bauen",
    "task.difficulty": "Schwierigkeit", "task.diff1": "Leicht", "task.diff2": "Mittel", "task.diff3": "Schwer",
    "task.topic": "Modulthema", "task.topic_none": "Kein Thema verknüpft",
    "task.add": "Hinzufügen", "task.deps": "Hängt ab von", "task.deps_add": "+ Grundlage hinzufügen…",
    "task.blocked": "wartet auf {text}", "task.blocked_short": "wartet",
    "task.plan_hint": "Der Plan rechnet mit ~{min} Min (dein Tempo ×{f})",
    "cal.title": "Kalender", "cal.connect": "Verbinden", "cal.connecting": "Verbinde…",
    "cal.sync": "Jetzt synchronisieren", "cal.remove": "Trennen", "cal.events_n": "{n} Termine",
    "cal.synced_rel": "synchronisiert {t}", "cal.never": "noch nie synchronisiert", "cal.just_now": "gerade eben",
    "cal.min_ago": "vor {n} Min", "cal.h_ago": "vor {n} Std",
    "cal.hint_apppw": "iCloud braucht ein app-spezifisches Passwort: appleid.apple.com → Anmeldung & Sicherheit → App-spezifische Passwörter.",
    "cal.placeholder_user": "Apple-ID (E-Mail)", "cal.placeholder_pass": "App-spezifisches Passwort",
    "cal.placeholder_url": "https://… oder webcal://… (ICS-Feed)",
    "cal.added": "Kalender verbunden — {n} Kalender", "cal.synced_now": "Synchronisiert",
    "cal.remove_q_title": "Kalender-Konto trennen?",
    "cal.remove_q_body": "Synchronisierte Termine verschwinden aus deinem Zeitstrahl. Dein Kalender selbst bleibt unberührt.",
    "cal.busy": "belegt", "cal.unnamed": "Kalender",
    "remind.title": "Erinnerungen", "remind.tasks": "Task-Erinnerungen (Push)",
    "remind.tasks_sub": "Vorwarnung + Anstoß, wenn ein getimter Task startet",
    "remind.lead": "Vorlaufzeit",
  },
};

function detectLang() {
  try {
    const saved = localStorage.getItem("kairos_lang");
    if (saved === "en" || saved === "de") return saved;
  } catch { /* kein localStorage */ }
  // Kairos ist EINE englische Oberfläche. Vorher stand hier die Browsersprache:
  // bei einem deutschen Browser liefen die übersetzten Module auf Deutsch, das
  // statische HTML und alle nicht übersetzten Module aber auf Englisch — ein
  // Mischmasch ohne Umschalter. Der deutsche Katalog bleibt erhalten und lässt
  // sich per setLang("de") gezielt einschalten.
  return "en";
}

let lang = detectLang();
try { document.documentElement.lang = lang; } catch { /* kein DOM */ }

export function getLang() { return lang; }

export function t(key, params) {
  let s = (CATALOG[lang] && CATALOG[lang][key]) ?? CATALOG.en[key] ?? key;
  if (params) for (const k of Object.keys(params)) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
}

// Statisches HTML befüllen (Text, Platzhalter, title, aria-label).
export function applyStaticI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => { el.setAttribute("title", t(el.getAttribute("data-i18n-title"))); });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
}

export function setLang(next) {
  if (next !== "en" && next !== "de" || next === lang) return;
  lang = next;
  try { localStorage.setItem("kairos_lang", next); } catch { /* ignore */ }
  try { document.documentElement.lang = next; } catch { /* ignore */ }
  applyStaticI18n(document);
  document.dispatchEvent(new CustomEvent("langchange", { detail: { lang } }));
}
