#!/usr/bin/env node
// Beispieldaten-Generator: füllt die lokale Datenbank mit einem vollständigen,
// in sich stimmigen Studien-Semester — damit sich JEDE Ansicht mit echten Kurven
// zeigt (Pace-Lernen, Insights, Streak, Readiness, Zeitstrahl, Bibliothek, SRS).
//
// Grundsätze:
//   · Deterministisch (fester Seed) → derselbe Datensatz bei jedem Lauf.
//   · Konsistent: daily_metrics werden AUS den Sessions summiert, Task-spent_ms
//     aus denselben Sessions — keine widersprüchlichen Zahlen in der UI.
//   · Realistisch: Ist/Soll-Verhältnisse steigen mit der Schwierigkeit (klassische
//     Konzentration-Unterschätzung) und verbessern sich über die Zeit leicht → das
//     Pace-Lernen (shared/pace.js) zeigt sichtbar unterschiedliche Faktoren.
//   · Additiv per Default: löscht NICHTS, ohne dass --reset gesetzt ist.
//   · Backup: vor jedem Schreiben wird die DB-Datei kopiert.
//
// Aufruf:
//   node scripts/seed-demo.mjs                     # in das zuletzt genutzte Konto
//   node scripts/seed-demo.mjs --email a@b.de      # in ein bestimmtes Konto (legt es an)
//   node scripts/seed-demo.mjs --reset             # Inhalte des Kontos vorher löschen
//   node scripts/seed-demo.mjs --days 120          # längere Historie
import { copyFileSync, existsSync } from "node:fs";
import { getDb, DB_PATH } from "../server/db.js";
import { expandEvents } from "../shared/icsParse.js";
import { nextFreeSlot, DAY_START_MIN, DAY_END_MIN } from "../shared/daySchedule.js";

// ── Argumente ────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const RESET = argv.includes("--reset");
const EMAIL = argOf("--email");
const DAYS = Math.max(21, Number(argOf("--days", 84)) || 84);
const SEED = Number(argOf("--seed", 20260801)) || 20260801;

// ── Deterministischer Zufall ─────────────────────
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const rfloat = (lo, hi) => lo + rnd() * (hi - lo);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

// ── Kalender-Mathematik (lokale Zeit) ────────────
const pad2 = (n) => String(n).padStart(2, "0");
const dayKeyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const dayAt = (offset) => { const d = new Date(TODAY); d.setDate(d.getDate() + offset); return d; };
const keyAt = (offset) => dayKeyOf(dayAt(offset));
const msAt = (offset, minOfDay = 0) => {
  const d = dayAt(offset);
  d.setMinutes(minOfDay);
  return d.getTime();
};
const weekdayAt = (offset) => dayAt(offset).getDay();          // 0 = So
const isWeekend = (offset) => [0, 6].includes(weekdayAt(offset));
const NOW = Date.now();
const nowMinOfDay = new Date().getHours() * 60 + new Date().getMinutes();

// ── Nutzer bestimmen ─────────────────────────────
const db = getDb();   // legt/migriert das Schema (Wave 1–6)

function resolveUser() {
  if (EMAIL) {
    const mail = EMAIL.trim().toLowerCase();
    const found = db.prepare("SELECT id, email FROM users WHERE email = ?").get(mail);
    if (found) return found;
    db.prepare("INSERT INTO users (email, verified, created_at) VALUES (?, 1, ?)").run(mail, NOW);
    return db.prepare("SELECT id, email FROM users WHERE email = ?").get(mail);
  }
  // Ohne Angabe: das zuletzt benutzte Konto (jüngste Sitzung), sonst das neueste.
  const bySession = db.prepare(`
    SELECT u.id, u.email FROM users u JOIN auth_sessions s ON s.user_id = u.id
    ORDER BY s.created_at DESC LIMIT 1
  `).get();
  if (bySession) return bySession;
  const newest = db.prepare("SELECT id, email FROM users ORDER BY id DESC LIMIT 1").get();
  if (newest) return newest;
  db.prepare("INSERT INTO users (email, verified, created_at) VALUES ('demo@kairos.local', 1, ?)").run(NOW);
  return db.prepare("SELECT id, email FROM users WHERE email = 'demo@kairos.local'").get();
}

const user = resolveUser();
const U = user.id;
db.prepare("INSERT OR IGNORE INTO settings (user_id) VALUES (?)").run(U);
db.prepare("INSERT OR IGNORE INTO timer_state (user_id, remaining_ms) VALUES (?, 1500000)").run(U);
db.prepare("INSERT OR IGNORE INTO profile (user_id) VALUES (?)").run(U);

// Läuft parallel ein Server, hält der kurzzeitig die Schreibsperre → warten
// statt sofort scheitern.
db.exec("PRAGMA busy_timeout = 15000");

// ── Backup ───────────────────────────────────────
// WAL nach Möglichkeit in die Hauptdatei schreiben; gelingt das nicht (fremde
// Verbindung offen), werden -wal/-shm mitkopiert — sonst wäre das Backup
// unvollständig, weil die jüngsten Änderungen NUR im WAL stehen.
if (existsSync(DB_PATH)) {
  try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* Server hält die Datei */ }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");
  const backup = `${DB_PATH}.pre-seed-${stamp}`;
  copyFileSync(DB_PATH, backup);
  for (const suffix of ["-wal", "-shm"]) {
    if (existsSync(DB_PATH + suffix)) copyFileSync(DB_PATH + suffix, backup + suffix);
  }
  console.log(`  Backup:  ${backup}`);
}

// ═════════════════ Inhalte (Fachwissen) ═════════════════
// Prüfungen relativ zu heute. Eine vergangene, archivierte für die Historie.
const EXAMS = [
  { key: "ti", name: "Theoretische Informatik", days: 18, hours: 60, color: "#3E7D5E", subject: "Informatik" },
  { key: "bio", name: "Biochemie I", days: 32, hours: 75, color: "#C89A4C", subject: "Biochemie" },
  { key: "ru", name: "Russisch A2", days: 9, hours: 25, color: "#7C9AC2", subject: "Russisch" },
];
const MODULE_KEYS = new Set(EXAMS.map((e) => e.key));
const MODULE_SUBJECTS = new Set(EXAMS.map((e) => e.subject));

// [Text, Confidence 0..3, done] — Confidence steuert Lernpfad, SRS und Einschätzung.
const TOPICS = {
  ti: [
    ["Reguläre Sprachen & DFA/NFA", 3, 1], ["Potenzmengenkonstruktion", 3, 1],
    ["Pumping-Lemma (regulär)", 2, 0], ["Kontextfreie Grammatiken", 2, 0],
    ["Kellerautomaten (PDA)", 1, 0], ["CYK-Algorithmus", 1, 0],
    ["Chomsky-Normalform", 2, 0], ["Turingmaschinen", 1, 0],
    ["Entscheidbarkeit & Halteproblem", 0, 0], ["Reduktionen", 0, 0],
    ["Komplexität P vs NP", 0, 0], ["NP-Vollständigkeit", 0, 0],
  ],
  bio: [
    ["Glykolyse", 3, 1], ["Citratzyklus", 2, 0], ["Atmungskette & ATP-Synthase", 2, 0],
    ["Enzymkinetik (Michaelis-Menten)", 1, 0], ["Aminosäuren & Proteinstruktur", 2, 0],
    ["Membrantransport", 1, 0], ["Signaltransduktion", 0, 0],
    ["Fettsäure-Oxidation", 0, 0], ["Gluconeogenese", 1, 0],
    ["Pentosephosphatweg", 0, 0], ["Harnstoffzyklus", 0, 0],
  ],
  ru: [
    ["Kyrillisch schreiben", 3, 1], ["Präpositiv & Akkusativ", 2, 0],
    ["Verben der Bewegung", 1, 0], ["Aspekt (perfektiv/imperfektiv)", 0, 0],
    ["Zahlen & Zeitangaben", 2, 0], ["Alltagsdialoge A2", 2, 0],
    ["Hörverstehen A2", 1, 0], ["Wortschatz Familie & Beruf", 3, 1],
  ],
  tib: [
    ["Tibetische Schrift (Uchen)", 2, 0], ["Silbenstruktur & Vokalzeichen", 1, 0],
    ["Grundwortschatz 300", 1, 0], ["Ehrensprache (Zhe-sa)", 0, 0],
    ["Buddhistische Grundbegriffe", 1, 0], ["Aussprache & Töne", 2, 0],
  ],
  emb: [
    ["GPIO & Register", 2, 0], ["Interrupts & ISR", 1, 0], ["Timer & PWM", 1, 0],
    ["UART / SPI / I²C", 0, 0], ["RTOS-Grundlagen", 0, 0],
    ["Stromsparmodi", 0, 0], ["Debugging mit JTAG", 1, 0],
  ],
  ana: [
    ["Folgen & Grenzwerte", 3, 1], ["Stetigkeit", 3, 1], ["Differentialrechnung", 3, 1],
    ["Integralrechnung", 2, 1], ["Reihen & Konvergenzkriterien", 2, 1],
  ],
};

// Lern-Ressourcen: [Themenname, Titel, URL, kind, Bericht/Zusammenfassung, primär]
// Der Bericht macht Material über die Lern-Suche auffindbar (shared/learnOptions.js).
const RESOURCES = [
  ["Kellerautomaten (PDA)", "PDA — NotebookLM Audio-Overview", "https://notebooklm.google.com/notebook/pda-ti", "notebooklm",
    "Zusammenfassung: Kellerautomat = endlicher Automat + Stack. Akzeptanz per Endzustand ODER leerem Keller (äquivalent). Deterministische PDA sind ECHT schwächer als nichtdeterministische. Konstruktion Grammatik → PDA über Ableitungssimulation auf dem Stack.", 1],
  ["Kellerautomaten (PDA)", "Kellerautomaten erklärt (45 min)", "https://www.youtube.com/watch?v=demo-pda", "video",
    "Videomitschrift: Übergangsrelation δ(q,a,X) → (p,γ), Beispiel a^n b^n, Umwandlung CFG↔PDA, typische Klausurfalle: Stack-Boden-Symbol nicht vergessen.", 0],
  ["Kellerautomaten (PDA)", "Skript Kap. 4 — Kellerautomaten", "https://uni.example.edu/ti/skript-kap4.pdf", "pdf",
    "Vorlesungsskript: formale Definition, Beispiele, Satz von Chomsky-Schützenberger, Übungsaufgaben 4.1–4.9 mit Lösungen ab S. 62.", 0],
  ["Turingmaschinen", "Turingmaschinen — NotebookLM Bericht", "https://notebooklm.google.com/notebook/tm-ti", "notebooklm",
    "Bericht: Band, Kopf, Übergangsfunktion. Varianten (Mehrband, nichtdeterministisch) sind äquivalent zur Standard-TM. Church-Turing-These. Universelle TM als Grundlage für das Halteproblem.", 1],
  ["Turingmaschinen", "TM-Simulator (interaktiv)", "https://turingmachine.io/", "link",
    "Interaktiver Simulator: eigene Zustandsdiagramme bauen und Schritt für Schritt laufen lassen. Gut zum Prüfen der eigenen Klausur-Konstruktionen.", 0],
  ["Entscheidbarkeit & Halteproblem", "Halteproblem — Beweis nachvollzogen", "https://uni.example.edu/ti/halteproblem.pdf", "pdf",
    "Diagonalisierungsbeweis Schritt für Schritt. Unterschied entscheidbar / semi-entscheidbar / co-semi-entscheidbar. Satz von Rice als Verallgemeinerung.", 1],
  ["Pumping-Lemma (regulär)", "Pumping-Lemma Anki-Deck", "https://ankiweb.net/shared/info/demo-pumping", "anki",
    "42 Karten: Formulierung, Beweisstruktur als Spiel (Gegner wählt n, ich wähle w), 12 durchgerechnete Nicht-Regularitätsbeweise.", 1],
  ["Komplexität P vs NP", "P vs NP — Übersicht", "https://uni.example.edu/ti/komplexitaet.pdf", "pdf",
    "Definition P, NP, NP-schwer, NP-vollständig. Polynomialzeitreduktion. SAT als erstes NP-vollständiges Problem (Cook-Levin). Standard-Reduktionskette SAT → 3SAT → Clique → VertexCover.", 1],
  ["Glykolyse", "Glykolyse — 10 Schritte (Video)", "https://www.youtube.com/watch?v=demo-glyko", "video",
    "Alle 10 Enzymschritte, ATP-Bilanz netto +2 ATP +2 NADH, Regulationspunkte Hexokinase / PFK-1 / Pyruvatkinase.", 1],
  ["Citratzyklus", "Citratzyklus — NotebookLM Overview", "https://notebooklm.google.com/notebook/citrat-bio", "notebooklm",
    "Zusammenfassung: 8 Schritte, Bilanz pro Acetyl-CoA: 3 NADH, 1 FADH2, 1 GTP, 2 CO2. Regulation über Isocitrat-Dehydrogenase (ADP aktiviert, ATP/NADH hemmen). Anaplerotische Reaktionen.", 1],
  ["Enzymkinetik (Michaelis-Menten)", "Michaelis-Menten Rechenübungen", "https://uni.example.edu/bio/enzymkinetik-uebung.pdf", "pdf",
    "Herleitung v = vmax·[S]/(Km+[S]), Lineweaver-Burk-Auftragung, kompetitive vs. nichtkompetitive Hemmung im Diagramm unterscheiden. 15 Rechenaufgaben mit Lösungsweg.", 1],
  ["Atmungskette & ATP-Synthase", "Atmungskette Anki", "https://ankiweb.net/shared/info/demo-atmung", "anki",
    "60 Karten: Komplexe I–IV, Protonengradient, chemiosmotische Kopplung, Entkoppler (DNP, Thermogenin), Hemmstoffe (Rotenon, Antimycin, Cyanid).", 1],
  ["Aminosäuren & Proteinstruktur", "Die 20 Aminosäuren — Merkblatt", "https://uni.example.edu/bio/aminosaeuren.pdf", "pdf",
    "Strukturformeln, Einteilung nach Seitenkette (unpolar / polar / sauer / basisch), essentielle AS, pKa-Werte und isoelektrischer Punkt.", 1],
  ["Signaltransduktion", "Second Messenger — Überblick", "https://uni.example.edu/bio/signaltransduktion.pdf", "pdf",
    "G-Protein-gekoppelte Rezeptoren, cAMP/PKA-Weg, IP3/DAG, Tyrosinkinase-Rezeptoren, MAPK-Kaskade. Vergleichstabelle der Wege.", 1],
  ["Membrantransport", "Transportmechanismen (Video)", "https://www.youtube.com/watch?v=demo-membran", "video",
    "Passive Diffusion, erleichterte Diffusion, primär/sekundär aktiver Transport, Na⁺/K⁺-ATPase im Detail, Symport vs. Antiport.", 1],
  ["Verben der Bewegung", "Идти/ходить — Übungsblatt", "https://ru.example.edu/verben-bewegung.pdf", "pdf",
    "Unidirektional vs. multidirektional, Präfixe по-, при-, у-, вы-, Beispielsätze mit Übersetzung, 30 Lückensätze.", 1],
  ["Aspekt (perfektiv/imperfektiv)", "Aspekt verstehen — NotebookLM", "https://notebooklm.google.com/notebook/aspekt-ru", "notebooklm",
    "Bericht: Der Aspekt ist keine Zeit, sondern Sichtweise. Imperfektiv = Prozess/Wiederholung, perfektiv = Resultat/Einmaligkeit. Signalwörter обычно, часто vs. вдруг, уже.", 1],
  ["Alltagsdialoge A2", "Russisch A2 Hörtexte", "https://ru.example.edu/hoertexte-a2", "link",
    "20 Hörtexte mit Transkript: Einkaufen, Arzttermin, Wegbeschreibung, Restaurant. Jeweils Aufgaben zum Hörverstehen.", 1],
  ["Kyrillisch schreiben", "Kyrillisch Schreibschrift-Trainer", "https://ru.example.edu/schreibschrift", "link",
    "Handschrift-Vorlagen für alle 33 Buchstaben, häufige Verwechslungen (т/м, д/g) und Verbindungsregeln.", 1],
  ["Tibetische Schrift (Uchen)", "Uchen Schrift — Grundkurs", "https://tib.example.edu/uchen-kurs", "link",
    "30 Grundbuchstaben, Aufbau der Silbe (Wurzelbuchstabe + Präfix/Suffix), Vokalzeichen über und unter der Zeile.", 1],
  ["Buddhistische Grundbegriffe", "Glossar Buddhismus (Tibetisch–Deutsch)", "https://tib.example.edu/glossar", "link",
    "Zentrale Begriffe mit Wylie-Transliteration: Dharma, Karma, Bodhicitta, Shunyata, Samsara — je mit tibetischer Schrift und Aussprache.", 1],
  ["Grundwortschatz 300", "Tibetisch Grundwortschatz Anki", "https://ankiweb.net/shared/info/demo-tibetisch", "anki",
    "300 Karten Grundwortschatz A1–A2, sortiert nach Themenfeldern, mit Audio der Aussprache.", 1],
  ["Interrupts & ISR", "Interrupts auf STM32 — Praxis", "https://emb.example.edu/interrupts.pdf", "pdf",
    "NVIC-Konfiguration, Prioritäten und Preemption, typische Fehler: nicht-atomarer Zugriff auf geteilte Variablen, volatile vergessen, zu lange ISR.", 1],
  ["Timer & PWM", "PWM Grundlagen (Video)", "https://www.youtube.com/watch?v=demo-pwm", "video",
    "Prescaler und Auto-Reload berechnen, Duty-Cycle, Servo-Ansteuerung, Frequenzwahl bei Motoren vs. LEDs.", 1],
  ["GPIO & Register", "Register-Zugriff Cheat-Sheet", "https://emb.example.edu/gpio-register.pdf", "pdf",
    "Bit-Manipulation mit |=, &= ~, ^=, Pull-up/Pull-down, Open-Drain, Alternate Function Mapping.", 1],
];

// Bibliothek (Wave 6): Karten mit Formeln/Regeln + Links + kleine Dateien.
const CARDS = [
  ["Michaelis-Menten", "Biochemie", "Enzymkinetik (Michaelis-Menten)",
    "**v = (v_max · [S]) / (K_m + [S])**\n\n· K_m = Substratkonzentration bei halbmaximaler Geschwindigkeit\n· Kleines K_m ⇒ hohe Affinität\n· Kompetitive Hemmung: K_m ↑, v_max unverändert\n· Nichtkompetitive Hemmung: v_max ↓, K_m unverändert"],
  ["ATP-Bilanz Glucose", "Biochemie", "Glykolyse",
    "Vollständige Oxidation von 1 Glucose:\n· Glykolyse: 2 ATP + 2 NADH\n· Pyruvat→Acetyl-CoA: 2 NADH\n· Citratzyklus: 6 NADH + 2 FADH₂ + 2 GTP\n· **Gesamt ≈ 30–32 ATP**"],
  ["Pumping-Lemma (regulär)", "Informatik", "Pumping-Lemma (regulär)",
    "∀ reguläre L ∃ n ∀ w∈L mit |w|≥n ∃ x,y,z:\nw = xyz, |xy| ≤ n, |y| ≥ 1, ∀ i≥0: xyⁱz ∈ L\n\n**Beweisstruktur als Spiel:** Gegner wählt n → ich wähle w → Gegner zerlegt → ich wähle i (meist i=0 oder 2)."],
  ["Chomsky-Hierarchie", "Informatik", "Chomsky-Normalform",
    "| Typ | Sprache | Automat |\n|---|---|---|\n| 3 | regulär | DFA/NFA |\n| 2 | kontextfrei | PDA |\n| 1 | kontextsensitiv | LBA |\n| 0 | rekursiv aufzählbar | TM |"],
  ["Russische Fälle — Übersicht", "Russisch", "Präpositiv & Akkusativ",
    "· **Nominativ** — кто? что?\n· **Genitiv** — кого? чего? (Verneinung, Mengen, нет)\n· **Dativ** — кому? чему? (Empfänger, нравиться)\n· **Akkusativ** — кого? что? (direktes Objekt, в/на + Richtung)\n· **Instrumental** — кем? чем? (Mittel, с + Begleitung)\n· **Präpositiv** — о ком? где? (в/на + Ort)"],
  ["Verben der Bewegung", "Russisch", "Verben der Bewegung",
    "идти = einmalig, in eine Richtung · ходить = wiederholt / hin und zurück\nехать / ездить = mit Fahrzeug\n\nПрефикс ändert Bedeutung: **при**йти = ankommen, **у**йти = weggehen, **вы**йти = hinausgehen."],
  ["Tibetische Silbenstruktur", "Tibetisch", "Silbenstruktur & Vokalzeichen",
    "Silbe = (Präfix) + **Wurzelbuchstabe** + (Suffix) + (Post-Suffix)\nVokalzeichen: ི (i), ུ (u), ེ (e), ོ (o) — Standard ist a ohne Zeichen.\nDer Wurzelbuchstabe trägt den Ton."],
  ["Bit-Manipulation C", "Embedded", "GPIO & Register",
    "```c\nREG |=  (1u << n);   // Bit setzen\nREG &= ~(1u << n);   // Bit löschen\nREG ^=  (1u << n);   // Bit umschalten\nif (REG & (1u << n)) // Bit testen\n```\nGeteilte Variablen in ISR **immer** `volatile`."],
  ["Ableitungsregeln", "Mathematik", "Differentialrechnung",
    "· Produkt: (uv)' = u'v + uv'\n· Quotient: (u/v)' = (u'v − uv')/v²\n· Kette: f(g(x))' = f'(g(x))·g'(x)\n· (eˣ)' = eˣ · (ln x)' = 1/x · (sin x)' = cos x"],
  ["Konvergenzkriterien", "Mathematik", "Reihen & Konvergenzkriterien",
    "· **Quotientenkriterium**: lim |aₙ₊₁/aₙ| < 1 ⇒ konvergent\n· **Wurzelkriterium**: lim ⁿ√|aₙ| < 1 ⇒ konvergent\n· **Leibniz**: alternierend + monoton fallende Nullfolge ⇒ konvergent\n· Notwendig (nicht hinreichend): aₙ → 0"],
];

const LIB_LINKS = [
  ["Altklausuren-Sammlung TI (2019–2025)", "Informatik", "https://uni.example.edu/ti/altklausuren", "ti"],
  ["Formelsammlung Biochemie (offiziell)", "Biochemie", "https://uni.example.edu/bio/formelsammlung.pdf", "bio"],
  ["Wiktionary Russisch — Deklinationstabellen", "Russisch", "https://ru.wiktionary.org/", "ru"],
  ["Tibetan Dictionary (THL)", "Tibetisch", "https://www.thlib.org/reference/dictionaries/", "tib"],
  ["STM32 Reference Manual RM0090", "Embedded", "https://emb.example.edu/rm0090.pdf", "emb"],
  ["Übungsblätter Analysis I (Archiv)", "Mathematik", "https://uni.example.edu/ana/uebungen", "ana"],
];

const FILES = [
  ["Spickzettel TI — Automaten.md", "Informatik", "ti",
    "# Spickzettel Automaten\n\n## DFA → NFA → reguläre Grammatik\nÄquivalent, Potenzmengenkonstruktion kostet exponentiell viele Zustände.\n\n## Abschlusseigenschaften regulärer Sprachen\nVereinigung, Schnitt, Komplement, Konkatenation, Kleene-Stern — alle abgeschlossen.\n\n## Kontextfrei\nAbgeschlossen unter Vereinigung, Konkatenation, Stern — NICHT unter Schnitt und Komplement.\n\n## Merksatz Klausur\nErst Sprache verstehen, dann Automat bauen, zuletzt formal aufschreiben.\n"],
  ["Lernplan Biochemie.md", "Biochemie", "bio",
    "# Lernplan Biochemie I\n\n1. Woche: Glykolyse + Citratzyklus (Stoffwechselwege zeichnen können)\n2. Woche: Atmungskette + ATP-Synthase\n3. Woche: Enzymkinetik rechnen (Lineweaver-Burk!)\n4. Woche: Aminosäuren auswendig, Proteinstruktur\n5. Woche: Altklausuren unter Zeitdruck\n\n> Regel: jeden Stoffwechselweg einmal frei auf Papier zeichnen, bevor er als „sitzt“ gilt.\n"],
  ["Russisch A2 — Prüfungsformat.md", "Russisch", "ru",
    "# Prüfungsformat Russisch A2\n\n· Hörverstehen 25 min (2× hören)\n· Leseverstehen 30 min\n· Schreiben: E-Mail ~60 Wörter\n· Sprechen: Dialog + Bildbeschreibung\n\n**Bestehensgrenze 60 %.** Schwächster Teil bisher: Hörverstehen → täglich 10 min Podcast.\n"],
];

const NOTES = [
  ["In der Übung gesagt: Kellerautomaten kommen SICHER in der Klausur — mindestens eine Konstruktion CFG → PDA.", "Informatik", "ti", 1],
  ["Prof. sagte: Halteproblem-Beweis muss man reproduzieren können, nicht nur erkennen.", "Informatik", "ti", 0],
  ["Trick fürs Pumping-Lemma: immer w = aⁿbⁿ wählen und i = 2 nehmen, dann kippt die Anzahl.", "Informatik", "ti", 0],
  ["CYK-Tabelle immer von unten nach oben füllen — hatte ich in der Übung falsch herum.", "Informatik", "ti", 0],
  ["Klausur Biochemie: 60 % Stoffwechselwege, 40 % Rechnen. Formelsammlung ist erlaubt!", "Biochemie", "bio", 1],
  ["Regulationspunkte der Glykolyse merken: Hexokinase, PFK-1, Pyruvatkinase — PFK-1 ist der wichtigste.", "Biochemie", "bio", 0],
  ["Lineweaver-Burk: y-Achsenabschnitt = 1/vmax, x-Achsenabschnitt = −1/Km. Immer wieder verwechselt.", "Biochemie", "bio", 0],
  ["Enzymkinetik-Übung Aufgabe 7 nochmal rechnen — da war ich zu langsam.", "Biochemie", "bio", 0],
  ["Cyanid hemmt Komplex IV, Rotenon Komplex I, Antimycin Komplex III. Reihenfolge über Alphabet merkbar.", "Biochemie", "bio", 0],
  ["Russisch: Aspekt ist KEINE Zeitform. Imperfektiv = Film, perfektiv = Foto.", "Russisch", "ru", 0],
  ["Vokabeltest jeden Montag — 30 neue Wörter pro Woche reichen.", "Russisch", "ru", 0],
  ["Hörverstehen ist mein Schwachpunkt. Täglich 10 Minuten Podcast, auch wenn ich nur die Hälfte verstehe.", "Russisch", "ru", 0],
  ["Präpositiv nur mit в/на und nur bei ORT, nicht bei Richtung. Richtung = Akkusativ.", "Russisch", "ru", 0],
  ["Tibetisch: Wurzelbuchstabe trägt den Ton — das erklärt endlich, warum meine Aussprache abweicht.", "Tibetisch", "tib", 0],
  ["Die Ehrensprache ist prüfungsrelevant, aber nur passiv (erkennen, nicht bilden).", "Tibetisch", "tib", 0],
  ["Embedded: in der ISR NIE malloc oder printf. Kam in der letzten Klausur als Fehlerfrage.", "Embedded", "emb", 0],
  ["volatile bei allen Variablen, die zwischen ISR und main geteilt werden — sonst optimiert der Compiler weg.", "Embedded", "emb", 0],
  ["Prescaler-Rechnung: f_out = f_clk / ((PSC+1) · (ARR+1)). Die +1 immer vergessen!", "Embedded", "emb", 0],
  ["Analysis-Klausur war machbar — Übungsblätter waren die halbe Miete. Für TI genauso vorgehen.", "Mathematik", "ana", 0],
  ["Rückblick Analysis: zu spät mit Altklausuren angefangen. Diesmal ab 3 Wochen vorher.", "Mathematik", "ana", 0],
  ["Merke: Nach 45 Minuten kippt meine Konzentration wirklich. Lieber 2×25 als 1×60.", null, null, 1],
  ["Beste Lernzeit ist bei mir 10–12 Uhr und dann wieder ab 15 Uhr. Vormittags nichts Schweres vor 9.", null, null, 0],
  ["Wenn ich morgens direkt anfange statt erst Mails zu lesen, wird der ganze Tag besser.", null, null, 0],
  ["Handy in einen anderen Raum legen hat mehr gebracht als jede App-Sperre.", null, null, 0],
  ["Schlecht geschlafen = schwere Themen verschieben, dafür Karteikarten machen. Funktioniert besser als durchziehen.", null, null, 0],
  ["Bibliothek 3. Stock ist zu laut geworden — der Lesesaal im Altbau ist besser.", null, null, 0],
  ["Idee: Zusammenfassungen laut vorlesen und aufnehmen, dann beim Laufen anhören.", null, null, 0],
  ["Nächstes Semester früher mit den Übungsgruppen anmelden.", null, null, 0],
];

// Aufgaben-Muster: {t} = Thema, {e} = Prüfung
const TASK_PATTERNS = [
  ["{t} durcharbeiten", 3, 60], ["{t} zusammenfassen", 2, 45],
  ["Karteikarten zu {t} anlegen", 1, 25], ["Video zu {t} schauen", 1, 30],
  ["{t} wiederholen", 1, 25], ["Übungsaufgaben {t}", 3, 50],
  ["{t} auf einem Blatt erklären", 2, 30], ["{t} — offene Fragen klären", 2, 25],
];
const EXAM_TASK_PATTERNS = [
  ["Altklausur {e} rechnen", 3, 90], ["Übungsblatt {e} abgeben", 2, 75],
  ["Lernzettel {e} ergänzen", 2, 40], ["Vorlesung {e} nacharbeiten", 2, 50],
];

// ═════════════════ Aufräumen (nur mit --reset) ═════════════════
const CONTENT_TABLES = [
  "task_deps", "subtasks", "resources", "reviews", "shares", "materials",
  "calendar_events", "calendar_collections", "calendar_accounts",
  "tasks", "topics", "notes", "exams", "sessions", "daily_metrics",
  "health_daily", "health_samples", "user_prefs",
  "nav_nodes",
];

db.exec("BEGIN");
try {
  if (RESET) {
    for (const t of CONTENT_TABLES) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(U);
    db.prepare("UPDATE timer_state SET status='idle', phase='focus', cycle_in_block=0, remaining_ms=1500000, ends_at=NULL, active_task_id=NULL, phase_started_at=NULL, break_over_since=NULL, break_over_notified=0 WHERE user_id = ?").run(U);
  }

  // ═════════════════ Profil & Einstellungen ═════════════════
  // Vorhandene Angaben (z. B. selbst gesetzter Name) werden NICHT überschrieben.
  const prof = db.prepare("SELECT * FROM profile WHERE user_id = ?").get(U);
  db.prepare(`
    UPDATE profile SET display_name = COALESCE(?, display_name), timezone = COALESCE(timezone, ?),
      chronotype = COALESCE(chronotype, ?), focus = ?, primary_device = ?, sleep_goal_hours = ?,
      target_bedtime = COALESCE(target_bedtime, ?), target_wake_time = COALESCE(target_wake_time, ?),
      resting_hr_baseline = COALESCE(resting_hr_baseline, ?), hrv_baseline_ms = COALESCE(hrv_baseline_ms, ?),
      height_cm = COALESCE(height_cm, ?), weight_kg = COALESCE(weight_kg, ?),
      ai_enabled = 1, ai_notes = COALESCE(ai_notes, ?), data_consent_at = COALESCE(data_consent_at, ?),
      updated_at = ? WHERE user_id = ?
  `).run(
    prof?.display_name || "Miréio", "Europe/Zurich", "late", 1, "ringconn", 8,
    "23:15", "07:15", 58, 62, 172, 63,
    "Ziel: Theoretische Informatik bestehen, Russisch A2 sicher. Ich unterschätze schwere Themen chronisch — bitte großzügiger planen.",
    NOW - 30 * 86400000, NOW, U,
  );

  db.prepare(`
    UPDATE settings SET focus_minutes=25, short_break_minutes=5, long_break_minutes=15,
      cycles_until_long_break=4, auto_start_next_phase=0, today_goal_hours=5.5,
      profile_name='Prüfungsfokus', dnd_enabled=1, dnd_start_min=?, dnd_end_min=?,
      remind_tasks=1, remind_lead_min=10 WHERE user_id = ?
  `).run(22 * 60, 7 * 60, U);

  // Lernprofil + Darstellung (Wave 6)
  const putPref = db.prepare(`
    INSERT INTO user_prefs (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const prefs = {
    learnStyles: ["write", "visual", "do"],
    challenges: ["focus", "procrastination"],
    helps: ["short-blocks", "structure", "deadlines"],
    methods: ["pomodoro", "spaced-repetition", "active-recall", "micro-steps", "eat-the-frog", "feynman", "interleaving"],
    appearance: { theme: "system", accent: "sage", density: "cosy" },
    access: { reduceMotion: false, largeText: false },
    hiddenViews: [],
    moduleNavOnly: true,
  };
  for (const [k, v] of Object.entries(prefs)) putPref.run(U, k, JSON.stringify(v), NOW);

  // ═════════════════ Prüfungen & Themen ═════════════════
  const insExam = db.prepare(`
    INSERT INTO exams (user_id, name, exam_date, total_hours, color, archived, archived_at, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const examIds = {};
  EXAMS.forEach((e, i) => {
    const info = insExam.run(
      U, e.name, msAt(e.days, 9 * 60), e.hours, e.color,
      e.archived ? 1 : 0, e.archived ? msAt(e.days + 1) : null, i, msAt(-DAYS + 2),
    );
    examIds[e.key] = Number(info.lastInsertRowid);
  });

  // Drei echte, verschachtelte Modulbäume in der Sidebar. Weitere Unterordner
  // können über das + an jedem Ordner beliebig tief ergänzt werden.
  const insNav = db.prepare("INSERT INTO nav_nodes (user_id,parent_id,name,kind,view_key,exam_id,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?)");
  EXAMS.forEach((e, i) => {
    const root = Number(insNav.run(U, null, e.name, "folder", null, null, i, NOW).lastInsertRowid);
    insNav.run(U, root, "Modulübersicht", "exam", null, examIds[e.key], 0, NOW);
    const planning = Number(insNav.run(U, root, "Planung", "folder", null, null, 1, NOW).lastInsertRowid);
    insNav.run(U, planning, "Wochenkalender", "view", "week", null, 0, NOW);
    insNav.run(U, planning, "Aufgaben heute", "view", "today", null, 1, NOW);
    const learning = Number(insNav.run(U, root, "Lernen & Material", "folder", null, null, 2, NOW).lastInsertRowid);
    insNav.run(U, learning, "Bibliothek", "view", "library", null, 0, NOW);
    insNav.run(U, learning, "Notizen", "view", "notes", null, 1, NOW);
  });

  const insTopic = db.prepare(`
    INSERT INTO topics (user_id, exam_id, text, done, confidence, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const topicIds = {};          // Themenname → id
  const topicsByExam = {};      // examKey → [{id, text, confidence}]
  for (const [key, list] of Object.entries(TOPICS)) {
    if (!MODULE_KEYS.has(key)) continue;
    topicsByExam[key] = [];
    list.forEach(([text, conf, done], i) => {
      const info = insTopic.run(U, examIds[key], text, done, conf, i, msAt(-DAYS + 3));
      const id = Number(info.lastInsertRowid);
      topicIds[text] = id;
      topicsByExam[key].push({ id, text, confidence: conf, done });
    });
  }

  // ═════════════════ Lern-Ressourcen ═════════════════
  const insRes = db.prepare(`
    INSERT INTO resources (user_id, topic_id, task_id, title, url, kind, notes, is_primary, sort_order, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
  `);
  RESOURCES.forEach(([topicName, title, url, kind, notes, primary], i) => {
    const tid = topicIds[topicName];
    if (!tid) return;
    insRes.run(U, tid, title, url, kind, notes, primary, i, msAt(-rint(10, DAYS - 5)));
  });

  // ═════════════════ Bibliothek (Materialien) ═════════════════
  const insMat = db.prepare(`
    INSERT INTO materials (user_id, topic_id, exam_id, kind, title, subject, url, content, mime, size, data, pinned, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let matOrder = 0;
  const materialIds = [];
  CARDS.filter(([, subject]) => MODULE_SUBJECTS.has(subject)).forEach(([title, subject, topicName, content], i) => {
    const info = insMat.run(U, topicIds[topicName] ?? null, null, "card", title, subject, null, content,
      null, null, null, i < 3 ? 1 : 0, matOrder++, msAt(-rint(5, 60)), NOW);
    materialIds.push(Number(info.lastInsertRowid));
  });
  LIB_LINKS.filter(([, , , examKey]) => MODULE_KEYS.has(examKey)).forEach(([title, subject, url, examKey]) => {
    const info = insMat.run(U, null, examIds[examKey] ?? null, "link", title, subject, url, null,
      null, null, null, 0, matOrder++, msAt(-rint(5, 70)), NOW);
    materialIds.push(Number(info.lastInsertRowid));
  });
  FILES.filter(([, , examKey]) => MODULE_KEYS.has(examKey)).forEach(([title, subject, examKey, text]) => {
    const buf = Buffer.from(text, "utf8");
    const info = insMat.run(U, null, examIds[examKey] ?? null, "file", title, subject, null, null,
      "text/markdown", buf.length, buf, 0, matOrder++, msAt(-rint(5, 50)), NOW);
    materialIds.push(Number(info.lastInsertRowid));
  });

  // ═════════════════ Notizen ═════════════════
  const insNote = db.prepare(`
    INSERT INTO notes (user_id, text, subject, exam_id, pinned, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  NOTES.filter(([, subject, examKey]) => MODULE_SUBJECTS.has(subject) && (!examKey || MODULE_KEYS.has(examKey))).forEach(([text, subject, examKey, pinned], i) => {
    const created = msAt(-rint(1, DAYS - 4), rint(8, 21) * 60);
    insNote.run(U, text, subject, examKey ? examIds[examKey] : null, pinned, NOTES.length - i, created, created);
  });

  // ═════════════════ Kalender (Uni-Stundenplan, ICS-Abo) ═════════════════
  const accInfo = db.prepare(`
    INSERT INTO calendar_accounts (user_id, kind, label, username, secret_enc, base_url, home_url, enabled, last_sync_at, last_error, created_at)
    VALUES (?, 'ics', 'Uni-Stundenplan (Demo)', NULL, NULL, 'https://demo.kairos.local/stundenplan.ics', NULL, 1, ?, NULL, ?)
  `).run(U, NOW - 12 * 60000, msAt(-DAYS + 1));
  const accountId = Number(accInfo.lastInsertRowid);
  const colInfo = db.prepare(`
    INSERT INTO calendar_collections (user_id, account_id, url, name, color, enabled, ctag, sync_token)
    VALUES (?, ?, 'https://demo.kairos.local/stundenplan.ics', 'Vorlesungen & Termine', '#7C9AC2', 1, 'demo-ctag-1', NULL)
  `).run(U, accountId);
  const collectionId = Number(colInfo.lastInsertRowid);

  // Serien starten am Montag vor ~8 Wochen, damit sie heute expandieren.
  const seriesStartOffset = (() => {
    let off = -56;
    while (dayAt(off).getDay() !== 1) off--;      // zurück bis Montag
    return off;
  })();
  const dowOffset = (dow) => {                     // Wochentag (1=Mo) ab Serienstart
    let off = seriesStartOffset;
    while (dayAt(off).getDay() !== dow) off++;
    return off;
  };
  const TZ = "Europe/Zurich";
  const SERIES = [
    [1, 8 * 60 + 15, 105, "Vorlesung Theoretische Informatik", "HS 3, Gebäude C"],
    [1, 14 * 60, 90, "Übung Theoretische Informatik", "Seminarraum 2.14"],
    [2, 10 * 60 + 15, 105, "Vorlesung Biochemie I", "Hörsaal Chemie"],
    [2, 18 * 60 + 30, 60, "Sportkurs — Bouldern", "Kletterhalle"],
    [3, 9 * 60, 90, "Praktikum Embedded Systems", "Labor E1"],
    [3, 16 * 60, 90, "Russisch A2 — Sprachkurs", "Sprachenzentrum R 12"],
    [4, 10 * 60 + 15, 105, "Vorlesung Biochemie I", "Hörsaal Chemie"],
    [4, 18 * 60 + 30, 60, "Sportkurs — Bouldern", "Kletterhalle"],
    [5, 11 * 60, 90, "Tibetisch A2 — Kurs", "Sprachenzentrum R 4"],
    // Wochenende: auch Sa/So haben Termine, sonst wäre der Zeitstrahl dort leer.
    [6, 11 * 60, 90, "Sprachtandem Russisch", "Café Konrad"],
    [0, 18 * 60, 45, "Wochenplanung", null],
  ];
  const calEvents = [];
  SERIES.forEach(([dow, startMin, durMin, summary, location], i) => {
    const off = dowOffset(dow);
    calEvents.push({
      href: `ics:series-${i}`, etag: null, uid: `series-${i}@demo.kairos`,
      summary, location, startMs: msAt(off, startMin), endMs: msAt(off, startMin + durMin),
      durationMin: durMin, allDay: 0, rrule: "FREQ=WEEKLY", exdates: null,
      recurrenceIdMs: null, tzid: TZ, status: null,
    });
  });
  // Einzeltermine rund um heute (inkl. ganztägig) — Kontext für den Zeitstrahl.
  const SINGLES = [
    [0, 19 * 60 + 30, 75, "Abendessen mit den Mitbewohnern", null, 0],
    [-3, 15 * 60, 60, "Zahnarzt", "Praxis Dr. Berger", 0],
    [1, 13 * 60, 45, "Mittagessen mit Lena", "Mensa", 0],
    [2, 17 * 60, 120, "Lerngruppe Biochemie", "Bibliothek, Gruppenraum 3", 0],
    [4, 0, 1440, "Geburtstag Papa", null, 1],
    [6, 10 * 60, 180, "Umzugshilfe Jonas", null, 0],
    [9, 9 * 60, 120, "Klausur Russisch A2", "Prüfungszentrum", 0],
    [11, 19 * 60, 150, "Konzert", "Kaserne", 0],
    [18, 9 * 60, 180, "Klausur Theoretische Informatik", "Audimax", 0],
    [-10, 14 * 60, 90, "Sprechstunde Prof. Weber", "Büro 3.21", 0],
  ];
  SINGLES.forEach(([off, startMin, durMin, summary, location, allDay], i) => {
    calEvents.push({
      href: `ics:single-${i}`, etag: null, uid: `single-${i}@demo.kairos`,
      summary, location, startMs: msAt(off, startMin), endMs: msAt(off, startMin + durMin),
      durationMin: durMin, allDay, rrule: null, exdates: null,
      recurrenceIdMs: null, tzid: allDay ? null : TZ, status: null,
    });
  });
  const insEvent = db.prepare(`
    INSERT INTO calendar_events (user_id, collection_id, href, etag, uid, summary, location, start_ms, end_ms,
      duration_min, all_day, rrule, exdates, recurrence_id_ms, tzid, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const ev of calEvents) {
    insEvent.run(U, collectionId, ev.href, ev.etag, ev.uid, ev.summary, ev.location,
      ev.startMs, ev.endMs, ev.durationMin, ev.allDay, ev.rrule, ev.exdates,
      ev.recurrenceIdMs, ev.tzid, ev.status, NOW);
  }

  // Belegte Zeiten eines Tages — über die ECHTE Expansion (shared/icsParse.js).
  const busyOn = (offset) => {
    const from = msAt(offset, 0);
    const to = msAt(offset + 1, 0);
    return expandEvents(calEvents.map((e) => ({ ...e, allDay: !!e.allDay })), { fromMs: from, toMs: to })
      .filter((i) => !i.allDay)
      .map((i) => ({
        startMin: Math.round((Math.max(i.startMs, from) - from) / 60000),
        durationMin: Math.max(5, Math.round((Math.min(i.endMs, to) - Math.max(i.startMs, from)) / 60000)),
      }));
  };

  // ═════════════════ Aufgaben, Sessions, Metriken ═════════════════
  const insTask = db.prepare(`
    INSERT INTO tasks (user_id, exam_id, text, subject, priority, due_date, planned_date, est_minutes, scheduled_min,
      done, done_at, spent_ms, active, sort_order, created_at, recurrence, recur_parent_id, postpone_count,
      difficulty, topic_id, sched_source, remind_for, remind_stage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
  `);
  const insSession = db.prepare(`
    INSERT INTO sessions (user_id, task_id, phase, started_at, ended_at, focus_ms, completed, created_at)
    VALUES (?, ?, 'focus', ?, ?, ?, ?, ?)
  `);
  const focusByDay = new Map();   // dayKey → { ms, sessions }

  // Ist/Soll-Verhältnis: steigt mit der Schwierigkeit, verbessert sich leicht über die Zeit.
  function ratioFor(difficulty, ageFraction) {
    const base = { 1: [0.80, 1.05], 2: [1.00, 1.35], 3: [1.30, 1.95] }[difficulty];
    const learn = 0.88 + 0.12 * ageFraction;     // früher schlechter geschätzt als heute
    return rfloat(base[0], base[1]) * learn;
  }
  // Startzeiten nach Chronotyp „spät": Vormittag ab 9, Hauptfenster 15–19, Abend-Tail.
  function startMinuteFor(i) {
    const r = rnd();
    if (r < 0.28) return rint(9 * 60, 11 * 60 + 30);
    if (r < 0.5) return rint(11 * 60 + 30, 13 * 60);
    if (r < 0.85) return rint(14 * 60 + 30, 19 * 60);
    return rint(20 * 60, 22 * 60);
  }

  // Fokus-Sessions eines Tages protokollieren und die Tages-Metrik mitführen.
  function logSessions(taskId, offset, totalMin, completedTask) {
    const key = keyAt(offset);
    let rest = totalMin;
    let startMin = startMinuteFor();
    let n = 0;
    while (rest > 0 && n < 6) {
      const chunk = Math.min(rest, rint(18, 27));
      const startedAt = msAt(offset, startMin);
      const endedAt = startedAt + chunk * 60000;
      const complete = chunk >= 24 || (rest - chunk <= 0 && completedTask);
      insSession.run(U, taskId, startedAt, endedAt, chunk * 60000, complete ? 1 : 0, endedAt);
      const cur = focusByDay.get(key) || { ms: 0, sessions: 0 };
      cur.ms += chunk * 60000;
      cur.sessions += complete ? 1 : 0;
      focusByDay.set(key, cur);
      rest -= chunk;
      startMin += chunk + rint(5, 22);           // Pause dazwischen
      if (startMin > 22 * 60) break;
      n++;
    }
    return (totalMin - Math.max(0, rest)) * 60000;
  }

  const allTopics = Object.entries(TOPICS).flatMap(([k, list]) => list.map(([text]) => ({ examKey: k, text })));
  const activeExamKeys = [...MODULE_KEYS];
  const subjectOf = (k) => EXAMS.find((e) => e.key === k).subject;
  let sortOrder = 0;
  const doneTaskIds = [];

  // ── Vergangenheit: erledigte Aufgaben über den gesamten Zeitraum ──
  const STREAK_GAP = -3;   // ein bewusst leerer Tag → zeigt den Gnadentag in Insights
  for (let off = -DAYS + 1; off <= -1; off++) {
    if (off === STREAK_GAP) continue;
    const weekend = isWeekend(off);
    // Die letzten beiden Tage immer füllen (lebendige Serie beim Öffnen).
    if (off < -2 && chance(weekend ? 0.45 : 0.08)) continue;
    const count = weekend ? rint(1, 2) : rint(2, 5);
    const ageFraction = (off + DAYS) / DAYS;                  // 0 = ganz alt, 1 = heute
    // Ältere Hälfte: auch Analysis (Prüfung lag vor 24 Tagen)
    const poolKeys = activeExamKeys;

    for (let i = 0; i < count; i++) {
      const examKey = pick(poolKeys);
      const topic = pick(TOPICS[examKey]);
      const useExamPattern = chance(0.25);
      const [pattern, diff, baseMin] = useExamPattern ? pick(EXAM_TASK_PATTERNS) : pick(TASK_PATTERNS);
      const text = pattern
        .replace("{t}", topic[0])
        .replace("{e}", EXAMS.find((e) => e.key === examKey).name);
      const estMinutes = round5(baseMin * rfloat(0.8, 1.25));
      const spentMin = Math.max(5, Math.round(estMinutes * ratioFor(diff, ageFraction)));
      const doneAt = msAt(off, rint(11, 22) * 60);
      const info = insTask.run(
        U, examIds[examKey], text, subjectOf(examKey), rint(1, 3),
        chance(0.3) ? msAt(off + rint(0, 3), 18 * 60) : null,
        keyAt(off), estMinutes, chance(0.55) ? rint(9, 20) * 60 : null,
        1, doneAt, 0, 0, sortOrder++, msAt(off - rint(0, 6), 9 * 60),
        null, null, chance(0.12) ? rint(1, 3) : 0,
        diff, topicIds[topic[0]] ?? null, chance(0.5) ? "auto" : "user",
      );
      const taskId = Number(info.lastInsertRowid);
      const spentMs = logSessions(taskId, off, spentMin, true);
      db.prepare("UPDATE tasks SET spent_ms = ? WHERE id = ?").run(spentMs, taskId);
      doneTaskIds.push(taskId);
    }
  }

  // ── Heute bereits Geschafftes ──
  // Füllt den Kapazitäts-Ring und hält die Serie am Leben. Sessions liegen
  // ausschließlich in der Vergangenheit — sonst zeigte „heute" Zukunftszeit.
  const roomEnd = nowMinOfDay - 15;
  const roomStart = Math.max(7 * 60, roomEnd - 240);
  if (roomEnd - roomStart >= 30) {
    const TODAY_DONE = [
      ["Reguläre Sprachen wiederholen", "ti", "Reguläre Sprachen & DFA/NFA", 1, 25],
      ["Glykolyse-Schema frei zeichnen", "bio", "Glykolyse", 2, 40],
    ];
    let cursor = roomStart;
    for (const [text, examKey, topicName, diff, est] of TODAY_DONE) {
      const spent = Math.min(Math.round(est * ratioFor(diff, 1)), roomEnd - cursor);
      if (spent < 15) break;
      const info = insTask.run(
        U, examIds[examKey], text, subjectOf(examKey), 2, null, keyAt(0), est,
        cursor, 1, msAt(0, cursor + spent), 0, 0, sortOrder++, msAt(0, 7 * 60),
        null, null, 0, diff, topicIds[topicName] ?? null, "user",
      );
      const taskId = Number(info.lastInsertRowid);
      // Sessions exakt in das Fenster legen (statt zufälliger Tageszeit).
      let rest = spent;
      let at = cursor;
      let ms = 0;
      while (rest > 0) {
        const chunk = Math.min(rest, 25);
        insSession.run(U, taskId, msAt(0, at), msAt(0, at + chunk), chunk * 60000, chunk >= 24 ? 1 : 0, msAt(0, at + chunk));
        const cur = focusByDay.get(keyAt(0)) || { ms: 0, sessions: 0 };
        cur.ms += chunk * 60000;
        cur.sessions += chunk >= 24 ? 1 : 0;
        focusByDay.set(keyAt(0), cur);
        ms += chunk * 60000;
        rest -= chunk;
        at += chunk + 5;
      }
      db.prepare("UPDATE tasks SET spent_ms = ? WHERE id = ?").run(ms, taskId);
      doneTaskIds.push(taskId);
      cursor = at + 10;
      if (cursor >= roomEnd) break;
    }
  }

  const insMetric = db.prepare(`
    INSERT INTO daily_metrics (user_id, day_key, focus_ms, sessions_done) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, day_key) DO UPDATE SET focus_ms = excluded.focus_ms, sessions_done = excluded.sessions_done
  `);
  for (const [key, v] of focusByDay) insMetric.run(U, key, v.ms, v.sessions);

  // ── Heute ──
  const busyToday = busyOn(0);
  const occupied = [...busyToday];
  const todayIds = [];
  const TODAY_TASKS = [
    // [Text, examKey, topicName, difficulty, estMinutes, priority]
    ["Kellerautomaten (PDA) durcharbeiten", "ti", "Kellerautomaten (PDA)", 3, 45, 1],
    ["Altklausur Theoretische Informatik rechnen", "ti", "Pumping-Lemma (regulär)", 3, 60, 1],
    ["Vokabeln Russisch (30 Wörter)", "ru", "Wortschatz Familie & Beruf", 1, 20, 2],
    ["Citratzyklus zusammenfassen", "bio", "Citratzyklus", 2, 30, 2],
    ["Enzymkinetik-Übung Aufgabe 7", "bio", "Enzymkinetik (Michaelis-Menten)", 3, 30, 2],
    ["Tibetische Schrift üben", "tib", "Tibetische Schrift (Uchen)", 1, 20, 3],
  ];
  TODAY_TASKS.filter(([, examKey]) => MODULE_KEYS.has(examKey)).forEach(([text, examKey, topicName, diff, est, prio], i) => {
    const start = nextFreeSlot(occupied, est, Math.max(DAY_START_MIN, nowMinOfDay + 20), { dayEnd: DAY_END_MIN });
    const fits = start + est <= DAY_END_MIN;
    const info = insTask.run(
      U, examIds[examKey], text, subjectOf(examKey), prio, null, keyAt(0), est,
      fits ? start : null, 0, null, 0, 0, sortOrder++, msAt(0, 7 * 60),
      null, null, 0, diff, topicIds[topicName] ?? null, fits ? "auto" : null,
    );
    if (fits) occupied.push({ startMin: start, durationMin: est });
    todayIds.push(Number(info.lastInsertRowid));
  });
  const DEMO_PLACES = [
    [todayIds[0], "C 2.14", "Universität Zürich, Binzmühlestrasse 14, Zürich", "https://maps.google.com/?q=Universit%C3%A4t+Z%C3%BCrich+Binzm%C3%BChlestrasse+14"],
    [todayIds[1], "Gruppenraum 3", "Zentralbibliothek Zürich", "https://maps.apple.com/?q=Zentralbibliothek+Z%C3%BCrich"],
    [todayIds[2], "R 12", "Sprachenzentrum Zürich", "https://maps.google.com/?q=Sprachenzentrum+Z%C3%BCrich"],
  ];
  for (const [id, room, location, mapsUrl] of DEMO_PLACES) if (id) db.prepare("UPDATE tasks SET room=?, location=?, maps_url=? WHERE id=?").run(room, location, mapsUrl, id);

  // Eine überfällige Aufgabe (zeigt die „Missed block"-Nachfrage — bewusst genau eine).
  const overdueStart = Math.max(DAY_START_MIN, nowMinOfDay - 75);
  const overdueInfo = insTask.run(
    U, examIds.bio, "Atmungskette wiederholen", "Biochemie", 2, null, keyAt(0), 30,
    overdueStart, 0, null, 0, 0, sortOrder++, msAt(0, 7 * 60),
    null, null, 2, 2, topicIds["Atmungskette & ATP-Synthase"] ?? null, "user",
  );

  // Aufgaben ohne Uhrzeit (Drag-Vorrat in der Unscheduled-Liste)
  const UNSCHEDULED = [
    ["Turingmaschinen — Video schauen", "ti", "Turingmaschinen", 1, 25, 2, 0],
    ["Halteproblem-Beweis nachvollziehen", "ti", "Entscheidbarkeit & Halteproblem", 3, 45, 2, 1],
    ["Karteikarten Aminosäuren anlegen", "bio", "Aminosäuren & Proteinstruktur", 1, 20, 3, 0],
    ["Russisch Hörverstehen üben", "ru", "Hörverstehen A2", 2, 25, 2, 3],
    ["Signaltransduktion durcharbeiten", "bio", "Signaltransduktion", 3, 60, 3, 4],
    ["Interrupts & ISR zusammenfassen", "emb", "Interrupts & ISR", 2, 30, 3, 0],
  ];
  const unschedIds = [];
  UNSCHEDULED.filter(([, examKey]) => MODULE_KEYS.has(examKey)).forEach(([text, examKey, topicName, diff, est, prio, postpones]) => {
    const info = insTask.run(
      U, examIds[examKey], text, subjectOf(examKey), prio, null, keyAt(0), est, null,
      0, null, 0, 0, sortOrder++, msAt(-rint(0, 5), 9 * 60),
      null, null, postpones, diff, topicName ? topicIds[topicName] ?? null : null, null,
    );
    unschedIds.push(Number(info.lastInsertRowid));
  });

  // Aktive Aufgabe für die Timer-Pille (nicht laufend, nur gewählt).
  const activeId = todayIds[0];
  db.prepare("UPDATE tasks SET active = 1 WHERE id = ?").run(activeId);
  db.prepare("UPDATE timer_state SET active_task_id = ?, updated_at = ? WHERE user_id = ?").run(activeId, NOW, U);

  // ── Zukunft: die nächsten Tage ──
  const futureByOffset = new Map();
  for (let off = 1; off <= 12; off++) {
    const count = isWeekend(off) ? rint(1, 2) : rint(3, 5);
    const busy = busyOn(off);
    const occ = [...busy];
    const ids = [];
    for (let i = 0; i < count; i++) {
      const examKey = pick(off <= 9 ? ["ti", "ti", "ru", "ru", "bio", "bio"] : activeExamKeys);
      const topic = pick(TOPICS[examKey]);
      const [pattern, diff, baseMin] = chance(0.25) ? pick(EXAM_TASK_PATTERNS) : pick(TASK_PATTERNS);
      const text = pattern.replace("{t}", topic[0]).replace("{e}", EXAMS.find((e) => e.key === examKey).name);
      const est = round5(baseMin * rfloat(0.8, 1.2));
      const scheduled = chance(0.6);
      const start = scheduled ? nextFreeSlot(occ, est, DAY_START_MIN + 120, { dayEnd: DAY_END_MIN }) : null;
      const fits = scheduled && start + est <= DAY_END_MIN;
      const info = insTask.run(
        U, examIds[examKey], text, subjectOf(examKey), rint(1, 3),
        chance(0.25) ? msAt(off + rint(0, 4), 18 * 60) : null,
        keyAt(off), est, fits ? start : null, 0, null, 0, 0, sortOrder++, msAt(-rint(0, 3), 10 * 60),
        null, null, 0, diff, topicIds[topic[0]] ?? null, fits ? "auto" : null,
      );
      if (fits) occ.push({ startMin: start, durationMin: est });
      ids.push(Number(info.lastInsertRowid));
    }
    futureByOffset.set(off, ids);
  }

  // ── Wiederkehrende Aufgaben ──
  const insRecurring = (text, examKey, topicName, rule, est, diff, startMin) => {
    const info = insTask.run(
      U, examIds[examKey], text, subjectOf(examKey), 2, null, keyAt(0), est, startMin,
      0, null, 0, 0, sortOrder++, msAt(-20, 8 * 60), rule, null, 0,
      diff, topicName ? topicIds[topicName] ?? null : null, "user",
    );
    return Number(info.lastInsertRowid);
  };
  insRecurring("Russisch Vokabeln (täglich)", "ru", "Wortschatz Familie & Beruf", "daily", 15, 1, 20 * 60 + 30);

  // ── Unteraufgaben ──
  const insSub = db.prepare("INSERT INTO subtasks (user_id, task_id, text, done, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const SUBTASK_SETS = [
    ["Definition lesen", "Beispiel durchrechnen", "Selbst ein Beispiel bauen", "Offene Fragen notieren"],
    ["Skript-Kapitel überfliegen", "Zusammenfassung schreiben", "Karteikarten anlegen"],
    ["Aufgabe 1–3", "Aufgabe 4–6", "Lösungen vergleichen"],
    ["Video schauen", "Mitschrift ergänzen"],
  ];
  const subtaskTargets = [...todayIds, ...unschedIds, ...doneTaskIds.slice(-25)];
  for (const tid of subtaskTargets) {
    if (!chance(0.55)) continue;
    const set = pick(SUBTASK_SETS);
    const isDone = doneTaskIds.includes(tid);
    set.forEach((text, i) => {
      insSub.run(U, tid, text, isDone ? 1 : (i === 0 && chance(0.4) ? 1 : 0), i, msAt(-rint(0, 10), 10 * 60));
    });
  }

  // ── Abhängigkeiten (erst Grundlage, dann Vertiefung) ──
  const insDep = db.prepare("INSERT OR IGNORE INTO task_deps (user_id, task_id, depends_on_id, created_at) VALUES (?, ?, ?, ?)");
  // „Altklausur rechnen" wartet auf „Kellerautomaten durcharbeiten"
  insDep.run(U, todayIds[1], todayIds[0], NOW);
  // „Halteproblem-Beweis" wartet auf „Turingmaschinen — Video"
  insDep.run(U, unschedIds[1], unschedIds[0], NOW);
  // „Enzymkinetik-Übung" wartet auf „Citratzyklus zusammenfassen"
  insDep.run(U, todayIds[4], todayIds[3], NOW);
  // Kette in der Zukunft
  const fut1 = futureByOffset.get(1) || [];
  const fut2 = futureByOffset.get(2) || [];
  if (fut1.length && fut2.length) insDep.run(U, fut2[0], fut1[0], NOW);
  if (fut1.length >= 2) insDep.run(U, fut1[1], fut1[0], NOW);

  // ═════════════════ Gesundheitsdaten (RingConn) ═════════════════
  const HEALTH_DAYS = Math.min(70, DAYS);
  const insHealth = db.prepare(`
    INSERT INTO health_daily (user_id, day_key, source, sleep_start, sleep_end, sleep_total_min, sleep_deep_min,
      sleep_rem_min, sleep_light_min, sleep_awake_min, sleep_efficiency, sleep_score, resting_hr, avg_hr, min_hr,
      max_hr, hrv_ms, respiratory_rate, spo2_avg, spo2_min, skin_temp_c, skin_temp_delta_c, steps, active_calories,
      total_calories, activity_min, distance_m, recovery_score, strain_score, stress_avg, readiness,
      raw_json, recorded_at, imported_at, updated_at)
    VALUES (?, ?, 'ringconn', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `);
  const insSample = db.prepare("INSERT INTO health_samples (user_id, source, metric, t, value, unit) VALUES (?, 'ringconn', ?, ?, ?, ?)");
  for (let off = -HEALTH_DAYS + 1; off <= 0; off++) {
    // Wochenende länger, unter der Woche knapper; ein paar echte Fehlnächte.
    const weekend = isWeekend(off);
    let sleepH = weekend ? rfloat(7.6, 9.1) : rfloat(6.2, 8.1);
    if (chance(0.09)) sleepH = rfloat(4.4, 5.6);                  // schlechte Nacht
    if (off === 0) sleepH = 7.6;                                   // heute: solide Basis
    const totalMin = Math.round(sleepH * 60);
    const sleepStart = msAt(off - 1, 22 * 60 + rint(20, 150));
    const sleepEnd = sleepStart + totalMin * 60000 + rint(10, 45) * 60000;
    const deep = Math.round(totalMin * rfloat(0.14, 0.22));
    const rem = Math.round(totalMin * rfloat(0.18, 0.26));
    const awake = Math.round(totalMin * rfloat(0.03, 0.09));
    const light = Math.max(0, totalMin - deep - rem - awake);
    const eff = Math.round((totalMin / (totalMin + awake)) * 1000) / 10;
    const sleepScore = Math.max(35, Math.min(96, Math.round(45 + (sleepH - 5) * 14 + rfloat(-6, 6))));
    const rhr = Math.round((58 + (sleepH < 6 ? rfloat(3, 6) : rfloat(-2.5, 2)) + rfloat(-1, 1)) * 10) / 10;
    const hrv = Math.round((62 + (sleepH - 7.2) * 7 + rfloat(-8, 8)) * 10) / 10;
    const readiness = Math.max(28, Math.min(95, Math.round(
      50 + (sleepH - 7) * 12 + (hrv - 62) * 0.45 - (rhr - 58) * 2.2 + rfloat(-5, 5),
    )));
    const steps = weekend ? rint(3500, 14000) : rint(4200, 11500);
    insHealth.run(
      U, keyAt(off), sleepStart, sleepEnd, totalMin, deep, rem, light, awake, eff, sleepScore,
      rhr, Math.round(rhr + rfloat(9, 18)), Math.round(rhr - rfloat(2, 6)), rint(118, 168),
      hrv, Math.round(rfloat(13.5, 16.5) * 10) / 10, Math.round(rfloat(95.5, 98.5) * 10) / 10,
      Math.round(rfloat(92, 96) * 10) / 10, Math.round(rfloat(33.6, 34.6) * 100) / 100,
      Math.round(rfloat(-0.4, 0.5) * 100) / 100, steps, Math.round(steps * rfloat(0.035, 0.055)),
      Math.round(1650 + steps * rfloat(0.04, 0.06)), Math.round(steps / rfloat(95, 130)),
      Math.round(steps * rfloat(0.65, 0.78)), readiness, Math.round(rfloat(4, 14) * 10) / 10,
      Math.round(rfloat(22, 55)), readiness,
      msAt(off, 7 * 60), msAt(off, 8 * 60), msAt(off, 8 * 60),
    );
    // Intraday-Herzfrequenz der letzten 7 Tage (Zeitreihen-Chart)
    if (off > -7) {
      for (let h = 6; h <= 23; h++) {
        insSample.run(U, "heart_rate", msAt(off, h * 60 + rint(0, 59)), Math.round(rhr + rfloat(4, 34)), "bpm");
      }
    }
  }

  // ═════════════════ Aktiver Abruf (SRS) ═════════════════
  const insReview = db.prepare(`
    INSERT OR IGNORE INTO reviews (user_id, kind, ref_id, due_key, interval_days, ease, reps, lapses, last_grade, last_review_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Gelernte Themen wandern in die Warteschlange; Fälligkeit gestreut (einige heute).
  const reviewTopics = Object.values(topicsByExam).flat().filter((t) => t.confidence >= 1);
  reviewTopics.forEach((t, i) => {
    const reps = rint(1, 6);
    const interval = [1, 3, 7, 14, 30, 60][Math.min(reps, 5)];
    // Jedes vierte Thema ist heute (oder war gestern) fällig → sichtbare Warteschlange.
    const dueOffset = i % 4 === 0 ? -rint(0, 2) : rint(1, 21);
    insReview.run(
      U, "topic", t.id, keyAt(dueOffset), interval,
      Math.round(rfloat(1.9, 2.8) * 100) / 100, reps, rint(0, 2),
      rint(2, 4), msAt(-rint(1, 20), 18 * 60), msAt(-rint(20, 60), 12 * 60),
    );
  });
  materialIds.slice(0, 8).forEach((mid, i) => {
    const reps = rint(1, 4);
    insReview.run(
      U, "material", mid, keyAt(i % 3 === 0 ? 0 : rint(1, 14)), [1, 3, 7, 14][Math.min(reps, 3)],
      2.5, reps, 0, rint(3, 4), msAt(-rint(1, 12), 17 * 60), msAt(-rint(15, 40), 12 * 60),
    );
  });

  // ═════════════════ Geteilte Links ═════════════════
  const insShare = db.prepare(`
    INSERT INTO shares (user_id, token, kind, ref_id, created_at, revoked_at, view_count) VALUES (?, ?, ?, ?, ?, NULL, ?)
  `);
  insShare.run(U, `demo-u${U}-share-ti-lernplan`, "exam", examIds.ti, msAt(-9, 15 * 60), 7);
  insShare.run(U, `demo-u${U}-share-formelkarte`, "material", materialIds[0], msAt(-4, 11 * 60), 2);

  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  console.error("\n  ✖ Seed fehlgeschlagen — nichts geschrieben:", err.message);
  console.error(err.stack);
  process.exit(1);
}

// ═════════════════ Bericht ═════════════════
const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).get(U).n;
const focusTotal = db.prepare("SELECT COALESCE(SUM(focus_ms),0) AS ms FROM daily_metrics WHERE user_id = ?").get(U).ms;
console.log(`\n  ✓ Beispieldaten für ${user.email} (user_id ${U})${RESET ? " — Konto vorher geleert" : ""}\n`);
const rows = [
  ["Prüfungen", count("exams")], ["Themen", count("topics")],
  ["Aufgaben", count("tasks")], ["davon erledigt", db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND done = 1").get(U).n],
  ["Unteraufgaben", count("subtasks")], ["Abhängigkeiten", count("task_deps")],
  ["Fokus-Sessions", count("sessions")], ["Tage mit Fokus", count("daily_metrics")],
  ["Lern-Links", count("resources")], ["Bibliothek", count("materials")],
  ["Notizen", count("notes")], ["Abruf-Karten (SRS)", count("reviews")],
  ["Gesundheitstage", count("health_daily")], ["Messpunkte", count("health_samples")],
  ["Kalender-Einträge", count("calendar_events")], ["Geteilte Links", count("shares")],
];
for (const [label, n] of rows) console.log(`    ${String(label).padEnd(20)} ${String(n).padStart(6)}`);
console.log(`    ${"Fokuszeit gesamt".padEnd(20)} ${String(Math.round(focusTotal / 3600000) + " h").padStart(6)}`);
console.log(`\n  Server starten:  npm start   →  http://localhost:4321\n`);
