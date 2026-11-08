# KidsDaily365

Eine selbst gehostete Familien-App für neurodivergente Kinder: eigener Buddy, übersichtlicher Tagesplan und Sterne für kleine Schritte. Die Kinderansicht ist für einen 14-Zoll-Wand-Touchscreen gestaltet. Eltern verwalten die Familie im geschützten Webbereich. Ein nativer Android-Launcher zeigt als ausschließlich lesender Client Buddy und Sterne.

## Was bereits funktioniert

- Registrierung des ersten Elternteils mit Einrichtungscode; weitere Eltern per einmaliger Einladung.
- Login, Logout, Passwortwechsel und widerrufbare, serverseitige Sitzungen. Beim Wechsel zum Kinderbildschirm wird die Elternsitzung beendet.
- Eigene Profilbilder im Elternbereich hochladen, zuschneiden, ersetzen und entfernen. Ohne Bild bleibt der Buddy in der Profilauswahl sichtbar. Bilder werden geschützt in PostgreSQL gespeichert und sind im Datenbank-Backup enthalten.
- Kinderprofile mit eigenem Buddy, Aufgaben, Terminen und Sternestand; Archivierung erhält den bisherigen Verlauf.
- Routinen mit sortierbaren, einzeln abhakbaren Schritten nach Wochentagen; einmalige Tagesaufgaben, Termine und gemeinsame Belohnungsziele verwalten. Die Kinderansicht zeigt den Gruppenfortschritt (z. B. 2 von 3).
- [Wöchentliche Terminserien](docs/appointment-series.md) mit vollständiger Vorschau, Familienzeitzone und höchstens 53 Vorkommen; einzelne Termine verschieben/absagen oder die verbleibende Serie nach Vorschau beenden.
- Routinenänderungen gelten für noch nicht angelegte Tagespläne. Bestehende Tageskopien und verdiente Sterne bleiben erhalten; die Migration übernimmt bisherige Routinen als Gruppen mit einem Schritt.
- Kindliche Waldwelt, große Aufgabenkarten zum Abhaken und untere Navigation für Wand-Tablets. Profile und Punkte bleiben getrennt; paralleles Abhaken vergibt keine doppelten Sterne.
- Wandbildschirme gleichen sichtbare Pläne und die Profilauswahl alle zehn Sekunden ab. Auswahl, Ansicht und Scrollposition bleiben erhalten; Verbindungsprobleme zeigen den letzten Abgleich, ein Widerruf führt zurück zur Kopplung. Nach dem Tageswechsel werden alte Aufgaben bis zum Laden des neuen Plans nicht mehr angeboten.
- Wandbildschirme und Android-Geräte einzeln freigeben und sperren. Android-Geräte gehören genau einem Kind und haben keine Schreibrechte.
- Lokaler Android-Elternzugang mit Offline-Wartung, einmaliger Eltern-Bestätigung zur Einrichtung und begrenzten Fehlversuchen.
- App-Freigaben je Kind im Elternbereich; Audible als erste Freigabe bei neuen Profilen.
- Launcher-API für Buddy, Sternestand und App-Liste. Das native Projekt unter `apps/android/` bleibt ohne Provisionierung ungeschützt. Auf ausdrücklich eingerichteten Device-Owner-Geräten stehen Lock Task, Kamera-/Systemleisten-Sperren und Offline-Wartung bereit; die physische Geräteabnahme aus [Issue #2](https://github.com/Florian-Cullmann/kidsdaily365/issues/2) steht noch aus. [Provisionierung und Recovery](apps/android/README.md#device-owner-bewusst-provisionieren).

Belohnungseinlösung und [Buddy-Kosmetik](https://github.com/Florian-Cullmann/kidsdaily365/issues/3) sind noch nicht umgesetzt. Es gibt keine Werbung, zufälligen Belohnungen, Streak-Strafen, externen Fonts oder automatisch gestarteten Sounds. [Illustrationen und Prompts](docs/illustrations.md) liegen im Projekt.

## Lokal als Demo starten

Voraussetzung: Node.js 24 LTS und npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

`http://localhost:3000` öffnet die Profilauswahl mit fiktiven Kindern. `APP_MODE=demo` braucht keine Datenbank; Fortschritt geht beim Neuladen verloren. Konten und Verwaltungszugriffe sind im Demo-Modus ausdrücklich deaktiviert. Registrierung und Login lassen sich unter `/register` und `/login` ansehen, echte Konten benötigen den Live-Modus.

## Live mit Elternkonten

1. `.env.example` nach `.env` kopieren und die Variablen ausfüllen. Drei **verschiedene** Secrets für `POSTGRES_PASSWORD`, `SETUP_CODE` und `SESSION_SECRET` jeweils mit `openssl rand -hex 32` erzeugen.
2. `APP_ORIGIN` exakt auf die Browseradresse setzen, etwa `http://192.168.1.50:3000`. `FAMILY_ID` ist die stabile UUID dieses Haushalts.
3. `docker compose up -d --build` startet PostgreSQL, führt Migrationen aus und startet die App.
4. `/register` aufrufen. Mit `SETUP_CODE`, Name, E-Mail und einer Passphrase von mindestens zwölf Zeichen den ersten Elternzugang erstellen. Der Haushalt wird dabei automatisch angelegt; ein Seed ist nicht erforderlich.
5. Unter `/eltern` Kinder, Routinen und Termine anlegen. Unter Geräte einen zehn Minuten gültigen Code für den Wandbildschirm erstellen und auf diesem unter `/` eingeben.

Weitere Eltern erhalten unter Elternkonto eine einmalige Einladung (48 Stunden gültig). E-Mail ist vorerst der lokale Anmeldename; es gibt keinen Mailversand oder externen Kontodienst. Für lokale Entwicklung mit PostgreSQL: `APP_MODE=live`, passende `DATABASE_URL` und alle übrigen Variablen setzen, dann `npm run db:migrate` und `npm run dev`.

Die vollständige [Unraid-Anleitung](docs/unraid.md) enthält Kiosk-Einrichtung, Sicherungen, Migration von der ersten Version und Passwort-Recovery. Gerätecodes werden in der Elternverwaltung erstellt. Der frühere dauerhafte `DEVICE_PAIRING_CODE` wird nicht mehr verwendet; bisherige Gerätesitzungen müssen nach dem Update neu freigegeben werden.

## Projektstruktur

```text
src/app/                  Next.js: Kinderansicht, Elternseiten, API-Routen
src/components/           Touch-UI, Authentifizierung, Elternverwaltung
src/domain/               Datentypen, Validierung, Launcher-Vertrag
src/server/               Authentifizierung, Berechtigungen, fachliche Dienste
src/server/db/, drizzle/  PostgreSQL-Schema und versionierte Migrationen
apps/android/             Eigenständiges natives Kotlin-Projekt
scripts/                  Migration, Beispiel-Seed, Recovery, HTTP-Smoke-Test
tests/                    Unit-, API-Grenz- und Datenbanktests
```

Next.js/TypeScript und PostgreSQL/Drizzle bilden einen modularen Monolithen. Der Wandbildschirm verwendet ein eigenes Gerätecookie; Eltern erhalten ein getrenntes Sitzungscookie; Android verwendet einen kindgebundenen Bearer-Token. [Architektur](docs/architecture.md) und [Android-Konzept](docs/android.md) erklären die Sicherheitsgrenzen und den aktuellen Umsetzungsstand.

## Konfiguration vor dem Start prüfen

Nach `npm ci` prüft `npm run config:check` die lokale `.env`. Bereits gesetzte Umgebungsvariablen haben Vorrang. Im Demo-Modus sind keine Live-Zugangsdaten nötig; im Live-Modus gelten dieselben Regeln wie im Server. Ohne `APP_MODE` gilt bei `NODE_ENV=production` Live, sonst Demo. Der Befehl meldet nur Variablennamen, keine Werte oder Geheimnisse, und endet bei Fehlern mit Exitcode 1.

Ein Erfolg bestätigt ausschließlich die App-Konfiguration: keine Datenbankverbindung, Migration oder Netzwerkprüfung. Docker-/Postgres-Parameter wie `POSTGRES_PASSWORD` werden nicht geprüft. Im Compose-Betrieb wird `DATABASE_URL` gesondert gesetzt; ein lokaler Check prüft die lokale Umgebung, nicht die spätere Containerkonfiguration.

## Prüfen

Der [manuelle Testleitfaden](docs/testing.md) führt durch Registrierung, Profile, Wandbildschirm, Rechte und den aktuellen Android-Stand. Automatische Tests immer von euren manuellen Live-Daten trennen.

```sh
npm run check
npm run build
# Separate, wegwerfbare PostgreSQL-Datenbank mit Namen *_test:
DATABASE_URL=postgres://…/kidsdaily_test npm run db:migrate
DATABASE_URL=postgres://…/kidsdaily_test npm run test:integration
# Gegen einen dafür gestarteten Produktionsbuild/Container auf Loopback:
SMOKE_ORIGIN=http://localhost:3000 npm run test:http
# Eigenständiges natives Projekt mit JDK 17 und Android SDK 36:
cd apps/android
./gradlew testDebugUnitTest assembleDebug lintDebug
```

Der HTTP-Smoke-Test braucht zusätzlich die Live-Konfiguration und dieselbe `DATABASE_URL`/`FAMILY_ID` wie der Testserver. Er verweigert andere Datenbanknamen, externe Hosts und Haushalte mit bestehenden Elternkonten. Er legt fiktive Daten an und entfernt anschließend **den Testhaushalt samt Beispieldaten**. Nicht gegen produktive Daten verwenden. GitHub Actions prüft PostgreSQL 18, Produktionsbuild, Container, HTTP-Wege und den Android-Build.

## Entwicklung

Wir arbeiten issuebasiert nach den aus `openwebprint` übernommenen Regeln: Features und größere Änderungen brauchen ein Issue, jede Änderung einen eigenen Branch und Pull Request. Kein direkter Push nach `main`. Jeder PR enthält **Proof of Done** mit Screenshot des tatsächlichen Ergebnisses oder begründetem alternativen Nachweis. Details in [CONTRIBUTING.md](CONTRIBUTING.md) und [AGENTS.md](AGENTS.md). Sicherheitsprobleme bitte [privat melden](SECURITY.md).
