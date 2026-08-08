# RESEARCH — Wissenschaftliche & Markt-Grundlage für einen adaptiven Lernplaner

> Konsolidierte, faktengeprüfte Recherche als Fundament für [`SPEC.md`](./SPEC.md).
> Erstellt: 2026-06-26. Vier parallele Recherche-Stränge (Lernwissenschaft, ostasiatische Methoden, Konkurrenzanalyse, Focus-Design + macOS-Technik). Alle tragenden Effektstärken und Algorithmus-Formeln wurden gegen Primärquellen adversarial verifiziert; widerlegte oder populäre-aber-dünne Behauptungen sind **explizit als solche markiert**, nicht still entfernt.

## Wie man die Evidenz liest — drei Stufen

1. **Fundament** (jahrzehntelange Replikation, große Meta-Analysen): **Retrieval Practice**, **verteiltes/spaced Lernen**. Das Produkt wird um diese gebaut.
2. **Stark-aber-begrenzt** (gute Meta-Analysen, Domänen-Grenzen): Interleaving, Dual Coding, Self-Explanation, Elaborative Interrogation, Desirable Difficulties, Metakognition/SRL.
3. **Schwach / umstritten / mythologisiert** (populär, aber dünn belegt): die *spezifische* Pomodoro-25/5-Ratio, die 52/17-Regel, saubere 90-Minuten-Ultradian-Zyklen, die starke „Micro-Offline-Gains"-Deutung. Das **Prinzip** strukturierter Pausen überlebt; die **Magie-Zahlen** nicht.

> Wichtiger Meta-Punkt (Donoghue & Hattie 2021): In ihrer Meta-Analyse überschritten **alle zehn** Dunlosky-Techniken d = 0.40. „High vs. low utility" beschreibt **Robustheit und Breite der Evidenz**, keinen Effektstärken-Abgrund. Den Nutzern wird nie gesagt, eine Technik sei *nutzlos* — sondern *ineffizient relativ zur Alternative*.

---

# TEIL A — Universelle, evidenzbasierte Lernwissenschaft

## A1. Die Dunlosky-Rangordnung (Anker für die UX)

Dunlosky, Rawson, Marsh, Nathan & Willingham (2013), *Improving Students' Learning With Effective Learning Techniques*, bewertete 10 Techniken:

| Nutzen | Techniken |
|---|---|
| **HOCH** | **Practice Testing** (Selbsttest), **Distributed Practice** (verteiltes Lernen) |
| **MITTEL** | Elaborative Interrogation, Self-Explanation, Interleaved Practice |
| **NIEDRIG** | Zusammenfassen, Markieren/Unterstreichen, Schlüsselwort-Mnemonik, Imagery, **Wiederlesen** |

**UX-Headline:** Die Techniken, die Studierende am *meisten* nutzen (Wiederlesen, Markieren, Zusammenfassen), sind die **niedrig-effektiven**. Die Aufgabe der App: sanft zu den hoch-effektiven schieben, die sich schwerer anfühlen und deshalb gemieden werden.

## A2. Fundament-Techniken

### Retrieval Practice / Testing Effect — HOCH (d ≈ 0.74)
- **Mechanismus:** Aktives Rekonstruieren aus dem Gedächtnis (statt Wiederlesen) stärkt und rekonsolidiert die Gedächtnisspur, schafft zusätzliche, haltbarere Abrufwege.
- **Evidenz (sehr stark):** Roediger & Karpicke (2006), *Psych. Science*: Nach **5 Min** schlug Nur-Lernen das Testen (83 % vs. 71 %); nach **1 Woche kehrte sich das um** — wiederholtes Testen 61 % vs. 40 % für wiederholtes Lernen (~50 % relativer Gewinn). Karpicke & Blunt (2011): Retrieval schlug Concept-Mapping bei 101 von 120 Personen. Donoghue & Hattie (2021) Meta: d = 0.74.
- **Operationalisieren:** Default-Lernblock = aktiver Selbsttest / „Brain-Dump", nie ein „Wiederlesen"-Block. „Antwort zeigen" erst nach mindestens einem Abrufversuch freigeben. Pro-Item-Recall-Erfolg als Input für den Scheduler (siehe A8). Free Recall ("schreib alles auf, was du über X weißt") ist das billigste hochwertige Primitiv — braucht kein Karten-Authoring.

### Distributed / Spaced Practice — HOCH (d ≈ 0.85)
- **Mechanismus:** Lernen über Zeit verteilen erzwingt Abruf nach teilweisem Vergessen → effortvoller → stärkere Speicherung. Der optimale Abstand ist **nicht fix**, er skaliert mit der gewünschten Behaltensdauer.
- **Evidenz (sehr stark):** Cepeda et al. (2006), *Psych. Bulletin* — die definitive Meta-Analyse: 839 Assessments / 317 Experimente / 184 Artikel. Cepeda et al. (2008/09): **optimaler Abstand ≈ 10–20 % der gewünschten Behaltensdauer** (Test in 1 Woche → ~1–2 Tage Abstand; Behalten über Monate → Wochen). Donoghue & Hattie: d = 0.85 (ihr höchster Wert). Oft 2× Behalten vs. Cramming bei gleicher Gesamtlernzeit.
- **Operationalisieren:** Das **Rückgrat** des Planers. Auto-geplante **expandierende** Review-Blöcke statt Sessions-Stapel. Bei Klausurdatum: rückwärts geplante Spacing-Touchpoints mit zum Termin hin wachsenden Abständen. Cramming aktiv abwerten/warnen.

### Interleaving — MITTEL (stark in Mathematik; d ≈ 0.67, in Mathe bis 1.21)
- **Mechanismus:** Aufgaben*typen* mischen (ABCABC) statt blocken (AAABBBCCC) erzwingt das **Unterscheiden, welcher** Ansatz gilt — nicht nur das Ausführen eines bekannten. Konfundiert mit Spacing.
- **Evidenz:** Firth et al. (2021) Review: d = 0.67. Taylor & Rohrer (2010), 4.-Klasse-Mathe: interleaved 77 % vs. blocked 38 % nach einem Tag, d = 1.21. Schwächer bei manchem verbalen Material — nicht überverkaufen.
- **Operationalisieren:** „Mixed-Practice"-Modus, der Aufgaben aus mehreren aktuellen Themen/Fächern zieht. Ehrlich labeln: „Gemischtes Üben fühlt sich schwerer an, testet aber besser."

### Elaborative Interrogation & Self-Explanation — MITTEL (d ≈ 0.55)
- "*Warum* ist das wahr?" / "Erkläre in eigenen Worten, warum dieser Schritt folgt." → Integration mit Vorwissen, generativer als Wiederlesen. Operationalisieren: Worked-Example-Modus; nach Faktenkarten gelegentlich „Warum könnte das stimmen?"-Prompt.

### Dual Coding / Multimedia — MITTEL bei Dunlosky, stark als Mayers CTML (d ≈ 0.80 für *gut gestaltetes* Multimedia)
- Wort + relevante Bilder = zwei komplementäre Abrufwege. **Aber:** reine mentale „Imagery for text" ist NIEDRIG — der Nutzen kommt von echten, gut integrierten Visuals. Operationalisieren: Bild/Diagramm-Anhänge; Labels *neben* den beschriebenen Teil (Spatial Contiguity); dekorative Bilder weglassen (Coherence).

### Die NIEDRIG-Techniken (de-emphasizen)
Wiederlesen, Markieren, Zusammenfassen erzeugen **Fluency-Illusionen** (Material *fühlt sich* bekannt an ≠ abrufbar). Nicht die App um Notiz-Wiederlesen bauen. Notizen = *Input zur Generierung von Abruf-Prompts*, nicht die Lernaktivität selbst.

## A3. Desirable Difficulties & New Theory of Disuse (R. Bjork)
- **Storage strength** (wie tief gelernt, sinkt nie) vs. **Retrieval strength** (aktuelle Zugänglichkeit, schwankt). Kern: **Bei hoher Retrieval-Strength bringt mehr Lernen kaum Speicher-Zuwachs; bei niedriger (aber >0) Retrieval-Strength steigert erfolgreicher Abruf beide stark.** Vergessen schafft die *Gelegenheit* für stärkeres Wieder-Lernen.
- **Lizenz für die App:** Sie darf sich *schwerer* anfühlen als ein Karteikarten-Spielzeug. Reviews planen, wenn Items *teils vergessen* sind (genau was Spaced Repetition tut); Recall vor Recognition; Effortfulness als Feature kommunizieren, damit Nutzer nicht aufgeben.

## A4. Metakognition & Self-Regulated Learning (SRL)
- **Zimmermans Zyklus:** Forethought (Ziele/Planung) → Performance (Ausführung/Selbst-Monitoring) → Self-Reflection (Selbstbewertung) → speist nächste Runde.
- **Evidenz:** Li et al. (2018) Meta (n = 23 497): SRL→Leistung d = 0.365; stärkste Sub-Prozesse **Self-Evaluation d = 0.717**, Self-Efficacy 0.699, Task-Strategies 0.600. (Korrelativ, chinesische Stichprobe.) Metakognitions-*Interventionen*: g ≈ 0.48–0.63, Effekte wachsen oft beim verzögerten Follow-up, helfen Schwächeren am meisten.
- **Operationalisieren:** Features direkt auf die 3 Phasen mappen; am meisten in die **Reflexion** investieren (größter Effekt).

### Kalibrierung & Fluency-Illusion (eine Feature-Goldmine)
- Lernende schließen aus *Verarbeitungs-Flüssigkeit* auf „Ich kann das" → **Illusion des Wissens** / Überkonfidenz. Avhustiuk et al. (2018, n=262): 59,4 % machten JOL-Fehler, 31,3 % overconfident. Serra & Shanks (2023): Blocking bläht Überkonfidenz auf; Interleaving *eliminiert* die Verzerrung. Kruger & Dunning (1999): unterstes Quartil überschätzte den eigenen Rang um ~50 Perzentilpunkte.
- **Operationalisieren — Calibration-Loop:** Vor dem Aufdecken einer Antwort den Nutzer *vorhersagen* lassen, ob er sie kann; dann predicted-vs-actual über Zeit zeigen. Trainiert Kalibrierung, zerstört Fluency-Illusionen. Recall statt Recognition in der UI.

## A5. Pomodoro, Pausen, Ultradian, Deep Work — wo die Populär-Lore scheitert
- **Pomodoro 25/5 — schwach für die *spezifische* Ratio:** Strengster Test (2025 RCT, n=94): **kein** signifikanter Unterschied Pomodoro vs. Flowtime vs. selbstreguliert in Aufgaben-Erledigung (p = 0.854); Pomodoro zeigte sogar *schnellere* Ermüdung (p = 0.025) und Motivations-Abfall (p = 0.008) als selbstreguliert. Real ist: mentale Ermüdung nach ~20–30 Min; Task-Switching kostet bis ~40 % (Leroy 2009, Attention Residue).
- **90-Minuten-Ultradian:** Die methodisch sauberste Studie (Neubauer & Freudenthaler 1995) heißt wörtlich „*keine* Evidenz für 1,5-h-Rhythmus". Individuell idiosynkratische Oszillatoren (80–120 Min). Kein harter 90-Min-Block bauen.
- **52/17-Regel:** Kein Research — Blog einer Zeittracking-Firma über eigene Nutzer; Zahl wanderte (112/26 in 2021). Nie als Wissenschaft zitieren.
- **Deep Work:** Buch, keine Studie; die zugrunde liegende Attention-Residue-Forschung ist real. „Distraction-free-Modus" ist gut begründet.
- **Fazit:** Timer/Pausen ausliefern (Adhärenz, Gewohnheit), aber Dauern **personalisierbar** machen, eine **Flexible/Flowtime-Option** anbieten und **keine Magie-Ratio** als „wissenschaftlich optimal" behaupten. Besser: die App **lernt den persönlichen Fokus-Abfall-Punkt** aus den eigenen Session-Daten.

## A6. Schlaf, Konsolidierung, Bewegung
- **Schlaf & Konsolidierung (stark):** „Active Systems Consolidation" — im NREM-Tiefschlaf werden Gedächtnisinhalte vom Hippocampus zum Neokortex transferiert; *kann wach nicht passieren*. Schlaf-vs-Wach-Vorteil für Fakten ≈ **d = 0.72 nach 24 h**. Erste ~6 h nach dem Lernen sind das vulnerable Konsolidierungsfenster.
- **Timing:** Deklaratives Material am besten **nachmittags** lernen, dann normaler Schlaf (Holz 2012: 98,7 % nachmittags vs. 95,0 % abends). Prozedural/motorisch näher an der Schlafenszeit.
- **Bewegung:** Aerobes Training hebt BDNF/Neurogenese. Erickson (2011, *PNAS*): 1 Jahr Gehen → +2 % Hippocampus-Volumen vs. −1,4 % Kontrolle. Hötting (2016): moderates Aerobic *nach* dem Lernen verbesserte 24-h-Vokabel-Behalten.
- **Operationalisieren:** Reviews über **mindestens eine Nacht** verteilen (eine Schlaf-Lücke schlägt eine Extra-Session am selben Tag). Optional Schlaf loggen, das Post-Lern-Fenster schützen. Optional ~20–30 Min Aerobic nach Lernblock vorschlagen.
- **Verifikations-Flag (verworfen):** „Micro-Offline-Gains ~4× größer als Über-Nacht-Konsolidierung" (Bönstrup 2019) — die *Zahl* stimmt, aber 2024/25-Replikationen (bioRxiv, *PNAS*) deuten sie als statistisches/motor-planning Artefakt. **Nicht** als Feature-Basis nutzen.

## A7. Cognitive Load Theory (Sweller)
- Arbeitsgedächtnis ist für *neue* Information stark begrenzt; LTM-Schemata umgehen das. Drei Lasten: intrinsisch (Komplexität × Expertise — sequenzieren), extraneous (schlechtes Design — minimieren), germane (produktiver Aufbau von Schemata).
- **Schlüsselzahl:** Arbeitsgedächtnis-Kapazität ~**4 ± 1** unabhängige Items (Cowan 2001, modernere Zahl als Millers 7 ± 2).
- **Operationalisieren:** **≤ ~4 neue Konzepte pro Session/Screen**; easy→hard sequenzieren; FSRS-Difficulty + Nutzer-Accuracy als Live-Proxy für intrinsische Last → drosselt, wie viele neue/harte Items pro Session erscheinen; clean UI, progressive Disclosure.

## A8. Spaced-Repetition-Algorithmen (der Scheduling-Kern)

### Leitner (1972) — konzeptuelle Basis
5 Boxen mit wachsenden Intervallen. **Richtig → eine Box hoch; falsch → zurück zu Box 1.** Transparent, ideal als „Anfänger-Modus" oder Fallback ohne Daten.

### SM-2 (SuperMemo, 1987) — der Klassiker, Ankis Legacy-Default
- **Easiness Factor (EF)** pro Item, Start **2.5**, Update nach Note q∈[0,5]:
  `EF' = EF + (0.1 − (5 − q) × (0.08 + (5 − q) × 0.02))`, harter **Floor EF = 1.3**.
- **Intervalle:** I(1)=1 Tag, I(2)=6 Tage, I(n)=round(I(n−1) × EF).
- **Lapse:** q < 3 → Sequenz von I(1) neu (EF wird *nicht* zurückgesetzt).
- **Schwäche („ease hell"):** wiederholte Lapses drücken EF auf 1.3 und es erholt sich nie → permanentes Über-Cramming. Hauptgrund für neuere Algorithmen.

### FSRS — Free Spaced Repetition Scheduler (2022–2025) — der moderne Standard
- **Ankis eingebauter Default seit v23.10 (Nov 2023).** Open-Source-Libs: `py-fsrs`, `ts-fsrs`, `rs-fsrs`.
- **DSR-Modell:** pro Karte **D**ifficulty ∈ [1,10], **S**tability (Tage bis Retrievability auf 90 % fällt), **R**etrievability (aktuelle Abruf-Wahrscheinlichkeit).
- **Vergessenskurve (FSRS-4.5+):** `R(t,S) = (1 + FACTOR · t/S)^DECAY`, mit DECAY = −0.5, FACTOR = 19/81.
- **Intervall für Ziel-Retention r — ⚠️ VERSIONS-SPEZIFISCH, nicht mischen:**
  - FSRS v4 (DECAY=−1): `I = 9·S·(1/r − 1)` → bei r=0.9 ≈ S.
  - FSRS-4.5+ (DECAY=−0.5): `I = (81/19)·S·(1/r² − 1)`.
- **Noten:** 4 Tasten Again/Hard/Good/Easy. **Parameter:** FSRS-5 = 19, FSRS-6 = 21 Gewichte; pro Nutzer **personalisierbar** durch einen Optimizer auf dem eigenen Review-Log (sinnvoll ab ~300 Reviews).
- **FSRS vs. SM-2 — was *belegt* ist:** Vorhersage-Genauigkeit rigoros gebenchmarkt (~727 Mio. Reviews), FSRS gewinnt klar; FSRS-6 ≈ 99,6 % Überlegenheit über SM-2 auf Log-Loss. „~20–30 % weniger Reviews bei gleicher Retention" = **Simulation/Community-abgeleitet**, nicht aus dem kanonischen (Genauigkeits-)Benchmark — als „in Simulationen berichtet" angeben. (Eine kursierende Citation „Domenech-Iglesias 2024" ist **fabriziert**, ausgeschlossen.) FSRS vermeidet „ease hell" strukturell (D und S getrennt/begrenzt).

### Empfohlenes Scheduler-Design
| Entscheidung | Empfehlung |
|---|---|
| Primär-Scheduler | **FSRS** über gepflegte Lib (`ts-fsrs`/eigene Rust/Swift-Bindung); *eine* Version wählen, Kurve+Intervall als gematchtes Paar. |
| Onboarding/Low-Data | **Leitner 5-Box** — transparent. |
| Grading-UI | 4 Tasten Again/Hard/Good/Easy. |
| Default-Ziel-Retention | **90 %** (≈0.85 für leichtere Last, ≈0.95 für High-Stakes). |
| Personalisierung | FSRS-Optimizer auf Nutzer-Historie ab ~300 Reviews. |
| Nicht | keinen eigenen Algorithmus erfinden; FSRS-Versionen nicht mischen. |

## A9. Neueste Forschung 2022–2025
- **FSRS-Adoption:** von Community-Projekt (2022) zu **Ankis Default** (v23.10, 2023) für Millionen; FSRS-5 (2024) und FSRS-6 (2024/25) senkten den Vorhersagefehler je um ~4 %. *Größter praktischer Shift für jede neue SRS-App: auf FSRS starten, nicht SM-2.*
- **KI-Tutoring (hoch-relevant):** Kestin et al. (2025), *Scientific Reports* (n=194 Harvard-Physik, within-subject): ein gut designter KI-Tutor erzeugte **>2× den Lerngewinn** von In-Class-Active-Learning, Effekt **0.73–1.3 SD**. *Warum es wirkte:* der Tutor **verweigerte direkte Antworten** (erzwang aktiven Abruf), skaffoldierte sequenziell (managte Cognitive Load), gab Growth-Mindset-Feedback. Caveats: 2 Wochen, Elite-Population, kein Langzeit-Behalten gemessen.
- **Generative-KI-Risiko:** passive Nutzung (KI-Zusammenfassungen lesen statt abrufen) kann Lernen *senken* und Über-Abhängigkeit fördern. Design-Regel: **KI-Hilfe hinter mindestens einem Abrufversuch gaten**; RAG auf den eigenen Materialien gegen Halluzination.
- **Prequestioning/Pretesting:** Fragen *vor* dem Lernen (auch falsch beantwortet) verbessern späteres Behalten — eine Generation-Desirable-Difficulty.

---

# TEIL B — Ostasiatische (koreanische/chinesische) Top-1%-Methoden

> Kern-Erkenntnis: Korea und China kamen unter verschiedenen Namen zu **denselben** evidenzbasierten Techniken. Der ganze Wert liegt darin, **Evidenzbasiertes** von **Grind-Kultur** zu trennen.

## B1. Evidenzbasierter Kern (Features drumherum bauen)

| Methode (Original) | Was es ist | Evidenz-Entsprechung | Als Feature |
|---|---|---|---|
| **오답노트** (KR) / **Cuotiben** (CN) — Fehler-Notizbuch | Jede falsche Antwort loggen — **nicht** die Lösung abschreiben, sondern Fehlertyp diagnostizieren (Konzept/Rechnung/Misread/Flüchtig/Zeitdruck), selbst korrekt herleiten, terminiert wieder testen | Error-based Learning + Retrieval + metakognitives Monitoring. Chin. RCT (n=56): große Effekte (η²=0.23/0.30), Kontrollgruppe *verschlechterte* sich | Falsche Antworten in „Fehler-Vault" auto-flaggen → Fehlertyp-Tag erzwingen → spaced re-queue (1d/3d/1w) → Analytik („12 Konzeptfehler in Ableitungen") → Pre-Exam-Fehler-Review |
| **백지복습** (KR) — Blank-Paper / „Blurting" | Nach dem Lernen alles aus dem Gedächtnis auf ein **leeres Blatt** reproduzieren (Struktur, nicht Einzelfakten), gegen die Quelle vergleichen, Lücken rot markieren, nur Lücken nachlernen, 24–48 h später wiederholen | Free-Recall-Testing-Effect + Generation-Effect + Kalibrierung. SNU-Fall: 70 % vs. 38 % Baseline. *Caveat:* braucht Scaffolding (was eine App liefert) | Blank-Canvas-Recall nach jedem Block >20 Min → NLP-Abgleich gegen Quelle → Auto-Lückenliste → Follow-up bei 24h/72h/7d. „Struktur-Scaffold" liefert nur Überschriften für harte Themen |
| **회독 / N회독** (KR) — N-faches Lesen | Material N-mal lesen, **jeder Durchgang mit anderem, tieferem Zweck** (Pass 1–2 Skim/Mental-Map; 3–4 verstehen/markieren; 5–6 nur Markiertes; 7–10 Härtestes). Progressives Farb-Annotieren macht Schweres sichtbar. Lore lehrt explizit: Vergessen zwischen Pässen ist *normal und nützlich* | Spaced Repetition + Levels-of-Processing + progressives Filtern auf Schwäche | Pass-Zähler pro Ressource; „unklar"-Tags blenden in späteren Pässen Klares aus (Dokument kollabiert auf „nur Schweres"); Lese-Geschwindigkeits-Hinweise pro Pass; Schwierigkeits-Heatmap |
| **Ebbinghaus memory curve** (CN) — Ebbinghaus-Kurve | Review innerhalb 24h → 3d → 7d → 14d → 30d. **Rückgrat der chin. Lern-App-Industrie:** Momo beidanci (Momo, 300 Mio.+ Downloads) personalisiert Intervalle pro Wort auf 120 Mrd. Datenpunkten (Research bei ACM SIGKDD/IEEE TKDE) | = Spaced Repetition (Goldstandard), verstärkt durch aktiven Abruf statt passivem Wiederlesen. Innovation: Intervall an *individuelle* Vergessensrate anpassen | Nach Item-Lernen Reviews bei expandierenden Intervallen; **recall-adaptiv** (richtig+schnell → Intervall strecken; gekämpft → kürzen); tägliche „heute fällig"-Queue; projected-vs-actual-Retention zeigen |
| **메타인지 학습법** (KR) — Metakognition | „Unterscheiden, was man weiß von was nicht" — in KR-Diskurs stärkerer Erfolgsprädiktor als IQ. Selbst-Assessment (1–3), Teach-it-back/Feynman, exploratives Lösen (Lösung *nicht* sofort prüfen), selektives Review | Flavell-Monitoring; Dunning-Kruger-Korrektur; Productive Failure (Kapur). KR-Research: bis 30 % Zuwachs | Konfidenz-Rating pro Thema; **Kalibrierungs-Genauigkeit** als verbesserbarer Score; „Erkläre es zurück"-Modus mit KI-Lücken-Flag; gap-gewichtetes Auto-Scheduling |
| **자기주도학습** (KR) — Selbstgesteuertes Lernen | 5-Schritt: Ziele → Planung (**plane, *wann du anfängst***, nicht wann fertig) → Lernstil → Review/Feedback (täglich „erledigt? was schief? was morgen anders?") → Belohnung/Ruhe (strukturell) | = Zimmermans SRL-Zyklus; Implementation Intentions (Gollwitzer: 2–3× mehr Follow-through); Goal-Gradient | 3-Stufen-Ziel-Hierarchie (Klausur→Monat→Tag); Morgen-Planung + Abend-Review als erstklassiger Flow; wöchentliche 5-Min-Retro; Streak auf das **Ritual**, nicht die Stunden |
| **Siwei daotu** (CN) — Mind Maps | Radiale Diagramme zur Konsolidierung & Querverbindung | Elaborative Encoding/Schema-Bildung. **Aber:** schwächer als Retrieval Practice fürs Langzeit-Behalten — Organisations-, kein Gedächtniswerkzeug | End-of-Session-Map-Builder; **Map→Flashcard-Pipeline**; „Blank-Map"-Recall (Blätter strippen, aus Gedächtnis füllen → macht es zur Retrieval-Übung) |
| **인강** (KR) — Online-Vorlesungen | Riesige Prüfungsvorbereitungs-Industrie (EBSi staatlich/gratis; Mega/Daesung). Oft 1,5–2× Speed (배속) | Self-paced Video. KISTI: 1,5×/2× mindern Verständnis kaum, 2× zweimal schlägt 1× einmal. **Falle:** passiver Konsum, ~0 Retention | **Vorlesungs-Zeit getrennt von aktiver Problem-Zeit** loggen (kognitiv verschieden, Verwechslung = Kern-Fehler); aktive Abruf-Pausen in langen Watch-Sessions |

### Strukturierte Planungssysteme (wo die Disziplin für einen *Planer* direkt zahlt)
- **스터디플래너** (KR) + 수능-Bestnoten + SKY-Methoden: hierarchisch (Monat→Woche→Tag); **„Minimum Viable Day"** (eine Anker-Aufgabe macht den Tag erfolgreich → gegen Alles-oder-Nichts-Kollaps); CSAT-Bestleser konvergieren auf: Planer als plan→execute→review-OS, *mehrere Lösungswege* pro Problem, konzeptuelle Tiefe statt Pattern-Memorisierung, Selbstprüfung nach jeder Session, **7+ h Schlaf non-negotiable**; **Reverse-Exam-Kalender** (Mathe/Science 4 Wochen vorher, Englisch 3, Sozial 2, Leicht 1), Klausurwoche „nur Gemeistertes reviewen".
  - **Operationalisieren:** 3-Stufen-Planer, der **bewusst unter-plant** (Top-Fehler: zu optimistische Pläne kollabieren mittwochs und werden beschämt aufgegeben); „Daily Anchor Task"; auto-generierter Reverse-Exam-Kalender; „Exam-Week-Modus" 3 Tage vorher (nur Review, neues Material verstecken); Pflicht-Post-Session-Review-Karte. ⚠️ **Falle:** das *Schreiben* des Plans gibt einen Dopamin-Hit, der die *Ausführung* ersetzt.
- **Gaokao zhuangyuan** (CN) — zirkadianes Fach-Scheduling: Mathe im Morgen-Ausdauer-Fenster (8–9), intensives Memorisieren 9–11, Langzeit-Behalten-Stoff 15–16; Fach-pro-Tag-Rotation, Geistes/Natur-Wissenschaft alternieren; **Youzhang youchi** (Spannung/Entspannung — Dichte über rohe Stunden); tägliches Fupan (Retro). → Fächer nach kognitivem Typ taggen (memorieren/rechnen/verstehen), Tageszeit-Slots vorschlagen; Rotations-Templates; täglicher Retro-Prompt.

## B2. Tracking-/Motivations-Apps (warum Studierende sie lieben — Accountability, nicht Pädagogik)

| App | Kern-Mechanik | Warum geliebt |
|---|---|---|
| **열품타 / YPT** (KR, 3,3 Mio.+) | Pro-Fach-Stoppuhr + **Gruppen-Leaderboards** + Webcam-Check-ins + In-Session-App-Blocking | **Soziale Performance** — Lernen ist öffentlich; Gesichtsverlust auf bekanntem Leaderboard ist echte Kosten (dokumentiert: 2h→8h/Tag nach Gruppenbeitritt) |
| **타임스프레드 / TimeSpread** (KR, 8 Mio.) | Planer/Stundenplan + **Mission-Alarme** (nicht ohne Aktion wegklickbar) + Timestamp-Foto-Journal + **echtes Cash** | Variable-Ratio-Cash-Reinforcement + verifizierbarer „ich war wirklich um 6 Uhr wach"-Beweis |
| **Fanqie ToDo** (CN, Marktführer) | Pomodoro + **Xueba moshi** (App-Whitelist, nur 2 Exits/Monat) + **Yange moshi** (kein Pause/Exit) + virtuelle Lernräume | **Schwer-rückgängig-Commitment** — Studierende *wollen* eingesperrt sein; Abbruch-Grund loggen baut Selbstwahrnehmung |
| **Forest** | Baum pflanzen → stirbt bei App-Verlassen → Münzen, echte Aufforstung | **Loss Aversion** (sterbender Baum schmerzt mehr als verlorener Streak) + Multiplayer + Bedeutung |
| **Tide (Chaoxi)** (CN) | Szenen-Fokus: Pomodoro + Ambient-Sound + Schlaf/Meditation/Atmung (4-7-8) | **Self-Care-Positionierung** — adressiert Lern-*Angst*, nicht nur Prokrastination |
| **Momo beidanci** (CN, 300 Mio.+) | Personalisierte Ebbinghaus-SRS-Vokabeln | Selten: der Kern-Loop *ist* die evidenzbasierte Technik |

- **Study-With-Me / 공부 유튜브 (Body Doubling):** Creator streamt sich beim Lernen; Zuschauer lernen mit. **Body Doubling / Social Facilitation** — Co-Präsenz (auch per Video) hebt Fokus. **Grenzen:** Motivations-Video-Dopamin verblasst in ~24–48 Min (gute Session-*Starter*, keine *Sustainer*); *live* schlägt aufgezeichnet. → In-App-Co-Study-Räume/geteilte Timer; „Anwesenheits-Check" als Commitment; live Peer-Präsenz bevorzugen.
- **Daka / Check-in-Kultur (CN):** öffentliches tägliches Loggen für Streaks. **Cautionary:** WeChat *verbot* 2019 Cash-Refund-Check-in-Apps; die „Daka qun xianjing": Nutzer ersetzen *Ziel-Erreichen* durch *Check-in-Erledigen* → Performance-Theater. Auch: „21 Tage für eine Gewohnheit" ist Mythos (real Median ~66 Tage, Lally 2010). → Streaks/Check-ins sind *Engagement*-, keine *Lern*-Mechanik; an **Qualitäts-Signal** koppeln (wirklich 25 fokussierte Min / N Aufgaben), nicht an bloße Anwesenheit.

## B3. ⚠️ Grind-Kultur-Artefakte (NICHT evidenzbasiert — bewusst DAGEGEN designen)

| Artefakt | Warum schädlich | Design-Mandat |
|---|---|---|
| **4당5락** (KR) „4 h Schlaf = bestehen, 5 h = durchfallen" | Widerspricht der Neurowissenschaft direkt: Konsolidierung *braucht* Schlaf; Deprivation beeinträchtigt Hippocampus-Encoding, verursacht Microsleeps, hebt Cortisol. Persistiert via Survivorship-Bias + Confound (motivierte Lernende schlafen weniger *und* lernen mehr) | **Schlaf als erstklassiges, geschütztes Feature.** Nie das Reduzieren von Schlaf gamifizieren; Schlaf als *Multiplikator* aufs Lernen framen; warnen, wenn ein Plan 7–8 h beschneidet. Echter Differentiator gegen Grind-Apps |
| **엉덩이 힘** (KR) „Sitzfleisch" | 25 % der KR-Mittelschüler halten rohe Sitz-Ausdauer für effektivste Methode. Falsch: Metakognition (nicht Dauer) prädiziert Leistung; passive Sitz-Zeit bei Erschöpfung ist Stuhl-Zeit, kein Lernen | **„Gesamtstunden" NICHT als primäre Erfolgs-Metrik.** Stunden mit **Qualitäts-Metriken** paaren (Retrieval-Erfolg, nicht „Kapitel gelesen"). „Qualität über Quantität" explizit in der UX |
| **Hengshui Zhongxue** (CN) 15-h-Modell | Als 2024 die überregionale Elite-Rekrutierung verboten wurde, **brachen** Tsinghua/Peking-Zulassungen ein: 275 (2019) → 45 (2025) — Erfolg war **Selektion, keine Pädagogik**. Dokumentierte psychische Schäden | Test-Rhythmus + Bewegungspausen übernehmen; die Stunden + den Überwachungs-Druck verwerfen |
| **Tihai zhanshu** (CN) „Aufgaben-Meer" — *wenn undifferenziert* | Mechanismus legitim (Aufgaben = Retrieval, Automatisierung entlastet Arbeitsgedächtnis), aber undifferenziertes Volumen (500 Aufgaben, die man kann) ist keine Deliberate Practice und transferiert nicht | **Invertieren:** Mastery *pro Konzept* tracken, nur unter Schwellenwert üben; nach 3× richtig Item *zurückziehen* und Schwierigkeit eskalieren statt Bekanntes wiederholen |

---

# TEIL C — Focus-Design-Prinzipien → konkrete Features

> Roter Faden der glaubwürdigen Evidenz (Barkley): **Focus ist eine Störung der Selbst-Regulation *über Zeit*, nicht der Aufmerksamkeit per se.** Kern-Job der App: **Zeit externalisieren, Gedächtnis externalisieren, die nächste Entscheidung externalisieren** — ohne je Scham zu erzeugen.

> Evidenz-Legende: `[Stark]` peer-reviewed/Primär · `[Moderat]` klinischer Konsens/seriös sekundär · `[Schwach]` populär, richtungsweisend aber nicht als Fakt zitierbar. (3-Vote-adversarial verifiziert; zwei populäre Fakten widerlegt: „35 000 Entscheidungen/Tag" und die saubere Body-Doubling-Mechanismus-Story.)

| # | Prinzip | Evidenz | App-Feature(s) |
|---|---|---|---|
| 1 | **Zeitblindheit / Zeit externalisieren.** Focus erlebt Zeit als „jetzt vs. nicht-jetzt" | Barkley „temporal now" `[Stark]`; Focus-Kinder brauchten ~50 ms längere Intervalle zur Unterscheidung (Smith 2002) `[Stark]`. ⚠️ „unterschätzt Zeit um 30–40 %" = Blog, nicht zitieren | (a) **Analoger schrumpfender Keil**-Countdown pro Session (verschwindende Farbscheibe, nicht nur Ziffern) (b) **persistente „Restzeit"-Menübar/Ambient-Anzeige** |
| 2 | **Task-Initiation / Aktivierungsenergie.** Langweilig/unklar/fern-belohnt ist schwer zu *starten* | Dopamin-getriebenes Initiations-Defizit `[Moderat]`; Implementation Intentions `[Moderat]` | (a) **Auto-Chunking** in lächerlich kleine erste Schritte (b) **One-Tap „Jetzt starten"** → startet sofort konkrete erste Aktion + Timer |
| 3 | **Dringlichkeit/Deadlines** — Gehirn reagiert auf unmittelbare, nicht ferne Stakes | Dopamin unterwichtet ferne Belohnung `[Stark]` | (a) **Deadline-„in-die-Gegenwart-ziehen"-View** (Einheiten/Tage übrig) (b) manufakturierte Mikro-Deadlines pro Session |
| 4 | **Body Doubling / „Study with me".** Co-Präsenz hebt On-Task | VR-Studie 2025 (n=12, Focus): ~27–30 % schneller mit Body-Double `[Schwach, Preprint]`. ⚠️ Dopamin/PFC/Spiegelneuron-Mechanismus = Blog, **widerlegt** — Effekt beschreiben, nicht Mechanismus | (a) **Co-Working-Modus**: Ambient-Timer + optionale „3 lernen gerade"-Präsenz (b) virtueller Body-Double / Study-With-Me-Spur synchron zum Timer |
| 5 | **Dopamin-freundliches Feedback** — sofortige sichtbare Fortschritte | Sofort-Belohnung + Fortschritts-Sichtbarkeit `[Moderat]`; Gamification verblasst via Hedonic Adaptation | (a) **Sofort-Belohnungen** pro Chunk (b) tägliche/wöchentliche „done"-Balken; variable/Überraschungs-Belohnungen gegen Gewöhnung |
| 6 | **Streak/Gamification-*Risiken*** — punitive Mechanik schadet hier | Gamification→Angst peer-reviewed `[Moderat]`; Focus-Spezifik = Inferenz `[Schwach]`, aber sicherer Hedge | (a) **Vergebende Streaks**: Freezes/Grace-Days; Streak *biegt sich, bricht nie sichtbar* (b) kein Scham-UI: kein rotes „überfällig", kein Reset, keine öffentlichen Leaderboards by default |
| 7 | **Scham-freies, flexibles Rescheduling** — *das* Adhärenz-Make-or-Break | Scham→Vermeidungs-Kaskade `[Moderat]`; Focus-Planer reschedulen „vor der Scham-Spirale" `[Moderat]` | (a) **Automatic Forgiveness**: Tasks „scheitern" nie — ein verpasster Block fließt lautlos in künftige freie Zeit (b) **„Woche neu planen" One-Tap**, neutral geframt („hier dein aktualisierter Plan"), nicht als Schuld-Abarbeiten |
| 8 | **Hyperfokus & Übergänge** — Unterbrechung mitten im Hyperfokus dysreguliert; Einzel-Alarm scheitert | Gestaffelte Warnungen schlagen einen Alarm `[Moderat]` | (a) **Laddered Transition-Warnungen** (10/5/2 Min), eskalierend (b) **Hyperfokus-Guard**: Überlauf erkennen, „15 Min verlängern oder abschließen?" statt hartem Schnitt; Übergangs-Ritual |
| 9 | **Tageszeit-Energie** — Focus neigt zu **Abend-Chronotyp**; früher Zwang kämpft gegen Biologie | **Abend-Chronotyp-Prädominanz = der einzige sauber gestützte zirkadiane Befund** (Systematik, 62 Studien) `[Stark]`. ⚠️ spezifische %-Zahlen cherry-picked, weglassen | (a) **Energie-Profil**: Nutzer markiert (oder App *lernt*) Peak-Fenster; Scheduler legt anspruchsvolles Lernen ins Hoch-Fenster (b) **keine erzwungenen frühen Slots** |
| 10 | **Executive-Function-/Entscheidungs-Last reduzieren** | Höhere neuronale Kosten/Entscheidung `[Moderat]`; Hicks Law. ⚠️ „35 000 Entscheidungen/Tag" = **widerlegt**, nicht nutzen | (a) **„Was kommt als Nächstes?"-Single-Task-Screen**: App zeigt genau *eine* Sache (b) minimale, default-reiche UI, ≤3 Optionen pro Entscheidungspunkt |
| 11 | **Schätzprobleme („Zeit-Agnosie")** | Zeit-Schätz-Defizite real, aufgaben-abhängig `[Moderat/Stark]` | (a) **echte vs. geschätzte Dauer lernen** und künftige Schätzungen auto-korrigieren („du sagtest 30, dauert bei dir ~50") (b) gelernte Dauern in den Scheduler einspeisen |

**Design-Nordstern:** Die App soll den Plan **entscheiden und neu-entscheiden**, Zeit **physisch zeigen**, **sofort belohnen** und **automatisch vergeben** — und damit die vier Dinge minimieren, die Focus teuer macht: Starten, Zeit verfolgen, Erinnern, Entscheiden.

---

# TEIL D — Konkurrenz & Marktlücke

> **Headline:** Kein einziges ausgeliefertes Produkt macht alles. Der Markt zerfällt in fünf Silos, die je 1–2 der nötigen Fähigkeiten besitzen und die anderen strukturell vermissen.

Die fünf Säulen: **(1) busy-aware Auto-Scheduling · (2) evidenzbasierte Spaced Repetition · (3) scham-freies adaptives Rescheduling · (4) Lern-Metriken die echten Pace lernen · (5) macOS-first + lokal/privat.**

| Produkt | Kategorie | Apple-Cal 2-Wege | Auto-sched busy-aware | Pace-Learn | SRS | Focus/Student | macOS nativ | Preis/Jahr |
|---|---|---|---|---|---|---|---|---|
| **Motion** | KI-Scheduler | nur Events | ✅ autonom | reaktiv | ❌ | Focus-vermarktet | ✅ | $29/mo |
| **Reclaim.ai** | KI-Scheduler | ❌ | ✅ autonom | reaktiv | ❌ | informell | ❌ web | gratis/$8 |
| **Sunsama** | KI-Scheduler | ✅ | ✅ (nur heute) | manuell | ❌ | ✅ explizit | ✅ | $20/mo |
| **Sorted³** | Apple-Scheduler | ✅ iCloud | ✅ Auto-Schedule | ❌ | ❌ | informell | ✅ | $15–25 einmalig |
| **Structured** | Apple-Scheduler | ✅ inbound | ✅ Replan | nur Replan | ❌ | ✅ Top-Pick | ✅ | $20/$65 |
| **Shovel** | Studenten-Planer | ❌ (nur LMS) | ❌ (Machbarkeit) | teils manuell | ❌ | implizit | ✅ Apple Silicon | $35 |
| **Tiimo** | Focus-Planer | nur inbound | ❌ | nur Roadmap | ❌ | ✅ built-for | ❌ | $42–55 |
| **Amazing Marvin** | Focus-Task-Mgr | ✅ 2-Wege (best) | ❌ (manuell) | ✅ Kapazitäts-Ø | ❌ | ✅ +50 % Student | ✅ | $96 |
| **Routinery** | Focus-Routinen | ❌ | ❌ | ❌ | ❌ | ✅ scham-frei | ✅ M1 | $27–40 |
| **Anki** | Spaced Repetition | ❌ | ❌ | ✅ Recall-Pace | ✅ FSRS/SM-2 | Student | ✅ (lokal) | gratis/$25 iOS |
| **SpaceRep** ⭐ | SRS+Kalender | ❌ (nur Google) | ✅ für Reviews | ? | ✅ Black-Box | ❌ | ❌ web | $7–17/mo |
| **Doable** ⭐ | Focus-Scheduler | ✅ iCloud 2-Wege | ✅ energie-aware | KI-basiert | ❌ | ✅ AuDHD-built | ✅ (+Watch/Vision) | gratis/$60 |
| **Morgen** ⭐ | Unified-Planer | ✅ iCloud | KI-Vorschlag (Freigabe) | ❌ | ❌ | informell | ✅ | $180 |

**Die weiße Stelle (= dieses Produkt):** Eine **macOS-native, offline/lokal-first** App, die (a) den Kalender **zwei-Wege** liest und belegte Blöcke als belegt behandelt, (b) **fächer-/aufgaben-/deadline-/schwierigkeits-/seitenzahl-gewichtete** Lern-Sessions in freie Slots **auto-platziert**, (c) eine **FSRS**-Retrieval-Engine für Review-Arbeit hat, (d) echte Fokuszeit & Erledigung misst, um den **realen Durchsatz pro Fach** zu lernen und neu zu schätzen, (e) **scham-frei** neu plant, wenn der Kalender sich verschiebt oder der Nutzer zurückfällt.

**Wer am nächsten dran ist & was fehlt:**
- **Doable** — am nächsten gesamt (Focus, Apple-nativ inkl. Mac, 2-Wege, energie-aware Auto-Schedule). **Fehlt:** SRS, Fach-/Seitenzahl-/Schwierigkeits-Modell, Lern-Pace-Metriken.
- **Motion** — am nächsten bei autonomem busy-aware Rescheduling. **Fehlt:** SRS, echtes Pace-Learning, Lern-Modell, lokal/privat, scham-freier Ton (über-packt still).
- **Shovel** — am nächsten bei Studenten-Workload mit Seiten/Lesezeit + Machbarkeits-„Cushion". **Fehlt:** Auto-Placement, Kalender-Sync, SRS, ML-Pace, Focus.
- **Sorted³/Structured** — am nächsten bei Apple-nativem busy-aware Auto-Scheduling mit Focus-freundlicher Zeit-Visualisierung. **Fehlt:** SRS, Fach-/Pace-Modell.
- **SpaceRep** — einziges das SRS + konflikt-bewussten Kalender fusioniert. **Fehlt:** Apple/macOS-lokal, transparenter Algorithmus, Focus, Pace-Metriken.
- **Amazing Marvin** — einziges mit echtem Pace-Learning + Apple-2-Wege + Focus-Tiefe. **Fehlt:** Auto-Placement, SRS.
- **Anki** — einzige lokale/private, evidenzbasierte, pace-adaptive Engine. **Fehlt:** Kalender, Planer, Busy-Awareness (sein lokales API **AnkiConnect** auf `:8765` ist der natürliche Integrationspunkt, um so einen Planer zu *füttern*).

**Strategische Notizen:** Apple-natives Auto-Scheduling ist der verteidigbarste Beachhead (Sorted³/Structured/Doable beweisen Nachfrage, lassen SRS+Pace weg); **FSRS ist Open-Source/einbettbar**; Ankis Daten via AnkiConnect erreichbar; der emotionale Differentiator (**scham-frei**, Routinery/Inflow-Stil) ist von jedem kalender-nativen Scheduler unterversorgt — sie defaulten alle zu angst-induzierendem Über-Packen.

---

# TEIL E — macOS-Technik-Fundament

## E1. Apple EventKit (die Kalender-Engine)
- **Zugriffsmodell änderte sich materiell in macOS 14 / iOS 17** — drei Stufen statt einem `requestAccess`:

| Stufe | Info.plist-Key | API |
|---|---|---|
| Write-only (neu) | `NSCalendarsWriteOnlyAccessUsageDescription` | `requestWriteOnlyAccessToEvents()` |
| **Full Access** | `NSCalendarsFullAccessUsageDescription` | `requestFullAccessToEvents()` |
| Reminders (full) | `NSRemindersFullAccessUsageDescription` | `requestFullAccessToReminders()` |

> ⚠️ **Write-only kann Events anlegen, aber *keine* existierenden lesen** — auch nicht selbst erstellte — und keine Kalender listen. Ein Planer, der busy/free erkennt und reschedult, **braucht Full Access.**

- **Events/Kalender lesen:** `predicateForEvents(withStart:end:calendars:)` → `events(matching:)` (oder `enumerateEvents` für große Ranges).
- **Busy vs. Free:** EventKit hat **keine** dedizierte Free/Busy-API. `event.availability` (`.busy/.free/.tentative/.unavailable/.notSupported`) inspizieren, dann Lücken zwischen Busy-Blöcken berechnen → genau der Scheduler-Input.
- **CRUD:** `EKEvent` setzen → `save(event, span:.thisEvent, commit:true)`; `EKSpan.futureEvents` für ganze Serien.
- **Externe Änderungen beobachten (Engine für Auto-Reschedule):**
  ```swift
  NotificationCenter.default.publisher(for: .EKEventStoreChanged)
      .sink { _ in self.reloadAndResolve() }   // Notification hat KEIN Payload → voll refetchen
  ```
  Feuert bei *jeder* Kalender-DB-Änderung (Nutzer, Sync, andere Apps) und sagt **nichts** darüber, *was* sich änderte → refetch + Scheduler neu laufen lassen.
- **Reminders (EKReminder):** parallele API — gut als Task-Backlog/Capture-Inbox.
- ⚠️ **SwiftUI-Gotcha:** `EKEvent`/`EKReminder` sind nicht Observable und triggern **keine** View-Updates → in eigenen `@Observable`-State spiegeln, bei `.EKEventStoreChanged` refreshen.

## E2. Interop & Alternativen
**EventKit fördert bereits *jeden* vom Nutzer in Apple Calendar hinzugefügten Account zutage — iCloud, Google, Exchange, CalDAV — über *eine* API.** Für eine macOS-first App muss man Google/CalDAV meist **nicht** selbst integrieren.

| Option | Pro | Contra | Wann |
|---|---|---|---|
| **EventKit** | nativ; eine API für alle Provider des Nutzers; kein OAuth/Sync selbst | grobe Change-Notification (nur refetch); kein Webhook; nativ-only | macOS/iOS App, die existierende Kalender liest (**empfohlen**) |
| Google Calendar API | Echtzeit-`events.watch` Push; sauberer `syncToken` | Google-only; OAuth; Rate-Limits | Cross-Platform/Web, Google-first |
| CalDAV | offener Standard, multi-Provider | verbose XML; kein nativer Push (poll) | Multi-Provider-Server-Sync |
| ICS (.ics) | universell, trivialer Import/Export | statische Datei, **kein** Sync-Protokoll | einmaliger Import/Export & Teilen |

## E3. Auto-Scheduling-/Re-Scheduling-Algorithmus
**Framing: Constraint-Satisfaction, gelöst mit einer greedy, deadline-bewussten Interval-Packing-Heuristik** (schnell, erklärbar, gut genug; volle CSP/ILP-Solver sind Overkill für interaktive Nutzung).

**Pipeline:** 1) Free-Slots aus EventKit busy/free sammeln → 2) Slots nach **Energie-Fenstern** gewichten (anspruchsvolle Tasks → Peak) → 3) Tasks nach Dringlichkeit = f(Deadline-Nähe, Priorität) ranken (Earliest-Deadline-First + P1–P4-Tiers) → 4) Sessions in Slots packen unter: Deadlines, Session-Länge (Min/Max-Chunk), **Spacing/Spaced-Repetition** (ein Fach nicht crammen, Reviews über Tage spreizen), max. Tages-Lernlast, Puffer zwischen Blöcken → 5) **inkrementell neu lösen** bei jedem `.EKEventStoreChanged` oder verpasster Session: fixe/committete Anker behalten, nur bewegliche Zukunfts-Sessions neu fließen. *Das ist die technische Engine für „Automatic Forgiveness".*

**Industrie-Framing:** **Reclaim** nutzt **P1–P4** und reschedult niedrig-priorisierte Items „zum nächstbesten Slot in nahezu Echtzeit (Sekunden)"; Multi-Stunden-Tasks auto-splitten über Sessions. **Motion** brandet seinen Scheduler „Happiness Algorithm" (Constraint-Satisfaction ist die *Reviewer*-Beschreibung, nicht Motions eigener Term).

## E4. Lokaler Speicher & Privacy
Kalender-Cache + Lern-Metriken (Dauern, Erledigungen, Energie-Profil) **on-device** halten.

| Layer | Urteil |
|---|---|
| **SwiftData** | Swift-nativ `@Model`, am wenigsten Boilerplate, SwiftUI-freundlich. **Braucht macOS 14/iOS 17.** Caveats: keine Batch-Ops, limitierte Predicates vor 17.4, iOS-18-Concurrency (`@ModelActor`) |
| Core Data | reif, volle Predicates/Batch, teilt SQLite-Store mit SwiftData; verbose |
| GRDB/SQLite.swift | am schnellsten, volles SQL, eigene Migrations/Sync; manuell |

**Empfehlung:** **SwiftData** für App-Modelle + **direktes Lesen von EventKit** als Kalender-Wahrheit (EventKit = Source of Truth, nur cachen was nötig). Alle Analytik bleibt lokal → stärkste Privacy-Story, kein Server.

## E5. Stack-Empfehlung — SwiftUI + EventKit vs. Electron
**Empfehlung: natives SwiftUI + EventKit für einen macOS-first Focus-Planer.** Entscheidende Gründe:
- **Electron kann EventKit physisch nicht aufrufen** — nativ-only Apple-Framework, keine JS-Bindings. Electron bräuchte einen nativen Helper/N-API-Addon oder XPC-Bridge, oder fällt auf Google-Calendar-API / CalDAV/ICS zurück — und verliert den größten Vorteil (eine API über alle existierenden Kalender). **Harter Blocker, kein Trade-off.**
- **Ressourcen-Profil** für eine Always-on-Fokus/Timer-App: nativ ≈ 3–20 MB RAM / ~0,3 s Start vs. Electron ~150–500 MB / mehrere Sekunden.
- Nativ liefert erstklassige **Menübar-/Ambient-Timer**, Notifications, laddered Alarme sauber.
- **Trade-off:** Electron/Web nur, wenn Windows+Linux *harte* Anforderung *und* kein Swift-Skill — dann die Kalender-Integrations-Steuer akzeptieren. Cross-Platform-Alternative mit Swift-Erhalt: **Tauri + Swift-Sidecar** (Rust/Web-Frontend, nativer Swift-Prozess für EventKit).

---

# Drei Caveats, die ins Spec mitwandern
1. Der meiste Focus-*Design*-Rat ist klinischer Konsens, **nicht** RCT-Grade — mit Mechanismus (Barkley) und den wenigen starken Befunden (50-ms-Studie, Abend-Chronotyp) führen; spezifische Prozente skeptisch behandeln.
2. **Full** EventKit-Access ist Pflicht (Write-only kann busy/free nicht lesen).
3. Natives SwiftUI+EventKit ist der klare Stack — Electrons EventKit-Unfähigkeit ist ein **architektonischer Blocker**, keine Präferenz.

---

# QUELLEN (Auswahl, nach Thema)

**Lernwissenschaft / Meta-Analysen:** Dunlosky et al. 2013 (PSPI) · Donoghue & Hattie 2021 (Front. Educ.) · Roediger & Karpicke 2006 (Psych. Sci.) · Cepeda et al. 2006 (Psych. Bull.) / 2008–09 · Firth/Rivers/Boyle 2021 · Taylor & Rohrer 2010 · Mayer Multimedia · Bjork & Bjork 2011 · Kornell & Bjork 2008 · Zimmerman 2000 · Li et al. 2018 (PMC6305361) · Avhustiuk 2018 · Serra & Shanks 2023 · Sweller/Cowan CLT.
**Pomodoro/Schlaf/Bewegung:** Pomodoro-vs-Flowtime RCT 2025 (PMC12292963) · BMC Pomodoro Review 2025 · Neubauer & Freudenthaler 1995 · DeskTime-Blog (52/17, kein Research) · Paller/Creery/Schechtman 2020 · Stickgold & Walker 2007 · Holz 2012 · Erickson 2011 (PNAS) · Hötting 2016 · Bönstrup 2019 + *PNAS*-Rebuttal 2025.
**Algorithmen:** SM-2 (super-memory.com/english/ol/sm2.htm) · FSRS-Repo & Wiki (github.com/open-spaced-repetition) · srs-benchmark · Anki 23.10-Changelog · Leitner (Wikipedia).
**Neueste:** Kestin et al. 2025 (Sci. Rep., AI-Tutoring) · RAG-Tutoring 2025 · AI-Over-Reliance 2024/25.
**Korea:** 오답노트 (gguge/namu) · 백지복습 (edubong, PCOM-Dissertation) · 회독 (namu) · 수능 만점자 (segye) · SKY (yoons) · 자기주도학습 · 메타인지 · 열품타 (namu, csw.live) · 타임스프레드 (Play) · 스터디플래너 (Edrawsoft) · 인강 배속 (KISTI) · Study-With-Me (ajunews) · **4당5락** (SBS) · **엉덩이 힘** (eduinnews).
**China:** Gaokao (Acquire/Harvard GSE) · **Hengshui Zhongxue** (Chinosity/Wikipedia/RealTimeMandarin „in decline") · Cuotiben (PMC9203230, Annual Reviews) · Ebbinghaus/Momo (Woshipm, App Store) · Tihai zhanshu (Tandfonline, Shuangjian Sage) · Siwei daotu (PMC10369705) · Fanqie ToDo/Forest/Tide (Woshipm/sspai) · **Daka** (Woshipm, Banyuetan, PKU).
**Focus/Technik:** Barkley (russellbarkley.org; PubMed 9276836) · Smith 2002 (PubMed 12030598) · Evening-Chronotyp (Springer 10.1007/s12402-016-0214-5) · „35 000 Entscheidungen" widerlegt (didtheresearch) · Body-Doubling (arXiv 2509.12153, MedicalNewsToday) · EventKit TN3153/TN3152, `.EKEventStoreChanged`, WWDC23-10052 · Reclaim P1–P4 · Motion-Review (Unite.AI) · SwiftData-Caveats (fatbobman) · Native-vs-Electron (OpenMark) · eventkit-node (Electron-Bridge-Notwendigkeit).

> Vollständige URL-Liste in den vier Roh-Recherche-Berichten (Session-Transkript). Bei Bedarf liefere ich die granularen Links pro Behauptung nach.
