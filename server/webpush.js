// Web-Push-Protokoll — from scratch, nur mit node:crypto (keine externen Deps).
// Implementiert:
//   • VAPID (RFC 8292): ES256-JWT + "Authorization: vapid t=…, k=…".
//   • Nachrichten-Verschlüsselung (RFC 8291) im aes128gcm-Content-Encoding (RFC 8188).
//
// Warum from scratch? Das Projekt ist bewusst dependency-frei (node:sqlite, node:http).
// Die komplette Push-Krypto lässt sich mit ECDH (P-256), HKDF-SHA256, AES-128-GCM und
// ES256 aus node:crypto abbilden. Konformität ist gegen die RFC-8291-Testvektoren
// geprüft (siehe tests/webpush.test.js).
import crypto from "node:crypto";

const CURVE = "prime256v1"; // == NIST P-256 / secp256r1
const PUBLIC_KEY_BYTES = 65; // unkomprimierter Punkt: 0x04 || X(32) || Y(32)
const PRIVATE_KEY_BYTES = 32;
const RECORD_SIZE = 4096; // rs — ein einziger Record; Klartext + Delimiter + GCM-Tag ≤ rs
const GCM_TAG_BYTES = 16;
// Max. Klartext, der noch in einen einzigen aes128gcm-Record passt: rs − Delimiter(1) − Tag(16).
const MAX_PLAINTEXT_BYTES = RECORD_SIZE - 1 - GCM_TAG_BYTES; // 4079

// ── base64url ────────────────────────────────────
const b64u = {
  encode: (buf) => Buffer.from(buf).toString("base64url"),
  decode: (str) => Buffer.from(String(str), "base64url"),
};

// Links mit Nullbytes auf feste Länge bringen (EC-Skalare können führende Null haben).
function padStart(buf, len) {
  if (buf.length === len) return buf;
  if (buf.length > len) return buf.subarray(buf.length - len);
  const out = Buffer.alloc(len);
  buf.copy(out, len - buf.length);
  return out;
}

// ── HKDF (Extract + Expand in einem Aufruf) ──────
// node: hkdfSync(digest, ikm, salt, info, keylen) == HKDF-Expand(HKDF-Extract(salt, ikm), info, keylen)
function hkdf(salt, ikm, info, length) {
  return Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, length));
}

// ── ECDH-Helfer ──────────────────────────────────
function ecdhFromPrivate(privateKey /* Buffer(32) */) {
  const ecdh = crypto.createECDH(CURVE);
  ecdh.setPrivateKey(privateKey);
  return ecdh;
}

// Öffentlichen Punkt (65 B) aus privatem Skalar ableiten.
function publicFromPrivate(privateKey) {
  return ecdhFromPrivate(privateKey).getPublicKey();
}

// ── VAPID-Schlüsselpaar erzeugen ─────────────────
export function generateVapidKeys() {
  const ecdh = crypto.createECDH(CURVE);
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: padStart(ecdh.getPrivateKey(), PRIVATE_KEY_BYTES).toString("base64url"),
  };
}

// ── Nachrichten-Verschlüsselung (RFC 8291 + RFC 8188) ─────────────
// clientKeys: { p256dh, auth } (base64url, wie im PushSubscription.keys)
// opts (nur für Tests deterministisch): { serverPrivateKey, serverPublicKey, salt } (base64url)
export function encrypt(payload, clientKeys, opts = {}) {
  const plaintext = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8");
  const clientPublic = b64u.decode(clientKeys.p256dh); // ua_public (65 B)
  const authSecret = b64u.decode(clientKeys.auth); // 16 B

  if (clientPublic.length !== PUBLIC_KEY_BYTES) {
    throw new Error(`p256dh muss ${PUBLIC_KEY_BYTES} Bytes sein (ist ${clientPublic.length})`);
  }
  // Wir erzeugen bewusst nur EINEN Record. Größere Payloads würden ein Multi-Record-
  // Format erfordern (RFC 8188); statt einen still nicht-dechiffrierbaren Body zu
  // senden, hier klar scheitern. Push-Payloads sind ohnehin auf ~4 KB begrenzt.
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new Error(`Payload zu groß: ${plaintext.length} B > ${MAX_PLAINTEXT_BYTES} B (max. für einen aes128gcm-Record)`);
  }

  const salt = opts.salt ? b64u.decode(opts.salt) : crypto.randomBytes(16);

  let serverPrivate;
  let serverPublic;
  if (opts.serverPrivateKey) {
    serverPrivate = padStart(b64u.decode(opts.serverPrivateKey), PRIVATE_KEY_BYTES);
    serverPublic = opts.serverPublicKey ? b64u.decode(opts.serverPublicKey) : publicFromPrivate(serverPrivate);
  } else {
    const ecdh = crypto.createECDH(CURVE);
    ecdh.generateKeys();
    serverPrivate = ecdh.getPrivateKey();
    serverPublic = ecdh.getPublicKey();
  }

  // ECDH-Shared-Secret (32-B X-Koordinate).
  const sharedSecret = ecdhFromPrivate(serverPrivate).computeSecret(clientPublic);

  // IKM ableiten (RFC 8291 §3.4): key_info = "WebPush: info" 0x00 ua_public as_public.
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), clientPublic, serverPublic]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);

  // Content-Encryption-Key + Nonce (RFC 8188 §2.2/2.3).
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);

  // Einziges Record: plaintext || 0x02 (Padding-Delimiter des letzten Records).
  const record = Buffer.concat([plaintext, Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  // Header: salt(16) || rs(4, big-endian) || idlen(1) || keyid(as_public, 65).
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(RECORD_SIZE, 0);
  const header = Buffer.concat([salt, rs, Buffer.from([serverPublic.length]), serverPublic]);

  return {
    body: Buffer.concat([header, ciphertext]),
    salt: salt.toString("base64url"),
    serverPublicKey: serverPublic.toString("base64url"),
  };
}

// ── VAPID-JWT (RFC 8292 §2) ──────────────────────
// vapid: { publicKey, privateKey, subject } (Keys base64url).
export function createVapidJwt(audience, vapid, opts = {}) {
  const header = { typ: "JWT", alg: "ES256" };
  const nowMs = opts.now ?? Date.now();
  const expSeconds = opts.expSeconds ?? 12 * 60 * 60; // 12 h (< 24 h Maximum)
  const claims = {
    aud: audience,
    exp: Math.floor(nowMs / 1000) + expSeconds,
    sub: vapid.subject || "mailto:admin@localhost",
  };
  const signingInput =
    b64u.encode(Buffer.from(JSON.stringify(header), "utf8")) +
    "." +
    b64u.encode(Buffer.from(JSON.stringify(claims), "utf8"));

  const key = privateKeyObject(vapid.privateKey, vapid.publicKey);
  // dsaEncoding "ieee-p1363" ⇒ rohe 64-B-R||S-Signatur (JWS/ES256), nicht DER.
  const signature = crypto.sign("sha256", Buffer.from(signingInput, "ascii"), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

// P-256-Private-Key-Objekt aus rohem Skalar (+ öffentlichem Punkt für x/y) bauen.
function privateKeyObject(privateB64, publicB64) {
  const pub = b64u.decode(publicB64);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: padStart(b64u.decode(privateB64), PRIVATE_KEY_BYTES).toString("base64url"),
    x: pub.subarray(1, 33).toString("base64url"),
    y: pub.subarray(33, 65).toString("base64url"),
  };
  return crypto.createPrivateKey({ key: jwk, format: "jwk" });
}

// VAPID-Header für einen konkreten Endpunkt bauen.
export function vapidHeaders(endpoint, vapid, opts = {}) {
  const audience = new URL(endpoint).origin;
  const token = createVapidJwt(audience, vapid, opts);
  return { Authorization: `vapid t=${token}, k=${vapid.publicKey}` };
}

// ── Versand ──────────────────────────────────────
// subscription: { endpoint, keys: { p256dh, auth } }
// Gibt { statusCode, ok, endpoint, body } zurück. Fehler (Verschlüsselung, Netz)
// werden NICHT geworfen, sondern als { ok:false, statusCode:0, error } gemeldet,
// damit ein einzelner toter Endpunkt den Broadcast nicht abbricht.
export async function sendNotification(subscription, payload, vapid, opts = {}) {
  const endpoint = subscription.endpoint;
  try {
    const { body } = encrypt(payload, subscription.keys);
    const headers = {
      ...vapidHeaders(endpoint, vapid, opts),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(opts.ttl ?? 2 * 60 * 60),
      Urgency: opts.urgency ?? "normal",
    };
    if (opts.topic) headers.Topic = opts.topic;

    const res = await fetch(endpoint, { method: "POST", headers, body });
    let text = "";
    if (!res.ok) text = await res.text().catch(() => "");
    return { statusCode: res.status, ok: res.ok, endpoint, body: text };
  } catch (err) {
    return { statusCode: 0, ok: false, endpoint, body: "", error: err.message };
  }
}
