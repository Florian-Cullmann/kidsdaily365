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
DEVICE_PAIRING_CODE=<anderes-zufaelliges-hex-secret>
SESSION_SECRET=<drittes-zufaelliges-hex-secret>
```

Die IP-Adresse ersetzen. Jedes der drei Secrets separat mit `openssl rand -hex 32` erzeugen. Für `POSTGRES_PASSWORD` Hex-Zeichen verwenden, weil Compose daraus die interne Datenbank-URL zusammensetzt. `DATABASE_URL` aus `.env.example` wird von Compose durch die interne Adresse ersetzt; sie wird nur für lokale CLI-Entwicklung benötigt. `FAMILY_ID` kann eine eigene zufällige UUID sein und muss nach dem ersten Seed stabil bleiben.

`APP_ORIGIN` ist exakt die Adresse, die der Browser aufruft, inklusive Schema und gegebenenfalls Port. Nicht `localhost`, wenn der Bildschirm über die Server-IP zugreift. Bei Reverse Proxy z. B. `https://kidsdaily.home.example` setzen. So stimmen Origin-Prüfung und Cookie-Einstellungen.

## 2. Bauen und einrichten

```sh
docker compose config --quiet
docker compose up -d --build
docker compose run --rm migrate npm run db:seed
docker compose ps
```

PostgreSQL startet zuerst. Der einmalige `migrate`-Container führt versionierte Migrationen aus; erst bei Erfolg startet die App. Ein Container mit Status `Exited (0)` für `migrate` ist normal. Die App läuft ohne Root und überwacht ihre Datenbank über `/api/health`. Die DB hat keinen nach außen veröffentlichten Port. Das Webfrontend ist auf dem konfigurierten Port im LAN erreichbar.

Der Seed legt nur den Haushalt an. Weil die Elternverwaltung noch fehlt, kann zum Ausprobieren zusätzlich dieser Befehl verwendet werden:

```sh
docker compose run --rm migrate npm run db:seed -- --example
```

Dadurch entstehen zwei fiktive Kinder, tägliche Beispielroutinen, Termine und Belohnungsziele. Erneute Aufrufe überschreiben nichts. Die Beispieltermine wandern bei erneutem Seed nicht mit. Ohne Beispiele müssen Profile und Routinen vorerst direkt in der Datenbank gepflegt werden; es gibt bewusst keinen ungeschützten CRUD-Endpunkt.

Beim ersten Besuch auf dem Windows-Gerät den langen `DEVICE_PAIRING_CODE` einmal eingeben/einfügen. Danach beginnt jeder Seitenaufruf mit der Profilauswahl. Der Browser behält die Gerätefreigabe bis zu 30 Tage. Profilwahl und Punkte werden getrennt behandelt; ein Neuladen öffnet wieder die Profilauswahl, bereits gespeicherte Punkte bleiben bestehen.

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

Backups enthalten persönliche Kinderdaten: außerhalb von Git und mit beschränktem Zugriff aufbewahren. Für den produktiven Betrieb einen rotierenden, extern gesicherten Backup-Job einrichten und die Wiederherstellung zuerst mit einer separaten Testinstanz prüfen.

Wiederherstellung **in eine leere Ersatzdatenbank** (App vorher stoppen):

```sh
docker compose stop app
docker compose exec -T db pg_restore -U kidsdaily -d kidsdaily --no-owner --exit-on-error < backups/kidsdaily.dump
docker compose up -d app
```

Die `.env` separat sichern. Für die Wiederherstellung dieselbe `FAMILY_ID` verwenden. `SESSION_SECRET` kann bewusst neu gesetzt werden, um alle Geräte erneut freigeben zu müssen. Das Datenbankpasswort eines bestehenden PostgreSQL-Volumes ändert sich nicht durch Bearbeiten der Umgebungsvariable; ein Passwortwechsel benötigt zusätzlich `ALTER ROLE` auf der DB.

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
