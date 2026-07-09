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
