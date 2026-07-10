# Health- & Profil-API — Wearable-Daten an Kairos übergeben

> Backend-Vertrag, damit du (bzw. deine Nutzer) Gesundheitsdaten aus einem Smart
> Device an Kairos übergeben kannst. **Referenzgerät: RingConn.** WHOOP, Apple
> Health / Health Connect und ein generischer JSON-Modus werden ebenfalls
> unterstützt.

Diese Daten sind kein Selbstzweck: Kairos behandelt **Schlaf und Erholung als
harte Planungs-Constraints** (siehe [`SPEC.md`](SPEC.md) §Prinzipien). Aus den
gemessenen Werten entsteht ein **Readiness-/Kapazitäts-Kontext**, der die
Tages-Lernlast dynamisch skaliert — und der später die KI-Planung speist. Das
Schlaffenster selbst wird dabei **nie** beschnitten.

---

## 1. Datenfluss: Wie kommen die Daten rein?

```
┌─────────────┐   Export/Sync    ┌──────────────────────┐   HTTPS POST    ┌───────────────┐
│  RingConn    │ ───────────────▶ │  Dein Script /        │ ──────────────▶ │  Kairos       │
│  App / Ring  │  (App-Export,    │  Shortcut / Automation│  /api/health/…  │  Backend      │
│              │   Apple Health,  │  (mappt → JSON)       │                 │  (SQLite)     │
│              │   Health Connect)│                       │                 │               │
└─────────────┘                  └──────────────────────┘                 └───────────────┘
```

**Wichtig zu RingConn:** RingConn bietet (Stand 2026) **keine offizielle
öffentliche REST-API**. Die Daten liegen in der RingConn-App und lassen sich in
der Praxis auf drei Wegen herausziehen und an Kairos weitergeben:

1. **App-Export** der RingConn-App (CSV/JSON) → mit einem kleinen Skript in das
   kanonische Format bringen und an `/api/health/import` POSTen.
2. **Apple Health** (iOS) bzw. **Health Connect** (Android): RingConn schreibt
   Schlaf/Puls/HRV/SpO₂ dorthin. Ein Shortcut/Automation liest die Tageswerte und
   POSTet sie (`source: "apple_health"`).
3. **Manuelle/kanonische Eingabe**: Werte direkt im kanonischen Feldschema senden
   (`source: "manual"`) — z. B. aus einer eigenen Integration.

Kairos ist dabei die **stabile Schnittstelle**: Egal welcher Weg — du sendest
immer JSON an dieselben Endpunkte. Der Server normalisiert je nach `source`.

---

## 2. Schnellstart

Einen RingConn-Tag importieren (Server läuft auf `http://localhost:4321`):

```bash
curl -X POST http://localhost:4321/api/health/import \
  -H 'Content-Type: application/json' \
  -d '{
    "source": "ringconn",
    "days": [{
      "date": "2026-07-08",
      "sleep": { "start": "2026-07-07T23:10:00", "end": "2026-07-08T06:40:00",
                 "totalMinutes": 430, "deepMinutes": 90, "remMinutes": 100,
                 "lightMinutes": 230, "awakeMinutes": 10, "score": 82, "efficiency": 94 },
      "restingHeartRate": 54,
      "heartRate": { "avg": 62, "min": 48, "max": 120 },
      "hrv": 65,
      "spo2": { "avg": 97, "min": 94 },
      "skinTemperature": 33.2, "skinTemperatureDelta": -0.2,
      "steps": 8200, "activeCalories": 540,
      "stress": 34, "wellnessScore": 78
    }]
  }'
```

Antwort (gekürzt):

```json
{ "source": "ringconn", "imported": 1, "skipped": 0, "days": ["2026-07-08"],
  "samples": 0, "context": { "readiness": 78, "capacityMultiplier": 1.05, "recommendation": "increase", … } }
```

Jeder Import liefert direkt den aktualisierten **Health-Kontext** zurück.

---

## 3. Endpunkt-Referenz

Alle Antworten sind JSON. Zeitangaben in **Epoch-Millisekunden**, Tage als
`YYYY-MM-DD` (lokal).

### Profil (persönliche Informationen)

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/profile` | Profil lesen |
| `PUT` | `/api/profile` | Profil **partiell** aktualisieren (nur gesendete Felder ändern sich) |

### Health-Import

| Methode | Pfad | Zweck |
|---|---|---|
| `POST` | `/api/health/import` | **Haupteinstieg.** Batch: `{ source, days: [...], samples?: [...] }` |
| `POST` | `/api/health/daily` | Einen einzelnen Tag einspeisen |
| `POST` | `/api/health/samples` | Intraday-Zeitreihen (z. B. Live-Puls) |

### Health-Abfrage

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/health/context` | Abgeleiteter **Readiness-/Kapazitäts-Kontext** (KI-/Planungs-Brücke) |
| `GET` | `/api/health/latest?source=` | Jüngster Tagesdatensatz (Standard: `primaryDevice`) |
| `GET` | `/api/health/daily?from=&to=&source=&limit=` | Tages-Rollups im Zeitraum |
| `GET` | `/api/health/daily/:day?source=` | Ein Tag, alle Quellen (oder eine) |
| `GET` | `/api/health/samples?metric=&from=&to=&limit=` | Intraday-Zeitreihen |
| `GET` | `/api/health/schema` | Maschinenlesbare Feld-/Quellen-Referenz |
| `DELETE` | `/api/health/daily/:day?source=` | Tag löschen (Korrektur) |

Bei den **`/daily`**-Endpunkten sind `from`/`to` **Tagesschlüssel**
(`YYYY-MM-DD`); bei **`/api/health/samples`** sind `from`/`to` **Epoch-Millisekunden**.
`source` ist eine der unterstützten Quellen (`ringconn`, `whoop`, `apple_health`,
`google_fit`, `manual`, `generic`) und tolerant — `"RingConn"`, `"ring-conn"`,
`"WHOOP 4.0"` werden erkannt. Die Read-Endpunkte `latest` und `daily/:day` liefern
den **Originalexport (`raw`) nur mit `?raw=1`** (Datensparsamkeit).

---

## 4. Kanonisches Tages-Feldschema

Das ist das **Zielformat**. Sendest du `source: "manual"` oder `"generic"`,
benutzt du direkt diese Keys (camelCase). Für Geräte-Quellen übernimmt der Server
das Mapping (§5). Werte außerhalb des Bereichs werden **geklemmt**, nicht
abgelehnt. Live-Referenz: `GET /api/health/schema`.

| Key | Einheit | Bereich | Bedeutung |
|---|---|---|---|
| `sleepStart` / `sleepEnd` | epoch ms | – | Beginn/Ende der Schlafphase |
| `sleepTotalMin` | min | 0–1440 | Gesamtschlaf |
| `sleepDeepMin` | min | 0–1440 | Tiefschlaf |
| `sleepRemMin` | min | 0–1440 | REM-Schlaf |
| `sleepLightMin` | min | 0–1440 | Leichtschlaf |
| `sleepAwakeMin` | min | 0–1440 | Wachliegen |
| `sleepEfficiency` | % | 0–100 | Schlafeffizienz |
| `sleepScore` | 0–100 | 0–100 | Schlafqualität/-score |
| `restingHr` | bpm | 20–220 | Ruhepuls |
| `avgHr` / `minHr` | bpm | 20–220 | Herzfrequenz Ø/Min |
| `maxHr` | bpm | 20–240 | Herzfrequenz Max |
| `hrvMs` | ms | 0–400 | HRV (RMSSD) — Erholungssignal |
| `respiratoryRate` | brpm | 3–40 | Atemfrequenz |
| `spo2Avg` / `spo2Min` | % | 50–100 | Blutsauerstoff Ø/Min |
| `skinTempC` | °C | 20–45 | Hauttemperatur absolut |
| `skinTempDeltaC` | °C | −10–10 | Hauttemperatur-Abweichung |
| `steps` | count | 0–200000 | Schritte |
| `activeCalories` / `totalCalories` | kcal | 0–20000 | Kalorien aktiv/gesamt |
| `activityMin` | min | 0–1440 | Aktive Minuten |
| `distanceM` | m | 0–500000 | Distanz |
| `recoveryScore` | 0–100 | 0–100 | **WHOOP Recovery** |
| `strainScore` | 0–21 | 0–21 | **WHOOP Strain** |
| `stressAvg` | 0–100 | 0–100 | **RingConn Stress** |
| `readiness` | 0–100 | 0–100 | Kanonische Tagesbereitschaft |

Zusätzlich akzeptiert jeder Datensatz `date`/`day`/`dayKey` (Tagesschlüssel) und
optional `recordedAt`. Der **Originalexport** wird in `raw_json` mitgespeichert —
kein Feld geht verloren, auch wenn es (noch) keine kanonische Spalte hat.

**Merge-Semantik:** Ein erneuter Import desselben Tages + derselben Quelle
**ergänzt** fehlende Felder und überschreibt vorhandene mit neuen Werten;
Felder, die im neuen Import fehlen, bleiben erhalten. Teil-Importe sind also
idempotent und additiv.

---

## 5. Geräte-Mapping

### RingConn (Referenz)

Der Normalisierer liest tolerant mehrere Schreibweisen. Häufige RingConn-Keys:

| RingConn-Feld | → kanonisch |
|---|---|
| `sleep.start` / `bedtime` | `sleepStart` |
| `sleep.end` / `wakeTime` | `sleepEnd` |
| `sleep.totalMinutes` / `sleep.durationMs` | `sleepTotalMin` |
| `sleep.deepMinutes` / `.remMinutes` / `.lightMinutes` / `.awakeMinutes` | `sleepDeep/Rem/Light/AwakeMin` |
| `sleep.score` / `sleep.efficiency` | `sleepScore` / `sleepEfficiency` |
| `restingHeartRate` | `restingHr` |
| `heartRate.avg` / `.min` / `.max` | `avgHr` / `minHr` / `maxHr` |
| `hrv` | `hrvMs` |
| `spo2.avg` / `spo2.min` / `bloodOxygen` | `spo2Avg` / `spo2Min` |
| `skinTemperature` / `skinTemperatureDelta` | `skinTempC` / `skinTempDeltaC` |
| `steps`, `activeCalories`, `distance` | `steps`, `activeCalories`, `distanceM` |
| `stress` | `stressAvg` |
| `wellnessScore` / `readiness` | `readiness` |

RingConn kennt **kein** WHOOP-artiges Recovery/Strain; die App-„Wellness"/
Readiness wird auf `readiness` abgebildet. Fehlt ein Score ganz, leitet Kairos
Readiness selbst ab (Schlaf-Adäquanz + HRV-/Ruhepuls-Abweichung).

### WHOOP

Erwartet die Objekte der offiziellen WHOOP-API (`recovery` / `sleep` / `cycle`),
verschachtelt oder teilflach. WHOOP erfordert eigenes OAuth (developer.whoop.com);
du holst die JSON-Objekte dort ab und POSTest sie an Kairos.

| WHOOP-Feld | → kanonisch | Umrechnung |
|---|---|---|
| `recovery.score.recovery_score` | `recoveryScore` | – |
| `recovery.score.hrv_rmssd_milli` | `hrvMs` | – |
| `recovery.score.resting_heart_rate` | `restingHr` | – |
| `recovery.score.spo2_percentage` | `spo2Avg` | – |
| `recovery.score.skin_temp_celsius` | `skinTempC` | – |
| `sleep.score.stage_summary.total_*_time_milli` | `sleepDeep/Rem/Light/AwakeMin` | **ms → min** |
| `sleep.score.sleep_performance_percentage` | `sleepScore` | – |
| `cycle.score.strain` | `strainScore` | – |
| `cycle.score.average_heart_rate` / `max_heart_rate` | `avgHr` / `maxHr` | – |
| `cycle.score.kilojoule` | `totalCalories` | **kJ → kcal** (÷4,184); WHOOP = Gesamt-Energieumsatz |

`sleepTotalMin` = Summe der Phasen, falls nicht separat geliefert.

### Apple Health / Health Connect

`source: "apple_health"` bzw. `"google_fit"`. Akzeptiert aggregierte Tageswerte
inkl. `HKQuantityTypeIdentifier…`-Schlüssel (z. B.
`HKQuantityTypeIdentifierRestingHeartRate`, `…HeartRateVariabilitySDNN`,
`…OxygenSaturation`, `…StepCount`). **SpO₂** liefert HealthKit als Bruch `0..1` —
der Normalisierer erkennt Werte ≤ 1 und skaliert sie automatisch auf Prozent.

---

## 6. Der Health-Kontext (Brücke zu Planung & KI)

`GET /api/health/context` (auch Teil von `GET /api/state` als `health`) liefert
den abgeleiteten, **transparenten** Zustand:

```json
{
  "hasData": true,
  "source": "ringconn",
  "aiEnabled": true,
  "latestDay": "2026-07-08",
  "goalHours": 8,
  "sleep": { "lastNightHours": 5, "avg7dHours": 5, "deficitHours": 3, "debt7dHours": 3 },
  "hrv": { "latestMs": 45, "baselineMs": 65, "deltaPct": -31 },
  "restingHr": { "latest": 61, "baseline": 54, "delta": 7 },
  "recoveryScore": null,
  "strainScore": null,
  "readiness": 41,
  "capacityMultiplier": 0.61,
  "recommendation": "reduce",
  "reasons": [
    "Letzte Nacht 5 h — 3 h unter Ziel (8 h).",
    "HRV -31 % unter Baseline (Erholungssignal).",
    "Ruhepuls +7 bpm über Baseline."
  ]
}
```

- **`capacityMultiplier`** (0,6 … 1,15): Faktor, mit dem die geplante
  Tages-Lernlast skaliert wird. Schlafdefizit, Schlafschuld (7 Tage), HRV- und
  Ruhepuls-Abweichung von der Baseline sowie ein Geräte-Recovery/Readiness-Score
  gehen ein. **Schlaf bleibt hart** — der Faktor kürzt Lernlast, nie Schlaf.
- **`recommendation`**: `reduce` (≤0,85) · `maintain` · `increase` (≥1,05) ·
  `unknown` (wenn noch keine Wearable-Daten vorliegen, `hasData: false`).
- **`readiness`**: bevorzugt WHOOP-Recovery → RingConn-Readiness → selbst
  abgeleitet.
- **`reasons`**: menschenlesbare Begründung jeder Anpassung (für UI **und** als
  KI-Prompt-Kontext).

Die **Baselines** (`restingHrBaseline`, `hrvBaselineMs`) kommen aus dem Profil;
fehlen sie, bildet Kairos sie aus dem 14-Tage-Durchschnitt der **Vortage** (nie
des heutigen Werts). `sleepGoalHours` fällt bei fehlendem Profilwert auf den
festen Default **8 h** zurück (kein Durchschnitt).

---

## 7. Profil-Felder (`/api/profile`)

Backend des künftigen „Persönliche Informationen"-Tabs. Alle Felder optional;
`PUT` aktualisiert partiell.

| Feld | Typ | Bedeutung |
|---|---|---|
| `displayName` | string | Anzeigename |
| `birthDate` | `YYYY-MM-DD` | Geburtsdatum (→ Alter) |
| `sex` | string | `female`/`male`/`diverse`/`unspecified` |
| `heightCm` / `weightKg` | number | Größe/Gewicht |
| `timezone` | string | IANA-Zeitzone |
| `chronotype` | string | `early`/`intermediate`/`late` (planungsrelevant) |
| `adhd` | bool | ADHS-Kontext |
| `conditions` | string | freie Notiz (sensibel) |
| `primaryDevice` | string | Hauptquelle für den Kontext (Default `ringconn`) |
| `sleepGoalHours` | number | Schlafziel (Default 8; ≥7 h harte Constraint) |
| `targetBedtime` / `targetWakeTime` | `HH:MM` | Schlaffenster |
| `restingHrBaseline` / `hrvBaselineMs` | number | persönliche Baselines für Abweichungen |
| `aiEnabled` | bool | **Einwilligung**, persönliche + Health-Daten für KI-Planung zu nutzen |
| `aiNotes` | string | Ziele/Vorlieben, die die KI kennen soll |

Beim ersten Setzen von `aiEnabled: true` wird `dataConsentAt` (Zeitstempel)
gesetzt.

---

## 8. Ausblick: KI-Integration

Der Kontext (§6) plus Profil (`aiNotes`, Chronotyp, ADHS, Schlafziel) ist als
kompakter, erklärbarer Input für ein KI-Planungsmodell gedacht: Es liest
`capacityMultiplier`, `reasons`, Schlafschuld und Chronotyp und schlägt daraus
dynamisch angepasste Tagespläne vor — z. B. an einem Tag mit niedriger HRV
weniger, dafür leichtere Blöcke, ohne je das Schlaffenster anzutasten. Die
`aiEnabled`-Flag ist das Consent-Gate: Ohne Einwilligung liefert die API die
Rohdaten weiter, die KI-Schicht respektiert aber `aiEnabled === false`.

---

## 9. Datenschutz

Gesundheitsdaten sind **besonders sensibel**. Kairos ist **local-first**: alle
Daten liegen in der lokalen SQLite-Datei (`server/data/lernuhr.db`), es gibt
keinen externen Upload. Empfehlungen für den Betrieb:

- **Nur lokal binden:** `HOST=127.0.0.1` setzen, damit der Server nicht im LAN
  erreichbar ist (Default `0.0.0.0` bleibt für das Docker-Port-Mapping; das
  Compose-Setup schränkt die Host-Freigabe ohnehin auf `127.0.0.1` ein).
- **Cross-Origin einschränken:** `CORS_ORIGIN` auf die eigene Origin setzen (oder
  leer lassen, `CORS_ORIGIN=`), damit keine fremde Webseite die API cross-origin
  auslesen kann. Default bleibt `*` für PWA-/Extension-Kompatibilität.
- **Authentifizierung:** Die eingebaute API hat keine Auth. Für personenbezogene
  Daten hinter den in [`DEPLOY.md`](DEPLOY.md) beschriebenen Reverse-Proxy stellen
  (Basic-Auth/mTLS). Ein Multi-Tenant-Auth-Layer ist separat in Arbeit.
- **Datensparsamkeit:** Read-Endpunkte liefern den Rohexport (`raw`) nur mit
  `?raw=1`. Ein Import ist auf max. 20 000 Samples/Anfrage und 1 MB Body begrenzt.
- `conditions` und `aiNotes` sind Freitext — nur speichern, was nötig ist.
- Einwilligung ist explizit (`aiEnabled` + `dataConsentAt`) und jederzeit
  widerrufbar (`PUT /api/profile { "aiEnabled": false }`).
