# Kairos

Ein adaptiver, evidenzbasierter Lernplaner für fokussiertes Arbeiten — besonders bei ADHS.

Kairos verbindet einen Fokus-Timer mit Aufgaben- und Prüfungsplanung, einer immer
sichtbaren Uhr und einer Tages-Timeline. Der Plan passt sich an: verpasste Blöcke brechen
ihn nie, und die App lernt dein echtes Lerntempo.

## Was drin ist

- **Fokus-Timer** mit automatischem Wechsel zwischen Fokus- und Pausenphasen.
- **Aufgaben & Prüfungen** mit Subtasks, Countdown und Tagesziel.
- **Tages-Timeline & Wochenkalender** mit immer sichtbarer Uhr.
- **Wearable-/Health-Anbindung** (RingConn als Referenz, auch WHOOP/Apple Health):
  Schlaf, HRV & Erholung fließen als Readiness-/Kapazitäts-Kontext in die Planung —
  siehe [`docs/HEALTH-API.md`](docs/HEALTH-API.md).
- **Offline-fähig** als Progressive Web App, lokal in SQLite gespeichert.

## Stack

Zero-Dependency Node-Backend (`node:sqlite`) + Vanilla-JS-PWA (ESM, kein Build-Schritt).
Die Fokus-Logik liegt geteilt in `shared/`.

## Loslegen

```bash
npm start        # Server + PWA auf http://localhost:4321
npm test
```

## Deployment (Docker)

Der gesamte Stack (Backend, API, PWA) läuft in **einem** Container mit
persistentem SQLite-Volume:

```bash
cp .env.example .env
docker compose up -d --build                 # App auf 127.0.0.1:4321
docker compose --profile proxy up -d --build # + Caddy mit automatischem HTTPS
```

> ⚠️ Die API ist unauthentifiziert und single-tenant — öffentlich nur hinter einem
> Zugriffsschutz (Basic-Auth/IP-Allowlist) betreiben, siehe `docs/DEPLOY.md`.

Details, Backup, Web-Push/HTTPS und die Skalierungsstrategie (warum genau **eine**
App-Instanz + skalierbarer Edge, plus Migrationspfad zu echtem horizontalem
Scaling) stehen in [`docs/DEPLOY.md`](docs/DEPLOY.md).

Mehr Details unter [`docs/`](docs/) — Spezifikation, Build-Contract und wissenschaftliche Grundlagen.
