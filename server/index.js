// Zero-Dependency HTTP-Server: liefert die PWA statisch aus, stellt die REST-API bereit
// und lässt die Timer-Engine per Tick weiterlaufen (auch ohne offenen Client).
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { getDb } from "./db.js";
import { handleApi } from "./routes.js";
import * as timer from "./timer.js";
import * as push from "./push.js";
import * as reminders from "./reminders.js";
import * as calsync from "./calsync.js";
import * as share from "./share.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WEB_DIR = join(ROOT, "web");
const SHARED_DIR = join(ROOT, "shared");
const PORT = Number(process.env.PORT || 4321);
// Bind-Adresse: Default 0.0.0.0 (Docker-Port-Mapping, bisheriges Verhalten). Für
// einen lokalen Einzelnutzer-Betrieb mit sensiblen Health-Daten HOST=127.0.0.1 setzen.
const HOST = process.env.HOST || "0.0.0.0";
// CORS-Origin: Default "*" (Extension/PWA-Kompatibilität). Auf die eigene Origin
// setzen (oder leer lassen), um Cross-Origin-Lesen der API zu unterbinden.
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
};

// CORS-Header nur, wenn eine Origin konfiguriert ist (CORS_ORIGIN="" schaltet ab).
const CORS_HEADERS = CORS_ORIGIN
  ? {
      "Access-Control-Allow-Origin": CORS_ORIGIN,
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }
  : {};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

// API-Ergebnis senden: JSON, roher (HTML-)Body oder Redirect — je nach Handler,
// inkl. Set-Cookie/Location-Header (Auth-Flow).
function sendApiResult(res, result) {
  const headers = { ...CORS_HEADERS, "Cache-Control": "no-store", ...(result.headers || {}) };
  if (result.status >= 300 && result.status < 400 && headers.Location) {
    res.writeHead(result.status, headers);
    return res.end();
  }
  if (result.raw !== undefined) {
    if (!headers["Content-Type"]) headers["Content-Type"] = "text/plain; charset=utf-8";
    res.writeHead(result.status, headers);
    return res.end(result.raw);
  }
  if (!headers["Content-Type"]) headers["Content-Type"] = "application/json; charset=utf-8";
  res.writeHead(result.status, headers);
  res.end(JSON.stringify(result.body));
}

// Statische Datei aus einem erlaubten Verzeichnis (mit Path-Traversal-Schutz).
async function sendFile(res, baseDir, relPath) {
  const safe = normalize(relPath).replace(/^(\.\.[/\\])+/, "");
  const full = join(baseDir, safe);
  if (!full.startsWith(baseDir)) { res.writeHead(403); res.end("Forbidden"); return; }
  try {
    const info = await stat(full);
    if (info.isDirectory()) return sendFile(res, baseDir, join(safe, "index.html"));
    const data = await readFile(full);
    const type = MIME[extname(full).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Nicht gefunden");
  }
}

const server = http.createServer(async (req, res) => {
  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  } catch {
    pathname = req.url || "/";
  }

  // CORS-Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // API
  if (pathname.startsWith("/api/")) {
    try {
      const result = await handleApi(req, pathname);
      if (result) return sendApiResult(res, result);
      return sendJson(res, 404, { error: "Unbekannte API-Route" });
    } catch (err) {
      return sendJson(res, err.status || 500, { error: err.message || "Serverfehler" });
    }
  }

  // Öffentliche Share-Seite (/s/:token) — HTML, ohne Login lesbar.
  if (pathname.startsWith("/s/")) {
    const token = pathname.slice(3).split("/")[0];
    try {
      const r = share.resolveShare(token, { countView: true });
      if (r) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(share.renderShareHtml(r.share, r.payload));
      }
    } catch (err) {
      console.warn("[Kairos] Share-Seite:", err.message);
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    return res.end('<!doctype html><meta charset=utf-8><body style="font-family:system-ui;padding:48px;max-width:32rem;margin:auto"><h2>Link unbekannt oder widerrufen</h2><p>Frag die Person, die geteilt hat, nach einem neuen Link.</p>');
  }

  // Geteilte Domänenlogik (von der PWA per <script type=module> importiert)
  if (pathname.startsWith("/shared/")) {
    return sendFile(res, SHARED_DIR, pathname.slice("/shared/".length));
  }

  // Statische PWA
  if (pathname === "/") return sendFile(res, WEB_DIR, "index.html");
  return sendFile(res, WEB_DIR, pathname.slice(1));
});

// DB initialisieren (Schema anlegen), dann Tick-Loop starten.
getDb();

// Phasenabschluss → Web Push an alle Abonnements (auch bei geschlossener App).
timer.onPhaseComplete((evt) => {
  push.notifyPhaseComplete(evt).catch((err) => console.error("[Kairos] Push:", err.message));
});

// Pausen-Overrun → sanfte Erinnerung, zum Fokus zurückzukommen (DND-gated im Tick).
timer.onBreakOverrun((evt) => {
  push.notifyBreakOverrun(evt).catch((err) => console.error("[Kairos] Push (Overrun):", err.message));
});

const tickInterval = setInterval(() => {
  try {
    timer.tick();
  } catch (err) {
    console.error("[Kairos] Tick-Fehler:", err.message);
  }
}, 1000);
tickInterval.unref?.();

// Task-Erinnerungen ("gleich dran"/"jetzt dran") — eigene Schleife über alle
// Nutzer mit Push-Abo, minutengenau reicht → alle 30 s.
const remindInterval = setInterval(() => {
  try {
    reminders.checkTaskReminders();
  } catch (err) {
    console.error("[Kairos] Erinnerungs-Fehler:", err.message);
  }
}, 30_000);
remindInterval.unref?.();

// Kalender-Sync: prüft minütlich, welche Konten fällig sind (Intervall pro
// Konto: calsync.SYNC_INTERVAL_MS, Delta-Sync → günstig).
const calInterval = setInterval(() => {
  calsync.syncDueAccounts().catch((err) => console.error("[Kairos] Kalender-Sync:", err.message));
}, 60_000);
calInterval.unref?.();

server.listen(PORT, HOST, () => {
  console.log(`\n  ⏱  Kairos läuft auf  http://localhost:${PORT}\n`);
});

function shutdown() {
  clearInterval(tickInterval);
  clearInterval(remindInterval);
  clearInterval(calInterval);
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
