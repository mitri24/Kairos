// Spalten-Layout für überlappende Zeitblöcke — dieselbe Regel wie in Apple
// Kalender: was sich zeitlich überschneidet, steht NEBENeinander statt
// übereinander, und ein Block wächst nach rechts, solange dort nichts liegt.
//
// Reine Rechnung auf Minuten, kein DOM — dadurch von Wochen-Board und
// Tages-Zeitstrahl gleichermaßen nutzbar (und ohne Browser testbar).

// Luft zwischen zwei Nachbarspalten, in Prozent der Spurbreite.
const GAP_PCT = 3;

// items: [{ start, end, … }] (Minuten). Liefert dieselben Objekte zurück,
// ergänzt um { col, cols, span } — Reihenfolge nach Startzeit.
export function layoutOverlaps(items) {
  const sorted = [...items]
    .map((it) => ({ ...it, start: it.start, end: Math.max(it.end, it.start + 1) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length) out.push(...assignColumns(cluster));
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const it of sorted) {
    // Beginnt der Block erst nach dem Ende ALLER bisherigen, fängt eine neue
    // Überlappungsgruppe an — die vorherige darf die volle Breite aufteilen.
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

// Innerhalb einer Gruppe: jeder Block in die erste Spalte, die frei geworden ist.
function assignColumns(cluster) {
  const colEnd = [];   // Ende des zuletzt einsortierten Blocks je Spalte
  for (const it of cluster) {
    let c = colEnd.findIndex((end) => end <= it.start);
    if (c === -1) { c = colEnd.length; colEnd.push(it.end); }
    else colEnd[c] = it.end;
    it.col = c;
  }
  const cols = colEnd.length;
  for (const it of cluster) {
    // Nach rechts ausdehnen, solange die Nachbarspalte im eigenen Zeitraum leer ist.
    let span = 1;
    while (
      it.col + span < cols &&
      !cluster.some((o) => o !== it && o.col === it.col + span && o.start < it.end && o.end > it.start)
    ) span++;
    it.cols = cols;
    it.span = span;
  }
  return cluster;
}

// Spaltenposition → CSS-Prozente innerhalb der Tagesspur.
export function laneStyle(it) {
  const cols = Math.max(1, it.cols || 1);
  const unit = 100 / cols;
  const left = (it.col || 0) * unit;
  const width = unit * (it.span || 1) - (cols > 1 ? GAP_PCT : 0);
  return { left, width: Math.max(unit / 2, width) };
}
