# KidsDaily365

Eine selbst gehostete Familien-App für neurodivergente Kinder: eigener Buddy, übersichtlicher Tagesplan und Sterne für kleine Schritte. Die Kinderansicht ist für einen 14-Zoll-Wand-Touchscreen gestaltet. Eltern verwalten die Familie im geschützten Webbereich. Ein nativer Android-Launcher wird als weiterer, ausschließlich lesender Client vorbereitet.

## Was bereits funktioniert

- Registrierung des ersten Elternteils mit Einrichtungscode; weitere Eltern per einmaliger Einladung.
- Login, Logout, Passwortwechsel und widerrufbare, serverseitige Sitzungen. Beim Wechsel zum Kinderbildschirm wird die Elternsitzung beendet.
- Kinderprofile mit eigenem Buddy, Aufgaben, Terminen und Sternestand; Archivierung erhält den bisherigen Verlauf.
- Routinen nach Wochentagen, einmalige Tagesaufgaben, Termine und gemeinsame Belohnungsziele verwalten.
- Kindliche Waldwelt, große Aufgabenkarten zum Abhaken und untere Navigation für Wand-Tablets. Profile und Punkte bleiben getrennt; paralleles Abhaken vergibt keine doppelten Sterne.
- Wandbildschirme und Android-Geräte einzeln freigeben und sperren. Android-Geräte gehören genau einem Kind und haben keine Schreibrechte.
- App-Freigaben je Kind im Elternbereich; Audible als erste Freigabe bei neuen Profilen.
- Launcher-API für Buddy, Sternestand und App-Liste. Das native Projekt unter `apps/android/` kompiliert als **ungeschützte Vorschau**; Verbindung und echte Gerätesperren folgen in [Issue #2](https://github.com/Florian-Cullmann/kidsdaily365/issues/2).

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
./gradlew assembleDebug lintDebug
```

Der HTTP-Smoke-Test braucht zusätzlich die Live-Konfiguration und dieselbe `DATABASE_URL`/`FAMILY_ID` wie der Testserver. Er verweigert andere Datenbanknamen, externe Hosts und Haushalte mit bestehenden Elternkonten. Er legt fiktive Daten an und entfernt anschließend **den Testhaushalt samt Beispieldaten**. Nicht gegen produktive Daten verwenden. GitHub Actions prüft PostgreSQL 18, Produktionsbuild, Container, HTTP-Wege und den Android-Build.

## Entwicklung

Wir arbeiten issuebasiert nach den aus `openwebprint` übernommenen Regeln: Features und größere Änderungen brauchen ein Issue, jede Änderung einen eigenen Branch und Pull Request. Kein direkter Push nach `main`. Jeder PR enthält **Proof of Done** mit Screenshot des tatsächlichen Ergebnisses oder begründetem alternativen Nachweis. Details in [CONTRIBUTING.md](CONTRIBUTING.md) und [AGENTS.md](AGENTS.md). Sicherheitsprobleme bitte [privat melden](SECURITY.md).
