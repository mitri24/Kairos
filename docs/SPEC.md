# SPEC — „Pace" (Arbeitstitel): Adaptiver, evidenzbasierter Lernplaner für macOS

> Ein lokal-privater Mac-Lernplaner, der deinen Kalender liest, freie Zeit erkennt und daraus einen wissenschaftlich fundierten, sich selbst anpassenden Lernplan baut — der **deinen echten Lern-Durchsatz lernt**, mit **Spaced Repetition** wiederholt und sich **scham-frei** neu plant, wenn das Leben dazwischenkommt.
>
> Status: **Entwurf v0.1** · Datum: 2026-06-26 · Evidenzbasis: [`RESEARCH.md`](./RESEARCH.md)
> Verhältnis zum bestehenden Repo: Der vorhandene **ADHD-Pomodoro-Timer** (Chrome-Extension, `src/domain/pomodoroDomain.js`) wird zur **Fokus-Engine** dieses Produkts — seine reine, zustandslose Domänenlogik und Clean-Architecture-Trennung portieren direkt nach Swift (siehe §12.6).

---

## 0. Inhalt
1. Executive Summary & Marktlücke
2. Produkt-Vision & die 5 Säulen
3. Design-Prinzipien aus der Wissenschaft
4. Zielgruppe & Personas
5. Die Metriken, die einen 1.0-Studenten machen
6. Domänenmodell
7. Funktionale Anforderungen (Features F1–F12)
8. Der Scheduling-Algorithmus
9. Das Pace-Learning-Modell („die App lernt dich")
10. Metrik-Katalog (vollständig)
11. UX-Prinzipien & Schlüssel-Screens
12. Technische Architektur
13. Privacy
14. Roadmap (MVP → v2 → v3)
15. Offene Entscheidungen
16. Anti-Ziele & Risiken

---

## 1. Executive Summary & Marktlücke

**Problem.** Studierende (besonders mit ADHD) scheitern selten an Intelligenz, sondern an **Selbst-Regulation über Zeit**: Sie planen unrealistisch, cramen statt zu verteilen, wiederlesen statt abzurufen, opfern Schlaf und werfen einen kollabierten Plan beschämt weg. Bestehende Tools lösen je nur ein Stück.

**Lösung.** Eine macOS-native App, die fünf heute getrennte Fähigkeiten in einem lokal-privaten Produkt vereint:

| # | Säule | Heute getrennt bei | Hier vereint |
|---|---|---|---|
| 1 | **Busy-aware Auto-Scheduling** — Kalender lesen, belegte Blöcke respektieren, Lern-Sessions in freie Slots legen | Motion, Reclaim, Sorted³, Doable | ✅ |
| 2 | **Evidenzbasierte Spaced Repetition (FSRS)** für Wiederholungs-Arbeit | Anki, RemNote | ✅ |
| 3 | **Scham-freies adaptives Rescheduling** — ein verpasster Block bricht nie den Plan | Routinery (ohne Kalender) | ✅ |
| 4 | **Pace-Learning** — lernt deinen echten Durchsatz pro Fach und schätzt neu | Amazing Marvin, Anki (je halb) | ✅ |
| 5 | **macOS-first + lokal/privat** | nur Anki (ohne Planer) | ✅ |

**Marktlücke (aus 33-App-Analyse, [`RESEARCH.md`](./RESEARCH.md) Teil D):** *Kein* ausgeliefertes Produkt kombiniert auch nur **vier** dieser fünf Säulen. Die Intersektion *(Pace-Learning des Lern-Durchsatzes) × (FSRS) × (busy-aware Auto-Placement)* ist leer; das Ganze *macOS-lokal/privat* zu tun, ist „leer im Quadrat". Am nächsten dran: **Doable** (kein SRS/Fach-Modell), **Shovel** (kein Auto-Placement/Kalender-Sync), **Motion** (Cloud, kein SRS), **SpaceRep** (nur Google, Black-Box, kein ADHD).

**Differenzierungs-These.** Die App ist nicht „noch ein Timer" und nicht „noch ein Kalender". Sie ist der **erste Lernplaner, dessen Plan auf gemessenem, individuellem Lernverhalten beruht statt auf Wunschdenken** — und der bewusst **gegen Grind-Kultur** designt (Schlaf & Erholung als harte Constraints, Qualität statt Stunden).

---

## 2. Produkt-Vision & die 5 Säulen

> **Vision:** „Sag mir, was du bis wann lernen musst, und verbinde deinen Kalender. Ich finde heraus, *wann* du realistisch lernst, *wie* du am wirksamsten lernst und *wie viel* du wirklich schaffst — und ich passe den Plan an, sobald sich dein Leben oder deine Daten ändern. Du triffst nie wieder die Entscheidung ‚was soll ich jetzt lernen'."

**Leitsatz pro Säule:**
1. *Respektiere die Realität* — der Plan lebt in den echten freien Slots, nie gegen sie.
2. *Lerne wirksam, nicht viel* — Retrieval & Spacing als Default, nicht Wiederlesen & Stunden.
3. *Vergib automatisch* — ein gebrochener Tag wird neu geflossen, nie bestraft.
4. *Kenne den Nutzer* — jede Schätzung wird aus echten Daten korrigiert.
5. *Bleib lokal* — Kalender- und Lerndaten verlassen das Gerät nie.

---

## 3. Design-Prinzipien aus der Wissenschaft

*(Vollbelege, Effektstärken und Quellen in [`RESEARCH.md`](./RESEARCH.md). Hier die drei Imperative + die Trennlinie, die das Produkt prägen.)*

### 3.1 Drei Imperative
1. **Retrieval-first.** Jede wirksame Methode (Fehler-Notizbuch, Blank-Paper, Ebbinghaus-Review, sogar Mind-Maps) wirkt *wegen Abruf*. **Abrufen, nicht Wiederlesen** ist die Default-Aktion. Organisations-Werkzeuge werden in Abruf-Übungen verwandelt („Blank-Map"-Modus). *(Retrieval Practice d≈0.74; Wiederlesen ist Dunlosky-„low utility".)*
2. **Adaptive Sparsamkeit statt roher Masse.** Das Rote-Drilling-Versagen beweist: undifferenziertes Volumen ist der Feind. Der Algorithmus zeigt das **kleinste** jetzt nötige Übungsset und widersteht aktiv dem Drang, sich durch Wiederholen von Gemeistertem produktiv zu *fühlen*. Mastery pro Konzept; eskalieren, nicht wiederholen.
3. **Schlaf & Erholung als harte Constraints.** Hengshui-Kollaps und 4당5락-Neurowissenschaft konvergieren: Schlafentzug zerstört genau das Lernen, das die App ermöglichen soll. Schlaf ist eine **Scheduling-Constraint**, keine weiche Präferenz — und das ist ein Marketing-Differentiator gegen Grind-Apps.

### 3.2 Die Trennlinie (das Alleinstellungsmerkmal)

| ✅ Evidenzbasiert — Features drumherum | ⛔ Grind-Kultur — bewusst dagegen designen |
|---|---|
| 오답노트/error notebook (Fehleranalyse + Retrieval) | 4당5락 (Schlaf-Opfer) — **schädlicher Mythos** |
| 백지복습 (Free-Recall) | 엉덩이 힘 (Sitzfleisch) — **Stunden ≠ Qualität** |
| 회독 + Ebbinghaus + FSRS (Spaced Repetition) | Hengshui 15 h/Tag — **Selektion, keine Pädagogik** |
| 메타인지/자기주도학습 (Metakognition/SRL) | Rote drilling *undifferenziert* (Volumen ohne Feedback) |
| Mind-Map (Elaboration → besser als Recall) | check-in *als Performance-Theater* |
| 인강 (aktive vs. passive Zeit trennen) | **„Gesamtstunden" als primäre Erfolgs-Metrik** |

### 3.3 ADHD-Nordstern
Die App soll den Plan **entscheiden & neu-entscheiden**, Zeit **physisch zeigen**, **sofort belohnen** und **automatisch vergeben** — und so die vier Dinge minimieren, die ADHD teuer macht: **Starten, Zeit verfolgen, Erinnern, Entscheiden** *(Barkley: ADHD = Selbst-Regulation über Zeit; siehe RESEARCH Teil C, 11 Prinzipien).*

---

## 4. Zielgruppe & Personas

**Primär:** Studierende (Uni/Oberstufe) in Prüfungsphasen, die echte Termine im Kalender haben (Vorlesungen, Job, Sport) und um diese herum lernen müssen. ADHD/neurodivergent als **expliziter First-Class-Use-Case**, nicht als Nische — was für ADHD funktioniert (externalisierte Zeit, scham-frei, ein nächster Schritt), hilft allen.

| Persona | Kontext | Schmerz | Was die App liefert |
|---|---|---|---|
| **Mira, 22, ADHD, Medizin** | volle Stundenplan-Wochen, 6 Fächer parallel, Klausuren gestaffelt | plant unrealistisch, cramt nachts, Plan kollabiert mittwochs → Scham → Vermeidung | realistische Slots, Anker-Aufgabe/Tag, lautloses Reschedule, Schlaf-Schutz |
| **Junho, 19, diszipliniert** | will Bestnote, nutzt schon Anki & Timer getrennt | Tools reden nicht miteinander; Reviews kollidieren mit Terminen | FSRS-Reviews *in den Kalender* gelegt, konflikt-bewusst |
| **Sara, 25, berufsbegleitend** | wenig, fragmentierte Zeit | weiß nie, ob der Stoff *zeitlich überhaupt aufgeht* | Machbarkeits-„Cushion" (schafft es das mathematisch bis zur Deadline?) |

---

## 5. Die Metriken, die einen 1.0-Studenten machen

> Direkte Antwort auf deine Kernfrage „welche Metriken/Features braucht ein Student, um 1.0 zu werden?". **Kontraintuitiv:** Die Metrik, die Top-Leistung am *schlechtesten* vorhersagt, ist genau die, die alle tracken — **Stunden**. Was wirklich zählt:

| Rang | Metrik | Warum (Evidenz) | Wie die App sie hebt |
|---|---|---|---|
| 1 | **Kalibrierungs-Genauigkeit** — wie gut du weißt, was du *nicht* weißt | Metakognition schlägt IQ als Prädiktor; Self-Evaluation d≈0.72 (höchster SRL-Sub-Prozess); Fluency-Illusion ist die Hauptursache für Unter-Lernen | **Calibration-Loop**: vor jeder Antwort Konfidenz vorhersagen → predicted-vs-actual-Dashboard; Kalibrierung ist ein verbesserbarer Score |
| 2 | **Retrieval-Erfolgsrate** (richtig abgerufen, nicht „gelesen") | Testing-Effect d≈0.74; der einzige Beweis, dass etwas *abrufbar* ist | jeder Block endet mit aktivem Abruf; Erfolgsrate pro Konzept getrackt |
| 3 | **Spacing-Adhärenz** — % Reviews *vor* dem Vergessen statt Cramming | Spacing d≈0.85; ~2× Behalten bei gleicher Zeit | FSRS-Queue + „heute fällig"; Cram-Warnung |
| 4 | **Schlaf-Konsistenz** (≥7 h, regelmäßig) | Konsolidierung im Tiefschlaf; Fakten-Behalten d≈0.72/24h | Schlaf als Constraint; Plan beschneidet 7–8 h nie |
| 5 | **Realer Durchsatz pro Fach** (z. B. Seiten/h Organik) & Schätz-Fehler | Zeit-Agnosie; unrealistische Pläne kollabieren | Pace-Learning (§9) misst & korrigiert; Schätz-Fehler sinkt über Zeit |
| 6 | **Fehler-Aufarbeitungs-Rate** — % Fehler diagnostiziert & re-getestet | 오답노트-RCT: große Effekte; Kontrollgruppe *verschlechterte* sich | Fehler-Vault, Fehlertyp-Tag erzwungen, spaced re-queue |
| 7 | **Plan-Adhärenz unter Realität** — geschafft / realistisch geplant (nicht / wunschgeplant) | unter-geplante, eingehaltene Pläne schlagen über-geplante, aufgegebene | bewusstes Unter-Planen + Anker-Aufgabe |
| — | ~~Gesamtstunden~~ | **notwendiger Proxy, nie hinreichend** (엉덩이 힘-Fehlschluss) | nur sekundär gezeigt, nie als „Erfolg" gefeiert |

**Feature-Konsequenz:** Das Haupt-Dashboard zeigt **Kalibrierung, Retrieval-Erfolg, Spacing-Adhärenz und Schlaf** prominent — Stunden klein und kontextualisiert.

---

## 6. Domänenmodell

Reine, persistierbare Entitäten (UI- und EventKit-unabhängig — vgl. die zustandslose `pomodoroDomain.js` des bestehenden Repos).

```
Subject            Fach (Farbe, kognitiver Typ: memorieren|rechnen|verstehen|lesen)
 └─ Module          Modul/Thema innerhalb eines Fachs (Schwierigkeit 1–5, Status)
     └─ Task         konkrete Aufgabe/Assignment (Typ, Deadline, Priorität P1–P4)
         └─ Material  Lerneinheit: Folien/Seiten/Problemset (umfang, einheit, schwierigkeit)
ReviewItem          FSRS-Karte/Konzept (D, S, R, due, history)  ── aus Material/Task generiert
StudySession        geplanter/erledigter Lernblock (Plan-Slot + Ist-Daten)
CalendarBlock       gespiegelter EventKit-Event (busy) ODER von uns geschriebener Lern-Event
EnergyProfile       Tageszeit-Energie-Fenster (gelernt + Nutzer-Override), Chronotyp
PaceModel           pro (Subject × Materialtyp): geschätzte vs. echte Geschwindigkeit
DayBoundary         Tagesbeginn/-ende, Schlaf-Fenster, max. Tages-Lernlast, Pufferregeln
MetricEvent         append-only Log jeder gemessenen Größe (siehe §10)
```

**Material — die Einheit hinter deiner „wie viele Seiten/Folien"-Anforderung:**
```
Material {
  id, taskId
  kind: slides | reading_pages | problem_set | video_lecture | flashcards | writing
  amount: Int            // z.B. 48 Folien, 30 Seiten, 25 Aufgaben, 90 Lecture-Minuten
  unit: slide|page|problem|minute|card|word
  difficulty: 1…5        // vom Nutzer initial, später aus Ist-Pace re-kalibriert
  estimatedMinutes: Int  // abgeleitet aus PaceModel (§9), NICHT raw vom Nutzer
  progress: { done: Int, remaining: Int }
}
```

---

## 7. Funktionale Anforderungen

### F1 — Onboarding & Kalender-Verbindung
- F1.1 Kalender-Zugriff anfordern: **Full Access** via `requestFullAccessToEvents()` (Write-only reicht nicht — kann busy/free nicht lesen; RESEARCH E1). Klare Begründung im Dialog.
- F1.2 Nutzer wählt, welche Kalender „belegt" bedeuten (alle iCloud/Google/Exchange-Konten erscheinen über EventKit automatisch).
- F1.3 **Tagesgrenzen** erfassen: Tagesbeginn, Tagesende, gewünschtes Schlaf-Fenster (≥7 h Default, geschützt), max. Lernstunden/Tag, min./max. Block-Länge, Standard-Puffer zwischen Blöcken.
- F1.4 **Energie-Profil**: grobe Selbsteinschätzung (Lerche/Eule, Peak-Fenster). Default respektiert Abend-Chronotyp (keine erzwungenen Frühslots). Wird später gelernt (§9).
- F1.5 Reminders optional als Capture-Inbox (`requestFullAccessToReminders()`).

### F2 — Capture: Fächer, Module, Tasks, Material
- F2.1 Fach anlegen (Farbe, kognitiver Typ). Modul mit **Schwierigkeit 1–5**.
- F2.2 Task/Assignment mit **Deadline**, Typ, Priorität.
- F2.3 **Material-Erfassung (deine „fragt nach Seiten/Folien/Schwierigkeit"-Anforderung):** beim Anlegen fragt die App Umfang + Einheit (48 Folien / 30 Seiten / 25 Aufgaben / 90 Lecture-Min) und Schwierigkeit. Daraus → `estimatedMinutes` über das PaceModel (anfangs Heuristik-Defaults, dann personalisiert).
- F2.4 **Reverse-Exam-Kalender** (수능-Methode): aus Klausurdatum + Material rückwärts geplante Spacing-Touchpoints; schwere/umfangreiche Fächer starten früher.
- F2.5 Schnell-Capture (Menübar/Hotkey/Reminders-Import) gegen Erfassungs-Reibung (ADHD).

### F3 — Auto-Scheduler (Kern, Details §8)
- F3.1 Liest belegte Blöcke aus EventKit, berechnet **freie Slots** (Lücken zwischen `.busy`-Events innerhalb der Tagesgrenzen).
- F3.2 Platziert Lern-Sessions in freie Slots, gewichtet nach: Deadline-Dringlichkeit, Schwierigkeit, Energie-Fenster (anspruchsvoll → Peak), **Spacing** (ein Fach nicht crammen; Reviews über Tage), max. Tageslast, Puffer.
- F3.3 **Mischt Session-Typen** evidenzbasiert: neue Lern-Blöcke, Interleaving-Übungsblöcke, FSRS-Review-Blöcke, Fehler-Review.
- F3.4 **Machbarkeits-„Cushion"** (Shovel-Idee, besser): zeigt *vor* der Deadline, ob alles mathematisch in die verbleibende freie Zeit passt — und bei „nein" konkrete Optionen (Scope kürzen, Ziel-Retention senken, früher starten).
- F3.5 Schreibt geplante Sessions als **Events zurück in den lokalen Kalender** (eigener „Pace"-Kalender, farblich getrennt) → deine „Export in lokalen Calender"-Anforderung.

### F4 — Fokus-Session-Ausführung (die Pomodoro-Engine, wiederverwendet)
- F4.1 Session startet mit **One-Tap** und konkretem erstem Schritt (Auto-Chunking; ADHD-Task-Initiation). Kein „was mache ich jetzt".
- F4.2 **Analoger schrumpfender Keil**-Timer + persistente Menübar-Restzeit (Zeit-Externalisierung). Dauern **personalisierbar**, Flowtime-Modus gleichwertig (keine 25/5-Dogmatik — RESEARCH A5).
- F4.3 **Retrieval-first:** Lern-Blöcke enden mit einem aktiven Abruf (Free-Recall „Brain-Dump" oder Selbsttest); „Lösung/Notizen zeigen" erst nach Abrufversuch.
- F4.4 **Laddered Transition-Warnungen** (10/5/2 Min) + Hyperfokus-Guard („15 Min verlängern oder abschließen?").
- F4.5 **In-Session-Metrik-Capture** (§10): tatsächliche Fokuszeit, Unterbrechungen + Grund (Tomato-ToDo-Idee), erledigter Umfang (z. B. 18 von 25 Aufgaben), aktive vs. passive (Video-)Zeit getrennt.
- F4.6 **Post-Session-Review-Karte** (Pflicht, 20 Sek): „Geschafft? Warum nicht? Konfidenz?" → speist Reflexion (SRL) + Kalibrierung + Pace-Learning.
- F4.7 Optionaler **Co-Study-Modus** (geteilter Timer mit Freunden / anonyme „N lernen gerade"-Präsenz) — Body-Doubling ohne YouTube-Abhängigkeit.

### F5 — Spaced Repetition / Review-Engine (FSRS)
- F5.1 **FSRS** als Primär-Scheduler (gepflegte Lib/Port; *eine* Version, Kurve+Intervall gematcht). Leitner-5-Box als transparenter Anfänger-/Low-Data-Modus.
- F5.2 ReviewItems aus Material/Fehlern generieren (Cloze, Q&A, Free-Recall-Prompts).
- F5.3 4-Tasten-Grading (Again/Hard/Good/Easy); Default-Ziel-Retention 90 % (pro Fach justierbar).
- F5.4 **Reviews werden vom Scheduler (F3) in echte Kalender-Slots gelegt** und sind konflikt-bewusst — das schließt die Lücke, die Anki (kein Kalender) und SpaceRep (nur Google) offenlassen.
- F5.5 Personalisierung: FSRS-Optimizer auf der eigenen Historie ab ~300 Reviews.
- F5.6 Optionale **AnkiConnect-Brücke** (`localhost:8765`) für Nutzer mit bestehenden Anki-Decks.

### F6 — Pace-Learning & Adaptation (Details §9)
- F6.1 Misst realen Durchsatz pro (Fach × Materialtyp) und **korrigiert künftige `estimatedMinutes`** automatisch.
- F6.2 Lernt den persönlichen **Fokus-Abfall-Punkt** → schlägt Block-/Pausen-Längen vor (statt fixer 25/5).
- F6.3 Lernt **Energie-Fenster** aus Ist-Performance nach Tageszeit.
- F6.4 **Kontinuierliche Re-Optimierung:** jede Metrik-Änderung (langsamer/schneller als geschätzt, Schwierigkeit höher) löst eine inkrementelle Neuplanung aus → deine „immer automatisch adaptiert"-Anforderung.

### F7 — Zwei-Wege-Kalender-Sync & Auto-Reschedule
- F7.1 Beobachtet `.EKEventStoreChanged` → refetch → Scheduler neu lösen. Deckt: neuer Termin, verschobener Termin, gelöschter Termin (RESEARCH E1/E3).
- F7.2 **Externe Änderung → Tasks verschieben sich automatisch** in die nächstbesten freien Slots (deine Anforderung). Committete/laufende Anker bleiben fix; nur bewegliche Zukunfts-Sessions fließen neu.
- F7.3 **Längere Pause / Urlaub:** ein „Pause bis …"-Schalter friert den Plan ein und re-flowt danach den Rückstand scham-frei (deine „wenn ich länger Pause mache"-Anforderung).
- F7.4 Unsere geschriebenen Lern-Events bleiben mit den StudySessions synchron (Edit/Move/Delete in Calendar.app wird erkannt und respektiert).
- F7.5 **Volles manuelles CRUD** auf Lern-Blöcken direkt in der App: hinzufügen, per Drag verschieben, Dauer/Inhalt editieren, löschen — jeweils mit optionalem Ein-Tap-**Grund** (siehe F8a). Sofort in den lokalen Kalender gespiegelt.
- F7.6 **Manuell platzierte/verschobene Blöcke werden „gepinnt"** (soft anchor): der Auto-Scheduler plant darum herum und überschreibt deine manuelle Entscheidung bei keinem späteren Re-Solve ungefragt.

### F8 — Scham-freies Re-Planning
- F8.1 **Automatic Forgiveness:** ein verpasster Block „scheitert" nie und stapelt sich nie als rotes „überfällig" — er re-flowt lautlos. (RESEARCH C, Prinzip 7 — *das* Adhärenz-Make-or-Break.)
- F8.2 **„Woche neu planen"-One-Tap**, neutral geframt („hier dein aktualisierter Plan"), nie als Schuld-Abarbeiten.
- F8.3 **Vergebende Streaks:** Grace-Days/Freezes; ein Streak biegt sich, bricht nie sichtbar. Keine öffentlichen Leaderboards by default.
- F8.4 Streaks/Check-ins an **Qualitäts-Signal** gekoppelt (echte 25 Fokus-Min / N Abrufe), nicht an bloße Anwesenheit — gegen die check-in-Theater-Falle.

### F8a — Manuelle Kontrolle & grund-bewusstes Rescheduling (Reason-Aware Re-Flow)
> Deine Anforderung: Du willst Termine **manuell verschieben, hinzufügen, editieren, löschen — mit Grund** — und der Grund entscheidet, *ob* nachgerückt wird. Das ist der Unterschied zwischen „ich brauche Pause" und „das ist mir gerade egal".

- F8a.1 Volle manuelle Hoheit über jeden Block (CRUD, siehe F7.5/F7.6). Beim Löschen/Verschieben fragt die App einen **optionalen Ein-Tap-Grund** (Chips), der die Re-Flow-Politik bestimmt.
- F8a.2 **Kernfall — „brauche Freizeit/Erholung":** der freigeräumte Slot wird **geschützte freie Zeit**, in die **nichts nachrückt**. Wer Erholung schafft, wird nicht mit neuen Tasks bestraft (scham-frei).
- F8a.3 **Gegenfall — „nicht wichtig / überspringen":** die Rest-Arbeit wird de-priorisiert und der **nächstbeste Task in den Slot vorgezogen** bzw. der Plan sinnvoller umgestaltet.
- F8a.4 **Geschützte freie Zeit** ist eine echte Entität: der Scheduler behandelt sie wie einen belegten Block (kein Backfill), bis du sie selbst wieder freigibst.
- F8a.5 Der Grund wird (lokal) als `MetricEvent` geloggt → speist Reflexion (SRL) und Pace-Learning (z. B. häufiges „zu schwer" hebt die Schätzung automatisch an).

| Grund beim Löschen/Verschieben | Scheduler-Politik |
|---|---|
| **„Brauche Freizeit / Erholung / Pause"** | Slot wird **geschützte freie Zeit** — **nichts rückt nach**; optional Tageslast für den Tag senken |
| **„Nicht wichtig / überspringen"** | Rest-Arbeit **de-priorisiert**; **nächstbester Task vorgezogen** / Plan sinnvoller umgestaltet |
| **„Schon erledigt / woanders gemacht"** | Fortschritt als erledigt markieren; kein Reschedule; Slot frei |
| **„Verschieben auf [Zeit]"** | explizite neue Zeit als **gepinnter Anker**; Re-Solve drumherum |
| **„Zu schwer / brauche mehr Zeit"** | Schätzung erhöhen (→ Pace-Learning); **mehr** Zeit neu einplanen |
| **„Krank / Notfall"** | wie „Pause bis …": schützen, später scham-frei re-flowen |
| *(kein Grund angegeben)* | Default = sanftes Vorziehen (wie „nicht wichtig"), aber jederzeit reversibel |

### F9 — Metriken-Dashboard & Calibration-Loop
- F9.1 Haupt-Dashboard zeigt die **1.0-Metriken** (§5) prominent, Stunden sekundär.
- F9.2 **Calibration-Loop:** predicted-vs-actual-Genauigkeit über Zeit als verbesserbarer Score.
- F9.3 Pro Fach/Modul: Retrieval-Erfolg, Fehlertyp-Verteilung („12 Konzeptfehler in Ableitungen"), Spacing-Adhärenz, Mastery-Heatmap.
- F9.4 Wöchentliche 5-Min-Retro (자기주도학습): „was wirkte? was änderst du?".

### F10 — Wellbeing-Guardrails (Anti-Grind)
- F10.1 **Schlaf-Schutz:** Plan beschneidet das Schlaf-Fenster nie; Warnung bei Verstoß; Schlaf als Multiplikator geframt.
- F10.2 **Qualität-über-Quantität-Copy** in der UX; nie das Reduzieren von Schlaf oder reine Stunden gamifizieren.
- F10.3 Bewegungs-/Erholungspausen-Vorschläge (optional, moderat); optional ~20–30 Min Aerobic nach Lernblock (Konsolidierung).
- F10.4 **Overload-Erkennung:** sinkt Accuracy/Tempo innerhalb einer Session, reduziert die App die Einführung neuer/harter Items (Cognitive Load).

### F11 — Exam-Mode
- F11.1 3 Tage vor einer Klausur automatisch aktiviert: **nur Review von Gemeistertem**, neues schweres Material wird versteckt (Pre-Exam-Konsolidierung; neues Material kurz vorher schadet).
- F11.2 Fehler-Review-Sprint aus dem Vault; Konfidenz-gewichtete Reihenfolge.

### F12 — Datenexport / Portabilität
- F12.1 Voller lokaler Export (JSON/CSV der Metriken; ICS der Lern-Events).
- F12.2 Kein Vendor-Lock-in; alle Daten gehören dem Nutzer, on-device.

---

## 8. Der Scheduling-Algorithmus

**Framing:** Constraint-Satisfaction, gelöst als **greedy, deadline-bewusstes Interval-Packing** — schnell, erklärbar, interaktiv re-lösbar (volle CSP/ILP-Solver sind Overkill).

### 8.1 Eingaben
- `freeSlots`: aus EventKit busy/free ∩ Tagesgrenzen ∩ Nicht-Schlaf-Fenster.
- `tasks`: offene Tasks mit Deadline, Priorität, Restumfang, `estimatedMinutes` (aus PaceModel).
- `reviewQueue`: FSRS-fällige Items (jedes mit eigenem due-Fenster).
- `energyProfile`, `dayBoundary`-Constraints (max. Tageslast, Block-Min/Max, Puffer).
- `anchors`: fixe/laufende Sessions, die nicht verschoben werden dürfen.

### 8.2 Constraints
| Hart | Weich (Score) |
|---|---|
| nie in belegte Blöcke | anspruchsvoll → Energie-Peak |
| nie ins Schlaf-Fenster | Spacing: gleiches Fach über Tage spreizen |
| Deadlines einhalten | FSRS-due-Fenster treffen (nicht zu früh/spät) |
| max. Tageslast | Interleaving an Übungstagen |
| Anker + **gepinnte/manuelle Blöcke** + **geschützte Freizeit** unantastbar | Puffer + „minimum viable day"-Anker zuerst |
| Block ∈ [min, max] | Lecture-Watch ≠ aktive Problemzeit balancieren |

### 8.3 Pseudocode
```text
function schedule(freeSlots, tasks, reviewQueue, profile, constraints, anchors):
    plan = anchors.clone()                         # fixe Blöcke bleiben
    movable = freeSlots.minus(anchors.timespans)
    movable = weightByEnergy(movable, profile)     # Peak-Slots höher gewichtet

    # 1) Anker-Aufgabe des Tages zuerst (minimum viable day)
    for day in horizon:
        placeAnchorTask(day, plan, movable)

    # 2) FSRS-Reviews in ihre due-Fenster (Spacing hat Vorrang vor neuem Stoff)
    for item in reviewQueue.sortedBy(dueUrgency):
        slot = bestSlot(movable, near=item.dueWindow, len=item.reviewMinutes)
        if slot: assign(item, slot, plan); movable.consume(slot)

    # 3) Neue Lern-Tasks: Earliest-Deadline-First + Prioritäts-Tiers (P1..P4)
    for task in tasks.sortedBy(urgency = f(deadlineProximity, priority)):
        remaining = task.estimatedMinutes
        while remaining > 0 and hasCapacity(task, plan):
            slot = bestSlot(movable, prefer=energyMatch(task.cognitiveType),
                            len=clamp(remaining, constraints.minBlock, constraints.maxBlock))
            if not slot: break                     # Cushion-Defizit → §8.5
            spreadCheck(task, slot, plan)          # Spacing: nicht crammen
            assign(task, slot, plan); movable.consume(slot)
            remaining -= slot.length
            insertBuffer(plan, slot, constraints.buffer)

    # 4) Übungstage interleaven
    interleaveAcrossSubjects(plan)

    feasibility = computeCushion(tasks, freeSlots, horizon)   # §8.5
    return plan, feasibility
```

### 8.4 Re-Solve-Trigger (inkrementell)
- `.EKEventStoreChanged` (externer Kalender) · verpasste/verkürzte/verlängerte Session · neue/geänderte Task oder Deadline · PaceModel-Update (Schätzung korrigiert) · „Pause bis …" · FSRS-Note (Item neu fällig).
- **Inkrementell:** Anker + bereits begonnene Sessions behalten, nur Zukunfts-Sessions neu fließen → minimaler Plan-Churn (wichtig gegen ADHD-Überforderung). Kein „der ganze Plan sieht jeden Morgen anders aus".
- **Grund-bewusst (F8a):** manuelles Löschen/Verschieben löst ein Re-Flow aus, dessen Politik der **Grund** bestimmt — „brauche Freizeit" triggert **kein** Backfill (Slot wird geschützt), „nicht wichtig" zieht den nächstbesten Task vor. Gepinnte/manuelle Blöcke bleiben bei jedem Re-Solve erhalten.

### 8.5 Machbarkeits-„Cushion"
`cushion = verfügbareFreieMinuten(bisDeadline) − benötigteMinuten(Restumfang × paceKorrigiert)`.
- `cushion ≥ 0`: ok, Puffer anzeigen.
- `cushion < 0`: **früh** und neutral warnen, mit konkreten Hebeln: Scope kürzen · Ziel-Retention senken (0.90→0.85) · früher starten · mehr Tageslast (aber Schlaf bleibt hart) · Deadline-Realität prüfen.

---

## 9. Das Pace-Learning-Modell („die App lernt dich")

> Der Kern-Differentiator: kein Tool füttert *gemessenen Lern-Durchsatz* zurück in die *Kalender-Platzierung*. Genau das hier.

### 9.1 Was gemessen wird
Pro abgeschlossener Session: geplante vs. echte Dauer, erledigter Umfang (Seiten/Aufgaben/Folien), Retrieval-Erfolg, Unterbrechungen, Tageszeit, subjektive Schwierigkeit/Konfidenz.

### 9.2 Geschätzte → echte Geschwindigkeit
Pro `(Subject × Materialtyp)` wird eine **Geschwindigkeit** geführt (z. B. Seiten/h), aktualisiert per exponentiell geglättetem Mittel (robust gegen Ausreißer):
```
speedₙ = (1 − α)·speedₙ₋₁ + α·(istUmfang / istStunden)      # α ≈ 0.3
estimatedMinutes(material) = material.amount / speed(subject, kind) × difficultyFactor
```
→ „Du sagtest 30 Min für 10 Seiten Organik; bei dir dauern die ~50." Der **Schätz-Fehler** wird selbst getrackt und sinkt sichtbar über Zeit (Vertrauens-Builder + 1.0-Metrik #5).

### 9.3 Fokus-Abfall-Punkt
Aus Unterbrechungs- und Accuracy-Verläufen innerhalb von Sessions wird der individuelle Punkt geschätzt, ab dem Fokus/Accuracy abfällt → **persönliche Block-Länge** vorgeschlagen statt fixer Pomodoro-Zahl (RESEARCH A5: Selbstregulation schlug fixe Schedules).

### 9.4 Energie-Fenster
Performance nach Tageszeit aggregiert → anspruchsvolle Tasks ins gelernte Hoch-Fenster, Admin/Leichtes in Tiefs (high-Chronotyp-bewusst, kein Frühzwang).

### 9.5 Kaltstart & Vertrauen
Anfangs Literatur-Defaults (Heuristik nach Materialtyp/Schwierigkeit); ab wenigen Sessions personalisiert. Transparenz: „Diese Schätzung beruht auf deinen letzten N Sessions." Nutzer kann jederzeit override-n.

---

## 10. Metrik-Katalog (vollständig)

> Deine Anforderung: „**alle** Metriken dokumentiert, täglicher Konzentrationsdauer, wie viel wirklich geschafft." Append-only `MetricEvent`-Log, alles lokal, alles exportierbar.

**Pro Session:** geplante Dauer · **echte Fokuszeit** · Pausen (Anzahl, Dauer) · **Unterbrechungen + Grund** · erledigter Umfang (absolut & % des Geplanten) · aktive vs. passive (Lecture-)Zeit · Retrieval-Versuche/-Erfolge · subjektive Schwierigkeit · Konfidenz (prä) vs. Ergebnis (post).
**Pro Tag:** **tägliche Konzentrationsdauer** (Summe echter Fokuszeit) · geplant vs. geschafft · Anker-Aufgabe erfüllt? · Fächer-Verteilung (farbig) · Schlaf (optional geloggt) · Plan-Adhärenz · Anzahl Re-Schedules · **Reschedule-/Lösch-Gründe** (Verteilung) · geschützte Freizeit.
**Pro Fach/Modul:** Mastery pro Konzept · Retrieval-Erfolgsrate · **Fehlertyp-Verteilung** · Spacing-Adhärenz · realer Durchsatz (Pace) & Schätz-Fehler · Rest-Umfang vs. Deadline (Cushion).
**Übergreifend (1.0-Metriken):** **Kalibrierungs-Genauigkeit** · Retrieval-Erfolg gesamt · Spacing-Adhärenz · Schlaf-Konsistenz · Fehler-Aufarbeitungs-Rate · Plan-Adhärenz-unter-Realität · Streak-Qualität.
**FSRS-intern:** pro ReviewItem D/S/R, due, Review-Historie, Notenverlauf.

**Regel:** Jede dieser Metriken ist **anzeigbar**, aber nur die 1.0-Metriken sind **prominent**. „Gesamtstunden" wird gespeichert, aber nie als Erfolg gefeiert (엉덩이 힘-Anti-Pattern).

---

## 11. UX-Prinzipien & Schlüssel-Screens

**Prinzipien (ADHD-Nordstern):** ein nächster Schritt sichtbar · Zeit physisch · ≤3 Optionen pro Entscheidungspunkt · default-reich · scham-frei (kein Rot, kein Reset) · sofortige Belohnung.

| Screen | Zweck | Kern-Elemente |
|---|---|---|
| **Heute / „Was jetzt?"** | Single-Task-Fokus | genau *eine* nächste Session, One-Tap-Start, schrumpfender Keil-Timer, Tages-Anker |
| **Menübar** | Always-on-Externalisierung | Restzeit, nächster Block, Pause/Resume — ohne App zu öffnen |
| **Plan / Woche** | Vertrauen in den Plan | Zeit-proportionale Blöcke (Structured-Stil), belegt vs. Lern-Slots, Cushion-Indikator, „Woche neu planen" |
| **Session-Ausführung** | wirksames Lernen | Auto-Chunk erster Schritt, Retrieval-Prompt am Ende, laddered Warnungen, Post-Session-Karte |
| **Review (FSRS)** | Spaced Repetition | due-Queue, 4-Tasten-Grading, Konfidenz-Vorhersage |
| **Fehler-Vault** | 오답노트 | Fehler + Typ-Tag, re-test-Queue, Verteilungs-Analytik |
| **Dashboard** | 1.0-Metriken | Kalibrierung, Retrieval-Erfolg, Spacing, Schlaf prominent; Stunden klein |
| **Onboarding** | Setup | Kalender-Full-Access, Tagesgrenzen, Energie, erstes Fach/Material |

---

## 12. Technische Architektur

### 12.1 Stack-Empfehlung
**Native SwiftUI + EventKit** (macOS 14+; iPhone/iPad später mit demselben Framework — Wachstumspfad). Begründung (RESEARCH E5): Electron/Web kann EventKit **physisch nicht** ansprechen (harter Blocker); nativ liefert eine API über alle Kalender-Konten, erstklassige Menübar-/Ambient-Timer, 3–20 MB statt 150–500 MB RAM.
**Cross-Platform-Alternative** (nur falls Windows/Linux *hart* nötig): **Tauri + Swift-Sidecar** für EventKit, sonst Google-Calendar-API/CalDAV — mit der Kalender-Integrations-Steuer. Siehe §15 (offene Entscheidung).

### 12.2 Schichten (Clean Architecture — wie im bestehenden Repo)
```
Domain        reine Swift-Structs/Funktionen: Scheduler, FSRS, PaceModel, Pomodoro-Logik
              → zustandslos, voll unit-testbar, kein UIKit/EventKit-Import
Application   Services/Use-Cases: PlanService, SessionService, ReviewService, MetricsService
Infrastructure Adapter: EventKitCalendarRepository, SwiftDataStore, NotificationScheduler,
              SoundPlayer, MenuBarTicker, (optional) AnkiConnectClient
Presentation  SwiftUI-Views + @Observable-ViewModels
```
Dependency Injection wie in `PomodoroService` (Adapter werden injiziert) → Domain bleibt rein, Infrastruktur austauschbar/testbar.

### 12.3 EventKit-Integration
- **Full Access** (`requestFullAccessToEvents`; Info.plist `NSCalendarsFullAccessUsageDescription`).
- Lesen via Date-Range-Predicate; busy/free aus `event.availability` + Lücken-Berechnung.
- Lern-Events in eigenen `EKCalendar` schreiben (farblich „Pace").
- `.EKEventStoreChanged` beobachten → refetch → `PlanService.resolve()` (Notification hat kein Payload → voll refetchen).
- EventKit-Objekte in eigene `@Observable`-Modelle spiegeln (SwiftUI updatet sonst nicht).

### 12.4 Persistenz
**SwiftData** (`@Model`) für Subject/Module/Task/Material/StudySession/ReviewItem/MetricEvent/PaceModel/EnergyProfile. **EventKit bleibt Source of Truth für Kalender** — nur cachen, was nötig. Alles on-device.

### 12.5 FSRS
Gepflegte Implementierung (Swift-Port von `rs-fsrs`/`ts-fsrs` oder via Rust-Lib `fsrs-rs` eingebunden). *Eine* Version, Kurve+Intervall gematcht. Optimizer auf Nutzer-Log ab ~300 Reviews. Nicht selbst neu erfinden.

### 12.6 Wiederverwendung des bestehenden Pomodoro-Timers
Die vorhandene Domänenlogik (`src/domain/pomodoroDomain.js`: `startPhase`/`pausePhase`/`advanceToNextPhase`/`computeRemainingMs`, immutable State-Updates, Sleep-Recovery in `pomodoroService.js`) ist **rein und sauber** — sie portiert 1:1 als Swift-Struct-Domäne der Fokus-Engine. Die Adapter-Idee (`badge`, `soundPlayer`, `scheduler` injiziert) wird zu `MenuBarTicker`, `NotificationScheduler`, `SoundPlayer`. **Konzepte & Tests wandern mit; nur die Sprache wechselt.** Die Chrome-Extension kann als Leichtgewicht-Companion bestehen bleiben, ist aber nicht der Mac-Kern.

### 12.7 Hintergrund-Betrieb
Menübar-App (`LSUIElement`/`MenuBarExtra`), läuft persistent für Timer + `.EKEventStoreChanged`-Beobachtung; lokale Notifications für Transition-Warnungen und fällige Reviews.

---

## 13. Privacy
- **Lokal-first, on-device, kein Server, kein Account nötig.** Kalender- und Lerndaten verlassen das Gerät nie (stärkste Differenzierung gegen Cloud-Scheduler wie Motion/Reclaim/SpaceRep).
- Optionale Cloud-Features (Co-Study) klar opt-in und minimal (nur Präsenz, keine Inhalte).
- Voller Export/Löschung jederzeit (F12).

---

## 14. Roadmap

### MVP (v1) — „der Plan, der die Realität respektiert und dich kennt"
EventKit Full-Access + busy/free · Fächer/Module/Tasks/Material mit Seiten/Folien/Schwierigkeit · Auto-Scheduler (§8) + Cushion · Lern-Events zurück in den Kalender · Fokus-Session (Pomodoro-Engine portiert) + Retrieval-Prompt + Post-Session-Karte · Pace-Learning v1 (echte vs. geschätzte Dauer) · `.EKEventStoreChanged`-Auto-Reschedule + scham-freies Re-Flow · Schlaf-Constraint · Basis-Dashboard (1.0-Metriken).
*Bewusst draußen: FSRS, Co-Study, Mind-Maps, Anki-Brücke.*

### v2 — „wirksames Wiederholen"
FSRS-Engine + Reviews in den Kalender · Fehler-Vault (오답노트) · Calibration-Loop · Interleaving-Übungstage · Reverse-Exam-Kalender + Exam-Mode · gelernte Energie-Fenster & Fokus-Abfall.

### v3 — „Tiefe & Gemeinschaft"
Co-Study/Body-Doubling · AnkiConnect-Brücke · Socratic-AI-Tutor (Antworten-verweigernd, RAG auf eigenen Materialien — Kestin-2025-Muster) · Mind-Map→Flashcard-Pipeline · iPhone/iPad-Begleiter (gleiches EventKit).

---

## 15. Offene Entscheidungen

| # | Entscheidung | Empfehlung | Warum es deine Eingabe braucht |
|---|---|---|---|
| 1 | **Plattform/Stack** | **Native SwiftUI + EventKit** | Technisch durch deine Anforderungen erzwungen (Electron kann EventKit nicht). Einzige Gegenkraft: dein bestehender JS-Skill. Alternative: Tauri + Swift-Sidecar (behält Web-Frontend, kostet Kalender-Reibung). |
| 2 | **Scope-Verhältnis zum Pomodoro-Repo** | Pomodoro wird **Fokus-Engine** des neuen Mac-Produkts; Extension bleibt optional bestehen | Du könntest stattdessen ein komplett separates Produkt wollen. |
| 3 | **Name** | „Pace" (Arbeitstitel) | Persönliche Präferenz; Alternativen: Cadence, Tempo, Hagwon. |
| 4 | **MVP-Tiefe** | FSRS erst v2 | Wenn dir Spaced Repetition wichtiger ist als Auto-Scheduling, ziehen wir es in v1. |
| 5 | **Co-Study/Cloud** | erst v3, opt-in | Falls Accountability dein Haupt-Motivator ist, früher. |

### Meine konkrete Empfehlung
Bauen als **native SwiftUI+EventKit-Menübar-App**, MVP wie §14, Pomodoro-Domäne nach Swift portiert. Das trifft jede deiner Anforderungen (lokaler Kalender, Hintergrund-Auto-Reschedule, Seiten/Folien/Schwierigkeit, alle Metriken, Pace-Learning, ostasiatische evidenzbasierte Methoden, Mac-first) und besetzt eine echte, belegte Marktlücke.

---

## 16. Anti-Ziele & Risiken

**Anti-Ziele (bewusst NICHT bauen):**
- Keine Gamifizierung von **Stunden** oder Schlaf-Reduktion (엉덩이 힘 / 4당5락).
- Kein angst-induzierendes Über-Packen (Motions stiller Fehler) und kein rotes „überfällig".
- Keine öffentlichen Leaderboards by default (Gesichtsverlust-Mechanik), keine punitiven Streaks.
- Kein eigener SRS-Algorithmus (FSRS nutzen); keine 25/5-Dogmatik als „wissenschaftlich optimal".
- Nie ungefragt **geschützte Erholungszeit zurückfüllen** — wer Freizeit freiräumt, wird nicht mit neuen Tasks „bestraft" (Erholung ist kein Defizit, sondern Teil des Lernens).

**Risiken & Gegenmittel:**
| Risiko | Gegenmittel |
|---|---|
| **Planen-als-Prokrastination** — das Schreiben des Plans gibt einen Dopamin-Hit, der Ausführung ersetzt | Setup minimal halten; Erfolg = ausgeführte Sessions, nicht hübsche Pläne; Anker-Aufgabe sofort startbar |
| **Über-Schätzung** kollabiert Pläne | bewusstes Unter-Planen; Pace-Learning korrigiert; Cushion warnt früh |
| **Schätz-Kaltstart** ungenau | Literatur-Defaults + Transparenz + schnelle Personalisierung |
| ADHD-Design-Evidenz ist meist Konsens, nicht RCT | mit Mechanismus (Barkley) + starken Befunden führen; %-Zahlen meiden |
| EventKit Full-Access-Hürde / Ablehnung | klare Begründung; Graceful-Degradation (read-only Vorschau) |
| Plan-Churn überfordert | nur inkrementell re-solven; Anker fix; „der Plan ändert sich nicht ständig" |

---

*Ende Spec v0.1. Nächster Schritt: deine Antworten zu §15 (v. a. Plattform-Bestätigung), dann konkretisiere ich Datenmodell-Schemata, Scheduler-Tuning und einen MVP-Build-Plan — oder ich beginne mit einem lauffähigen SwiftUI+EventKit-Gerüst.*
