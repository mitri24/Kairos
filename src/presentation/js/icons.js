// Icon-Set der Seitenleiste — die einzige Quelle für Piktogramme im Extension-UI.
//
// Warum: Emojis rendern je Betriebssystem/Browser anders (Farbe, Gewicht,
// Grundlinie, teils Fallback-Kästchen), lassen sich nicht einfärben und wirken
// neben dem gezeichneten Design wie Fremdkörper. Alle Icons hier sind
// Strich-SVGs auf demselben 24er-Raster wie das Icon-Set der PWA
// (fill:none, stroke:currentColor, stroke-width 1.8, runde Enden) — sie erben
// also automatisch Textfarbe, Akzentfarbe und Hover-Zustände.
//
// Eigene Datei statt Import aus web/js/icons.js: Die Extension liegt in einem
// anderen Kontext, der absolute /js/-Pfad der PWA existiert hier nicht.
//
// WICHTIG — diese Datei ist die kanonische Quelle für ALLE Piktogramme der
// Extension. Zwei Stellen können sie technisch nicht importieren und führen
// deshalb eine wortgleiche Kopie der benötigten Pfade:
//   • src/presentation/sidepanel.html — HTML kann keine Module importieren, die
//     drei Start/Skip/Reset-Buttons tragen das Markup direkt (Erst-Rendering
//     ohne JS-Flackern).
//   • src/content/overlay.js — MV3-Content-Scripts sind klassische Skripte
//     ohne `import`.
// Wird hier ein Pfad geändert, MÜSSEN beide Kopien mitgezogen werden.
//
// Pfade, die es auch im PWA-Set (web/js/icons.js) gibt — play, plus, check,
// pin, grip — sind von dort zeichengenau übernommen, damit dasselbe Icon auf
// beiden Oberflächen identisch aussieht.
//
// Regel für Barrierefreiheit: steht neben dem Icon sichtbarer Text, bleibt das
// Icon `aria-hidden`. Trägt das Icon allein die Bedeutung (Icon-only-Button),
// entweder `label` setzen oder am Button `aria-label`/`title` pflegen.

const PATHS = {
  // ── Timer-Steuerung ──────────────────────────────────────────────────
  play: '<path d="M7.8 5.2 18.6 12 7.8 18.8z"/>',
  pause: '<path d="M9.2 5.5v13M14.8 5.5v13"/>',
  skip: '<path d="M6.5 5.5v13L15.5 12z"/><path d="M18 5.5v13"/>',
  reset: '<path d="M3.5 12a8.5 8.5 0 1 0 8.5-8.5A9.2 9.2 0 0 0 5.6 6.1L3.5 8.1"/><path d="M3.5 3.6v4.7h4.7"/>',

  // ── Liste & Zeitstrahl ───────────────────────────────────────────────
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  check: '<path d="m5 12.6 4.6 4.6L19 6.8"/>',
  pin: '<path d="M9 3.5h6"/><path d="M10 3.5v6L7 13.5h10L14 9.5v-6"/><path d="M12 13.5v7"/>',
  // Griff-Punkte: gleiche Technik wie die Augen der Bewertungs-Gesichter
  grip: '<path d="M9.3 6h.01M14.7 6h.01M9.3 12h.01M14.7 12h.01M9.3 18h.01M14.7 18h.01"/>',

  // ── Nur im All-Sites-Overlay (src/content/overlay.js) genutzt ────────
  // Stehen trotzdem hier, damit es genau EIN Verzeichnis aller Extension-
  // Piktogramme gibt und die Kopie im Content-Script prüfbar bleibt.
  minus: '<path d="M6 12h12"/>',
  expand: '<path d="M14.5 4.5h5v5"/><path d="m19.5 4.5-6 6"/><path d="M9.5 19.5h-5v-5"/><path d="m4.5 19.5 6-6"/>',
};

/** Alle verfügbaren Icon-Namen (für Tests/Prüfungen). */
export const ICON_NAMES = Object.keys(PATHS);

/**
 * Liefert ein Icon als SVG-String zum Einsetzen in Template-Literals.
 *
 * @param {string} name   Schlüssel aus PATHS (siehe ICON_NAMES)
 * @param {object} [opts]
 * @param {number} [opts.size=16]   Kantenlänge in px
 * @param {string} [opts.cls=""]    zusätzliche Klassen
 * @param {string} [opts.label=""]  Beschriftung — nur setzen, wenn das Icon
 *                                  allein die Bedeutung trägt (sonst aria-hidden)
 * @param {number} [opts.stroke]    abweichende Strichstärke
 * @returns {string}
 */
export function icon(name, opts = {}) {
  const d = PATHS[name];
  if (!d) {
    // Nicht werfen: ein fehlendes Icon darf niemals eine ganze Ansicht killen.
    console.warn("[icons] unbekanntes Icon:", name);
    return "";
  }
  const size = opts.size || 16;
  const cls = opts.cls ? `ico ${opts.cls}` : "ico";
  const label = opts.label || "";
  const a11y = label ? `role="img" aria-label="${escapeAttr(label)}"` : 'aria-hidden="true"';
  return (
    `<svg class="${escapeAttr(cls)}" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="${opts.stroke || 1.8}" ` +
    `stroke-linecap="round" stroke-linejoin="round" ${a11y}>${d}</svg>`
  );
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
