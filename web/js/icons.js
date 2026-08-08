// Zentrales Icon-Set der App — die EINZIGE Quelle für Piktogramme im UI.
//
// Warum: Emojis rendern je Betriebssystem/Browser anders (Farbe, Gewicht,
// Grundlinie, teils Fallback-Kästchen), lassen sich nicht einfärben und wirken
// neben dem gezeichneten Sage-Design wie Fremdkörper. Alle Icons hier sind
// Strich-SVGs auf demselben 24er-Raster wie die Navigations-Icons in
// index.html (fill:none, stroke:currentColor, stroke-width 1.8, runde Enden) —
// sie erben also automatisch Textfarbe, Akzentfarbe und Hover-Zustände.
//
// Verwendung in Template-Literals:
//     `<button class="lib-act">${icon("pin")}</button>`                 // rein dekorativ
//     `<button class="lib-act">${icon("pin", { label: t.pin })}</button>` // Icon trägt die Bedeutung
//
// Regel für Barrierefreiheit: steht neben dem Icon sichtbarer Text (Tab,
// Chip, Listeneintrag), bleibt das Icon `aria-hidden` — der Text sagt bereits
// alles. Trägt das Icon allein die Bedeutung (Icon-only-Button), entweder
// `label` setzen oder am Button `aria-label`/`title` pflegen.

const PATHS = {
  // ── Material / Bibliothek ────────────────────────────────────────────
  file: '<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 3v5h5"/>',
  doc: '<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 17.5 4.2-4.2 3.3 3.3 2.6-2.6 5.4 5.4"/>',
  audio: '<path d="M4.5 14.5v-2.2a7.5 7.5 0 0 1 15 0v2.2"/><rect x="2.5" y="13.5" width="4.5" height="6.5" rx="1.8"/><rect x="17" y="13.5" width="4.5" height="6.5" rx="1.8"/>',
  video: '<rect x="3" y="6" width="12.5" height="12" rx="2.5"/><path d="M15.5 10.8l4.6-2.5a.7.7 0 0 1 1 .6v6.2a.7.7 0 0 1-1 .6l-4.6-2.5z"/>',
  link: '<path d="M10.6 13.4a3.6 3.6 0 0 0 5.1 0l2.6-2.6a3.6 3.6 0 1 0-5.1-5.1l-1.3 1.3"/><path d="M13.4 10.6a3.6 3.6 0 0 0-5.1 0l-2.6 2.6a3.6 3.6 0 1 0 5.1 5.1l1.3-1.3"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9.5h18"/><path d="M6.8 13.5h7"/>',
  pin: '<path d="M9 3.5h6"/><path d="M10 3.5v6L7 13.5h10L14 9.5v-6"/><path d="M12 13.5v7"/>',
  book: '<path d="M4.5 4.8A2 2 0 0 1 6.5 3H19v15.5H6.5a2 2 0 0 0-2 2z"/><path d="M4.5 4.8v15.7A2 2 0 0 0 6.5 21H19"/><path d="M8.5 7.5h6"/>',

  // ── Handlungen ───────────────────────────────────────────────────────
  // Gehirn: die Aussenkontur ist bewusst aus kleinen Boegen (Windungen)
  // gebaut — zwei glatte Halbkreise lesen bei 16px wie ein Kontrast-Symbol.
  brain: '<path d="M12 5.4a2.6 2.6 0 0 0-4.9-1.2 2.5 2.5 0 0 0-2.4 2.7 2.6 2.6 0 0 0-.5 4.2 2.7 2.7 0 0 0 1.2 4.4 2.6 2.6 0 0 0 4.4 2.1"/><path d="M12 5.4a2.6 2.6 0 0 1 4.9-1.2 2.5 2.5 0 0 1 2.4 2.7 2.6 2.6 0 0 1 .5 4.2 2.7 2.7 0 0 1-1.2 4.4 2.6 2.6 0 0 1-4.4 2.1"/><path d="M12 5.4v12.2"/>',
  heart: '<path d="M12 20.1 5 13a4.4 4.4 0 0 1 6.2-6.2l.8.8.8-.8A4.4 4.4 0 0 1 19 13z"/>',
  share: '<path d="M12 15.5V4"/><path d="m8.2 7.8 3.8-3.8 3.8 3.8"/><path d="M5 13.5v4.9A2.6 2.6 0 0 0 7.6 21h8.8a2.6 2.6 0 0 0 2.6-2.6v-4.9"/>',
  close: '<path d="m6.2 6.2 11.6 11.6M17.8 6.2 6.2 17.8"/>',
  trash: '<path d="M4 6.8h16"/><path d="M9.6 6.8V5.4a1.4 1.4 0 0 1 1.4-1.4h2a1.4 1.4 0 0 1 1.4 1.4v1.4"/><path d="M6.6 6.8 7.5 19a2 2 0 0 0 2 1.9h5a2 2 0 0 0 2-1.9l.9-12.2"/><path d="M10.4 10.5v6.3M13.6 10.5v6.3"/>',
  settings: '<path d="M4.5 8h8.2M16.8 8h2.7"/><path d="M4.5 16h2.7M11.3 16h8.2"/><circle cx="14.8" cy="8" r="2.2"/><circle cx="9.2" cy="16" r="2.2"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  check: '<path d="m5 12.6 4.6 4.6L19 6.8"/>',
  edit: '<path d="M13.5 5.6 18.4 10.5"/><path d="M15.1 4 20 8.9 9.4 19.5l-5.4 1.1 1.1-5.4z"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.4 15.4 4.6 4.6"/>',
  external: '<path d="M13.5 4.5H19.5V10.5"/><path d="M19.5 4.5 11 13"/><path d="M18 14v4.5A2.5 2.5 0 0 1 15.5 21h-9A2.5 2.5 0 0 1 4 18.5v-9A2.5 2.5 0 0 1 6.5 7H11"/>',

  // ── Timer-Steuerung ──────────────────────────────────────────────────
  // Zeichengleich mit src/presentation/js/icons.js, damit derselbe Knopf in
  // PWA-Sidebar, Fokusmodus, Extension-Panel und Overlay identisch aussieht.
  pause: '<path d="M9.2 5.5v13M14.8 5.5v13"/>',
  skip: '<path d="M6.5 5.5v13L15.5 12z"/><path d="M18 5.5v13"/>',
  reset: '<path d="M3.5 12a8.5 8.5 0 1 0 8.5-8.5A9.2 9.2 0 0 0 5.6 6.1L3.5 8.1"/><path d="M3.5 3.6v4.7h4.7"/>',
  minus: '<path d="M6 12h12"/>',
  expand: '<path d="M14.5 4.5h5v5"/><path d="m19.5 4.5-6 6"/><path d="M9.5 19.5h-5v-5"/><path d="m4.5 19.5 6-6"/>',

  // ── Richtung / Steuerung ─────────────────────────────────────────────
  arrowRight: '<path d="M4.6 12h14.8"/><path d="m13.4 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19.4 12H4.6"/><path d="m10.6 6-6 6 6 6"/>',
  chevronDown: '<path d="m6.2 9.4 5.8 5.8 5.8-5.8"/>',
  chevronRight: '<path d="m9.4 6.2 5.8 5.8-5.8 5.8"/>',
  chevronLeft: '<path d="m14.6 6.2-5.8 5.8 5.8 5.8"/>',
  grip: '<path d="M9.3 6h.01M14.7 6h.01M9.3 12h.01M14.7 12h.01M9.3 18h.01M14.7 18h.01"/>',
  mic: '<rect x="9.2" y="2.8" width="5.6" height="10.8" rx="2.8"/><path d="M5.4 11.6a6.6 6.6 0 0 0 13.2 0"/><path d="M12 18.2V21"/>',
  star: '<path d="m12 3.8 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  warning: '<path d="M10.6 4.3a1.6 1.6 0 0 1 2.8 0l7.4 13.1a1.6 1.6 0 0 1-1.4 2.4H4.6a1.6 1.6 0 0 1-1.4-2.4z"/><path d="M12 9.6v4"/><path d="M12 17h.01"/>',

  // ── Bedeutungen / Zustände ───────────────────────────────────────────
  sparkle: '<path d="M11.2 4.2 12.7 8.5 17 10l-4.3 1.5-1.5 4.3-1.5-4.3L5.4 10l4.3-1.5z"/><path d="m17.8 15.4.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  timer: '<circle cx="12" cy="13.2" r="7.6"/><path d="M12 9.4v3.8l2.6 1.6"/><path d="M9.6 3.4h4.8"/>',
  paperclip: '<path d="M19.6 10.6 12 18.2a4.4 4.4 0 0 1-6.2-6.2l7.6-7.6a2.9 2.9 0 1 1 4.1 4.1l-7.5 7.5a1.5 1.5 0 0 1-2.1-2.1l7-7"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 3.5V6M16 3.5V6"/>',
  flag: '<path d="M6 21V3.8"/><path d="M6 5h11.5l-2.2 3.6L17.5 12H6"/>',
  bulb: '<path d="M9.2 17.2h5.6"/><path d="M10.3 20.3h3.4"/><path d="M12 3.4a5.9 5.9 0 0 0-3.4 10.7c.6.5.9 1.1.9 1.8v.3h5v-.3c0-.7.3-1.3.9-1.8A5.9 5.9 0 0 0 12 3.4z"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.6 8.4-2 5.2-5.2 2 2-5.2z"/>',
  trophy: '<path d="M7.6 4h8.8v4.6a4.4 4.4 0 0 1-8.8 0z"/><path d="M7.6 5.6H5a3 3 0 0 0 2.9 3M16.4 5.6H19a3 3 0 0 1-2.9 3"/><path d="M12 13v3"/><path d="M9 20.5h6l-.8-4.5h-4.4z"/>',
  leaf: '<path d="M19.8 4.2C10.4 4.2 4.6 8.3 4.6 14.2a5.2 5.2 0 0 0 5.2 5.2c5.9 0 10-5.8 10-15.2z"/><path d="M4.4 20.2c2.4-3.9 6.1-7.4 10.6-9.8"/>',
  type: '<path d="M4.4 7.2V5h15.2v2.2"/><path d="M12 5v14"/><path d="M8.8 19h6.4"/>',

  // ── Tageszeit / Chronotyp ────────────────────────────────────────────
  sunrise: '<path d="M3 18h18"/><path d="M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M12 3.5V6"/><path d="M4.2 8.2 5.8 9.8"/><path d="M19.8 8.2 18.2 9.8"/>',
  sun: '<circle cx="12" cy="12" r="4.1"/><path d="M12 3.2v2.1M12 18.7v2.1M4.8 4.8l1.5 1.5M17.7 17.7l1.5 1.5M3.2 12h2.1M18.7 12h2.1M4.8 19.2l1.5-1.5M17.7 6.3l1.5-1.5"/>',
  moon: '<path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11z"/>',

  // ── Lernprofil & Methoden-Katalog (shared/methods.js) ────────────────
  bookOpen: '<path d="M12 6.6S9.9 4.6 4.6 4.6v12.8C9.9 17.4 12 19.4 12 19.4s2.1-2 7.4-2V4.6C14.1 4.6 12 6.6 12 6.6z"/><path d="M12 6.6v12.8"/>',
  map: '<path d="m3.6 6.6 5.4-2.2 6 2.4 5.4-2.2v14.4l-5.4 2.2-6-2.4-5.4 2.2z"/><path d="M9 4.4v14.4M15 6.8v14.4"/>',
  speech: '<rect x="3.8" y="4.8" width="16.4" height="11.4" rx="3"/><path d="M8.8 16.2v3.6l4.2-3.6"/>',
  walk: '<circle cx="13.4" cy="4.9" r="1.9"/><path d="m10.6 21 1.6-5.2-2.6-2.6.8-4.4 3.4 1.8 2.6 2.1"/><path d="m9.2 10.6-2.1 2.6"/><path d="m14.2 16.1 1.6 4.9"/>',
  users: '<circle cx="9.4" cy="8.4" r="3.2"/><path d="M3.7 19.6a5.7 5.7 0 0 1 11.4 0"/><path d="M16.2 6.1a3.2 3.2 0 0 1 0 6.2"/><path d="M17.6 14.3a5.7 5.7 0 0 1 2.7 5.3"/>',
  tool: '<path d="M20 5.4a4.5 4.5 0 0 1-6.1 5.6L5.6 19.3a1.7 1.7 0 0 1-2.4-2.4l8.3-8.3A4.5 4.5 0 0 1 17.1 2.5l-2.8 2.8 2.3 2.3z"/>',
  zap: '<path d="M13.6 3 5.6 13.4h5.4l-1 7.6 8-10.6H12z"/>',
  hash: '<path d="M9.6 4 8 20M16.2 4l-1.6 16M4.4 9h15.2M3.8 15H19"/>',
  wind: '<path d="M3.8 9h9.4a3 3 0 1 0-3-3"/><path d="M3.8 14h11.9a3 3 0 1 1-3 3"/><path d="M3.8 19h5.6"/>',
  spiral: '<path d="M12.6 12.7a1.7 1.7 0 1 1-1.7-1.7"/><path d="M10.9 11a3.7 3.7 0 1 1 3.7 3.7"/><path d="M14.6 14.7a6 6 0 1 1-6-6"/>',
  layers: '<path d="m12 3.4 8.5 4.3-8.5 4.3-8.5-4.3z"/><path d="m4.2 12.2 7.8 3.9 7.8-3.9"/><path d="m4.2 16.4 7.8 3.9 7.8-3.9"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M12 4v16M4 12h16"/>',
  shuffle: '<path d="M3.8 7h3.4l9.2 10h3.8"/><path d="M3.8 17h3.4l3.1-3.4"/><path d="m13.6 9.5 3-2.5"/><path d="m17.6 4.4 2.6 2.6-2.6 2.6"/><path d="m17.6 14.4 2.6 2.6-2.6 2.6"/>',
  hourglass: '<path d="M7 3.6h10M7 20.4h10"/><path d="M7.6 3.6v3.1c0 1 .4 2 1.2 2.7L12 12l-3.2 2.6c-.8.7-1.2 1.7-1.2 2.7v3.1"/><path d="M16.4 3.6v3.1c0 1-.4 2-1.2 2.7L12 12l3.2 2.6c.8.7 1.2 1.7 1.2 2.7v3.1"/>',
  mute: '<path d="M11 5.4 6.8 9H4v6h2.8L11 18.6z"/><path d="m15.4 9.8 4.6 4.4M20 9.8l-4.6 4.4"/>',
  music: '<path d="M9 17.9V6.2l10-2v11.5"/><circle cx="6.6" cy="17.9" r="2.4"/><circle cx="16.6" cy="15.7" r="2.4"/>',
  target: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.3"/><path d="M12 11.9h.01"/>',
  trending: '<path d="m4 16.6 5.5-5.5 3.5 3.5L20 7.6"/><path d="M15.4 7.6H20v4.6"/>',
  chart: '<path d="M4.4 19.6h15.2"/><path d="M6.6 17.4V12M11.4 17.4V8.4M16.2 17.4V5"/>',
  building: '<path d="M4 20.4h16"/><path d="M5.6 20.4V9.4L12 5l6.4 4.4v11"/><path d="M9.8 20.4v-5.2h4.4v5.2"/><path d="M9.8 11.6h4.4"/>',
  network: '<circle cx="12" cy="12" r="2.5"/><circle cx="5.2" cy="6.2" r="2.1"/><circle cx="18.8" cy="6.2" r="2.1"/><circle cx="5.2" cy="17.8" r="2.1"/><circle cx="18.8" cy="17.8" r="2.1"/><path d="m6.8 7.6 3.4 2.9M17.2 7.6l-3.4 2.9M6.8 16.4l3.4-2.9M17.2 16.4l-3.4-2.9"/>',
  question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 1 1 3.2 2.3c-.6.2-.9.8-.9 1.4v.4"/><path d="M12 16.8h.01"/>',
  play: '<path d="M7.8 5.2 18.6 12 7.8 18.8z"/>',
  stairs: '<path d="M3.6 19.6h4.6v-4h4.6v-4h4.6v-4h3"/>',
  bricks: '<rect x="4" y="14" width="16" height="5.6" rx="1.6"/><rect x="6" y="8.4" width="12" height="5.6" rx="1.6"/><rect x="8.4" y="2.8" width="7.2" height="5.6" rx="1.6"/>',
  battery: '<rect x="2.6" y="7.4" width="16" height="9.2" rx="2.6"/><path d="M21.4 11v2"/><path d="M6 11v2M9.4 11v2M12.8 11v2"/>',
  box: '<path d="m3.6 7.6 8.4-4 8.4 4v8.8l-8.4 4-8.4-4z"/><path d="m3.6 7.6 8.4 4 8.4-4M12 11.6v8.8"/>',
  waves: '<path d="M3.4 8.4c1.9-2 3.8-2 5.7 0s3.8 2 5.7 0 3.8-2 5.8 0"/><path d="M3.4 13c1.9-2 3.8-2 5.7 0s3.8 2 5.7 0 3.8-2 5.8 0"/><path d="M3.4 17.6c1.9-2 3.8-2 5.7 0s3.8 2 5.7 0 3.8-2 5.8 0"/>',

  // ── Bewertungs-Gesichter (Selbsteinschätzung / SRS-Noten) ────────────
  // Reihenfolge = Skala: blank (weg) → frown (zäh) → neutral (ok) → smile (mühelos)
  faceBlank: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="2.6 2.6"/><path d="M9 14.2h6"/>',
  faceFrown: '<circle cx="12" cy="12" r="8.5"/><path d="M8.9 15.8a4.1 4.1 0 0 1 6.2 0"/><path d="M9.4 9.9h.01M14.6 9.9h.01"/>',
  faceNeutral: '<circle cx="12" cy="12" r="8.5"/><path d="M9 14.6h6"/><path d="M9.4 9.9h.01M14.6 9.9h.01"/>',
  faceSmile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.9 13.6a4.1 4.1 0 0 0 6.2 0"/><path d="M9.4 9.9h.01M14.6 9.9h.01"/>',
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

/** Icon für einen Datei-MIME-Typ (Bibliothek/Referenz-Panel). */
export function fileIcon(mime = "") {
  if (/pdf/i.test(mime)) return "doc";
  if (/^image\//i.test(mime)) return "image";
  if (/^audio\//i.test(mime)) return "audio";
  if (/^video\//i.test(mime)) return "video";
  return "file";
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
