// Konformitäts- und Korrektheitstests für die selbstgebaute Web-Push-Krypto.
// Kein Netzwerk, keine externen Deps — nur node:crypto + die RFC-Testvektoren.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import * as webpush from "../server/webpush.js";

// ── RFC 8291, Abschnitt 5: „Push Message Encryption Example" ─────────────
// Feste Eingaben ⇒ fester verschlüsselter Body. Reproduzieren wir ihn byte-genau,
// ist die gesamte Ableitung (ECDH, HKDF, AES-128-GCM, Header) korrekt.
const RFC8291 = {
  plaintext: "When I grow up, I want to be a watermelon",
  ua_public: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  as_private: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  as_public: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

test("RFC 8291 §5: encrypt() reproduziert den veröffentlichten Body byte-genau", () => {
  const { body } = webpush.encrypt(
    RFC8291.plaintext,
    { p256dh: RFC8291.ua_public, auth: RFC8291.auth },
    { serverPrivateKey: RFC8291.as_private, serverPublicKey: RFC8291.as_public, salt: RFC8291.salt }
  );
  assert.equal(body.toString("base64url"), RFC8291.body);
});

// ── Round-Trip: ein frisches „Client"-Abo kann entschlüsseln, was wir senden ──
test("Round-Trip: encrypt → decrypt ergibt den Klartext (auch mit UTF-8)", () => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const uaPublic = ecdh.getPublicKey();
  const authSecret = crypto.randomBytes(16);

  const message = JSON.stringify({ title: "Fokus beendet", body: "Kurze Pause 🌿 — durchatmen" });
  const { body } = webpush.encrypt(message, {
    p256dh: uaPublic.toString("base64url"),
    auth: authSecret.toString("base64url"),
  });

  assert.equal(decryptAes128Gcm(body, ecdh, authSecret).toString("utf8"), message);
});

// Referenz-Entschlüsselung (Empfängerseite) rein zur Verifikation im Test.
function decryptAes128Gcm(body, uaEcdh, authSecret) {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const payload = body.subarray(21 + idlen);

  const uaPublic = uaEcdh.getPublicKey();
  const sharedSecret = uaEcdh.computeSecret(asPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const tag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(0, payload.length - 16);
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(tag);
  const record = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Padding-Delimiter (0x02 im letzten Record) + evtl. 0x00-Padding entfernen.
  let end = record.length;
  while (end > 0 && record[end - 1] === 0x00) end--;
  if (end > 0 && (record[end - 1] === 0x02 || record[end - 1] === 0x01)) end--;
  return record.subarray(0, end);
}

// ── Record-Size-Grenze (ein einziger aes128gcm-Record) ───────────────────
test("encrypt() akzeptiert exakt die Maximalgröße (4079 B) und ist dechiffrierbar", () => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  const maxPlain = Buffer.alloc(4079, 0x61); // 'a' × 4079
  const { body } = webpush.encrypt(maxPlain, {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: authSecret.toString("base64url"),
  });
  assert.deepEqual(decryptAes128Gcm(body, ecdh, authSecret), maxPlain);
});

test("encrypt() wirft bei zu großer Payload statt korrupten Body zu erzeugen", () => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const tooBig = Buffer.alloc(4080, 0x62); // ein Byte über der Grenze
  assert.throws(
    () => webpush.encrypt(tooBig, {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: crypto.randomBytes(16).toString("base64url"),
    }),
    /zu groß/
  );
});

// ── VAPID (RFC 8292) ─────────────────────────────────────────────────────
test("VAPID: JWT wird als ES256 signiert und verifiziert korrekt", () => {
  const keys = webpush.generateVapidKeys();
  const nowMs = 1_700_000_000_000;
  const jwt = webpush.createVapidJwt(
    "https://push.example.net",
    { ...keys, subject: "mailto:test@localhost" },
    { now: nowMs }
  );

  const [h, p, s] = jwt.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
  const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));

  assert.equal(header.typ, "JWT");
  assert.equal(header.alg, "ES256");
  assert.equal(claims.aud, "https://push.example.net");
  assert.equal(claims.sub, "mailto:test@localhost");
  assert.equal(claims.exp, Math.floor(nowMs / 1000) + 12 * 60 * 60);

  // Signatur mit dem VAPID-Public-Key prüfen (raw R||S ⇒ ieee-p1363).
  const pub = Buffer.from(keys.publicKey, "base64url");
  const pubKey = crypto.createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: pub.subarray(1, 33).toString("base64url"),
      y: pub.subarray(33, 65).toString("base64url"),
    },
    format: "jwk",
  });
  const ok = crypto.verify(
    "sha256",
    Buffer.from(`${h}.${p}`, "ascii"),
    { key: pubKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(s, "base64url")
  );
  assert.equal(ok, true);
});

test("VAPID: aud wird aus dem Endpunkt-Origin abgeleitet (ohne Pfad)", () => {
  const keys = webpush.generateVapidKeys();
  const { Authorization } = webpush.vapidHeaders(
    "https://fcm.googleapis.com/fcm/send/abc123?query=1",
    { ...keys, subject: "mailto:a@b.c" }
  );
  assert.match(Authorization, /^vapid t=[^,]+, k=/);
  const token = Authorization.slice("vapid t=".length).split(", k=")[0];
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  assert.equal(claims.aud, "https://fcm.googleapis.com");
});

test("generateVapidKeys() liefert 65-Byte-Public- und 32-Byte-Private-Key", () => {
  const { publicKey, privateKey } = webpush.generateVapidKeys();
  assert.equal(Buffer.from(publicKey, "base64url").length, 65);
  assert.equal(Buffer.from(privateKey, "base64url").length, 32);
  assert.equal(Buffer.from(publicKey, "base64url")[0], 0x04); // unkomprimierter Punkt
});
