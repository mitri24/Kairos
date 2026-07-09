// VAPID-Schlüsselpaar erzeugen (für Produktion / feste Keys über ENV).
// Aufruf:  node scripts/gen-vapid.mjs
//
// Ohne feste Keys generiert der Server beim ersten Start automatisch welche und
// speichert sie in der SQLite-DB (app_meta). Für mehrere Instanzen oder stabile
// Keys über DB-Resets hinweg setzt man stattdessen die ausgegebenen ENV-Variablen.
import { generateVapidKeys } from "../server/webpush.js";

const { publicKey, privateKey } = generateVapidKeys();

console.log(`
VAPID-Schlüssel erzeugt. In der Produktion als Umgebungsvariablen setzen:

  export VAPID_PUBLIC_KEY="${publicKey}"
  export VAPID_PRIVATE_KEY="${privateKey}"
  export VAPID_SUBJECT="mailto:du@example.com"

Der öffentliche Schlüssel darf im Client landen (wird ohnehin über
/api/push/public-key ausgeliefert). Den privaten Schlüssel NIEMALS teilen.
`);
