# Kairos Brand Kit

Alle SVGs sind skalierbar. Die transparenten Logo-Dateien verwenden `currentColor`, damit sie per CSS automatisch jede Textfarbe übernehmen.

## Empfohlene Verwendung

- **Browser-Tab/Favicon:** `favicon.svg` und als Fallback `favicon.ico`
- **App-Icon hell:** `kairos-app-icon-light-1024.png`
- **App-Icon dunkel:** `kairos-app-icon-dark-1024.png`
- **Sidebar/Header:** `kairos-logo-compact-outlined.svg`
- **Website/Präsentation:** `kairos-logo-full-outlined.svg`
- **Nur das normale Zeichen:** `kairos-symbol.svg`
- **Kleine UI-Flächen:** `kairos-symbol-bold.svg`
- **Prägnanteste Markenvariante:** `kairos-symbol-moment.svg`
- **Benachrichtigungen/Tray:** `kairos-notification-icon.svg`
- **Onboarding/Splash:** `kairos-logo-stacked-outlined.svg`

## Unterschied zwischen den Zeichen

Das genehmigte Grundzeichen bleibt unverändert in `kairos-symbol.svg`. Die **Moment-Variante** besitzt einen kleinen abgesetzten Punkt in der Kreisöffnung. Er steht für den richtigen Moment und macht das Zeichen besonders in Browser-Tabs und App-Icons leichter wiedererkennbar.

## Inline-Farbe per CSS

```html
<div class="kairos-mark">
  <!-- Inhalt von kairos-symbol-moment.svg -->
</div>
```

```css
.kairos-mark {
  color: #111;
  width: 40px;
}

@media (prefers-color-scheme: dark) {
  .kairos-mark { color: #f7f7f2; }
}
```

## Browser-Einbindung

Kopiere die Dateien in den öffentlichen Root-Ordner deiner Web-App und füge den Inhalt von `favicon-head-snippet.html` in den `<head>` ein.
