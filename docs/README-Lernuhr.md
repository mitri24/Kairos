# ADHD Lernuhr — PWA-Lernplaner + Backend

Die **ADHD Lernuhr** ist ein offline-fähiger Lernplaner als Progressive Web App (PWA)
mit einer immer sichtbaren, NTP-synchronisierten Uhr, einem Fokus-Timer (Pomodoro),
Aufgaben-/Subtask-Verwaltung, Prüfungs-Countdown, Tagesziel, einer Tages-Timeline und
einer Prüfungs-Themen-Checkliste. Persistiert wird alles in einer lokalen **SQLite**-Datei;
der Zero-Dependency-Node-Server liefert die PWA aus und stellt eine kleine REST-API bereit.

Die **Pomodoro-Domänenlogik** (Phasen, Status, Restzeit-Berechnung, Phasenwechsel) wird mit
der Chrome-Extension geteilt: `shared/pomodoro.js` (Backend + PWA) und
`src/domain/pomodoroDomain.js` (Extension) spiegeln dasselbe Phasen-/Status-Modell
(`PHASES`, `STATUS`, `computeRemainingMs`, `advanceToNextPhase`, …). So verhalten sich Timer
in App und Extension identisch.

> Verwandte Dokumente: [`docs/BUILD.md`](BUILD.md) (verbindlicher Modul-Contract der PWA),
> [`docs/SPEC.md`](SPEC.md) (Produkt-/Architektur-Spezifikation, Roadmap),
> [`docs/RESEARCH.md`](RESEARCH.md) (wissenschaftliche Grundlagen).
> Diese Datei ergänzt die Haupt-[`README.md`](../README.md) im Repo-Root und ersetzt sie nicht.

---

## Architektur-Überblick

```
PomodoroTimer_Adhd/
├── server/          Node + node:sqlite Backend (Zero-Dependency)
│   ├── index.js       HTTP-Server: liefert PWA statisch aus, REST-API, 1-s-Tick-Loop
│   ├── routes.js      REST-Routentabelle (jede Mutation → volle Momentaufnahme)
│   ├── timer.js       Timer-Engine (läuft serverseitig weiter, auch ohne Client)
│   ├── repo.js        SQLite-CRUD für Exams/Tasks/Subtasks/Topics/Sessions
│   ├── db.js          node:sqlite (DatabaseSync), lädt schema.sql
│   ├── schema.sql     DB-Schema (Tabellen, Indizes, Singletons)
│   ├── lib/util.js    Body-Parsing, toInt/toNum/str, nowMs
│   └── data/          SQLite-Datei (lernuhr.db, WAL) — nicht eingecheckt
│
├── web/             PWA-Frontend (ESM, keine Build-Tools, kein CDN)
│   ├── index.html     DOM-Shell mit festen Element-IDs je Modul
│   ├── js/            main.js (Bootstrap) + store/api/util + Feature-Module
│   │                  (clock, timer, tasks, exam, today, timeline, topics)
│   ├── css/           tokens.css, base.css + je Modul eine CSS-Datei
│   ├── manifest.webmanifest  PWA-Manifest (installierbar, standalone)
│   └── icons/         App-Icons (SVG/PNG)
│
├── shared/          Geteilte Domänenlogik (Backend + PWA)
│   └── pomodoro.js    PHASES, STATUS, Phasen-/Settings-Logik, formatMs
│                      (vom Server unter /shared/ ausgeliefert, per ESM importiert)
│
└── src/             Chrome-Extension (MV3, eigenständig)
    ├── background.js         Service-Worker-Bootstrap
    ├── domain/               pomodoroDomain.js (Spiegel von shared/pomodoro.js)
    ├── application/          pomodoroService.js
    ├── infrastructure/       chrome* Adapter (Alarme, Badge, Notifications, Sound,
    │                         Bookmark-Bar-Ticker, Storage, Offscreen-Audio)
    └── presentation/         Popup-UI
```

**Datenfluss der PWA:** Feature-Module lesen ausschließlich `store.state` und schreiben
ausschließlich über `api.*`. Jede Mutation liefert die **komplette Momentaufnahme** zurück,
die per `store.applySnapshot(snap)` den Client-State ersetzt. Der Store hält zusätzlich
NTP-Offset und Online-Status. Der Client rendert reaktiv über `store.subscribe(render)`
und gleicht sich per Reconcile-Loop (`GET /api/state`, alle 10 s) mit dem Server ab.

**Serverseitige Timer-Engine:** `server/timer.js` läuft über einen 1-s-Tick unabhängig vom
Client weiter — der Timer zählt also auch bei geschlossenem Tab korrekt herunter. Der Client
berechnet die Restsekunden lokal aus `endsAt` und reconciled bei Phasenwechsel.

---

## Start-Anleitung

**Voraussetzung:** Node.js **>= 22.5.0** (nutzt das eingebaute `node:sqlite`, `DatabaseSync`).
Keine externen npm-Abhängigkeiten, kein Build-Schritt.

```bash
# Im Repo-Root
npm start           # startet node server/index.js
# → http://localhost:4321
```

Weitere Skripte (aus `package.json`):

| Befehl        | Wirkung                                             |
|---------------|-----------------------------------------------------|
| `npm start`   | Server auf http://localhost:4321                    |
| `npm run dev` | wie `start`, aber mit `node --watch` (Auto-Reload)  |
| `npm test`    | `node --test` (Test-Runner)                         |

**Datenbank:** wird beim ersten Start automatisch angelegt unter
`server/data/lernuhr.db` (WAL-Modus, plus `-wal`/`-shm`). Das Schema aus `server/schema.sql`
wird idempotent per `CREATE TABLE IF NOT EXISTS` eingespielt.

**Konfiguration über Umgebungsvariablen:**

| Variable      | Default                  | Zweck                          |
|---------------|--------------------------|--------------------------------|
| `PORT`        | `4321`                   | HTTP-Port des Servers          |
| `LERNUHR_DB`  | `server/data/lernuhr.db` | Pfad zur SQLite-Datei          |

Zum Zurücksetzen einfach die Dateien `server/data/lernuhr.db*` löschen (Server gestoppt).

---

## REST-API

Basis-URL: `http://localhost:4321`. Alle Antworten sind JSON. **Jede Mutation** (POST/PUT/DELETE)
liefert die **komplette Momentaufnahme** zurück (identisch zu `GET /api/state`), sodass Clients
ihren State einfach ersetzen können. CORS ist offen (`Access-Control-Allow-Origin: *`), damit
sich auch die Extension verbinden kann.

### Basis

| Methode | Pfad          | Body | Antwort                         |
|---------|---------------|------|---------------------------------|
| GET     | `/api/time`   | –    | `{ serverTime }` (epoch ms, für NTP-Sync) |
| GET     | `/api/state`  | –    | volle Momentaufnahme            |
| GET     | `/api/health` | –    | `{ ok: true }`                  |

### Timer

| Methode | Pfad                     | Body            | Wirkung                          |
|---------|--------------------------|-----------------|----------------------------------|
| POST    | `/api/timer/start`       | –               | Timer/Phase starten              |
| POST    | `/api/timer/pause`       | –               | pausieren                        |
| POST    | `/api/timer/resume`      | –               | fortsetzen                       |
| POST    | `/api/timer/skip`        | –               | aktuelle Phase überspringen      |
| POST    | `/api/timer/reset`       | –               | Session zurücksetzen             |
| POST    | `/api/timer/phase`       | `{ phase }`     | Phase wählen (`focus`/`short-break`/`long-break`) |
| POST    | `/api/timer/active-task` | `{ taskId }`    | Aufgabe im Timer aktiv setzen (`null` = keine) |

### Settings

| Methode | Pfad            | Body (alle optional) |
|---------|-----------------|----------------------|
| PUT     | `/api/settings` | `focusMinutes`, `shortBreakMinutes`, `longBreakMinutes`, `cyclesUntilLongBreak`, `todayGoalHours`, `autoStartNextPhase`, `profileName`, `activeExamId` |

### Prüfungen (Exams)

| Methode | Pfad              | Body                                        |
|---------|-------------------|---------------------------------------------|
| POST    | `/api/exams`      | `{ name, date, totalHours, color }`         |
| PUT     | `/api/exams/:id`  | `{ name?, date?, totalHours?, color? }`     |
| DELETE  | `/api/exams/:id`  | –                                           |

### Aufgaben (Tasks)

| Methode | Pfad                  | Body                                                     |
|---------|-----------------------|----------------------------------------------------------|
| POST    | `/api/tasks`          | `{ text, examId?, subject?, priority?, dueDate?, estMinutes? }` |
| PUT     | `/api/tasks/:id`      | `{ text?, subject?, priority?, dueDate?, estMinutes?, examId?, done?, sortOrder? }` |
| DELETE  | `/api/tasks/:id`      | –                                                        |
| POST    | `/api/tasks/reorder`  | `{ ids: [taskId, …] }`                                   |

### Subtasks

| Methode | Pfad                        | Body               |
|---------|-----------------------------|--------------------|
| POST    | `/api/tasks/:id/subtasks`   | `{ text }`         |
| PUT     | `/api/subtasks/:id`         | `{ text?, done? }` |
| DELETE  | `/api/subtasks/:id`         | –                  |

### Themen (Topics)

| Methode | Pfad             | Body                        |
|---------|------------------|-----------------------------|
| POST    | `/api/topics`    | `{ text, examId? }`         |
| PUT     | `/api/topics/:id`| `{ text?, done?, examId? }` |
| DELETE  | `/api/topics/:id`| –                           |

**Konventionen:** `date` / `dueDate` sind **epoch ms** (oder `null`). `priority` ist `1..4`
(1 = dringend). Fehler kommen als `{ error }` mit Status **400** (z. B. „text fehlt"),
**404** (unbekannte Route) oder **500** (Serverfehler).

---

## Datenmodell (SQLite)

Quelle: `server/schema.sql`. Zeit-Felder sind epoch ms. `settings` und `timer_state` sind
**Singletons** mit fester `id = 1`.

| Tabelle         | Zweck / wichtige Spalten |
|-----------------|--------------------------|
| `settings`      | Singleton: `focus_minutes`, `short_break_minutes`, `long_break_minutes`, `cycles_until_long_break`, `auto_start_next_phase`, `today_goal_hours`, `profile_name`, `active_exam_id` |
| `timer_state`   | Singleton: `status`, `phase`, `cycle_in_block`, `remaining_ms`, `ends_at`, `active_task_id`, `phase_started_at`, `updated_at` |
| `exams`         | `name`, `exam_date`, `total_hours` (Pensum), `color`, `sort_order`, `created_at` |
| `tasks`         | `exam_id` (FK → exams, **SET NULL**), `text`, `subject`, `priority` (1..4), `due_date`, `est_minutes`, `done`, `done_at`, `spent_ms` (kumulierte Fokuszeit), `active`, `sort_order` |
| `subtasks`      | `task_id` (FK → tasks, **CASCADE**), `text`, `done`, `sort_order` |
| `topics`        | `exam_id` (FK → exams, **CASCADE**), `text`, `done`, `sort_order` — Prüfungs-Themen-Checkliste, getrennt von den Todos |
| `sessions`      | Append-only Log abgeschlossener/abgebrochener Fokus-Sessions: `task_id`, `phase`, `started_at`, `ended_at`, `focus_ms`, `completed` |
| `daily_metrics` | `day_key` (`YYYY-MM-DD`, lokal) → `focus_ms`, `sessions_done` |

Indizes auf `tasks(exam_id)`, `subtasks(task_id)`, `topics(exam_id)`, `sessions(task_id)`.
`PRAGMA foreign_keys = ON`, `journal_mode = WAL`.

Die Momentaufnahme (`GET /api/state`) aggregiert diese Tabellen zu:
`{ serverTime, timer, settings, exams[], tasks[] (mit eingebetteten subtasks[]), topics[], today }`
— siehe `store.state` in [`docs/BUILD.md`](BUILD.md).

---

## Anbindung der Chrome-Extension

Die Extension (`src/`, Manifest V3) ist an dasselbe Backend **angebunden** und teilt sich
mit der PWA denselben autoritativen Timer. Sie funktioniert weiterhin **eigenständig**
(Fallback über `chrome.storage` / `ChromeStorageRepository`), wenn der Server nicht läuft.

Umgesetzte Anbindung:

1. **`host_permissions`** in `manifest.json`:
   ```json
   "host_permissions": ["http://localhost:4321/*", "http://127.0.0.1:4321/*"]
   ```
2. **`src/infrastructure/backendSync.js`** arbeitet gegen die REST-API (analog zu
   `web/js/api.js`): `isReachable()` (Health-Check ~800 ms), `getState()` zum Laden,
   `start/pause/resume/skip/reset` und `setActiveTask(id)` für Steuerbefehle.
3. **`src/presentation/js/main.js`** prüft beim Öffnen `isReachable()`. **Erreichbar** →
   Zustand aus `getState()`, Buttons treiben `/api/timer/*`, Reconcile per Polling (~2 s),
   sodass Extension und PWA denselben Timer teilen. **Nicht erreichbar** (oder Abbruch
   mitten in der Session via `degradeFromBackend`) → unverändertes lokales Verhalten.
   Zusätzlich öffnet ein „Open full view"-Button die Vollansicht (`http://localhost:4321`).

Serverseitig sendet `server/index.js` offene CORS-Header
(`Access-Control-Allow-Origin: *`, Methoden `GET,POST,PUT,DELETE,OPTIONS`) inklusive
Preflight-Behandlung, sodass die Cross-Origin-Requests aus der Extension funktionieren.

---

## PWA-Installation

Die App ist eine installierbare PWA:

1. Server starten (`npm start`) und `http://localhost:4321` im Browser öffnen.
2. Über das Browser-Menü „Installieren" / „Zum Startbildschirm hinzufügen" wählen.
   Das Manifest (`web/manifest.webmanifest`) definiert `display: standalone`,
   `theme_color`, `start_url: /` und die Icons.

**Offline:** Die PWA ist auf Offline-Betrieb ausgelegt — `web/js/api.js` meldet Netzfehler
an die UI (Offline-Banner), der Store bleibt erhalten und wird beim Reconnect abgeglichen.
`web/js/main.js` registriert zusätzlich einen Service-Worker unter `/sw.js` für App-Shell-Caching.

> Hinweise für den produktiven Betrieb: `web/sw.js` und die im Manifest referenzierten Icons
> (`web/icons/…`) müssen vorhanden sein, damit vollständiges Offline-Caching bzw. saubere
> Install-Icons greifen. Ohne `sw.js` scheitert die Registrierung still (`.catch(() => {})`)
> und die App läuft dennoch, aber ohne SW-Cache.

---

## Nächste Schritte

Details und Priorisierung siehe [`docs/SPEC.md`](SPEC.md) (Roadmap, Kap. 14 ff.):

- **Deploy / Postgres-Migration:** `node:sqlite` ist ideal für lokal/Single-User. Für Multi-User-
  oder gehosteten Betrieb `server/repo.js`/`db.js` hinter einer schmalen Repository-Schnittstelle
  auf Postgres migrieren; die REST-API und der Momentaufnahme-Contract bleiben unverändert.
- **FSRS / Spaced Repetition:** Review-Engine (Free Spaced Repetition Scheduler) auf Basis der
  `topics`/`sessions`-Daten (SPEC F5, Kap. 12.5).
- **Kalender-Integration:** Zwei-Wege-Sync und Auto-Reschedule (SPEC F7, EventKit-Bezug Kap. 12.3);
  in der Web-Variante über CalDAV/ICS statt EventKit.
- **Session-Metriken auswerten:** Die `sessions`/`daily_metrics`-Tabellen speichern bereits
  Fokuszeit pro Aufgabe/Tag — daraus ein Dashboard (Kalibrierung, Retrieval, Pace) bauen (SPEC §5/§9).
- **Auth / Mehrgeräte:** Für Sync über Geräte hinweg Account-Layer + serverseitige Sessions.
