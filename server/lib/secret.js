// Verschlüsselung für hinterlegte Kalender-Passwörter (AES-256-GCM, node:crypto).
//
// Schlüsselquelle: KAIROS_SECRET (empfohlen für Produktion — dann liegt der
// Schlüssel AUSSERHALB der DB). Ohne ENV wird einmalig ein zufälliger Seed in
// app_meta persistiert; das schützt DB-Dumps nur begrenzt (Seed liegt daneben),
// ist aber besser als Klartext und bleibt ohne Konfiguration lauffähig.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import * as repo from "../repo.js";

let keyCache = null;

function getKey() {
  if (keyCache) return keyCache;
  let seed = process.env.KAIROS_SECRET || null;
  if (!seed) {
    seed = repo.getMeta("secret_seed");
    if (!seed) {
      seed = randomBytes(32).toString("base64url");
      repo.setMeta("secret_seed", seed);
    }
  }
  keyCache = scryptSync(seed, "kairos-secret-v1", 32);
  return keyCache;
}

export function encryptSecret(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

// → Klartext oder null (falscher Schlüssel/kaputter Wert — nie werfen).
export function decryptSecret(enc) {
  const parts = String(enc || "").split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const d = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(parts[1], "base64url"));
    d.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([d.update(Buffer.from(parts[3], "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
