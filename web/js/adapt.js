// Adapt-Engine: wendet Nutzer-Prefs (Darstellung + Zugänglichkeit) auf das DOM an.
// Quelle ist store.state.prefs.appearance / .access; zum flackerfreien Start wird
// die letzte Darstellung in localStorage gespiegelt und schon beim Modul-Import
// angewandt (vor dem ersten Snapshot). CSS-Seite: web/css/adapt.css.

// Jeder Eintrag trägt de UND en — vorher gab es nur `de`, weshalb die Tooltips
// der Farbfelder auch in der englischen Oberfläche deutsch blieben.
export const ACCENTS = [
  { id: "sage",       de: "Salbei",     en: "Sage",       color: "#3E7D5E" },
  { id: "amber",      de: "Bernstein",  en: "Amber",      color: "#C89A4C" },
  { id: "terracotta", de: "Terrakotta", en: "Terracotta", color: "#C2603F" },
  { id: "blue",       de: "Blau",       en: "Blue",       color: "#5D82AE" },
  { id: "pink",       de: "Rosé",       en: "Rosé",       color: "#C98AA6" },
  { id: "violet",     de: "Violett",    en: "Violet",     color: "#8A7CC2" },
  { id: "teal",       de: "Petrol",     en: "Teal",       color: "#3F8E86" },
  { id: "slate",      de: "Graphit",    en: "Slate",      color: "#5F6B77" },
];

export const THEMES = [
  { id: "system", de: "Automatisch", en: "Auto" },
  { id: "light",  de: "Hell",        en: "Light" },
  { id: "dark",   de: "Dunkel",      en: "Dark" },
];

export const FONT_SCALES = [
  { id: "s",  de: "Klein",     en: "Small",      zoom: 0.92 },
  { id: "m",  de: "Standard",  en: "Default",    zoom: 1 },
  { id: "l",  de: "Groß",      en: "Large",      zoom: 1.08 },
  { id: "xl", de: "Sehr groß", en: "Extra large", zoom: 1.18 },
];

const LS_KEY = "kairos_appearance";

// Fokusfläche: wie sich der Vollbild-Fokusmodus farblich verhält.
//   dim   — abgesenkte, ruhige Fläche („do not disturb"), aus dem Akzent getönt
//   match — exakt die App-Tokens; hell bleibt hell
export const FOCUS_SURFACES = [
  { id: "dim",   de: "Gedämpft", en: "Dimmed" },
  { id: "match", de: "Wie App",  en: "Match app" },
];

const DEFAULT_APPEARANCE = {
  accent: "sage", theme: "system", fontScale: "m", density: "cozy", focusSurface: "dim",
};
const DEFAULT_ACCESS = {
  reduceMotion: false, highContrast: false, dyslexiaFont: false, numberFriendly: false,
};

let media = null;
try { media = window.matchMedia("(prefers-color-scheme: dark)"); } catch { /* kein DOM */ }

function resolveTheme(theme) {
  if (theme === "dark" || theme === "light") return theme;
  return media && media.matches ? "dark" : "light";
}

// Browser-/PWA-Titelleiste an das ECHTE App-Theme koppeln. Die statischen
// <meta name="theme-color" media="…"> in index.html folgen nur dem System —
// wer Hell/Dunkel erzwingt, bekäme sonst eine unpassende Leiste. Der Browser
// nimmt das erste passende Meta, darum ersetzen wir sie durch ein gepflegtes.
function applyThemeColor() {
  const head = document.head;
  if (!head) return;
  const root = document.documentElement;
  const page = getComputedStyle(root).getPropertyValue("--page").trim();
  const color = page || (root.dataset.theme === "dark" ? "#161815" : "#DDDBD3");
  let meta = head.querySelector('meta[name="theme-color"][data-managed="1"]');
  if (!meta) {
    for (const m of head.querySelectorAll('meta[name="theme-color"]')) m.remove();
    meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.dataset.managed = "1";
    head.prepend(meta);
  }
  if (meta.content !== color) meta.content = color;
}

// Prefs → <html data-*> (die gesamte Optik hängt an diesen Attributen).
export function applyAppearance(appearance = {}, access = {}) {
  const a = { ...DEFAULT_APPEARANCE, ...appearance };
  const x = { ...DEFAULT_ACCESS, ...access };
  const root = document.documentElement;
  root.dataset.accent = ACCENTS.some((c) => c.id === a.accent) ? a.accent : "sage";
  root.dataset.theme = resolveTheme(a.theme);
  root.dataset.themePref = a.theme;
  root.dataset.fontscale = FONT_SCALES.some((f) => f.id === a.fontScale) ? a.fontScale : "m";
  root.dataset.density = a.density === "compact" ? "compact" : "cozy";
  root.dataset.focusSurface = a.focusSurface === "match" ? "match" : "dim";
  root.dataset.reduceMotion = x.reduceMotion ? "1" : "0";
  root.dataset.contrast = x.highContrast ? "high" : "normal";
  root.dataset.dyslexia = x.dyslexiaFont ? "1" : "0";
  root.dataset.numberfriendly = x.numberFriendly ? "1" : "0";
  // Browser-UI (Scrollbars, Form-Controls) mitziehen.
  root.style.colorScheme = root.dataset.theme;
  applyThemeColor();
  try { localStorage.setItem(LS_KEY, JSON.stringify({ appearance: a, access: x })); } catch { /* privat */ }
}

// Sofort beim Import: letzte bekannte Darstellung anwenden (kein Flackern).
try {
  const cached = JSON.parse(localStorage.getItem(LS_KEY) || "null");
  if (cached) applyAppearance(cached.appearance, cached.access);
} catch { /* erster Start */ }

export function initAdapt({ store }) {
  let lastJson = "";
  const render = (s) => {
    const appearance = s.prefs?.appearance || {};
    const access = s.prefs?.access || {};
    const json = JSON.stringify({ appearance, access });
    if (json === lastJson || !s.loaded) return;
    lastJson = json;
    applyAppearance(appearance, access);
  };
  store.subscribe(render);
  // Systemthema wechselt live (nur relevant bei theme=system).
  media?.addEventListener?.("change", () => {
    if (document.documentElement.dataset.themePref === "system") {
      document.documentElement.dataset.theme = resolveTheme("system");
      document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
      applyThemeColor();
    }
  });
  render(store.state);
  return {};
}
