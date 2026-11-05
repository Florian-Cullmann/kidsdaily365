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

Eine laufende PostgreSQL-Datenablage nicht einfach kopieren. Das mitgelieferte `scripts/backup.py` erstellt vollständige PostgreSQL-Custom-Archive, einschließlich `child_images` (WebP-Inhalte), Tageskopien, Punktejournal, Elternkonten, Gerätefreigaben und Drizzle-Migrationshistorie. Es gibt kein zusätzliches Upload-Volume. Profilbilder enthalten nur den gespeicherten Ausschnitt, keine Originaldatei oder EXIF-/GPS-Metadaten. Alte Sicherungen behalten auch später gelöschte Daten.

### Automatisierte Sicherung

Voraussetzungen auf dem **Host**: Python 3.9+ mit `fcntl` (Linux/Unraid/macOS), Docker Compose, Git sowie der konfigurierte Checkout mit `.env`. Auf Unraid Python gegebenenfalls über die dortige Paketverwaltung bereitstellen. Der Job muss unter einem Benutzer laufen, der Docker und das Zielverzeichnis verwenden darf. Das Skript nutzt den Compose-Service `db` dieses Checkouts. Bei mehreren Installationen immer denselben `COMPOSE_PROJECT_NAME`/dieselben Compose-Overrides wie beim Start verwenden. Aus dem tatsächlich bereitgestellten, unveränderten Release-Checkout ausführen; währenddessen kein Update/Migrationslauf.

```sh
python3 scripts/backup.py create --target /mnt/user/backups/kidsdaily365 --keep 14
```

`--target` legt den privaten Speicherort fest, `--keep` die Anzahl erfolgreicher Sicherungen (mindestens 1, Standard 14). Neue Verzeichnisse erhalten Modus 700, Dateien 600; vorhandene Zielverzeichnisse vorher selbst auf restriktive Rechte prüfen. Kein freigegebenes SMB-Verzeichnis verwenden. Das Ziel darf nicht in Git, `public/` oder einem CI-Artefaktverzeichnis liegen. Ein eigener Datenträger schützt zusätzlich gegen Ausfall des App-Datenträgers; dasselbe Unraid-Array ist kein Schutz gegen dessen vollständigen Verlust. Kein externer Dienst ist erforderlich.

Beispiel für Cron auf einem Linux-Host, täglich um 03:15 Uhr in der Host-Zeitzone (Pfade anpassen):

```cron
15 3 * * * cd /mnt/user/appdata/kidsdaily365/source && /usr/bin/python3 scripts/backup.py create --target /mnt/user/backups/kidsdaily365 --keep 14 >> /mnt/user/backups/kidsdaily365-backup.log 2>&1
```

Logdatei vorher mit Modus 600 anlegen und über die lokale Logrotation begrenzen. Auf Unraid kann derselbe Befehl als geplanter Job, etwa in der vorhandenen User-Scripts-Verwaltung, ausgeführt werden; eine direkt bearbeitete Root-Crontab kann beim Neustart verloren gehen. Zeitplan und Fehlerbenachrichtigung der vorhandenen Jobverwaltung einrichten und den letzten erfolgreichen Lauf regelmäßig kontrollieren. Ein Scheduler-Neustart muss den Job erhalten.

Jeder Lauf schreibt zunächst in `.kidsdaily365-incomplete-*`, prüft den Exitstatus von `pg_dump` und das Archivverzeichnis mit `pg_restore --list` und veröffentlicht erst dann atomar einen Ordner `kidsdaily365-<UTC-Zeit>-<UUID>`. Darin liegen `database.dump` und `manifest.json` mit SHA-256, PostgreSQL-Hauptversion, Git-Revision und Fingerprint der Migrationen. Das ist eine Integritätsprüfung, keine Signatur und noch kein vollständiger Restore-Nachweis. Die Quellcode-Version im Manifest stammt aus dem Checkout, nicht aus dem laufenden App-Image; deren Übereinstimmung ist Betreiberverantwortung.

Eine exklusive Sperre verhindert parallele Läufe im selben Ziel. Erst nach Veröffentlichung rotiert das Skript eigene abgeschlossene Ordner mit passendem Namen und Manifest. Fremde Dateien, unvollständige Ordner und Verzeichnis-Symlinks bleiben erhalten. Fehlgeschlagene/abgebrochene Dumps löschen keine vorhandene Sicherung. Exit 0 bedeutet Erfolg; Fehler liefern Exit 1, Ctrl-C 130, SIGTERM 143. Die Logs enthalten keine SQL-Daten, Zugangsdaten oder ungefilterten Docker-/PostgreSQL-Fehler. Nach hartem Abbruch oder Stromausfall können unvollständige Ordner zurückbleiben: erst ohne aktiven Job prüfen und gezielt entfernen. Nach einem Rotationsfehler bleibt die neue Sicherung erhalten, der Lauf meldet dennoch einen Fehler. Platten-/Dateisystemausfälle erfordern zusätzlich die übliche Betriebsvorsorge.

### Konfiguration separat sichern

Die Datenbanksicherung enthält **nicht** `.env`, Compose-Overrides, Reverse-Proxy-/TLS-Konfiguration und den eingesetzten Quellcode. `.env` und eigene Betriebsdateien separat mit restriktiven Rechten auf einem verschlüsselten Datenträger oder in einem bereits vorhandenen verschlüsselten lokalen Archiv sichern; Schlüssel/Passphrase getrennt verwahren. Keine Secrets in Befehlsargumente, Shell-History, Git, PR-Anhänge oder CI-Artefakte kopieren. Auch `.env` niemals in einen öffentlichen Backup-Download legen. Release-Commit (siehe Manifest), PostgreSQL-Version und verwendete Overrides mit dokumentieren. Ein unverändertes `.env.example` reicht zur Wiederherstellung nicht aus.

Beim Wiederaufbau die private Konfiguration vor dem Start nach `.env` zurückspielen (`chmod 600 .env`), Pfade und `APP_ORIGIN` an die Ersatzinstanz anpassen und dieselbe `FAMILY_ID` beibehalten. Der bisherige `SESSION_SECRET` ist der Pepper für Tokenhashes: mit ihm können noch gültige Sitzungen und Gerätefreigaben aus dem Sicherungszeitpunkt wieder gültig werden, einschließlich seitdem widerrufener Freigaben. Nach Restore Geräte/Sitzungen prüfen. Bei Rotation dieses Secrets werden Elternsitzungen, Geräte, Einladungen und offene Gerätecodes ungültig; Eltern können sich mit ihrem Passwort neu anmelden und Geräte neu freigeben. Die Konfiguration des Android-Geräts selbst ist nicht im DB-Dump enthalten. Das Datenbankpasswort eines bestehenden PostgreSQL-Volumes ändert sich nicht durch Bearbeiten der Umgebungsvariable; ein Passwortwechsel benötigt zusätzlich `ALTER ROLE` auf der DB.

### Isolierte Restore-Prüfung

Regelmäßig sowie vor Updates ausführen, mit einem Backup und dem zugehörigen Release-Checkout (gleiche Migrationen):

```sh
python3 scripts/backup.py verify /mnt/user/backups/kidsdaily365/kidsdaily365-<UTC-Zeit>-<UUID>
```

Das Skript prüft Manifest, Schema-Fingerprint und Prüfsumme. Danach startet es einen zufällig benannten **neuen** `postgres:18-alpine`-Container mit `--network none`, ohne Portfreigabe, ohne Bind-Mount produktiver Daten und mit flüchtigem `tmpfs`. Darin liegt ausschließlich `kidsdaily_restore_test`. Es gibt absichtlich keinen Parameter für eine Ziel-DB-URL oder einen vorhandenen Container. Das Image muss lokal vorhanden sein oder vorher mit `docker pull postgres:18-alpine` geladen werden. Für Dump plus restaurierte DB ausreichend RAM/Swap bereithalten; der Test kann mehrere Datenbankgrößen benötigen. Auch Host-Swap muss für vertrauliche Daten angemessen geschützt sein.

Der komplette Restore läuft transaktional mit `--exit-on-error --no-owner --no-privileges`, anschließend werden Kinderprofile, Bildbytes, Tageskopien und Punktejournal gelesen, ohne Inhalte auszugeben. Der Container wird auch bei Fehlern wieder entfernt. Bei SIGKILL/Host-Absturz verbliebene Container mit Präfix `kidsdaily365-restore-` nach Prüfung gezielt über `docker rm -f -v <Name>` entfernen. Der Test verändert niemals die produktive DB. Ein erfolgreiches Ergebnis belegt die Wiederherstellbarkeit des Archivs und lesbare Kerntabellen, nicht die fachliche Vollständigkeit jeder historischen Eingabe oder die Bedienbarkeit aller App-Funktionen.

Der reproduzierbare Entwicklungstest verwendet ausschließlich fiktive Daten, migriert eine neue `*_test`-DB mit dem echten Migrator, führt die App-Integrationstests aus und vergleicht nach Restore **alle Zeilen sämtlicher App- und Migrationstabellen**, einschließlich WebP-Bytes, Tageskopie und Punktehistorie. Zusätzlich prüft er einen beschädigten Restore. Keine Dumps oder Datenausgaben werden als CI-Artefakte gespeichert:

```sh
npm ci
python3 -m unittest discover -s tests -p backup_test.py
BACKUP_INTEGRATION=1 python3 -m unittest discover -s tests -p backup_test.py
```

Der Docker-Test öffnet nur für die Migration/App-Tests einen zufälligen Loopback-Port mit einem fiktiven Testpasswort; die eigentliche Restore-Instanz bleibt ohne Netzwerk. Fehler-/Abbruchtests prüfen, dass keine Teilsicherung veröffentlicht und keine letzte funktionierende Sicherung rotiert wird.

### Tatsächliche Wiederherstellung

Erst die isolierte Prüfung bestehen lassen. Dann eine **separate Ersatzinstallation** mit leerem PostgreSQL-Volume, eigener Compose-Projektkennung und passenden Release-Dateien aufbauen. Die alte Installation stoppen bzw. vom Zugriff der Geräte trennen. Den `db`-Service der Ersatzinstallation starten, aber noch keine Migration und keine App starten. Bei Verwendung desselben Hosts eigene `APPDATA_PATH`- und Portwerte setzen. Im Checkout der Ersatzinstallation:

```sh
docker compose up -d db
# Ausschließlich in der geprüften LEEREN Ersatzdatenbank ausführen:
docker compose exec -T db pg_restore -U kidsdaily -d kidsdaily --no-owner --no-privileges --exit-on-error --single-transaction < /privater/pfad/zur/sicherung/database.dump
docker compose up -d
```

Die DB muss vor `pg_restore` bereit sein (`docker compose ps`). Das Skript bietet bewusst keine automatische produktive Wiederherstellung. Vor Freigabe der Ersatzinstanz Profilbilder, abgeschlossene Aufgaben, Punktestand und Geräteberechtigungen im Browser prüfen. Nach dem Restore zunächst dieselbe App-/Schemaversion verwenden. Für einen späteren Versionswechsel neue Sicherung erstellen und die versionierten Migrationen kontrolliert anwenden; ein altes App-Image gegen ein neueres Schema ist kein sicherer Rollback. Ein Wechsel der PostgreSQL-Hauptversion braucht einen eigenen getesteten Upgrade-Ablauf.

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
