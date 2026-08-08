// KI-Lernbuddy: Provider-Proxy + lernprofil-adaptiver Systemprompt.
//
// Zero-Dependency wie der Rest des Backends: alle Provider werden per fetch
// angesprochen (kein SDK). Unterstützt:
//   • ollama    — lokal, kostenlos (http://127.0.0.1:11434, /api/chat)
//   • openai    — jeder OpenAI-kompatible Endpunkt (LM Studio, Groq, OpenRouter, …)
//   • anthropic — Claude API (POST /v1/messages, x-api-key)
// API-Keys liegen NUR verschlüsselt in der DB (lib/secret.js) und verlassen den
// Server nie Richtung Client; der Chat läuft server-seitig (kein CORS, kein Key im Browser).
import * as repo from "./repo.js";
import { httpErr, str } from "./lib/util.js";
import { encryptSecret, decryptSecret } from "./lib/secret.js";
import { LEARN_STYLES, CHALLENGES, METHODS } from "../shared/methods.js";

export const PROVIDERS = ["none", "ollama", "openai", "anthropic"];

const DEFAULTS = {
  ollama: { baseUrl: "http://127.0.0.1:11434", model: "llama3.2" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-opus-5" },
};

const REQUEST_TIMEOUT_MS = 120_000; // lokale Modelle brauchen beim Kaltstart Zeit
const MAX_REPLY_TOKENS = 1500;
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 8000;

// ── Konfiguration (Client-Sicht ohne Key) ───────────────────────────────
export function getConfigView() {
  const row = repo.getAiConfigRow();
  const provider = PROVIDERS.includes(row?.provider) ? row.provider : "none";
  return {
    provider,
    baseUrl: row?.base_url || (DEFAULTS[provider]?.baseUrl ?? null),
    model: row?.model || (DEFAULTS[provider]?.model ?? null),
    hasKey: !!row?.api_key_enc,
    ready: provider !== "none" && (provider === "ollama" || !!row?.api_key_enc || provider === "openai"),
  };
}

export function saveConfig(b = {}) {
  const patch = {};
  if (b.provider !== undefined) {
    const p = str(b.provider);
    if (!PROVIDERS.includes(p)) throw httpErr(400, "Unbekannter Provider");
    patch.provider = p;
  }
  if (b.baseUrl !== undefined) patch.baseUrl = b.baseUrl ? str(b.baseUrl).trim() : null;
  if (b.model !== undefined) patch.model = b.model ? str(b.model).trim() : null;
  // apiKey: undefined = behalten · "" / null = löschen · String = neu verschlüsseln.
  if (b.apiKey !== undefined) patch.apiKeyEnc = b.apiKey ? encryptSecret(str(b.apiKey)) : null;
  repo.saveAiConfig(patch);
  return getConfigView();
}

// ── Lernprofil → Systemprompt ───────────────────────────────────────────
const label = (list, id, lang) => {
  const item = list.find((x) => x.id === id);
  return item ? (item[lang] || item.de) : null;
};

// Konkrete Stil-Anweisungen je Lernweg (das Herz der Anpassung).
const STYLE_HINTS = {
  de: {
    visual: "Erkläre bevorzugt bildlich: nutze wo sinnvoll kleine ASCII-Diagramme, Tabellen, Schemata und räumliche Metaphern („stell dir vor…“).",
    write: "Die Person lernt durchs Schreiben: Diktiere am Ende 2–3 kompakte Merksätze zum Abschreiben und schlage vor, Kernpunkte in eigenen Worten zu notieren.",
    read: "Strukturiere Antworten klar mit kurzen Absätzen und Zwischenüberschriften zum Nachlesen.",
    listen: "Nutze Merksätze, Reime und Eselsbrücken, die man sich laut vorsagen kann.",
    speak: "Beende Erklärungen mit einer Rückfrage, die die Person in eigenen Worten beantworten soll (Feynman-Stil).",
    move: "Verknüpfe Inhalte mit Bewegungs- oder Körper-Ankern und schlage vor, Wiederholungen beim Gehen zu machen.",
    social: "Schlage vor, das Gelernte jemandem zu erklären oder gemeinsam zu üben.",
    do: "Gib nach jeder Erklärung eine kleine Übungsaufgabe zum Selbstlösen — Lösung erst auf Nachfrage.",
  },
  en: {
    visual: "Prefer visual explanations: use small ASCII diagrams, tables, schemas and spatial metaphors where helpful.",
    write: "This person learns by writing: end with 2–3 compact takeaway sentences to copy down, and suggest noting key points in their own words.",
    read: "Structure answers clearly with short paragraphs and small headings for re-reading.",
    listen: "Use memorable phrases, rhymes and mnemonics that can be said out loud.",
    speak: "End explanations with a question the person should answer in their own words (Feynman style).",
    move: "Link content to movement/body anchors and suggest reviewing while walking.",
    social: "Suggest explaining the material to someone else or practising together.",
    do: "After each explanation give a small practice problem to solve — solution only on request.",
  },
};

const CHALLENGE_HINTS = {
  de: {
    focus: "Konzentration: Halte Antworten kurz, EIN Gedanke pro Absatz, maximal ein nächster Schritt pro Antwort, keine Textwände.",
    dyslexia: "Legasthenie: kurze Sätze, einfache Wörter, Aufzählungen statt Fließtext, wichtige Begriffe **fett**.",
    dyscalculia: "Dyskalkulie: Jeden Rechenschritt einzeln zeigen, Zahlen mit Alltagsbeispielen verankern, nie mehrere Rechnungen in einem Satz.",
    anxiety: "Prüfungsangst: Ermutigend und normalisierend formulieren; betone, dass Fehler zum Lernen gehören.",
    procrastination: "Neigt zum Aufschieben: Schlage immer einen winzigen, sofort machbaren ersten Schritt vor.",
    overwhelm: "Schnell überfordert: Eine Sache nach der anderen; frage nach, bevor du zusätzliche Themen aufmachst.",
  },
  en: {
    focus: "Focus: keep answers short, ONE idea per paragraph, at most one next step per reply, no walls of text.",
    dyslexia: "Dyslexia: short sentences, simple words, bullet lists over prose, key terms in **bold**.",
    dyscalculia: "Dyscalculia: show every calculation step separately, anchor numbers in everyday examples, never several calculations in one sentence.",
    anxiety: "Test anxiety: encourage and normalise; stress that mistakes are part of learning.",
    procrastination: "Tends to procrastinate: always suggest a tiny, immediately doable first step.",
    overwhelm: "Easily overwhelmed: one thing at a time; ask before opening additional topics.",
  },
};

// mode "chat" → der Lern-Buddy (kompakte Prosa).
// mode "plan" → derselbe Lernprofil-Kontext, aber die Ausgabe ist strikt JSON.
//   Der Profilteil ist bewusst identisch: der Nutzer will, dass die Zerlegung
//   seinen Lerntyp und seine Besonderheiten berücksichtigt, nicht nur der Chat.
export function buildSystemPrompt({ lang = "de", mode = "chat" } = {}) {
  const l = lang === "en" ? "en" : "de";
  const profile = repo.getProfile() || {};
  const prefs = repo.getPrefs() || {};
  const styles = Array.isArray(prefs.learnStyles) ? prefs.learnStyles : [];
  const challenges = Array.isArray(prefs.challenges) ? prefs.challenges : [];
  const methodIds = Array.isArray(prefs.methods) ? prefs.methods : [];

  const lines = [];
  if (l === "de") {
    lines.push("Du bist der Lern-Buddy in „Kairos“, einer Lern-App für Prüfungsvorbereitung. Antworte auf Deutsch (Du-Form).");
    if (profile.displayName) lines.push(`Dein Gegenüber heißt ${profile.displayName}.`);
    lines.push("Du erklärst Lernstoff, beantwortest Verständnisfragen und hilfst beim Planen — freundlich, konkret, ohne Floskeln.");
  } else {
    lines.push("You are the study buddy inside “Kairos”, a study app for exam preparation. Reply in English.");
    if (profile.displayName) lines.push(`You are talking to ${profile.displayName}.`);
    lines.push("You explain material, answer comprehension questions and help with planning — friendly, concrete, no fluff.");
  }

  if (styles.length) {
    const names = styles.map((s) => label(LEARN_STYLES, s, l)).filter(Boolean).join(", ");
    lines.push(l === "de" ? `Bevorzugte Lernwege: ${names}.` : `Preferred ways of learning: ${names}.`);
    for (const s of styles) if (STYLE_HINTS[l][s]) lines.push("- " + STYLE_HINTS[l][s]);
  }
  if (challenges.length) {
    const names = challenges.map((c) => label(CHALLENGES, c, l)).filter(Boolean).join(", ");
    lines.push(l === "de" ? `Besonderheiten: ${names}.` : `Considerations: ${names}.`);
    for (const c of challenges) if (CHALLENGE_HINTS[l][c]) lines.push("- " + CHALLENGE_HINTS[l][c]);
  }
  if (methodIds.length) {
    const names = methodIds.map((id) => {
      const m = METHODS.find((x) => x.id === id);
      return m ? (m[l]?.name || m.de.name) : null;
    }).filter(Boolean).slice(0, 8).join(", ");
    if (names) lines.push(l === "de" ? `Aktive Lernmethoden in der App: ${names}. Baue sie ein, wo es passt (z. B. kleine Abruf-Fragen am Ende).` : `Active study methods in the app: ${names}. Weave them in where it fits (e.g. a small recall question at the end).`);
  }
  if (profile.aiNotes) lines.push((l === "de" ? "Notiz der Person an dich: " : "Note from the person to you: ") + profile.aiNotes);

  if (mode === "plan") {
    lines.push(l === "de" ? PLAN_RULES.de : PLAN_RULES.en);
    return lines.join("\n");
  }
  lines.push(l === "de"
    ? "Halte Antworten kompakt (unter ~250 Wörtern), außer es wird ausdrücklich mehr verlangt. Keine internen oder System-XML-Tags in der Antwort."
    : "Keep answers compact (under ~250 words) unless more is explicitly requested. Do not include internal or system XML tags in your response.");
  return lines.join("\n");
}

// ── Lernziel → Themen & Ablauf ──────────────────────────────────────────
// Der Vertrag ist bewusst eng: NUR JSON, feste Felder, harte Obergrenzen.
// Alles, was zurückkommt, wird danach trotzdem validiert und geklemmt
// (validateProposal) — ein Modell ist keine vertrauenswürdige Datenquelle.
const PLAN_RULES = {
  de: `AUFGABE: Zerlege das Lernziel in Lernthemen und bringe sie in eine sinnvolle Reihenfolge.

Antworte AUSSCHLIESSLICH mit JSON in genau dieser Form, ohne Text davor oder danach, ohne Code-Zaun:
{"summary":"ein Satz, was der Plan abdeckt",
 "topics":[{"text":"Themenname (max. 90 Zeichen)","estMinutes":60,"difficulty":2,
            "dependsOn":[0],"why":"ein kurzer Satz, warum es dran ist",
            "practice":"welcher Aufgabentyp hier geübt wird oder null"}]}

Regeln:
- Reihenfolge = Lernreihenfolge. Grundlagen zuerst.
- "dependsOn" enthält NUR Indizes vorheriger Themen aus derselben Liste (0-basiert). Keine Zyklen.
- "difficulty": 1 leicht, 2 mittel, 3 schwer.
- "estMinutes": realistische Netto-Lernzeit für EINEN Durchgang, 15–240.
- Höchstens 25 Themen. Lieber wenige, klar geschnittene als viele winzige.
- Nutze den eingefügten Text als Quelle, wenn einer da ist: übernimm seine Begriffe und
  seine Struktur, statt eigene zu erfinden. Was nicht drinsteht, erfindest du nicht.
- Sind Aufgabentypen der Prüfung genannt, richte "practice" daran aus.
- Sprache der Themen: Deutsch.`,
  en: `TASK: Break the learning goal into study topics and put them in a sensible order.

Reply with JSON ONLY, exactly this shape, no prose before or after, no code fence:
{"summary":"one sentence on what the plan covers",
 "topics":[{"text":"topic name (max 90 chars)","estMinutes":60,"difficulty":2,
            "dependsOn":[0],"why":"one short sentence why it comes here",
            "practice":"which task type is practised here, or null"}]}

Rules:
- Order = learning order. Fundamentals first.
- "dependsOn" holds ONLY indices of earlier topics in the same list (0-based). No cycles.
- "difficulty": 1 easy, 2 medium, 3 hard.
- "estMinutes": realistic net study time for ONE pass, 15–240.
- At most 25 topics. Prefer few well-cut ones over many tiny ones.
- If pasted source text is given, use its wording and structure instead of inventing your
  own. Do not invent anything that is not in it.
- If the exam's task types are given, aim "practice" at them.
- Topic language: English.`,
};

// ── Chat ────────────────────────────────────────────────────────────────
function sanitizeMessages(raw) {
  if (!Array.isArray(raw) || !raw.length) throw httpErr(400, "messages fehlt");
  const out = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    const role = m?.role === "assistant" ? "assistant" : "user";
    const content = str(m?.content).slice(0, MAX_MESSAGE_CHARS).trim();
    if (!content) continue;
    // Rollen müssen alternieren (Anthropic verlangt es; den anderen schadet es nicht).
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += "\n\n" + content;
    else out.push({ role, content });
  }
  if (!out.length) throw httpErr(400, "messages leer");
  if (out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") throw httpErr(400, "Letzte Nachricht muss vom Nutzer sein");
  return out;
}

async function fetchJson(url, { headers = {}, body }) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === "TimeoutError") throw httpErr(504, "KI-Anbieter antwortet nicht (Timeout)");
    throw httpErr(502, `KI-Anbieter nicht erreichbar (${err.message})`);
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* Fehlertext unten */ }
  if (!res.ok) {
    const detail = json?.error?.message || json?.error || text.slice(0, 200) || `HTTP ${res.status}`;
    throw httpErr(502, `KI-Anbieter meldet Fehler: ${detail}`);
  }
  return json;
}

// Kontext (aktuelles Thema/Prüfung) als letzte Systeminfo an die Nutzerfrage heften.
function contextPrefix(context, lang) {
  if (!context) return null;
  const bits = [];
  if (context.topic) bits.push((lang === "de" ? "Aktuelles Lernthema: " : "Current study topic: ") + str(context.topic).slice(0, 200));
  if (context.exam) bits.push((lang === "de" ? "Prüfung: " : "Exam: ") + str(context.exam).slice(0, 200));
  if (context.material) bits.push((lang === "de" ? "Materialauszug:\n" : "Material excerpt:\n") + str(context.material).slice(0, 4000));
  return bits.length ? bits.join("\n") : null;
}

// Einwilligung + Anbieter prüfen. Fail-closed: ohne beides passiert nichts,
// und die Meldung sagt, WO man es einschaltet.
function requireProvider(lang) {
  const profile = repo.getProfile();
  if (!profile?.aiEnabled) {
    throw httpErr(403, lang === "de"
      ? "KI ist ausgeschaltet — aktiviere sie im Profil unter „KI-Planung & Vorschläge“."
      : "AI is turned off — enable it in your profile under “AI planning & suggestions”.");
  }
  const row = repo.getAiConfigRow();
  const provider = row?.provider;
  if (!provider || provider === "none") {
    throw httpErr(400, lang === "de"
      ? "Kein KI-Anbieter eingerichtet — wähle im Profil einen Anbieter (Ollama ist kostenlos & lokal)."
      : "No AI provider configured — pick one in your profile (Ollama is free & local).");
  }
  return {
    provider, row,
    baseUrl: (row.base_url || DEFAULTS[provider].baseUrl).replace(/\/+$/, ""),
    model: row.model || DEFAULTS[provider].model,
    apiKey: row.api_key_enc ? decryptSecret(row.api_key_enc) : null,
  };
}

// Ein Aufruf gegen den eingestellten Anbieter. Kapselt die drei Protokolle,
// damit Chat und Planer sich dieselbe Anbindung teilen.
// → { reply, model, provider, refused? }
async function callModel({ system, messages, maxTokens = MAX_REPLY_TOKENS, lang = "de" }) {
  const { provider, baseUrl, model, apiKey } = requireProvider(lang);

  if (provider === "ollama") {
    const json = await fetchJson(`${baseUrl}/api/chat`, {
      body: { model, stream: false, messages: [{ role: "system", content: system }, ...messages] },
    });
    const reply = str(json?.message?.content).trim();
    if (!reply) throw httpErr(502, "Leere Antwort vom Modell");
    return { reply, model, provider };
  }

  if (provider === "openai") {
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const json = await fetchJson(`${baseUrl}/chat/completions`, {
      headers,
      body: { model, max_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] },
    });
    const reply = str(json?.choices?.[0]?.message?.content).trim();
    if (!reply) throw httpErr(502, "Leere Antwort vom Modell");
    return { reply, model, provider };
  }

  // anthropic — Raw-HTTP gegen die Messages API (zero-dependency, kein SDK im Projekt).
  if (!apiKey) throw httpErr(400, "Anthropic braucht einen API-Key (im Profil hinterlegen)");
  const json = await fetchJson(`${baseUrl}/v1/messages`, {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: { model, max_tokens: maxTokens, system, messages },
  });
  // Sicherheits-Refusal ist HTTP 200 mit stop_reason "refusal" — VOR content prüfen.
  if (json?.stop_reason === "refusal") return { reply: "", model, provider, refused: true };
  const reply = (json?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!reply) throw httpErr(502, "Leere Antwort vom Modell");
  return { reply, model, provider };
}

export async function chat({ messages, context, lang = "de" } = {}) {
  const clean = sanitizeMessages(messages);
  const ctx = contextPrefix(context, lang);
  if (ctx) clean[clean.length - 1] = { ...clean[clean.length - 1], content: `${ctx}\n\n${clean[clean.length - 1].content}` };

  const res = await callModel({ system: buildSystemPrompt({ lang }), messages: clean, lang });
  if (res.refused) {
    return {
      ...res,
      reply: lang === "de"
        ? "Das Modell hat diese Anfrage abgelehnt. Formuliere die Frage anders — ich helfe gern weiter."
        : "The model declined this request. Try rephrasing — happy to keep helping.",
    };
  }
  return res;
}

// ── Lernziel → Themen & Ablauf ──────────────────────────────────────────
const MAX_PLAN_TOPICS = 25;
const MAX_MATERIAL_CHARS = 12_000;   // reicht für ein Inhaltsverzeichnis/Syllabus
const PLAN_REPLY_TOKENS = 3000;

// JSON aus einer Modellantwort schälen: Code-Zaun, Vor-/Nachgeplapper.
function extractJson(reply) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  const raw = (fenced ? fenced[1] : reply).trim();
  try { return JSON.parse(raw); } catch { /* weiter unten */ }
  // Fallback: das äußerste { … } nehmen.
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try { return JSON.parse(raw.slice(s, e + 1)); } catch { /* aufgeben */ }
  }
  return null;
}

const clampInt = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
};

// Alles, was das Modell liefert, wird geklemmt und geprüft — inklusive der
// Abhängigkeiten: nur RÜCKWÄRTS gerichtete Indizes sind erlaubt, damit per
// Konstruktion kein Zyklus entstehen kann.
export function validateProposal(parsed, { taskTypes = [] } = {}) {
  const rawTopics = Array.isArray(parsed?.topics) ? parsed.topics : [];
  const topics = [];
  // Die Indizes in dependsOn beziehen sich auf die Liste, die das MODELL
  // geschickt hat. Wird davon etwas verworfen (leerer Text) oder abgeschnitten
  // (> MAX_PLAN_TOPICS), passen die Indizes nicht mehr — ohne diese Umschlüsselung
  // würden die Abhängigkeiten der Folge-Themen auf das falsche Thema zeigen.
  const remap = new Map();                              // Modell-Index → Ausgabe-Index
  for (let raw = 0; raw < rawTopics.length; raw++) {
    const t = rawTopics[raw];
    const text = str(t?.text).replace(/\s+/g, " ").trim().slice(0, 90);
    if (!text) continue;
    remap.set(raw, topics.length);
    topics.push({
      text,
      estMinutes: clampInt(t?.estMinutes, 15, 240),
      difficulty: clampInt(t?.difficulty, 1, 3),
      dependsOn: [],                                    // unten, wenn alle Indizes stehen
      _rawDeps: Array.isArray(t?.dependsOn) ? t.dependsOn : [],
      order: topics.length,
      why: t?.why ? str(t.why).trim().slice(0, 200) : null,
      practice: t?.practice ? str(t.practice).trim().slice(0, 120) : null,
      methods: [],
    });
    if (topics.length >= MAX_PLAN_TOPICS) break;
  }
  for (const t of topics) {
    // WICHTIG: ungültige Indizes werden VERWORFEN, nicht geklemmt. Ein Klemmen
    // hätte aus „-5" eine Abhängigkeit auf Thema 0 gemacht und aus „999" eine
    // auf das letzte — also eine Voraussetzung erfunden, die das Modell nie
    // gemeint hat. Erlaubt ist nur, was nach der Umschlüsselung existiert und
    // rückwärts zeigt (rückwärts ⇒ per Konstruktion zyklenfrei).
    const deps = new Set();
    for (const raw of t._rawDeps.slice(0, MAX_PLAN_TOPICS)) {
      if (typeof raw !== "number" || !Number.isInteger(raw)) continue;
      const mapped = remap.get(raw);
      if (mapped === undefined || mapped >= t.order) continue;
      deps.add(mapped);
    }
    t.dependsOn = [...deps];
    delete t._rawDeps;
  }
  return {
    source: "ai",
    structure: null,
    summary: parsed?.summary ? str(parsed.summary).trim().slice(0, 300) : null,
    taskTypes,
    topics,
  };
}

/**
 * Lernziel (+ optional eingefügter Text und Aufgabentypen) → Themenvorschlag.
 * Persistiert NICHTS: die Person sieht den Vorschlag, bearbeitet ihn und
 * bestätigt erst dann.
 */
export async function planTopics({
  goal, material, taskTypes = [], examName = null, examDate = null, lang = "de",
} = {}) {
  const l = lang === "en" ? "en" : "de";
  const goalText = str(goal).trim().slice(0, 2000);
  const src = str(material).trim().slice(0, MAX_MATERIAL_CHARS);
  if (!goalText && !src) throw httpErr(400, l === "de" ? "Kein Lernziel angegeben" : "No learning goal given");

  const bits = [];
  bits.push((l === "de" ? "LERNZIEL:\n" : "LEARNING GOAL:\n") + (goalText || "—"));
  if (examName) bits.push((l === "de" ? "PRÜFUNG: " : "EXAM: ") + examName + (examDate ? ` (${examDate})` : ""));
  if (taskTypes.length) {
    bits.push((l === "de" ? "AUFGABENTYPEN DER PRÜFUNG: " : "EXAM TASK TYPES: ") + taskTypes.join(", "));
  }
  if (src) {
    bits.push((l === "de"
      ? "EINGEFÜGTES MATERIAL (maßgeblich — übernimm Begriffe und Struktur daraus):\n"
      : "PASTED SOURCE MATERIAL (authoritative — take wording and structure from it):\n") + src);
  }

  const res = await callModel({
    system: buildSystemPrompt({ lang: l, mode: "plan" }),
    messages: [{ role: "user", content: bits.join("\n\n") }],
    maxTokens: PLAN_REPLY_TOKENS,
    lang: l,
  });
  if (res.refused) {
    throw httpErr(502, l === "de"
      ? "Das Modell hat die Zerlegung abgelehnt. Formuliere das Lernziel anders."
      : "The model declined to break this down. Try rephrasing the goal.");
  }

  const parsed = extractJson(res.reply);
  if (!parsed) {
    throw httpErr(502, l === "de"
      ? "Das Modell hat kein verwertbares JSON geliefert — versuch es erneut oder nimm die Gliederungs-Erkennung."
      : "The model returned no usable JSON — try again or use outline detection.");
  }
  const proposal = validateProposal(parsed, { taskTypes });
  if (!proposal.topics.length) {
    throw httpErr(502, l === "de" ? "Das Modell hat keine Themen geliefert" : "The model returned no topics");
  }
  return { ...proposal, model: res.model, provider: res.provider };
}
