// Lernmethoden-Katalog — einzige Quelle der Wahrheit für PWA, Server und Tests.
// Kairos geht NICHT automatisch von Pomodoro aus: Der Timer folgt der gewählten
// Methode (preset), Vorschläge folgen dem Lernprofil (Stile/Herausforderungen).
//
// evidence: 3 = stark belegt (Meta-Analysen, z. B. Dunlosky 2013, Cepeda 2006,
// Gollwitzer 2006) · 2 = gut belegt · 1 = bewährte Praxis (v. a. ADHS-Community).
// preset: { focus, short, long, cycles } in Minuten → PUT /api/settings.
// styles/challenges/helps: Schlüssel aus LEARN_STYLES/CHALLENGES/HELPS (Lernprofil).

export const METHOD_CATEGORIES = [
  { id: "time",    icon: "timer", de: "Zeit & Fokus",             en: "Time & focus" },
  { id: "memory",  icon: "brain", de: "Gedächtnis & Behalten",    en: "Memory & retention" },
  { id: "process", icon: "bulb", de: "Verstehen & Verarbeiten",  en: "Understanding & processing" },
  { id: "plan",    icon: "compass", de: "Planung & Dranbleiben",    en: "Planning & consistency" },
];

// ── Lernprofil-Bausteine (Onboarding, Profil, KI-Buddy) ─────────────────
export const LEARN_STYLES = [
  { id: "write",  icon: "edit", de: "Schreiben & Zusammenfassen",     en: "Writing & summarising" },
  { id: "read",   icon: "bookOpen", de: "Lesen & Markieren",              en: "Reading & highlighting" },
  { id: "visual", icon: "map", de: "Bilder, Skizzen & Diagramme",    en: "Pictures, sketches & diagrams" },
  { id: "listen", icon: "audio", de: "Hören (Vorträge, Audio)",        en: "Listening (lectures, audio)" },
  { id: "speak",  icon: "speech", de: "Erklären & laut sprechen",       en: "Explaining & talking out loud" },
  { id: "move",   icon: "walk", de: "Bewegung (Laufen, Gestik)",      en: "Movement (walking, gestures)" },
  { id: "social", icon: "users", de: "Gemeinsam lernen",               en: "Studying together" },
  { id: "do",     icon: "tool", de: "Ausprobieren & Übungsaufgaben",  en: "Doing & practice problems" },
];

export const CHALLENGES = [
  { id: "adhd",            icon: "zap", de: "ADHS / Konzentration",             en: "ADHD / focus" },
  { id: "dyslexia",        icon: "type", de: "Legasthenie (Lesen & Schreiben)",  en: "Dyslexia (reading & writing)" },
  { id: "dyscalculia",     icon: "hash", de: "Dyskalkulie (Zahlen & Rechnen)",   en: "Dyscalculia (numbers & maths)" },
  { id: "anxiety",         icon: "wind", de: "Prüfungsangst",                    en: "Test anxiety" },
  { id: "procrastination", icon: "spiral", de: "Aufschieben",                      en: "Procrastination" },
  { id: "overwhelm",       icon: "layers", de: "Reizüberflutung / schnell abgelenkt", en: "Overwhelm / easily distracted" },
];

// Chronotyp — EINE Quelle für Onboarding (Schritt 1) und Profil (#pfChrono in
// web/index.html). Vorher führte das Onboarding eine eigene Tupel-Tabelle und
// das Profil zeigte dieselben drei Werte als reine Textknöpfe.
// Die ids sind exakt die Werte, die als profile.chronotype gespeichert werden.
export const CHRONOTYPES = [
  { id: "early",        icon: "sunrise", de: "Morgens", en: "Morning" },
  { id: "intermediate", icon: "sun",     de: "Mittags", en: "Midday" },
  { id: "late",         icon: "moon",    de: "Abends",  en: "Evening" },
];

export const HELPS = [
  { id: "short-blocks", icon: "timer", de: "Kurze Lernblöcke",        en: "Short study blocks" },
  { id: "long-blocks",  icon: "waves", de: "Lange, ruhige Blöcke",    en: "Long, calm blocks" },
  { id: "structure",    icon: "grid", de: "Feste Struktur & Pläne",  en: "Firm structure & plans" },
  { id: "variety",      icon: "shuffle", de: "Abwechslung",             en: "Variety" },
  { id: "rewards",      icon: "trophy", de: "Belohnungen & Serien",    en: "Rewards & streaks" },
  { id: "deadlines",    icon: "hourglass", de: "Countdown & Deadlines",   en: "Countdowns & deadlines" },
  { id: "quiet",        icon: "mute", de: "Stille",                  en: "Silence" },
  { id: "music",        icon: "music", de: "Musik / Geräuschkulisse", en: "Music / background noise" },
];

// ── Katalog ─────────────────────────────────────────────────────────────
export const METHODS = [
  // ═══ Zeit & Fokus ═══
  {
    id: "pomodoro", cat: "time", icon: "timer", evidence: 2, adhd: true,
    preset: { focus: 25, short: 5, long: 15, cycles: 4 },
    styles: [], helps: ["short-blocks"],
    de: {
      name: "Pomodoro (25/5)",
      short: "25 Minuten Fokus, 5 Minuten Pause — nach 4 Runden eine lange Pause.",
      how: "Eine Aufgabe wählen, Timer starten, bis zum Klingeln nur diese Aufgabe. Pausen sind Pflicht, kein Bonus.",
      science: "Kurze, klar begrenzte Blöcke senken die Einstiegshürde und beugen mentaler Ermüdung vor — besonders hilfreich bei ADHS.",
      inApp: "Als Timer-Modus aktivierbar; Kairos zählt Zyklen, plant die lange Pause und schickt Erinnerungen, wenn die Pause überzogen wird.",
    },
    en: {
      name: "Pomodoro (25/5)",
      short: "25 minutes of focus, 5 minutes break — long break after 4 rounds.",
      how: "Pick one task, start the timer, work only on that task until it rings. Breaks are mandatory, not a bonus.",
      science: "Short, clearly bounded blocks lower the activation barrier and prevent mental fatigue — especially helpful with ADHD.",
      inApp: "Activate as a timer mode; Kairos counts cycles, schedules the long break and nudges you when a break overruns.",
    },
  },
  {
    id: "pomodoro50", cat: "time", icon: "hourglass", evidence: 2,
    preset: { focus: 50, short: 10, long: 20, cycles: 3 },
    styles: ["read", "write"], helps: ["long-blocks"],
    de: {
      name: "Lange Blöcke (50/10)",
      short: "50 Minuten tiefe Arbeit, 10 Minuten Pause — für Stoff, der Anlauf braucht.",
      how: "Wie Pomodoro, nur länger: gut für Texte, Zusammenfassungen und Aufgabenserien, bei denen 25 Minuten zu kurz sind.",
      science: "Längere Blöcke reduzieren Kontextwechsel-Kosten; Pausen bleiben wichtig für Konsolidierung und Aufmerksamkeit.",
      inApp: "Als Timer-Modus aktivierbar — alle Ringe, Statistiken und Pausen-Erinnerungen passen sich an.",
    },
    en: {
      name: "Long blocks (50/10)",
      short: "50 minutes of deep work, 10 minutes break — for material that needs a run-up.",
      how: "Like Pomodoro but longer: good for texts, summaries and problem sets where 25 minutes is too short.",
      science: "Longer blocks reduce context-switching costs; breaks remain essential for consolidation and attention.",
      inApp: "Activate as a timer mode — rings, stats and break reminders adapt automatically.",
    },
  },
  {
    id: "r5217", cat: "time", icon: "chart", evidence: 1,
    preset: { focus: 52, short: 17, long: 17, cycles: 4 },
    styles: [], helps: ["long-blocks"],
    de: {
      name: "52/17-Rhythmus",
      short: "52 Minuten arbeiten, 17 Minuten wirklich abschalten.",
      how: "In der Pause bewusst weg vom Schreibtisch — Bewegung, Fenster, Wasser. Die Pause ist Teil der Methode.",
      science: "Geht auf Produktivitätsdaten (DeskTime) zurück: Die produktivsten Nutzer arbeiteten in diesem Rhythmus. Praxis-Evidenz, kein Laborbefund.",
      inApp: "Als Timer-Modus aktivierbar; die Pausen-Erinnerung holt dich nach 17 Minuten zurück.",
    },
    en: {
      name: "52/17 rhythm",
      short: "Work 52 minutes, truly switch off for 17.",
      how: "During the break, leave the desk on purpose — move, window, water. The break is part of the method.",
      science: "Based on productivity data (DeskTime): the most productive users worked in this rhythm. Practice evidence, not lab research.",
      inApp: "Activate as a timer mode; the break reminder brings you back after 17 minutes.",
    },
  },
  {
    id: "ultradian", cat: "time", icon: "spiral", evidence: 1,
    preset: { focus: 90, short: 20, long: 30, cycles: 2 },
    styles: [], helps: ["long-blocks", "quiet"],
    de: {
      name: "90-Minuten-Zyklen (ultradian)",
      short: "Dem natürlichen 90-Minuten-Rhythmus des Gehirns folgen, dann 20–30 Minuten erholen.",
      how: "Ein großes Thema pro Zyklus. Nach 90 Minuten ist die Erholung nicht verhandelbar — sonst leiht sich der nächste Block Energie.",
      science: "Ultradiane Rhythmen (Basic Rest-Activity Cycle, Kleitman) legen ~90-Minuten-Wellen der Wachheit nahe; die Übertragung aufs Lernen ist plausibel, aber weniger hart belegt.",
      inApp: "Als Timer-Modus aktivierbar — ideal mit deinem Chronotyp kombiniert (Profil).",
    },
    en: {
      name: "90-minute cycles (ultradian)",
      short: "Follow the brain's natural ~90-minute rhythm, then recover for 20–30 minutes.",
      how: "One big topic per cycle. After 90 minutes, recovery is non-negotiable — otherwise the next block borrows energy.",
      science: "Ultradian rhythms (Basic Rest-Activity Cycle, Kleitman) suggest ~90-minute waves of alertness; applying them to studying is plausible but less firmly proven.",
      inApp: "Activate as a timer mode — ideal combined with your chronotype (profile).",
    },
  },
  {
    id: "flowtime", cat: "time", icon: "waves", evidence: 1, adhd: true,
    preset: null,
    styles: [], helps: ["long-blocks"],
    de: {
      name: "Flowtime",
      short: "Arbeiten, solange der Fokus trägt — Pause, wenn er nachlässt. Kein Wecker mitten im Flow.",
      how: "Starte den Timer ohne festen Endpunkt im Kopf. Wenn die Konzentration kippt, pausiere bewusst und notiere, wie lange du im Flow warst.",
      science: "Alternative zu Pomodoro für Hyperfokus-Phasen (ADHS): Unterbrechungen mitten im Flow kosten mehr, als feste Intervalle bringen.",
      inApp: "Nutze Start/Pause frei — Kairos protokolliert die echte Fokuszeit je Session im Journal, ohne dich zu unterbrechen.",
    },
    en: {
      name: "Flowtime",
      short: "Work while focus carries you — break when it fades. No alarm mid-flow.",
      how: "Start the timer without a fixed endpoint in mind. When concentration tips, pause deliberately and note how long you were in flow.",
      science: "An alternative to Pomodoro for hyperfocus phases (ADHD): interrupting mid-flow costs more than fixed intervals gain.",
      inApp: "Use start/pause freely — Kairos logs your true focus time per session in the journal without interrupting you.",
    },
  },
  {
    id: "timeboxing", cat: "time", icon: "box", evidence: 2, adhd: true,
    styles: [], helps: ["structure", "deadlines"],
    de: {
      name: "Timeboxing",
      short: "Jede Aufgabe bekommt vorab ein festes Zeitfenster im Tag — danach ist Schluss.",
      how: "Morgens (oder am Vorabend) Aufgaben auf konkrete Uhrzeiten legen. Das Fenster begrenzt die Aufgabe, nicht umgekehrt.",
      science: "Feste Zeitfenster wirken gegen den Planning Fallacy und Parkinsons Gesetz („Arbeit dehnt sich auf die verfügbare Zeit aus“).",
      inApp: "Das ist der Tages-Zeitstrahl auf „Heute“: Aufgaben auf Uhrzeiten ziehen, Kairos erinnert vor dem Start und fragt bei Verpasstem freundlich nach.",
    },
    en: {
      name: "Timeboxing",
      short: "Every task gets a fixed time window in your day — when it ends, it ends.",
      how: "In the morning (or the night before), place tasks on concrete times. The box limits the task, not the other way round.",
      science: "Fixed windows counter the planning fallacy and Parkinson's law (\"work expands to fill the time available\").",
      inApp: "This is the day timeline on \"Today\": drag tasks onto times, Kairos reminds you before the start and gently follows up on missed blocks.",
    },
  },
  {
    id: "body-doubling", cat: "time", icon: "users", evidence: 1, adhd: true,
    styles: ["social"], helps: [],
    de: {
      name: "Body Doubling",
      short: "Neben jemandem arbeiten (real oder per Video) macht Anfangen und Dranbleiben leichter.",
      how: "Verabrede feste Co-Working-Zeiten — Bibliothek, Freundin, Focusmate. Beide arbeiten still an eigenen Dingen.",
      science: "ADHS-Community-Standard: Die bloße Anwesenheit einer zweiten Person wirkt als externe Struktur und sanfte Rechenschaft.",
      inApp: "Teile deinen Prüfungs-Lernplan per Link, verabredet euch auf dieselben Zeitfenster — und startet parallel den Timer.",
    },
    en: {
      name: "Body doubling",
      short: "Working next to someone (in person or on video) makes starting and persisting easier.",
      how: "Schedule fixed co-working times — library, friend, Focusmate. Both work silently on their own things.",
      science: "An ADHD community staple: the mere presence of another person acts as external structure and gentle accountability.",
      inApp: "Share your exam study plan via link, agree on the same time windows — and start the timer in parallel.",
    },
  },

  // ═══ Gedächtnis & Behalten ═══
  {
    id: "spaced-repetition", cat: "memory", icon: "trending", evidence: 3,
    styles: [], helps: ["structure"],
    de: {
      name: "Verteiltes Lernen (Lernkurve)",
      short: "Wiederholen mit wachsenden Abständen — genau dann, wenn du es fast vergessen hättest.",
      how: "Stoff nicht an einem Tag stapeln, sondern über Tage/Wochen verteilen. Jede gelungene Wiederholung verlängert den nächsten Abstand.",
      science: "Einer der best-belegten Effekte der Lernforschung (Ebbinghaus' Vergessenskurve; Cepeda 2006; Dunlosky 2013: „high utility\").",
      inApp: "Das Journal führt deine Abruf-Warteschlange: Gelerntes taucht nach 1, 3, 7, … Tagen wieder auf — der Abstand passt sich deiner Bewertung an.",
    },
    en: {
      name: "Spaced repetition (forgetting curve)",
      short: "Review at growing intervals — right when you were about to forget.",
      how: "Don't cram material into one day; spread it over days/weeks. Every successful review stretches the next interval.",
      science: "One of the best-documented effects in learning research (Ebbinghaus' forgetting curve; Cepeda 2006; Dunlosky 2013: \"high utility\").",
      inApp: "The journal runs your recall queue: things you studied resurface after 1, 3, 7, … days — intervals adapt to your self-rating.",
    },
  },
  {
    id: "active-recall", cat: "memory", icon: "target", evidence: 3,
    styles: ["do", "write"], helps: [],
    de: {
      name: "Aktiver Abruf (Testing-Effekt)",
      short: "Sich selbst abfragen schlägt erneutes Lesen — mit Abstand.",
      how: "Buch zu, aus dem Kopf aufschreiben oder laut beantworten, DANN nachschlagen. Der Abruf selbst ist das Training, nicht die Kontrolle.",
      science: "„Practice testing\" ist neben verteiltem Lernen die wirksamste Technik der Meta-Analysen (Roediger & Karpicke 2006; Dunlosky 2013).",
      inApp: "Im Journal: erst aufschreiben, was du noch weißt, dann Material aufdecken, dann bewerten — Kairos terminiert die nächste Abfrage.",
    },
    en: {
      name: "Active recall (testing effect)",
      short: "Testing yourself beats re-reading — by a wide margin.",
      how: "Book closed, write it down from memory or answer out loud, THEN look it up. The retrieval itself is the training, not the check.",
      science: "\"Practice testing\" is, alongside spacing, the most effective technique in meta-analyses (Roediger & Karpicke 2006; Dunlosky 2013).",
      inApp: "In the journal: first write down what you remember, then reveal the material, then rate yourself — Kairos schedules the next recall.",
    },
  },
  {
    id: "leitner", cat: "memory", icon: "card", evidence: 2,
    styles: ["do", "write"], helps: ["structure"],
    de: {
      name: "Leitner-Kästchen (Karteikarten)",
      short: "Karten wandern bei Erfolg in seltener wiederholte Fächer — Fehler wandern zurück.",
      how: "Frage vorn, Antwort hinten. Gewusst → nächstes Fach (längerer Abstand). Nicht gewusst → zurück in Fach 1.",
      science: "Kombiniert aktiven Abruf mit verteiltem Lernen in einem einfachen physischen System (Sebastian Leitner, 1972).",
      inApp: "Lege Formel- und Regelkarten in der Bibliothek an und nimm sie in die Abruf-Warteschlange — Kairos übernimmt die Fächer-Logik automatisch.",
    },
    en: {
      name: "Leitner boxes (flashcards)",
      short: "Cards move to less-frequent boxes on success — and back on mistakes.",
      how: "Question on the front, answer on the back. Known → next box (longer interval). Unknown → back to box 1.",
      science: "Combines active recall with spacing in a simple physical system (Sebastian Leitner, 1972).",
      inApp: "Create formula and rule cards in the library and add them to the recall queue — Kairos handles the box logic automatically.",
    },
  },
  {
    id: "interleaving", cat: "memory", icon: "shuffle", evidence: 2,
    styles: ["do"], helps: ["variety"],
    de: {
      name: "Interleaving (Themen mischen)",
      short: "Aufgabentypen abwechseln (ABC ABC) statt blockweise üben (AAA BBB).",
      how: "In einer Übungssession bewusst zwischen verwandten Themen springen — z. B. drei Mathe-Aufgabentypen gemischt statt nacheinander.",
      science: "Erschwert das Lernen spürbar, verbessert aber Transfer und Unterscheidungsfähigkeit (Rohrer & Taylor 2007) — eine „wünschenswerte Erschwernis\".",
      inApp: "Plane auf „Heute“ abwechselnde Blöcke verschiedener Themen derselben Prüfung — der Lernpfad zeigt, was sich zum Mischen anbietet.",
    },
    en: {
      name: "Interleaving (mixing topics)",
      short: "Alternate problem types (ABC ABC) instead of practising in blocks (AAA BBB).",
      how: "Within one practice session, deliberately switch between related topics — e.g. three maths problem types mixed rather than sequential.",
      science: "Feels harder, but improves transfer and discrimination (Rohrer & Taylor 2007) — a \"desirable difficulty\".",
      inApp: "Plan alternating blocks of different topics of the same exam on \"Today\" — the learning path shows what's ripe for mixing.",
    },
  },
  {
    id: "memory-palace", cat: "memory", icon: "building", evidence: 2,
    styles: ["visual", "move"], helps: [],
    de: {
      name: "Loci-Methode (Gedächtnispalast)",
      short: "Fakten an Orte eines vertrauten Weges hängen und beim Abruf den Weg abgehen.",
      how: "Wähle eine vertraute Route (Wohnung, Schulweg). Verknüpfe jeden Lernfakt mit einer Station — je absurder das Bild, desto besser.",
      science: "Eine der ältesten dokumentierten Techniken; räumliches Gedächtnis ist außergewöhnlich robust (Maguire 2003, Gedächtnissportler-Studien).",
      inApp: "Halte deine Routen als Karte in der Bibliothek fest; beim Abruf im Journal gehst du den Weg im Kopf noch einmal ab.",
    },
    en: {
      name: "Method of loci (memory palace)",
      short: "Attach facts to spots along a familiar route, then walk the route to recall.",
      how: "Pick a familiar route (flat, way to school). Link each fact to a station — the more absurd the image, the better.",
      science: "One of the oldest documented techniques; spatial memory is exceptionally robust (Maguire 2003, memory-athlete studies).",
      inApp: "Keep your routes as a card in the library; during journal recall, mentally walk the route again.",
    },
  },
  {
    id: "chunking", cat: "memory", icon: "layers", evidence: 2,
    styles: [], challenges: ["dyscalculia", "overwhelm"],
    de: {
      name: "Chunking (Sinneinheiten)",
      short: "Großes in wenige bedeutungsvolle Einheiten bündeln — 7 Ziffern werden 3 Blöcke.",
      how: "Stoff in 3–5 zusammenhängende Pakete gliedern und den Paketen Namen geben. Erst Pakete lernen, dann Inhalte.",
      science: "Das Arbeitsgedächtnis hält nur ~4 Einheiten (Cowan 2001; Miller 1956) — Chunking macht Einheiten größer statt mehr.",
      inApp: "Gliedere Prüfungen in Themen und Aufgaben in Mini-Schritte — Kairos zeigt Fortschritt pro Paket statt einer erschlagenden Gesamtmenge.",
    },
    en: {
      name: "Chunking (units of meaning)",
      short: "Bundle big material into a few meaningful units — 7 digits become 3 blocks.",
      how: "Structure material into 3–5 coherent packages and name them. Learn the packages first, then their contents.",
      science: "Working memory holds only ~4 units (Cowan 2001; Miller 1956) — chunking makes units bigger instead of more numerous.",
      inApp: "Split exams into topics and tasks into mini-steps — Kairos shows progress per package instead of one overwhelming total.",
    },
  },
  {
    id: "mnemonics", cat: "memory", icon: "sparkle", evidence: 2,
    styles: ["listen", "visual"], challenges: ["dyslexia"],
    de: {
      name: "Eselsbrücken & Merksätze",
      short: "Abstraktes in Reime, Akronyme oder Bilder verpacken.",
      how: "Für Listen: Anfangsbuchstaben zu einem Satz machen. Für Begriffe: Klangbilder oder verrückte Assoziationen bauen — selbst erfinden wirkt stärker als übernehmen.",
      science: "Mnemotechniken verankern Neues an bereits gut vernetzten Strukturen (Reim, Melodie, Bild) — solide belegt für Fakten- und Vokabellernen.",
      inApp: "Sammle deine Merksätze als Karten in der Bibliothek und pinne sie ins Referenz-Panel — beim Abruf fragt Kairos sie mit ab.",
    },
    en: {
      name: "Mnemonics & memory hooks",
      short: "Wrap the abstract in rhymes, acronyms or images.",
      how: "For lists: turn initial letters into a sentence. For terms: build sound-alikes or absurd associations — inventing your own beats adopting others'.",
      science: "Mnemonics anchor new material to already well-connected structures (rhyme, melody, image) — solidly supported for facts and vocabulary.",
      inApp: "Collect your memory hooks as cards in the library and pin them to the reference panel — Kairos includes them in recall.",
    },
  },
  {
    id: "dual-coding", cat: "memory", icon: "image", evidence: 2,
    styles: ["visual"], challenges: ["dyslexia"],
    de: {
      name: "Dual Coding (Bild + Wort)",
      short: "Denselben Inhalt sprachlich UND bildlich verarbeiten — zwei Gedächtnisspuren statt einer.",
      how: "Zu jedem wichtigen Konzept eine Skizze, ein Diagramm oder eine Zeitleiste zeichnen und daneben in eigenen Worten beschreiben.",
      science: "Paivios Dual-Coding-Theorie: verbale und bildliche Kodierung ergänzen sich; Abruf gelingt über beide Wege.",
      inApp: "Lade deine Skizzen/Diagramme als Material zum Thema hoch — der KI-Buddy erklärt dir Stoff auf Wunsch bevorzugt in Diagramm-Form.",
    },
    en: {
      name: "Dual coding (image + word)",
      short: "Process the same content verbally AND visually — two memory traces instead of one.",
      how: "For every key concept, draw a sketch, diagram or timeline and describe it next to it in your own words.",
      science: "Paivio's dual-coding theory: verbal and visual encoding complement each other; recall works via both routes.",
      inApp: "Upload your sketches/diagrams as topic material — and the AI buddy will prefer diagram-style explanations if you ask.",
    },
  },
  {
    id: "generation-effect", cat: "memory", icon: "edit", evidence: 2,
    styles: ["write"], helps: [],
    de: {
      name: "Selbst erzeugen (Generation Effect)",
      short: "Was du selbst formulierst oder herleitest, bleibt besser hängen als Gelesenes.",
      how: "Vor dem Nachschlagen erst selbst raten/herleiten. Zusammenfassungen aus dem Kopf schreiben statt abschreiben. Eigene Beispiele erfinden.",
      science: "Generation Effect (Slamecka & Graf 1978): aktives Erzeugen schlägt passives Aufnehmen — die Grundlage, warum „Schreibtypen\" so gut fahren.",
      inApp: "Genau dafür ist das Journal gebaut: nach jeder Session festhalten, was du gemacht hast — und beim Abruf erst schreiben, dann aufdecken.",
    },
    en: {
      name: "Generate it yourself (generation effect)",
      short: "What you formulate or derive yourself sticks better than what you read.",
      how: "Guess/derive before looking things up. Write summaries from memory instead of copying. Invent your own examples.",
      science: "The generation effect (Slamecka & Graf 1978): active production beats passive intake — the reason \"writing learners\" do so well.",
      inApp: "The journal is built for exactly this: after each session, capture what you did — and during recall, write first, reveal second.",
    },
  },
  {
    id: "protect-sleep", cat: "memory", icon: "moon", evidence: 3,
    styles: [], helps: [],
    de: {
      name: "Schlaf schützt Wissen",
      short: "Im Schlaf wird Gelerntes ins Langzeitgedächtnis überführt — Nachtschichten löschen den Gewinn.",
      how: "Vor dem Schlafen kurz wiederholen, dann schlafen. In den letzten Tagen vor der Prüfung Schlaf priorisieren statt cramming.",
      science: "Schlafabhängige Konsolidierung ist robust belegt (Walker & Stickgold 2006; Rasch & Born 2013).",
      inApp: "Kairos kennt dein Schlaffenster (Profil), meidet Ruhezeiten bei Benachrichtigungen und mahnt im Endspurt: keine Blöcke nach 22 Uhr.",
    },
    en: {
      name: "Sleep protects knowledge",
      short: "Sleep transfers what you learned into long-term memory — all-nighters erase the gain.",
      how: "Review briefly before bed, then sleep. In the final days before an exam, prioritise sleep over cramming.",
      science: "Sleep-dependent consolidation is robustly documented (Walker & Stickgold 2006; Rasch & Born 2013).",
      inApp: "Kairos knows your sleep window (profile), respects quiet hours for notifications and warns in the final stretch: no blocks after 10 pm.",
    },
  },

  // ═══ Verstehen & Verarbeiten ═══
  {
    id: "feynman", cat: "process", icon: "users", evidence: 2,
    styles: ["speak", "write", "social"], helps: [],
    de: {
      name: "Feynman-Technik",
      short: "Erkläre es so einfach, dass es ein Kind versteht — wo du stockst, ist deine Lücke.",
      how: "1) Konzept wählen. 2) In einfachsten Worten erklären (laut oder schriftlich). 3) Stocken = Lücke → nachlesen. 4) Vereinfachen und wiederholen.",
      science: "Erklären erzwingt Abruf, Elaboration und Selbstüberwachung zugleich — die Lücken werden sichtbar statt gefühlt.",
      inApp: "Erklär's dem KI-Buddy oder diktiere die Erklärung als Journal-Eintrag — Kairos legt die Lückenthemen zurück in die Abruf-Warteschlange.",
    },
    en: {
      name: "Feynman technique",
      short: "Explain it simply enough for a child — wherever you stall is your gap.",
      how: "1) Pick a concept. 2) Explain in the simplest words (aloud or written). 3) Stalling = gap → re-read. 4) Simplify and repeat.",
      science: "Explaining forces retrieval, elaboration and self-monitoring at once — gaps become visible instead of vaguely felt.",
      inApp: "Explain it to the AI buddy or dictate the explanation as a journal entry — Kairos puts gap topics back into the recall queue.",
    },
  },
  {
    id: "sq3r", cat: "process", icon: "bookOpen", evidence: 1,
    styles: ["read"], helps: ["structure"],
    de: {
      name: "SQ3R (Lesen mit System)",
      short: "Survey – Question – Read – Recite – Review: Texte aktiv statt passiv lesen.",
      how: "Erst überfliegen (Struktur), dann Fragen formulieren, dann lesen, dann aus dem Kopf wiedergeben, am Ende gezielt wiederholen.",
      science: "Bündelt bewährte Einzeleffekte (Vorwissen aktivieren, Fragen, Abruf) zu einer Lese-Routine (Robinson 1946).",
      inApp: "Lege je Kapitel eine Aufgabe mit Mini-Schritten (S/Q/R/R/R) an; deine Fragen speicherst du als Karten in der Bibliothek.",
    },
    en: {
      name: "SQ3R (systematic reading)",
      short: "Survey – Question – Read – Recite – Review: read texts actively, not passively.",
      how: "Skim first (structure), then formulate questions, then read, then reproduce from memory, finally review selectively.",
      science: "Bundles proven individual effects (activating prior knowledge, questioning, retrieval) into one reading routine (Robinson 1946).",
      inApp: "Create a task with mini-steps (S/Q/R/R/R) per chapter; store your questions as cards in the library.",
    },
  },
  {
    id: "cornell-notes", cat: "process", icon: "doc", evidence: 1,
    styles: ["write"], helps: ["structure"],
    de: {
      name: "Cornell-Notizen",
      short: "Seite dreiteilen: Notizen rechts, Stichwörter/Fragen links, Zusammenfassung unten.",
      how: "Während des Lernens rechts mitschreiben. Danach links Schlüsselfragen notieren. Zum Schluss unten in 2–3 Sätzen zusammenfassen — aus dem Kopf.",
      science: "Struktur erzwingt Nachbearbeitung und Selbstabfrage (Spalte abdecken!) statt bloßen Abschreibens (Pauk, Cornell University).",
      inApp: "Perfekt für Schreibtypen: Halte die Zusammenfassung als Journal-Eintrag fest — die Schlüsselfragen werden deine Abruf-Karten.",
    },
    en: {
      name: "Cornell notes",
      short: "Split the page: notes right, cues/questions left, summary at the bottom.",
      how: "Take notes on the right while studying. Afterwards, write key questions on the left. Finally summarise at the bottom in 2–3 sentences — from memory.",
      science: "The structure enforces post-processing and self-testing (cover the column!) instead of mere transcription (Pauk, Cornell University).",
      inApp: "Perfect for writing learners: capture the summary as a journal entry — the cue questions become your recall cards.",
    },
  },
  {
    id: "mind-mapping", cat: "process", icon: "network", evidence: 1,
    styles: ["visual"], challenges: ["dyslexia"],
    de: {
      name: "Mindmapping",
      short: "Thema in die Mitte, Äste nach außen — Zusammenhänge sehen statt Listen lesen.",
      how: "Nur Schlüsselwörter und Bilder, Farben pro Ast. Aus dem Kopf zeichnen und danach mit dem Material abgleichen — so wird es zugleich Abruf-Training.",
      science: "Räumlich-visuelle Organisation unterstützt Überblick und Assoziation; als Abruf-Übung eingesetzt deutlich wirksamer als als Abschreib-Übung.",
      inApp: "Fotografiere/lade deine Maps als Material hoch; der Lernpfad zeigt dir die Themen-Struktur deiner Prüfung als Karte.",
    },
    en: {
      name: "Mind mapping",
      short: "Topic in the centre, branches outward — see relationships instead of reading lists.",
      how: "Keywords and images only, colours per branch. Draw from memory, then compare with the material — that turns it into retrieval practice too.",
      science: "Spatial-visual organisation supports overview and association; used as a recall exercise it is far more effective than as a copying exercise.",
      inApp: "Photograph/upload your maps as material; the learning path shows your exam's topic structure as a map.",
    },
  },
  {
    id: "self-explanation", cat: "process", icon: "speech", evidence: 2,
    styles: ["speak", "write"], helps: [],
    de: {
      name: "Selbsterklären",
      short: "Bei jedem Schritt erklären, WARUM er funktioniert — nicht nur DASS er es tut.",
      how: "Beim Durcharbeiten von Beispielen laut (oder schriftlich) begründen: Warum dieser Schritt? Was wäre, wenn nicht? Wie hängt das mit dem Vorherigen zusammen?",
      science: "Self-Explanation verbessert Verständnis und Transfer messbar (Chi 1994; Bisra 2018, Meta-Analyse).",
      inApp: "Nutze das Journal nach der Session: „Was habe ich verstanden, was noch nicht?“ — der KI-Buddy stellt dir auf Wunsch die Warum-Fragen.",
    },
    en: {
      name: "Self-explanation",
      short: "At every step, explain WHY it works — not just THAT it does.",
      how: "While working through examples, justify aloud (or in writing): Why this step? What if not? How does it connect to what came before?",
      science: "Self-explanation measurably improves understanding and transfer (Chi 1994; Bisra 2018, meta-analysis).",
      inApp: "Use the journal after a session: \"What did I understand, what not yet?\" — the AI buddy will ask you the why-questions on request.",
    },
  },
  {
    id: "elaborative-interrogation", cat: "process", icon: "question", evidence: 2,
    styles: ["read", "speak"], helps: [],
    de: {
      name: "Warum-Fragen (Elaborative Interrogation)",
      short: "Zu jedem Fakt fragen: Warum ist das so? Warum gilt das hier?",
      how: "Beim Lernen Fakten nicht schlucken, sondern hinterfragen und die Antwort selbst formulieren — Verbindungen zu Bekanntem suchen.",
      science: "„Warum?\"-Fragen verknüpfen Neues mit Vorwissen; von Dunlosky 2013 als vielversprechend eingestuft.",
      inApp: "Speichere deine Warum-Fragen als Karten am Thema — sie tauchen im aktiven Abruf wieder auf.",
    },
    en: {
      name: "Why questions (elaborative interrogation)",
      short: "For every fact, ask: Why is that so? Why does it hold here?",
      how: "Don't swallow facts while studying; question them and formulate the answer yourself — look for links to what you know.",
      science: "\"Why?\" questions connect new material to prior knowledge; rated promising by Dunlosky 2013.",
      inApp: "Save your why-questions as cards on the topic — they resurface in active recall.",
    },
  },
  {
    id: "concrete-examples", cat: "process", icon: "bulb", evidence: 2,
    styles: ["do"], challenges: ["dyscalculia"],
    de: {
      name: "Konkrete Beispiele",
      short: "Jedes abstrakte Konzept an mindestens zwei konkreten Beispielen festmachen.",
      how: "Zu jeder Formel/Regel: ein durchgerechnetes Beispiel nachvollziehen, dann ein EIGENES erfinden. Beispiele mit Alltagsbezug wirken am stärksten.",
      science: "Abstraktes wird über konkrete Fälle zugänglich; besonders wirksam bei Zahlen- und Formelstoff (Learning-Scientists-Kanon).",
      inApp: "Halte je Formel-Karte in der Bibliothek ein Beispiel fest — beim Abruf rechnest du erst das Beispiel, dann die abstrakte Form.",
    },
    en: {
      name: "Concrete examples",
      short: "Anchor every abstract concept in at least two concrete examples.",
      how: "For each formula/rule: follow one worked example, then invent your OWN. Everyday-life examples work best.",
      science: "The abstract becomes accessible via concrete cases; especially effective for numbers and formulas (Learning Scientists canon).",
      inApp: "Keep an example on each formula card in the library — during recall, work the example first, then the abstract form.",
    },
  },
  {
    id: "movement-learning", cat: "process", icon: "walk", evidence: 1, adhd: true,
    styles: ["move", "listen", "speak"], challenges: ["dyslexia"],
    de: {
      name: "Lernen in Bewegung",
      short: "Beim Gehen wiederholen, mit Gesten verknüpfen, im Stehen lernen.",
      how: "Vokabeln/Definitionen beim Spazieren laut aufsagen (oder als Audio anhören), Abläufe mit Gesten koppeln, zwischen Blöcken bewegen.",
      science: "Moderate Bewegung kann Aufmerksamkeit und Enkodierung unterstützen (Embodied Cognition; Bewegungspausen-Forschung) — und macht Wiederholen erträglicher.",
      inApp: "Plane Bewegungs-Blöcke als eigene Aufgaben ein; in den Pausen erinnert dich Kairos ans Aufstehen statt ans Handy.",
    },
    en: {
      name: "Learning in motion",
      short: "Review while walking, link with gestures, study standing up.",
      how: "Recite vocabulary/definitions aloud while walking (or listen as audio), couple procedures with gestures, move between blocks.",
      science: "Moderate movement can support attention and encoding (embodied cognition; movement-break research) — and makes reviewing more bearable.",
      inApp: "Schedule movement blocks as their own tasks; during breaks Kairos nudges you to stand up instead of reaching for the phone.",
    },
  },

  // ═══ Planung & Dranbleiben ═══
  {
    id: "implementation-intentions", cat: "plan", icon: "link", evidence: 3,
    styles: [], challenges: ["procrastination"], helps: ["structure"],
    de: {
      name: "Wenn-Dann-Pläne",
      short: "„Wenn Situation X eintritt, dann tue ich Y“ — vorab entschieden, nicht im Moment.",
      how: "Konkret formulieren: „Wenn ich um 14 Uhr den Tee aufgesetzt habe, DANN öffne ich die Bio-Zusammenfassung.“ Auslöser + Handlung, beides präzise.",
      science: "Eine der stärksten Selbststeuerungs-Techniken überhaupt (Gollwitzer & Sheeran 2006, Meta-Analyse: mittlerer bis großer Effekt).",
      inApp: "Getimte Blöcke auf „Heute“ sind deine Wenn-Dann-Anker — die Erinnerung kurz vor Start liefert den Auslöser gleich mit.",
    },
    en: {
      name: "If-then plans (implementation intentions)",
      short: "\"If situation X occurs, then I do Y\" — decided in advance, not in the moment.",
      how: "Be concrete: \"If I've put the kettle on at 2 pm, THEN I open the biology summary.\" Trigger + action, both precise.",
      science: "One of the strongest self-regulation techniques known (Gollwitzer & Sheeran 2006, meta-analysis: medium-to-large effect).",
      inApp: "Timed blocks on \"Today\" are your if-then anchors — the reminder just before the start delivers the trigger for you.",
    },
  },
  {
    id: "five-minute-start", cat: "plan", icon: "play", evidence: 2, adhd: true,
    styles: [], challenges: ["procrastination", "adhd"],
    de: {
      name: "5-Minuten-Start",
      short: "Nur 5 Minuten anfangen — aufhören ist danach ausdrücklich erlaubt.",
      how: "Timer auf 5 Minuten, kleinstmöglicher erster Schritt (Datei öffnen, eine Zeile lesen). Meistens trägt der Schwung weiter; wenn nicht, war es trotzdem ein Erfolg.",
      science: "Senkt die Starthürde radikal — Prokrastination hängt an der Aufgaben-Aversion des Anfangens, selten am Durchhalten (Zeigarnik-Effekt hilft nach dem Start).",
      inApp: "Der Fokus-Start zählt jede Minute; auch eine 5-Minuten-Session landet als Erfolg im Journal und in deiner Serie.",
    },
    en: {
      name: "5-minute start",
      short: "Start for just 5 minutes — stopping afterwards is explicitly allowed.",
      how: "Timer to 5 minutes, smallest possible first step (open the file, read one line). Usually momentum carries you on; if not, it still counts as a win.",
      science: "Radically lowers the entry barrier — procrastination lives in the aversion of starting, rarely in persisting (the Zeigarnik effect helps once started).",
      inApp: "Focus start counts every minute; even a 5-minute session lands in the journal and your streak as a win.",
    },
  },
  {
    id: "two-minute-rule", cat: "plan", icon: "zap", evidence: 1,
    styles: [], challenges: ["procrastination"],
    de: {
      name: "2-Minuten-Regel",
      short: "Dauert es unter 2 Minuten? Sofort machen statt verwalten.",
      how: "Kleinkram (E-Mail, Blatt abheften, Frage notieren) direkt erledigen — jede Verwaltung kostet mehr als die Sache selbst.",
      science: "Aus GTD (David Allen); reduziert die offene-Schleifen-Last im Kopf, die Konzentration frisst.",
      inApp: "Was in keiner 2 Minuten passt, wird eine Aufgabe — der Rest gehört gar nicht erst auf die Liste.",
    },
    en: {
      name: "2-minute rule",
      short: "Takes under 2 minutes? Do it now instead of managing it.",
      how: "Handle small stuff (email, filing a sheet, noting a question) immediately — managing it costs more than doing it.",
      science: "From GTD (David Allen); reduces the open-loop load that eats concentration.",
      inApp: "Anything over 2 minutes becomes a task — the rest never belongs on the list at all.",
    },
  },
  {
    id: "eat-the-frog", cat: "plan", icon: "flag", evidence: 1,
    styles: [], challenges: ["procrastination"], helps: ["deadlines"],
    de: {
      name: "Eat the Frog",
      short: "Das unangenehmste (wichtigste) To-do zuerst — solange die Energie hoch ist.",
      how: "Am Vorabend den „Frosch“ festlegen. Morgens als ersten Fokus-Block einplanen, bevor Kleinkram den Tag frisst.",
      science: "Nutzt das Energie-Hoch des persönlichen Chronotyps und beseitigt den Stressor, der sonst den ganzen Tag im Hintergrund nagt (Brian Tracy).",
      inApp: "Gib der Aufgabe Priorität 1 und einen frühen Slot — Kairos sortiert sie in „Jetzt dran“ nach vorn und kennt dein Energie-Hoch aus dem Chronotyp.",
    },
    en: {
      name: "Eat the frog",
      short: "The most unpleasant (most important) to-do first — while energy is high.",
      how: "Choose the \"frog\" the night before. Schedule it as the first focus block in the morning, before small stuff eats the day.",
      science: "Uses your chronotype's energy peak and removes the stressor that would otherwise gnaw in the background all day (Brian Tracy).",
      inApp: "Give the task priority 1 and an early slot — Kairos sorts it to the front of \"Right now\" and knows your energy peak from your chronotype.",
    },
  },
  {
    id: "micro-steps", cat: "plan", icon: "stairs", evidence: 2, adhd: true,
    styles: [], challenges: ["adhd", "overwhelm", "dyscalculia"],
    de: {
      name: "Mini-Schritte",
      short: "Aufgaben so klein schneiden, dass der nächste Schritt keine Überwindung mehr braucht.",
      how: "„Kapitel 3 lernen“ wird: PDF öffnen → Überschriften lesen → 1 Absatz zusammenfassen → … Jeder Schritt einzeln abhakbar.",
      science: "Kleine Einheiten liefern häufige Erfolgserlebnisse (Dopamin!) und machen Fortschritt sichtbar — zentral bei ADHS und Überforderung.",
      inApp: "Jede Aufgabe hat Unterschritte; rutscht etwas immer wieder, schlägt Kairos von selbst vor, es kleiner zu schneiden.",
    },
    en: {
      name: "Micro-steps",
      short: "Cut tasks so small that the next step needs no willpower.",
      how: "\"Learn chapter 3\" becomes: open PDF → read headings → summarise 1 paragraph → … Each step individually checkable.",
      science: "Small units deliver frequent wins (dopamine!) and make progress visible — central for ADHD and overwhelm.",
      inApp: "Every task has sub-steps; if something keeps slipping, Kairos itself suggests cutting it smaller.",
    },
  },
  {
    id: "habit-stacking", cat: "plan", icon: "bricks", evidence: 1,
    styles: [], helps: ["structure"],
    de: {
      name: "Habit Stacking",
      short: "Neue Lerngewohnheit an eine bestehende Routine koppeln.",
      how: "„Nach dem Frühstückskaffee lerne ich 10 Vokabeln.“ Die bestehende Gewohnheit ist der Auslöser — kein Erinnern nötig.",
      science: "Gewohnheiten entstehen über stabile Kontext-Auslöser (Wood & Neal 2007; populär: James Clear) — der Stack liefert den Auslöser gratis.",
      inApp: "Lege wiederkehrende Aufgaben (täglich/wochentags) zur immer gleichen Uhrzeit an — Kairos hält die Kette sichtbar in deiner Serie.",
    },
    en: {
      name: "Habit stacking",
      short: "Attach a new study habit to an existing routine.",
      how: "\"After my breakfast coffee I learn 10 vocab words.\" The existing habit is the trigger — no remembering needed.",
      science: "Habits form via stable context triggers (Wood & Neal 2007; popularised by James Clear) — the stack supplies the trigger for free.",
      inApp: "Create recurring tasks (daily/weekdays) at the same time every day — Kairos keeps the chain visible in your streak.",
    },
  },
  {
    id: "reward-pairing", cat: "plan", icon: "trophy", evidence: 1, adhd: true,
    styles: [], challenges: ["adhd"], helps: ["rewards"],
    de: {
      name: "Belohnungs-Kopplung",
      short: "Direkt nach dem Block eine kleine, vorher festgelegte Belohnung.",
      how: "Belohnung VOR dem Block festlegen (Serie, Snack, 10 min Handy) und sofort nach Abschluss einlösen — nicht „irgendwann“.",
      science: "Das ADHS-Belohnungssystem reagiert stärker auf unmittelbare als auf ferne Belohnungen — die Kopplung holt die Motivation in die Gegenwart.",
      inApp: "Tagesziel-Ring, Serie und der Tagesabschluss feiern jeden Fortschritt sofort — häng deine private Belohnung an den Pausen-Gong.",
    },
    en: {
      name: "Reward pairing",
      short: "A small, pre-agreed reward right after the block.",
      how: "Set the reward BEFORE the block (episode, snack, 10 min of phone) and redeem immediately after finishing — not \"sometime\".",
      science: "The ADHD reward system responds far more to immediate than distant rewards — pairing pulls motivation into the present.",
      inApp: "The daily goal ring, streak and day wrap-up celebrate every win instantly — attach your private reward to the break chime.",
    },
  },
  {
    id: "energy-mapping", cat: "plan", icon: "battery", evidence: 1,
    styles: [], helps: ["structure"],
    de: {
      name: "Energie-Landkarte (Chronotyp)",
      short: "Schweres in die persönlichen Hoch-Phasen legen, Leichtes in die Tiefs.",
      how: "Eine Woche beobachten: Wann fällt Denken leicht? Schwere Themen in die Hochs, Wiederholung/Organisation in die Tiefs legen.",
      science: "Leistungsfähigkeit schwankt zirkadian und individuell (Chronotyp-Forschung, z. B. Roenneberg); „synchrone“ Zeiten verbessern komplexe Leistung.",
      inApp: "Kairos kennt deinen Chronotyp und deine Readiness (Wearable) — die Tageskapazität passt sich an, statt jeden Tag gleich viel zu fordern.",
    },
    en: {
      name: "Energy map (chronotype)",
      short: "Put hard material into your personal peaks, easy stuff into the dips.",
      how: "Observe for a week: when does thinking come easily? Schedule hard topics into peaks, review/organisation into dips.",
      science: "Performance varies circadianly and individually (chronotype research, e.g. Roenneberg); \"synchronous\" times improve complex performance.",
      inApp: "Kairos knows your chronotype and readiness (wearable) — daily capacity adapts instead of demanding the same every day.",
    },
  },
];

// ── Zugriff & Empfehlung ────────────────────────────────────────────────
const byId = new Map(METHODS.map((m) => [m.id, m]));

export function getMethod(id) {
  return byId.get(id) || null;
}

// Piktogramm einer Methode als Icon-NAME (kein Markup!) — diese Datei läuft
// auch im Server und darf deshalb nicht aus web/js/icons.js importieren.
// Die Aufrufer setzen den Namen selbst in icon(...) ein.
// Ein einziger Fallback für alle Ansichten: eigenes Icon → Kategorie-Icon →
// "book". Vorher fiel das Wissen auf die Kategorie zurück, das Onboarding auf
// gar nichts — dieselbe Methode sah je Ansicht anders aus.
export function methodIcon(m) {
  if (!m) return "book";
  return m.icon || METHOD_CATEGORIES.find((c) => c.id === m.cat)?.icon || "book";
}

// Sprachfelder einer Methode ("de"/"en", Fallback en→de damit nie leer).
export function methodText(m, lang = "de") {
  if (!m) return null;
  return m[lang] || m.de || m.en;
}

// Methoden mit Timer-Preset (Timer-Modi).
export function timerMethods() {
  return METHODS.filter((m) => m.preset);
}

// Empfehlung aus dem Lernprofil: Punktzahl = Evidenz + Treffer auf Stile/
// Herausforderungen/Hilfen (+ADHS-Bonus). Liefert ALLE Methoden absteigend
// sortiert mit score + reasons (Schlüssel der Treffer) — die UI zeigt z. B. Top 6.
export function suggestMethods({ styles = [], challenges = [], helps = [] } = {}) {
  const S = new Set(styles), C = new Set(challenges), H = new Set(helps);
  return METHODS.map((m) => {
    let score = m.evidence;
    const reasons = [];
    for (const s of m.styles || []) if (S.has(s)) { score += 2; reasons.push("style:" + s); }
    for (const c of m.challenges || []) if (C.has(c)) { score += 2; reasons.push("challenge:" + c); }
    for (const h of m.helps || []) if (H.has(h)) { score += 1; reasons.push("help:" + h); }
    if (m.adhd && C.has("adhd")) { score += 1; if (!reasons.includes("challenge:adhd")) reasons.push("challenge:adhd"); }
    return { id: m.id, score, reasons };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

// Standard-Auswahl, falls (noch) kein Lernprofil existiert: die drei
// best-belegten Alltags-Methoden + Pomodoro als bekannter Einstieg.
export const DEFAULT_METHOD_IDS = ["pomodoro", "spaced-repetition", "active-recall", "micro-steps"];
