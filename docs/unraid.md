# Unraid und Windows-Wandbildschirm

## 1. Server vorbereiten

Benötigt werden Docker mit Compose (z. B. vorhandene Compose-Verwaltung auf Unraid), Git und ein freier App-Port. Das Repository ist privat; für den Clone einen autorisierten Git-Zugang benutzen. Keine Zugriffstoken in Befehlsdateien oder ins Repository schreiben.

```sh
git clone https://github.com/Florian-Cullmann/kidsdaily365.git
cd kidsdaily365
cp .env.example .env
```

Die Quelltexte können z. B. unter `/mnt/user/appdata/kidsdaily365/source` liegen. PostgreSQL speichert standardmäßig unter `/mnt/user/appdata/kidsdaily365/postgres`. In `.env` setzen:

```dotenv
APP_MODE=live
APP_ORIGIN=http://192.168.1.50:3000
APP_PORT=3000
APPDATA_PATH=/mnt/user/appdata/kidsdaily365
FAMILY_ID=11111111-1111-4111-8111-111111111111
FAMILY_NAME=Unsere Familie
FAMILY_TIMEZONE=Europe/Berlin
POSTGRES_PASSWORD=<eigenes-zufaelliges-hex-secret>
SETUP_CODE=<anderes-zufaelliges-hex-secret>
SESSION_SECRET=<drittes-zufaelliges-hex-secret>
```

Die IP-Adresse ersetzen. Jedes der drei Secrets separat mit `openssl rand -hex 32` erzeugen. Für `POSTGRES_PASSWORD` Hex-Zeichen verwenden, weil Compose daraus die interne Datenbank-URL zusammensetzt. `DATABASE_URL` aus `.env.example` wird von Compose durch die interne Adresse ersetzt; sie wird nur für lokale CLI-Entwicklung benötigt. `FAMILY_ID` kann eine eigene zufällige UUID sein und muss nach dem ersten Seed stabil bleiben.

`APP_ORIGIN` ist exakt die Adresse, die der Browser aufruft, inklusive Schema und gegebenenfalls Port. Nicht `localhost`, wenn der Bildschirm über die Server-IP zugreift. Bei Reverse Proxy z. B. `https://kidsdaily.home.example` setzen. So stimmen Origin-Prüfung und Cookie-Einstellungen.

### Optionaler lokaler Konfigurationscheck

Mit Node.js 24 LTS und nach `npm ci` lässt sich vor dem Start `npm run config:check` ausführen. Der Befehl lädt `.env`, wobei bereits gesetzte Umgebungsvariablen Vorrang haben. Für den Live-Check muss `APP_MODE=live` gesetzt sein. Fehler nennen nur die betroffenen Variablen und liefern Exitcode 1; Erfolg liefert 0. Es werden keine Daten verändert und weder Netzwerk noch Datenbank kontaktiert.

Der Check verwendet die App-Validierung und prüft die lokale `DATABASE_URL`, nicht die von Compose ersetzte Containeradresse. Er ersetzt weder `docker compose config --quiet` noch die Prüfung von `POSTGRES_PASSWORD`, laufender Datenbank oder Migrationen. Die beiden folgenden Compose-Befehle bleiben erforderlich.

## 2. Bauen und einrichten

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

PostgreSQL startet zuerst. Der einmalige `migrate`-Container führt versionierte Migrationen aus; erst bei Erfolg startet die App. Ein Container mit Status `Exited (0)` für `migrate` ist normal. Die App läuft ohne Root und überwacht ihre Datenbank über `/api/health`. Die DB hat keinen nach außen veröffentlichten Port. Das Webfrontend ist auf dem konfigurierten Port im LAN erreichbar.

Öffne die App-Adresse und wähle **Familie einrichten** bzw. `/register`. Mit `SETUP_CODE`, Name, E-Mail und einer Passphrase von mindestens zwölf Zeichen wird der erste Elternzugang eingerichtet; der Haushalt entsteht automatisch. Der Einrichtungscode allein kann danach keine weiteren Eltern registrieren. Unter **Elternkonto** lassen sich einmalige Einladungen für weitere Eltern erstellen (48 Stunden gültig). Eine E-Mail wird nicht versandt; den Code über einen geeigneten privaten Weg weitergeben.

Unter `/eltern` kannst du Kinderprofile, Buddys, Wochentagsroutinen, Einzelaufgaben, Termine, Wünsche und App-Freigaben verwalten. Neue Kinderprofile erhalten Audible als erste Android-App-Freigabe. Die native Android-App ist noch eine ungeschützte Entwicklungsvorschau; [Android-Konzept](android.md) und Issue #2 beschreiben die noch ausstehende Durchsetzung.

Nur zum Ausprobieren mit **fiktiven Daten** ist weiterhin ein optionaler Seed verfügbar:

```sh
docker compose run --rm migrate npm run db:seed -- --example
```

Dadurch entstehen zwei fiktive Kinder, tägliche Beispielroutinen, Termine, Audible-Freigaben und Belohnungsziele. Erneute Aufrufe überschreiben nichts. Die Beispieltermine wandern bei erneutem Seed nicht mit. Produktive Profile und Pläne werden im Elternbereich gepflegt; direkte Datenbankbearbeitung ist nicht nötig.

Unter **Geräte** einen Code vom Typ **Wandbildschirm** erstellen. Er ist zehn Minuten gültig und wird auf dem Windows-Gerät unter `/` einmal eingegeben. Danach beginnt jeder Seitenaufruf mit der Profilauswahl. Die Gerätefreigabe gilt bis zu 90 Tage und lässt sich im Elternbereich sofort widerrufen. Profilwahl und Punkte werden getrennt behandelt; ein Neuladen öffnet wieder die Profilauswahl, bereits gespeicherte Punkte bleiben bestehen.

Android-Codes werden getrennt für ein bestimmtes Kind erstellt und ergeben ausschließlich lesende Bearer-Tokens. Sie können keinen Wandbildschirm freigeben. Beim Wechsel vom Elternbereich zur Kinderansicht wird die Elternsitzung auf diesem Browser beendet; das Gerätecookie bleibt bestehen.

### Migration von der ersten Grundversion

Vorher Backup erstellen. In `.env` ein neues `SETUP_CODE` setzen; `DEVICE_PAIRING_CODE` wird nicht mehr verwendet. Die zusätzliche Migration erhält vorhandene Familien, Kinder, Aufgaben und Punkte. Mit dem neuen Einrichtungscode den ersten Elternzugang für dieselbe `FAMILY_ID` registrieren. Anschließend bisherige Wandgeräte einmal neu freigeben: alte signierte Gerätecookies werden bewusst nicht mehr als Berechtigung akzeptiert. Die Konfiguration `SESSION_SECRET` bleibt erforderlich und dient jetzt als Pepper für Tokenhashes.

### Passwort vergessen / Operator-Recovery

Es gibt noch keinen E-Mail-Versand oder öffentlichen Passwort-Reset. Als Betreiber auf dem Server:

```sh
docker compose run --rm --interactive migrate npm run auth:reset -- eltern@example.test
```

Das neue Passwort wird verborgen interaktiv eingelesen. Niemals ein echtes Passwort als Befehlsargument oder in die Shell-History schreiben. Der Reset betrifft nur das Elternkonto der konfigurierten Familie und beendet alle seine Sitzungen. Für lokale Entwicklung funktioniert derselbe Befehl als `npm run auth:reset -- eltern@example.test` mit passender `.env`.

## 3. Windows als Kiosk

Für den ersten Test Edge öffnen und die App-Adresse aufrufen. Der Vollbildknopf der App oder `F11` blendet die Browseroberfläche aus. Für einen dauerhaften Wandbildschirm Windows Assigned Access/Edge-Kiosk mit der App-URL einrichten. [Microsoft beschreibt die Edge-Kiosk-Varianten hier](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-configure-kiosk-mode).

Die Kiosk-Konfiguration muss Cookies zwischen Sitzungen behalten, wenn die Freigabe dauerhaft gelten soll. Manche Edge-Kiosk-/InPrivate-Modi löschen Sitzungsdaten beim Beenden; dann wird erneut der Gerätecode benötigt. Vor dem Dauerbetrieb am konkreten Windows-System prüfen. Windows-Anzeigeskalierung und native Auflösung am 14-Zoll-Gerät testen; Ausgangspunkt sind 1366×768 oder 1920×1080 im Querformat bei gut lesbarer Skalierung. Ruhezustand, automatische Anmeldung und Bildschirmzeiten bewusst für euren Alltag einstellen.

Das Manifest bereitet einen späteren App-Rahmen vor. Offline-Funktion, Hintergrundsynchronisation und eine garantierte PWA-Installation gibt es noch nicht. Für den aktuellen Betrieb genügt ein Browser im Vollbild.

## 4. Sichern und wiederherstellen

Eine laufende PostgreSQL-Datenablage nicht einfach kopieren. Ein logischer Dump funktioniert unabhängig vom Containerpfad:

```sh
mkdir -p backups
docker compose exec -T db pg_dump -U kidsdaily -d kidsdaily -Fc > backups/kidsdaily.dump
```

Profilbilder liegen als fertig zugeschnittene WebP-Dateiinhalte in der PostgreSQL-Tabelle `child_images`, zusammen mit der Familien-/Kindzuordnung und einer Bildversion. Sie verwenden damit dieselbe persistente Unraid-Ablage `${APPDATA_PATH}/postgres`. Es gibt kein zusätzliches Upload-Verzeichnis oder Volume. Der vollständige `pg_dump` oben enthält sowohl die Bildreferenzen als auch die Bilddaten; beim Wiederherstellen keine Tabellen ausschließen. Ein App- oder Containerneustart verändert die Bilder nicht.

Beim Ersetzen wird der bisherige Bildinhalt in derselben Transaktion überschrieben; beim Entfernen wird der Datensatz gelöscht. Es entstehen keine verwaisten Dateien auf dem Dateisystem. Bereits erstellte Backups behalten ihren damaligen Stand. Die Originaldatei wird nicht gespeichert: nur der gewählte Ausschnitt mit 512 × 512 Pixeln, ohne EXIF-/GPS-Metadaten. Zulässig sind unbewegte JPEG-, PNG- und WebP-Dateien bis 8 MB und 20 Megapixel. Die App liefert Bilder ausschließlich über einen berechtigungsgeprüften Endpunkt aus, nicht aus `public/`.

Backups enthalten persönliche Kinderdaten: außerhalb von Git und mit beschränktem Zugriff aufbewahren. Für den produktiven Betrieb einen rotierenden, extern gesicherten Backup-Job einrichten und die Wiederherstellung zuerst mit einer separaten Testinstanz prüfen.

Wiederherstellung **in eine leere Ersatzdatenbank** (App vorher stoppen):

```sh
docker compose stop app
docker compose exec -T db pg_restore -U kidsdaily -d kidsdaily --no-owner --exit-on-error < backups/kidsdaily.dump
docker compose up -d app
```

Die `.env` separat sichern. Für die Wiederherstellung dieselbe `FAMILY_ID` verwenden. Eine Rotation von `SESSION_SECRET` widerruft Elternsitzungen, Geräte, Einladungen und noch offene Gerätecodes; danach können Eltern sich mit ihrem Passwort neu anmelden und Geräte neu freigeben. Das Datenbankpasswort eines bestehenden PostgreSQL-Volumes ändert sich nicht durch Bearbeiten der Umgebungsvariable; ein Passwortwechsel benötigt zusätzlich `ALTER ROLE` auf der DB.

## 5. Updates

Vorher Backup erstellen und Änderungen/Migrationen prüfen. Dann:

```sh
git pull --ff-only
docker compose build
docker compose stop app
docker compose run --rm migrate
docker compose up -d
docker compose ps
```

PostgreSQL bleibt auf Hauptversion 18. Ein späterer Major-Upgrade braucht einen geplanten Dump/Restore oder `pg_upgrade`; nie nur den Image-Tag über einem bestehenden Datenverzeichnis wechseln. App-Rollback nach Datenbankänderungen benötigt eine zur Schema-Version passende App bzw. eine Backup-Wiederherstellung.

## Betriebsgrenzen

Für ein vertrauenswürdiges privates LAN ausgelegt. Ohne HTTPS gehen Code, Cookie und Familiendaten unverschlüsselt durchs LAN; bei fremden WLAN-Teilnehmern oder Zugriff von außerhalb HTTPS am vorhandenen Reverse Proxy verwenden. Keine direkte Portfreigabe ins Internet. Fernzugriff gegebenenfalls über das eigene VPN. Es werden keine Cloudkonten, Analyseanbieter, externen Fonts oder Pushdienste benötigt.
