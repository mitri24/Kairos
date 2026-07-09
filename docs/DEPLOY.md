# Deployment (Docker)

Kairos ist als **ein** Container-Image verpackt: das Zero-Dependency-Node-Backend
liefert im selben Prozess die REST-API (`/api/*`), die geteilte Domänenlogik
(`/shared/*`) und die statische PWA (`/`) aus. Die Daten liegen in SQLite auf
einem persistenten Volume.

## TL;DR

```bash
cp .env.example .env          # anpassen (TZ, optional VAPID, DOMAIN für Proxy)

# Nur die App (lokal / hinter eigenem Proxy) — erreichbar auf 127.0.0.1:4321
docker compose up -d --build

# App + automatisches HTTPS (Caddy/Let's Encrypt) für eine öffentliche Domain
docker compose --profile proxy up -d --build
```

Kurzbefehle: `npm run docker:up`, `npm run docker:proxy`, `npm run docker:logs`,
`npm run docker:down`.

> ⚠️ **Kein Auth.** Die API ist unauthentifiziert und **single-tenant** — jede
> `/api/*`-Route ist von jedem beschreibbar (geteilter Timer, Push-Abos,
> Test-Push-Broadcast). Exponiere die App **nie** ins offene Netz ohne einen
> Zugriffsschutz davor. Siehe [HTTPS, Zugriffsschutz & Web Push](#https-zugriffsschutz--web-push).

## Was das Image enthält

| Pfad | Zweck |
| --- | --- |
| `server/` | Node/HTTP-Server, Timer-Engine, SQLite-Zugriff, Web-Push |
| `shared/` | geteilte Pomodoro-/Tagesplan-Logik (von der PWA importiert) |
| `web/` | die PWA (statische Assets, Service Worker) |

Nicht im Image: die lokale Entwicklungs-Datenbank (`server/data/`), `Pace/`,
`docs/`, `tests/`, `assets/`, die Chrome-Extension (`src/`). Siehe `.dockerignore`.

Das Image läuft als **unprivilegierter `node`-User**. `node:sqlite` ist fest in
die Node-Binary kompiliert — kein nativer Build-Schritt, keine System-Libraries,
keine npm-Dependencies.

## Konfiguration (Umgebungsvariablen)

| Variable | Default | Zweck |
| --- | --- | --- |
| `PORT` | `4321` | interner HTTP-Port |
| `LERNUHR_DB` | `/data/kairos.db` | SQLite-Dateipfad (liegt auf dem Volume) |
| `TZ` | `Europe/Zurich` | lokale Tagesgrenzen für die Tages-Metriken |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | _(leer)_ | feste Web-Push-Schlüssel; leer ⇒ einmalig generiert und in der DB persistiert |
| `VAPID_SUBJECT` | `mailto:admin@localhost` | `mailto:`/URL für den VAPID-JWT |
| `DOMAIN` | _(leer)_ | öffentliche Domain für den Caddy-Proxy |

Feste VAPID-Schlüssel erzeugen: `npm run gen:vapid` → Ausgabe in `.env` eintragen.
Nur Docker (ohne lokales Node)? Paste-fertige Zeilen direkt aus dem Container:

```bash
docker compose exec app node -e "import('./server/webpush.js').then(({generateVapidKeys})=>{const k=generateVapidKeys();console.log('VAPID_PUBLIC_KEY='+k.publicKey);console.log('VAPID_PRIVATE_KEY='+k.privateKey)})"
```

Ohne feste Schlüssel funktioniert Push trotzdem — der Server generiert beim ersten
Start ein Paar und speichert es in der DB. Feste Schlüssel bleiben nur über einen
DB-Reset hinweg stabil (Abos brechen sonst). `VAPID_PRIVATE_KEY` ist ein Secret:
nicht committen (`.gitignore` deckt `.env` ab), `.env` mit `chmod 600` schützen —
env-gesetzte Keys sind zudem in `docker inspect`/`docker compose config` sichtbar.

## Persistenz & Backup

Die gesamte Anwendungsdatenlage steckt in **einer** SQLite-Datei auf dem Volume
`kairos-data` (`/data/kairos.db`, plus `-wal`/`-shm` im WAL-Modus).

**Backup** (konsistent inkl. WAL, per SQLite-`VACUUM INTO`). Das führende `rm`
macht den Befehl wiederholbar (`VACUUM INTO` scheitert, wenn die Zieldatei schon
existiert); das abschließende `rm` lässt keine geheime DB-Kopie auf dem Volume
liegen. Die herauskopierte `kairos-backup.db` enthält den VAPID-Private-Key und
alle Push-Abos — sicher verwahren.

```bash
docker compose exec app sh -c 'rm -f /data/backup.db && node -e "const{DatabaseSync}=require(\"node:sqlite\");new DatabaseSync(process.env.LERNUHR_DB).exec(\"VACUUM INTO \x27/data/backup.db\x27\")"'
docker compose cp app:/data/backup.db ./kairos-backup.db
docker compose exec app rm -f /data/backup.db
```

**Restore** (App vorher stoppen). `docker cp`/Restore erhält die Eigentümer nicht,
darum danach Ownership auf uid 1000 (`node`) korrigieren:

```bash
docker compose stop app
docker compose cp ./kairos-backup.db app:/data/kairos.db
docker compose run --rm --user 0 --entrypoint sh app -c 'rm -f /data/kairos.db-wal /data/kairos.db-shm && chown 1000:1000 /data/kairos.db'
docker compose start app
```

> **Volume-Eigentümer:** `/data` muss für uid 1000 (`node`) beschreibbar sein.
> Docker vergibt die `node`-Ownership nur an ein **frisches, leeres benanntes
> Volume** — **nicht** an einen Bind-Mount und **nicht** an ein bereits
> bestehendes/wiederhergestelltes Volume. Läuft der Container sonst in eine
> `EACCES`-Restart-Schleife, einmalig reparieren:
> `docker run --rm -v kairos-data:/data alpine chown -R 1000:1000 /data`
> (Bind-Mount: stattdessen den Host-Ordner vorab `sudo chown -R 1000:1000 ./data`).

> Das Volume muss auf einem lokalen Dateisystem liegen (ext4/overlay). SQLite-WAL
> über NFS/SMB ist nicht zuverlässig.

## HTTPS, Zugriffsschutz & Web Push

Service Worker und Web Push funktionieren nur in einem **Secure Context** — also
über `https://` (Ausnahme: `http://localhost` beim lokalen Test). Für einen
öffentlichen Deploy ist der `proxy`-Profildienst da: Caddy terminiert TLS, holt
und erneuert das Zertifikat automatisch und leitet an `app:4321` weiter.

1. DNS-`A`/`AAAA`-Record der Domain auf den Host zeigen lassen.
2. `DOMAIN=deine.domain` in `.env` setzen (**Pflicht** fürs Proxy-Profil — ein
   leerer oder Platzhalter-Wert bricht bewusst ab, statt ein Zertifikat für eine
   fremde Domain anzufordern).
3. `docker compose --profile proxy up -d`.

Ports 80/443 müssen am Host frei und erreichbar sein (ACME-HTTP/TLS-Challenge).

### Zugriffsschutz (wichtig)

Kairos hat **keine Authentifizierung** und ist single-tenant. Jede `/api/*`-Route
ist von jedem beschreibbar: Fremde könnten den geteilten Timer steuern
(`/api/timer/*`), die Abo-Tabelle über `/api/push/subscribe` unbegrenzt fluten und
über `/api/push/test` einen Push-Broadcast auslösen. **Öffentlich nur hinter einem
Zugriffsschutz betreiben.** Zwei einfache Optionen im Caddyfile — vor
`reverse_proxy app:4321` einfügen:

```caddyfile
# a) IP-Allowlist (sauber bei bekanntem Client)
@blocked not remote_ip 203.0.113.0/24 198.51.100.7
respond @blocked "Forbidden" 403

# b) oder Basic-Auth für die ganze Site (Hash via `caddy hash-password`)
basic_auth {
    admin $2a$14$…hash…
}
```

Basic-Auth deckt auch die PWA-/Service-Worker-Requests ab (Browser cached die
Credentials nach dem ersten Login). `/api/push/test` in Produktion am besten ganz
sperren. Ein `Access-Control-Allow-Origin`-Tuning bringt hier **nichts** — CORS
schützt nur Browser-Lesezugriffe, nicht `curl`; der eigentliche Schutz ist die
Auth-Schicht davor.

## Skalierung — ehrlich betrachtet

**Wichtig:** Der `app`-Dienst ist bewusst **eine einzige Instanz** und darf nicht
repliziert werden. Zwei Gründe:

1. **Autoritative Timer-Engine.** `server/timer.js` läuft mit einem Sekunden-Tick
   (`setInterval`), der die geteilte `timer_state`-Zeile fortschreibt, Fokuszeit
   gutschreibt und beim Phasenende Push-Nachrichten auslöst. Zwei Prozesse ⇒
   doppelt gezählte Fokuszeit und doppelte Pushes.
2. **SQLite ist ein Single-Writer-Store** in einer lokalen Datei. Mehrere
   Container können sie nicht gefahrlos über ein Volume teilen.

Deshalb skaliert dieses Setup so:

- **Vertikal** — CPU-/RAM-Limits im `deploy.resources`-Block anheben. Die Last ist
  winzig (ein 1-Sekunden-Tick + leichte REST-Aufrufe); ein Container trägt sehr
  viele gleichzeitige **Verbindungen** — die sich allerdings denselben
  single-tenant-Timer und dieselbe Aufgabenliste teilen (siehe unten).
- **Am Rand (Edge) horizontal** — der TLS/Static-Layer (Caddy) ist zustandslos und
  beliebig replizier-/cachebar. Statische PWA-Assets lassen sich zusätzlich über
  ein CDN verteilen.
- **Betrieblich** — `restart: unless-stopped`, Healthcheck auf `/api/time`,
  Ressourcen-Limits und ein persistentes Volume machen den Betrieb robust
  (Auto-Restart, Rolling-Redeploy durch Image-Neubau).

### Migrationspfad zu echter horizontaler Skalierung

Wenn ein einzelner Container irgendwann nicht mehr reicht (viele **getrennte**
Nutzer statt eines geteilten Timers), sind zwei Änderungen nötig — beide sauber
gekapselt:

1. **Datenspeicher austauschen:** `server/repo.js` ist die Query-Schicht;
   mitgetauscht werden der SQLite-spezifische Bootstrap (`db.js` + `schema.sql`)
   und der `VACUUM INTO`-Backup-Befehl. SQLite → Postgres/Turso o. ä. tauschen,
   ohne die Timer- oder Routen-Logik anzufassen.
2. **Tick zum Singleton machen:** die Tick-Schleife aus dem Web-Prozess lösen und
   als **einzelnen** Worker betreiben (z. B. eigener Dienst mit `replicas: 1`) oder
   per Leader-Election / Postgres-Advisory-Lock absichern. Danach können beliebig
   viele zustandslose `app`-Web-Replikate hinter dem Proxy laufen.

Zusätzlich braucht ein Mehr-Nutzer-Betrieb ein Mandanten-/Auth-Konzept — die App
ist aktuell **single-tenant** (ein geteilter Timer, eine Aufgabenliste). Das ist
eine Produkt-, keine reine Infrastrukturänderung.

## Die Chrome-Extension

Die Extension (`src/`) spricht das Backend über eine **fest verdrahtete** URL an
(`src/infrastructure/backendSync.js` → `http://localhost:4321`). Für ein deploytes
Backend dort die öffentliche Origin eintragen und die Domain in die
`host_permissions` der `manifest.json` aufnehmen. PWA und Backend brauchen das
nicht — die PWA nutzt dieselbe Origin (`BASE = ""`).
