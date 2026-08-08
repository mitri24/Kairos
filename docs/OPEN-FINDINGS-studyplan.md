# Offene Funde — Lernplan-Feature (Lernziel → Themen & Ablauf)

Stand: 2026-08-03

Quelle: adversariale Prüfung mit 40 Agenten (4 Prüf-Linsen, jeder Fund einzeln
gegengeprüft). 36 Funde, 29 bestätigt, 7 widerlegt.

**15 davon sind behoben** (Blocker + Korrektheit, mit Regressionstests in
`tests/outlineHardening.test.js` und `tests/studyplan.api.test.js`).
Die folgenden **14** sind bewusst offen geblieben.

---

## [MINOR] SSRF: baseUrl wird nicht validiert, und der Server gibt 200 Zeichen der Fremdantwort an den Client zurück

- **Ort:** `server/ai.js:48`
- **Linse:** security
- **Ablauf:** PUT /api/ai/config mit {"provider":"openai","baseUrl":"http://169.254.169.254/latest/meta-data"} — saveConfig übernimmt jeden String ungeprüft (kein Schema-/Host-Check). Danach POST /api/plan/topics: callModel (ai.js:292) macht fetch(`${baseUrl}/chat/completions`), ohne Key sogar ohne Auth-Header. Antwortet der interne Dienst mit != 2xx, baut fetchJson `detail = json?.error?.message || json?.error || text.slice(0, 200)` (ai.js:235) und wirft httpErr(502, `KI-Anbieter meldet Fehler: ${detail}`) — der Text landet 1:1 im Client-Toast bzw. in proposal.aiError (routes.js:522). Damit kann jedes angemeldete Konto interne Adressen (Cloud-Metadaten, 127.0.0.1:*, Admin-Ports im Docker-Netz aus docs/DEPLOY.md) anpingen und die ersten 200 Byte auslesen. Zur ausdrücklichen Frage "verlässt der API-Key jemals den Server?": zum Browser nein (getConfigView liefert nur hasKey, ai.js:36) — aber der entschlüsselte Key geht als Authorization bzw. x-api-key an genau den Host, den dieses ungeprüfte Feld benennt (ai.js:291/304).
- **Vorschlag:** baseUrl in saveConfig validieren: `new URL()` parsen, nur http/https zulassen, Hostnamen auflösen und private/loopback/link-local-Bereiche (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7) ablehnen — mit expliziter Ausnahme für den Ollama-Default 127.0.0.1:11434. Zusätzlich in fetchJson den Fremdtext nur loggen und dem Client eine generische 502-Meldung samt Statuscode zurückgeben.

## [MINOR] Kein Größenlimit auf der Modellantwort; maxTokens wird für Ollama gar nicht gesetzt

- **Ort:** `server/ai.js:231`
- **Linse:** security
- **Ablauf:** fetchJson liest die Antwort mit `await res.text()` ohne jedes Byte-Limit. Gleichzeitig ignoriert der Ollama-Zweig (ai.js:282-284) den maxTokens-Parameter komplett — es wird kein options.num_predict mitgeschickt, MAX_REPLY_TOKENS/PLAN_REPLY_TOKENS sind für genau den Anbieter tot, den die UI empfiehlt ("Ollama ist kostenlos & lokal", ai.js:264). Ein Endpunkt, der nicht aufhört zu schreiben — ein durchdrehendes lokales Modell, ein kompromittierter OpenRouter-Proxy oder ein selbst gesetzter baseUrl (siehe SSRF-Fund) — kann bis zum Timeout von 120 s (ai.js:23) Gigabytes liefern, die der Server vollständig in einen String puffert: OOM des Prozesses, alle Mandanten weg. Nachgelagert greift auch die Mengenbegrenzung in validateProposal nur halb: MAX_PLAN_TOPICS=25 deckelt die AUSGABE (ai.js:374), die Schleife über rawTopics (ai.js:360) läuft aber über jedes Element — {"topics":[{},{},…10 Mio.]} enthält lauter Einträge ohne text, die per continue übersprungen werden, sodass das break nie erreicht wird und alle 10 Mio. Einträge samt str()/replace abgearbeitet werden.
- **Vorschlag:** Antwort gestückelt lesen und bei Überschreitung (z. B. 1 MB) abbrechen statt res.text(); im Ollama-Zweig `options: { num_predict: maxTokens }` mitsenden; in validateProposal vor der Schleife `Array.isArray(parsed?.topics) ? parsed.topics.slice(0, MAX_PLAN_TOPICS * 4) : []` verwenden, damit die Iterationszahl unabhängig von der Antwortgröße gedeckelt ist.

## [MINOR] Datenschutz-Hinweis und tatsächlicher useAi-Wert können auseinanderlaufen

- **Ort:** `web/js/studyplan.js:299`
- **Linse:** security
- **Ablauf:** open() rendert sofort und lädt api.ai.getConfig() erst danach nach (Z. 128-131). Solange aiCfg === null ist, zeigt renderInput über aiReady = !!aiCfg?.ready (Z. 143-146) den Text "Keine KI eingerichtet — Kairos liest die Struktur deines eingefügten Textes" — die Zusage, dass nichts das Haus verlässt. Klickt die Person in diesem Fenster auf "Themen vorschlagen" (langsame Verbindung, kalter Server), sendet build() `useAi: aiCfg ? !!aiCfg.ready : true`, also true. Ist im Profil ein Anbieter samt aiEnabled hinterlegt, ruft der Server ai.planTopics auf und schickt Lernziel plus das komplette eingefügte Material (bis 12 000 Zeichen) an OpenAI/Anthropic — genau das, was das angezeigte Label gerade ausgeschlossen hat. Zusatzproblem im selben Block: der .catch()-Zweig setzt aiCfg = { ready: false } ohne Re-Render und ohne Retry-Möglichkeit (der Guard `if (!aiCfg)` verhindert einen zweiten Versuch), sodass ein einmaliger Netzfehler die KI-Planung für die ganze Seitensitzung stumm abschaltet.
- **Vorschlag:** Label und Flag aus derselben Quelle ableiten und den dritten Zustand abbilden: solange aiCfg === null weder "KI an" noch "KI aus" behaupten, sondern den Build-Button deaktiviert lassen (bzw. `useAi: !!aiCfg?.ready` senden, also im Zweifel nicht senden). Im catch aiCfg auf null belassen und beim nächsten open() erneut laden.

## [MINOR] Unicode-Aufzählungszeichen außerhalb der Zeichenklasse: Themen verschwinden oder behalten das Bullet im Namen

- **Ort:** `shared/outline.js:30`
- **Linse:** correctness
- **Ablauf:** Die Klasse `[-*•·–]` kennt weder Geviertstrich `—` noch `+`, `▪`, `‣`, `◦`, `▸`. Zwei gemessene Ausfälle: (1) Gemischte Liste "▪ Automaten / ‣ Grammatiken / ◦ Turing / – Reduktion / • Komplexitaet" → structure="bullet" mit n=2 (nur "Reduktion", "Komplexitaet"); die drei anderen Zeilen landen in keinem Topf und sind weg. (2) Durchgängige Liste "— Endliche Automaten / — Kontextfreie Sprachen / — Turingmaschinen" → structure="lines", und weil cleanTitle nur am Zeilenende trimmt, heißen die Themen anschließend "— Endliche Automaten" usw.; genau dieser Text landet bei createTasks auch als Aufgabentext in der DB (routes.js:551/557). Dasselbe für "+ …"-Listen aus Markdown.
- **Vorschlag:** Zeichenklasse erweitern (`[-+*•·‣▪▫◦▸‧–—]`) und in cleanTitle zusätzlich einen führenden Bullet-/Strich-Präfix entfernen, damit auch der lines-Fallback saubere Titel liefert.

## [MINOR] Ab dem 41. Thema wird stillschweigend abgeschnitten

- **Ort:** `shared/outline.js:116`
- **Linse:** correctness
- **Ablauf:** MAX_TOPICS = 40 bricht die Schleife ab, ohne dass irgendetwas im Rückgabewert vermerkt wird. Gemessen mit einem Inhaltsverzeichnis aus 55 nummerierten Kapiteln: topics.length = 40, letztes Thema "Kapitelthema 40", Kapitel 41-55 fehlen. Die Oberfläche meldet dazu "40 Themen gefunden" (studyplan.js:216) — die Person hat keinen Anhaltspunkt, dass ihr Material nicht vollständig gelesen wurde, und merkt es erst, wenn beim Lernen ein Drittel des Stoffs fehlt.
- **Vorschlag:** Im Rückgabewert ein `truncated`-Flag (bzw. `totalFound`) mitgeben und in der Kopfzeile des Vorschlags ausweisen, z. B. "40 von 55 Themen — der Rest passt nicht in einen Plan".


## [MINOR] Hinweis verspricht KI-Nutzung, obwohl die KI-Einwilligung im Profil aus ist

- **Ort:** `web/js/studyplan.js:143`
- **Linse:** correctness
- **Ablauf:** `aiCfg.ready` kommt aus ai.getConfigView() und prüft NUR Provider/Key (server/ai.js:37) — die Einwilligung `profile.aiEnabled` geht dort nicht ein; aibot.js:109 prüft beides, studyplan.js nicht. Situation: Provider eingerichtet, KI-Schalter im Profil aber aus. Schritt 1 zeigt dann "Nutzt deine KI (gpt-4o-mini). Dein Text wird dorthin gesendet." — eine Zusage über den Verbleib des Textes, die nicht zutrifft. Beim Klick schickt build() `useAi:true` (Zeile 299); der Server wirft 403 "KI ist ausgeschaltet …" (server/ai.js:255). Ohne eingefügten Text wird der Fehler durchgereicht (routes.js:520) und die Person bleibt mit einem Fehler-Toast in Schritt 1 stehen, obwohl der deterministische Weg verfügbar wäre.
- **Vorschlag:** getConfigView um `aiEnabled` erweitern (oder in studyplan.js zusätzlich `store.state.profile?.aiEnabled` prüfen) und `ready` erst dann als wahr behandeln, wenn Einwilligung UND Anbieter vorliegen — dann stimmt der Hinweis und useAi wird gar nicht erst gesetzt.

## [MINOR] studyplan.js/studyplan.css fehlen in der App-Shell des Service Workers

- **Ort:** `web/sw.js:12`
- **Linse:** correctness
- **Ablauf:** APP_SHELL listet jedes andere View-Modul auf, aber weder "/js/studyplan.js" noch "/css/studyplan.css"; VERSION steht weiterhin auf "v11". Solange VERSION unverändert bleibt, heilt das networkFirst-Runtime-Caching (sw.js:169) den Fehler beim ersten Online-Aufruf. Beim nächsten VERSION-Bump löscht activate (sw.js:121) den alten Cache und install legt nur APP_SHELL neu an: wer die App danach zuerst OFFLINE öffnet, bekommt für /js/studyplan.js eine 503-Antwort — und weil main.js:32 das Modul statisch importiert, scheitert der gesamte Modulgraph, die PWA startet gar nicht mehr (nicht nur der Lernplan).
- **Vorschlag:** Beide Pfade in APP_SHELL aufnehmen und VERSION mit dem Feature hochzählen.

## [MINOR] UI verspricht KI-Versand, obwohl die Einwilligung aus ist (Hinweis ignoriert profile.aiEnabled)

- **Ort:** `web/js/studyplan.js:142 (+ server/ai.js:37)`
- **Linse:** honesty
- **Ablauf:** Nutzerin hat im Profil einen Anbieter samt Key eingerichtet, den KI-Schalter aber ausgeschaltet (web/js/profile.js:45 setzt aiEnabled=false; DB-Default ist ohnehin 0, server/schema.sql:156). getConfigView() berechnet `ready` NUR aus Provider/Key und fragt die Einwilligung nicht ab (server/ai.js:37). studyplan.js:142 macht daraus `aiReady=true` und zeigt vor dem Absenden: „Nutzt deine KI (claude-opus-5). Dein Text wird dorthin gesendet." (studyplan.js:35/175). Tatsächlich sendet der Server nichts: requireProvider() wirft 403 „KI ist ausgeschaltet" (server/ai.js:255). Die Oberfläche behauptet also einen Datenabfluss, den es nicht gibt — und im Umkehrschluss traut die Person dem Schalter nicht mehr. web/js/aibot.js:109/156 macht es richtig (`!store.state.profile?.aiEnabled || !config …`), studyplan.js ist die einzige Stelle ohne Einwilligungsprüfung.
- **Vorschlag:** Entweder in server/ai.js:37 `ready` um `&& !!repo.getProfile()?.aiEnabled` ergänzen (aibot.js verundet ohnehin, bleibt also korrekt), oder in studyplan.js:142 wie aibot.js: `const aiReady = !!aiCfg?.ready && !!store.state.profile?.aiEnabled;`. Dann stimmen Hinweis und `useAi` (studyplan.js:299) mit dem überein, was der Server tut.

## [MINOR] Themenliste wird still bei 40 gedeckelt und die gekappte Zahl als Fund gemeldet

- **Ort:** `shared/outline.js:116 (+ :12, web/js/studyplan.js:54)`
- **Linse:** honesty
- **Ablauf:** `if (topics.length >= MAX_TOPICS) break;` bricht nach 40 Themen ab, ohne das irgendwo zu vermerken (kein `truncated`-Flag im Rückgabewert, outline.js:119). Ablauf: Person fügt ein Modulhandbuch mit 58 „## "-Überschriften ein, keine KI konfiguriert → Server liefert 40 Themen (routes.js:525), die UI titelt „40 Themen gefunden" (studyplan.js:54/216) und der Kicker sagt „aus den Überschriften deines Textes". Nach „40 Themen übernehmen" fehlen 18 Kapitel im Prüfungsplan — die Person hält den Import für vollständig, weil nirgends steht, dass abgeschnitten wurde. Dasselbe im KI-Pfad bei server/ai.js:374 (`MAX_PLAN_TOPICS = 25`): dort wird zusätzlich die vom Modell stammende `summary` als Überschrift angezeigt (studyplan.js:216), die sich noch auf die ungekürzte Liste bezieht.
- **Vorschlag:** `extractOutline`/`validateProposal` sollen melden, dass gedeckelt wurde (z. B. `{ topics, structure, truncated: 58 }`), und die UI muss es benennen („40 von 58 erkannten Abschnitten — Rest gekürzt"). Solange das fehlt, wird die Abwesenheit der übrigen Themen als Ergebnis verkauft.

## [MINOR] Eingefügtes Material wird für die KI still bei 12 000 Zeichen abgeschnitten

- **Ort:** `server/ai.js:401 (+ :333, web/js/studyplan.js:156)`
- **Linse:** honesty
- **Ablauf:** Das Textfeld erlaubt 20 000 Zeichen (`maxlength="20000"`, studyplan.js:156) und die Quell-Notiz speichert bis 20 000 (routes.js:588), aber `str(material).trim().slice(0, MAX_MATERIAL_CHARS)` schickt nur die ersten 12 000 ans Modell. Ablauf: 18 000 Zeichen Syllabus einfügen → das letzte Drittel (Kapitel 9-14) erreicht das Modell nie → der Vorschlag deckt sie nicht ab, ist aber mit „von deiner KI (…)" (studyplan.js:40/188) als vollständige Zerlegung des eingefügten Textes ausgewiesen. Nichts in der Antwort sagt, dass gekürzt wurde.
- **Vorschlag:** Entweder das Textfeld auf MAX_MATERIAL_CHARS begrenzen, oder die Kürzung im Antwortobjekt melden und im Vorschlagskopf anzeigen („nur die ersten 12 000 Zeichen wurden ausgewertet").

## [MINOR] Quellenangabe „aus den Zeilen deines Textes", obwohl kein Text vorlag

- **Ort:** `web/js/studyplan.js:189`
- **Linse:** honesty
- **Ablauf:** `t.fromOutline[proposal.structure] || t.fromOutline.lines` fällt bei `structure === null` auf „aus den Zeilen deines Textes" zurück. Ablauf: keine KI eingerichtet, Person tippt nur ein Ziel („Theoretische Informatik lernen") und fügt nichts ein — build() lässt das durch (studyplan.js:288), der Server liefert `outlineProposal("")` → `{topics:[], structure:null}` (routes.js:525). Der Vorschlagskopf lautet dann „Vorschlag · aus den Zeilen deines Textes" über „Nichts gefunden". Es wird eine Quelle benannt, die es nie gab.
- **Vorschlag:** Bei `structure === null` keinen Quellen-Zusatz rendern (Kicker nur „Vorschlag") und im leeren Fall den Grund nennen („kein Text eingefügt").

## [MINOR] Ohne „Auch Aufgaben anlegen" verfallen Dauer, Schwierigkeit und Abhängigkeiten des Vorschlags kommentarlos

- **Ort:** `server/routes.js:554 (+ :568, web/js/studyplan.js:219-222)`
- **Linse:** honesty
- **Ablauf:** Ist die Checkbox aus, springt die Schleife nach `createTopic` weiter (`if (!createTasks) { taskIds.push(null); continue; }`) und der Abhängigkeits-Block läuft gar nicht erst. Die Vorschlagsliste zeigt trotzdem weiterhin bearbeitbare Minuten-Felder, Schwierigkeits-Auswahl und „braucht zuerst #2" (studyplan.js:202-210), die in diesem Modus wirkungslos sind. Ablauf: Person passt 12 Dauern und 3 Abhängigkeiten an, nimmt den Haken raus, übernimmt — Toast meldet „12 Themen", die gesamte Feinarbeit ist weg, ohne dass es irgendwo stand.
- **Vorschlag:** Bei ausgeschalteter Checkbox die Spalten Dauer/Schwierigkeit/Abhängigkeit in den Zeilen ausgrauen oder ausblenden (Re-Render beim Umschalten) — dann sagt die Oberfläche vorher, was übrig bleibt.

## [MINOR] „Right now“-Held führt in blockierte Aufgaben, ohne die offene Vorbedingung zu nennen

- **Ort:** `web/js/tasks.js:179`
- **Linse:** integration
- **Ablauf:** Nach „Zeiten finden“ liegen (gemessen) Thema 1@08:00, Thema 2@09:10, Thema 3@10:20 mit der Kette 1←2←3. Um 10:30 greift pickNow-Zweig 2 (web/js/tasks.js:179-185): er sucht allein über slotStatus(...)==="now" und prüft dependsOn NICHT. Der Held zeigt „Right now · 10:20–11:20 — Thema 3“ und den Knopf „Start focus“, obwohl Thema 1 und 2 unerledigt sind; renderHero (web/js/tasks.js:197-233) setzt keinerlei Blockiert-Hinweis, während dieselbe Aufgabe in der Liste daneben den amber „blocked“-Chip trägt (web/js/tasks.js:104-105). Zweiter, ebenso erreichbarer Weg: die Person schiebt Thema 1 über die Tages-Timeline auf morgen (web/js/dayTimeline.js:265). Damit fällt Thema 1 aus `open` heraus, alle übrigen Themen der Kette haben offene Vorbedingungen, `open.find((t) => openDeps(t).length === 0)` liefert undefined und der Fallback `|| open[0]` (web/js/tasks.js:187) präsentiert Thema 2 als „Suggested next“ — genau die Aufgabe, deren Grundlage gerade weggeschoben wurde.
- **Vorschlag:** In Zweig 2 blockierte Aufgaben überspringen (bzw. sie zeigen, aber mit sichtbarem „wartet auf X“ statt „Start focus“), und den Fallback `|| open[0]` durch einen ehrlichen Leerzustand ersetzen, wenn jede offene Aufgabe wartet. Der Blockiert-Chip aus buildRow gehört auch in den Held.

## [MINOR] „Nutzt deine KI“ wird versprochen, obwohl die KI im Profil ausgeschaltet ist — bei Eingabe ohne Text endet das in einer Fehlermeldung

- **Ort:** `server/ai.js:37`
- **Linse:** integration
- **Ablauf:** getConfigView().ready prüft nur den Anbieter, nie die Einwilligung: `provider !== "none" && (provider === "ollama" || !!row?.api_key_enc || provider === "openai")` (server/ai.js:37). Das Sheet trägt genau dieses Flag: es zeigt „Nutzt deine KI (llama3.2). Dein Text wird dorthin gesendet.“ (web/js/studyplan.js:143-144) und sendet useAi:true (:299). Ablauf: Person hat früher Ollama eingerichtet, später im Profil den Schalter „KI-Planung & Vorschläge“ ausgeschaltet (web/js/profile.js:45 → profile.aiEnabled=false). Sie öffnet das Sheet, liest das KI-Versprechen, tippt nur ein Ziel (kein eingefügter Text), klickt „Themen vorschlagen“ → ai.planTopics → requireProvider wirft 403 „KI ist ausgeschaltet — aktiviere sie im Profil…“ (server/ai.js:253-259), und weil material leer ist, wird der Fehler durchgereicht statt aufgefangen (server/routes.js:520). Ergebnis: Sackgasse, kein Vorschlag, obwohl die deterministische Gliederungs-Erkennung nie gefragt war. Gleiche Klasse bei provider="openai" ohne API-Key: ready ist trotzdem true, der Aufruf geht ohne Authorization an api.openai.com und endet als 502. Der KI-Bot macht es richtig und kombiniert beides (web/js/aibot.js:109: `!store.state.profile?.aiEnabled || !config || config.provider === "none"`).
- **Vorschlag:** ready in getConfigView an repo.getProfile()?.aiEnabled koppeln (und für openai einen Key/Base-URL verlangen), oder im Sheet wie in aibot.js zusätzlich store.state.profile.aiEnabled prüfen, bevor „Nutzt deine KI“ behauptet und useAi:true gesendet wird.
