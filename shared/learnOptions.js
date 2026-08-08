// Reine Lernoptionen-Suche: "Habe ich schon eine Möglichkeit, Thema X zu lernen —
// und muss ich es überhaupt noch lernen?" Kein DOM, kein Storage, kein Side-Effect.
//
// Durchsucht Themen, Ressourcen (Titel + hinterlegter Bericht) und Notizen mit
// deutscher Normalisierung (Umlaute, zusammengesetzte Wörter grob via Substring).
// Liefert Treffer, eine ehrliche Einschätzung (lernen / auffrischen / sitzt) und
// Methoden-Vorschläge, wenn nichts Passendes existiert. UI-Texte macht der Client
// (i18n) — hier gibt es nur Daten und Codes.

// ── Methoden-Katalog (Vorschläge, wenn Material fehlt) ──
// kind entspricht resources.kind, damit "gibt es schon?" prüfbar ist.
export const LEARN_METHODS = [
  { id: "notebooklm", kind: "notebooklm" },   // Video-/Audio-Overview generieren
  { id: "summary", kind: "pdf" },             // Bericht/Zusammenfassung schreiben
  { id: "practice", kind: "link" },           // Altklausur/Übungsblatt durchrechnen
  { id: "flashcards", kind: "anki" },         // Karteikarten
  { id: "teach", kind: "link" },              // Feynman: laut erklären
];

// ── Deutsche Text-Normalisierung ─────────────────
export function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set(["der", "die", "das", "den", "dem", "ein", "eine", "und", "oder", "fuer", "mit", "von", "zu", "im", "in", "am", "an", "auf", "thema"]);

export function tokensOf(s) {
  return normalizeText(s).split(" ").filter((t) => t.length >= 2 && !STOP.has(t));
}

// Score 0..1: Token-Überlappung (auch Teilwort — "kellerautomaten" ~ "keller automaten").
export function scoreMatch(queryTokens, text) {
  if (!queryTokens.length) return 0;
  const norm = normalizeText(text);
  if (!norm) return 0;
  const textTokens = tokensOf(text);
  let hit = 0;
  for (const qt of queryTokens) {
    if (textTokens.some((tt) => tt === qt || tt.includes(qt) || qt.includes(tt))) { hit++; continue; }
    if (norm.replace(/ /g, "").includes(qt)) hit += 0.75;   // zusammengeschrieben
  }
  let score = hit / queryTokens.length;
  if (norm.includes(queryTokens.join(" "))) score = Math.min(1, score + 0.25);  // Phrase komplett
  return Math.min(1, score);
}

const THRESHOLD = 0.45;
const DAY_MS = 86_400_000;

// ── Hauptsuche ───────────────────────────────────
// { query, topics, resources, notes, exams, tasks?, methods?, now }
// methods: gewünschte Methoden-IDs/kinds (filtert Vorschläge UND boostet Treffer).
export function findLearnOptions({ query, topics = [], resources = [], notes = [], exams = [], methods = [], now = 0 } = {}) {
  const qt = tokensOf(query);
  const wanted = new Set(methods.map((m) => String(m).toLowerCase()).filter(Boolean));
  const examById = new Map(exams.map((e) => [e.id, e]));

  // Themen-Treffer inkl. verknüpfter Ressourcen + Prüfungskontext.
  const topicMatches = topics
    .map((t) => ({ topic: t, score: scoreMatch(qt, t.text) }))
    .filter((m) => m.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ topic, score }) => {
      const exam = topic.examId != null ? examById.get(topic.examId) : null;
      const linked = resources.filter((r) => r.topicId === topic.id);
      return {
        id: topic.id,
        text: topic.text,
        confidence: topic.confidence ?? 0,
        done: !!topic.done,
        score,
        examId: exam?.id ?? null,
        examName: exam?.name ?? null,
        daysLeft: exam?.date != null ? Math.max(0, Math.ceil((exam.date - now) / DAY_MS)) : null,
        resources: rankResources(linked, wanted).slice(0, 5),
      };
    });

  // Freie Ressourcen-Treffer (Titel + Bericht/Notes) jenseits der Topic-Verknüpfung.
  const topicResIds = new Set(topicMatches.flatMap((m) => m.resources.map((r) => r.id)));
  const resourceMatches = rankResources(
    resources
      .map((r) => ({ r, score: Math.max(scoreMatch(qt, r.title), scoreMatch(qt, r.notes || "") * 0.9) }))
      .filter((x) => x.score >= THRESHOLD && !topicResIds.has(x.r.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.r),
    wanted,
  );

  const noteMatches = notes
    .map((n) => ({ n, score: scoreMatch(qt, n.text) }))
    .filter((x) => x.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ n, score }) => ({ id: n.id, preview: String(n.text).slice(0, 160), subject: n.subject ?? null, score }));

  const best = topicMatches[0] || null;
  const assessment = assess(best, resourceMatches.length + (best?.resources.length || 0));
  const suggestions = suggest(best, wanted);

  return { query, topics: topicMatches, resources: resourceMatches, notes: noteMatches, assessment, suggestions };
}

function rankResources(list, wanted) {
  if (!wanted.size) return list;
  return [...list].sort((a, b) => matchKind(b, wanted) - matchKind(a, wanted));
}
function matchKind(r, wanted) {
  const kind = String(r.kind || "").toLowerCase();
  return wanted.has(kind) || wanted.has(methodIdForKind(kind)) ? 1 : 0;
}
function methodIdForKind(kind) {
  return LEARN_METHODS.find((m) => m.kind === kind)?.id || "";
}

// Ehrliche Einschätzung: muss das überhaupt (noch) gelernt werden?
// verdict: 'learn' | 'refresh' | 'covered' | 'unknown' + begründende Codes.
function assess(best, resourceCount) {
  if (!best) return { verdict: "unknown", topicId: null, reasons: ["no_topic"] };
  const reasons = [];
  let verdict;
  if (best.done || best.confidence >= 3) {
    verdict = best.daysLeft != null && best.daysLeft <= 7 ? "refresh" : "covered";
    reasons.push("confidence_high");
  } else if (best.confidence === 2) {
    verdict = best.daysLeft != null && best.daysLeft <= 14 ? "learn" : "refresh";
    reasons.push("confidence_mid");
  } else {
    verdict = "learn";
    reasons.push("confidence_low");
  }
  if (best.daysLeft != null && best.daysLeft <= 14) reasons.push("exam_soon");
  if (!resourceCount) reasons.push("no_resources");
  return { verdict, topicId: best.id, reasons };
}

// Methoden-Vorschläge: gewünschte zuerst, bereits vorhandene Arten ans Ende.
function suggest(best, wanted) {
  const have = new Set((best?.resources || []).map((r) => String(r.kind || "").toLowerCase()));
  const pool = wanted.size
    ? LEARN_METHODS.filter((m) => wanted.has(m.id) || wanted.has(m.kind))
    : LEARN_METHODS;
  const fresh = pool.filter((m) => !have.has(m.kind));
  const existing = pool.filter((m) => have.has(m.kind));
  return [...fresh, ...existing].slice(0, 4).map((m) => ({ id: m.id, kind: m.kind, exists: have.has(m.kind) }));
}
