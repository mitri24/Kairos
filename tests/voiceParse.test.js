// Tests für den deutschen Sprach-Parser (shared/voiceParse.js).
// Fixe todayKeys pro Test: "2026-08-01" ist ein Samstag (Kalender geprüft).
import test from "node:test";
import assert from "node:assert/strict";

import { parseVoiceCapture } from "../shared/voiceParse.js";

const TODAY = "2026-08-01"; // Samstag

function one(transcript, todayKey = TODAY) {
  const res = parseVoiceCapture(transcript, { todayKey });
  assert.equal(res.items.length, 1, `erwartete genau 1 Draft für: ${transcript}`);
  return res.items[0];
}

// ── Leere Eingabe ────────────────────────────────
test("leerer Input liefert wake:false und keine Items", () => {
  assert.deepEqual(parseVoiceCapture("", { todayKey: TODAY }), { wake: false, items: [] });
});

test("nur Whitespace liefert wake:false und keine Items", () => {
  assert.deepEqual(parseVoiceCapture("   \n\t ", { todayKey: TODAY }), { wake: false, items: [] });
});

// ── Wake-Word ────────────────────────────────────
test("wake-word 'hey kairos,' wird erkannt und entfernt", () => {
  const res = parseVoiceCapture("hey kairos, mathe lernen", { todayKey: TODAY });
  assert.equal(res.wake, true);
  assert.equal(res.items[0].text, "Mathe lernen");
});

test("wake-word 'ok kairos' und 'hey cairos' werden erkannt", () => {
  const a = parseVoiceCapture("ok kairos wäsche waschen", { todayKey: TODAY });
  const b = parseVoiceCapture("hey cairos wäsche waschen", { todayKey: TODAY });
  assert.equal(a.wake, true);
  assert.equal(b.wake, true);
  assert.equal(a.items[0].text, "Wäsche waschen");
  assert.equal(b.items[0].text, "Wäsche waschen");
});

test("ohne wake-word bleibt wake:false und der Text unangetastet", () => {
  const res = parseVoiceCapture("mathe lernen", { todayKey: TODAY });
  assert.equal(res.wake, false);
  assert.equal(res.items[0].text, "Mathe lernen");
});

test("bloßes 'ok' ohne kairos ist kein wake-word", () => {
  const res = parseVoiceCapture("ok mathe lernen", { todayKey: TODAY });
  assert.equal(res.wake, false);
});

// ── Lern-Absicht (learnQuery) ────────────────────
test("kellerautomaten-beispiel: learnQuery, titel, kein datum", () => {
  const res = parseVoiceCapture("hey ich muss mir nochmal kellerautomaten anschauen", { todayKey: TODAY });
  assert.equal(res.wake, true);
  const d = res.items[0];
  assert.equal(d.learnQuery, "kellerautomaten");
  assert.equal(d.text, "Kellerautomaten anschauen");
  assert.equal(d.plannedDate, null);
  assert.equal(d.scheduledMin, null);
});

test("mehrwort-thema bleibt im learnQuery intakt", () => {
  const d = one("hey ich muss mir nochmal keller automaten anschauen");
  assert.equal(d.learnQuery, "keller automaten");
});

test("trennbares verb 'schau ... an' setzt learnQuery", () => {
  const d = one("schau dir mal die rekursion an");
  assert.equal(d.learnQuery, "rekursion");
});

test("kombi-beispiel: morgen um 14 uhr analysis üben für 2 stunden", () => {
  const d = one("morgen um 14 uhr analysis üben für 2 stunden");
  assert.equal(d.plannedDate, "2026-08-02");
  assert.equal(d.scheduledMin, 840);
  assert.equal(d.estMinutes, 120);
  assert.equal(d.learnQuery, "analysis");
  assert.equal(d.text, "Analysis üben");
});

test("ohne lern-verb bleibt learnQuery null", () => {
  const d = one("zimmer aufräumen");
  assert.equal(d.learnQuery, null);
});

// ── „morgen“ vs. „morgens“ ───────────────────────
test("'morgens' ist tageszeit (9:00), kein datum", () => {
  const d = one("morgens vokabeln wiederholen");
  assert.equal(d.plannedDate, null);
  assert.equal(d.scheduledMin, 540);
  assert.equal(d.learnQuery, "vokabeln");
});

test("'morgen' ist datum (+1), keine uhrzeit", () => {
  const d = one("morgen vokabeln wiederholen");
  assert.equal(d.plannedDate, "2026-08-02");
  assert.equal(d.scheduledMin, null);
});

test("'morgen früh' setzt datum +1 UND 8:00", () => {
  const d = one("morgen früh joggen gehen");
  assert.equal(d.plannedDate, "2026-08-02");
  assert.equal(d.scheduledMin, 480);
});

// ── Wochentage (todayKey 2026-08-01 = Samstag) ───
test("'am montag' findet den nächsten montag (Mo 2026-08-03)", () => {
  const d = one("am montag physik üben");
  assert.equal(d.plannedDate, "2026-08-03");
  assert.equal(d.text, "Physik üben");
});

test("gleicher wochentag ohne 'nächsten' bleibt heute (Sa 2026-08-01)", () => {
  const d = one("samstag schreibtisch aufräumen");
  assert.equal(d.plannedDate, "2026-08-01");
});

test("'nächsten samstag' springt eine woche weiter (Sa 2026-08-08)", () => {
  const d = one("nächsten samstag schreibtisch aufräumen");
  assert.equal(d.plannedDate, "2026-08-08");
});

test("'nächste woche montag' liegt in 1..7 tagen (Mo 2026-08-03)", () => {
  const d = one("nächste woche montag referat vorbereiten");
  assert.equal(d.plannedDate, "2026-08-03");
});

test("kürzel 'am fr' wird erkannt (Fr 2026-08-07)", () => {
  const d = one("am fr bericht abgeben");
  assert.equal(d.plannedDate, "2026-08-07");
});

test("kürzel ohne 'am' wird NICHT als wochentag gelesen ('so ein chaos')", () => {
  const d = one("so ein chaos aufräumen");
  assert.equal(d.plannedDate, null);
  assert.equal(d.text, "So ein chaos aufräumen");
});

// ── Explizite Daten + Jahres-Rollover ────────────
test("'am 12.3.' nach dem 12.3. rollt ins nächste jahr", () => {
  const d = one("am 12.3. laborbericht abgeben"); // heute 2026-08-01 → 2027
  assert.equal(d.plannedDate, "2027-03-12");
  assert.equal(d.text, "Laborbericht abgeben");
});

test("'am 24.12.' im selben jahr bleibt dieses jahr", () => {
  const d = one("am 24.12. geschenke besorgen");
  assert.equal(d.plannedDate, "2026-12-24");
});

test("'am 3. april' mit monatsnamen inkl. rollover", () => {
  const d = one("am 3. april essay abgeben"); // 2026-04-03 < heute → 2027
  assert.equal(d.plannedDate, "2027-04-03");
});

// ── Deadline (bis/deadline → dueKey) ─────────────
test("'bis freitag' setzt dueKey statt plannedDate (Fr 2026-08-07)", () => {
  const d = one("hausarbeit schreiben bis freitag");
  assert.equal(d.dueKey, "2026-08-07");
  assert.equal(d.plannedDate, null);
  assert.equal(d.text, "Hausarbeit schreiben");
});

test("'deadline montag' setzt dueKey (Mo 2026-08-03)", () => {
  const d = one("deadline montag abstract einreichen");
  assert.equal(d.dueKey, "2026-08-03");
  assert.equal(d.plannedDate, null);
});

test("'bis zum 12.3.' setzt dueKey mit rollover", () => {
  const d = one("projekt abschließen bis zum 12.3.");
  assert.equal(d.dueKey, "2027-03-12");
  assert.equal(d.plannedDate, null);
});

// ── Uhrzeiten ────────────────────────────────────
test("'um halb 3' ergibt 14:30 (870)", () => {
  const d = one("um halb 3 lerngruppe treffen");
  assert.equal(d.scheduledMin, 870);
});

test("'viertel vor 5' ergibt 16:45 (1005)", () => {
  const d = one("viertel vor 5 protokoll schreiben");
  assert.equal(d.scheduledMin, 1005);
});

test("'viertel nach 3' ergibt 15:15 (915)", () => {
  const d = one("viertel nach 3 statistik üben");
  assert.equal(d.scheduledMin, 915);
});

test("nackte stunde 1..5: 'um 3' ergibt 15:00 (900)", () => {
  const d = one("um 3 bibliothek gehen");
  assert.equal(d.scheduledMin, 900);
});

test("nackte stunde ab 6 bleibt wörtlich: 'um 9' ergibt 9:00 (540)", () => {
  const d = one("um 9 mensa treffen");
  assert.equal(d.scheduledMin, 540);
});

test("'um 14:30' und 'um 14 uhr 30' ergeben beide 870", () => {
  assert.equal(one("meeting um 14:30").scheduledMin, 870);
  assert.equal(one("meeting um 14 uhr 30").scheduledMin, 870);
});

test("uhrzeit ohne datum lässt plannedDate null (parser entscheidet nicht)", () => {
  const d = one("um 14 uhr zahnarzt anrufen");
  assert.equal(d.plannedDate, null);
  assert.equal(d.scheduledMin, 840);
});

test("tageszeiten: mittags 720, nachmittags 900, abends 1140", () => {
  assert.equal(one("mittags essen vorbereiten").scheduledMin, 720);
  assert.equal(one("nachmittags klausur vorbereiten").scheduledMin, 900);
  assert.equal(one("abends notizen zusammenfassen").scheduledMin, 1140);
});

test("explizite uhrzeit schlägt tageszeit", () => {
  const d = one("morgen nachmittag um 16 uhr seminar vorbereiten");
  assert.equal(d.plannedDate, "2026-08-02");
  assert.equal(d.scheduledMin, 960);
});

// ── Dauern ───────────────────────────────────────
test("zahlwörter: 'für zwei stunden' ergibt 120", () => {
  const d = one("literatur lesen für zwei stunden");
  assert.equal(d.estMinutes, 120);
  assert.equal(d.text, "Literatur lesen");
});

test("'anderthalb stunden' 90 und 'zweieinhalb stunden' 150", () => {
  assert.equal(one("altklausuren durchrechnen anderthalb stunden").estMinutes, 90);
  assert.equal(one("altklausuren durchrechnen zweieinhalb stunden").estMinutes, 150);
});

test("'eine halbe stunde' 30 und 'eine viertelstunde' 15", () => {
  assert.equal(one("vokabeln üben eine halbe stunde").estMinutes, 30);
  assert.equal(one("vokabeln üben eine viertelstunde").estMinutes, 15);
});

test("'ca. 45 min' ergibt 45", () => {
  const d = one("formelsammlung durchgehen ca. 45 min");
  assert.equal(d.estMinutes, 45);
});

test("'2 stunden lang' und 'etwa eine stunde' werden erkannt", () => {
  assert.equal(one("skript nacharbeiten 2 stunden lang").estMinutes, 120);
  assert.equal(one("skript nacharbeiten etwa eine stunde").estMinutes, 60);
});

// ── Priorität ────────────────────────────────────
test("prioritätswörter: wichtig→1, prio 2→2, kann warten→3, irgendwann→4", () => {
  assert.equal(one("steuer abgeben wichtig").priority, 1);
  assert.equal(one("steuer abgeben prio 2").priority, 2);
  assert.equal(one("keller entrümpeln kann warten").priority, 3);
  assert.equal(one("keller entrümpeln irgendwann").priority, 4);
});

test("prioritätsfragment verschwindet aus dem titel", () => {
  const d = one("dringend laborbericht abgeben");
  assert.equal(d.priority, 1);
  assert.equal(d.text, "Laborbericht abgeben");
});

// ── Schwierigkeit ────────────────────────────────
test("schwierigkeitswörter: schwer→3, leicht→1 (bleiben im titel)", () => {
  const hard = one("mathe lernen das ist schwer");
  const easy = one("vokabeln üben ist leicht");
  assert.equal(hard.difficulty, 3);
  assert.equal(easy.difficulty, 1);
  assert.match(hard.text, /schwer/i);
});

test("'schnell' und 'kurz' beeinflussen difficulty nicht", () => {
  assert.equal(one("schnell mail schreiben").difficulty, null);
  assert.equal(one("kurz pause planen").difficulty, null);
});

// ── Multi-Task-Split ─────────────────────────────
test("'und dann' trennt zwei aufgaben", () => {
  const res = parseVoiceCapture("mathe lernen und dann englisch vokabeln üben", { todayKey: TODAY });
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].text, "Mathe lernen");
  assert.equal(res.items[1].text, "Englisch vokabeln üben");
});

test("bloßes 'und' trennt NICHT (eine aufgabe, ein thema)", () => {
  const res = parseVoiceCapture("Analysis und Algebra lernen", { todayKey: TODAY });
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].text, "Analysis und Algebra lernen");
  assert.equal(res.items[0].learnQuery, "analysis und algebra");
});

test("'; ' trennt aufgaben", () => {
  const res = parseVoiceCapture("wäsche waschen; physik wiederholen", { todayKey: TODAY });
  assert.equal(res.items.length, 2);
  assert.equal(res.items[1].learnQuery, "physik");
});

test("'danach' und 'außerdem' trennen ebenfalls", () => {
  const a = parseVoiceCapture("aufsatz schreiben danach quellen prüfen", { todayKey: TODAY });
  const b = parseVoiceCapture("einkaufen gehen außerdem miete überweisen", { todayKey: TODAY });
  assert.equal(a.items.length, 2);
  assert.equal(b.items.length, 2);
});

test("jedes segment wird unabhängig geparst", () => {
  const res = parseVoiceCapture("morgen um 9 analysis üben und dann bis freitag bericht abgeben", { todayKey: TODAY });
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].plannedDate, "2026-08-02");
  assert.equal(res.items[0].scheduledMin, 540);
  assert.equal(res.items[1].dueKey, "2026-08-07");
  assert.equal(res.items[1].plannedDate, null);
});

// ── Titel-Bereinigung ────────────────────────────
test("führende füllwörter werden entfernt, erster buchstabe groß", () => {
  const d = one("ich muss die küche putzen");
  assert.equal(d.text, "Die küche putzen");
});

test("besteht ein segment nur aus fragmenten, fällt der titel aufs original zurück", () => {
  const d = one("morgen um 14 uhr");
  assert.equal(d.plannedDate, "2026-08-02");
  assert.equal(d.scheduledMin, 840);
  assert.equal(d.text, "Morgen um 14 uhr");
});
