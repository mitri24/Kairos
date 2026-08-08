// Gliederungs-Erkennung: aus eingefügtem Text (Modulhandbuch, Skript-
// Inhaltsverzeichnis, Syllabus, Altklausur, eigene Stichpunkte) eine Liste von
// Lernthemen ziehen — OHNE KI, rein deterministisch und damit testbar.
//
// Warum das existiert: die KI-Zerlegung ist optional (Einwilligung + Anbieter).
// Ohne sie soll „Text einfügen" trotzdem etwas Brauchbares liefern statt einer
// leeren Seite. Lehrmaterial ist fast immer strukturiert — Überschriften,
// Nummerierung, Kapitel —, und genau diese Struktur wird hier gelesen.
//
// Kein DOM, kein Storage, kein Side-Effect. Wird von Server UND Client genutzt.

const MAX_TOPICS = 40;
const MIN_LEN = 3;
const MAX_LEN = 120;

// Zeilen-Marker, nach Aussagekraft geordnet: die STÄRKSTE im Text gefundene
// Struktur gewinnt. Sonst würden in einem Skript mit Überschriften zusätzlich
// alle Aufzählungspunkte als eigene Themen auftauchen.
const PATTERNS = [
  // "# Titel" … "###### Titel"
  { id: "heading", rank: 5, re: /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/ },
  // "Kapitel 3 — Titel", "Chapter 3: Titel", "Woche 2 – Titel", "§ 4 Titel"
  {
    id: "chapter", rank: 4,
    re: /^\s*(?:kapitel|chapter|vorlesung|lecture|woche|week|einheit|unit|teil|part|§)\s*\d+(?:\.\d+)*\s*[.:—–-]?\s*(.*)$/i,
  },
  // "1. Titel", "2) Titel", "3.4 Titel"
  { id: "numbered", rank: 3, re: /^\s*(\d+(?:\.\d+)*)[.)]?\s+(.+)$/ },
  // "- Titel", "• Titel", "* Titel"
  { id: "bullet", rank: 2, re: /^\s*[-*•·–]\s+(.+)$/ },
];

// Zeilen, die nie ein Thema sind.
const NOISE = [
  /^\s*$/,
  /^[\d\s.,:;/-]+$/,                                    // reine Zahlen/Daten
  /^(seite|page|inhalt|inhaltsverzeichnis|contents|table of contents|literatur|references|impressum)\b/i,
  /^(prof|dr|dipl|m\.?sc|b\.?sc)\.?\s/i,
  /^https?:\/\//i,
];

const isNoise = (s) => NOISE.some((re) => re.test(s));

// Harte Obergrenze VOR jeder Musterarbeit. Die Aufräum-Regexe unten enthalten
// Wiederholungen mit Rückverfolgung (\.{3,}, [\s.:;,–—-]+); auf einer 100-kB-
// Zeile aus lauter Punkten läuft das quadratisch und blockiert den einzigen
// Node-Thread minutenlang — für ALLE Mandanten. Ein Titel, der länger als das
// Vierfache der erlaubten Länge ist, wird ohnehin verworfen; also wird hier
// zuerst gekappt und erst danach geputzt.
const MAX_RAW = MAX_LEN * 4;

// Rückwärts trimmen ohne Regex: /[\s.:;,–—-]+$/ backtrackt auf langen
// Trennzeichenläufen quadratisch. Eine Schleife ist linear und tut dasselbe.
const TRAIL = new Set([" ", "\t", "\n", "\r", ".", ":", ";", ",", "–", "—", "-"]);
function trimTrailing(s) {
  let end = s.length;
  while (end > 0 && TRAIL.has(s[end - 1])) end--;
  return end === s.length ? s : s.slice(0, end);
}

// Titel säubern: Nummern-/Seitenreste, Füllpunkte, Klammer-Zusätze am Ende.
function cleanTitle(raw) {
  const input = String(raw || "");
  let s = input.length > MAX_RAW ? input.slice(0, MAX_RAW) : input;
  s = s
    .replace(/\.{3,}\s*\d+\s*$/, "")        // "Automaten .......... 42"
    .replace(/\s*\|\s*\d+\s*$/, "")         // "Automaten | 42"
    .replace(/\s*\(\s*\d+\s*(?:seiten?|pages?|min|std|h)\s*\)\s*$/i, "");
  s = trimTrailing(s).replace(/\s+/g, " ").trim();
  // Führende Nummerierung, die durch ein anderes Muster gerutscht ist.
  s = s.replace(/^\d+(?:\.\d+)*[.)]?\s+/, "").trim();
  return s;
}

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Themen-Kandidaten aus freiem Text.
 * @returns {{ topics: {text:string, level:number}[], structure: string|null }}
 *   structure = welches Muster gegriffen hat (für ehrliche UI-Rückmeldung:
 *   „aus 12 Überschriften erkannt" statt eines anonymen Ergebnisses).
 */
export function extractOutline(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  if (!lines.length) return { topics: [], structure: null };

  // 1) Für jedes Muster sammeln, was es finden würde.
  const found = new Map();          // patternId → [{ text, level }]
  for (const line of lines) {
    if (isNoise(line)) continue;
    for (const p of PATTERNS) {
      const m = p.re.exec(line);
      if (!m) continue;
      let title, level = 1;
      if (p.id === "heading") { level = m[1].length; title = m[2]; }
      else if (p.id === "numbered") { level = (m[1].match(/\./g) || []).length + 1; title = m[2]; }
      else { title = m[1]; }
      const t = cleanTitle(title);
      if (t.length < MIN_LEN || t.length > MAX_LEN) continue;
      if (isNoise(t)) continue;
      if (!found.has(p.id)) found.set(p.id, []);
      found.get(p.id).push({ text: t, level });
      break;                        // eine Zeile zählt nur für ihr stärkstes Muster
    }
  }

  // 2) Struktur wählen. Die stärkste gewinnt — aber nur, wenn sie den Text auch
  //    wirklich erschließt. Zwei Überschriften über zwanzig Aufzählungspunkten
  //    sind eine Kapitelüberschrift, keine Themenliste: vorher hätten die zwei
  //    gewonnen und die zwanzig eigentlichen Themen wären verschwunden.
  const maxHits = Math.max(0, ...[...found.values()].map((h) => h.length));
  let picked = null;
  for (const p of [...PATTERNS].sort((a, b) => b.rank - a.rank)) {
    const hits = found.get(p.id);
    if (hits && hits.length >= 2 && hits.length >= maxHits * 0.25) {
      picked = { id: p.id, hits };
      break;
    }
  }
  // Keins erfüllt beides → das ergiebigste Muster nehmen (mehr Inhalt schlägt
  // formale Stärke), sofern es überhaupt eine Struktur ist.
  if (!picked && maxHits >= 2) {
    for (const p of PATTERNS) {
      const hits = found.get(p.id);
      if (hits && hits.length === maxHits) { picked = { id: p.id, hits }; break; }
    }
  }

  // 3) Gar keine Struktur → jede nicht-triviale Zeile als Thema lesen
  //    (der Fall „ich tippe meine Themen einfach untereinander").
  if (!picked) {
    const plain = lines
      .map((l) => cleanTitle(l))
      .filter((t) => t.length >= MIN_LEN && t.length <= MAX_LEN && !isNoise(t))
      .map((t) => ({ text: t, level: 1 }));
    picked = { id: plain.length ? "lines" : null, hits: plain };
  }

  // 4) Entdoppeln (Groß-/Kleinschreibung und Satzzeichen egal) und deckeln.
  const seen = new Set();
  const topics = [];
  for (const h of picked.hits) {
    const key = norm(h.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    topics.push(h);
    if (topics.length >= MAX_TOPICS) break;
  }

  return { topics, structure: topics.length ? picked.id : null };
}

/**
 * Aufgabentypen aus einer Freitext-Eingabe („Beweise, Automaten konstruieren;
 * Pumping-Lemma anwenden"). Bewusst simpel: trennen, säubern, entdoppeln —
 * hier wird nichts geraten.
 */
const MAX_TASK_TYPES = 20;
export function parseTaskTypes(text) {
  // Vorher: .filter(findIndex(...)) über das UNGEKÜRZTE Array, norm() zweimal
  // je Vergleich, .slice(20) erst danach — also O(n²) auf einer Eingabe, die
  // von außen kommt. Jetzt: ein Durchlauf, Set zum Entdoppeln, und Schluss,
  // sobald genug beisammen ist.
  const parts = String(text || "").split(/[,;\n·•]+/);
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    if (out.length >= MAX_TASK_TYPES) break;
    const s = cleanTitle(part);                 // cleanTitle kappt selbst auf MAX_RAW
    if (s.length < 2 || s.length > 80) continue;
    const key = norm(s);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Gliederung → Vorschlag im gemeinsamen Format (dasselbe, das die KI liefert),
 * damit die Oberfläche nur EINE Form kennen muss.
 * Ohne KI gibt es bewusst KEINE Zeitschätzung: eine erfundene Zahl wäre
 * schlechter als keine — die App lernt die echte Dauer ohnehin aus dem Tempo.
 */
export function outlineProposal(text, { taskTypes = [] } = {}) {
  const { topics, structure } = extractOutline(text);
  return {
    source: "outline",
    structure,
    taskTypes,
    topics: topics.map((t, i) => ({
      text: t.text,
      level: t.level,
      estMinutes: null,
      difficulty: null,
      dependsOn: [],
      // Reihenfolge = Reihenfolge im Dokument. Das ist die ehrlichste Annahme:
      // Lehrmaterial baut aufeinander auf.
      order: i,
      why: null,
      methods: [],
    })),
  };
}
