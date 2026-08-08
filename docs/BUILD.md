# BUILD — Contract für Focus-Lernuhr-Feature-Module

Diese Datei ist der **verbindliche Vertrag**. Halte dich exakt daran, damit alle Module
zusammenpassen. Kernfundament (Store, API, Util, HTML-Shell, Tokens, Timer, Clock) existiert
bereits und darf **nicht** verändert werden.

## Architektur
- **PWA-Frontend** in `web/`, ausgeliefert vom Zero-Dep-Node-Server (`server/`).
- **Backend** = SQLite. Jede Mutation über `api` liefert die **volle Momentaufnahme** zurück.
- Ein Modul = `web/js/<name>.js` (ESM) + `web/css/<name>.css`.
- Feature-Module manipulieren **nur ihre** DOM-Region (IDs siehe unten) und lesen/schreiben Daten
  ausschließlich über `store` und `api`.

## Modul-Muster (Pflicht)
Jedes Modul exportiert genau eine Init-Funktion und abonniert den Store:

```js
import { /* helpers */ } from "/js/util.js";
export function initX({ store, api }) {
  // 1) DOM-Elemente per document.getElementById holen
  // 2) Event-Handler anhängen (Event-Delegation für Listen bevorzugen)
  // 3) render() definieren, das store.state liest
  // 4) store.subscribe(render); render();
  // 5) optional { tick } zurückgeben (wird jede Sekunde aufgerufen)
}
```

Aktionen rufen `api.*` und übergeben das Ergebnis an `store.applySnapshot(snapshot)`:
```js
async function act(promise) { try { store.applySnapshot(await promise); } catch(e){ console.warn(e);} }
act(api.tasks.create({ text }));
```

## store.state (Lesezugriff)
```
{
  serverOffsetMs, online, loaded, serverTime,
  timer:   { status, phase, cycleInBlock, remainingMs, endsAt, activeTaskId, updatedAt },
  settings:{ focusMinutes, shortBreakMinutes, longBreakMinutes, cyclesUntilLongBreak,
             autoStartNextPhase, todayGoalHours, profileName, activeExamId },
  exams:   [ { id, name, date /*epoch ms|null*/, totalHours, color, sortOrder } ],
  tasks:   [ { id, examId, text, subject, priority /*1..4*/, dueDate, estMinutes,
               done, doneAt, spentMs, active, sortOrder, subtasks:[{id,taskId,text,done,sortOrder}] } ],
  topics:  [ { id, examId, text, done, sortOrder } ],
  today:   { dayKey, focusMs, sessionsDone, goalHours },
  ui:      { expandedTaskId }
}
```
Store-Methoden: `store.now()` (NTP-korrigierte epoch ms — **immer** statt Date.now() nutzen),
`store.subscribe(fn)`, `store.setUi(patch)`, `store.emit()`, `store.applySnapshot(snap)`.

## api (Schreibzugriff) — alle liefern die Momentaufnahme (Promise)
```
api.setSettings({ focusMinutes?, shortBreakMinutes?, longBreakMinutes?, cyclesUntilLongBreak?,
                  todayGoalHours?, autoStartNextPhase?, profileName?, activeExamId? })
api.timer.activeTask(taskId|null)   // Aufgabe im Timer aktiv setzen
api.exams.create({ name, date, totalHours, color })   .update(id, patch)   .remove(id)
api.tasks.create({ text, examId?, subject?, priority?, dueDate?, estMinutes? })
api.tasks.update(id, { text?, subject?, priority?, dueDate?, estMinutes?, examId?, done?, sortOrder? })
api.tasks.remove(id)   api.tasks.reorder([ids])   api.tasks.addSubtask(taskId, text)
api.subtasks.update(id, { text?, done? })   api.subtasks.remove(id)
api.topics.create({ text, examId? })   api.topics.update(id, { text?, done?, examId? })   api.topics.remove(id)
```
`date`/`dueDate` sind **epoch ms**. Konvertierung: `fromDatetimeLocal(value)` / `toDatetimeLocal(ms)` aus util.

## util.js (verfügbare Helfer)
`formatMs, formatClock, formatDate, formatDateShort, formatHours(ms), formatMinutes(min),
hmsUntil(target, now), daysUntil(target, now), priorityLabel(p), priorityClass(p),
dueLabel(dueMs, now) -> {text, soon}|null, escapeHtml(s), toDatetimeLocal(ms), fromDatetimeLocal(v),
PHASES, STATUS, phaseLabelJa, phaseLabelDe`

## Design (nur Tokens aus tokens.css verwenden — keine Hex-Codes hart kodieren)
`--accent #a9524a`, `--accent-dark`, `--accent-soft/-soft2/-border`, `--green #5E8577` (Pause/Erfolg),
`--ink`, `--ink-soft`, `--muted`, `--paper` (Karten), `--paper-2` (Innenflächen), `--warm/-2`,
`--line/-soft/-strong`, `--track`. Radien `--r-card/-inner/-btn/-chip/-pill`. Schatten `--shadow-card/-soft`.
Vorhandene Klassen (base.css) wiederverwenden: `.card .card__head .card__title .card__sub .card__hint
.btn .btn--primary/--ghost/--soft/--wide .add-btn .text-input .task-input-row .pill .pill--muted
.chip .chip--prio1..4/--due/--due-soon/--subject/--sub/--est .progress .progress__bar .empty .icon-btn`.
Japanische Labels wie im Mockup + deutsche Ergänzung sind ok (die App ist bilingual ja/de).

## Guardrails
- Bei jedem Reconcile ruft der Store `render()` erneut auf. **Fokussierte Inputs nicht überschreiben**:
  `if (document.activeElement !== inputEl) inputEl.value = ...`.
- Nutzertext immer mit `escapeHtml()` einsetzen (oder textContent).
- Listen per Event-Delegation ODER bei Neuaufbau Handler frisch setzen (kein Leak).
- Kein `Date.now()` — immer `store.now()`.
- Keine externen Ressourcen (CDN/Fonts) — die PWA muss offline funktionieren.

## DOM-Regionen je Modul (IDs bereits in web/index.html vorhanden)

### tasks.js (+ css/tasks.css)  — Aufgaben, Subtasks, "als Nächstes", aktuelle Aufgabe
- Eingabe: `#taskInput`, `#taskAddBtn`. Zähler: `#taskCount`. Prüfungsname: `#taskExamName`.
- Aktive Prüfung filtert die Liste (store.settings.activeExamId): zeige Tasks mit examId === activeExamId **oder** examId null; wenn kein aktives Exam, zeige alle.
- "Als Nächstes": `#nextTaskCard` (hidden toggeln), `#nextText`, `#nextChips`, `#startNextBtn`
  → höchste Priorität / früheste Fälligkeit unter offenen Tasks. Start-Button: `api.timer.activeTask(id)` **dann** `api.timer.start()` (nacheinander, letztes Snapshot anwenden).
- Offene Liste: `#taskListOpen`. Leer-Text: `#taskEmpty`. Erledigt: `#doneWrap` (details), `#taskListDone`, `#doneCount`.
- Pro Task-Zeile: Checkbox (toggle done), Text (klick → `store.setUi({expandedTaskId})` aufklappen),
  Chips: Prio (klick zykliert 1→2→3→4→1 via `api.tasks.update`), Fälligkeit, Fach, Subtask-Zähler, Estimate, Fokuszeit (`formatMs(spentMs)`), aktiv-Marker (wenn `active`).
  Aufgeklappt: Subtask-Liste (toggle/add/remove), Prio-Wahl, Estimate (Min), Fälligkeit (datetime-local), Fach, "Im Timer aktivieren" (`api.timer.activeTask(id)`), Löschen.
- **Aktuelle-Aufgabe-Karte im Timer** (IDs `#currentTaskCard #ctKicker #ctTitle #ctChips #ctSub`):
  zeige den aktiven Task (`tasks.find(active)`), sonst "Keine Aufgabe gewählt" (Klasse `is-empty`).
  Bei Pause-Phase Klasse `is-break`. Kicker: "JETZT FOKUS". Sub: `Fokuszeit: mm:ss` + Subtask-Fortschritt.
- Sortierung: nicht erledigt zuerst, dann Prio (1 oben), dann Fälligkeit, dann sortOrder.

### exam.js (+ css/exam.css) — Prüfungs-Chips + Countdown-Karte
- Chips oben: Container `#examChips` (füllen), Button `#addExamBtn` (`api.exams.create({name:"Neue Prüfung", date: store.now()+14 Tage in ms})`, danach als aktiv setzen via `api.setSettings({activeExamId})`).
  Jeder Chip: Name + Resttage; Klasse `is-active` wenn `id===activeExamId`; Klick setzt aktiv.
- Countdown-Karte `#examCard` zeigt die **aktive** Prüfung (activeExamId, sonst erste):
  `#examName` (input, `api.exams.update` bei change), `#examDaysNum` (`daysUntil`), `#examHMS`
  (`hmsUntil`, **jede Sekunde** via tick), `#examDate` (datetime-local ↔ date), `#examPensum`
  (input hours → totalHours), `#examProgressBar` (Anteil verstrichener Zeit seit Erstellung… nutze
  stattdessen: erledigte Themen/Gesamt-Themen dieser Prüfung als Fortschritt), `#examRemainLabel`
  (z. B. "12 von 40 Themen"), `#deleteExamBtn` (`api.exams.remove`). Wenn keine Prüfung: `#examEmpty` zeigen, Rest leeren.
- Exportiere `{ tick }` für den Sekunden-Countdown (`#examHMS`).

### today.js (+ css/today.css) — Tagesziel
- `#todayGoalHours` (number input → `api.setSettings({todayGoalHours})` bei change; nicht überschreiben wenn fokussiert).
- `#todayProgressBar` (Breite = today.focusMs / (goalHours*3.6e6), cap 100%).
- `#todayDoneLabel` (`${formatHours(today.focusMs)} h von ${goalHours.toFixed(1)} h geschafft`).
- `#startTodayBtn` → `api.timer.start()` (Fokus starten). `#todayRemainLabel` optional.

### timeline.js (+ css/timeline.css) — Tages-Timeline aus offenen Tasks
- Baue eine einfache Timeline: ab `store.now()` (auf 5 Min gerundet) die offenen Tasks (aktive Prüfung,
  nach Prio/Fälligkeit sortiert) hintereinander mit je `estMinutes` (Rest = estMinutes − spentMs/60000, min 5),
  dazwischen keine Pausen (einfach). Für jeden Block: Startzeit (`formatClock`), Name, Range (start–end),
  Minuten. Container `#timeline`, Leer-Text `#timelineEmpty`.
- `#finishLabel` = Endzeit des letzten Blocks (`formatClock`) oder "–".
- `#paceLabel` = Anzahl Blöcke / Gesamtminuten, z. B. "4 Blöcke · 3.5 h".
- NOW-Marker: erster Block bekommt Klasse `is-now`. Exportiere `{ tick }` (Timeline alle ~30 s / bei Emit neu; Sekunden-Genauigkeit nicht nötig, aber tick darf neu rendern wenn sich die Minute ändert).

### topics.js (+ css/topics.css) — Prüfungs-Themen-Checkliste
- Eingabe `#topicInput` + `#topicAddBtn` (`api.topics.create({text, examId: activeExamId})`).
- Liste `#topicList` (Themen der aktiven Prüfung, sonst alle), Zähler `#topicCount` (erledigt/gesamt),
  Leer-Text `#topicEmpty`. Pro Zeile: Checkbox (toggle done), Text, Löschen. Erledigte nach unten, durchgestrichen.
```

## Wave 6 — Lernprofil, Methoden, Bibliothek, Teilen, KI (Kurzreferenz)

Neue Module folgen dem bestehenden Vertrag (`init*(ctx)` via `safeInit`, Render in `#…Root`-Shells):
`adapt` (Darstellung/Zugänglichkeit aus `prefs`), `webview` (In-App-Viewer + globale Link-Übernahme),
`knowledge`, `journal`, `library` (+ globales Referenz-Panel), `path`, `aibot`, `share` (Import-Flow).
Server: `migrations/wave6.mjs` (user_prefs, materials, shares, reviews, ai_config — einzige Schema-Quelle),
`share.js` (öffentliche `/s/:token`-Seite + Import), `ai.js` (Provider-Proxy, Key verschlüsselt).
Upload-Sonderweg: `POST /api/materials/upload` liest den Roh-Body (25 MB) VOR der JSON-Route-Tabelle.
Snapshot-Erweiterung: `materials`, `prefs`, `reviews`, `reviewsDueToday`. Tests: `tests/wave6.test.js`.

## Marken-Assets (Kairos Brand Kit)

Quelle ist ausschließlich `assets/kairos-brand-kit/` — dort nichts editieren, sondern bei einer
neuen Kit-Lieferung die Ableitungen neu ziehen:

- `web/icons/` = 1:1-Kopien aus dem Kit (`favicon.svg` schaltet Hell/Dunkel intern per
  `prefers-color-scheme`, dazu `favicon.ico`, `apple-touch-icon.png`, `icon-192/512(-dark).png`,
  `safari-pinned-tab.svg`, `mark.svg`). `badge-128.png` (= `kairos-symbol-moment-128.png`) ist der
  Notification-Badge: einfarbig mit Alpha, weil das OS ihn maskiert.
- `assets/icons/icon-{16,32,48,128}.png` für die Extension entstehen aus
  `kairos-app-icon-light-1024.png`: `sips -Z <größe> <quelle> --out <ziel>`.
- Das **Zeichen im UI** wird als Inline-SVG eingebettet (Moment-Variante, `stroke="currentColor"`),
  damit es die Textfarbe erbt: `.brand__mark` (Sidebar, Overlay), `.onb__mark` (Onboarding),
  `.head__mark` (Extension-Panel), dazu Login-Overlay (`web/js/auth.js`) und die geteilte Seite
  (`server/share.js`). Neue Marken-Stellen bitte demselben Muster folgen — kein PNG einbetten.
- `web/sw.js`: Icon-Pfade stehen in `APP_SHELL` und in den `showNotification`-Defaults. Nach jeder
  Icon-Änderung `VERSION` hochzählen, sonst liefert der alte Cache die alten Dateien aus.
- `<meta name="theme-color">` in `index.html` ist nur der System-Fallback; zur Laufzeit führt
  `applyThemeColor()` in `web/js/adapt.js` die Farbe an `--page` des aufgelösten App-Themes nach.

## Icons im UI — `web/js/icons.js` ist die einzige Quelle

Die Oberfläche enthält **keine Emojis** (auch keine Haken/Kreuze/Pfeile als Textzeichen im Markup).
Grund: Emojis rendern je Betriebssystem anders, lassen sich nicht einfärben und ignorieren damit
Dark-Mode, Akzentfarbe und Hochkontrast — genau die Optionen, die das Lernprofil anbietet.

```js
import { icon, fileIcon } from "/js/icons.js";

`<button class="lib-act" title="${t.pin}">${icon("pin")}</button>`     // Icon-only → title/aria-label Pflicht
`<span class="ico-row">${icon("card")}${esc(label)}</span>`            // Icon + Text → Icon bleibt aria-hidden
`${icon(fileIcon(m.mime), { size: 18 })}`                              // Datei-Typ aus dem MIME
```

Regeln:

- `icon(name, { size = 16, cls, label, stroke })` gibt einen SVG-String für Template-Literals zurück
  (24er-Raster, `fill:none`, `stroke:currentColor`, Strichstärke 1.8 — identisch zu den Nav-Icons).
  Ohne `label` ist das Icon `aria-hidden`; trägt es allein die Bedeutung, `label` setzen **oder** am
  Button `aria-label`/`title` pflegen.
- **Keine handgerollten Inline-SVGs** in Feature-Modulen und keine festen Farben (`stroke="#…"`) —
  sonst bricht die Farbe in Dark-Mode/Hochkontrast weg. Fehlt ein Piktogramm, gehört es in `PATHS`.
- Basisklassen in `base.css`: `.ico` (Ausrichtung), `.ico-btn` (zentriertes Icon-only-Element),
  `.ico-row` (Icon + Text). Buttons, die vorher ein Glyph zentriert haben, brauchen `inline-flex`
  statt `font-size`-Hacks.
- Piktogramme für Lernmethoden/-stile stehen als `icon`-**Feld** in `shared/methods.js` (eine Quelle
  für Knowledge, Onboarding und Profil) — dort den Namen pflegen, nicht in der Ansicht.
- Statisches Markup (`web/index.html`) kann `icon()` nicht aufrufen: dort das SVG inline im selben
  Stil einsetzen. Die Extension (`src/`) kann `/js/icons.js` nicht importieren und hält ihr eigenes,
  stilgleiches Mini-Set.
- Server-seitig gerendertes HTML (die geteilte Seite in `server/share.js`) importiert dasselbe Modul
  über `../web/js/icons.js` — `icons.js` ist bewusst frei von DOM-Zugriffen.
- Neues Icon → `PATHS` in `web/js/icons.js` ergänzen; `tests/icons.test.js` prüft Wohlgeformtheit,
  `currentColor`, die Katalog-Namen und schlägt an, sobald ein Emoji zurück ins UI wandert.
