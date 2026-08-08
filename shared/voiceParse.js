// Reine deutsche Sprach-Erfassung für den Kairos-Planer:
// Transkript (Web-Speech, meist kleingeschrieben) → Aufgaben-Entwürfe (Drafts).
// Kein DOM, kein Date.now(), kein Side-Effect — deterministisch gegeben
// (transcript, todayKey). Geteilt von PWA, Extension und Node-Tests.

import { keyToParts, partsToKey, addDaysKey, weekdayOfKey } from "./dateKey.js";

// ── Wortgrenzen (Umlaut-sicher) ──────────────────
// \b behandelt ä/ö/ü/ß nicht als Wortzeichen ("\bübermorgen" matcht nie nach
// Leerzeichen), daher eigene Grenzen per Lookbehind/Lookahead.
const B = "(?<![a-zäöüß0-9])";
const E = "(?![a-zäöüß0-9])";

function rx(pattern) {
  return new RegExp(B + "(?:" + pattern + ")" + E, "i");
}

// Treffer aus dem Arbeitstext schneiden (durch ein Leerzeichen ersetzen),
// damit der Titel am Ende ohne die erkannten Fragmente übrig bleibt.
function cut(work, m) {
  return work.slice(0, m.index) + " " + work.slice(m.index + m[0].length);
}

// ── Zahlwörter (eins..zwölf) ─────────────────────
const NUM_WORD_RX = "eine[rn]?|eins?|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf";
const NUM_WORDS = {
  eins: 1, ein: 1, eine: 1, einer: 1, einen: 1, zwei: 2, drei: 3, vier: 4,
  "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, "zwölf": 12,
};

function readNum(token) {
  const t = String(token || "").toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  return Object.hasOwn(NUM_WORDS, t) ? NUM_WORDS[t] : null;
}

// ── Kalender-Tabellen ────────────────────────────
const WEEKDAYS = { montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 0 };
const WEEKDAY_RX = "montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag";
const WEEKDAY_ABBR = { mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 0 };
const MONTHS = {
  januar: 1, februar: 2, "märz": 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};
const MONTH_RX = "januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember";
const NEXT_RX = "(?:nächste\\s+woche\\s+|nächste[nrms]?\\s+)";

// Nächstes Vorkommen eines Wochentags: heute erlaubt, außer forceNext
// ("nächsten montag" → immer 1..7 Tage in der Zukunft).
function nextWeekdayKey(todayKey, target, forceNext) {
  const today = weekdayOfKey(todayKey);
  if (today == null || target == null) return null;
  let delta = (target - today + 7) % 7;
  if (forceNext && delta === 0) delta = 7;
  return addDaysKey(todayKey, delta);
}

// "12.3." / "3. april" → dieses Jahr; liegt das Datum vor todayKey → nächstes Jahr.
function explicitDateKey(d, mo, todayKey) {
  const base = keyToParts(todayKey);
  if (!base || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  for (const y of [base.y, base.y + 1]) {
    const dt = new Date(y, mo - 1, d);
    if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    const key = partsToKey({ y, mo, d });
    if (key >= todayKey) return key;
  }
  return null;
}

// ── Datumsphrasen (geteilt von plannedDate und dueKey) ──────
function resolveDatePhrase(raw, todayKey) {
  const s = String(raw || "").toLowerCase().replace(/^(?:am|zum|zur)\s+/, "").trim();
  if (s === "heute") return todayKey;
  if (s === "morgen") return addDaysKey(todayKey, 1);
  if (s === "übermorgen") return addDaysKey(todayKey, 2);
  let m = new RegExp(`^(?:${NEXT_RX})?(${WEEKDAY_RX})$`).exec(s);
  if (m) return nextWeekdayKey(todayKey, WEEKDAYS[m[1]], /^nächste/.test(s));
  m = /^(\d{1,2})\.\s*(\d{1,2})\.?$/.exec(s);
  if (m) return explicitDateKey(Number(m[1]), Number(m[2]), todayKey);
  m = new RegExp(`^(\\d{1,2})\\.?\\s+(${MONTH_RX})$`).exec(s);
  if (m) return explicitDateKey(Number(m[1]), MONTHS[m[2]], todayKey);
  return null;
}

// ── Deadline („bis …“ / „deadline …“ → dueKey statt plannedDate) ──
const DEADLINE_RX = rx(
  "(?:bis(?:\\s+zu[mr])?|deadline)\\s+((?:am\\s+)?(?:heute|morgen|übermorgen" +
  `|(?:${NEXT_RX})?(?:${WEEKDAY_RX})` +
  "|\\d{1,2}\\.\\s*\\d{1,2}\\.?" +
  `|\\d{1,2}\\.?\\s+(?:${MONTH_RX})))`
);

// ── Datum → plannedDate (erster Treffer in Prioritätsreihenfolge) ──
const DATE_PATTERNS = [
  { re: rx("übermorgen"), fn: (m, t) => ({ key: addDaysKey(t, 2) }) },
  // „morgen früh“ = morgen ~08:00 (Tageszeit-Wert, explizite Uhrzeit gewinnt).
  { re: rx("morgen\\s+früh"), fn: (m, t) => ({ key: addDaysKey(t, 1), daypartMin: 8 * 60 }) },
  { re: rx("morgen"), fn: (m, t) => ({ key: addDaysKey(t, 1) }) },
  { re: rx("heute"), fn: (m, t) => ({ key: t }) },
  { re: rx(`(?:am\\s+)?${NEXT_RX}(${WEEKDAY_RX})`), fn: (m, t) => ({ key: nextWeekdayKey(t, WEEKDAYS[m[1].toLowerCase()], true) }) },
  { re: rx(`(?:am\\s+)?(${WEEKDAY_RX})`), fn: (m, t) => ({ key: nextWeekdayKey(t, WEEKDAYS[m[1].toLowerCase()], false) }) },
  // Kürzel nur nach „am “ (sonst kollidieren „so“, „mi“ … mit normaler Sprache).
  { re: rx("am\\s+(mo|di|mi|do|fr|sa|so)"), fn: (m, t) => ({ key: nextWeekdayKey(t, WEEKDAY_ABBR[m[1].toLowerCase()], false) }) },
  { re: rx("am\\s+(\\d{1,2})\\.\\s*(\\d{1,2})\\.?"), fn: (m, t) => ({ key: explicitDateKey(Number(m[1]), Number(m[2]), t) }) },
  { re: rx(`(?:am\\s+)?(\\d{1,2})\\.?\\s+(${MONTH_RX})`), fn: (m, t) => ({ key: explicitDateKey(Number(m[1]), MONTHS[m[2].toLowerCase()], t) }) },
];

// ── Uhrzeit → scheduledMin ───────────────────────
// Lern-Kontext-Heuristik: nackte Stunden 1..5 meinen den Nachmittag (+12 h).
function adjustHour(h) {
  return h >= 1 && h <= 5 ? h + 12 : h;
}

function clock(h, min) {
  return Number.isInteger(h) && h >= 0 && h <= 23 && min >= 0 && min <= 59 ? h * 60 + min : null;
}

function hourClock(token, offset, min) {
  const n = readNum(token);
  return n == null ? null : clock(adjustHour(n + offset), min);
}

const HOUR_RX = `\\d{1,2}|${NUM_WORD_RX}`;
const TIME_PATTERNS = [
  // „halb 3“ = (3−1):30, Heuristik auf der Ergebnisstunde → 14:30.
  { re: rx(`(?:um\\s+)?halb\\s+(${HOUR_RX})`), fn: (m) => hourClock(m[1], -1, 30) },
  { re: rx(`viertel\\s+nach\\s+(${HOUR_RX})`), fn: (m) => hourClock(m[1], 0, 15) },
  // „viertel vor 3“ = (3−1):45 → 14:45.
  { re: rx(`viertel\\s+vor\\s+(${HOUR_RX})`), fn: (m) => hourClock(m[1], -1, 45) },
  { re: rx("um\\s+(\\d{1,2})[:.](\\d{2})"), fn: (m) => clock(adjustHour(Number(m[1])), Number(m[2])) },
  { re: rx("um\\s+(\\d{1,2})\\s+uhr\\s+(\\d{1,2})(?!\\s*(?:minuten|minute|min|stunden|stunde))"), fn: (m) => clock(adjustHour(Number(m[1])), Number(m[2])) },
  { re: rx(`um\\s+(${HOUR_RX})\\s+uhr`), fn: (m) => hourClock(m[1], 0, 0) },
  // Nackte Stunde nur als Ziffer („um 3“) — Zahlwörter wären zu mehrdeutig.
  { re: rx("um\\s+(\\d{1,2})"), fn: (m) => clock(adjustHour(Number(m[1])), 0) },
];

// ── Tageszeiten (Wert nur, wenn keine explizite Uhrzeit) ──────
const DAYPART_RX = rx("(?:am\\s+)?(nachmittags?|vormittags?|mittags?|abends?|morgens|früh)");

function daypartValue(word) {
  const w = word.toLowerCase();
  if (w.startsWith("nachmittag")) return 15 * 60;
  if (w.startsWith("vormittag")) return 9 * 60;
  if (w.startsWith("mittag")) return 12 * 60;
  if (w.startsWith("abend")) return 19 * 60;
  return 9 * 60; // morgens, früh
}

// ── Dauer → estMinutes ───────────────────────────
const APPROX_RX = "(?:für\\s+)?(?:circa\\s+|ca\\.?\\s+|etwa\\s+|ungefähr\\s+)?";
const LANG_RX = "(?:\\s+lang)?";
const DUR_PATTERNS = [
  { re: rx(APPROX_RX + "(?:eine\\s+)?dreiviertelstunde" + LANG_RX), fn: () => 45 },
  { re: rx(APPROX_RX + "(anderthalb|eineinhalb|zweieinhalb)\\s+stunden?" + LANG_RX), fn: (m) => (m[1].toLowerCase() === "zweieinhalb" ? 150 : 90) },
  { re: rx(APPROX_RX + "(?:eine\\s+)?halbe\\s+stunde" + LANG_RX), fn: () => 30 },
  { re: rx(APPROX_RX + "(?:eine\\s+)?viertelstunde" + LANG_RX), fn: () => 15 },
  { re: rx(APPROX_RX + `(\\d+|${NUM_WORD_RX})\\s*(?:minuten|minute|min\\.?)` + LANG_RX), fn: (m) => readNum(m[1]) },
  { re: rx(APPROX_RX + `(\\d+|${NUM_WORD_RX})\\s*(?:stunden|stunde|h)` + LANG_RX), fn: (m) => { const n = readNum(m[1]); return n == null ? null : n * 60; } },
];

// ── Priorität (1 dringend .. 4 irgendwann) ───────
const PRIO_PATTERNS = [
  { re: rx("prio(?:rität)?\\s*([1-4])"), fn: (m) => Number(m[1]) },
  { re: rx("(?:wichtig|dringend|asap|unbedingt)(?:e[srnm]?)?"), fn: () => 1 },
  { re: rx("kann\\s+warten"), fn: () => 3 },
  { re: rx("irgendwann"), fn: () => 4 },
  { re: rx("bei\\s+gelegenheit"), fn: () => 4 },
];

// ── Schwierigkeit (Wörter bleiben im Titel stehen) ──
const DIFF_HARD_RX = rx("(?:schwierig|schwer|komplex|anspruchsvoll|hart)(?:e[srnm]?)?");
const DIFF_EASY_RX = rx("(?:leicht|einfach|simpel|simple)(?:e[srnm]?)?");

// ── Lern-Absicht → learnQuery ────────────────────
const LEARN_VERB_RX =
  "anschauen|angucken|ansehen|lernen|lerne|wiederholen|wiederhole|üben|übe" +
  "|durchgehen|durchrechnen|vorbereiten|verstehen|verstehe|nacharbeiten|zusammenfassen";
const LEARN_VERB = rx(LEARN_VERB_RX);
// Trennbare Formen: „schau … an“, „gucke … an“, „sehe … an“.
const SEP_STEM_RX = "schaue?|gucke?|sehe?|sieh";
const SEP_VERB = new RegExp(B + "(?:" + SEP_STEM_RX + ")" + E + "[\\s\\S]+?" + B + "an" + E, "i");

// Füllwörter, die aus dem Lernthema entfernt werden (bewusst OHNE „und“,
// damit Mehrwort-Themen wie „analysis und algebra“ intakt bleiben).
const QUERY_FILLERS = [
  "noch einmal", "nochmal", "noch", "einmal", "mal", "wieder",
  "ich", "muss", "mir", "mich", "dir", "das", "die", "der", "den",
  "thema", "bitte", "will", "sollte", "möchte",
];

function buildLearnQuery(work) {
  let q = String(work).toLowerCase();
  if (SEP_VERB.test(q)) {
    q = q.replace(new RegExp(B + "(?:" + SEP_STEM_RX + ")" + E, "gi"), " ");
    q = q.replace(new RegExp(B + "an" + E, "gi"), " ");
  }
  q = q.replace(new RegExp(B + "(?:" + LEARN_VERB_RX + ")" + E, "gi"), " ");
  for (const filler of QUERY_FILLERS) {
    q = q.replace(new RegExp(B + filler.replace(" ", "\\s+") + E, "gi"), " ");
  }
  q = q.replace(/[,.;:!?]+/g, " ").replace(/\s+/g, " ").trim();
  return q || null;
}

// ── Titel-Bereinigung ────────────────────────────
// Führende Füllwörter iterativ abtragen („ich muss mir nochmal …“).
const LEAD_FILLER_RX = new RegExp(
  "^(?:ich|muss|will|sollte|möchte|bitte|mir|mich|dir|noch|nochmal|einmal|mal|wieder)" + E + "[\\s,]*",
  "i"
);

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function cleanupText(work, original) {
  let s = work.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+([,.;:!?])/g, "$1").replace(/([,.;:!?])(?:\s*[,.;:!?])+/g, "$1");
  s = s.replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, "");
  let prev;
  do {
    prev = s;
    s = s.replace(LEAD_FILLER_RX, "");
  } while (s !== prev);
  s = s.replace(/\s+/g, " ").trim();
  // Wenn die Bereinigung alles verschluckt hat: Original-Segment als Titel.
  if (!s) s = String(original).replace(/\s+/g, " ").trim();
  return capitalize(s);
}

// ── Segment-Parser ───────────────────────────────
function parseSegment(segment, todayKey) {
  const hasToday = keyToParts(String(todayKey || "")) != null;
  const draft = {
    text: "",
    plannedDate: null,
    scheduledMin: null,
    estMinutes: null,
    dueKey: null,
    priority: null,
    difficulty: null,
    learnQuery: null,
  };
  let work = segment;
  let daypartMin = null;
  let explicitMin = null;

  // ── Deadline vor Datum (sonst würde „bis freitag“ zum Plandatum) ──
  if (hasToday) {
    const dl = DEADLINE_RX.exec(work);
    if (dl) {
      const key = resolveDatePhrase(dl[1], todayKey);
      if (key) {
        draft.dueKey = key;
        work = cut(work, dl);
      }
    }
  }

  // ── Datum ──────────────────────────────────────
  if (hasToday) {
    for (const p of DATE_PATTERNS) {
      const m = p.re.exec(work);
      if (!m) continue;
      const res = p.fn(m, todayKey);
      if (!res || !res.key) continue; // ungültig (z. B. „am 31.2.“) → im Titel lassen
      draft.plannedDate = res.key;
      if (res.daypartMin != null) daypartMin = res.daypartMin;
      work = cut(work, m);
      break;
    }
  }

  // ── Uhrzeit ────────────────────────────────────
  for (const p of TIME_PATTERNS) {
    const m = p.re.exec(work);
    if (!m) continue;
    const min = p.fn(m);
    if (min == null) continue;
    explicitMin = min;
    work = cut(work, m);
    break;
  }

  // ── Tageszeiten (immer aus dem Titel entfernen) ──
  let dp;
  while ((dp = DAYPART_RX.exec(work))) {
    if (daypartMin == null) daypartMin = daypartValue(dp[1]);
    work = cut(work, dp);
  }
  draft.scheduledMin = explicitMin != null ? explicitMin : daypartMin;

  // ── Dauer ──────────────────────────────────────
  for (const p of DUR_PATTERNS) {
    const m = p.re.exec(work);
    if (!m) continue;
    const v = p.fn(m);
    if (v == null || v <= 0) continue;
    draft.estMinutes = v;
    work = cut(work, m);
    break;
  }

  // ── Priorität ──────────────────────────────────
  for (const p of PRIO_PATTERNS) {
    const m = p.re.exec(work);
    if (!m) continue;
    if (draft.priority == null) draft.priority = p.fn(m);
    work = cut(work, m);
  }

  // ── Schwierigkeit ──────────────────────────────
  if (DIFF_HARD_RX.test(work)) draft.difficulty = 3;
  else if (DIFF_EASY_RX.test(work)) draft.difficulty = 1;

  // ── Lernthema + Titel ──────────────────────────
  const isLearn = LEARN_VERB.test(work) || SEP_VERB.test(work);
  draft.text = cleanupText(work, segment);
  if (isLearn) draft.learnQuery = buildLearnQuery(work);
  return draft;
}

// ── Wake-Word + Multi-Task-Split ─────────────────
const WAKE_RX = new RegExp(
  "^\\s*(?:(?:hey|ok)[\\s,]+(?:kairos|cairos)|hey)" + E + "[\\s,]*",
  "i"
);
// Bewusst NICHT auf bloßes „ und “ splitten („analysis und algebra lernen“
// ist EINE Aufgabe) — nur auf explizite Sequenz-Marker.
const SPLIT_RX = /\s+und\s+dann\s+|\s+und\s+(?:danach|noch)\s+|\s+(?:und\s+)?außerdem\s+|\s+danach\s+|\s*;\s+/i;

// ── Öffentliche API ──────────────────────────────
// parseVoiceCapture(transcript, { todayKey }) → { wake, items }
export function parseVoiceCapture(transcript, { todayKey } = {}) {
  const raw = String(transcript ?? "");
  if (!raw.trim()) return { wake: false, items: [] };
  let rest = raw.trim();
  let wake = false;
  const wm = WAKE_RX.exec(rest);
  if (wm) {
    wake = true;
    rest = rest.slice(wm[0].length);
  }
  const items = rest
    .split(SPLIT_RX)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => parseSegment(seg, todayKey));
  return { wake, items };
}
