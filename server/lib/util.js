// Kleine Helfer für das Backend (kein npm, nur node: builtins).
import { randomUUID } from "node:crypto";

export function nowMs() {
  return Date.now();
}

// Fehler mit HTTP-Status (der Server nutzt err.status || 500 in seinem catch).
export function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Lokaler Tages-Schlüssel YYYY-MM-DD (nach Serverzeit — auf macOS via NTP synchron).
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Tages-Schlüssel in einer IANA-Zeitzone (z. B. "Europe/Zurich"). Ohne/ungültige
// Zone → Serverzeit-Fallback. Behebt die Streak-/„Heute"-Verschiebung, wenn der
// Server (UTC im Container) in einer anderen Zone tickt als der Nutzer studiert.
export function dayKeyTz(date = new Date(), timeZone = null) {
  if (!timeZone) return dayKey(date);
  try {
    // en-CA liefert YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date);
  } catch {
    return dayKey(date);
  }
}

// Minute-ab-Mitternacht in einer IANA-Zeitzone (für Ruhezeiten-Prüfung). Fallback: Serverzeit.
export function localMinutesInTz(epochMs, timeZone = null) {
  const d = new Date(epochMs);
  if (!timeZone) return d.getHours() * 60 + d.getMinutes();
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone, hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const mi = Number(parts.find((p) => p.type === "minute")?.value);
    if (!Number.isFinite(h) || !Number.isFinite(mi)) return d.getHours() * 60 + d.getMinutes();
    return (h % 24) * 60 + mi;
  } catch {
    return d.getHours() * 60 + d.getMinutes();
  }
}

export function uuid() {
  return randomUUID();
}

export function toInt(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function toNum(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toBool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function str(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value;
}

// Liest einen rohen Binär-Body (Datei-Upload) mit Limit.
export function readRawBody(req, limitBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(httpErr(413, "Datei zu groß (max. 25 MB)"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Liest einen JSON-Body aus einem http.IncomingMessage (mit Limit).
export function readJsonBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(httpErr(413, "Body zu groß"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(httpErr(400, "Ungültiges JSON"));
      }
    });
    req.on("error", reject);
  });
}
