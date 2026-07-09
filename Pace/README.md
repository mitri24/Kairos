# Pace — adaptiver Lernplaner für macOS (Gerüst / PoC)

Native **SwiftUI + EventKit** Menüleisten-App. Dieses Gerüst demonstriert die Kern-Schleife des
Produkts aus [`../docs/SPEC.md`](../docs/SPEC.md):

> **Kalender lesen → freie Slots berechnen → Lern-Sessions deadline-bewusst einplanen → Events zurück in den Kalender schreiben.**

Plus die nach Swift portierte **Pomodoro-Fokus-Engine** (aus der bestehenden Chrome-Extension) mit Unit-Tests.

## Voraussetzungen
- macOS 14+ und die Swift-Toolchain (Command Line Tools genügen — kein volles Xcode nötig).

## Bauen & testen (Terminal)
```bash
cd Pace
swift build        # kompiliert PaceKit (Kern) + PaceApp (UI)
swift test         # führt die Pomodoro- und Scheduler-Tests aus
```

## Als echte App starten (mit Kalender-Zugriff)
Ein bloßes `swift run` hat kein App-Bundle → macOS verweigert den Kalender-Zugriff. Deshalb:
```bash
./scripts/make_app.sh     # baut Pace.app (inkl. Berechtigungstexte + Ad-hoc-Signatur)
open ./Pace.app           # Pace erscheint in der Menüleiste
```
Beim ersten Klick auf **„Kalender verbinden"** fragt macOS nach Zugriff → **Erlauben**.
Dann **„Plan erstellen"** (plant 3 Demo-Aufgaben in deine echten freien Slots der nächsten 7 Tage)
und **„In Kalender schreiben"** (legt die Sessions im Kalender **„Pace"** an).

## Architektur (Clean Architecture — wie im bestehenden Repo)
```
Sources/PaceKit/
  Domain/         Models.swift · Pomodoro.swift (portiert) · Scheduler.swift   ← rein, testbar
  Infrastructure/ CalendarRepository (Protokoll) · EventKitCalendarRepository  ← EventKit-Adapter
  Application/    PlanService.swift                                            ← Use-Case-Orchestrierung
Sources/PaceApp/  PaceApp.swift (@main) · AppModel.swift · MenuBarView.swift   ← SwiftUI-Präsentation
Tests/PaceKitTests/  PomodoroTests · SchedulerTests
```

## Was dieses Gerüst bewusst NOCH NICHT kann
(siehe SPEC-Roadmap §14): FSRS-Spaced-Repetition · Pace-Learning aus Ist-Daten · `.EKEventStoreChanged`-
Auto-Reschedule · scham-freies/grund-bewusstes Re-Flow (F8a) · Persistenz (SwiftData) · Metrik-Dashboard.
Das hier ist der lauffähige Kern-Loop als Fundament.

## Nächste sinnvolle Schritte
1. `.EKEventStoreChanged` beobachten → automatisch neu planen (SPEC §8.4 / F7).
2. SwiftData-Persistenz für Tasks/Material/Metriken (SPEC §12.4).
3. Manuelles CRUD + grund-bewusstes Re-Flow (SPEC F8a) inkl. „geschützte Freizeit".
4. FSRS-Review-Engine integrieren (SPEC §12.5).
