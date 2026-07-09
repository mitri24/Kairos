# Kairos

Ein adaptiver, evidenzbasierter Lernplaner für fokussiertes Arbeiten — besonders bei ADHS.

Kairos verbindet einen Fokus-Timer mit Aufgaben- und Prüfungsplanung, einer immer
sichtbaren Uhr und einer Tages-Timeline. Der Plan passt sich an: verpasste Blöcke brechen
ihn nie, und die App lernt dein echtes Lerntempo.

## Was drin ist

- **Fokus-Timer** mit automatischem Wechsel zwischen Fokus- und Pausenphasen.
- **Aufgaben & Prüfungen** mit Subtasks, Countdown und Tagesziel.
- **Tages-Timeline & Wochenkalender** mit immer sichtbarer Uhr.
- **Offline-fähig** als Progressive Web App, lokal in SQLite gespeichert.

## Stack

Zero-Dependency Node-Backend (`node:sqlite`) + Vanilla-JS-PWA (ESM, kein Build-Schritt).
Die Fokus-Logik liegt geteilt in `shared/`.

## Loslegen

```bash
npm start        # Server + PWA auf http://localhost:4321
npm test
```

Mehr Details unter [`docs/`](docs/) — Spezifikation, Build-Contract und wissenschaftliche Grundlagen.
