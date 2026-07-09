# Web Push — Benachrichtigungen bei geschlossener App

Die Lernuhr sendet Phasen-Benachrichtigungen („Fokus beendet", „Pause vorbei")
über **Web Push** — sie erreichen den Nutzer auch dann, wenn die PWA nicht offen
ist. Umgesetzt **ohne externe Abhängigkeiten**, nur mit `node:crypto` /
`node:http` / `node:sqlite` (passend zur Projektlinie „keine npm-Deps").

## Architektur

```
Phasenende (Server-Tick, autoritativ)
        │  timer.onPhaseComplete(evt)
        ▼
server/push.js  ──►  broadcast an alle Abos
        │  server/webpush.js: VAPID-JWT (ES256) + aes128gcm-Verschlüsselung
        ▼  HTTPS POST an den Push-Dienst (FCM/Mozilla/Apple)
Push-Dienst  ──►  Browser  ──►  web/sw.js  "push"-Event
        ▼
self.registration.showNotification(...)   ← auch bei geschlossener App
```

| Schicht | Datei | Aufgabe |
|---|---|---|
| Protokoll | `server/webpush.js` | VAPID (RFC 8292) + Verschlüsselung (RFC 8291/8188), rein `node:crypto` |
| Anwendung | `server/push.js` | VAPID-Key-Verwaltung, Abos, Broadcast, Pruning |
| Daten | `server/repo.js`, `schema.sql` | Tabellen `push_subscriptions`, `app_meta` |
| API | `server/routes.js` | `/api/push/public-key`, `/subscribe`, `/unsubscribe`, `/test` |
| Auslöser | `server/timer.js`, `index.js` | `onPhaseComplete` → Push |
| Client | `web/js/push.js` | Toggle-UI, Abo-Lebenszyklus |
| Empfang | `web/sw.js` | `push` / `notificationclick` / `pushsubscriptionchange` |

## Entdopplung (offen vs. geschlossen)

- **App sichtbar:** die Seite spielt den Ton + aktualisiert die UI; der Service
  Worker unterdrückt die OS-Notification (`clients.matchAll` → sichtbarer Client).
- **App im Hintergrund / geschlossen:** der Service Worker zeigt die Notification.
- **Kein Push (Browser ohne Unterstützung / abgelehnt):** `web/js/main.js` zeigt
  als Fallback die lokale `new Notification` (nur wenn `pushState.active === false`).

## VAPID-Schlüssel

Reihenfolge: **ENV → DB → einmalig automatisch generiert** (in `app_meta` gespeichert).
Für Dev ist nichts zu konfigurieren. Für Produktion / stabile Keys:

```bash
node scripts/gen-vapid.mjs
export VAPID_PUBLIC_KEY="…"
export VAPID_PRIVATE_KEY="…"
export VAPID_SUBJECT="mailto:du@example.com"
npm start
```

Der öffentliche Schlüssel wird über `/api/push/public-key` ausgeliefert; der
private Schlüssel verlässt den Server nie.

## Plattform-Hinweise

- **Chrome/Firefox/Edge (Desktop + Android):** funktioniert out-of-the-box.
- **Safari / iOS:** Push nur, wenn die PWA **zum Home-Bildschirm hinzugefügt**
  wurde (installiert), und die Seite muss über **HTTPS** laufen. `localhost`
  gilt beim Entwickeln als sicher.
- Ein Secure Context (HTTPS oder `localhost`) ist für Service Worker + Push Pflicht.

## Testen

```bash
npm test                 # inkl. tests/webpush.test.js:
                         #  • RFC-8291-§5-Konformität (byte-genau)
                         #  • encrypt→decrypt Round-Trip
                         #  • VAPID-JWT sign/verify (ES256)
```

In der PWA: Sidebar → **🔔 Benachrichtigungen aktivieren**. Nach dem Aktivieren
kommt sofort eine Testbenachrichtigung. Danach beendet eine ablaufende Fokus-/
Pausenphase automatisch eine Push-Nachricht — auch bei geschlossenem Tab.

## Grenzen (bewusst)

- **Payload:** ein einzelner aes128gcm-Record → max. **4079 Byte** Klartext.
  `encrypt()` wirft bei Überschreitung (statt einen undechiffrierbaren Body zu
  senden). Für die App-Payloads (kurzes JSON) unkritisch.
- **Push-Fenster nach Downtime:** Ein Phasenabschluss löst nur dann noch einen
  Push aus, wenn er ≤ 10 min zurückliegt (`NOTIFY_GRACE_MS`) — deckt kurzen
  Laptop-Sleep ab, verhindert aber uralte Pushes nach langem Server-Ausfall.
- **Mehrere offene Tabs:** OS-Notifications werden per `tag` zusammengeführt; der
  Weck-Ton (WebAudio) kann bei mehreren offenen Tabs mehrfach erklingen (kein
  Cross-Tab-Leader — bewusst einfach gehalten).
