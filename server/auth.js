// Passwortlose Authentifizierung (Magic-Link) + server-seitige Sitzungen.
// Zero-dep: node:crypto für Tokens/Hashes. Tabellen: users, magic_tokens,
// auth_sessions (aus migrations/multitenant.mjs). Diese Tabellen sind GLOBAL
// (nicht per-Nutzer skopiert) — daher direkter DB-Zugriff, kein authctx.
import { randomBytes, createHash } from "node:crypto";
import { getDb } from "./db.js";
import { nowMs } from "./lib/util.js";

const TOKEN_TTL_MS = 15 * 60_000;        // Magic-Link 15 min gültig
const SESSION_TTL_MS = 30 * 86_400_000;  // Sitzung 30 Tage
export const COOKIE_NAME = "kairos_session";

const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");
const randHex = (n = 32) => randomBytes(n).toString("hex");

export const normalizeEmail = (e) => String(e || "").trim().toLowerCase();
// Bewusst tolerant: akzeptiert normale Adressen UND Single-Label-Hosts wie
// `owner@localhost` (der Migrations-Default-Owner muss sich einloggen können).
export const isEmail = (e) => /^[^\s@]+@[^\s@]+$/.test(e);

// ── Users ────────────────────────────────────────
export function findUserByEmail(email) {
  return getDb().prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)) || null;
}
export function getUser(id) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
}
export function findOrCreateUser(email) {
  const e = normalizeEmail(email);
  if (!isEmail(e)) return null;
  const existing = findUserByEmail(e);
  if (existing) return existing;
  const info = getDb().prepare("INSERT INTO users (email, verified, created_at) VALUES (?, 0, ?)").run(e, nowMs());
  return getUser(Number(info.lastInsertRowid));
}
export function deleteUserAccount(userId) {
  // CASCADE (users → alle Besitzer-Tabellen) räumt sämtliche Daten des Nutzers.
  getDb().prepare("DELETE FROM users WHERE id = ?").run(userId);
}

// ── Magic-Link-Token (nur SHA-256-Hash gespeichert) ──
export function createMagicToken(userId) {
  const db = getDb();
  db.prepare("DELETE FROM magic_tokens WHERE user_id = ?").run(userId); // nur der jüngste gilt
  const raw = randHex(32);
  db.prepare("INSERT INTO magic_tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256(raw), userId, nowMs(), nowMs() + TOKEN_TTL_MS);
  return raw;
}
// Verbraucht den Token (single-use). Gibt user_id zurück oder null.
export function consumeMagicToken(raw) {
  const db = getDb();
  const hash = sha256(raw || "");
  const row = db.prepare("SELECT * FROM magic_tokens WHERE token_hash = ?").get(hash);
  if (!row) return null;
  db.prepare("DELETE FROM magic_tokens WHERE token_hash = ?").run(hash); // einmalig
  if (row.expires_at < nowMs()) return null;
  db.prepare("UPDATE users SET verified = 1 WHERE id = ?").run(row.user_id);
  return row.user_id;
}

// ── Sitzungen ────────────────────────────────────
export function createSession(userId, userAgent = null) {
  const id = randHex(32);
  const expiresAt = nowMs() + SESSION_TTL_MS;
  getDb().prepare("INSERT INTO auth_sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)")
    .run(id, userId, nowMs(), expiresAt, userAgent);
  return { id, expiresAt };
}
export function getUserBySession(sessionId) {
  if (!sessionId) return null;
  return getDb().prepare(`
    SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ?
  `).get(sessionId, nowMs()) || null;
}
export function deleteSession(sessionId) {
  if (sessionId) getDb().prepare("DELETE FROM auth_sessions WHERE id = ?").run(sessionId);
}
export function cleanupExpired() {
  const now = nowMs();
  getDb().prepare("DELETE FROM auth_sessions WHERE expires_at < ?").run(now);
  getDb().prepare("DELETE FROM magic_tokens WHERE expires_at < ?").run(now);
}

// ── Cookies ──────────────────────────────────────
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1" || process.env.COOKIE_SECURE === "true";
export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function sessionCookie(sessionId) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${COOKIE_SECURE ? "; Secure" : ""}`;
}
export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${COOKIE_SECURE ? "; Secure" : ""}`;
}

// ── Magic-Link-Zustellung ────────────────────────
// Zero-dep: kein Mailversand eingebaut. Der Link wird IMMER in die Server-Konsole
// geloggt (Operator kann Mail extern anbinden). Für lokalen Self-Host wird er
// zusätzlich an localhost-Clients zurückgegeben. AUTH_DEV_LINK überschreibt:
// "1" = immer zurückgeben, "0" = nie.
const DEV_LINK = process.env.AUTH_DEV_LINK;
export function deliverMagicLink(email, url, { local = false } = {}) {
  console.log(`\n  Magic-Link für ${email}:\n      ${url}\n`);
  const echo = DEV_LINK === "1" || (DEV_LINK !== "0" && local);
  return echo ? url : null;
}
