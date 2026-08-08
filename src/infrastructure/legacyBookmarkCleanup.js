// Einmal-Aufräumer für den ENTFERNTEN Lesezeichen-Ticker.
//
// Frühere Versionen legten ungefragt ein Lesezeichen ("Kairos MM:SS") in der
// Lesezeichenleiste an und schrieben dort im Sekundentakt die Restzeit hinein.
// Das Feature ist weg — aber die bereits angelegten Lesezeichen liegen weiter im
// Chrome-Profil des Nutzers. Dieses Modul löscht sie einmalig und entwaffnet sich
// danach selbst (Flag im Storage), damit kein Dauer-Zugriff auf Lesezeichen bleibt.
//
// Reihenfolge beim Aufräumen der Berechtigung: erst DIESEN Lauf einmal durchführen
// (dafür wird "bookmarks" in manifest.json noch gebraucht), danach kann die
// Berechtigung samt diesem Modul ersatzlos gestrichen werden — s. docs/BUILD.md.

const LEGACY_ID_KEY = "pomodoroBookmarkTickerId";   // gespeicherte ID des Ticker-Lesezeichens
const CLEANED_KEY = "pomodoroBookmarkTickerCleaned"; // gesetzt, sobald aufgeräumt wurde
const LEGACY_URL = "https://pomodoro.local/timer";   // URL, die der Ticker verwendete

export async function cleanupLegacyBookmarkTicker({ storage = chrome.storage.local, bookmarks = chrome.bookmarks } = {}) {
  // Ohne Lesezeichen-API (Berechtigung bereits entfernt) gibt es nichts zu tun.
  if (!bookmarks) return { removed: 0, skipped: "no-permission" };

  const flags = await storage.get([LEGACY_ID_KEY, CLEANED_KEY]).catch(() => ({}));
  if (flags?.[CLEANED_KEY]) return { removed: 0, skipped: "already-clean" };

  const ids = new Set();

  // 1) Das Lesezeichen, dessen ID wir selbst gespeichert hatten.
  const storedId = flags?.[LEGACY_ID_KEY];
  if (storedId) {
    const found = await bookmarks.get(storedId).catch(() => []);
    if (found.length > 0) ids.add(storedId);
  }

  // 2) Zusätzlich nach der Ticker-URL suchen — mehrere Profile/Neuinstallationen
  //    konnten mehrere Lesezeichen hinterlassen, deren IDs wir nicht mehr kennen.
  const bySearch = await bookmarks.search({ url: LEGACY_URL }).catch(() => []);
  for (const node of bySearch) if (node?.id) ids.add(node.id);

  let removed = 0;
  for (const id of ids) {
    const ok = await bookmarks.remove(id).then(() => true).catch(() => false);
    if (ok) removed++;
  }

  // Selbst entwaffnen: Flag setzen und die verwaiste ID aus dem Storage werfen.
  await storage.set({ [CLEANED_KEY]: true }).catch(() => {});
  await storage.remove?.(LEGACY_ID_KEY)?.catch?.(() => {});

  return { removed };
}
